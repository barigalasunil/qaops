/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ThemeTokens, commonStyles } from '../theme';
import { AppState, ReleaseEntry, Sprint, User } from '../types';
import { formatDate, formatDateTime, generateId, sanitise } from '../utils';
import { Field, ViewOnlyBanner } from './Shared';
import { Edit3, HelpCircle, Trash2 } from 'lucide-react';

interface CyclesProps {
  currentUser: User;
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  showToast: (msg: string, type: 'success' | 'error') => void;
  theme: ThemeTokens;
  readOnly?: boolean;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function Releases({ currentUser, appState, setAppState, showToast, theme, readOnly = false }: CyclesProps) {
  const [activeTab, setActiveTab] = useState<'names' | 'sprints' | 'log'>('names');
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
    totalStoryPoints: '',
    uatStoryPoints: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDeleteReleaseId, setConfirmDeleteReleaseId] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<ReleaseEntry | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const editFormRef = useRef<Record<string, any>>({});

  // Sprint form state
  const [sprintForm, setSprintForm] = useState({ name: '', startDate: '', endDate: '' });
  const [sprintErrors, setSprintErrors] = useState<Record<string, string>>({});
  const [confirmDeleteSprintId, setConfirmDeleteSprintId] = useState<string | null>(null);

  const updateForm = (key: keyof typeof form, value: string, extras: Partial<typeof form> = {}) => {
    setForm(previous => ({ ...previous, [key]: value, ...extras }));
    setErrors(previous => {
      const next = { ...previous };
      delete next[key];
      Object.keys(extras).forEach(extraKey => delete next[extraKey]);
      if (key === 'regressionStartDate' || key === 'regressionEndDate') delete next.regressionEndDate;
      if (key === 'betaDate' || key === 'prodReleaseDate') delete next.prodReleaseDate;
      if (key === 'totalStoryPoints' || key === 'uatStoryPoints') {
        delete next.totalStoryPoints;
        delete next.uatStoryPoints;
      }
      return next;
    });
  };

  useEffect(() => {
    editFormRef.current = editForm;
  }, [editForm]);

  const projectOptions = useMemo(() => appState.projects.map(project => ({ value: project.id, label: project.name })), [appState.projects]);
  const squadOptions = useMemo(() => appState.squads
    .filter(squad => !form.projectId || !squad.projectId || squad.projectId === form.projectId)
    .map(squad => ({ value: squad.id, label: squad.name })), [appState.squads, form.projectId]);
  const editSquadOptions = useMemo(() => appState.squads
    .filter(squad => !editForm.projectId || !squad.projectId || squad.projectId === editForm.projectId)
    .map(squad => ({ value: squad.id, label: squad.name })), [appState.squads, editForm.projectId]);
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

  const sprints = useMemo(() => {
    return [...(appState.sprints || [])].sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [appState.sprints]);

  const normaliseStoryPoints = (value: unknown) => {
    if (value === '' || value === null || value === undefined) return null;
    return Number(value);
  };

  const validateStoryPoints = (values: { totalStoryPoints?: unknown; uatStoryPoints?: unknown }) => {
    const nextErrors: Record<string, string> = {};
    const total = normaliseStoryPoints(values.totalStoryPoints);
    const uat = normaliseStoryPoints(values.uatStoryPoints);
    if (total !== null && (!Number.isInteger(total) || total < 0)) nextErrors.totalStoryPoints = 'Must be a non-negative integer';
    if (uat !== null && (!Number.isInteger(uat) || uat < 0)) nextErrors.uatStoryPoints = 'Must be a non-negative integer';
    if (total !== null && uat !== null && uat > total) nextErrors.uatStoryPoints = 'UAT story points cannot exceed total story points';
    return nextErrors;
  };

  const storyPointValue = (value: unknown) => value === null || value === undefined || value === '' ? '—' : String(value);

  const uatCoverage = (entry: ReleaseEntry | Record<string, any>) => {
    const total = normaliseStoryPoints(entry.totalStoryPoints);
    const uat = normaliseStoryPoints(entry.uatStoryPoints);
    if (total === null || uat === null || total <= 0) return null;
    return Math.round((uat / total) * 100);
  };

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
    Object.assign(nextErrors, validateStoryPoints(form));
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
      totalStoryPoints: normaliseStoryPoints(form.totalStoryPoints),
      uatStoryPoints: normaliseStoryPoints(form.uatStoryPoints),
      addedBy: currentUser.id,
      addedByName: currentUser.username,
      createdAt: new Date().toISOString(),
      lastEditedBy: null,
      lastEditedAt: null,
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
      totalStoryPoints: '',
      uatStoryPoints: '',
    });
    showToast('Release entry saved.', 'success');
  };

  const handleDeleteEntry = (id: string) => {
    setConfirmDeleteReleaseId(id);
  };

  const handleConfirmDeleteRelease = () => {
    const id = confirmDeleteReleaseId;
    if (!id) return;
    setAppState(previous => ({ ...previous, releaseEntries: previous.releaseEntries.filter(entry => entry.id !== id) }));
    showToast('Release entry deleted.', 'success');
    setConfirmDeleteReleaseId(null);
  };

  const canEditEntry = (entry: ReleaseEntry) => {
    if (readOnly) return false;
    if (currentUser.role === 'superadmin' || currentUser.role === 'admin') return true;
    return (currentUser.role === 'lead' || currentUser.role === 'member') && entry.addedBy === currentUser.id;
  };

  const openEdit = (entry: ReleaseEntry) => {
    const copy = {
      ...entry,
      regressionStartDate: entry.regressionStartDate || '',
      regressionEndDate: entry.regressionEndDate || '',
      betaDate: entry.betaDate || '',
      prodReleaseDate: entry.prodReleaseDate || '',
      totalStoryPoints: entry.totalStoryPoints ?? '',
      uatStoryPoints: entry.uatStoryPoints ?? '',
    };
    setEditErrors({});
    setEditForm(copy);
    editFormRef.current = copy;
    setEditModal(entry);
  };

  const updateEditField = (field: string, value: any) => {
    setEditForm(previous => ({ ...previous, [field]: value }));
    setEditErrors(previous => {
      const next = { ...previous };
      delete next[field];
      if (field === 'projectId') delete next.squadId;
      if (field === 'regressionStartDate' || field === 'regressionEndDate') delete next.regressionEndDate;
      if (field === 'totalStoryPoints' || field === 'uatStoryPoints') {
        delete next.totalStoryPoints;
        delete next.uatStoryPoints;
      }
      return next;
    });
  };

  const saveEdit = () => {
    const formValues = editFormRef.current;
    const nextErrors: Record<string, string> = {};
    if (!String(formValues.releaseName || '').trim()) nextErrors.releaseName = 'Required';
    if (!formValues.projectId) nextErrors.projectId = 'Required';
    if (!formValues.squadId) nextErrors.squadId = 'Required';
    if (!formValues.releaseDate) nextErrors.releaseDate = 'Required';
    if (formValues.regressionEndDate && formValues.regressionStartDate && new Date(formValues.regressionEndDate) < new Date(formValues.regressionStartDate)) {
      nextErrors.regressionEndDate = 'Must be after Regression Start Date';
    }
    if (formValues.prodReleaseDate && formValues.betaDate && formValues.prodReleaseDate < formValues.betaDate) {
      nextErrors.prodReleaseDate = 'PROD Release Date must be on or after Beta Date.';
    }
    Object.assign(nextErrors, validateStoryPoints(formValues));
    if (Object.keys(nextErrors).length > 0) {
      setEditErrors(nextErrors);
      return;
    }

    const cleanReleaseName = sanitise(String(formValues.releaseName).trim());
    const updated: ReleaseEntry = {
      ...(formValues as ReleaseEntry),
      releaseName: cleanReleaseName,
      regressionStartDate: formValues.regressionStartDate || undefined,
      regressionEndDate: formValues.regressionEndDate || undefined,
      betaDate: formValues.betaDate || undefined,
      prodReleaseDate: formValues.prodReleaseDate || undefined,
      totalStoryPoints: normaliseStoryPoints(formValues.totalStoryPoints),
      uatStoryPoints: normaliseStoryPoints(formValues.uatStoryPoints),
      lastEditedBy: currentUser.username,
      lastEditedAt: new Date().toISOString(),
    };

    setAppState(previous => ({
      ...previous,
      releaseEntries: previous.releaseEntries.map(entry => entry.id === updated.id ? updated : entry),
      releaseNames: (previous.releaseNames || []).some(release => release.name === updated.releaseName)
        ? previous.releaseNames
        : [...(previous.releaseNames || []), { id: generateId(), name: updated.releaseName }],
    }));
    setEditModal(null);
    setEditForm({});
    setEditErrors({});
    showToast('Release entry updated.', 'success');
  };

  const handleAddSprint = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!sprintForm.name.trim()) nextErrors.name = 'Sprint name is required.';
    if (!sprintForm.startDate) nextErrors.startDate = 'Start date is required.';
    if (!sprintForm.endDate) nextErrors.endDate = 'End date is required.';
    if (sprintForm.startDate && sprintForm.endDate && sprintForm.endDate < sprintForm.startDate) {
      nextErrors.endDate = 'End date must be after start date.';
    }
    if (sprintForm.name.trim() && (appState.sprints || []).some(s => s.name.toLowerCase() === sprintForm.name.trim().toLowerCase())) {
      nextErrors.name = 'Sprint name already exists.';
    }
    setSprintErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const newSprint: Sprint = {
      id: generateId(),
      name: sanitise(sprintForm.name.trim()),
      startDate: sprintForm.startDate,
      endDate: sprintForm.endDate,
    };
    setAppState(previous => ({
      ...previous,
      sprints: [...(previous.sprints || []), newSprint],
    }));
    setSprintForm({ name: '', startDate: '', endDate: '' });
    showToast('Sprint added.', 'success');
  };

  const handleDeleteSprint = (id: string) => {
    setConfirmDeleteSprintId(id);
  };

  const handleConfirmDeleteSprint = () => {
    const id = confirmDeleteSprintId;
    if (!id) return;
    setAppState(previous => ({
      ...previous,
      sprints: (previous.sprints || []).filter(s => s.id !== id),
    }));
    showToast('Sprint removed.', 'success');
    setConfirmDeleteSprintId(null);
  };

  const calcDuration = (start: string, end: string) => {
    const s = new Date(start + 'T00:00:00');
    const e = new Date(end + 'T00:00:00');
    return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
  };

  const hasSetupData = appState.projects.length > 0 && appState.squads.length > 0;
  const logSquads = appState.squads.filter(squad => !filters.projectId || squad.projectId === filters.projectId);

  const renderReleaseCard = (entry: ReleaseEntry) => {
    const coverage = uatCoverage(entry);
    const canEdit = canEditEntry(entry);
    return (
      <article key={entry.id} style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '14px', backgroundColor: theme.inputBg, position: 'relative' }}>
        <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '6px', alignItems: 'center' }}>
          {canEdit && (
            <button type="button" onClick={() => openEdit(entry)} title="Edit release entry" style={{ ...commonStyles.button(theme, 'secondary', 'sm'), border: `1px solid ${theme.border}`, backgroundColor: theme.card }}>
              <Edit3 size={13} />
              Edit
            </button>
          )}
          {canDelete && <button onClick={() => handleDeleteEntry(entry.id)} title="Delete release entry" style={{ padding: '4px', border: 0, background: 'transparent', color: theme.red, cursor: 'pointer' }}><Trash2 size={15} /></button>}
        </div>
        <h4 style={{ margin: '0 104px 12px 0', color: theme.blue, fontSize: '15px' }}>{entry.releaseName}</h4>
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
          ].map(([label, value]) => (
            <div key={label}>
              <div style={{ color: theme.muted, fontSize: '10px', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
              <div style={{ marginTop: '2px', color: theme.text, fontWeight: 500 }}>{value}</div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: `1px solid ${theme.border}`, marginTop: '12px', paddingTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', fontSize: '12px' }}>
          <div>
            <div style={{ color: theme.muted, fontSize: '10px', textTransform: 'uppercase', fontWeight: 700 }}>Total Story Points</div>
            <div style={{ marginTop: '2px', color: theme.text, fontWeight: 700 }}>{storyPointValue(entry.totalStoryPoints)}</div>
          </div>
          <div>
            <div style={{ color: theme.muted, fontSize: '10px', textTransform: 'uppercase', fontWeight: 700 }}>UAT Applicable SP</div>
            <div style={{ marginTop: '2px', color: theme.text, fontWeight: 700 }}>{storyPointValue(entry.uatStoryPoints)}</div>
          </div>
          {coverage !== null && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ color: theme.muted, fontSize: '10px', textTransform: 'uppercase', fontWeight: 700 }}>UAT Coverage</div>
              <div style={{ marginTop: '2px', color: coverage >= 80 ? theme.green : coverage >= 50 ? theme.amber : theme.red, fontWeight: 800 }}>{coverage}%</div>
            </div>
          )}
        </div>
        <div style={{ borderTop: `1px solid ${theme.border}`, marginTop: '10px', paddingTop: '8px', color: theme.muted, fontSize: '11px' }}>
          Submitted on {formatDateTime(entry.createdAt)}
          {entry.lastEditedBy && entry.lastEditedAt && (
            <div style={{ marginTop: '4px', color: theme.text }}>Last edited by {entry.lastEditedBy} · {formatDateTime(entry.lastEditedAt)}</div>
          )}
        </div>
      </article>
    );
  };

  const renderSprintsTab = () => (
    <>
      {!readOnly && (
        <div style={commonStyles.card(theme)}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>Add Sprint</h3>
          <form noValidate onSubmit={handleAddSprint} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'end' }}>
            <Field label="Sprint Name" type="text" value={sprintForm.name} onChange={value => { setSprintForm(prev => ({ ...prev, name: value })); setSprintErrors(prev => { const n = { ...prev }; delete n.name; return n; }); }} error={sprintErrors.name} placeholder="e.g. Sprint 14" required theme={theme} />
            <Field label="Start Date" type="date" value={sprintForm.startDate} onChange={value => { setSprintForm(prev => ({ ...prev, startDate: value })); setSprintErrors(prev => { const n = { ...prev }; delete n.startDate; return n; }); }} error={sprintErrors.startDate} required theme={theme} />
            <Field label="End Date" type="date" value={sprintForm.endDate} onChange={value => { setSprintForm(prev => ({ ...prev, endDate: value })); setSprintErrors(prev => { const n = { ...prev }; delete n.endDate; return n; }); }} error={sprintErrors.endDate} required theme={theme} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignSelf: 'end' }}>
              <button type="submit" style={commonStyles.button(theme, 'primary')}>Add Sprint</button>
            </div>
          </form>
        </div>
      )}

      <section style={commonStyles.card(theme)}>
        <h3 style={{ margin: '0 0 14px', fontSize: '18px' }}>Sprints</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={commonStyles.table(theme)}>
            <thead>
              <tr>
                <th style={commonStyles.th(theme)}>Sprint Name</th>
                <th style={commonStyles.th(theme)}>Start Date</th>
                <th style={commonStyles.th(theme)}>End Date</th>
                <th style={commonStyles.th(theme)}>Duration</th>
                {!readOnly && <th style={{ ...commonStyles.th(theme), width: '80px' }}>Remove</th>}
              </tr>
            </thead>
            <tbody>
              {sprints.length === 0 ? (
                <tr>
                  <td colSpan={readOnly ? 4 : 5} style={{ ...commonStyles.td(theme), textAlign: 'center', color: theme.muted, padding: '24px' }}>
                    No sprints added yet.
                  </td>
                </tr>
              ) : sprints.map((sprint, index) => (
                <tr key={sprint.id} style={{ backgroundColor: index % 2 === 1 ? theme.inputBg : 'transparent' }}>
                  <td style={{ ...commonStyles.td(theme), fontWeight: 700 }}>{sprint.name}</td>
                  <td style={commonStyles.td(theme)}>{formatDate(sprint.startDate)}</td>
                  <td style={commonStyles.td(theme)}>{formatDate(sprint.endDate)}</td>
                  <td style={commonStyles.td(theme)}>{calcDuration(sprint.startDate, sprint.endDate)} days</td>
                  {!readOnly && (
                    <td style={commonStyles.td(theme)}>
                      <button onClick={() => handleDeleteSprint(sprint.id)} title="Remove sprint" style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', color: theme.red, cursor: 'pointer' }}><Trash2 size={15} /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {readOnly && <ViewOnlyBanner theme={theme} />}
      <div style={{ display: 'flex', gap: '16px', borderBottom: `2px solid ${theme.border}` }}>
        {([['names', 'Release Names'], ['sprints', 'Sprints'], ['log', 'Release Log']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{
            padding: '12px 16px', border: 0, background: 'transparent', cursor: 'pointer',
            borderBottom: activeTab === id ? `3px solid ${theme.blue}` : '3px solid transparent',
            color: activeTab === id ? theme.blue : theme.muted, fontWeight: 700,
          }}>{label}</button>
        ))}
      </div>

      {activeTab === 'names' && (
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
                <Field label="Total Story Points" type="number" value={form.totalStoryPoints} onChange={value => updateForm('totalStoryPoints', String(value))} error={errors.totalStoryPoints} helper="Total SP planned for this release" min={0} theme={theme} />
                <Field label="UAT Applicable Story Points" type="number" value={form.uatStoryPoints} onChange={value => updateForm('uatStoryPoints', String(value))} error={errors.uatStoryPoints} helper="SP that need UAT sign-off" min={0} theme={theme} />
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
                {currentMonthReleases.map(entry => renderReleaseCard(entry))}
              </div>
            )}
          </section>
        </>
      )}

      {activeTab === 'sprints' && renderSprintsTab()}

      {activeTab === 'log' && (
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
                {group.entries.map(entry => renderReleaseCard(entry))}
              </div>
            </section>
          ))}
        </>
      )}

      {editModal && (
        <div
          onClick={() => setEditModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 9000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            overflowY: 'auto',
            boxSizing: 'border-box',
          }}
        >
          <div
            onClick={event => event.stopPropagation()}
            style={{
              background: theme.card,
              border: `1px solid ${theme.border}`,
              borderRadius: 12,
              padding: 28,
              width: '100%',
              maxWidth: 560,
              maxHeight: 'calc(100vh - 32px)',
              overflowY: 'auto',
              boxSizing: 'border-box',
              boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
            }}
          >
            <h3 style={{ margin: '0 0 18px', fontSize: '18px' }}>Edit Release Entry</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Release Name" type="text" value={editForm.releaseName || ''} onChange={value => updateEditField('releaseName', value)} error={editErrors.releaseName} required theme={theme} />
              </div>
              <Field label="Project" type="select" value={editForm.projectId || ''} onChange={value => updateEditField('projectId', value)} error={editErrors.projectId} options={projectOptions} placeholder="Select Project" required theme={theme} />
              <Field label="Squad" type="select" value={editForm.squadId || ''} onChange={value => updateEditField('squadId', value)} error={editErrors.squadId} options={editSquadOptions} placeholder="Select Squad" required theme={theme} />
              <Field label="QA Release Date" type="date" value={editForm.releaseDate || ''} onChange={value => updateEditField('releaseDate', value)} error={editErrors.releaseDate} required theme={theme} />
              <Field label="Regression Start Date" type="date" value={editForm.regressionStartDate || ''} onChange={value => updateEditField('regressionStartDate', value)} theme={theme} />
              <Field label="Regression End Date" type="date" value={editForm.regressionEndDate || ''} onChange={value => updateEditField('regressionEndDate', value)} error={editErrors.regressionEndDate} theme={theme} />
              <Field label="Beta Phase Date" type="date" value={editForm.betaDate || ''} onChange={value => updateEditField('betaDate', value)} theme={theme} />
              <Field label="PROD Release Date" type="date" value={editForm.prodReleaseDate || ''} onChange={value => updateEditField('prodReleaseDate', value)} error={editErrors.prodReleaseDate} theme={theme} />
              <Field label="Total Story Points" type="number" value={editForm.totalStoryPoints ?? ''} onChange={value => updateEditField('totalStoryPoints', String(value))} error={editErrors.totalStoryPoints} min={0} theme={theme} />
              <Field label="UAT Applicable SP" type="number" value={editForm.uatStoryPoints ?? ''} onChange={value => updateEditField('uatStoryPoints', String(value))} error={editErrors.uatStoryPoints} min={0} theme={theme} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22, borderTop: `1px solid ${theme.border}`, paddingTop: 16 }}>
              <button type="button" onClick={() => { setEditModal(null); setEditForm({}); setEditErrors({}); }} style={commonStyles.button(theme, 'secondary')}>Cancel</button>
              <button type="button" onClick={saveEdit} style={commonStyles.button(theme, 'primary')}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteReleaseId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 12, padding: '32px 28px', width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '18px' }}>Delete Release Entry?</h3>
            <p style={{ fontSize: '14px', color: theme.text, margin: '0 0 24px' }}>Are you sure you want to delete this release entry?</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setConfirmDeleteReleaseId(null)} style={commonStyles.button(theme, 'secondary')}>Cancel</button>
              <button type="button" onClick={handleConfirmDeleteRelease} style={{ ...commonStyles.button(theme, 'primary'), backgroundColor: theme.red, borderColor: theme.red }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteSprintId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 12, padding: '32px 28px', width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '18px' }}>Remove Sprint?</h3>
            <p style={{ fontSize: '14px', color: theme.text, margin: '0 0 24px' }}>Are you sure you want to remove this sprint?</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setConfirmDeleteSprintId(null)} style={commonStyles.button(theme, 'secondary')}>Cancel</button>
              <button type="button" onClick={handleConfirmDeleteSprint} style={{ ...commonStyles.button(theme, 'primary'), backgroundColor: theme.red, borderColor: theme.red }}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
