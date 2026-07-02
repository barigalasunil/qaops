/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Megaphone, Plus, Trash2, Clock, Users, Globe, Filter, X, Check, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { ThemeTokens, commonStyles } from '../theme';
import { AppState, User, Announcement, AuditLogEntry } from '../types';
import { generateId, sanitise } from '../utils';
import { Badge } from './Shared';

interface AnnouncementsProps {
  currentUser: User;
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  showToast: (msg: string, type: 'success' | 'error' | 'warning') => void;
  theme: ThemeTokens;
}

const ALL_ROLES: User['role'][] = ['superadmin', 'admin', 'lead', 'member', 'guest'];

const ROLE_BADGE_COLOR: Record<User['role'], string> = {
  superadmin: '#f59e0b',
  admin: '#6366f1',
  lead: '#3b82f6',
  member: '#22c55e',
  guest: '#94a3b8',
};

export function Announcements({ currentUser, appState, setAppState, showToast, theme }: AnnouncementsProps) {
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [activeTab, setActiveTab] = useState<'active' | 'past'>('active');
  const [form, setForm] = useState({
    title: '',
    message: '',
    type: 'info' as Announcement['type'],
    targetRoles: [...ALL_ROLES] as User['role'][],
    projectId: '',
    expiresAt: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const updateForm = (key: keyof typeof form, value: any) => {
    setForm(previous => ({ ...previous, [key]: value }));
    setErrors(previous => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  };

  const announcements = appState.announcements || [];

  const activeAnnouncements = useMemo(() => (
    announcements.filter(a => !a.expiresAt || a.expiresAt >= today)
      .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())
  ), [announcements, today]);

  const pastAnnouncements = useMemo(() => (
    announcements.filter(a => a.expiresAt && a.expiresAt < today)
      .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())
  ), [announcements, today]);

  const currentList = activeTab === 'active' ? activeAnnouncements : pastAnnouncements;

  const getTypeIcon = (type: Announcement['type']) => {
    switch (type) {
      case 'info': return Megaphone;
      case 'warning': return AlertTriangle;
      case 'success': return Check;
      case 'alert': return AlertCircle;
    }
  };

  const getTypeColor = (type: Announcement['type']) => {
    switch (type) {
      case 'info': return theme.blue;
      case 'warning': return theme.amber;
      case 'success': return theme.green;
      case 'alert': return theme.red;
    }
  };

  const handleRoleToggle = (role: User['role']) => {
    const next = form.targetRoles.includes(role)
      ? form.targetRoles.filter(r => r !== role)
      : [...form.targetRoles, role];
    updateForm('targetRoles', next);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.title.trim()) nextErrors.title = 'Title is required.';
    if (!form.message.trim()) nextErrors.message = 'Message is required.';
    if (form.targetRoles.length === 0) nextErrors.targetRoles = 'At least one target role is required.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const announcement: Announcement = {
      id: generateId(),
      title: sanitise(form.title.trim()),
      message: sanitise(form.message.trim()),
      type: form.type,
      postedBy: currentUser.id,
      postedByName: currentUser.username,
      postedAt: new Date().toISOString(),
      expiresAt: form.expiresAt || null,
      targetRoles: form.targetRoles,
      projectId: form.projectId || null,
    };

    setAppState(previous => ({
      ...previous,
      announcements: [...(previous.announcements || []), announcement],
      auditLog: [{
        id: generateId(),
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        username: currentUser.username,
        role: currentUser.role,
        action: 'ANNOUNCEMENT_ADD',
        details: `Added announcement: ${announcement.title}`,
        ipHint: 'Browser session',
      }, ...(previous.auditLog || [])].slice(0, 500),
    }));

    setForm({
      title: '',
      message: '',
      type: 'info',
      targetRoles: [...ALL_ROLES],
      projectId: '',
      expiresAt: '',
    });
    showToast('Announcement posted.', 'success');
  };

  const handleDelete = (id: string) => {
    const target = announcements.find(a => a.id === id);
    if (!target) return;
    setConfirmDeleteId(id);
  };

  const handleConfirmDelete = () => {
    const id = confirmDeleteId;
    if (!id) return;
    setAppState(previous => ({
      ...previous,
      announcements: (previous.announcements || []).filter(a => a.id !== id),
      auditLog: [{
        id: generateId(),
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        username: currentUser.username,
        role: currentUser.role,
        action: 'ANNOUNCEMENT_DELETE',
        details: `Deleted announcement: #${id}`,
        ipHint: 'Browser session',
      }, ...(previous.auditLog || [])].slice(0, 500),
    }));
    showToast('Announcement deleted.', 'success');
    setConfirmDeleteId(null);
  };

  const canDelete = currentUser.role === 'superadmin' || currentUser.role === 'admin';

  const formatDateStr = (str: string) => {
    const d = new Date(str);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={commonStyles.card(theme)}>
        <h3 style={{ margin: '0 0 14px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Megaphone size={18} style={{ color: theme.blue }} />
          Post Announcement
        </h3>
        <form noValidate onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', alignItems: 'end' }}>
            <div>
              <label style={commonStyles.label(theme)}>Title <span style={{ color: theme.red }}>*</span></label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => updateForm('title', e.target.value)}
                required
                style={{
                  ...commonStyles.input(theme),
                  borderColor: errors.title ? '#ef4444' : theme.border,
                }}
              />
              {errors.title && <span style={{ color: '#ef4444', fontSize: '11px', marginTop: '3px' }}>{errors.title}</span>}
            </div>
            <div>
              <label style={commonStyles.label(theme)}>Type <span style={{ color: theme.red }}>*</span></label>
              <select
                value={form.type}
                onChange={(e) => updateForm('type', e.target.value as Announcement['type'])}
                style={commonStyles.select(theme, true)}
              >
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="success">Success</option>
                <option value="alert">Alert</option>
              </select>
            </div>
            <div>
              <label style={commonStyles.label(theme)}>Expires At</label>
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => updateForm('expiresAt', e.target.value)}
                style={commonStyles.input(theme)}
              />
            </div>
            {currentUser.role === 'superadmin' && (
              <div>
                <label style={commonStyles.label(theme)}>Project Scope</label>
                <select
                  value={form.projectId}
                  onChange={(e) => updateForm('projectId', e.target.value)}
                  style={commonStyles.select(theme, true)}
                >
                  <option value="">All Projects</option>
                  {appState.projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div>
            <label style={commonStyles.label(theme)}>Message <span style={{ color: theme.red }}>*</span></label>
            <textarea
              value={form.message}
              onChange={(e) => updateForm('message', e.target.value)}
              rows={3}
              required
              style={{
                ...commonStyles.input(theme),
                resize: 'vertical',
                minHeight: '60px',
                fontFamily: 'inherit',
                borderColor: errors.message ? '#ef4444' : theme.border,
              }}
            />
            {errors.message && <span style={{ color: '#ef4444', fontSize: '11px', marginTop: '3px' }}>{errors.message}</span>}
          </div>
          <div>
            <label style={commonStyles.label(theme)}>Target Roles <span style={{ color: theme.red }}>*</span></label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
              {ALL_ROLES.map(role => (
                <label
                  key={role}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 10px',
                    borderRadius: '999px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    backgroundColor: form.targetRoles.includes(role) ? `${ROLE_BADGE_COLOR[role]}1a` : 'transparent',
                    color: form.targetRoles.includes(role) ? ROLE_BADGE_COLOR[role] : theme.muted,
                    border: `1px solid ${form.targetRoles.includes(role) ? `${ROLE_BADGE_COLOR[role]}33` : theme.border}`,
                    transition: 'all 0.15s ease',
                    userSelect: 'none' as const,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.targetRoles.includes(role)}
                    onChange={() => handleRoleToggle(role)}
                    style={{ margin: 0, width: '12px', height: '12px', accentColor: ROLE_BADGE_COLOR[role] }}
                  />
                  {role}
                </label>
              ))}
            </div>
            {errors.targetRoles && <span style={{ color: '#ef4444', fontSize: '11px', marginTop: '3px' }}>{errors.targetRoles}</span>}
          </div>
          <button type="submit" style={{ ...commonStyles.button(theme, 'primary'), alignSelf: 'flex-start' }}>
            <Plus size={16} />
            Post Announcement
          </button>
        </form>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '4px' }}>
        <button
          onClick={() => setActiveTab('active')}
          style={{
            ...commonStyles.button(theme, activeTab === 'active' ? 'primary' : 'secondary'),
            flex: 1,
          }}
        >
          <Megaphone size={14} />
          Active ({activeAnnouncements.length})
        </button>
        <button
          onClick={() => setActiveTab('past')}
          style={{
            ...commonStyles.button(theme, activeTab === 'past' ? 'primary' : 'secondary'),
            flex: 1,
          }}
        >
          <Clock size={14} />
          Past ({pastAnnouncements.length})
        </button>
      </div>

      {currentList.length === 0 ? (
        <div style={{ ...commonStyles.card(theme), textAlign: 'center', padding: '28px', color: theme.muted, fontSize: '13px' }}>
          No {activeTab} announcements.
        </div>
      ) : currentList.map(announcement => {
        const Icon = getTypeIcon(announcement.type);
        const typeColor = getTypeColor(announcement.type);
        return (
          <div
            key={announcement.id}
            style={{
              ...commonStyles.card(theme),
              borderLeft: `4px solid ${typeColor}`,
            }}
          >
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  backgroundColor: `${typeColor}1a`,
                  color: typeColor,
                  flexShrink: 0,
                }}
              >
                <Icon size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: theme.text }}>
                    {announcement.title}
                  </h4>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(announcement.id)}
                      title="Delete announcement"
                      style={{ border: 0, background: 'transparent', color: theme.red, cursor: 'pointer', padding: '4px', flexShrink: 0 }}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <p style={{ margin: '6px 0', fontSize: '12px', color: theme.text, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {announcement.message}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginTop: '8px', fontSize: '11px', color: theme.muted }}>
                  <span>Posted by <strong style={{ color: theme.text }}>{announcement.postedByName}</strong></span>
                  <span>·</span>
                  <span>{formatDateStr(announcement.postedAt)}</span>
                  {announcement.expiresAt && (
                    <>
                      <span>·</span>
                      <Clock size={11} />
                      <span>Expires {formatDateStr(announcement.expiresAt)}</span>
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px', alignItems: 'center' }}>
                  <Users size={11} style={{ color: theme.muted }} />
                  {announcement.targetRoles.map(role => (
                    <span key={role}><Badge label={role} colorHex={ROLE_BADGE_COLOR[role]} theme={theme} /></span>
                  ))}
                  {announcement.projectId && (
                    <Badge
                      label={appState.projects.find(p => p.id === announcement.projectId)?.name || announcement.projectId}
                      colorHex={theme.indigo}
                      theme={theme}
                    />
                  )}
                  {!announcement.projectId && (
                    <Badge label="All Projects" colorHex={theme.indigo} theme={theme} />
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      {confirmDeleteId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 12, padding: '32px 28px', width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '18px' }}>Delete Announcement?</h3>
            <p style={{ fontSize: '14px', color: theme.text, margin: '0 0 24px' }}>Are you sure you want to delete this announcement? This cannot be undone.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setConfirmDeleteId(null)} style={commonStyles.button(theme, 'secondary')}>Cancel</button>
              <button type="button" onClick={handleConfirmDelete} style={{ ...commonStyles.button(theme, 'primary'), backgroundColor: theme.red, borderColor: theme.red }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
