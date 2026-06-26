/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo } from 'react';
import { ThemeTokens, commonStyles } from '../theme';
import { AppState, DataEntry as IDataEntry, User } from '../types';
import { generateId, formatDate, sanitise, formatDateTime } from '../utils';
import { Field, FilterBar, Badge, ViewOnlyBanner } from './Shared';
import { Plus, Trash2, HelpCircle, Pencil, ExternalLink, X } from 'lucide-react';

interface DataEntryProps {
  currentUser: User;
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  showToast: (msg: string, type: 'success' | 'error' | 'warning', duration?: number) => void;
  theme: ThemeTokens;
  readOnly?: boolean;
}

export function DataEntry({ currentUser, appState, setAppState, showToast, theme, readOnly = false }: DataEntryProps) {
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
    jiraStoryLink: '',
    jiraStorySummary: '',
    tcMode: 'full' as 'created' | 'full',
    tcCreated: 0,
    tcExecuted: 0,
    tcPassed: 0,
    tcFailed: 0,
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newRowId, setNewRowId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<IDataEntry | null>(null);
  const [editForm, setEditForm] = useState<typeof form | null>(null);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const updateForm = (key: keyof typeof form, value: any, extras: Partial<typeof form> = {}) => {
    setForm(previous => ({ ...previous, [key]: value, ...extras }));
    setErrors(previous => {
      const next = { ...previous };
      delete next[key];
      Object.keys(extras).forEach(extraKey => delete next[extraKey]);
      if (['tcMode', 'tcCreated', 'tcExecuted', 'tcPassed', 'tcFailed'].includes(String(key))) {
        delete next.tcCreated;
        delete next.tcExecuted;
        delete next.tcPassed;
        delete next.tcFailed;
      }
      return next;
    });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEditingEntry(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Custom Fields State (appliesTo: "dataEntry" | "both")
  const activeCustomFields = useMemo(() => {
    return appState.customFields.filter(f => f.appliesTo === 'dataEntry' || f.appliesTo === 'both');
  }, [appState.customFields]);

  const [customFormVals, setCustomFormVals] = useState<Record<string, any>>({});

  const handleCustomFieldChange = (fieldId: string, val: any) => {
    setCustomFormVals(prev => ({ ...prev, [fieldId]: val }));
  };

  // Filter & Filter-receptive list of data entries
  const visibleEntries = useMemo(() => {
    let list = [...appState.dataEntries];

    // Filter by member ownership if needed
    if (isMember) {
      list = list.filter((e) => e.addedBy === currentUser.id);
    } else {
      // Filter by Lead/Admin search filters
      if (filters.projectId) {
        list = list.filter((e) => e.projectId === filters.projectId);
      }
      if (filters.squadId) {
        list = list.filter((e) => e.squadId === filters.squadId);
      }
      if (filters.release) {
        list = list.filter((e) => e.release === filters.release);
      }
      if (filters.month) {
        list = list.filter((e) => e.date && e.date.substring(0, 7) === filters.month);
      }
    }

    // Sort newest-first by date
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [appState.dataEntries, currentUser.id, isMember, filters]);

  // Project and Squad lists for dropdown options
  const projectOptions = useMemo(() => {
    return appState.projects.map(p => ({ value: p.id, label: p.name }));
  }, [appState.projects]);

  const squadOptions = useMemo(() => {
    return appState.squads
      .filter(s => !form.projectId || !s.projectId || s.projectId === form.projectId)
      .map(s => ({ value: s.id, label: s.name }));
  }, [appState.squads, form.projectId]);

  // Helper for lookup
  const projectMap = useMemo(() => new Map(appState.projects.map(p => [p.id, p.name])), [appState.projects]);
  const squadMap = useMemo(() => new Map(appState.squads.map(s => [s.id, s.name])), [appState.squads]);

  const validateEntry = (values: typeof form) => {
    const nextErrors: Record<string, string> = {};
    const isNonNegativeInteger = (value: number) => Number.isInteger(Number(value)) && Number(value) >= 0;
    if (!values.date) nextErrors.date = 'Date is required.';
    if (!values.release) nextErrors.release = 'Release is required.';
    if (!values.projectId) nextErrors.projectId = 'Project is required.';
    if (!values.squadId) nextErrors.squadId = 'Squad is required.';
    if (!values.jiraStoryLink.trim()) nextErrors.jiraStoryLink = 'Jira Story Link is required.';
    else if (!/^https?:\/\//i.test(values.jiraStoryLink)) nextErrors.jiraStoryLink = 'Link must start with http:// or https://.';
    if (!values.jiraStorySummary.trim()) nextErrors.jiraStorySummary = 'Jira Story Summary is required.';
    else if (values.jiraStorySummary.trim().length < 3) nextErrors.jiraStorySummary = 'Summary must be at least 3 characters.';
    if (!isNonNegativeInteger(values.tcCreated)) nextErrors.tcCreated = 'Enter a non-negative integer.';
    if (values.tcMode === 'full') {
      if (!isNonNegativeInteger(values.tcExecuted)) nextErrors.tcExecuted = 'Enter a non-negative integer.';
      else if (values.tcExecuted > values.tcCreated) nextErrors.tcExecuted = 'TC Executed cannot exceed TC Created.';
      if (!isNonNegativeInteger(values.tcPassed)) nextErrors.tcPassed = 'Enter a non-negative integer.';
      else if (values.tcPassed > values.tcExecuted) nextErrors.tcPassed = 'TC Passed cannot exceed TC Executed.';
      if (!isNonNegativeInteger(values.tcFailed)) nextErrors.tcFailed = 'Enter a non-negative integer.';
      else if (values.tcFailed > values.tcExecuted) nextErrors.tcFailed = 'TC Failed cannot exceed TC Executed.';
      else if (values.tcPassed + values.tcFailed > values.tcExecuted) nextErrors.tcFailed = 'Passed + Failed cannot exceed TC Executed.';
    }
    return nextErrors;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors = validateEntry(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const isCreatedOnly = form.tcMode === 'created';

    const newEntry: IDataEntry = {
      id: generateId(),
      date: form.date,
      release: sanitise(form.release.trim()),
      projectId: form.projectId,
      squadId: form.squadId,
      jiraStoryLink: form.jiraStoryLink.trim(),
      jiraStorySummary: sanitise(form.jiraStorySummary.trim()),
      tcCreated: Number(form.tcCreated) || 0,
      tcExecuted: isCreatedOnly ? null : Number(form.tcExecuted) || 0,
      tcPassed: isCreatedOnly ? null : Number(form.tcPassed) || 0,
      tcFailed: isCreatedOnly ? null : Number(form.tcFailed) || 0,
      notes: sanitise(form.notes.trim()),
      addedBy: currentUser.id,
      addedByName: currentUser.username,
      lastEditedBy: null,
      lastEditedAt: null,
      lastEditedByRole: null,
      customFields: Object.fromEntries(Object.entries(customFormVals).map(([key, value]) => [key, sanitise(value)]))
    };

    setAppState((prev) => ({
      ...prev,
      dataEntries: [...prev.dataEntries, newEntry]
    }));
    setNewRowId(newEntry.id);
    setTimeout(() => setNewRowId(null), 1500);

    // Reset form
    setForm({
      date: new Date().toISOString().split('T')[0],
      release: '',
      projectId: currentUser.projectId || '',
      squadId: currentUser.squadId || '',
      jiraStoryLink: '',
      jiraStorySummary: '',
      tcMode: 'full',
      tcCreated: 0,
      tcExecuted: 0,
      tcPassed: 0,
      tcFailed: 0,
      notes: '',
    });
    setCustomFormVals({});

    showToast('Data entry logged successfully!', 'success');
  };

  const openEditModal = (entry: IDataEntry) => {
    setEditingEntry(entry);
    setEditForm({
      date: entry.date,
      release: entry.release,
      projectId: entry.projectId,
      squadId: entry.squadId,
      jiraStoryLink: entry.jiraStoryLink,
      jiraStorySummary: entry.jiraStorySummary,
      tcMode: entry.tcExecuted === null ? 'created' : 'full',
      tcCreated: entry.tcCreated,
      tcExecuted: entry.tcExecuted ?? 0,
      tcPassed: entry.tcPassed ?? 0,
      tcFailed: entry.tcFailed ?? 0,
      notes: entry.notes || '',
    });
    setEditErrors({});
  };

  const updateEditForm = (key: keyof typeof form, value: any, extras: Partial<typeof form> = {}) => {
    setEditForm(previous => previous ? ({ ...previous, [key]: value, ...extras }) : previous);
    setEditErrors(previous => {
      const next = { ...previous };
      delete next[key];
      Object.keys(extras).forEach(extraKey => delete next[extraKey]);
      return next;
    });
  };

  const handleSaveEdit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingEntry || !editForm) return;
    const nextErrors = validateEntry(editForm);
    setEditErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const isCreatedOnly = editForm.tcMode === 'created';
    setAppState(previous => ({
      ...previous,
      dataEntries: previous.dataEntries.map(entry => entry.id === editingEntry.id ? {
        ...entry,
        date: editForm.date,
        release: sanitise(editForm.release.trim()),
        projectId: editForm.projectId,
        squadId: editForm.squadId,
        jiraStoryLink: editForm.jiraStoryLink.trim(),
        jiraStorySummary: sanitise(editForm.jiraStorySummary.trim()),
        tcCreated: Number(editForm.tcCreated) || 0,
        tcExecuted: isCreatedOnly ? null : Number(editForm.tcExecuted) || 0,
        tcPassed: isCreatedOnly ? null : Number(editForm.tcPassed) || 0,
        tcFailed: isCreatedOnly ? null : Number(editForm.tcFailed) || 0,
        notes: sanitise(editForm.notes.trim()),
        lastEditedBy: currentUser.username,
        lastEditedAt: new Date().toISOString(),
        lastEditedByRole: currentUser.role,
      } : entry),
    }));
    setEditingEntry(null);
    setEditForm(null);
    showToast('Entry updated successfully.', 'success');
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this test entry?')) {
      setAppState((prev) => ({
        ...prev,
        dataEntries: prev.dataEntries.filter((e) => e.id !== id)
      }));
      showToast('Entry deleted.', 'success');
    }
  };

  const hasSetupData = appState.projects.length > 0 && appState.squads.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {readOnly && <ViewOnlyBanner theme={theme} />}
      {/* Helper Warning if setup data is missing */}
      {!hasSetupData && (
        <div style={{ padding: '16px', backgroundColor: `${theme.amber}1a`, border: `1px solid ${theme.amber}`, borderRadius: '8px', color: theme.text, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <HelpCircle size={20} style={{ color: theme.amber }} />
          <span>
            <strong>Setup Required:</strong> Add Projects and Squads under the <strong>Settings</strong> page first to begin logging data entries.
          </span>
        </div>
      )}

      {/* Entry Input Form */}
      {hasSetupData && !readOnly && (
        <div style={commonStyles.card(theme)}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={18} style={{ color: theme.blue }} />
            Log QA Test Entry
          </h3>
          <form noValidate onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <Field label="Date" type="date" value={form.date} onChange={(v) => updateForm('date', v)} error={errors.date} required theme={theme} />
            <Field
              label="Release Name"
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

            <Field label="Jira Story Link" type="text" placeholder="https://jira.company.com/browse/PROJ-123" value={form.jiraStoryLink} onChange={(v) => updateForm('jiraStoryLink', v)} error={errors.jiraStoryLink} required theme={theme} />
            <Field label="Jira Story Summary / Title" type="text" placeholder="e.g. Implement checkout logic" value={form.jiraStorySummary} onChange={(v) => updateForm('jiraStorySummary', v)} error={errors.jiraStorySummary} required theme={theme} />

            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '14px', alignItems: 'center', padding: '8px 0' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700 }}>
                <input type="radio" checked={form.tcMode === 'created'} onChange={() => updateForm('tcMode', 'created', { tcExecuted: 0, tcPassed: 0, tcFailed: 0 })} />
                TC Created only
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700 }}>
                <input type="radio" checked={form.tcMode === 'full'} onChange={() => updateForm('tcMode', 'full')} />
                TC Created + Executed
              </label>
            </div>
            <Field label="TC Created" type="number" value={form.tcCreated} onChange={(v) => updateForm('tcCreated', v)} error={errors.tcCreated} required theme={theme} />
            {form.tcMode === 'full' && <>
              <Field label="TC Executed" type="number" value={form.tcExecuted} onChange={(v) => updateForm('tcExecuted', v)} error={errors.tcExecuted} required theme={theme} />
              <Field label="TC Passed" type="number" value={form.tcPassed} onChange={(v) => updateForm('tcPassed', v)} error={errors.tcPassed} required theme={theme} />
              <Field label="TC Failed" type="number" value={form.tcFailed} onChange={(v) => updateForm('tcFailed', v)} error={errors.tcFailed} required theme={theme} />
            </>}

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
              <Field label="Notes & Comments" type="text" placeholder="Optional comments, edge cases, blockers, etc." value={form.notes} onChange={(v) => setForm(f => ({ ...f, notes: v }))} theme={theme} />
            </div>

            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button type="submit" style={commonStyles.button(theme, 'primary')}>
                Save Entry
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

      {/* List / Table */}
      <div style={commonStyles.card(theme)}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: theme.text, marginBottom: '16px', borderLeft: `4px solid ${theme.blue}`, paddingLeft: '8px' }}>
          {isMember ? 'My Data Entries' : 'All Data Entries'}
        </h3>
        <div style={{ overflowX: 'auto', maxHeight: '620px' }}>
          <table style={commonStyles.table(theme)}>
            <thead>
              <tr>
                <th style={{ ...commonStyles.th(theme), minWidth: '98px' }}>Date</th>
                <th style={commonStyles.th(theme)}>Release</th>
                <th style={commonStyles.th(theme)}>Project</th>
                <th style={{ ...commonStyles.th(theme), borderRight: `1px solid ${theme.border}` }}>Squad</th>
                <th style={commonStyles.th(theme)}>Story</th>
                <th style={{ ...commonStyles.th(theme), minWidth: '74px' }}>Mode</th>
                <th style={{ ...commonStyles.th(theme), minWidth: '62px' }}>TC Cr</th>
                <th style={{ ...commonStyles.th(theme), minWidth: '62px' }}>TC Ex</th>
                <th style={{ ...commonStyles.th(theme), minWidth: '62px' }}>TC Pa</th>
                <th style={{ ...commonStyles.th(theme), minWidth: '62px' }}>TC Fa</th>
                <th style={{ ...commonStyles.th(theme), minWidth: '78px', borderRight: `1px solid ${theme.border}` }}>Pass %</th>
                <th style={commonStyles.th(theme)}>Notes</th>
                {!readOnly && <th style={{ ...commonStyles.th(theme), width: '92px' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {visibleEntries.length === 0 ? (
                <tr>
                  <td colSpan={readOnly ? 12 : 13} style={{ ...commonStyles.td(theme), textAlign: 'center', color: theme.muted, padding: '28px' }}>
                    <div style={{ fontSize: '18px', marginBottom: '4px' }}>∅</div>
                    No test entries found.
                  </td>
                </tr>
              ) : (
                visibleEntries.map((row, index) => {
                  const isCreatedOnly = row.tcExecuted === null;
                  const passRate = !isCreatedOnly && row.tcExecuted && row.tcExecuted > 0 ? ((row.tcPassed || 0) / row.tcExecuted) * 100 : null;
                  const projectColor = ['#3b82f6', '#10b981', '#f59e0b', '#6366f1', '#ef4444'][index % 5];

                  return (
                    <React.Fragment key={row.id}>
                    <tr className={row.id === newRowId ? 'row-flash' : undefined} style={{ backgroundColor: index % 2 === 1 ? `${theme.inputBg}cc` : 'transparent', borderLeft: `4px solid ${projectColor}` }}>
                      <td style={{ ...commonStyles.td(theme), whiteSpace: 'nowrap' }}>{formatDate(row.date)}</td>
                      <td style={commonStyles.td(theme)}>{row.release || '—'}</td>
                      <td style={commonStyles.td(theme)}>{projectMap.get(row.projectId) || 'Unknown'}</td>
                      <td style={{ ...commonStyles.td(theme), borderRight: `1px solid ${theme.border}` }}>{squadMap.get(row.squadId) || 'Unknown'}</td>
                      <td style={commonStyles.td(theme)}>
                        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '250px' }}>
                          <span title={row.jiraStorySummary} style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.jiraStorySummary || 'Untitled story'}</span>
                          <a href={row.jiraStoryLink} target="_blank" rel="noopener noreferrer" title={row.jiraStoryLink} style={{ color: theme.blue, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', marginTop: '2px' }}>
                            <ExternalLink size={12} /> Jira
                          </a>
                        </div>
                      </td>
                      <td style={commonStyles.td(theme)}>
                        <Badge label={isCreatedOnly ? 'TCs Only' : 'Full'} colorHex={isCreatedOnly ? theme.blue : theme.green} theme={theme} />
                      </td>
                      <td style={{ ...commonStyles.td(theme), whiteSpace: 'nowrap' }}>{row.tcCreated}</td>
                      <td style={{ ...commonStyles.td(theme), whiteSpace: 'nowrap' }}>{row.tcExecuted ?? '—'}</td>
                      <td style={{ ...commonStyles.td(theme), whiteSpace: 'nowrap' }}>{row.tcPassed ?? '—'}</td>
                      <td style={{ ...commonStyles.td(theme), whiteSpace: 'nowrap' }}>{row.tcFailed ?? '—'}</td>
                      <td style={{ ...commonStyles.td(theme), borderRight: `1px solid ${theme.border}`, fontWeight: 600, color: passRate !== null ? (passRate >= 80 ? theme.green : passRate >= 50 ? theme.amber : theme.red) : theme.text }}>
                        {isCreatedOnly ? <Badge label="TCs Only" colorHex={theme.blue} theme={theme} /> : passRate !== null ? `${passRate.toFixed(1)}%` : '—'}
                      </td>

                      <td style={commonStyles.td(theme)}>
                        <div className="notes-cell" style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.notes || ''}>
                          <span style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.notes || '—'}</span>
                          {/* Display custom fields if any exist */}
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
                        </div>
                      </td>

                      {!readOnly && (
                        <td style={commonStyles.td(theme)}>
                          <div style={{ display: 'flex', gap: '6px', width: '78px' }}>
                            <button onClick={() => openEditModal(row)} title="Edit entry" style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', color: theme.blue, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Pencil size={15} /></button>
                            <button onClick={() => handleDelete(row.id)} title="Delete entry" style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', color: theme.red, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Trash2 size={16} /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {row.lastEditedAt && (
                      <tr style={{ backgroundColor: index % 2 === 1 ? `${theme.inputBg}cc` : 'transparent', borderLeft: `4px solid ${projectColor}` }}>
                        <td colSpan={readOnly ? 12 : 13} style={{ ...commonStyles.td(theme), paddingTop: '0', color: theme.muted, fontSize: '11px' }}>
                          Last edited by {row.lastEditedBy || 'Unknown'} on {formatDateTime(row.lastEditedAt)}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {editingEntry && editForm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(15,23,42,0.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px', animation: 'modalBackdropIn 160ms ease-out' }}>
          <form noValidate onSubmit={handleSaveEdit} style={{ ...commonStyles.card(theme), width: '100%', maxWidth: '600px', padding: '28px', maxHeight: '88vh', overflowY: 'auto', animation: 'modalPanelIn 180ms ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, fontSize: '18px' }}>Edit Entry - {editingEntry.jiraStorySummary}</h3>
              <button type="button" onClick={() => setEditingEntry(null)} style={{ border: 0, background: 'transparent', color: theme.muted, cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              <Field label="Date" type="date" value={editForm.date} onChange={(v) => updateEditForm('date', v)} error={editErrors.date} required theme={theme} />
              <Field label="Release" type="select" value={editForm.release} onChange={(v) => updateEditForm('release', v)} options={(appState.releaseNames || []).map((r) => ({ value: r.name, label: r.name }))} required error={editErrors.release} theme={theme} />
              <Field label="Project" type="select" value={editForm.projectId} onChange={(v) => updateEditForm('projectId', v, { squadId: '' })} options={projectOptions} required error={editErrors.projectId} theme={theme} />
              <Field label="Squad" type="select" value={editForm.squadId} onChange={(v) => updateEditForm('squadId', v)} options={appState.squads.filter(s => !editForm.projectId || !s.projectId || s.projectId === editForm.projectId).map(s => ({ value: s.id, label: s.name }))} required error={editErrors.squadId} theme={theme} />
              <Field label="Jira Story Link" type="text" value={editForm.jiraStoryLink} onChange={(v) => updateEditForm('jiraStoryLink', v)} error={editErrors.jiraStoryLink} required theme={theme} />
              <Field label="Jira Story Summary" type="text" value={editForm.jiraStorySummary} onChange={(v) => updateEditForm('jiraStorySummary', v)} error={editErrors.jiraStorySummary} required theme={theme} />
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '14px', alignItems: 'center', padding: '4px 0' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700 }}>
                  <input type="radio" checked={editForm.tcMode === 'created'} onChange={() => updateEditForm('tcMode', 'created', { tcExecuted: 0, tcPassed: 0, tcFailed: 0 })} />
                  TC Created only
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700 }}>
                  <input type="radio" checked={editForm.tcMode === 'full'} onChange={() => updateEditForm('tcMode', 'full')} />
                  TC Created + Executed
                </label>
              </div>
              <Field label="TC Created" type="number" value={editForm.tcCreated} onChange={(v) => updateEditForm('tcCreated', v)} error={editErrors.tcCreated} required theme={theme} />
              {editForm.tcMode === 'full' && <>
                <Field label="TC Executed" type="number" value={editForm.tcExecuted} onChange={(v) => updateEditForm('tcExecuted', v)} error={editErrors.tcExecuted} required theme={theme} />
                <Field label="TC Passed" type="number" value={editForm.tcPassed} onChange={(v) => updateEditForm('tcPassed', v)} error={editErrors.tcPassed} required theme={theme} />
                <Field label="TC Failed" type="number" value={editForm.tcFailed} onChange={(v) => updateEditForm('tcFailed', v)} error={editErrors.tcFailed} required theme={theme} />
              </>}
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Notes" type="text" value={editForm.notes} onChange={(v) => updateEditForm('notes', v)} theme={theme} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button type="button" onClick={() => setEditingEntry(null)} style={commonStyles.button(theme, 'secondary')}>Cancel</button>
              <button type="submit" style={commonStyles.button(theme, 'primary')}>Save Changes</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
