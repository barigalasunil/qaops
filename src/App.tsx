/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getTheme, commonStyles } from './theme';
import { AppState, User } from './types';
import { getEffectivePermissions, getPermissionsForRole, hashPassword, isPasswordHash, scopeAppStateForUser } from './utils';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { DataEntry } from './components/DataEntry';
import { Defects } from './components/Defects';
import { Releases } from './components/Releases';
import { Timesheet } from './components/Timesheet';
import { Export } from './components/Export';
import { Settings } from './components/Settings';
import { Toast } from './components/Shared';
import { UserCheck } from 'lucide-react';

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
        settings: 'edit',
      },
      createdBy: 'system',
      createdByRole: 'superadmin',
      mustChangePassword: false,
      loginCount: 0,
      failedLoginAttempts: 0,
      lockedUntil: null,
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
  customFields: [],
};

export default function App() {
  // Theme settings (defaults to Dark mode for modern look)
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem(THEME_KEY) || localStorage.getItem('qa-hub-theme');
    return saved ? saved === 'dark' : true;
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
          };
        });

        parsed.squads = (parsed.squads || []).map((s: any) => ({
          ...s,
          projectId: s.projectId ?? (parsed.projects?.length === 1 ? parsed.projects[0].id : null),
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
              isNightDeployment: day.isNightDeployment ?? day.isNightShift ?? false,
              isWeekendSupport: day.isWeekendSupport ?? false,
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

  useEffect(() => {
    if (!migrationReady) return;
    const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
    const userId = sessionStorage.getItem(SESSION_USER_KEY);
    if (token && userId) {
      const user = appState.users.find(item => item.id === userId);
      if (user) {
        setCurrentUser(user);
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
        }
      }
    }
  }, [appState.users, currentUser]);

  // Toast Alerts Notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; exiting?: boolean } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(
      () => toast.exiting
        ? setToast(null)
        : setToast(current => current ? { ...current, exiting: true } : null),
      toast.exiting ? 250 : 2550
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
      .page-enter { animation: pageEnter 0.2s ease-out forwards; }
      .row-flash { animation: rowFlash 1.5s ease forwards; }
      .toast-in { animation: toastIn 0.3s ease-out forwards; }
      .toast-out { animation: toastOut 0.25s ease-in forwards; }
      .sidebar-logo:hover { opacity: 0.8; }
      button:hover { opacity: 0.88; }
      button:active { transform: scale(0.97); }
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
      showToast(`Account locked. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`, 'error');
      return;
    }

    const enteredHash = await hashPassword(loginPassword.trim());
    if (candidate.password === enteredHash) {
      const updatedUser: User = {
        ...candidate,
        loginCount: candidate.loginCount + 1,
        failedLoginAttempts: 0,
        lockedUntil: null,
      };
      setAppState(prev => ({ ...prev, users: prev.users.map(user => user.id === updatedUser.id ? updatedUser : user) }));
      sessionStorage.setItem(SESSION_TOKEN_KEY, crypto.randomUUID?.() || Math.random().toString(36).slice(2));
      sessionStorage.setItem(SESSION_USER_KEY, updatedUser.id);
      setCurrentUser(updatedUser);
      setSessionExpired(false);
      setPasswordModal(updatedUser.mustChangePassword ? 'forced' : updatedUser.loginCount % 5 === 0 ? 'periodic' : null);
      // land page: dynamically choose the first accessible tab
      const targetTab = getFirstAccessibleTab(updatedUser);
      setCurrentTab(targetTab);
      showToast(`Welcome back, ${updatedUser.username}!`, 'success');
      setLoginUsername('');
      setLoginPassword('');
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
    sessionStorage.clear();
    setCurrentUser(null);
    setPasswordModal(null);
    showToast('Signed out successfully.', 'success');
  }, [showToast]);

  useEffect(() => {
    if (!currentUser) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
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
      clearTimeout(timer);
      events.forEach(event => window.removeEventListener(event, reset));
    };
  }, [currentUser?.id]);

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
    const updated = { ...currentUser, password, mustChangePassword: false };
    setAppState(prev => ({ ...prev, users: prev.users.map(user => user.id === updated.id ? updated : user) }));
    setCurrentUser(updated);
    setPasswordForm({ current: '', next: '', confirm: '' });
    setPasswordModal(null);
    setPasswordError('');
    setPasswordSubmitted(false);
    showToast('Password updated successfully.', 'success');
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

  const formattedTime = currentTime.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

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

    const permKey = keyMap[tabId];
    if (!permKey) return true;
    return perms[permKey] !== 'none';
  };

  const activeTabValidated = canAccessTab(currentTab) ? currentTab : getFirstAccessibleTab(currentUser);
  const userPerms = getEffectivePermissions(currentUser);

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: theme.muted, fontWeight: 500 }}>
            <span>{formattedDate}</span>
            <span style={{ borderLeft: `1px solid ${theme.border}`, paddingLeft: '12px', color: theme.text, fontFamily: 'monospace', fontWeight: 600 }}>
              {formattedTime}
            </span>
          </div>
        </header>

        {/* Scrollable View Panel */}
        <main style={{ flex: 1, padding: '16px', overflowY: 'auto', boxSizing: 'border-box' }}>
          <div key={activeTabValidated} className="page-enter">
                    {/* Render Active View component */}
          {activeTabValidated === 'dashboard' && <Dashboard currentUser={currentUser} appState={scopedAppState} theme={theme} />}
          
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
              }}
            />
          )}
          </div>

        </main>
      </div>

      {/* Floating active notifications */}
      <Toast toast={toast} theme={theme} />
    </div>
  );
}
