/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { ThemeTokens, commonStyles } from '../theme';
import { AppState, CustomField, Project, Squad, User, UserPermissions } from '../types';
import { exportToCSV, generateId, getPermissionsForRole, hashPassword, sanitise } from '../utils';
import { Field } from './Shared';
import { PermissionsTable } from './PermissionsTable';
import { Plus, Trash2, Shield, UserX, UserCheck, Key, Settings as SettingsIcon, X } from 'lucide-react';

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
  // Tabs: "users" | "projects" | "squads" | "fields"
  const [activeTab, setActiveTab] = useState<'users' | 'projects' | 'squads' | 'fields' | 'audit'>('users');

  // Input states for My Account
  const [editAccountForm, setEditAccountForm] = useState({
    username: currentUser.username,
    password: '',
    confirmPassword: '',
  });
  const [accountErrors, setAccountErrors] = useState<Record<string, string>>({});
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [resetPasswordForm, setResetPasswordForm] = useState({ password: '', confirm: '' });
  const [resetPasswordErrors, setResetPasswordErrors] = useState<Record<string, string>>({});
  const [auditFilters, setAuditFilters] = useState({ user: '', action: '', from: '', to: '' });
  const updateAccountForm = (key: keyof typeof editAccountForm, value: string) => {
    setEditAccountForm(previous => ({ ...previous, [key]: value }));
    setAccountErrors(previous => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  };

  // Input states for Users
  const [userForm, setUserForm] = useState({
    username: '',
    password: '',
    role: 'member' as User['role'],
    squadId: '',
    projectId: '',
    reportsTo: '',
    jobTitle: '',
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
    if (userForm.role === 'admin') {
      return appState.users
        .filter(user => user.role === 'superadmin')
        .map(user => ({ value: user.id, label: user.username }));
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
    ? ['superadmin', 'admin', 'lead', 'member']
    : isAdmin ? ['lead', 'member'] : [];

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
    if (!userForm.password) nextErrors.password = 'Password is required.';
    else if (userForm.password.length < 8) nextErrors.password = 'Password must be at least 8 characters.';
    else if (!/[A-Z]/.test(userForm.password)) nextErrors.password = 'Password must include an uppercase letter.';
    else if (!/\d/.test(userForm.password)) nextErrors.password = 'Password must include a number.';
    if (!userForm.role || !allowedRoles.includes(userForm.role)) nextErrors.role = 'Role is required.';
    if ((userForm.role === 'lead' || userForm.role === 'member') && !(isAdmin ? currentUser.projectId : userForm.projectId)) nextErrors.projectId = 'Project is required.';
    if (userForm.role === 'member' && !userForm.squadId) nextErrors.squadId = 'Squad is required.';
    if (userForm.role !== 'superadmin' && !userForm.reportsTo) nextErrors.reportsTo = 'Direct manager is required.';
    setUserErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const projectId = userForm.role === 'superadmin'
      ? null
      : (isAdmin ? currentUser.projectId : userForm.projectId);
    const squadId = userForm.role === 'member'
      ? userForm.squadId
      : null;

    const newUser: User = {
      id: generateId(),
      username: sanitise(userForm.username.trim()),
      password: await hashPassword(userForm.password.trim()),
      role: userForm.role,
      squadId,
      projectId,
      permissions: userForm.role === 'superadmin' ? getPermissionsForRole('superadmin') : userPermissions,
      createdBy: currentUser.id,
      createdByRole: currentUser.role,
      mustChangePassword: true,
      loginCount: 0,
      failedLoginAttempts: 0,
      lockedUntil: null,
      reportsTo: userForm.role === 'superadmin' ? null : userForm.reportsTo,
      directReports: [],
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
        notifications: [{
          id: generateId(),
          message: `${newUser.username} has been added as your direct report.`,
          read: false,
          createdAt: new Date().toISOString(),
          type: 'info' as const,
          link: 'teamStructure',
        }, ...(user.notifications || [])].slice(0, 50),
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
      password: '',
      role: 'member',
      squadId: '',
      projectId: isAdmin ? (currentUser.projectId || '') : '',
      reportsTo: '',
      jobTitle: '',
    });
    setUserPermissions(getPermissionsForRole('member'));

    showToast(`User ${newUser.username} added successfully!`, 'success');
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

  const validatePasswordPair = (password: string, confirm: string) => {
    const nextErrors: Record<string, string> = {};
    if (!password) nextErrors.password = 'New Password is required.';
    else if (password.length < 8) nextErrors.password = 'Password must be at least 8 characters.';
    else if (!/[A-Z]/.test(password)) nextErrors.password = 'Password must include an uppercase letter.';
    else if (!/\d/.test(password)) nextErrors.password = 'Password must include a number.';
    if (!confirm) nextErrors.confirm = 'Confirm Password is required.';
    else if (password !== confirm) nextErrors.confirm = 'Passwords do not match.';
    return nextErrors;
  };

  const handleResetPassword = (userId: string) => {
    const target = appState.users.find(u => u.id === userId);
    if (!target || (!isSuperAdmin && (target.role === 'admin' || target.role === 'superadmin'))) return;
    setResetPasswordUser(target);
    setResetPasswordForm({ password: '', confirm: '' });
    setResetPasswordErrors({});
  };

  const handleSaveResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!resetPasswordUser) return;
    const nextErrors = validatePasswordPair(resetPasswordForm.password, resetPasswordForm.confirm);
    setResetPasswordErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const password = await hashPassword(resetPasswordForm.password.trim());
    setAppState((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === resetPasswordUser.id ? {
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
        details: `Reset password for ${resetPasswordUser.username}`,
        ipHint: 'Browser session',
      }, ...(prev.auditLog || [])].slice(0, 500),
    }));
    setResetPasswordUser(null);
    setResetPasswordForm({ password: '', confirm: '' });
    showToast('Password reset successful.', 'success');
  };

  const handleRemoveUser = (userId: string) => {
    const target = appState.users.find(u => u.id === userId);
    if (userId === 'superadmin' || userId === currentUser.id || !target ||
      (!isSuperAdmin && (target.role === 'admin' || target.role === 'superadmin'))) {
      showToast('This account cannot be deleted.', 'error');
      return;
    }

    if (confirm('Are you sure you want to delete this user?')) {
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
    }
  };

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
    if (confirm('Removing this project will invalidate existing metrics referencing it. Proceed?')) {
      setAppState((prev) => ({
        ...prev,
        projects: prev.projects.filter((p) => p.id !== id),
      }));
      showToast('Project removed.', 'success');
    }
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
    if (confirm('Removing this Squad will invalidate existing metrics referencing it. Proceed?')) {
      setAppState((prev) => ({
        ...prev,
        squads: prev.squads.filter((s) => s.id !== id),
      }));
      showToast('Squad removed.', 'success');
    }
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
    if (confirm('Are you sure you want to delete this custom field?')) {
      setAppState((prev) => ({
        ...prev,
        customFields: prev.customFields.filter((cf) => cf.id !== id),
      }));
      showToast('Custom field removed.', 'success');
    }
  };

  const handleUpdateMyAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const newUsername = sanitise(editAccountForm.username.trim());
    const newPassword = editAccountForm.password;
    const confirmPassword = editAccountForm.confirmPassword;

    const nextErrors: Record<string, string> = {};
    if (!newUsername) nextErrors.username = 'Username is required.';
    else if (appState.users.some((u) => u.id !== currentUser.id && u.username.toLowerCase() === newUsername.toLowerCase())) nextErrors.username = 'Username is already taken.';
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
        {(['users', ...(isSuperAdmin ? ['projects'] : []), 'squads', 'fields', ...(isSuperAdmin ? ['audit'] : [])] as const).map((tab) => (
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
            {tab === 'fields' ? 'Custom Fields' : tab === 'audit' ? 'Audit Log' : tab}
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
              <Field label="Password" type="password" placeholder="Password value" value={userForm.password} onChange={(v) => updateUserForm('password', v)} error={userErrors.password} required theme={theme} />
              
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
                  label: role === 'superadmin' ? 'Super Admin' : role.charAt(0).toUpperCase() + role.slice(1)
                }))}
                required
                error={userErrors.role}
                theme={theme}
              />

              {(userForm.role === 'lead' || userForm.role === 'member') && <Field
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

              {userForm.role === 'member' && <Field
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

              {userForm.role !== 'superadmin' && <Field
                label="Reports To (Direct Manager)"
                type="select"
                value={userForm.reportsTo}
                onChange={(v) => updateUserForm('reportsTo', v)}
                options={reportsToOptions}
                placeholder={reportsToOptions.length ? 'Select manager' : 'No eligible managers'}
                required
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

              <div style={{ gridColumn: '1 / -1', marginTop: '12px' }}>
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
              </div>

              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
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
                            <span style={{ textTransform: 'capitalize', fontWeight: u.role === 'superadmin' || u.role === 'admin' ? 700 : 'normal' }}>
                              {u.role === 'superadmin' ? 'Super Admin' : u.role}
                            </span>
                          </td>
                          <td style={commonStyles.td(theme)}>{squadMap.get(u.squadId || '') || '—'}</td>
                          {isSuperAdmin && <td style={commonStyles.td(theme)}>{projectMap.get(u.projectId || '') || 'All Projects'}</td>}
                          <td style={commonStyles.td(theme)}>
                            {renderPermissionsSummary(u)}
                          </td>
                          <td style={commonStyles.td(theme)}>
                            {u.id !== 'superadmin' && canEditSettings ? (
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {u.role !== 'superadmin' && (isSuperAdmin || (u.role !== 'admin' && u.role !== 'superadmin')) && <button
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
                            <td colSpan={isSuperAdmin ? 6 : 5} style={{ ...commonStyles.td(theme), backgroundColor: `${theme.inputBg}cc`, padding: '16px' }}>
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

      {resetPasswordUser && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(15,23,42,0.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px', animation: 'modalBackdropIn 160ms ease-out' }}>
          <form noValidate onSubmit={handleSaveResetPassword} style={{ ...commonStyles.card(theme), width: '100%', maxWidth: '440px', padding: '28px', animation: 'modalPanelIn 180ms ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, fontSize: '18px' }}>Reset Password for {resetPasswordUser.username}</h3>
              <button type="button" onClick={() => setResetPasswordUser(null)} style={{ border: 0, background: 'transparent', color: theme.muted, cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'grid', gap: '14px' }}>
              <Field
                label="New Password"
                type="password"
                value={resetPasswordForm.password}
                onChange={(value) => {
                  setResetPasswordForm(previous => ({ ...previous, password: value }));
                  setResetPasswordErrors(previous => ({ ...previous, password: '' }));
                }}
                error={resetPasswordErrors.password}
                required
                theme={theme}
              />
              {resetPasswordForm.password && (
                <div style={{ color: resetPasswordForm.password.length >= 12 && /[A-Z]/.test(resetPasswordForm.password) && /\d/.test(resetPasswordForm.password) ? theme.green : resetPasswordForm.password.length >= 8 && /[A-Z]/.test(resetPasswordForm.password) && /\d/.test(resetPasswordForm.password) ? theme.amber : theme.red, fontSize: '11px', fontWeight: 700, marginTop: '-8px' }}>
                  Strength: {resetPasswordForm.password.length >= 12 && /[A-Z]/.test(resetPasswordForm.password) && /\d/.test(resetPasswordForm.password) ? 'Strong' : resetPasswordForm.password.length >= 8 && /[A-Z]/.test(resetPasswordForm.password) && /\d/.test(resetPasswordForm.password) ? 'Fair' : 'Weak'}
                </div>
              )}
              <Field
                label="Confirm Password"
                type="password"
                value={resetPasswordForm.confirm}
                onChange={(value) => {
                  setResetPasswordForm(previous => ({ ...previous, confirm: value }));
                  setResetPasswordErrors(previous => ({ ...previous, confirm: '' }));
                }}
                error={resetPasswordErrors.confirm}
                required
                theme={theme}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button type="button" onClick={() => setResetPasswordUser(null)} style={commonStyles.button(theme, 'secondary')}>Cancel</button>
              <button type="submit" style={commonStyles.button(theme, 'primary')}>Save</button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
