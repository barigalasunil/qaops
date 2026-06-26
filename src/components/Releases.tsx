/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { ThemeTokens, commonStyles } from '../theme';
import { AppState, ReleaseEntry, User } from '../types';
import { formatDate, formatDateTime, generateId, sanitise } from '../utils';
import { Field, ViewOnlyBanner } from './Shared';
import { HelpCircle, Trash2 } from 'lucide-react';

interface ReleasesProps {
  currentUser: User;
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  showToast: (msg: string, type: 'success' | 'error') => void;
  theme: ThemeTokens;
  readOnly?: boolean;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function Releases({ currentUser, appState, setAppState, showToast, theme, readOnly = false }: ReleasesProps) {
  const [activeTab, setActiveTab] = useState<'manage' | 'log'>('manage');
  const [filters, setFilters] = useState({ projectId: '', squadId: '', month: '', year: '' });
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthKey = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const yearOptions = Array.from({ length: 5 }, (_, index) => currentYear - 2 + index);
  const canDelete = !readOnly && (currentUser.role === 'superadmin' || currentUser.role === 'admin');
  const showFullFilters = currentUser.role !== 'member';

  const [form, setForm] = useState({
    releaseName: '',
    projectId: currentUser.projectId || '',
    squadId: currentUser.squadId || '',
    releaseDate: '',
    regressionStartDate: '',
    regressionEndDate: '',
    betaDate: '',
    prodReleaseDate: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const updateForm = (key: keyof typeof form, value: string, extras: Partial<typeof form> = {}) => {
    setForm(previous => ({ ...previous, [key]: value, ...extras }));
    setErrors(previous => {
      const next = { ...previous };
      delete next[key];
      Object.keys(extras).forEach(extraKey => delete next[extraKey]);
      if (key === 'regressionStartDate' || key === 'regressionEndDate') delete next.regressionEndDate;
      if (key === 'betaDate' || key === 'prodReleaseDate') delete next.prodReleaseDate;
      return next;
    });
  };

  const projectOptions = useMemo(() => appState.projects.map(project => ({ value: project.id, label: project.name })), [appState.projects]);
  const squadOptions = useMemo(() => appState.squads
    .filter(squad => !form.projectId || !squad.projectId || squad.projectId === form.projectId)
    .map(squad => ({ value: squad.id, label: squad.name })), [appState.squads, form.projectId]);
  const projectMap = useMemo(() => new Map(appState.projects.map(project => [project.id, project.name])), [appState.projects]);
  const squadMap = useMemo(() => new Map(appState.squads.map(squad => [squad.id, squad.name])), [appState.squads]);

  const currentMonthReleases = useMemo(() => appState.releaseEntries
    .filter(entry => entry.releaseDate.slice(0, 7) === currentMonthKey)
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate)), [appState.releaseEntries, currentMonthKey]);

  const filteredReleases = useMemo(() => appState.releaseEntries.filter(entry => {
    if (entry.releaseDate.slice(0, 7) === currentMonthKey) return false;
    if (filters.projectId && entry.projectId !== filters.projectId) return false;
    if (filters.squadId && entry.squadId !== filters.squadId) return false;
    const date = new Date(`${entry.releaseDate}T00:00:00`);
    if (filters.month && date.getMonth() + 1 !== Number(filters.month)) return false;
    if (filters.year && date.getFullYear() !== Number(filters.year)) return false;
    return true;
  }), [appState.releaseEntries, currentMonthKey, filters]);

  const groupedReleases = useMemo(() => {
    const groups = new Map<string, ReleaseEntry[]>();
    filteredReleases.forEach(entry => {
      const key = entry.releaseDate.slice(0, 7);
      groups.set(key, [...(groups.get(key) || []), entry]);
    });
    return Array.from(groups.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, entries]) => ({
        key,
        label: new Date(`${key}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
        entries: entries.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate)),
      }));
  }, [filteredReleases]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.releaseName.trim()) nextErrors.releaseName = 'Release Name is required.';
    if (!form.projectId) nextErrors.projectId = 'Project is required.';
    if (!form.squadId) nextErrors.squadId = 'Squad is required.';
    if (!form.releaseDate) nextErrors.releaseDate = 'Release Date is required.';
    if (form.regressionEndDate && form.regressionStartDate && form.regressionEndDate <= form.regressionStartDate) {
      nextErrors.regressionEndDate = 'Regression End Date must be after Regression Start Date.';
    }
    if (form.prodReleaseDate && form.betaDate && form.prodReleaseDate < form.betaDate) {
      nextErrors.prodReleaseDate = 'PROD Release Date must be on or after Beta Date.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const cleanReleaseName = sanitise(form.releaseName.trim());
    const entry: ReleaseEntry = {
      id: generateId(),
      releaseName: cleanReleaseName,
      projectId: form.projectId,
      squadId: form.squadId,
      releaseDate: form.releaseDate,
      regressionStartDate: form.regressionStartDate || undefined,
      regressionEndDate: form.regressionEndDate || undefined,
      betaDate: form.betaDate || undefined,
      prodReleaseDate: form.prodReleaseDate || undefined,
      addedBy: currentUser.id,
      addedByName: currentUser.username,
      createdAt: new Date().toISOString(),
    };
    setAppState(previous => ({
      ...previous,
      releaseEntries: [...previous.releaseEntries, entry],
      releaseNames: (previous.releaseNames || []).some(release => release.name.toLowerCase() === cleanReleaseName.toLowerCase())
        ? previous.releaseNames
        : [...(previous.releaseNames || []), { id: generateId(), name: cleanReleaseName }],
      auditLog: [{
        id: generateId(),
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        username: currentUser.username,
        role: currentUser.role,
        action: 'RELEASE_ADD',
        details: `Added release ${cleanReleaseName}`,
        ipHint: 'Browser session',
      }, ...(previous.auditLog || [])].slice(0, 500),
    }));
    setForm({
      releaseName: '',
      projectId: currentUser.projectId || '',
      squadId: currentUser.squadId || '',
      releaseDate: '',
      regressionStartDate: '',
      regressionEndDate: '',
      betaDate: '',
      prodReleaseDate: '',
    });
    showToast('Release entry saved.', 'success');
  };

  const handleDeleteEntry = (id: string) => {
    if (!confirm('Delete this release entry?')) return;
    setAppState(previous => ({ ...previous, releaseEntries: previous.releaseEntries.filter(entry => entry.id !== id) }));
    showToast('Release entry deleted.', 'success');
  };

  const hasSetupData = appState.projects.length > 0 && appState.squads.length > 0;
  const logSquads = appState.squads.filter(squad => !filters.projectId || squad.projectId === filters.projectId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {readOnly && <ViewOnlyBanner theme={theme} />}
      <div style={{ display: 'flex', gap: '16px', borderBottom: `2px solid ${theme.border}` }}>
        {([['manage', 'Manage Releases'], ['log', 'Release Log']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{
            padding: '12px 16px', border: 0, background: 'transparent', cursor: 'pointer',
            borderBottom: activeTab === id ? `3px solid ${theme.blue}` : '3px solid transparent',
            color: activeTab === id ? theme.blue : theme.muted, fontWeight: 700,
          }}>{label}</button>
        ))}
      </div>

      {activeTab === 'manage' ? (
        <>
          {!hasSetupData && (
            <div style={{ padding: '16px', backgroundColor: `${theme.amber}1a`, border: `1px solid ${theme.amber}`, borderRadius: '8px', display: 'flex', gap: '12px' }}>
              <HelpCircle size={20} color={theme.amber} />
              <span><strong>Setup Required:</strong> Add Projects and Squads in Settings first.</span>
            </div>
          )}

          {hasSetupData && !readOnly && (
            <div style={commonStyles.card(theme)}>
              <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>Add Release Schedule</h3>
              <form noValidate onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <Field label="Release Name" type="text" value={form.releaseName} onChange={value => updateForm('releaseName', value)} error={errors.releaseName} placeholder="e.g. Release 2026.07" required theme={theme} />
                <Field label="Project" type="select" value={form.projectId} onChange={value => updateForm('projectId', value, { squadId: '' })} error={errors.projectId} options={projectOptions} placeholder="Select Project" required theme={theme} />
                <Field label="Squad" type="select" value={form.squadId} onChange={value => updateForm('squadId', value)} error={errors.squadId} options={squadOptions} placeholder="Select Squad" required theme={theme} />
                <Field label="QA Release Date" type="date" value={form.releaseDate} onChange={value => updateForm('releaseDate', value)} error={errors.releaseDate} required theme={theme} />
                <Field label="Regression Start Date" type="date" value={form.regressionStartDate} onChange={value => updateForm('regressionStartDate', value)} theme={theme} />
                <Field label="Regression End Date" type="date" value={form.regressionEndDate} onChange={value => updateForm('regressionEndDate', value)} error={errors.regressionEndDate} theme={theme} />
                <Field label="Beta Phase Date" type="date" value={form.betaDate} onChange={value => updateForm('betaDate', value)} theme={theme} />
                <Field label="PROD Release Date" type="date" value={form.prodReleaseDate} onChange={value => updateForm('prodReleaseDate', value)} error={errors.prodReleaseDate} theme={theme} />
                <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" style={commonStyles.button(theme, 'primary')}>Add Release</button>
                </div>
              </form>
            </div>
          )}

          <section style={commonStyles.card(theme)}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '18px' }}>
                {now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} Releases
              </h3>
              <span style={{ padding: '3px 8px', borderRadius: '999px', backgroundColor: `${theme.blue}18`, color: theme.blue, fontSize: '11px', fontWeight: 700 }}>
                {currentMonthReleases.length} release{currentMonthReleases.length === 1 ? '' : 's'}
              </span>
            </div>
            {currentMonthReleases.length === 0 ? (
              <div style={{ color: theme.muted, textAlign: 'center', padding: '20px' }}>No releases scheduled for the current month.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(285px, 1fr))', gap: '12px' }}>
                {currentMonthReleases.map(entry => (
                  <article key={entry.id} style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '14px', backgroundColor: theme.inputBg, position: 'relative' }}>
                    {canDelete && <button onClick={() => handleDeleteEntry(entry.id)} title="Delete release entry" style={{ position: 'absolute', top: '10px', right: '10px', border: 0, background: 'transparent', color: theme.red, cursor: 'pointer' }}><Trash2 size={15} /></button>}
                    <h4 style={{ margin: '0 28px 12px 0', color: theme.blue, fontSize: '15px' }}>{entry.releaseName}</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px 14px', fontSize: '12px' }}>
                      {[
                        ['Project', projectMap.get(entry.projectId) || 'Unknown'],
                        ['Squad', squadMap.get(entry.squadId) || 'Unknown'],
                        ['Added By', entry.addedByName],
                        ['Release Date', formatDate(entry.releaseDate)],
                        ['Regression Start', formatDate(entry.regressionStartDate || '')],
                        ['Regression End', formatDate(entry.regressionEndDate || '')],
                        ['Beta Date', formatDate(entry.betaDate || '')],
                        ['PROD Date', formatDate(entry.prodReleaseDate || '')],
                        ['Submitted On', formatDateTime(entry.createdAt)],
                      ].map(([label, value]) => (
                        <div key={label} style={label === 'Submitted On' ? { gridColumn: '1 / -1' } : undefined}>
                          <div style={{ color: theme.muted, fontSize: '10px', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
                          <div style={{ marginTop: '2px', color: theme.text, fontWeight: 500 }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <div style={{ ...commonStyles.card(theme), display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {showFullFilters && currentUser.role === 'superadmin' && (
              <div style={{ minWidth: '170px', flex: 1 }}>
                <Field label="Project" type="select" value={filters.projectId} onChange={value => setFilters(previous => ({ ...previous, projectId: value, squadId: '' }))} options={projectOptions} placeholder="All Projects" theme={theme} />
              </div>
            )}
            {showFullFilters && (
              <div style={{ minWidth: '170px', flex: 1 }}>
                <Field label="Squad" type="select" value={filters.squadId} onChange={value => setFilters(previous => ({ ...previous, squadId: value }))} options={logSquads.map(squad => ({ value: squad.id, label: squad.name }))} placeholder="All Squads" theme={theme} />
              </div>
            )}
            <div style={{ minWidth: '150px', flex: 1 }}>
              <Field label="Month" type="select" value={filters.month} onChange={value => setFilters(previous => ({ ...previous, month: value }))} options={MONTHS.map((month, index) => ({ value: String(index + 1), label: month }))} placeholder="All Months" theme={theme} />
            </div>
            <div style={{ minWidth: '120px', flex: 1 }}>
              <Field label="Year" type="select" value={filters.year} onChange={value => setFilters(previous => ({ ...previous, year: value }))} options={yearOptions.map(year => ({ value: String(year), label: String(year) }))} placeholder="All Years" theme={theme} />
            </div>
          </div>

          {groupedReleases.length === 0 ? (
            <div style={{ ...commonStyles.card(theme), color: theme.muted, textAlign: 'center', padding: '28px' }}>No past or future release entries match the selected filters.</div>
          ) : groupedReleases.map(group => (
            <section key={group.key} style={commonStyles.card(theme)}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '18px' }}>{group.label}</h3>
                <span style={{ padding: '3px 8px', borderRadius: '999px', backgroundColor: `${theme.blue}18`, color: theme.blue, fontSize: '11px', fontWeight: 700 }}>{group.entries.length} release{group.entries.length === 1 ? '' : 's'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(285px, 1fr))', gap: '12px' }}>
                {group.entries.map(entry => (
                  <article key={entry.id} style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '14px', backgroundColor: theme.inputBg, position: 'relative' }}>
                    {canDelete && <button onClick={() => handleDeleteEntry(entry.id)} title="Delete release entry" style={{ position: 'absolute', top: '10px', right: '10px', border: 0, background: 'transparent', color: theme.red, cursor: 'pointer' }}><Trash2 size={15} /></button>}
                    <h4 style={{ margin: '0 28px 12px 0', color: theme.blue, fontSize: '15px' }}>{entry.releaseName}</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px 14px', fontSize: '12px' }}>
                      {[
                        ['Project', projectMap.get(entry.projectId) || 'Unknown'],
                        ['Squad', squadMap.get(entry.squadId) || 'Unknown'],
                        ['Added By', entry.addedByName],
                        ['Release Date', formatDate(entry.releaseDate)],
                        ['Regression Start', formatDate(entry.regressionStartDate || '')],
                        ['Regression End', formatDate(entry.regressionEndDate || '')],
                        ['Beta Date', formatDate(entry.betaDate || '')],
                        ['PROD Date', formatDate(entry.prodReleaseDate || '')],
                        ['Submitted On', formatDateTime(entry.createdAt)],
                      ].map(([label, value]) => (
                        <div key={label} style={label === 'Submitted On' ? { gridColumn: '1 / -1' } : undefined}>
                          <div style={{ color: theme.muted, fontSize: '10px', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
                          <div style={{ marginTop: '2px', color: theme.text, fontWeight: 500 }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
