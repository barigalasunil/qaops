/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { ThemeTokens, commonStyles } from '../theme';
import { AppState, Defect as IDefect, User } from '../types';
import { generateId, formatDate, sanitise } from '../utils';
import { Field, FilterBar, Badge, ViewOnlyBanner } from './Shared';
import { Plus, Trash2, HelpCircle } from 'lucide-react';

interface DefectsProps {
  currentUser: User;
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  showToast: (msg: string, type: 'success' | 'error') => void;
  theme: ThemeTokens;
  readOnly?: boolean;
}

export function Defects({ currentUser, appState, setAppState, showToast, theme, readOnly = false }: DefectsProps) {
  const isMember = currentUser.role === 'member';

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
    release: '',
    projectId: currentUser.projectId || '',
    squadId: currentUser.squadId || '',
    jiraDefectLink: '',
    jiraDefectSummary: '',
    priority: 'P2' as 'P1' | 'P2' | 'P3',
    status: 'Open' as 'Open' | 'In Progress' | 'Re-Opened' | 'Resolved' | 'Closed',
    sitMiss: false,
    storyLink: '',
    storySummary: '',
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newRowId, setNewRowId] = useState<string | null>(null);
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
    if (!form.release) nextErrors.release = 'Release is required.';
    if (!form.projectId) nextErrors.projectId = 'Project is required.';
    if (!form.squadId) nextErrors.squadId = 'Squad is required.';
    if (!form.jiraDefectLink.trim()) nextErrors.jiraDefectLink = 'Jira Defect Link is required.';
    else if (!/^https?:\/\//i.test(form.jiraDefectLink)) nextErrors.jiraDefectLink = 'Link must start with http:// or https://.';
    if (!form.jiraDefectSummary.trim()) nextErrors.jiraDefectSummary = 'Jira Defect Summary is required.';
    else if (form.jiraDefectSummary.trim().length < 3) nextErrors.jiraDefectSummary = 'Summary must be at least 3 characters.';
    if (!form.priority) nextErrors.priority = 'Priority is required.';
    if (!form.status) nextErrors.status = 'Status is required.';
    if (form.storyLink && !/^https?:\/\//i.test(form.storyLink)) nextErrors.storyLink = 'Link must start with http:// or https://.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const newDefect: IDefect = {
      id: generateId(),
      date: form.date,
      release: sanitise(form.release.trim()),
      projectId: form.projectId,
      squadId: form.squadId,
      jiraDefectLink: form.jiraDefectLink.trim(),
      jiraDefectSummary: sanitise(form.jiraDefectSummary.trim()),
      priority: form.priority,
      status: form.status,
      sitMiss: form.sitMiss,
      storyLink: form.storyLink.trim() || undefined,
      storySummary: sanitise(form.storySummary.trim()) || undefined,
      notes: sanitise(form.notes.trim()),
      addedBy: currentUser.id,
      addedByName: currentUser.username,
      customFields: Object.fromEntries(Object.entries(customFormVals).map(([key, value]) => [key, sanitise(value)]))
    };

    setAppState((prev) => ({
      ...prev,
      defects: [...prev.defects, newDefect]
    }));
    setNewRowId(newDefect.id);
    setTimeout(() => setNewRowId(null), 1500);

    // Reset Form
    setForm({
      date: new Date().toISOString().split('T')[0],
      release: '',
      projectId: currentUser.projectId || '',
      squadId: currentUser.squadId || '',
      jiraDefectLink: '',
      jiraDefectSummary: '',
      priority: 'P2',
      status: 'Open',
      sitMiss: false,
      storyLink: '',
      storySummary: '',
      notes: '',
    });
    setCustomFormVals({});

    showToast('Defect logged successfully!', 'success');
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this defect?')) {
      setAppState((prev) => ({
        ...prev,
        defects: prev.defects.filter((d) => d.id !== id)
      }));
      showToast('Defect removed.', 'success');
    }
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
                Go to Releases → Release Names to add release names first.
              </p>
            )}
            
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
              onChange={(v) => updateForm('status', v)}
              options={[
                { value: 'Open', label: 'Open' },
                { value: 'In Progress', label: 'In Progress' },
                { value: 'Re-Opened', label: 'Re-Opened' },
                { value: 'Resolved', label: 'Resolved' },
                { value: 'Closed', label: 'Closed' }
              ]}
              required
              error={errors.status}
              theme={theme}
            />

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
        <div style={{ overflowX: 'auto' }}>
          <table style={commonStyles.table(theme)}>
            <thead>
              <tr style={{ backgroundColor: theme.inputBg }}>
                <th style={commonStyles.th(theme)}>Date</th>
                <th style={commonStyles.th(theme)}>Release</th>
                <th style={commonStyles.th(theme)}>Project</th>
                <th style={commonStyles.th(theme)}>Squad</th>
                <th style={commonStyles.th(theme)}>Added By</th>
                <th style={commonStyles.th(theme)}>Defect Link</th>
                <th style={commonStyles.th(theme)}>Summary</th>
                <th style={commonStyles.th(theme)}>Priority</th>
                <th style={commonStyles.th(theme)}>SIT Miss</th>
                <th style={commonStyles.th(theme)}>Status</th>
                <th style={commonStyles.th(theme)}>Related Story</th>
                {!readOnly && <th style={commonStyles.th(theme)}>Delete</th>}
              </tr>
            </thead>
            <tbody>
              {visibleDefects.length === 0 ? (
                <tr>
                  <td colSpan={readOnly ? 11 : 12} style={{ ...commonStyles.td(theme), textAlign: 'center', color: theme.muted, padding: '24px' }}>
                    No defects logged yet.
                  </td>
                </tr>
              ) : (
                visibleDefects.map((row, index) => {
                  let priorityColor = theme.blue;
                  if (row.priority === 'P1') priorityColor = theme.red;
                  else if (row.priority === 'P2') priorityColor = theme.orange;
                  else if (row.priority === 'P3') priorityColor = theme.amber;

                  return (
                    <tr key={row.id} className={row.id === newRowId ? 'row-flash' : undefined} style={{ backgroundColor: index % 2 === 1 ? theme.inputBg : 'transparent' }}>
                      <td style={commonStyles.td(theme)}>{formatDate(row.date)}</td>
                      <td style={commonStyles.td(theme)}>{row.release || '—'}</td>
                      <td style={commonStyles.td(theme)}>{projectMap.get(row.projectId) || 'Unknown'}</td>
                      <td style={commonStyles.td(theme)}>{squadMap.get(row.squadId) || 'Unknown'}</td>
                      <td style={commonStyles.td(theme)}>{row.addedByName}</td>
                      <td style={commonStyles.td(theme)}>
                        <a
                          href={row.jiraDefectLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: theme.blue, fontWeight: 500, textDecoration: 'none', wordBreak: 'break-all', fontSize: '13px' }}
                        >
                          Defect Link
                        </a>
                      </td>
                      <td style={{ ...commonStyles.td(theme), fontWeight: 500 }}>{row.jiraDefectSummary}</td>
                      
                      <td style={commonStyles.td(theme)}>
                        <Badge label={row.priority} colorHex={priorityColor} theme={theme} />
                      </td>

                      <td style={commonStyles.td(theme)}>
                        {row.sitMiss ? (
                          <Badge label="⚠ YES" colorHex={theme.red} theme={theme} />
                        ) : (
                          <span style={{ color: theme.muted, fontSize: '13px' }}>No</span>
                        )}
                      </td>

                      <td style={commonStyles.td(theme)}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            backgroundColor: row.status === 'Closed' ? `${theme.green}20` : `${theme.blue}20`,
                            color: row.status === 'Closed' ? theme.green : theme.blue,
                          }}
                        >
                          {row.status}
                        </span>
                      </td>

                      <td style={commonStyles.td(theme)}>
                        {row.storyLink ? (
                          <a
                            href={row.storyLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: theme.blue, textDecoration: 'none', fontSize: '13px' }}
                          >
                            {row.storySummary || 'Related Story'}
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
                      </td>

                      {!readOnly && (
                        <td style={commonStyles.td(theme)}>
                          <button
                            onClick={() => handleDelete(row.id)}
                            style={{
                              padding: '4px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: theme.red,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
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
    </div>
  );
}
