/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { ThemeTokens, commonStyles } from '../theme';
import { AppState, DataEntry as IDataEntry, User } from '../types';
import { generateId, formatDate, sanitise } from '../utils';
import { Field, FilterBar, Badge, ViewOnlyBanner } from './Shared';
import { Plus, Trash2, HelpCircle } from 'lucide-react';

interface DataEntryProps {
  currentUser: User;
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  showToast: (msg: string, type: 'success' | 'error') => void;
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
    tcCreated: 0,
    tcExecuted: 0,
    tcPassed: 0,
    tcFailed: 0,
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
      if (['tcCreated', 'tcExecuted', 'tcPassed', 'tcFailed'].includes(String(key))) {
        delete next.tcCreated;
        delete next.tcExecuted;
        delete next.tcPassed;
        delete next.tcFailed;
      }
      return next;
    });
  };

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    const isNonNegativeInteger = (value: number) => Number.isInteger(Number(value)) && Number(value) >= 0;
    if (!form.date) nextErrors.date = 'Date is required.';
    if (!form.release) nextErrors.release = 'Release is required.';
    if (!form.projectId) nextErrors.projectId = 'Project is required.';
    if (!form.squadId) nextErrors.squadId = 'Squad is required.';
    if (!form.jiraStoryLink.trim()) nextErrors.jiraStoryLink = 'Jira Story Link is required.';
    else if (!/^https?:\/\//i.test(form.jiraStoryLink)) nextErrors.jiraStoryLink = 'Link must start with http:// or https://.';
    if (!form.jiraStorySummary.trim()) nextErrors.jiraStorySummary = 'Jira Story Summary is required.';
    else if (form.jiraStorySummary.trim().length < 3) nextErrors.jiraStorySummary = 'Summary must be at least 3 characters.';
    if (!isNonNegativeInteger(form.tcCreated)) nextErrors.tcCreated = 'Enter a non-negative integer.';
    if (!isNonNegativeInteger(form.tcExecuted)) nextErrors.tcExecuted = 'Enter a non-negative integer.';
    else if (form.tcExecuted > form.tcCreated) nextErrors.tcExecuted = 'TC Executed cannot exceed TC Created.';
    if (!isNonNegativeInteger(form.tcPassed)) nextErrors.tcPassed = 'Enter a non-negative integer.';
    else if (form.tcPassed > form.tcExecuted) nextErrors.tcPassed = 'TC Passed cannot exceed TC Executed.';
    if (!isNonNegativeInteger(form.tcFailed)) nextErrors.tcFailed = 'Enter a non-negative integer.';
    else if (form.tcFailed > form.tcExecuted) nextErrors.tcFailed = 'TC Failed cannot exceed TC Executed.';
    else if (form.tcPassed + form.tcFailed > form.tcExecuted) nextErrors.tcFailed = 'Passed + Failed cannot exceed TC Executed.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const newEntry: IDataEntry = {
      id: generateId(),
      date: form.date,
      release: sanitise(form.release.trim()),
      projectId: form.projectId,
      squadId: form.squadId,
      jiraStoryLink: form.jiraStoryLink.trim(),
      jiraStorySummary: sanitise(form.jiraStorySummary.trim()),
      tcCreated: Number(form.tcCreated) || 0,
      tcExecuted: Number(form.tcExecuted) || 0,
      tcPassed: Number(form.tcPassed) || 0,
      tcFailed: Number(form.tcFailed) || 0,
      notes: sanitise(form.notes.trim()),
      addedBy: currentUser.id,
      addedByName: currentUser.username,
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
      tcCreated: 0,
      tcExecuted: 0,
      tcPassed: 0,
      tcFailed: 0,
      notes: '',
    });
    setCustomFormVals({});

    showToast('Data entry logged successfully!', 'success');
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
            
            <Field label="TC Created" type="number" value={form.tcCreated} onChange={(v) => updateForm('tcCreated', v)} error={errors.tcCreated} required theme={theme} />
            <Field label="TC Executed" type="number" value={form.tcExecuted} onChange={(v) => updateForm('tcExecuted', v)} error={errors.tcExecuted} required theme={theme} />
            <Field label="TC Passed" type="number" value={form.tcPassed} onChange={(v) => updateForm('tcPassed', v)} error={errors.tcPassed} required theme={theme} />
            <Field label="TC Failed" type="number" value={form.tcFailed} onChange={(v) => updateForm('tcFailed', v)} error={errors.tcFailed} required theme={theme} />

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
        <div style={{ overflowX: 'auto' }}>
          <table style={commonStyles.table(theme)}>
            <thead>
              <tr style={{ backgroundColor: theme.inputBg }}>
                <th style={commonStyles.th(theme)}>Date</th>
                <th style={commonStyles.th(theme)}>Release</th>
                <th style={commonStyles.th(theme)}>Project</th>
                <th style={commonStyles.th(theme)}>Squad</th>
                <th style={commonStyles.th(theme)}>Added By</th>
                <th style={commonStyles.th(theme)}>Jira Story</th>
                <th style={commonStyles.th(theme)}>TC Cr</th>
                <th style={commonStyles.th(theme)}>TC Ex</th>
                <th style={commonStyles.th(theme)}>TC Pa</th>
                <th style={commonStyles.th(theme)}>TC Fa</th>
                <th style={commonStyles.th(theme)}>Cov %</th>
                <th style={commonStyles.th(theme)}>Pass %</th>
                <th style={commonStyles.th(theme)}>Notes</th>
                {!readOnly && <th style={commonStyles.th(theme)}>Delete</th>}
              </tr>
            </thead>
            <tbody>
              {visibleEntries.length === 0 ? (
                <tr>
                  <td colSpan={readOnly ? 13 : 14} style={{ ...commonStyles.td(theme), textAlign: 'center', color: theme.muted, padding: '24px' }}>
                    No test entries found.
                  </td>
                </tr>
              ) : (
                visibleEntries.map((row, index) => {
                  const coverage = row.tcCreated > 0 ? (row.tcExecuted / row.tcCreated) * 100 : null;
                  const passRate = row.tcExecuted > 0 ? (row.tcPassed / row.tcExecuted) * 100 : null;

                  return (
                    <tr key={row.id} className={row.id === newRowId ? 'row-flash' : undefined} style={{ backgroundColor: index % 2 === 1 ? theme.inputBg : 'transparent' }}>
                      <td style={commonStyles.td(theme)}>{formatDate(row.date)}</td>
                      <td style={commonStyles.td(theme)}>{row.release || '—'}</td>
                      <td style={commonStyles.td(theme)}>{projectMap.get(row.projectId) || 'Unknown'}</td>
                      <td style={commonStyles.td(theme)}>{squadMap.get(row.squadId) || 'Unknown'}</td>
                      <td style={commonStyles.td(theme)}>{row.addedByName}</td>
                      <td style={commonStyles.td(theme)}>
                        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '250px' }}>
                          <a
                            href={row.jiraStoryLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: theme.blue, fontWeight: 500, textDecoration: 'none', wordBreak: 'break-all', fontSize: '13px' }}
                          >
                            {row.jiraStorySummary || 'Link'}
                          </a>
                        </div>
                      </td>
                      <td style={commonStyles.td(theme)}>{row.tcCreated}</td>
                      <td style={commonStyles.td(theme)}>{row.tcExecuted}</td>
                      <td style={commonStyles.td(theme)}>{row.tcPassed}</td>
                      <td style={commonStyles.td(theme)}>{row.tcFailed}</td>
                      
                      <td style={{ ...commonStyles.td(theme), fontWeight: 600, color: coverage !== null ? (coverage >= 80 ? theme.green : coverage >= 50 ? theme.amber : theme.red) : theme.text }}>
                        {coverage !== null ? `${coverage.toFixed(1)}%` : '—'}
                      </td>
                      <td style={{ ...commonStyles.td(theme), fontWeight: 600, color: passRate !== null ? (passRate >= 80 ? theme.green : passRate >= 50 ? theme.amber : theme.red) : theme.text }}>
                        {passRate !== null ? `${passRate.toFixed(1)}%` : '—'}
                      </td>

                      <td style={commonStyles.td(theme)}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <span style={{ fontSize: '12px' }}>{row.notes || '—'}</span>
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
