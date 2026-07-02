/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { ThemeTokens, commonStyles } from '../theme';
import { AppState, Defect as IDefect, User } from '../types';
import { generateId, formatDate, sanitise } from '../utils';
import { Field, FilterBar, Badge, ViewOnlyBanner } from './Shared';
import { Plus, Trash2, HelpCircle, ExternalLink } from 'lucide-react';

interface DefectsProps {
  currentUser: User;
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  showToast: (msg: string, type: 'success' | 'error' | 'warning', duration?: number) => void;
  theme: ThemeTokens;
  readOnly?: boolean;
}

export function Defects({ currentUser, appState, setAppState, showToast, theme, readOnly = false }: DefectsProps) {
  const isMember = currentUser.role === 'member';
  const statusOptions: IDefect['status'][] = ['Open', 'In Progress', 'Re-Opened', 'Resolved', 'Closed'];

  // Filters state (for Leads / Admins)
  const [filters, setFilters] = useState({
    projectId: '',
    squadId: '',
    release: '',
    month: '',
  });

  // Form State
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    jiraCreatedDate: new Date().toISOString().split('T')[0],
    release: '',
    projectId: currentUser.projectId || '',
    squadId: currentUser.squadId || '',
    jiraDefectLink: '',
    jiraDefectSummary: '',
    priority: 'P2' as 'P1' | 'P2' | 'P3',
    status: 'Open' as 'Open' | 'In Progress' | 'Re-Opened' | 'Resolved' | 'Closed',
    resolvedDate: '',
    sitMiss: false,
    storyLink: '',
    storySummary: '',
    notes: '',
    sprintId: '',
    sprintName: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newRowId, setNewRowId] = useState<string | null>(null);
  const [statusEdit, setStatusEdit] = useState<{ id: string; status: IDefect['status']; resolvedDate: string } | null>(null);
  const [confirmDeleteDefectId, setConfirmDeleteDefectId] = useState<string | null>(null);
  const updateForm = (key: keyof typeof form, value: any, extras: Partial<typeof form> = {}) => {
    setForm(previous => ({ ...previous, [key]: value, ...extras }));
    setErrors(previous => {
      const next = { ...previous };
      delete next[key];
      Object.keys(extras).forEach(extraKey => delete next[extraKey]);
      return next;
    });
  };

  // Custom Fields (appliesTo: "defect" | "both")
  const activeCustomFields = useMemo(() => {
    return appState.customFields.filter(f => f.appliesTo === 'defect' || f.appliesTo === 'both');
  }, [appState.customFields]);

  const [customFormVals, setCustomFormVals] = useState<Record<string, any>>({});

  const handleCustomFieldChange = (fieldId: string, val: any) => {
    setCustomFormVals(prev => ({ ...prev, [fieldId]: val }));
  };

  // Filtered Defects list
  const visibleDefects = useMemo(() => {
    let list = [...appState.defects];

    if (isMember) {
      list = list.filter((d) => d.addedBy === currentUser.id);
    } else {
      if (filters.projectId) {
        list = list.filter((d) => d.projectId === filters.projectId);
      }
      if (filters.squadId) {
        list = list.filter((d) => d.squadId === filters.squadId);
      }
      if (filters.release) {
        list = list.filter((d) => d.release === filters.release);
      }
      if (filters.month) {
        list = list.filter((d) => d.date && d.date.substring(0, 7) === filters.month);
      }
    }

    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [appState.defects, currentUser.id, isMember, filters]);

  // Options lists
  const projectOptions = useMemo(() => {
    return appState.projects.map(p => ({ value: p.id, label: p.name }));
  }, [appState.projects]);

  const squadOptions = useMemo(() => {
    return appState.squads
      .filter(s => !form.projectId || !s.projectId || s.projectId === form.projectId)
      .map(s => ({ value: s.id, label: s.name }));
  }, [appState.squads, form.projectId]);

  // Lookup maps
  const projectMap = useMemo(() => new Map(appState.projects.map(p => [p.id, p.name])), [appState.projects]);
  const squadMap = useMemo(() => new Map(appState.squads.map(s => [s.id, s.name])), [appState.squads]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.date) nextErrors.date = 'Date is required.';
    if (!form.jiraCreatedDate) nextErrors.jiraCreatedDate = 'Date Created in Jira is required.';
    if (!form.release) nextErrors.release = 'Release is required.';
    if (!form.projectId) nextErrors.projectId = 'Project is required.';
    if (!form.squadId) nextErrors.squadId = 'Squad is required.';
    if (!form.jiraDefectLink.trim()) nextErrors.jiraDefectLink = 'Jira Defect Link is required.';
    else if (!/^https?:\/\//i.test(form.jiraDefectLink)) nextErrors.jiraDefectLink = 'Link must start with http:// or https://.';
    if (!form.jiraDefectSummary.trim()) nextErrors.jiraDefectSummary = 'Jira Defect Summary is required.';
    else if (form.jiraDefectSummary.trim().length < 3) nextErrors.jiraDefectSummary = 'Summary must be at least 3 characters.';
    if (!form.priority) nextErrors.priority = 'Priority is required.';
    if (!form.status) nextErrors.status = 'Status is required.';
    if ((form.status === 'Resolved' || form.status === 'Closed') && !form.resolvedDate) nextErrors.resolvedDate = 'Resolved Date is required.';
    if (form.storyLink && !/^https?:\/\//i.test(form.storyLink)) nextErrors.storyLink = 'Link must start with http:// or https://.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const sprintObj = (appState.sprints || []).find(s => s.id === form.sprintId);
    const newDefect: IDefect = {
      id: generateId(),
      date: form.date,
      jiraCreatedDate: form.jiraCreatedDate,
      release: sanitise(form.release.trim()),
      projectId: form.projectId,
      squadId: form.squadId,
      jiraDefectLink: form.jiraDefectLink.trim(),
      jiraDefectSummary: sanitise(form.jiraDefectSummary.trim()),
      priority: form.priority,
      status: form.status,
      resolvedDate: (form.status === 'Resolved' || form.status === 'Closed') ? form.resolvedDate : null,
      statusHistory: [{ status: form.status, changedBy: currentUser.username, changedAt: new Date().toISOString() }],
      sitMiss: form.sitMiss,
      storyLink: form.storyLink.trim() || undefined,
      storySummary: sanitise(form.storySummary.trim()) || undefined,
      notes: sanitise(form.notes.trim()),
      addedBy: currentUser.id,
      addedByName: currentUser.username,
      customFields: Object.fromEntries(Object.entries(customFormVals).map(([key, value]) => [key, sanitise(value)])),
      sprintId: form.sprintId || '',
      sprintName: sprintObj?.name || '',
    };

    setAppState((prev) => {
      const notifyUsers = prev.users.filter(user => (user.role === 'lead' && (user.squadId === newDefect.squadId || user.projectId === newDefect.projectId)) || user.role === 'admin' && user.projectId === newDefect.projectId);
      return {
        ...prev,
        defects: [...prev.defects, newDefect],
        users: prev.users.map(user => notifyUsers.some(target => target.id === user.id) ? {
          ...user,
          notifications: [{
            id: generateId(),
            message: newDefect.priority === 'P1'
              ? `P1 defect raised: ${newDefect.jiraDefectSummary}`
              : `New ${newDefect.priority} defect logged for ${newDefect.release} by ${currentUser.username}.`,
            read: false,
            createdAt: new Date().toISOString(),
            type: newDefect.priority === 'P1' ? 'alert' as const : 'info' as const,
            link: 'defects',
          }, ...(user.notifications || [])].slice(0, 50),
        } : user),
        auditLog: [{
          id: generateId(),
          timestamp: new Date().toISOString(),
          userId: currentUser.id,
          username: currentUser.username,
          role: currentUser.role,
          action: 'DEFECT_ADD',
          details: `Added ${newDefect.priority} defect ${newDefect.jiraDefectSummary}`,
          ipHint: 'Browser session',
        }, ...(prev.auditLog || [])].slice(0, 500),
      };
    });
    setNewRowId(newDefect.id);
    setTimeout(() => setNewRowId(null), 1500);

    // Reset Form
    setForm({
      date: new Date().toISOString().split('T')[0],
      jiraCreatedDate: new Date().toISOString().split('T')[0],
      release: '',
      projectId: currentUser.projectId || '',
      squadId: currentUser.squadId || '',
      jiraDefectLink: '',
      jiraDefectSummary: '',
      priority: 'P2',
      status: 'Open',
      resolvedDate: '',
      sitMiss: false,
      storyLink: '',
      storySummary: '',
      notes: '',
      sprintId: '',
      sprintName: '',
    });
    setCustomFormVals({});

    showToast('Defect logged successfully!', 'success');
  };

  const handleDelete = (id: string) => {
    setConfirmDeleteDefectId(id);
  };

  const handleConfirmDeleteDefect = () => {
    const id = confirmDeleteDefectId;
    if (!id) return;
    setAppState((prev) => ({
      ...prev,
      defects: prev.defects.filter((d) => d.id !== id),
      auditLog: [{
        id: generateId(),
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        username: currentUser.username,
        role: currentUser.role,
        action: 'DEFECT_DELETE',
        details: `Deleted defect ${id}`,
        ipHint: 'Browser session',
      }, ...(prev.auditLog || [])].slice(0, 500),
    }));
    showToast('Defect removed.', 'success');
    setConfirmDeleteDefectId(null);
  };

  const getDefectAge = (defect: IDefect) => {
    const startDate = defect.jiraCreatedDate || defect.date;
    const start = new Date(`${startDate}T00:00:00`).getTime();
    const resolved = defect.status === 'Resolved' || defect.status === 'Closed';
    const endDate = resolved && defect.resolvedDate ? defect.resolvedDate : new Date().toISOString().slice(0, 10);
    const end = new Date(`${endDate}T00:00:00`).getTime();
    const days = Math.max(0, Math.floor((end - start) / 86400000));
    const color = resolved ? theme.muted : days <= 7 ? theme.green : days <= 14 ? theme.amber : days <= 30 ? theme.orange : theme.red;
    return { days, label: resolved ? `Resolved in ${days} days` : `${days} days`, color, resolved };
  };

  const saveStatusEdit = (defect: IDefect) => {
    if (!statusEdit || statusEdit.id !== defect.id) return;
    if ((statusEdit.status === 'Resolved' || statusEdit.status === 'Closed') && !statusEdit.resolvedDate) {
      showToast('Resolved Date is required for resolved or closed defects.', 'error');
      return;
    }
    const changedAt = new Date().toISOString();
    setAppState(previous => ({
      ...previous,
      defects: previous.defects.map(item => item.id === defect.id ? {
        ...item,
        status: statusEdit.status,
        resolvedDate: (statusEdit.status === 'Resolved' || statusEdit.status === 'Closed') ? statusEdit.resolvedDate : null,
        statusHistory: [...(item.statusHistory || []), { status: statusEdit.status, changedBy: currentUser.username, changedAt }],
      } : item),
    }));
    setStatusEdit(null);
    showToast('Defect status updated.', 'success');
  };

  const hasSetupData = appState.projects.length > 0 && appState.squads.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {readOnly && <ViewOnlyBanner theme={theme} />}
      {/* Setup Warning */}
      {!hasSetupData && (
        <div style={{ padding: '16px', backgroundColor: `${theme.amber}1a`, border: `1px solid ${theme.amber}`, borderRadius: '8px', color: theme.text, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <HelpCircle size={20} style={{ color: theme.amber }} />
          <span>
            <strong>Setup Required:</strong> Add Projects and Squads under the <strong>Settings</strong> page first to begin logging defects.
          </span>
        </div>
      )}

      {/* Defect Log Form */}
      {hasSetupData && !readOnly && (
        <div style={commonStyles.card(theme)}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={18} style={{ color: theme.orange }} />
            Log Defect
          </h3>
          <form noValidate onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <Field label="Defect Date" type="date" value={form.date} onChange={(v) => updateForm('date', v)} error={errors.date} required theme={theme} />
            <div>
              <Field label="Date Created in Jira" type="date" value={form.jiraCreatedDate} onChange={(v) => updateForm('jiraCreatedDate', v)} error={errors.jiraCreatedDate} required theme={theme} />
              <div style={{ color: theme.muted, fontSize: '11px', marginTop: '3px' }}>When was this defect originally raised in Jira?</div>
            </div>
            <Field
              label="Release"
              type="select"
              value={form.release}
              onChange={(v) => updateForm('release', v)}
              options={(appState.releaseNames || []).map((r) => ({ value: r.name, label: r.name }))}
              placeholder={(!appState.releaseNames || appState.releaseNames.length === 0) ? "No releases — add in Settings first" : "— Select Release —"}
              disabled={!appState.releaseNames || appState.releaseNames.length === 0}
              required
              error={errors.release}
              theme={theme}
            />
            {(!appState.releaseNames || appState.releaseNames.length === 0) && (
              <p style={{ gridColumn: '1 / -1', margin: '-10px 0 0', color: theme.muted, fontSize: '12px' }}>
                Go to Cycles → Release Names to add release names first.
              </p>
            )}

            <Field
              label="Sprint"
              type="select"
              value={form.sprintId || ''}
              onChange={(v) => updateForm('sprintId', v, { sprintName: v ? (appState.sprints || []).find(s => s.id === v)?.name || '' : '' })}
              options={(appState.sprints || []).sort((a, b) => b.startDate.localeCompare(a.startDate)).map(s => {
                const label = `${s.name} (${new Date(s.startDate+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${new Date(s.endDate+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})})`;
                return { value: s.id, label };
              })}
              placeholder="— No Sprint —"
              theme={theme}
            />

            <Field
              label="Project"
              type="select"
              value={form.projectId}
              onChange={(v) => updateForm('projectId', v, { squadId: '' })}
              options={projectOptions}
              placeholder="Select Project"
              required
              error={errors.projectId}
              theme={theme}
            />

            <Field
              label="Squad"
              type="select"
              value={form.squadId}
              onChange={(v) => updateForm('squadId', v)}
              options={squadOptions}
              placeholder="Select Squad"
              required
              error={errors.squadId}
              theme={theme}
            />

            <Field label="Jira Defect Link" type="text" placeholder="https://jira.company.com/browse/BUG-456" value={form.jiraDefectLink} onChange={(v) => updateForm('jiraDefectLink', v)} error={errors.jiraDefectLink} required theme={theme} />
            <Field label="Jira Defect Summary / Title" type="text" placeholder="e.g. Payment failed on checkout with stripe" value={form.jiraDefectSummary} onChange={(v) => updateForm('jiraDefectSummary', v)} error={errors.jiraDefectSummary} required theme={theme} />
            
            <Field
              label="Priority"
              type="select"
              value={form.priority}
              onChange={(v) => updateForm('priority', v)}
              options={[
                { value: 'P1', label: 'P1 - Critical / Blocker' },
                { value: 'P2', label: 'P2 - High' },
                { value: 'P3', label: 'P3 - Medium / Low' }
              ]}
              required
              error={errors.priority}
              theme={theme}
            />

            <Field
              label="Status"
              type="select"
              value={form.status}
              onChange={(v) => updateForm('status', v, (v === 'Resolved' || v === 'Closed') ? {} : { resolvedDate: '' })}
              options={statusOptions.map(status => ({ value: status, label: status }))}
              required
              error={errors.status}
              theme={theme}
            />
            {(form.status === 'Resolved' || form.status === 'Closed') && (
              <Field label="Resolved Date" type="date" value={form.resolvedDate} onChange={(v) => updateForm('resolvedDate', v)} error={errors.resolvedDate} required theme={theme} />
            )}

            <div style={{ display: 'flex', alignItems: 'center', height: '100%', paddingTop: '20px' }}>
              <Field
                label="⚠ Mark as SIT Miss"
                type="checkbox"
                value={form.sitMiss}
                onChange={(v) => setForm(f => ({ ...f, sitMiss: v }))}
                theme={theme}
              />
            </div>

            <Field label="Related Story Link (Optional)" type="text" placeholder="https://jira.company.com/browse/STORY-123" value={form.storyLink} onChange={(v) => updateForm('storyLink', v)} error={errors.storyLink} theme={theme} />
            <Field label="Related Story Title (Optional)" type="text" placeholder="e.g. Story description" value={form.storySummary} onChange={(v) => setForm(f => ({ ...f, storySummary: v }))} theme={theme} />
            
            {/* Custom fields */}
            {activeCustomFields.map((field) => (
              <Field
                key={field.id}
                label={field.label}
                type={field.type === 'select' ? 'select' : field.type}
                value={customFormVals[field.id]}
                onChange={(v) => handleCustomFieldChange(field.id, v)}
                options={field.options?.map(opt => ({ value: opt, label: opt })) || []}
                placeholder={`Enter ${field.label}`}
                theme={theme}
              />
            ))}

            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Root Cause / Notes" type="text" placeholder="Enter notes or explanation for SIT missed / bug origin" value={form.notes} onChange={(v) => setForm(f => ({ ...f, notes: v }))} theme={theme} />
            </div>

            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button type="submit" style={commonStyles.button(theme, 'primary')}>
                Log Defect
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter Bar (Leads / Admin only) */}
      {!isMember && (
        <FilterBar
          projects={appState.projects}
          squads={appState.squads}
          dataEntries={appState.dataEntries}
          defects={appState.defects}
          releaseNames={appState.releaseNames || []}
          filters={filters}
          setFilters={setFilters}
          theme={theme}
        />
      )}

      {/* Table */}
      <div style={commonStyles.card(theme)}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: theme.text, marginBottom: '16px', borderLeft: `4px solid ${theme.orange}`, paddingLeft: '8px' }}>
          {isMember ? 'My Logged Defects' : 'All Logged Defects'}
        </h3>
        <div style={{ overflowX: 'auto', maxHeight: '620px' }}>
          <table style={commonStyles.table(theme)}>
            <thead>
              <tr>
                <th style={{ ...commonStyles.th(theme), minWidth: '98px' }}>Date</th>
                <th style={commonStyles.th(theme)}>Release</th>
                <th style={commonStyles.th(theme)}>Sprint</th>
                <th style={commonStyles.th(theme)}>Project</th>
                <th style={commonStyles.th(theme)}>Squad</th>
                <th style={commonStyles.th(theme)}>Added By</th>
                <th style={commonStyles.th(theme)}>Defect</th>
                <th style={commonStyles.th(theme)}>Priority</th>
                <th style={commonStyles.th(theme)}>SIT Miss</th>
                <th style={commonStyles.th(theme)}>Status</th>
                <th style={commonStyles.th(theme)}>Age</th>
                <th style={commonStyles.th(theme)}>Related Story</th>
                {!readOnly && <th style={{ ...commonStyles.th(theme), width: '76px' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {visibleDefects.length === 0 ? (
                <tr>
                  <td colSpan={readOnly ? 12 : 13} style={{ ...commonStyles.td(theme), textAlign: 'center', color: theme.muted, padding: '28px' }}>
                    <div style={{ fontSize: '18px', marginBottom: '4px' }}>∅</div>
                    No defects logged yet.
                  </td>
                </tr>
              ) : (
                visibleDefects.map((row, index) => {
                  let priorityColor = theme.blue;
                  if (row.priority === 'P1') priorityColor = theme.red;
                  else if (row.priority === 'P2') priorityColor = theme.orange;
                  else if (row.priority === 'P3') priorityColor = theme.amber;
                  const statusColor = row.status === 'Open' ? theme.red
                    : row.status === 'In Progress' ? theme.amber
                      : row.status === 'Re-Opened' ? theme.orange
                        : row.status === 'Resolved' ? theme.green
                          : theme.muted;
                  const age = getDefectAge(row);
                  const editingThisStatus = statusEdit?.id === row.id;

                  return (
                    <tr key={row.id} className={row.id === newRowId ? 'row-flash' : undefined} style={{ backgroundColor: index % 2 === 1 ? `${theme.inputBg}cc` : 'transparent', borderLeft: `4px solid ${priorityColor}` }}>
                      <td style={{ ...commonStyles.td(theme), whiteSpace: 'nowrap' }}>{formatDate(row.date)}</td>
                      <td style={commonStyles.td(theme)}>{row.release || '—'}</td>
                      <td style={commonStyles.td(theme)}>{row.sprintName || '—'}</td>
                      <td style={commonStyles.td(theme)}>{projectMap.get(row.projectId) || 'Unknown'}</td>
                      <td style={commonStyles.td(theme)}>{squadMap.get(row.squadId) || 'Unknown'}</td>
                      <td style={commonStyles.td(theme)}>{row.addedByName}</td>
                      <td style={commonStyles.td(theme)}>
                        <div style={{ maxWidth: '260px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span title={row.jiraDefectSummary} style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.jiraDefectSummary}</span>
                        <a
                          href={row.jiraDefectLink}
                          target="_blank"
                          rel="noopener noreferrer"
                            title={row.jiraDefectLink}
                          style={{ color: theme.blue, fontWeight: 500, textDecoration: 'none', fontSize: '11px', display: 'inline-flex', gap: '4px', alignItems: 'center' }}
                        >
                            <ExternalLink size={12} /> Jira
                        </a>
                        </div>
                      </td>
                      
                      <td style={commonStyles.td(theme)}>
                        <span style={{ ...commonStyles.badge(theme, priorityColor), fontSize: '12px', padding: '4px 10px', fontWeight: 800 }}>{row.priority}</span>
                      </td>

                      <td style={commonStyles.td(theme)}>
                        {row.sitMiss ? (
                          <span style={{ ...commonStyles.badge(theme, theme.red), fontSize: '12px', padding: '4px 9px', fontWeight: 900 }}>⚠ YES</span>
                        ) : (
                          <span style={{ color: theme.muted, fontSize: '13px' }}>No</span>
                        )}
                      </td>

                      <td style={commonStyles.td(theme)}>
                        {editingThisStatus ? (
                          <div onBlur={(event) => {
                            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) saveStatusEdit(row);
                          }}>
                            <select
                              autoFocus
                              value={statusEdit.status}
                              onChange={(event) => setStatusEdit(previous => previous ? { ...previous, status: event.target.value as IDefect['status'], resolvedDate: (event.target.value === 'Resolved' || event.target.value === 'Closed') ? previous.resolvedDate : '' } : previous)}
                              onKeyDown={(event) => { if (event.key === 'Enter') saveStatusEdit(row); if (event.key === 'Escape') setStatusEdit(null); }}
                              style={commonStyles.select(theme)}
                            >
                              {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
                            </select>
                            {(statusEdit.status === 'Resolved' || statusEdit.status === 'Closed') && (
                              <input
                                type="date"
                                value={statusEdit.resolvedDate}
                                onChange={(event) => setStatusEdit(previous => previous ? { ...previous, resolvedDate: event.target.value } : previous)}
                                onKeyDown={(event) => { if (event.key === 'Enter') saveStatusEdit(row); }}
                                style={{ ...commonStyles.input(theme), marginTop: '6px', borderColor: !statusEdit.resolvedDate ? theme.red : theme.border }}
                              />
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => !readOnly && setStatusEdit({ id: row.id, status: row.status, resolvedDate: row.resolvedDate || new Date().toISOString().slice(0, 10) })}
                            style={{
                              display: 'inline-block',
                              padding: '3px 8px',
                              borderRadius: '12px',
                              fontSize: '12px',
                              fontWeight: 600,
                              backgroundColor: `${statusColor}20`,
                              color: statusColor,
                              border: `1px solid ${statusColor}33`,
                              cursor: readOnly ? 'default' : 'pointer',
                            }}
                          >
                            {row.status}
                          </button>
                        )}
                      </td>
                      <td style={commonStyles.td(theme)}>
                        <span style={commonStyles.badge(theme, age.color)}>{age.label}</span>
                      </td>

                      <td style={commonStyles.td(theme)}>
                        {row.storyLink ? (
                          <a
                            href={row.storyLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={row.storyLink}
                            style={{ color: theme.blue, textDecoration: 'none', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <ExternalLink size={12} /> {row.storySummary || 'Story'}
                          </a>
                        ) : (
                          <span style={{ color: theme.muted }}>—</span>
                        )}
                        {row.notes && (
                          <div style={{ fontSize: '11px', color: theme.muted, marginTop: '4px', maxWidth: '200px' }}>
                            {row.notes}
                          </div>
                        )}
                        {row.customFields && Object.keys(row.customFields).length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                            {Object.entries(row.customFields).map(([fId, val]) => {
                              const f = appState.customFields.find(cf => cf.id === fId);
                              if (!f || val === undefined || val === '') return null;
                              return (
                                <span key={fId} style={{ fontSize: '10px', backgroundColor: `${theme.indigo}15`, color: theme.indigo, padding: '1px 4px', borderRadius: '4px' }}>
                                  {f.label}: {String(val)}
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {(row.statusHistory || []).length > 0 && (
                          <details style={{ marginTop: '6px', color: theme.muted, fontSize: '10px' }}>
                            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Status History</summary>
                            {(row.statusHistory || []).map((item, historyIndex) => (
                              <div key={`${item.changedAt}-${historyIndex}`} style={{ marginTop: '3px' }}>
                                {item.status} - {item.changedBy} on {new Date(item.changedAt).toLocaleString()}
                              </div>
                            ))}
                          </details>
                        )}
                      </td>

                      {!readOnly && (
                        <td style={commonStyles.td(theme)}>
                          <button onClick={() => handleDelete(row.id)} title="Delete defect" style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', color: theme.red, cursor: 'pointer', display: 'flex', alignItems: 'center', width: '40px' }}>
                            <Trash2 size={16} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {confirmDeleteDefectId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 12, padding: '32px 28px', width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '18px' }}>Delete Defect?</h3>
            <p style={{ fontSize: '14px', color: theme.text, margin: '0 0 24px' }}>Are you sure you want to delete this defect?</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setConfirmDeleteDefectId(null)} style={commonStyles.button(theme, 'secondary')}>Cancel</button>
              <button type="button" onClick={handleConfirmDeleteDefect} style={{ ...commonStyles.button(theme, 'primary'), backgroundColor: theme.red, borderColor: theme.red }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
