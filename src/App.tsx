/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getTheme, commonStyles } from './theme';
import { AppState, AuditLogEntry, User } from './types';
import { formatTime, getEffectivePermissions, getPermissionsForRole, hashPassword, isPasswordHash, scopeAppStateForUser } from './utils';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { DataEntry } from './components/DataEntry';
import { Defects } from './components/Defects';
import { Releases } from './components/Releases';
import { Timesheet } from './components/Timesheet';
import { TeamStructure } from './components/TeamStructure';
import { Export } from './components/Export';
import { Settings } from './components/Settings';
import { Toast } from './components/Shared';
import { Bell, HelpCircle, UserCheck, X } from 'lucide-react';

const STORE_KEY = 'qa-hub-v4:store';
const THEME_KEY = 'qa-hub-v4:theme';
const SESSION_TOKEN_KEY = 'qa-hub-v4:session-token';
const SESSION_USER_KEY = 'qa-hub-v4:session-user-id';

const INITIAL_APP_STATE: AppState = {
  users: [
    {
      id: 'superadmin',
      username: 'superadmin',
      password: 'e34f92a20532a873cb3184398070b4b82a8fa29cf48572c203dc5f0fa6158231',
      role: 'superadmin',
      squadId: null,
      projectId: null,
      permissions: {
        dashboard: 'edit',
        dataEntry: 'edit',
        defects: 'edit',
        releases: 'edit',
        timesheet: 'edit',
  export: 'edit',
        holidayList: 'edit',
        settings: 'edit',
      },
      createdBy: 'system',
      createdByRole: 'superadmin',
      mustChangePassword: false,
      loginCount: 0,
      failedLoginAttempts: 0,
      lockedUntil: null,
      passwordChangedAt: new Date().toISOString(),
      loginHistory: [],
      reportsTo: null,
      directReports: [],
      jobTitle: 'Platform Owner',
      notifications: [],
    },
  ],
  projects: [],
  squads: [],
  releases: [],
  releaseNames: [],
  dataEntries: [],
  defects: [],
  releaseEntries: [],
  timesheetEntries: [],
  holidays: [],
  customFields: [],
  auditLog: [],
  notifications: [],
};

export default function App() {
  // Theme settings (defaults to Dark mode for modern look)
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem(THEME_KEY) || localStorage.getItem('qa-hub-theme');
    return saved ? saved === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
  });

  const theme = getTheme(isDark);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    localStorage.removeItem('qa-hub-theme');
  }, [isDark]);

  // Collapsible left navigation panel state
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  // Active view layout state
  const [currentTab, setCurrentTab] = useState<string>('dashboard');

  // Application database state synced to localStorage under "qa-hub-v4"
  const [appState, setAppState] = useState<AppState>(() => {
    const saved = localStorage.getItem(STORE_KEY) || localStorage.getItem('qa-hub-v4');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);

        // Migration: Convert existing admin user to superadmin
        parsed.users = (parsed.users || []).map((u: any) => {
          if (u.id === 'admin' && u.role === 'admin') {
            return {
              ...u,
              id: 'superadmin',
              role: 'superadmin',
              projectId: null,
              squadId: null,
              permissions: {
                dashboard: 'edit',
                dataEntry: 'edit',
                defects: 'edit',
                releases: 'edit',
                timesheet: 'edit',
                export: 'edit',
                settings: 'edit',
              },
            };
          }
          return u;
        });

        // Ensure superadmin user exists (migrated or fresh)
        if (!parsed.users || parsed.users.length === 0) {
          parsed.users = [...INITIAL_APP_STATE.users];
        } else if (!parsed.users.some((u: any) => u.id === 'superadmin')) {
          parsed.users.unshift(INITIAL_APP_STATE.users[0]);
        }

        // Migration to back-fill permissions
        parsed.users = parsed.users.map((u: any) => {
          const role = u.role === 'superadmin' ? 'superadmin' : u.role;
          return {
            ...u,
            projectId: role === 'superadmin' ? null : (u.projectId ?? null),
            squadId: role === 'superadmin' || role === 'admin' ? null : (u.squadId ?? null),
            permissions: role === 'superadmin'
              ? getPermissionsForRole('superadmin')
              : (u.permissions || getPermissionsForRole(role)),
            createdBy: u.createdBy ?? null,
            createdByRole: u.createdByRole ?? null,
            mustChangePassword: u.mustChangePassword ?? false,
            loginCount: u.loginCount ?? 0,
            failedLoginAttempts: u.failedLoginAttempts ?? 0,
            lockedUntil: u.lockedUntil ?? null,
            passwordChangedAt: u.passwordChangedAt ?? new Date().toISOString(),
            loginHistory: u.loginHistory ?? [],
            reportsTo: u.reportsTo ?? (role === 'superadmin' ? null : u.createdBy ?? null),
            directReports: u.directReports ?? [],
            jobTitle: u.jobTitle ?? '',
            notifications: (u.notifications || []).map((notification: any) => ({
              id: notification.id || crypto.randomUUID?.() || Math.random().toString(36).slice(2),
              message: notification.message || 'Notification',
              type: ['info', 'warning', 'success', 'alert'].includes(notification.type) ? notification.type : 'info',
              read: notification.read ?? false,
              createdAt: notification.createdAt || new Date().toISOString(),
              link: notification.link,
            })),
          };
        });
        const directMap = new Map<string, Set<string>>();
        parsed.users.forEach((u: any) => {
          if (u.reportsTo) {
            const set = directMap.get(u.reportsTo) || new Set<string>();
            set.add(u.id);
            directMap.set(u.reportsTo, set);
          }
        });
        parsed.users = parsed.users.map((u: any) => ({
          ...u,
          directReports: Array.from(new Set([...(u.directReports || []), ...(directMap.get(u.id) ? Array.from(directMap.get(u.id)!) : [])])),
        }));

        parsed.squads = (parsed.squads || []).map((s: any) => ({
          ...s,
          projectId: s.projectId ?? (parsed.projects?.length === 1 ? parsed.projects[0].id : null),
        }));
        parsed.dataEntries = (parsed.dataEntries || []).map((entry: any) => ({
          ...entry,
          tcExecuted: entry.tcExecuted ?? null,
          tcPassed: entry.tcPassed ?? null,
          tcFailed: entry.tcFailed ?? null,
          lastEditedBy: entry.lastEditedBy ?? null,
          lastEditedAt: entry.lastEditedAt ?? null,
          lastEditedByRole: entry.lastEditedByRole ?? null,
          storyStatus: entry.storyStatus ?? 'In Progress',
        }));
        parsed.defects = (parsed.defects || []).map((defect: any) => ({
          ...defect,
          jiraCreatedDate: defect.jiraCreatedDate ?? defect.date ?? null,
          resolvedDate: defect.resolvedDate ?? ((defect.status === 'Resolved' || defect.status === 'Closed') ? defect.date : null),
          statusHistory: defect.statusHistory ?? [{ status: defect.status, changedBy: defect.addedByName || 'Unknown', changedAt: defect.date ? `${defect.date}T00:00:00.000Z` : new Date().toISOString() }],
        }));
        parsed.timesheetEntries = (parsed.timesheetEntries || []).map((entry: any) => ({
          ...entry,
          workingDays: (entry.workingDays || []).map((day: any) => {
            const date = new Date(`${day.date}T00:00:00`);
            const isWeekendDay = date.getDay() === 0 || date.getDay() === 6;
            return {
              ...day,
              dayName: day.dayName || date.toLocaleDateString('en-GB', { weekday: 'short' }),
              isWeekendDay: day.isWeekendDay ?? isWeekendDay,
              isStatusSet: day.isStatusSet ?? true,
              isNightDeployment: day.isNightDeployment ?? day.isNightShift ?? false,
              isWeekendSupport: day.isWeekendSupport ?? false,
              workLocation: day.workLocation ?? null,
              lastModifiedBy: day.lastModifiedBy ?? null,
              lastModifiedByRole: day.lastModifiedByRole ?? null,
              lastModifiedAt: day.lastModifiedAt ?? null,
              isAdminAdjustment: day.isAdminAdjustment ?? false,
            };
          }),
        }));
        parsed.releaseEntries = (parsed.releaseEntries || []).map((entry: any) => ({
          ...entry,
          createdAt: entry.createdAt || `${entry.releaseDate || new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
        }));
        if (!parsed.releaseNames) {
          parsed.releaseNames = [];
        }
        parsed.projects = parsed.projects || [];
        parsed.squads = parsed.squads || [];
        parsed.releases = parsed.releases || [];
        parsed.dataEntries = parsed.dataEntries || [];
        parsed.defects = parsed.defects || [];
        parsed.releaseEntries = parsed.releaseEntries || [];
        parsed.timesheetEntries = parsed.timesheetEntries || [];
        parsed.customFields = parsed.customFields || [];
        parsed.auditLog = parsed.auditLog || [];
        parsed.notifications = (parsed.notifications || []).map((notification: any) => ({
          ...notification,
          id: notification.id || crypto.randomUUID?.() || Math.random().toString(36).slice(2),
          message: notification.message || 'Notification',
          read: notification.read ?? false,
          createdAt: notification.createdAt || new Date().toISOString(),
          type: notification.type || 'system',
        }));
        parsed.holidays = (parsed.holidays || []).map((holiday: any) => ({
          ...holiday,
          year: holiday.year ?? Number(String(holiday.date || '').slice(0, 4)),
          createdBy: holiday.createdBy ?? 'Unknown',
          createdAt: holiday.createdAt ?? new Date().toISOString(),
        }));
        return parsed;
      } catch (e) {
        // fallback to initial
      }
    }
    return INITIAL_APP_STATE;
  });

  const [migrationReady, setMigrationReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const migratePasswords = async () => {
      const users = await Promise.all(appState.users.map(async user => ({
        ...user,
        password: isPasswordHash(user.password) ? user.password : await hashPassword(user.password || ''),
      })));
      if (cancelled) return;
      const migratedState = { ...appState, users };
      localStorage.setItem(STORE_KEY, JSON.stringify(migratedState));
      localStorage.removeItem('qa-hub-v4');
      setAppState(migratedState);
      setMigrationReady(true);
    };
    migratePasswords();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (migrationReady) localStorage.setItem(STORE_KEY, JSON.stringify(appState));
  }, [appState, migrationReady]);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [passwordModal, setPasswordModal] = useState<'forced' | 'periodic' | null>(null);
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSubmitted, setPasswordSubmitted] = useState(false);
  const [idleLocked, setIdleLocked] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [loggedInSince, setLoggedInSince] = useState<string | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profileTitle, setProfileTitle] = useState('');

  const appendAudit = useCallback((action: AuditLogEntry['action'], details: string, actor?: User) => {
    const user = actor || currentUser;
    if (!user) return;
    const entry: AuditLogEntry = {
      id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
      timestamp: new Date().toISOString(),
      userId: user.id,
      username: user.username,
      role: user.role,
      action,
      details,
      ipHint: 'Browser session',
    };
    setAppState(previous => ({ ...previous, auditLog: [entry, ...(previous.auditLog || [])].slice(0, 500) }));
  }, [currentUser]);

  useEffect(() => {
    if (document.querySelector('meta[http-equiv="Content-Security-Policy"]')) return;
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline';";
    document.head.appendChild(meta);
  }, []);

  useEffect(() => {
    const showRuntimeError = (message: string) => {
      const existing = document.getElementById('qa-hub-runtime-error');
      if (existing) existing.remove();
      const panel = document.createElement('div');
      panel.id = 'qa-hub-runtime-error';
      panel.style.cssText = [
        'position:fixed',
        'inset:16px',
        'z-index:2147483647',
        `background:${theme.surface}`,
        `color:${theme.text}`,
        `border:1px solid ${theme.red}`,
        'border-radius:8px',
        'padding:18px',
        'font-family:system-ui,-apple-system,sans-serif',
        'box-shadow:0 24px 80px rgba(0,0,0,0.35)',
        'overflow:auto',
      ].join(';');
      panel.innerHTML = `<h2 style="margin:0 0 8px;color:${theme.red};font-size:18px">QA Hub hit a runtime error</h2><p style="margin:0 0 12px;color:${theme.muted};font-size:13px">Reload once after this patch. If this message remains, share the text below.</p><pre style="white-space:pre-wrap;font-size:12px">${message.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }[char] || char))}</pre>`;
      document.body.appendChild(panel);
    };
    const onError = (event: ErrorEvent) => showRuntimeError(event.error?.stack || event.message || 'Unknown runtime error');
    const onRejection = (event: PromiseRejectionEvent) => showRuntimeError(event.reason?.stack || String(event.reason || 'Unknown promise rejection'));
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [theme.muted, theme.red, theme.surface, theme.text]);

  useEffect(() => {
    if (!migrationReady) return;
    const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
    const userId = sessionStorage.getItem(SESSION_USER_KEY);
    if (token && userId) {
      const user = appState.users.find(item => item.id === userId);
      if (user) {
        setCurrentUser(user);
        setProfileName(user.username);
        setProfileTitle(user.jobTitle || '');
        setLoggedInSince(new Date().toISOString());
        if (user.mustChangePassword) setPasswordModal('forced');
      }
    }
  }, [migrationReady]);

  // Keep currentUser state in sync with any updates in appState.users (e.g. permissions, username)
  useEffect(() => {
    if (currentUser) {
      const latestUser = appState.users.find((u) => u.id === currentUser.id);
      if (latestUser) {
        if (JSON.stringify(latestUser) !== JSON.stringify(currentUser)) {
          setCurrentUser(latestUser);
          setProfileName(latestUser.username);
          setProfileTitle(latestUser.jobTitle || '');
        }
      }
    }
  }, [appState.users, currentUser]);

  // Toast Alerts Notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning'; duration?: number; exiting?: boolean } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning' = 'success', duration = 2550) => {
    setToast({ message, type, duration });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(
      () => toast.exiting
        ? setToast(null)
        : setToast(current => current ? { ...current, exiting: true } : null),
      toast.exiting ? 250 : (toast.duration || 2550)
    );
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (document.getElementById('qa-hub-animations')) return;
    const style = document.createElement('style');
    style.id = 'qa-hub-animations';
    style.textContent = `
      @keyframes pageEnter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes rowFlash { 0% { background-color: rgba(245,158,11,0.3); } 100% { background-color: transparent; } }
      @keyframes toastIn { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }
      @keyframes toastOut { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(120%); } }
      @keyframes cardIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      @keyframes modalBackdropIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes modalPanelIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @keyframes shimmer { from { background-position: -220px 0; } to { background-position: 220px 0; } }
      .page-enter { animation: pageEnter 0.2s ease-out forwards; }
      .row-flash { animation: rowFlash 1.5s ease forwards; }
      .toast-in { animation: toastIn 0.3s ease-out forwards; }
      .toast-out { animation: toastOut 0.25s ease-in forwards; }
      .sidebar-logo:hover { opacity: 0.8; }
      button:hover { opacity: 0.88; }
      button:active { transform: scale(0.97); }
      .spin { animation: spin 0.8s linear infinite; }
    `;
    document.head.appendChild(style);
  }, []);

  // Login form inputs
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const getFirstAccessibleTab = (user: User): string => {
    const perms = getEffectivePermissions(user);
    if (perms.dashboard !== 'none') return 'dashboard';
    if (perms.dataEntry !== 'none') return 'dataEntry';
    if (perms.defects !== 'none') return 'defects';
    if (perms.releases !== 'none') return 'releases';
    if (perms.timesheet !== 'none') return 'timesheet';
    if (user.role !== 'member') return 'teamStructure';
    if (perms.export !== 'none') return 'export';
    if (perms.settings !== 'none') return 'settings';
    return 'dashboard';
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const uname = loginUsername.trim().toLowerCase();
    const candidate = appState.users.find((u) => u.username.toLowerCase() === uname);
    if (!candidate) {
      showToast('Incorrect username or password.', 'error');
      return;
    }

    if (candidate.lockedUntil && Date.now() < candidate.lockedUntil) {
      const minutes = Math.ceil((candidate.lockedUntil - Date.now()) / 60000);
      showToast(`Account locked. Try again at ${formatTime(new Date(candidate.lockedUntil).toISOString())} (${minutes} minute${minutes === 1 ? '' : 's'}).`, 'error');
      return;
    }

    const enteredHash = await hashPassword(loginPassword.trim());
    if (candidate.password === enteredHash) {
      const updatedUser: User = {
        ...candidate,
        loginCount: candidate.loginCount + 1,
        failedLoginAttempts: 0,
        lockedUntil: null,
        loginHistory: [{ timestamp: new Date().toISOString(), sessionId: crypto.randomUUID?.() || Math.random().toString(36).slice(2) }, ...(candidate.loginHistory || [])].slice(0, 5),
      };
      setAppState(prev => ({ ...prev, users: prev.users.map(user => user.id === updatedUser.id ? updatedUser : user) }));
      sessionStorage.setItem(SESSION_TOKEN_KEY, crypto.randomUUID?.() || Math.random().toString(36).slice(2));
      sessionStorage.setItem(SESSION_USER_KEY, updatedUser.id);
      setCurrentUser(updatedUser);
      setProfileName(updatedUser.username);
      setProfileTitle(updatedUser.jobTitle || '');
      setLoggedInSince(new Date().toISOString());
      setSessionExpired(false);
      const passwordAgeDays = updatedUser.passwordChangedAt
        ? (Date.now() - new Date(updatedUser.passwordChangedAt).getTime()) / 86400000
        : 31;
      setPasswordModal(updatedUser.mustChangePassword || (!updatedUser.mustChangePassword && passwordAgeDays > 30) ? 'forced' : updatedUser.loginCount % 5 === 0 ? 'periodic' : null);
      // land page: dynamically choose the first accessible tab
      const targetTab = getFirstAccessibleTab(updatedUser);
      setCurrentTab(targetTab);
      showToast(`Welcome back, ${updatedUser.username}!`, 'success');
      setLoginUsername('');
      setLoginPassword('');
      appendAudit('LOGIN', 'User signed in.', updatedUser);
    } else {
      const attempts = (candidate.failedLoginAttempts || 0) + 1;
      const lockedUntil = attempts >= 5 ? Date.now() + 15 * 60 * 1000 : null;
      setAppState(prev => ({
        ...prev,
        users: prev.users.map(user => user.id === candidate.id
          ? { ...user, failedLoginAttempts: attempts >= 5 ? 0 : attempts, lockedUntil }
          : user),
      }));
      showToast(lockedUntil
        ? 'Account locked due to too many failed attempts. Try again in 15 minutes.'
        : 'Incorrect username or password.', 'error');
    }
  };

  const handleLogout = useCallback(() => {
    appendAudit('LOGOUT', 'User signed out.');
    sessionStorage.clear();
    setCurrentUser(null);
    setPasswordModal(null);
    showToast('Signed out successfully.', 'success');
  }, [appendAudit, showToast]);

  useEffect(() => {
    if (!currentUser) return;
    let lockTimer: ReturnType<typeof setTimeout>;
    let logoutTimer: ReturnType<typeof setTimeout>;
    const reset = () => {
      if (idleLocked) return;
      clearTimeout(lockTimer);
      clearTimeout(logoutTimer);
      lockTimer = setTimeout(() => setIdleLocked(true), 10 * 60 * 1000);
      logoutTimer = setTimeout(() => {
        sessionStorage.clear();
        setCurrentUser(null);
        setPasswordModal(null);
        setSessionExpired(true);
      }, 30 * 60 * 1000);
    };
    const events = ['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll'];
    events.forEach(event => window.addEventListener(event, reset));
    reset();
    return () => {
      clearTimeout(lockTimer);
      clearTimeout(logoutTimer);
      events.forEach(event => window.removeEventListener(event, reset));
    };
  }, [currentUser?.id, idleLocked]);

  const validateNewPassword = useCallback((value: string, confirmation: string) => {
    if (!value) return 'New password is required.';
    if (value.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(value)) return 'Password must include an uppercase letter.';
    if (!/\d/.test(value)) return 'Password must include a number.';
    if (value !== confirmation) return 'Passwords do not match.';
    return '';
  }, []);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setPasswordSubmitted(true);
    const validation = validateNewPassword(passwordForm.next, passwordForm.confirm);
    if (validation) {
      return;
    }
    if (passwordModal === 'periodic') {
      const currentHash = await hashPassword(passwordForm.current);
      if (currentHash !== currentUser.password) {
        setPasswordError('Current password is incorrect.');
        return;
      }
    }
    const password = await hashPassword(passwordForm.next);
    const updated = { ...currentUser, password, mustChangePassword: false, passwordChangedAt: new Date().toISOString() };
    setAppState(prev => ({ ...prev, users: prev.users.map(user => user.id === updated.id ? updated : user) }));
    setCurrentUser(updated);
    setPasswordForm({ current: '', next: '', confirm: '' });
    setPasswordModal(null);
    setPasswordError('');
    setPasswordSubmitted(false);
    showToast('Password updated successfully.', 'success');
  };

  const handleUnlock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentUser) return;
    const enteredHash = await hashPassword(unlockPassword.trim());
    if (enteredHash === currentUser.password) {
      setIdleLocked(false);
      setUnlockPassword('');
      setUnlockError('');
      setAppState(previous => ({ ...previous, users: previous.users.map(user => user.id === currentUser.id ? { ...user, failedLoginAttempts: 0 } : user) }));
      return;
    }
    const attempts = (currentUser.failedLoginAttempts || 0) + 1;
    if (attempts >= 5) {
      handleLogout();
      return;
    }
    setAppState(previous => ({ ...previous, users: previous.users.map(user => user.id === currentUser.id ? { ...user, failedLoginAttempts: attempts } : user) }));
    setUnlockError(`Incorrect password. ${5 - attempts} attempt${5 - attempts === 1 ? '' : 's'} remaining.`);
  };

  // Real-time top Clock component
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

  const formattedDate = currentTime.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const formattedTime = formatTime(currentTime.toISOString());

  const scopedAppState = useMemo(
    () => currentUser ? scopeAppStateForUser(appState, currentUser) : appState,
    [appState, currentUser]
  );
  const releasesAppState = useMemo(() => {
    if (!currentUser || currentUser.role !== 'lead') return scopedAppState;
    return {
      ...scopedAppState,
      squads: appState.squads.filter(squad => squad.projectId === currentUser.projectId),
      releaseEntries: appState.releaseEntries.filter(entry => entry.projectId === currentUser.projectId),
    };
  }, [appState.releaseEntries, appState.squads, currentUser, scopedAppState]);

  // Check tab access authorization
  const canAccessTab = (tabId: string) => {
    if (!currentUser) return false;
    // superadmin override (has access to everything)
    if (currentUser.role === 'superadmin') return true;

    const perms = getEffectivePermissions(currentUser);
    const keyMap: Record<string, keyof typeof perms> = {
      dashboard: 'dashboard',
      dataEntry: 'dataEntry',
      defects: 'defects',
      releases: 'releases',
      timesheet: 'timesheet',
      export: 'export',
      settings: 'settings',
    };

    if (tabId === 'profile') return true;
    if (tabId === 'teamStructure') return currentUser.role !== 'member';

    const permKey = keyMap[tabId];
    if (!permKey) return true;
    return perms[permKey] !== 'none';
  };

  useEffect(() => {
    if (!currentUser) return;
    const daysToExpiry = currentUser.passwordChangedAt ? 30 - Math.floor((Date.now() - new Date(currentUser.passwordChangedAt).getTime()) / 86400000) : 0;
    if (daysToExpiry !== 3) return;
    setAppState(previous => (previous.users.find(user => user.id === currentUser.id)?.notifications || []).some(n => n.message.includes('password expires in 3 days'))
      ? previous
      : {
        ...previous,
        users: previous.users.map(user => user.id === currentUser.id ? {
          ...user,
          notifications: [{
            id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
            message: 'Your password expires in 3 days. Please update it.',
            read: false,
            createdAt: new Date().toISOString(),
            type: 'warning' as const,
            link: 'profile',
          }, ...(user.notifications || [])].slice(0, 50),
        } : user),
      });
  }, [currentUser?.id, currentUser?.passwordChangedAt]);

  useEffect(() => {
    let pendingG = false;
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement)?.tagName;
      const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
      if (event.key === 'Escape') {
        setNotificationsOpen(false);
        setShortcutsOpen(false);
        return;
      }
      if (inField) return;
      if (event.key === '?') {
        setShortcutsOpen(true);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        (document.querySelector('form button[type="submit"]') as HTMLButtonElement | null)?.click();
        return;
      }
      if (pendingG) {
        const map: Record<string, string> = { d: 'dashboard', e: 'dataEntry', f: 'defects', r: 'releases', t: 'timesheet', x: 'export', s: 'teamStructure' };
        const next = map[event.key.toLowerCase()];
        if (next && canAccessTab(next)) setCurrentTab(next);
        pendingG = false;
        return;
      }
      pendingG = event.key.toLowerCase() === 'g';
      if (pendingG) setTimeout(() => { pendingG = false; }, 900);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentUser?.id]);

  // If user is not authenticated, render Login Page
  if (!currentUser) {
    return (
      <div
        id="login-view-screen"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.bg,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: theme.text,
          padding: '20px',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            ...commonStyles.card(theme),
            width: '100%',
            maxWidth: '420px',
            padding: '40px 30px',
            backgroundColor: theme.surface,
          }}
        >
          {/* Logo Brand Header */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                backgroundColor: theme.blue,
                color: '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                fontWeight: 800,
                marginBottom: '12px',
                boxShadow: `0 4px 14px ${theme.blue}44`,
              }}
            >
              Q
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 4px 0', tracking: '-0.025em' }}>
              QA Hub v4
            </h1>
            <p style={{ margin: 0, fontSize: '14px', color: theme.muted }}>
              Centralised QA Metrics & Team Operations Roster
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {sessionExpired && (
              <div style={{ padding: '10px 12px', borderRadius: '6px', backgroundColor: `${theme.amber}18`, color: theme.amber, fontSize: '13px' }}>
                Session expired. Please sign in again.
              </div>
            )}
            {!migrationReady && (
              <div style={{ padding: '10px 12px', borderRadius: '6px', backgroundColor: `${theme.blue}18`, color: theme.blue, fontSize: '13px' }}>
                Securing stored credentials…
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={commonStyles.label(theme)}>Username</label>
              <input
                type="text"
                placeholder="Username"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                required
                style={commonStyles.input(theme)}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={commonStyles.label(theme)}>Password</label>
              <input
                type="password"
                placeholder="Password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
                style={commonStyles.input(theme)}
              />
            </div>

            <button
              type="submit"
              disabled={!migrationReady}
              style={{
                ...commonStyles.button(theme, 'primary'),
                marginTop: '10px',
                fontSize: '15px',
                fontWeight: 600,
                padding: '12px',
                opacity: migrationReady ? 1 : 0.6,
              }}
            >
              <UserCheck size={18} />
              Sign In
            </button>
          </form>
        </div>

        <Toast toast={toast} theme={theme} />
      </div>
    );
  }

  const activeTabValidated = canAccessTab(currentTab) ? currentTab : getFirstAccessibleTab(currentUser);
  const userPerms = getEffectivePermissions(currentUser);
  const legacyNotifications = (appState.notifications || []).filter(item => item.userId === currentUser.id);
  const allUserNotifications = [
    ...(Array.isArray(currentUser.notifications) ? currentUser.notifications : []),
    ...legacyNotifications.map(item => ({
      id: item.id,
      message: item.message,
      type: item.type === 'defect' ? 'alert' as const : item.type === 'password' ? 'warning' as const : 'info' as const,
      read: item.read,
      createdAt: item.createdAt,
      link: undefined,
    })),
  ]
    .map(notification => ({
      ...notification,
      id: notification.id || crypto.randomUUID?.() || Math.random().toString(36).slice(2),
      message: notification.message || 'Notification',
      read: notification.read ?? false,
      createdAt: notification.createdAt || new Date().toISOString(),
    }))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 50);
  const unreadNotifications = allUserNotifications.filter(item => !item.read);

  const markNotificationsRead = () => {
    setAppState(previous => ({
      ...previous,
      users: previous.users.map(user => user.id === currentUser.id
        ? { ...user, notifications: (user.notifications || []).map(notification => ({ ...notification, read: true })) }
        : user),
      notifications: (previous.notifications || []).map(notification => notification.userId === currentUser.id ? { ...notification, read: true } : notification),
    }));
  };

  const markNotificationRead = (id: string, link?: string) => {
    setAppState(previous => ({
      ...previous,
      users: previous.users.map(user => user.id === currentUser.id
        ? { ...user, notifications: (user.notifications || []).map(notification => notification.id === id ? { ...notification, read: true } : notification) }
        : user),
      notifications: (previous.notifications || []).map(notification => notification.id === id ? { ...notification, read: true } : notification),
    }));
    if (link) setCurrentTab(link);
    setNotificationsOpen(false);
  };

  const saveProfileName = () => {
    const nextName = profileName.trim();
    if (!nextName) {
      showToast('Display name is required.', 'error');
      return;
    }
    setAppState(previous => ({
      ...previous,
      users: previous.users.map(user => user.id === currentUser.id ? { ...user, username: nextName, jobTitle: profileTitle.trim() } : user),
    }));
    setCurrentUser({ ...currentUser, username: nextName, jobTitle: profileTitle.trim() });
    showToast('Profile updated.', 'success');
  };

  const renderProfile = () => {
    const projectName = appState.projects.find(project => project.id === currentUser.projectId)?.name || 'Unassigned';
    const squadName = appState.squads.find(squad => squad.id === currentUser.squadId)?.name || 'Unassigned';
    const manager = appState.users.find(user => user.id === currentUser.reportsTo);
    const directReports = appState.users.filter(user => user.reportsTo === currentUser.id || (currentUser.directReports || []).includes(user.id));
    const passwordChanged = currentUser.passwordChangedAt ? new Date(currentUser.passwordChangedAt) : null;
    const daysRemaining = passwordChanged ? Math.max(0, 30 - Math.floor((Date.now() - passwordChanged.getTime()) / 86400000)) : 0;
    return (
      <div style={{ display: 'grid', gap: '14px', maxWidth: '880px' }}>
        <section style={commonStyles.card(theme)}>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '14px' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: theme.blue, color: '#fff', display: 'grid', placeItems: 'center', fontSize: '24px', fontWeight: 900 }}>{currentUser.username.slice(0, 1).toUpperCase()}</div>
            <h3 style={{ margin: 0, fontSize: '18px' }}>My Profile</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <div><label style={commonStyles.label(theme)}>Display Name</label><div style={{ display: 'flex', gap: '8px' }}><input value={profileName} onChange={event => setProfileName(event.target.value)} style={commonStyles.input(theme)} /><button type="button" onClick={saveProfileName} style={commonStyles.button(theme, 'primary', 'sm')}>Save</button></div></div>
            <div><label style={commonStyles.label(theme)}>Job Title</label><input value={profileTitle} onChange={event => setProfileTitle(event.target.value)} placeholder="Add job title" style={commonStyles.input(theme)} /></div>
            <div><label style={commonStyles.label(theme)}>Role</label><div style={{ ...commonStyles.input(theme), minHeight: '32px', textTransform: 'capitalize' }}>{currentUser.role}</div></div>
            <div><label style={commonStyles.label(theme)}>Project</label><div style={{ ...commonStyles.input(theme), minHeight: '32px' }}>{projectName}</div></div>
            <div><label style={commonStyles.label(theme)}>Squad</label><div style={{ ...commonStyles.input(theme), minHeight: '32px' }}>{squadName}</div></div>
            <div><label style={commonStyles.label(theme)}>Reports To</label><div style={{ ...commonStyles.input(theme), minHeight: '32px' }}>{manager ? `${manager.username} (${manager.role})` : 'Unassigned'}</div></div>
          </div>
        </section>
        {currentUser.role !== 'member' && (
          <section style={commonStyles.card(theme)}>
            <h3 style={{ margin: '0 0 14px', fontSize: '16px' }}>Direct Reports</h3>
            {directReports.length ? directReports.map(report => <span key={report.id} style={{ ...commonStyles.badge(theme, theme.blue), margin: '0 8px 8px 0' }}>{report.username} · {report.role}</span>) : <div style={{ color: theme.muted, fontSize: '12px' }}>No direct reports assigned.</div>}
          </section>
        )}
        <section style={commonStyles.card(theme)}>
          <h3 style={{ margin: '0 0 14px', fontSize: '16px' }}>Security</h3>
          <div style={{ color: daysRemaining <= 7 ? theme.red : theme.muted, fontSize: '13px', marginBottom: '10px' }}>Password last changed {passwordChanged ? passwordChanged.toLocaleDateString() : 'unknown'} · {daysRemaining} days remaining</div>
          <button type="button" onClick={() => setPasswordModal('periodic')} style={commonStyles.button(theme, 'primary')}>Change Password</button>
        </section>
        <section style={commonStyles.card(theme)}>
          <h3 style={{ margin: '0 0 14px', fontSize: '16px' }}>Session</h3>
          <div style={{ color: theme.muted, fontSize: '13px' }}>Logged in since {loggedInSince ? new Date(loggedInSince).toLocaleString() : 'this browser session'}</div>
          <h4 style={{ margin: '16px 0 8px', fontSize: '13px' }}>Last 5 Logins</h4>
          <div style={{ color: theme.muted, fontSize: '13px' }}>Session auto-locks after 10 minutes of inactivity.</div>
          {(currentUser.loginHistory || []).length ? (currentUser.loginHistory || []).map((item, index) => {
            const timestamp = typeof item === 'string' ? item : item.timestamp;
            return (
            <div key={timestamp} style={{ padding: '8px 0', borderTop: `1px solid ${theme.border}`, fontSize: '12px' }}>{new Date(timestamp).toLocaleString()} {index === 0 && <span style={commonStyles.badge(theme, theme.green)}>This session</span>}</div>
          );
          }) : <div style={{ color: theme.muted, fontSize: '12px' }}>No login history stored yet.</div>}
        </section>
      </div>
    );
  };

  if (passwordModal) {
    const isForced = passwordModal === 'forced';
    const newPasswordError = (passwordSubmitted || passwordForm.next)
      ? (!passwordForm.next
        ? 'New Password is required.'
        : passwordForm.next.length < 8
          ? 'Password must be at least 8 characters.'
          : !/[A-Z]/.test(passwordForm.next)
            ? 'Password must include an uppercase letter.'
            : !/\d/.test(passwordForm.next)
              ? 'Password must include a number.'
              : '')
      : '';
    const confirmPasswordError = (passwordSubmitted || passwordForm.confirm)
      ? (!passwordForm.confirm ? 'Confirm Password is required.' : passwordForm.confirm !== passwordForm.next ? 'Passwords do not match.' : '')
      : '';
    const currentPasswordError = !isForced && passwordSubmitted && !passwordForm.current
      ? 'Current Password is required.'
      : passwordError;
    const passwordStrength = !passwordForm.next
      ? null
      : passwordForm.next.length >= 12 && /[A-Z]/.test(passwordForm.next) && /\d/.test(passwordForm.next) && /[^A-Za-z0-9]/.test(passwordForm.next)
        ? { label: 'Strong', color: theme.green }
        : passwordForm.next.length >= 8 && /[A-Z]/.test(passwordForm.next) && /\d/.test(passwordForm.next)
          ? { label: 'Fair', color: theme.amber }
          : { label: 'Weak', color: theme.red };
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 10000, backgroundColor: theme.bg, color: theme.text, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', animation: 'modalBackdropIn 200ms ease-out' }}>
        <div style={{ ...commonStyles.card(theme), width: '100%', maxWidth: '460px', padding: '28px', animation: 'modalPanelIn 250ms ease-out' }}>
          <h2 style={{ margin: '0 0 8px', fontSize: '21px' }}>{isForced ? 'Change Your Password' : 'Time to update your password'}</h2>
          <p style={{ color: theme.muted, fontSize: '13px', margin: '0 0 20px' }}>
            {isForced
              ? 'You must choose a secure password before continuing.'
              : 'For your security, please update your password. You have logged in 5 times since your last change.'}
          </p>
          <form noValidate onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {!isForced && (
              <div>
                <label style={commonStyles.label(theme)}>Current Password</label>
                <input type="password" value={passwordForm.current} onChange={event => { setPasswordForm(form => ({ ...form, current: event.target.value })); setPasswordError(''); }} required style={{ ...commonStyles.input(theme), borderColor: currentPasswordError ? '#ef4444' : theme.border }} />
                {currentPasswordError && <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '3px' }}>{currentPasswordError}</div>}
              </div>
            )}
            <div>
              <label style={commonStyles.label(theme)}>New Password</label>
              <input type="password" value={passwordForm.next} onChange={event => setPasswordForm(form => ({ ...form, next: event.target.value }))} required style={{ ...commonStyles.input(theme), borderColor: newPasswordError ? '#ef4444' : theme.border }} />
              {newPasswordError && <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '3px' }}>{newPasswordError}</div>}
              {passwordStrength && <div style={{ color: passwordStrength.color, fontSize: '11px', fontWeight: 700, marginTop: '3px' }}>Strength: {passwordStrength.label}</div>}
            </div>
            <div>
              <label style={commonStyles.label(theme)}>Confirm Password</label>
              <input type="password" value={passwordForm.confirm} onChange={event => setPasswordForm(form => ({ ...form, confirm: event.target.value }))} required style={{ ...commonStyles.input(theme), borderColor: confirmPasswordError ? '#ef4444' : theme.border }} />
              {confirmPasswordError && <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '3px' }}>{confirmPasswordError}</div>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
              {!isForced && (
                <button type="button" onClick={() => { setPasswordModal(null); setPasswordForm({ current: '', next: '', confirm: '' }); setPasswordError(''); setPasswordSubmitted(false); }} style={commonStyles.button(theme, 'secondary')}>
                  Remind me later
                </button>
              )}
              <button type="submit" style={commonStyles.button(theme, 'primary')}>
                Update Password
              </button>
            </div>
          </form>
        </div>
        <Toast toast={toast} theme={theme} />
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: theme.bg,
        color: theme.text,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* 1. Left Sidebar Navigation */}
      <Sidebar
        currentUser={currentUser}
        onLogout={handleLogout}
        currentTab={activeTabValidated}
        setCurrentTab={setCurrentTab}
        isDark={isDark}
        setIsDark={setIsDark}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        theme={theme}
      />

      {/* 2. Main Content Workspace Container */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        
        {/* Sticky Header Top Bar */}
        <header
          style={{
            height: '48px',
            backgroundColor: theme.surface,
            borderBottom: `1px solid ${theme.border}`,
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxSizing: 'border-box',
            flexShrink: 0,
            zIndex: 40,
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          }}
        >
          {/* Header Title with role identifier */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, textTransform: 'capitalize', color: theme.text }}>
              {activeTabValidated.replace(/([A-Z])/g, ' $1')}
            </h2>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                textTransform: 'uppercase',
                backgroundColor: `${theme.blue}15`,
                color: theme.blue,
                padding: '1px 6px',
                borderRadius: '4px',
                border: `1px solid ${theme.blue}25`,
              }}
            >
              {currentUser.role} Scope
            </span>
          </div>

          {/* Clock Display */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: theme.muted, fontWeight: 500, position: 'relative' }}>
            <span>{formattedDate}</span>
            <span style={{ borderLeft: `1px solid ${theme.border}`, paddingLeft: '12px', color: theme.text, fontFamily: 'monospace', fontWeight: 600 }}>
              {formattedTime}
            </span>
            <button type="button" title="Keyboard shortcuts" onClick={() => setShortcutsOpen(true)} style={commonStyles.button(theme, 'secondary', 'sm')}><HelpCircle size={14} /></button>
            <button type="button" title="Notifications" onClick={() => setNotificationsOpen(open => !open)} style={{ ...commonStyles.button(theme, 'secondary', 'sm'), position: 'relative' }}>
              <Bell size={14} />
              {unreadNotifications.length > 0 && <span style={{ position: 'absolute', top: '-5px', right: '-5px', minWidth: '16px', height: '16px', borderRadius: '999px', backgroundColor: theme.red, color: '#fff', fontSize: '10px', display: 'grid', placeItems: 'center', padding: '0 4px' }}>{unreadNotifications.length}</span>}
            </button>
            {notificationsOpen && (
              <div style={{ position: 'absolute', right: 0, top: '34px', width: '320px', maxHeight: '420px', overflowY: 'auto', backgroundColor: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '8px', boxShadow: '0 18px 42px rgba(0,0,0,0.22)', zIndex: 80 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderBottom: `1px solid ${theme.border}` }}>
                  <strong style={{ color: theme.text }}>Notifications</strong>
                  <button type="button" onClick={markNotificationsRead} style={{ border: 0, background: 'transparent', color: theme.blue, fontSize: '11px', cursor: 'pointer' }}>Mark all as read</button>
                </div>
                {allUserNotifications.length ? allUserNotifications.map(notification => (
                  <button key={notification.id} type="button" onClick={() => markNotificationRead(notification.id, notification.link)} style={{ width: '100%', textAlign: 'left', border: 0, background: notification.read ? theme.inputBg : theme.surface, padding: '10px', borderLeft: `3px solid ${notification.read ? 'transparent' : theme.blue}`, borderBottom: `1px solid ${theme.border}`, color: notification.read ? theme.muted : theme.text, cursor: 'pointer' }}>
                    <div style={{ fontSize: '12px', fontWeight: notification.read ? 500 : 800 }}>{notification.message}</div>
                    <div style={{ fontSize: '10px', marginTop: '4px' }}>{new Date(notification.createdAt).toLocaleString()}</div>
                  </button>
                )) : <div style={{ padding: '18px', color: theme.muted, fontSize: '12px' }}>No notifications.</div>}
              </div>
            )}
          </div>
        </header>

        {/* Scrollable View Panel */}
        <main style={{ flex: 1, padding: '16px', overflowY: 'auto', boxSizing: 'border-box' }}>
          <div key={activeTabValidated} className="page-enter">
            {/* Render Active View component */}
            {activeTabValidated === 'dashboard' && <Dashboard currentUser={currentUser} appState={scopedAppState} theme={theme} />}
            {activeTabValidated === 'profile' && renderProfile()}
            {activeTabValidated === 'teamStructure' && <TeamStructure currentUser={currentUser} appState={appState} theme={theme} />}
            
            {activeTabValidated === 'dataEntry' && (
              <DataEntry
                currentUser={currentUser}
                appState={scopedAppState}
                setAppState={setAppState}
                showToast={showToast}
                theme={theme}
                readOnly={userPerms.dataEntry === 'view'}
              />
            )}

            {activeTabValidated === 'defects' && (
              <Defects
                currentUser={currentUser}
                appState={scopedAppState}
                setAppState={setAppState}
                showToast={showToast}
                theme={theme}
                readOnly={userPerms.defects === 'view'}
              />
            )}

            {activeTabValidated === 'releases' && (
              <Releases
                currentUser={currentUser}
                appState={releasesAppState}
                setAppState={setAppState}
                showToast={showToast}
                theme={theme}
                readOnly={userPerms.releases === 'view'}
              />
            )}

            {activeTabValidated === 'timesheet' && (
              <Timesheet
                currentUser={currentUser}
                appState={scopedAppState}
                setAppState={setAppState}
                showToast={showToast}
                theme={theme}
                readOnly={userPerms.timesheet === 'view'}
              />
            )}

            {activeTabValidated === 'export' && (
              <Export
                currentUser={currentUser}
                appState={scopedAppState}
                theme={theme}
                showToast={showToast}
              />
            )}

            {activeTabValidated === 'settings' && (
              <Settings
                currentUser={currentUser}
                appState={appState}
                setAppState={setAppState}
                showToast={showToast}
                theme={theme}
                readOnly={userPerms.settings === 'view'}
                onUpdateCurrentUser={(updatedUser) => {
                  setCurrentUser(updatedUser);
                  setProfileName(updatedUser.username);
                  setProfileTitle(updatedUser.jobTitle || '');
                }}
              />
            )}
          </div>

        </main>
      </div>

      {/* Floating active notifications */}
      {idleLocked && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10001, backgroundColor: `${theme.bg}f2`, display: 'grid', placeItems: 'center', padding: '20px' }}>
          <form onSubmit={handleUnlock} style={{ ...commonStyles.card(theme), width: '100%', maxWidth: '420px', padding: '26px' }}>
            <h2 style={{ margin: '0 0 8px', fontSize: '20px' }}>Session locked</h2>
            <p style={{ margin: '0 0 18px', color: theme.muted, fontSize: '13px' }}>Session locked. Enter your password to continue.</p>
            <label style={commonStyles.label(theme)}>Password</label>
            <input type="password" value={unlockPassword} onChange={event => { setUnlockPassword(event.target.value); setUnlockError(''); }} style={{ ...commonStyles.input(theme), borderColor: unlockError ? theme.red : theme.border }} autoFocus />
            {unlockError && <div style={{ color: theme.red, fontSize: '11px', marginTop: '5px' }}>{unlockError}</div>}
            <button type="submit" style={{ ...commonStyles.button(theme, 'primary'), marginTop: '16px', width: '100%' }}>Unlock</button>
          </form>
        </div>
      )}
      {shortcutsOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10002, backgroundColor: 'rgba(15,23,42,0.54)', display: 'grid', placeItems: 'center', padding: '20px' }}>
          <div style={{ ...commonStyles.card(theme), width: '100%', maxWidth: '440px', padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}><h3 style={{ margin: 0 }}>Keyboard Shortcuts</h3><button onClick={() => setShortcutsOpen(false)} style={{ border: 0, background: 'transparent', color: theme.muted, cursor: 'pointer' }}><X size={18} /></button></div>
            {['G D - Dashboard', 'G E - Data Entry', 'G F - Defects', 'G R - Releases', 'G T - Timesheet', 'G X - Export', 'G S - Team Structure', 'Escape - Close modal or popover', 'Ctrl/Cmd + S - Save open form'].map(item => <div key={item} style={{ padding: '7px 0', borderTop: `1px solid ${theme.border}`, fontSize: '13px' }}>{item}</div>)}
          </div>
        </div>
      )}
      <Toast toast={toast} theme={theme} />
    </div>
  );
}
