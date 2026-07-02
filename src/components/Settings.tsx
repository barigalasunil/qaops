/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { ThemeTokens, commonStyles } from '../theme';
import { AppState, CustomField, Project, Squad, User, UserPermissions } from '../types';
import { exportToCSV, generateId, generateStrongPassword, getPermissionsForRole, hashPassword, sanitise, formatDateTime } from '../utils';
import { Field } from './Shared';
import { PermissionsTable } from './PermissionsTable';
import { BackupRestore } from './BackupRestore';
import { BulkImport } from './BulkImport';
import { Plus, Trash2, Shield, UserX, UserCheck, Key, Settings as SettingsIcon, X, HardDrive } from 'lucide-react';

const BASE_OFFICE_OPTIONS: User['baseOffice'][] = ['Bengaluru', 'Mumbai'];

interface SettingsProps {
  currentUser: User;
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  showToast: (msg: string, type: 'success' | 'error') => void;
  theme: ThemeTokens;
  readOnly?: boolean;
  onUpdateCurrentUser?: (user: User) => void;
}

export function Settings({ currentUser, appState, setAppState, showToast, theme, readOnly = false, onUpdateCurrentUser }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<'users' | 'projects' | 'squads' | 'fields' | 'audit' | 'backup' | 'import'>('users');

  // Input states for My Account
  const [editAccountForm, setEditAccountForm] = useState({
    username: currentUser.username,
    email: currentUser.email || '',
    password: '',
    confirmPassword: '',
  });
  const [accountErrors, setAccountErrors] = useState<Record<string, string>>({});
  const [auditFilters, setAuditFilters] = useState({ user: '', action: '', from: '', to: '' });
  const updateAccountForm = (key: keyof typeof editAccountForm, value: string) => {
    setEditAccountForm(previous => ({ ...previous, [key]: value }));
    setAccountErrors(previous => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  };

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [generatedUsername, setGeneratedUsername] = useState('');
  const [showPwText, setShowPwText] = useState(false);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState<User | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ message: string; onConfirm: () => void } | null>(null);

  // Input states for Users
  const [userForm, setUserForm] = useState({
    username: '',
    email: '',
    role: 'member' as User['role'],
    squadId: '',
    projectId: '',
    reportsTo: '',
    jobTitle: '',
    baseOffice: 'Bengaluru' as User['baseOffice'],
    birthdayDay: '',
    birthdayMonth: '',
  });
  const [userErrors, setUserErrors] = useState<Record<string, string>>({});
  const updateUserForm = (key: keyof typeof userForm, value: any, extras: Partial<typeof userForm> = {}) => {
    setUserForm(previous => ({ ...previous, [key]: value, ...extras }));
    setUserErrors(previous => {
      const next = { ...previous };
      delete next[key];
      Object.keys(extras).forEach(extraKey => delete next[extraKey]);
      return next;
    });
  };

  const [userPermissions, setUserPermissions] = useState<UserPermissions>(() => getPermissionsForRole('member'));
  const isSuperAdmin = currentUser.role === 'superadmin';
  const isAdmin = currentUser.role === 'admin';
  const canEditSettings = isSuperAdmin || !readOnly;

  // States for editing existing user permissions
  const [editingPermissionsUserId, setEditingPermissionsUserId] = useState<string | null>(null);
  const [editingPermissionsVal, setEditingPermissionsVal] = useState<UserPermissions | null>(null);

  // Input states for Projects
  const [newProjectName, setNewProjectName] = useState('');

  // Input states for Squads
  const [newSquadName, setNewSquadName] = useState('');
  const [newSquadProjectId, setNewSquadProjectId] = useState(currentUser.projectId || '');

  // Keep username input updated when currentUser profile changes
  useEffect(() => {
    setEditAccountForm(prev => ({
      ...prev,
      username: currentUser.username,
      email: currentUser.email || '',
    }));
  }, [currentUser]);

  useEffect(() => {
    if (isAdmin) {
      setUserForm(prev => ({ ...prev, projectId: currentUser.projectId || '' }));
      setNewSquadProjectId(currentUser.projectId || '');
    }
  }, [currentUser.projectId, isAdmin]);

  // Input states for Custom Fields
  const [customFieldForm, setCustomFieldForm] = useState({
    label: '',
    type: 'text' as CustomField['type'],
    options: '',
    appliesTo: 'dataEntry' as CustomField['appliesTo'],
  });

  // Lookup maps
  const projectMap = useMemo(() => new Map(appState.projects.map(p => [p.id, p.name])), [appState.projects]);
  const squadMap = useMemo(() => new Map(appState.squads.map(s => [s.id, s.name])), [appState.squads]);

  // Project/Squad dropdown values
  const projectOptions = useMemo(() => {
    return appState.projects.map(p => ({ value: p.id, label: p.name }));
  }, [appState.projects]);

  const squadOptions = useMemo(() => {
    const projectId = isAdmin ? currentUser.projectId : userForm.projectId;
    return appState.squads
      .filter(s => !projectId || s.projectId === projectId)
      .map(s => ({ value: s.id, label: s.name }));
  }, [appState.squads, currentUser.projectId, isAdmin, userForm.projectId]);

  const reportsToOptions = useMemo(() => {
    const projectId = isAdmin ? currentUser.projectId : userForm.projectId;
    if (userForm.role === 'member') {
      return appState.users
        .filter(user => user.role === 'lead' && (!projectId || user.projectId === projectId))
        .map(user => ({ value: user.id, label: `${user.username}${user.jobTitle ? ` - ${user.jobTitle}` : ''}` }));
    }
    if (userForm.role === 'lead') {
      return appState.users
        .filter(user => user.role === 'admin' && (!projectId || user.projectId === projectId))
        .map(user => ({ value: user.id, label: `${user.username}${user.jobTitle ? ` - ${user.jobTitle}` : ''}` }));
    }
    return [];
  }, [appState.users, currentUser.projectId, isAdmin, userForm.projectId, userForm.role]);

  const visibleUsers = useMemo(() => (
    isSuperAdmin
      ? appState.users
      : appState.users.filter(u => u.projectId === currentUser.projectId)
  ), [appState.users, currentUser.projectId, isSuperAdmin]);

  const visibleSquads = useMemo(() => (
    isSuperAdmin
      ? appState.squads
      : appState.squads.filter(s => s.projectId === currentUser.projectId)
  ), [appState.squads, currentUser.projectId, isSuperAdmin]);

  const allowedRoles: User['role'][] = isSuperAdmin
    ? ['superadmin', 'admin', 'lead', 'member', 'guest']
    : isAdmin ? ['lead', 'member', 'guest'] : [];

  // ---------------------------------------------------------------------------
  // USERS OPERATIONS
  // ---------------------------------------------------------------------------
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();

    const username = userForm.username.trim().toLowerCase();
    const nextErrors: Record<string, string> = {};
    if (!username) nextErrors.username = 'Username is required.';
    else if (username.length < 3) nextErrors.username = 'Username must be at least 3 characters.';
    else if (!/^[a-zA-Z0-9_]+$/.test(username)) nextErrors.username = 'Use letters, numbers, and underscores only.';
    else if (appState.users.some((u) => u.username.toLowerCase() === username)) nextErrors.username = 'Username already exists.';
    if (userForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userForm.email)) nextErrors.email = 'Please enter a valid email address.';
    if (!userForm.role || !allowedRoles.includes(userForm.role)) nextErrors.role = 'Role is required.';
    if ((userForm.role === 'admin' || userForm.role === 'lead' || userForm.role === 'member') && !(isAdmin ? currentUser.projectId : userForm.projectId)) {
      nextErrors.projectId = userForm.role === 'admin' ? 'Project is required for Admin' : 'Project is required.';
    }
    if ((userForm.role === 'lead' || userForm.role === 'member') && !userForm.squadId) nextErrors.squadId = 'Squad is required.';
    setUserErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const projectId = userForm.role === 'superadmin' || userForm.role === 'guest'
      ? null
      : (isAdmin ? currentUser.projectId : userForm.projectId);
    const squadId = userForm.role === 'lead' || userForm.role === 'member'
      ? userForm.squadId
      : null;

    // STEP 1 — Generate plain text password FIRST
    const plainPassword = generateStrongPassword();

    // STEP 2 — Hash password
    const hashedPassword = await hashPassword(plainPassword);

    // STEP 4 — Save user with hashed password
    const newUser: User = {
      id: generateId(),
      username: sanitise(userForm.username.trim()),
      email: userForm.email.trim(),
      password: hashedPassword,
      role: userForm.role,
      squadId,
      projectId,
      permissions: userForm.role === 'superadmin' ? getPermissionsForRole('superadmin') : (userForm.role === 'guest' ? getPermissionsForRole('guest') : userPermissions),
      createdBy: currentUser.id,
      createdByRole: currentUser.role,
      mustChangePassword: true,
      loginCount: 0,
      failedLoginAttempts: 0,
      lockedUntil: null,
      reportsTo: (userForm.role === 'superadmin' || userForm.role === 'guest' || userForm.role === 'admin') ? null : userForm.reportsTo,
      directReports: [],
      baseOffice: userForm.baseOffice || 'Bengaluru',
      birthday: userForm.birthdayDay && userForm.birthdayMonth
        ? `${userForm.birthdayMonth.padStart(2, '0')}-${userForm.birthdayDay.padStart(2, '0')}`
        : null,
      loginCountWithoutBirthday: userForm.birthdayDay && userForm.birthdayMonth ? 99 : 0,
      jobTitle: sanitise(userForm.jobTitle.trim()),
      passwordChangedAt: new Date().toISOString(),
      loginHistory: [],
      notifications: [],
    };

    setAppState((prev) => ({
      ...prev,
      users: [...prev.users.map(user => user.id === newUser.reportsTo ? {
        ...user,
        directReports: Array.from(new Set([...(user.directReports || []), newUser.id])),
        notifications: newUser.reportsTo ? [{
          id: generateId(),
          message: `${newUser.username} has been added as your direct report.`,
          read: false,
          createdAt: new Date().toISOString(),
          type: 'info' as const,
          link: 'teamStructure',
        }, ...(user.notifications || [])].slice(0, 50) : user.notifications,
      } : user), newUser],
      auditLog: [{
        id: generateId(),
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        username: currentUser.username,
        role: currentUser.role,
        action: 'CREATE_USER',
        details: `Created user ${newUser.username}`,
        ipHint: 'Browser session',
      }, ...(prev.auditLog || [])].slice(0, 500),
    }));

    setUserForm({
      username: '',
      email: '',
      role: 'member',
      squadId: '',
      projectId: isAdmin ? (currentUser.projectId || '') : '',
      reportsTo: '',
      jobTitle: '',
      baseOffice: 'Bengaluru',
      birthdayDay: '',
      birthdayMonth: '',
    });
    setUserPermissions(getPermissionsForRole('member'));

    // STEP 5 — Show in-app modal with generated password
    setGeneratedUsername(userForm.username);
    setGeneratedPassword(plainPassword);
    setShowPasswordModal(true);
  };

  const handleToggleEditPermissions = (u: User) => {
    if (u.role === 'superadmin' || (!isSuperAdmin && u.role === 'admin')) return;
    if (editingPermissionsUserId === u.id) {
      setEditingPermissionsUserId(null);
      setEditingPermissionsVal(null);
    } else {
      setEditingPermissionsUserId(u.id);
      const currentPerms = u.permissions || getPermissionsForRole(u.role);
      setEditingPermissionsVal({ ...currentPerms });
    }
  };

  const handleSaveUserPermissions = (userId: string) => {
    if (!editingPermissionsVal) return;
    setAppState((prev) => ({
      ...prev,
      users: prev.users.map((user) => {
        if (user.id === userId && user.role !== 'superadmin') {
          return {
            ...user,
            permissions: editingPermissionsVal,
            notifications: [{
              id: generateId(),
              message: `Your access permissions were updated by ${currentUser.username}.`,
              read: false,
              createdAt: new Date().toISOString(),
              type: 'info' as const,
              link: 'profile',
            }, ...(user.notifications || [])].slice(0, 50),
          };
        }
        return user;
      }),
      auditLog: [{
        id: generateId(),
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        username: currentUser.username,
        role: currentUser.role,
        action: 'PERMISSION_CHANGE',
        details: `Updated permissions for ${prev.users.find(user => user.id === userId)?.username || userId}`,
        ipHint: 'Browser session',
      }, ...(prev.auditLog || [])].slice(0, 500),
    }));
    showToast('Permissions updated successfully!', 'success');
    setEditingPermissionsUserId(null);
    setEditingPermissionsVal(null);
  };

  const handleBaseOfficeChange = (userId: string, baseOffice: User['baseOffice']) => {
    setAppState((prev) => ({
      ...prev,
      users: prev.users.map((user) => user.id === userId ? { ...user, baseOffice: baseOffice || 'Bengaluru' } : user),
      auditLog: [{
        id: generateId(),
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        username: currentUser.username,
        role: currentUser.role,
        action: 'PERMISSION_CHANGE',
        details: `Updated base office for ${prev.users.find(user => user.id === userId)?.username || userId} to ${baseOffice || 'Bengaluru'}`,
        ipHint: 'Browser session',
      }, ...(prev.auditLog || [])].slice(0, 500),
    }));
    showToast('Base Office updated successfully!', 'success');
  };

  const handlePromoteToLead = (userId: string) => {
    setAppState((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === userId ? { ...u, role: 'lead' as const } : u)),
    }));
    showToast('User promoted to Lead.', 'success');
  };

  const handleDemoteToMember = (userId: string) => {
    if (userId === 'superadmin') return;
    setAppState((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === userId ? { ...u, role: 'member' as const } : u)),
    }));
    showToast('User demoted to Member.', 'success');
  };

  const handleResetPassword = (userId: string) => {
    const target = appState.users.find(u => u.id === userId);
    if (!target || (!isSuperAdmin && (target.role === 'admin' || target.role === 'superadmin'))) return;
    setResetTargetUser(target);
    setShowResetConfirmModal(true);
  };

  const handleConfirmResetPassword = async () => {
    if (!resetTargetUser) return;
    const target = resetTargetUser;
    const newPlainPassword = generateStrongPassword();
    const password = await hashPassword(newPlainPassword);
    setAppState((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === target.id ? {
        ...u,
        password,
        mustChangePassword: true,
        passwordChangedAt: new Date().toISOString(),
        notifications: [{
          id: generateId(),
          message: `Your password was reset by ${currentUser.username}.`,
          read: false,
          createdAt: new Date().toISOString(),
          type: 'warning' as const,
          link: 'profile',
        }, ...(u.notifications || [])].slice(0, 50),
      } : u)),
      auditLog: [{
        id: generateId(),
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        username: currentUser.username,
        role: currentUser.role,
        action: 'RESET_PASSWORD',
        details: `Reset password for ${target.username}`,
        ipHint: 'Browser session',
      }, ...(prev.auditLog || [])].slice(0, 500),
    }));
    setShowResetConfirmModal(false);
    setResetTargetUser(null);
    if (target?.email) {
      showToast(`Password reset for ${target.username}.`, 'success');
    } else {
      setGeneratedUsername(target.username);
      setGeneratedPassword(newPlainPassword);
      setShowPasswordModal(true);
    }
  };

  const handleRemoveUser = (userId: string) => {
    const target = appState.users.find(u => u.id === userId);
    if (userId === 'superadmin' || userId === currentUser.id || !target ||
      (!isSuperAdmin && (target.role === 'admin' || target.role === 'superadmin'))) {
      showToast('This account cannot be deleted.', 'error');
      return;
    }
    setConfirmDelete({
      message: `Are you sure you want to delete user "${target.username}"? This cannot be undone.`,
      onConfirm: () => {
        setAppState((prev) => ({
          ...prev,
          users: prev.users
            .filter((u) => u.id !== userId)
            .map(user => ({
              ...user,
              reportsTo: user.reportsTo === userId ? null : user.reportsTo,
              directReports: (user.directReports || []).filter(id => id !== userId),
            })),
          auditLog: [{
            id: generateId(),
            timestamp: new Date().toISOString(),
            userId: currentUser.id,
            username: currentUser.username,
            role: currentUser.role,
            action: 'DELETE_USER',
            details: `Deleted user ${target.username}`,
            ipHint: 'Browser session',
          }, ...(prev.auditLog || [])].slice(0, 500),
        }));
        showToast('User deleted.', 'success');
        setConfirmDelete(null);
      },
    });
  };

  // ---------------------------------------------------------------------------
  // PROJECTS OPERATIONS

  // ---------------------------------------------------------------------------
  // PROJECTS OPERATIONS
  // ---------------------------------------------------------------------------
  const handleAddProject = (e: React.FormEvent) => {
    e.preventDefault();
    const name = sanitise(newProjectName.trim());
    if (!name) return;

    if (appState.projects.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      showToast('Project already exists.', 'error');
      return;
    }

    const newProj: Project = { id: generateId(), name };
    setAppState((prev) => ({ ...prev, projects: [...prev.projects, newProj] }));
    setNewProjectName('');
    showToast(`Project "${name}" added.`, 'success');
  };

  const handleRemoveProject = (id: string) => {
    setConfirmDelete({
      message: 'Removing this project will invalidate existing metrics referencing it. Proceed?',
      onConfirm: () => {
        setAppState((prev) => ({
          ...prev,
          projects: prev.projects.filter((p) => p.id !== id),
        }));
        showToast('Project removed.', 'success');
        setConfirmDelete(null);
      },
    });
  };

  // ---------------------------------------------------------------------------
  // SQUADS OPERATIONS
  // ---------------------------------------------------------------------------
  const handleAddSquad = (e: React.FormEvent) => {
    e.preventDefault();
    const name = sanitise(newSquadName.trim());
    if (!name) return;

    const projectId = isAdmin ? currentUser.projectId : newSquadProjectId;
    if (!projectId) {
      showToast('Select a project for this squad.', 'error');
      return;
    }

    if (appState.squads.some((s) => s.projectId === projectId && s.name.toLowerCase() === name.toLowerCase())) {
      showToast('Squad already exists.', 'error');
      return;
    }

    const newSq: Squad = { id: generateId(), name, projectId };
    setAppState((prev) => ({ ...prev, squads: [...prev.squads, newSq] }));
    setNewSquadName('');
    showToast(`Squad "${name}" added.`, 'success');
  };

  const handleRemoveSquad = (id: string) => {
    const squad = appState.squads.find(s => s.id === id);
    if (!squad || (!isSuperAdmin && squad.projectId !== currentUser.projectId)) return;
    setConfirmDelete({
      message: 'Removing this Squad will invalidate existing metrics referencing it. Proceed?',
      onConfirm: () => {
        setAppState((prev) => ({
          ...prev,
          squads: prev.squads.filter((s) => s.id !== id),
        }));
        showToast('Squad removed.', 'success');
        setConfirmDelete(null);
      },
    });
  };

  // ---------------------------------------------------------------------------
  // CUSTOM FIELDS OPERATIONS
  // ---------------------------------------------------------------------------
  const handleAddCustomField = (e: React.FormEvent) => {
    e.preventDefault();

    const label = sanitise(customFieldForm.label.trim());
    if (!label) {
      showToast('Field label is required.', 'error');
      return;
    }

    const optionsList = customFieldForm.options
      .split(',')
      .map((opt) => sanitise(opt.trim()))
      .filter((opt) => opt !== '');

    const newField: CustomField = {
      id: generateId(),
      label,
      type: customFieldForm.type,
      options: customFieldForm.type === 'select' ? optionsList : undefined,
      appliesTo: customFieldForm.appliesTo,
    };

    setAppState((prev) => ({
      ...prev,
      customFields: [...prev.customFields, newField],
    }));

    setCustomFieldForm({
      label: '',
      type: 'text',
      options: '',
      appliesTo: 'dataEntry',
    });

    showToast(`Custom field "${label}" added successfully!`, 'success');
  };

  const handleRemoveCustomField = (id: string) => {
    setConfirmDelete({
      message: 'Are you sure you want to delete this custom field?',
      onConfirm: () => {
        setAppState((prev) => ({
          ...prev,
          customFields: prev.customFields.filter((cf) => cf.id !== id),
        }));
        showToast('Custom field removed.', 'success');
        setConfirmDelete(null);
      },
    });
  };

  const handleUpdateMyAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const newUsername = sanitise(editAccountForm.username.trim());
    const newEmail = editAccountForm.email.trim();
    const newPassword = editAccountForm.password;
    const confirmPassword = editAccountForm.confirmPassword;

    const nextErrors: Record<string, string> = {};
    if (!newUsername) nextErrors.username = 'Username is required.';
    else if (appState.users.some((u) => u.id !== currentUser.id && u.username.toLowerCase() === newUsername.toLowerCase())) nextErrors.username = 'Username is already taken.';
    if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) nextErrors.email = 'Please enter a valid email address.';
    if (newPassword) {
      if (newPassword.length < 8) nextErrors.password = 'Password must be at least 8 characters.';
      else if (!/[A-Z]/.test(newPassword)) nextErrors.password = 'Password must include an uppercase letter.';
      else if (!/\d/.test(newPassword)) nextErrors.password = 'Password must include a number.';
      if (newPassword !== confirmPassword) nextErrors.confirmPassword = 'Passwords do not match.';
    } else if (confirmPassword) {
      nextErrors.password = 'New Password is required.';
    }
    setAccountErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const hashedPassword = newPassword ? await hashPassword(newPassword) : null;
    const updatedUsers = appState.users.map((u) => {
      if (u.id === currentUser.id) {
        const updated: User = {
          ...u,
          username: newUsername,
          email: newEmail,
        };
        if (hashedPassword) {
          updated.password = hashedPassword;
          updated.mustChangePassword = false;
        }
        return updated;
      }
      return u;
    });

    setAppState((prev) => ({
      ...prev,
      users: updatedUsers,
    }));

    const updatedCurrentUser = updatedUsers.find((u) => u.id === currentUser.id);
    if (updatedCurrentUser && onUpdateCurrentUser) {
      onUpdateCurrentUser(updatedCurrentUser);
    }

    setEditAccountForm((prev) => ({
      ...prev,
      password: '',
      confirmPassword: '',
    }));

    showToast('Account updated.', 'success');
  };

  const renderPermissionsSummary = (u: User) => {
    if (u.role === 'superadmin') {
      return (
        <span style={{ fontSize: '11px', color: theme.muted, fontStyle: 'italic' }}>
          All Edit Access (Super Admin)
        </span>
      );
    }
    if (u.role === 'guest') {
      return (
        <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#0d948818', color: '#0d9488', fontWeight: 600 }}>
          Guest (Read-Only)
        </span>
      );
    }
    const perms = u.permissions || getPermissionsForRole(u.role);
    const pages: { key: keyof UserPermissions; label: string }[] = [
      { key: 'dashboard', label: 'Dash' },
      { key: 'dataEntry', label: 'Entry' },
      { key: 'defects', label: 'Def' },
      { key: 'releases', label: 'Rel' },
      { key: 'timesheet', label: 'Time' },
      { key: 'export', label: 'Exp' },
      { key: 'settings', label: 'Set' },
    ];

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '350px' }}>
        {pages.map(({ key, label }) => {
          const val = perms[key];
          let chipColor = theme.muted;
          let chipBg = 'rgba(148, 163, 184, 0.1)';
          let borderCol = 'rgba(148, 163, 184, 0.2)';
          if (val === 'edit') {
            chipColor = theme.green;
            chipBg = 'rgba(16, 185, 129, 0.1)';
            borderCol = 'rgba(16, 185, 129, 0.2)';
          } else if (val === 'view') {
            chipColor = theme.blue;
            chipBg = 'rgba(59, 130, 246, 0.1)';
            borderCol = 'rgba(59, 130, 246, 0.2)';
          }

          return (
            <span
              key={key}
              title={`${label}: ${val}`}
              style={{
                fontSize: '10px',
                fontWeight: 600,
                padding: '2px 5px',
                borderRadius: '4px',
                color: chipColor,
                backgroundColor: chipBg,
                border: `1px solid ${borderCol}`,
                display: 'inline-flex',
                alignItems: 'center',
                textTransform: 'capitalize',
              }}
            >
              {label}: {val}
            </span>
          );
        })}
      </div>
    );
  };

  const filteredAuditLog = useMemo(() => (appState.auditLog || [])
    .filter(entry => !auditFilters.user || entry.userId === auditFilters.user)
    .filter(entry => !auditFilters.action || entry.action === auditFilters.action)
    .filter(entry => !auditFilters.from || entry.timestamp.slice(0, 10) >= auditFilters.from)
    .filter(entry => !auditFilters.to || entry.timestamp.slice(0, 10) <= auditFilters.to)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp)), [appState.auditLog, auditFilters]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Tab selection */}
      <div style={{ display: 'flex', borderBottom: `2px solid ${theme.border}`, gap: '16px' }}>
        {(['users', ...(isSuperAdmin ? ['projects'] : []), 'squads', 'fields', ...(isSuperAdmin ? ['audit'] : []), ...(isSuperAdmin ? ['backup'] : []), ...(isSuperAdmin ? ['import'] : [])] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '12px 16px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab ? `3px solid ${theme.blue}` : '3px solid transparent',
              color: activeTab === tab ? theme.blue : theme.muted,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              fontSize: '15px',
              textTransform: 'capitalize',
            }}
          >
            {tab === 'fields' ? 'Custom Fields' : tab === 'audit' ? 'Audit Log' : tab === 'backup' ? 'Backup & Restore' : tab === 'import' ? 'Import Data' : tab}
          </button>
        ))}
      </div>

      {/* 1. USERS ADMIN PANEL */}
      {activeTab === 'users' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Edit My Account (Visible to currently logged-in admin) */}
          {(isAdmin || isSuperAdmin) && (
            <div style={commonStyles.card(theme)}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', borderLeft: `4px solid ${theme.blue}`, paddingLeft: '8px' }}>
                <SettingsIcon size={16} style={{ color: theme.blue }} />
                Edit My Account
              </h3>
              <form noValidate onSubmit={handleUpdateMyAccount} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <Field
                  label="New Username"
                  type="text"
                  placeholder="New Username"
                  value={editAccountForm.username}
                  onChange={(v) => updateAccountForm('username', v)}
                  error={accountErrors.username}
                  required
                  theme={theme}
                />
                <Field
                  label="Email Address"
                  type="email"
                  placeholder="user@company.com"
                  value={editAccountForm.email}
                  onChange={(v) => updateAccountForm('email', v)}
                  error={accountErrors.email}
                  theme={theme}
                />
                <div>
                  <Field
                    label="New Password"
                    type="password"
                    placeholder="Leave blank to keep unchanged"
                    value={editAccountForm.password}
                    onChange={(v) => updateAccountForm('password', v)}
                    error={accountErrors.password}
                    theme={theme}
                  />
                  {editAccountForm.password && (
                    <div style={{
                      marginTop: '3px',
                      color: editAccountForm.password.length >= 12 && /[A-Z]/.test(editAccountForm.password) && /\d/.test(editAccountForm.password) && /[^A-Za-z0-9]/.test(editAccountForm.password)
                        ? theme.green
                        : editAccountForm.password.length >= 8 && /[A-Z]/.test(editAccountForm.password) && /\d/.test(editAccountForm.password)
                          ? theme.amber
                          : theme.red,
                      fontSize: '11px',
                      fontWeight: 700,
                    }}>
                      Strength: {editAccountForm.password.length >= 12 && /[A-Z]/.test(editAccountForm.password) && /\d/.test(editAccountForm.password) && /[^A-Za-z0-9]/.test(editAccountForm.password)
                        ? 'Strong'
                        : editAccountForm.password.length >= 8 && /[A-Z]/.test(editAccountForm.password) && /\d/.test(editAccountForm.password)
                          ? 'Fair'
                          : 'Weak'}
                    </div>
                  )}
                </div>
                <Field
                  label="Confirm Password"
                  type="password"
                  placeholder="Confirm New Password"
                  value={editAccountForm.confirmPassword}
                  onChange={(v) => updateAccountForm('confirmPassword', v)}
                  error={accountErrors.confirmPassword}
                  theme={theme}
                />
                <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <button type="submit" style={commonStyles.button(theme, 'primary')}>
                    Save Account Settings
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Add user form */}
          {allowedRoles.length > 0 && canEditSettings && <div style={commonStyles.card(theme)}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Plus size={18} style={{ color: theme.blue }} />
              Register Team Member
            </h3>
            <form noValidate onSubmit={handleAddUser} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <Field label="Username" type="text" placeholder="e.g. janesmith" value={userForm.username} onChange={(v) => updateUserForm('username', v)} error={userErrors.username} required theme={theme} />
              <Field label="Email Address" type="email" placeholder="user@company.com" value={userForm.email} onChange={(v) => updateUserForm('email', v)} error={userErrors.email} theme={theme} />
              <Field
                label="Role"
                type="select"
                value={userForm.role}
                onChange={(v) => {
                  updateUserForm('role', v, { squadId: '', projectId: isAdmin ? (currentUser.projectId || '') : '' });
                  setUserPermissions(getPermissionsForRole(v as any));
                }}
                options={allowedRoles.map(role => ({
                  value: role,
                  label: role === 'superadmin' ? 'Super Admin' : role === 'guest' ? 'Guest (Read-Only)' : role.charAt(0).toUpperCase() + role.slice(1)
                }))}
                required
                error={userErrors.role}
                theme={theme}
              />

              {(userForm.role === 'admin' || userForm.role === 'lead' || userForm.role === 'member') && <Field
                label="Assigned Project"
                type="select"
                value={userForm.projectId}
                onChange={(v) => updateUserForm('projectId', v, { squadId: '' })}
                options={projectOptions}
                placeholder="Select project"
                required
                error={userErrors.projectId}
                disabled={isAdmin}
                theme={theme}
              />}

              {(userForm.role === 'lead' || userForm.role === 'member') && <Field
                label="Assigned Squad"
                type="select"
                value={userForm.squadId}
                onChange={(v) => updateUserForm('squadId', v)}
                options={squadOptions}
                placeholder="Select squad"
                required
                error={userErrors.squadId}
                theme={theme}
              />}

              {(userForm.role === 'member' || userForm.role === 'lead') && <Field
                label="Reports To (Direct Manager)"
                type="select"
                value={userForm.reportsTo}
                onChange={(v) => updateUserForm('reportsTo', v)}
                options={reportsToOptions}
                placeholder={reportsToOptions.length ? 'Select manager' : 'No eligible managers'}
                error={userErrors.reportsTo}
                theme={theme}
              />}

              <Field
                label="Job Title"
                type="text"
                placeholder="e.g. Senior QA Engineer"
                value={userForm.jobTitle}
                onChange={(v) => updateUserForm('jobTitle', v)}
                theme={theme}
              />

              <Field
                label="Base Office"
                type="select"
                value={userForm.baseOffice || 'Bengaluru'}
                onChange={(v) => updateUserForm('baseOffice', v as User['baseOffice'])}
                options={BASE_OFFICE_OPTIONS.map(office => ({ value: office, label: office }))}
                required
                theme={theme}
              />

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={commonStyles.label(theme)}>Birthday (optional)</label>
                  <select value={userForm.birthdayDay} onChange={e => updateUserForm('birthdayDay', e.target.value)} style={commonStyles.select(theme, true)}>
                    <option value="">Day</option>
                    {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={String(i + 1)}>{i + 1}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={commonStyles.label(theme)}>&nbsp;</label>
                  <select value={userForm.birthdayMonth} onChange={e => updateUserForm('birthdayMonth', e.target.value)} style={commonStyles.select(theme, true)}>
                    <option value="">Month</option>
                    {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((name, i) =>
                      <option key={i + 1} value={String(i + 1)}>{name}</option>
                    )}
                  </select>
                </div>
              </div>

              {userForm.role !== 'guest' && <div style={{ gridColumn: '1 / -1', marginTop: '12px' }}>
                <label style={{ ...commonStyles.label(theme), fontSize: '14px', fontWeight: 600, color: theme.text }}>
                  Permissions Configuration
                </label>
                <p style={{ fontSize: '12px', color: theme.muted, margin: '4px 0 12px 0' }}>
                  Customize the page and action permissions for this user. Selections are pre-filled with the default access levels for the '{userForm.role}' role.
                </p>
                <PermissionsTable
                  value={userPermissions}
                  onChange={setUserPermissions}
                  readOnly={userForm.role === 'superadmin'}
                  theme={theme}
                />
              </div>}

              {userForm.role === 'guest' && (
                <div style={{ gridColumn: '1 / -1', padding: '12px 16px', backgroundColor: '#0d948812', border: '1px solid #0d948830', borderRadius: '8px', fontSize: '13px', color: theme.text }}>
                  Guest users have read-only access to Dashboard, Team Structure, and Export only.
                </div>
              )}

              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <div style={{ fontSize: '11px', color: theme.muted, marginRight: 'auto' }}>A strong password will be auto-generated. Share it securely with the user.</div>
                <button type="submit" style={commonStyles.button(theme, 'primary')}>
                  Add User Account
                </button>
              </div>
            </form>
          </div>}

          {/* Users List */}
          <div style={commonStyles.card(theme)}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: theme.text, marginBottom: '16px', borderLeft: `4px solid ${theme.blue}`, paddingLeft: '8px' }}>
              Roster & Account Access Control
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={commonStyles.table(theme)}>
                <thead>
                  <tr style={{ backgroundColor: theme.inputBg }}>
                    <th style={commonStyles.th(theme)}>Username</th>
                    <th style={commonStyles.th(theme)}>Role</th>
                    <th style={commonStyles.th(theme)}>Squad Assigned</th>
                    {isSuperAdmin && <th style={commonStyles.th(theme)}>Project</th>}
                    <th style={commonStyles.th(theme)}>Base Office</th>
                    <th style={commonStyles.th(theme)}>Permissions</th>
                    <th style={commonStyles.th(theme)}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((u) => {
                    const isEditing = editingPermissionsUserId === u.id;
                    return (
                      <React.Fragment key={u.id}>
                        <tr style={{ backgroundColor: u.id === 'superadmin' ? `${theme.amber}08` : 'transparent' }}>
                          <td style={{ ...commonStyles.td(theme), fontWeight: 600 }}>
                            {u.username}
                            {u.id === 'superadmin' && (
                              <span style={{ marginLeft: '8px', fontSize: '10px', backgroundColor: `${theme.blue}20`, color: theme.blue, padding: '2px 6px', borderRadius: '4px' }}>
                                Default
                              </span>
                            )}
                          </td>
                          <td style={commonStyles.td(theme)}>
                            {u.role === 'guest' ? (
                              <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#0d948818', color: '#0d9488', fontWeight: 700, textTransform: 'capitalize' }}>guest</span>
                            ) : (
                              <span style={{ textTransform: 'capitalize', fontWeight: u.role === 'superadmin' || u.role === 'admin' ? 700 : 'normal' }}>
                                {u.role === 'superadmin' ? 'Super Admin' : u.role}
                              </span>
                            )}
                          </td>
                          <td style={commonStyles.td(theme)}>{squadMap.get(u.squadId || '') || '—'}</td>
                          {isSuperAdmin && <td style={commonStyles.td(theme)}>{projectMap.get(u.projectId || '') || 'All Projects'}</td>}
                          <td style={commonStyles.td(theme)}>
                            {canEditSettings && u.id !== 'superadmin' ? (
                              <select
                                value={u.baseOffice || 'Bengaluru'}
                                onChange={event => handleBaseOfficeChange(u.id, event.target.value as User['baseOffice'])}
                                style={{ ...commonStyles.select(theme, true), minWidth: 120, fontSize: 12 }}
                              >
                                {BASE_OFFICE_OPTIONS.map(office => <option key={office} value={office}>{office}</option>)}
                              </select>
                            ) : (
                              u.baseOffice || 'Bengaluru'
                            )}
                          </td>
                          <td style={commonStyles.td(theme)}>
                            {renderPermissionsSummary(u)}
                          </td>
                          <td style={commonStyles.td(theme)}>
                            {u.id !== 'superadmin' && canEditSettings ? (
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {u.role !== 'superadmin' && u.role !== 'guest' && (isSuperAdmin || (u.role !== 'admin' && u.role !== 'superadmin')) && <button
                                  onClick={() => handleToggleEditPermissions(u)}
                                  style={commonStyles.button(theme, 'secondary', 'sm')}
                                  title="Edit Page Permissions"
                                >
                                  <Shield size={13} style={{ color: theme.indigo }} />
                                  Edit Permissions
                                </button>}

                                {(u.role === 'member' && (isSuperAdmin || isAdmin)) ? (
                                  <button
                                    onClick={() => handlePromoteToLead(u.id)}
                                    style={commonStyles.button(theme, 'secondary', 'sm')}
                                    title="Promote to Lead"
                                  >
                                    <UserCheck size={13} style={{ color: theme.green }} />
                                    Promote
                                  </button>
                                ) : u.role === 'lead' ? (
                                  <button
                                    onClick={() => handleDemoteToMember(u.id)}
                                    style={commonStyles.button(theme, 'secondary', 'sm')}
                                    title="Demote to Member"
                                  >
                                    <UserX size={13} style={{ color: theme.orange }} />
                                    Demote
                                  </button>
                                ) : null}

                                {(isSuperAdmin || (u.role !== 'admin' && u.role !== 'superadmin')) && <button
                                  onClick={() => handleResetPassword(u.id)}
                                  style={commonStyles.button(theme, 'secondary', 'sm')}
                                >
                                  <Key size={13} style={{ color: theme.blue }} />
                                  Reset Password
                                </button>}

                                {u.id !== currentUser.id && (
                                  <button
                                    onClick={() => handleRemoveUser(u.id)}
                                    style={commonStyles.button(theme, 'danger', 'sm')}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: theme.muted }}>
                                <Shield size={14} style={{ color: theme.blue }} />
                                <span>System Protected</span>
                              </div>
                            )}
                          </td>
                        </tr>
                        {isEditing && editingPermissionsVal && (
                          <tr>
                            <td colSpan={isSuperAdmin ? 7 : 6} style={{ ...commonStyles.td(theme), backgroundColor: `${theme.inputBg}cc`, padding: '16px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '600px', opacity: 1, overflow: 'hidden', transition: 'max-height 0.3s ease, opacity 0.3s ease' }}>
                                <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: theme.text }}>
                                  Edit Page Permissions for <span style={{ color: theme.blue }}>{u.username}</span>
                                </h4>
                                <PermissionsTable
                                  value={editingPermissionsVal}
                                  onChange={setEditingPermissionsVal}
                                  theme={theme}
                                />
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                                  <button
                                    onClick={() => {
                                      setEditingPermissionsUserId(null);
                                      setEditingPermissionsVal(null);
                                    }}
                                    style={commonStyles.button(theme, 'secondary', 'sm')}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleSaveUserPermissions(u.id)}
                                    style={commonStyles.button(theme, 'success', 'sm')}
                                  >
                                    Save Permissions
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* 2. PROJECTS MANAGEMENT */}
      {activeTab === 'projects' && isSuperAdmin && (
        <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '24px', flexWrap: 'wrap' }}>
          
          {canEditSettings && <div style={commonStyles.card(theme)}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: theme.text, marginBottom: '16px' }}>
              Add Project Scope
            </h3>
            <form onSubmit={handleAddProject} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <Field
                label="Project Name"
                type="text"
                placeholder="e.g. Customer Portal Web"
                value={newProjectName}
                onChange={setNewProjectName}
                required
                theme={theme}
              />
              <button type="submit" style={commonStyles.button(theme, 'primary')}>
                <Plus size={16} />
                Add Project
              </button>
            </form>
          </div>}

          {canEditSettings && <div style={commonStyles.card(theme)}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: theme.text, marginBottom: '16px', borderLeft: `4px solid ${theme.blue}`, paddingLeft: '8px' }}>
              Active Project Portfolios
            </h3>
            {appState.projects.length === 0 ? (
              <p style={{ color: theme.muted, fontSize: '14px' }}>No active projects recorded. Register a project scope.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {appState.projects.map((proj) => (
                  <div
                    key={proj.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 16px',
                      backgroundColor: theme.inputBg,
                      border: `1px solid ${theme.border}`,
                      borderRadius: '8px',
                    }}
                  >
                    <span style={{ fontWeight: 600, color: theme.text }}>{proj.name}</span>
                    <button
                      onClick={() => handleRemoveProject(proj.id)}
                      style={{
                        padding: '6px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        color: theme.red,
                        cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>}

        </div>
      )}

      {/* 3. SQUADS MANAGEMENT */}
      {activeTab === 'squads' && (
        <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '24px', flexWrap: 'wrap' }}>
          
          {canEditSettings && <div style={commonStyles.card(theme)}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: theme.text, marginBottom: '16px' }}>
              Add Squad Division
            </h3>
            <form onSubmit={handleAddSquad} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <Field
                label="Squad Name"
                type="text"
                placeholder="e.g. Payments Squad"
                value={newSquadName}
                onChange={setNewSquadName}
                required
                theme={theme}
              />
              {isSuperAdmin && <Field
                label="Project"
                type="select"
                value={newSquadProjectId}
                onChange={setNewSquadProjectId}
                options={projectOptions}
                placeholder="Select project"
                required
                theme={theme}
              />}
              <button type="submit" style={commonStyles.button(theme, 'primary')}>
                <Plus size={16} />
                Add Squad
              </button>
            </form>
          </div>}

          <div style={commonStyles.card(theme)}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: theme.text, marginBottom: '16px', borderLeft: `4px solid ${theme.indigo}`, paddingLeft: '8px' }}>
              Active Testing Squads
            </h3>
            {visibleSquads.length === 0 ? (
              <p style={{ color: theme.muted, fontSize: '14px' }}>No squads recorded. Register a squad team.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {visibleSquads.map((sq) => (
                  <div
                    key={sq.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 16px',
                      backgroundColor: theme.inputBg,
                      border: `1px solid ${theme.border}`,
                      borderRadius: '8px',
                    }}
                  >
                    <span style={{ fontWeight: 600, color: theme.text }}>
                      {sq.name}{isSuperAdmin ? ` · ${projectMap.get(sq.projectId || '') || 'Unassigned'}` : ''}
                    </span>
                    {canEditSettings && <button
                      onClick={() => handleRemoveSquad(sq.id)}
                      style={{
                        padding: '6px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        color: theme.red,
                        cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={16} />
                    </button>}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* 4. CUSTOM FIELDS PANEL */}
      {activeTab === 'fields' && (
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '24px', flexWrap: 'wrap' }}>
          
          {canEditSettings && <div style={commonStyles.card(theme)}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: theme.text, marginBottom: '16px' }}>
              Add Custom Field Input
            </h3>
            <form onSubmit={handleAddCustomField} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <Field label="Field Label" type="text" placeholder="e.g. Root Cause Category" value={customFieldForm.label} onChange={(v) => setCustomFieldForm(f => ({ ...f, label: v }))} required theme={theme} />
              
              <Field
                label="Field Type"
                type="select"
                value={customFieldForm.type}
                onChange={(v) => setCustomFieldForm(f => ({ ...f, type: v as any }))}
                options={[
                  { value: 'text', label: 'Plain Text' },
                  { value: 'number', label: 'Number Input' },
                  { value: 'select', label: 'Dropdown Selection' },
                  { value: 'url', label: 'Web URL' },
                  { value: 'date', label: 'Calendar Date' }
                ]}
                required
                theme={theme}
              />

              {customFieldForm.type === 'select' && (
                <Field
                  label="Dropdown Options (Comma-separated list)"
                  type="text"
                  placeholder="e.g. Environment Error, Code Bug, Design Gap"
                  value={customFieldForm.options}
                  onChange={(v) => setCustomFieldForm(f => ({ ...f, options: v }))}
                  required
                  theme={theme}
                />
              )}

              <Field
                label="Applies To Form Screen"
                type="select"
                value={customFieldForm.appliesTo}
                onChange={(v) => setCustomFieldForm(f => ({ ...f, appliesTo: v as any }))}
                options={[
                  { value: 'dataEntry', label: 'Data Entry Only' },
                  { value: 'defect', label: 'Defect Log Only' },
                  { value: 'both', label: 'Both Forms' }
                ]}
                required
                theme={theme}
              />

              <button type="submit" style={commonStyles.button(theme, 'primary')}>
                <Plus size={16} />
                Create Custom Field
              </button>
            </form>
          </div>}

          <div style={commonStyles.card(theme)}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: theme.text, marginBottom: '16px', borderLeft: `4px solid ${theme.orange}`, paddingLeft: '8px' }}>
              Active User Schema Extension Fields
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={commonStyles.table(theme)}>
                <thead>
                  <tr style={{ backgroundColor: theme.inputBg }}>
                    <th style={commonStyles.th(theme)}>Field Label</th>
                    <th style={commonStyles.th(theme)}>Type</th>
                    <th style={commonStyles.th(theme)}>Select List Values</th>
                    <th style={commonStyles.th(theme)}>Form Scope</th>
                    <th style={commonStyles.th(theme)}>Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {appState.customFields.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ ...commonStyles.td(theme), textAlign: 'center', color: theme.muted, padding: '24px' }}>
                        No schema extensions configured.
                      </td>
                    </tr>
                  ) : (
                    appState.customFields.map((field) => (
                      <tr key={field.id}>
                        <td style={{ ...commonStyles.td(theme), fontWeight: 600 }}>{field.label}</td>
                        <td style={commonStyles.td(theme)}>{field.type}</td>
                        <td style={commonStyles.td(theme)}>
                          {field.options && field.options.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {field.options.map((opt, oIdx) => (
                                <span key={oIdx} style={{ fontSize: '11px', backgroundColor: `${theme.indigo}15`, color: theme.indigo, padding: '2px 6px', borderRadius: '4px' }}>
                                  {opt}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: theme.muted }}>—</span>
                          )}
                        </td>
                        <td style={commonStyles.td(theme)}>
                          <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>
                            {field.appliesTo === 'both' ? 'Both Forms' : field.appliesTo === 'dataEntry' ? 'Data Entry' : 'Defect Log'}
                          </span>
                        </td>
                        <td style={commonStyles.td(theme)}>
                          {canEditSettings && <button
                            onClick={() => handleRemoveCustomField(field.id)}
                            style={{
                              padding: '4px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: theme.red,
                              cursor: 'pointer',
                            }}
                          >
                            <Trash2 size={16} />
                          </button>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {activeTab === 'audit' && isSuperAdmin && (
        <div style={commonStyles.card(theme)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ margin: 0, fontSize: '16px' }}>Audit Log</h3>
            <button type="button" onClick={() => exportToCSV(filteredAuditLog.map(entry => ({
              Timestamp: entry.timestamp,
              User: entry.username,
              Role: entry.role,
              Action: entry.action,
              Details: entry.details,
            })), 'qa_hub_audit_log')} style={commonStyles.button(theme, 'secondary', 'sm')}>Export CSV</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'end', marginBottom: '14px' }}>
            <Field label="User" type="select" value={auditFilters.user} onChange={(value) => setAuditFilters(prev => ({ ...prev, user: value }))} options={appState.users.map(user => ({ value: user.id, label: user.username }))} placeholder="All Users" theme={theme} />
            <Field label="Action" type="select" value={auditFilters.action} onChange={(value) => setAuditFilters(prev => ({ ...prev, action: value }))} options={Array.from(new Set((appState.auditLog || []).map(entry => entry.action))).sort().map(action => ({ value: action, label: action }))} placeholder="All Actions" theme={theme} />
            <Field label="From" type="date" value={auditFilters.from} onChange={(value) => setAuditFilters(prev => ({ ...prev, from: value }))} theme={theme} />
            <Field label="To" type="date" value={auditFilters.to} onChange={(value) => setAuditFilters(prev => ({ ...prev, to: value }))} theme={theme} />
          </div>
          <div style={{ overflowX: 'auto', maxHeight: '560px' }}>
            <table style={commonStyles.table(theme)}>
              <thead>
                <tr>
                  <th style={commonStyles.th(theme)}>Timestamp</th>
                  <th style={commonStyles.th(theme)}>User</th>
                  <th style={commonStyles.th(theme)}>Role</th>
                  <th style={commonStyles.th(theme)}>Action</th>
                  <th style={commonStyles.th(theme)}>Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredAuditLog.length ? filteredAuditLog.map(entry => (
                  <tr key={entry.id}>
                    <td style={commonStyles.td(theme)}>{new Date(entry.timestamp).toLocaleString()}</td>
                    <td style={commonStyles.td(theme)}>{entry.username}</td>
                    <td style={{ ...commonStyles.td(theme), textTransform: 'capitalize' }}>{entry.role}</td>
                    <td style={commonStyles.td(theme)}>{entry.action}</td>
                    <td style={commonStyles.td(theme)}>{entry.details}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} style={{ ...commonStyles.td(theme), textAlign: 'center', color: theme.muted, padding: '22px' }}>No audit entries found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'backup' && isSuperAdmin && (
        <BackupRestore
          currentUser={currentUser}
          appState={appState}
          setAppState={setAppState}
          showToast={showToast}
          theme={theme}
        />
      )}

      {activeTab === 'import' && isSuperAdmin && (
        <BulkImport
          currentUser={currentUser}
          appState={appState}
          setAppState={setAppState}
          showToast={showToast}
          theme={theme}
        />
      )}

      {/* In-app Generated Password Modal */}
      {showPasswordModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => {}}>
          <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 12, padding: '32px 28px', width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.4)', animation: 'pageEnter 0.2s ease-out forwards' }}
               onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') { setShowPasswordModal(false); setGeneratedPassword(''); setGeneratedUsername(''); } }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '18px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 22 }}>🔑</span> User Created Successfully
            </h3>
            <p style={{ fontSize: '13px', color: theme.muted, margin: '0 0 20px' }}>
              No email address was provided for this user. Share the generated password below securely.
            </p>
            <label style={{ ...commonStyles.label(theme), fontSize: '12px', fontWeight: 700, marginBottom: 4 }}>Username</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '10px 14px', color: theme.text, fontSize: 15, marginBottom: 16 }}>
              {generatedUsername}
            </div>
            <label style={{ ...commonStyles.label(theme), fontSize: '12px', fontWeight: 700, marginBottom: 4 }}>Generated Password</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.inputBg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '10px 14px', fontFamily: 'monospace', fontSize: 15, color: theme.text, letterSpacing: 1, marginBottom: 12 }}>
              <span style={{ flex: 1 }}>{showPwText ? generatedPassword : '•'.repeat(generatedPassword.length)}</span>
              <button type="button" onClick={() => setShowPwText(v => !v)} style={{ border: 0, background: 'transparent', color: theme.muted, cursor: 'pointer', padding: 0, fontSize: 18, lineHeight: 1 }}>
                {showPwText ? '🙈' : '👁'}
              </button>
              <button type="button" id="copy-pw-btn" onClick={() => {
                navigator.clipboard.writeText(generatedPassword);
                const btn = document.getElementById('copy-pw-btn');
                if (btn) { btn.textContent = 'Copied ✓'; setTimeout(() => { btn.textContent = 'Copy'; }, 2000); }
              }} style={{ ...commonStyles.button(theme, 'primary', 'sm'), whiteSpace: 'nowrap' }}>Copy</button>
            </div>
            <p style={{ fontSize: '11px', color: theme.amber, margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>⚠</span> This password will not be shown again. The user must change it on first login.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => { setShowPasswordModal(false); setGeneratedPassword(''); setGeneratedUsername(''); setShowPwText(false); }} style={commonStyles.button(theme, 'primary')}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Confirmation Modal */}
      {showResetConfirmModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 12, padding: '32px 28px', width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.4)', animation: 'pageEnter 0.2s ease-out forwards' }}
               onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setShowResetConfirmModal(false); }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '18px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 22 }}>🔄</span> Reset Password for {resetTargetUser?.username}?
            </h3>
            <p style={{ fontSize: '13px', color: theme.muted, margin: '0 0 8px' }}>
              A new strong password will be generated automatically by the system.
            </p>
            <p style={{ fontSize: '13px', color: theme.muted, margin: '0 0 20px' }}>
              The user will be required to change their password on next login.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => { setShowResetConfirmModal(false); setResetTargetUser(null); }} style={commonStyles.button(theme, 'secondary')}>Cancel</button>
              <button type="button" onClick={handleConfirmResetPassword} style={commonStyles.button(theme, 'primary')}>Reset Password</button>
            </div>
          </div>
        </div>
      )}

      {/* Generic Confirm Delete Modal */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 12, padding: '32px 28px', width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.4)', animation: 'pageEnter 0.2s ease-out forwards' }}
               onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setConfirmDelete(null); }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '18px' }}>Confirm</h3>
            <p style={{ fontSize: '14px', color: theme.text, margin: '0 0 24px' }}>{confirmDelete.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setConfirmDelete(null)} style={commonStyles.button(theme, 'secondary')}>Cancel</button>
              <button type="button" onClick={confirmDelete.onConfirm} style={{ ...commonStyles.button(theme, 'primary'), backgroundColor: theme.red, borderColor: theme.red }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
