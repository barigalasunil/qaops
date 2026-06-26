/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { ThemeTokens, commonStyles } from '../theme';
import { AppState, User } from '../types';

interface TeamStructureProps {
  currentUser: User;
  appState: AppState;
  theme: ThemeTokens;
}

const roleColor: Record<User['role'], string> = {
  superadmin: '#f59e0b',
  admin: '#6366f1',
  lead: '#3b82f6',
  member: '#22c55e',
};

export function TeamStructure({ currentUser, appState, theme }: TeamStructureProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const projectMap = useMemo(() => new Map(appState.projects.map(project => [project.id, project.name])), [appState.projects]);
  const squadMap = useMemo(() => new Map(appState.squads.map(squad => [squad.id, squad.name])), [appState.squads]);
  const today = new Date().toISOString().slice(0, 10);

  const scopedUsers = useMemo(() => {
    if (currentUser.role === 'superadmin') return appState.users;
    if (currentUser.role === 'admin') return appState.users.filter(user => user.projectId === currentUser.projectId || user.id === currentUser.id || user.role === 'superadmin');
    if (currentUser.role === 'lead') return appState.users.filter(user => user.id === currentUser.id || user.reportsTo === currentUser.id || (currentUser.directReports || []).includes(user.id));
    return [];
  }, [appState.users, currentUser]);

  const scopedIds = new Set(scopedUsers.map(user => user.id));
  const childrenFor = (userId: string) => scopedUsers.filter(user => user.reportsTo === userId && scopedIds.has(user.id));
  const roots = scopedUsers.filter(user => {
    if (currentUser.role === 'lead') return user.id === currentUser.id;
    if (user.role === 'superadmin') return true;
    return !user.reportsTo || !scopedIds.has(user.reportsTo);
  });
  const orphans = scopedUsers.filter(user => user.role !== 'superadmin' && !user.reportsTo);

  const statusFor = (user: User) => {
    const entry = appState.timesheetEntries.find(item => item.userId === user.id && item.month === today.slice(0, 7));
    const day = entry?.workingDays.find(item => item.date === today);
    const status = day?.isStatusSet ? day.status : 'Unknown';
    const color = status === 'Working' || status === 'WFH' ? '#22c55e' : status === 'Leave' || status === 'Holiday' ? '#ef4444' : '#64748b';
    return { status, color };
  };

  const matches = (user: User) => !query || `${user.username} ${user.jobTitle || ''}`.toLowerCase().includes(query.toLowerCase());
  const toggle = (id: string) => setCollapsed(previous => {
    const next = new Set(previous);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const renderNode = (user: User, depth = 0): React.ReactNode => {
    const children = childrenFor(user.id);
    const isCollapsed = collapsed.has(user.id);
    const status = statusFor(user);
    const match = matches(user);
    const manager = appState.users.find(item => item.id === user.reportsTo);
    const tooltip = `${user.username} | ${user.role} | ${squadMap.get(user.squadId || '') || 'No squad'} | ${projectMap.get(user.projectId || '') || 'All projects'} | Reports to ${manager?.username || 'nobody'} | ${children.length} direct reports`;
    return (
      <div key={user.id} style={{ marginLeft: depth ? '28px' : 0, position: 'relative' }}>
        {depth > 0 && <div style={{ position: 'absolute', left: '-16px', top: 0, bottom: 0, borderLeft: `1px solid ${theme.border}` }} />}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: '8px', marginBottom: '9px' }}>
          {children.length ? (
            <button type="button" onClick={() => toggle(user.id)} style={{ border: 0, background: 'transparent', color: theme.muted, cursor: 'pointer', padding: '4px' }}>
              {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
            </button>
          ) : <span style={{ width: '24px' }} />}
          <div title={tooltip} style={{ opacity: query && !match ? 0.38 : 1, border: `1px solid ${match && query ? theme.blue : theme.border}`, borderRadius: '8px', backgroundColor: theme.surface, padding: '10px', minWidth: '280px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div style={{ position: 'relative', width: '34px', height: '34px', borderRadius: '50%', backgroundColor: roleColor[user.role], color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 900 }}>
                {user.username.slice(0, 1).toUpperCase()}
                <span style={{ position: 'absolute', right: '-1px', bottom: '-1px', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: status.color, border: `2px solid ${theme.surface}` }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900, fontSize: '13px' }}>{user.username}</div>
                <div style={{ color: theme.muted, fontSize: '11px' }}>{user.jobTitle || 'No title set'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '8px' }}>
              <span style={commonStyles.badge(theme, roleColor[user.role])}>{user.role === 'superadmin' ? 'Super Admin' : user.role}</span>
              <span style={commonStyles.badge(theme, theme.indigo)}>{squadMap.get(user.squadId || '') || 'No squad'}</span>
              <span style={commonStyles.badge(theme, theme.blue)}>{projectMap.get(user.projectId || '') || 'All projects'}</span>
              <span style={commonStyles.badge(theme, status.color)}>{status.status}</span>
            </div>
          </div>
        </div>
        {!isCollapsed && children.map(child => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <div style={{ ...commonStyles.card(theme), display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: '18px' }}>Team Structure</h2>
          <div style={{ color: theme.muted, fontSize: '12px' }}>Reporting hierarchy and today's availability</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '9px', top: '9px', color: theme.muted }} />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search people" style={{ ...commonStyles.input(theme), paddingLeft: '30px', width: '220px' }} />
          </label>
          <button type="button" onClick={() => setCollapsed(new Set())} style={commonStyles.button(theme, 'secondary', 'sm')}>Expand All</button>
          <button type="button" onClick={() => setCollapsed(new Set(scopedUsers.map(user => user.id)))} style={commonStyles.button(theme, 'secondary', 'sm')}>Collapse All</button>
        </div>
      </div>
      <section style={commonStyles.card(theme)}>
        <div style={{ overflowX: 'auto', padding: '4px' }}>
          {roots.length ? roots.map(root => renderNode(root)) : <div style={{ color: theme.muted, padding: '18px' }}>No reporting tree found.</div>}
        </div>
      </section>
      {orphans.length > 0 && (
        <section style={commonStyles.card(theme)}>
          <h3 style={{ margin: '0 0 10px', fontSize: '15px' }}>Unassigned - no reporting line set</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {orphans.map(user => <span key={user.id} title="Assign a direct manager in Settings" style={commonStyles.badge(theme, theme.amber)}>{user.username} · {user.role}</span>)}
          </div>
        </section>
      )}
    </div>
  );
}
