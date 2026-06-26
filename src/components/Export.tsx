/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { ThemeTokens, commonStyles } from '../theme';
import { AppState, User, WorkingDay } from '../types';
import { exportToCSV, exportToExcel, formatDate, generateId } from '../utils';
import { BarChart3, Bug, CalendarDays, CheckCircle2, Clock, Download, FileSpreadsheet, Loader2, Rocket, Settings, XCircle } from 'lucide-react';

interface ExportProps {
  currentUser: User;
  appState: AppState;
  theme: ThemeTokens;
  showToast: (msg: string, type: 'success' | 'error' | 'warning', duration?: number) => void;
}

type ReportKey = 'overall' | 'data' | 'defects' | 'releases' | 'timesheet' | 'builder';
type FilterState = {
  projectId: string;
  squadId: string;
  release: string;
  year: string;
  month: string;
  priority: string;
  sitMiss: string;
  employeeId: string;
  sections: ReportKey[];
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STATUS_COLORS: Record<WorkingDay['status'], string> = {
  Working: '#16a34a',
  WFH: '#2563eb',
  Leave: '#dc2626',
  Holiday: '#7c3aed',
  Training: '#d97706',
  Weekend: '#94a3b8',
};

const reportCards = [
  { id: 'overall' as ReportKey, icon: BarChart3, name: 'Overall Summary', description: 'KPIs, metrics and defect breakdown' },
  { id: 'data' as ReportKey, icon: CalendarDays, name: 'Data Entries', description: 'Stories tested and TC metrics' },
  { id: 'defects' as ReportKey, icon: Bug, name: 'Defect Log', description: 'All defects with SIT miss analysis' },
  { id: 'releases' as ReportKey, icon: Rocket, name: 'Release Roadmap', description: 'Release schedules and milestones' },
  { id: 'timesheet' as ReportKey, icon: Clock, name: 'Timesheet', description: 'Attendance and shift tracking' },
  { id: 'builder' as ReportKey, icon: Settings, name: 'Report Builder', description: 'Build a custom multi-section report' },
];

const sheetName = (value: string) => value.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet';

export function Export({ currentUser, appState, theme, showToast }: ExportProps) {
  const now = new Date();
  const [activeReport, setActiveReport] = useState<ReportKey>('overall');
  const [loading, setLoading] = useState(false);
  const [showAllData, setShowAllData] = useState(false);
  const [showAllDefects, setShowAllDefects] = useState(false);
  const [builderReady, setBuilderReady] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    projectId: currentUser.role === 'superadmin' ? '' : currentUser.projectId || '',
    squadId: '',
    release: '',
    year: String(now.getFullYear()),
    month: '',
    priority: '',
    sitMiss: '',
    employeeId: '',
    sections: ['overall', 'data', 'defects'],
  });

  const projectMap = useMemo(() => new Map(appState.projects.map(project => [project.id, project.name])), [appState.projects]);
  const squadMap = useMemo(() => new Map(appState.squads.map(squad => [squad.id, squad.name])), [appState.squads]);
  const releaseOptions = useMemo(() => Array.from(new Set([
    ...(appState.releaseNames || []).map(release => release.name),
    ...appState.dataEntries.map(entry => entry.release),
    ...appState.defects.map(defect => defect.release),
    ...appState.releaseEntries.map(entry => entry.releaseName),
  ].filter(Boolean))).sort(), [appState]);
  const years = useMemo(() => Array.from({ length: 5 }, (_, index) => String(now.getFullYear() - 2 + index)), [now]);

  const triggerLoading = () => {
    setLoading(true);
    window.setTimeout(() => setLoading(false), 380);
  };

  const setFilter = (key: keyof FilterState, value: string | ReportKey[]) => {
    setFilters(previous => ({ ...previous, [key]: value }));
    triggerLoading();
  };

  const resetHiddenFilters = (report: ReportKey) => {
    setActiveReport(report);
    setShowAllData(false);
    setShowAllDefects(false);
    setBuilderReady(false);
    setFilters(previous => ({
      ...previous,
      priority: report === 'defects' || report === 'builder' ? previous.priority : '',
      sitMiss: report === 'defects' || report === 'builder' ? previous.sitMiss : '',
      employeeId: report === 'timesheet' ? previous.employeeId : '',
      projectId: report === 'timesheet' ? '' : previous.projectId,
      release: report === 'timesheet' ? '' : previous.release,
    }));
    triggerLoading();
  };

  const resetFilters = () => {
    setFilters(previous => ({
      ...previous,
      projectId: currentUser.role === 'superadmin' ? '' : currentUser.projectId || '',
      squadId: '',
      release: '',
      month: '',
      priority: '',
      sitMiss: '',
      employeeId: '',
    }));
    triggerLoading();
  };

  const passesDate = (date = '') => {
    if (!date) return true;
    if (filters.year && date.slice(0, 4) !== filters.year) return false;
    if (filters.month && String(Number(date.slice(5, 7))) !== filters.month) return false;
    return true;
  };

  const passesScope = (record: { projectId?: string; squadId?: string; release?: string }) => {
    if (filters.projectId && record.projectId && record.projectId !== filters.projectId) return false;
    if (filters.squadId && record.squadId && record.squadId !== filters.squadId) return false;
    if (filters.release && record.release && record.release !== filters.release) return false;
    return true;
  };

  const dataRows = useMemo(() => appState.dataEntries
    .filter(entry => passesDate(entry.date) && passesScope(entry))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(entry => ({
      Date: entry.date,
      Release: entry.release,
      Project: projectMap.get(entry.projectId) || 'Unknown',
      Squad: squadMap.get(entry.squadId) || 'Unknown',
      Story: entry.jiraStorySummary,
      Story_Link: entry.jiraStoryLink,
      Status: entry.storyStatus || 'In Progress',
      TC_Mode: entry.tcExecuted === null ? 'TCs Only' : 'Full',
      TC_Cr: entry.tcCreated,
      TC_Ex: entry.tcExecuted ?? '',
      TC_Pa: entry.tcPassed ?? '',
      TC_Fa: entry.tcFailed ?? '',
      projectId: entry.projectId,
      squadId: entry.squadId,
    })), [appState.dataEntries, filters, projectMap, squadMap]);

  const defectRows = useMemo(() => appState.defects
    .filter(defect => passesDate(defect.date) && passesScope(defect))
    .filter(defect => !filters.priority || defect.priority === filters.priority)
    .filter(defect => !filters.sitMiss || (filters.sitMiss === 'yes' ? defect.sitMiss : !defect.sitMiss))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(defect => ({
      Date: defect.date,
      Release: defect.release,
      Project: projectMap.get(defect.projectId) || 'Unknown',
      Squad: squadMap.get(defect.squadId) || 'Unknown',
      Summary: defect.jiraDefectSummary,
      Link: defect.jiraDefectLink,
      Priority: defect.priority,
      SIT_Miss: defect.sitMiss ? 'YES' : 'NO',
      Status: defect.status,
      Age_Days: defectAge(defect.jiraCreatedDate || defect.date, defect.status, defect.resolvedDate).ageDays,
      Resolved_In_Days: defectAge(defect.jiraCreatedDate || defect.date, defect.status, defect.resolvedDate).resolvedInDays,
      projectId: defect.projectId,
      squadId: defect.squadId,
    })), [appState.defects, filters, projectMap, squadMap]);

  const releaseRows = useMemo(() => appState.releaseEntries
    .filter(release => passesDate(release.releaseDate) && passesScope({ projectId: release.projectId, squadId: release.squadId, release: release.releaseName }))
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))
    .map(release => ({
      Release: release.releaseName,
      Project: projectMap.get(release.projectId) || 'Unknown',
      Squad: squadMap.get(release.squadId) || 'Unknown',
      Release_Date: release.releaseDate,
      Regression: release.regressionStartDate || '',
      Beta: release.betaDate || '',
      PROD: release.prodReleaseDate || '',
      projectId: release.projectId,
      squadId: release.squadId,
    })), [appState.releaseEntries, filters, projectMap, squadMap]);

  const timesheetUsers = useMemo(() => appState.users
    .filter(user => !filters.employeeId || user.id === filters.employeeId)
    .filter(user => !filters.squadId || user.squadId === filters.squadId)
    .sort((a, b) => a.username.localeCompare(b.username)), [appState.users, filters.employeeId, filters.squadId]);

  const timesheetSummary = useMemo(() => timesheetUsers.map(user => {
    const month = `${filters.year}-${String(filters.month || now.getMonth() + 1).padStart(2, '0')}`;
    const entry = appState.timesheetEntries.find(item => item.userId === user.id && item.month === month);
    const counts = { Working: 0, WFH: 0, Leave: 0, Holiday: 0, Training: 0, Night: 0, Weekend: 0 };
    entry?.workingDays.forEach(day => {
      if (day.status in counts) counts[day.status as keyof typeof counts]++;
      if (day.isNightDeployment) counts.Night++;
      if (day.isWeekendSupport) counts.Weekend++;
    });
    return {
      Employee: user.username,
      Squad: squadMap.get(user.squadId || '') || 'Unassigned',
      Working: counts.Working,
      WFH: counts.WFH,
      Leave: counts.Leave,
      Holiday: counts.Holiday,
      Training: counts.Training,
      Night_Deploy: counts.Night,
      Weekend_Support: counts.Weekend,
    };
  }), [appState.timesheetEntries, filters.month, filters.year, now, squadMap, timesheetUsers]);

  const metrics = useMemo(() => {
    const created = dataRows.reduce((sum, row) => sum + Number(row.TC_Cr || 0), 0);
    const executed = dataRows.reduce((sum, row) => sum + Number(row.TC_Ex || 0), 0);
    const passed = dataRows.reduce((sum, row) => sum + Number(row.TC_Pa || 0), 0);
    const failed = dataRows.reduce((sum, row) => sum + Number(row.TC_Fa || 0), 0);
    const sit = defectRows.filter(row => row.SIT_Miss === 'YES').length;
    return {
      Stories: dataRows.length,
      'TC Created': created,
      'TC Executed': executed,
      'TC Passed': passed,
      'TC Failed': failed,
      'Coverage%': created ? `${((executed / created) * 100).toFixed(1)}%` : '0.0%',
      'Pass Rate%': executed ? `${((passed / executed) * 100).toFixed(1)}%` : '0.0%',
      'Fail Rate%': executed ? `${((failed / executed) * 100).toFixed(1)}%` : '0.0%',
      Defects: defectRows.length,
      'SIT Misses': sit,
      'SIT Miss%': defectRows.length ? `${((sit / defectRows.length) * 100).toFixed(1)}%` : '0.0%',
      P1: defectRows.filter(row => row.Priority === 'P1').length,
      P2: defectRows.filter(row => row.Priority === 'P2').length,
      P3: defectRows.filter(row => row.Priority === 'P3').length,
    };
  }, [dataRows, defectRows]);

  const cleanRows = {
    data: dataRows.map(({ projectId, squadId, ...row }) => row),
    defects: defectRows.map(({ projectId, squadId, ...row }) => row),
    releases: releaseRows.map(({ projectId, squadId, ...row }) => row),
  };
  const summaryRows = Object.entries(metrics).map(([Metric, Value]) => ({ Metric, Value }));
  const projectBreakdown = breakdownRows(dataRows, defectRows, 'Project');
  const squadBreakdown = breakdownRows(dataRows, defectRows, 'Squad');
  const activeFilterCount = [filters.projectId, filters.squadId, filters.release, filters.month, filters.priority, filters.sitMiss, filters.employeeId].filter(Boolean).length;
  const activeCard = reportCards.find(card => card.id === activeReport)!;
  const recordCount = activeReport === 'overall' ? dataRows.length + defectRows.length : activeReport === 'data' ? dataRows.length : activeReport === 'defects' ? defectRows.length : activeReport === 'releases' ? releaseRows.length : activeReport === 'timesheet' ? timesheetSummary.length : builderSections().reduce((sum, section) => sum + section.rows.length, 0);
  const canPdf = activeReport !== 'data' && activeReport !== 'timesheet';

  function builderSections() {
    const sections = [
      { key: 'overall' as ReportKey, title: 'Overall Summary', rows: summaryRows },
      { key: 'data' as ReportKey, title: 'Data Entries', rows: cleanRows.data },
      { key: 'defects' as ReportKey, title: 'Defect Log', rows: cleanRows.defects },
      { key: 'releases' as ReportKey, title: 'Release Roadmap', rows: cleanRows.releases },
      { key: 'timesheet' as ReportKey, title: 'Timesheet', rows: timesheetSummary },
    ];
    return sections.filter(section => filters.sections.includes(section.key));
  }

  const exportExcel = () => {
    if (activeReport === 'overall') exportToExcel([{ sheetName: 'Summary', data: summaryRows }, { sheetName: 'Project Breakdown', data: projectBreakdown }, { sheetName: 'Squad Breakdown', data: squadBreakdown }], 'qa_hub_overall_summary');
    if (activeReport === 'data') exportToExcel([{ sheetName: 'Data Entries', data: cleanRows.data }], 'qa_hub_data_entries');
    if (activeReport === 'defects') exportToExcel([{ sheetName: 'Defect Log', data: cleanRows.defects }], 'qa_hub_defect_log');
    if (activeReport === 'releases') exportToExcel([{ sheetName: 'Release Roadmap', data: cleanRows.releases }], 'qa_hub_release_roadmap');
    if (activeReport === 'timesheet') exportToExcel([{ sheetName: 'Timesheet Summary', data: timesheetSummary }], 'qa_hub_timesheet');
    if (activeReport === 'builder') exportToExcel(builderSections().map(section => ({ sheetName: sheetName(section.title), data: section.rows })), 'qa_hub_custom_report');
    showToast('Excel report downloaded.', 'success');
  };

  const exportCsv = () => {
    const rows = activeReport === 'overall' ? summaryRows : activeReport === 'data' ? cleanRows.data : activeReport === 'defects' ? cleanRows.defects : activeReport === 'releases' ? cleanRows.releases : activeReport === 'timesheet' ? timesheetSummary : builderSections().flatMap(section => section.rows.map(row => ({ Section: section.title, ...row })));
    exportToCSV(rows, `qa_hub_${activeReport}_report`);
    showToast('CSV downloaded.', 'success');
  };

  const exportPdf = () => {
    if (!canPdf) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Popup blocker blocked PDF print view.', 'error');
      return;
    }
    const sections = activeReport === 'builder' ? builderSections() : [{ title: activeCard.name, rows: activeReport === 'overall' ? summaryRows : activeReport === 'defects' ? cleanRows.defects : cleanRows.releases }];
    printWindow.document.write(`<html><head><title>${activeCard.name}</title><style>body{font-family:Arial,sans-serif;padding:28px;color:#0f172a}table{width:100%;border-collapse:collapse;font-size:11px;margin-top:12px}th,td{border:1px solid #cbd5e1;padding:6px;text-align:left}th{background:#f8fafc}</style></head><body><h1>${activeCard.name}</h1>${sections.map(section => `<h2>${section.title}</h2>${renderPrintTable(section.rows)}`).join('')}<script>window.onload=function(){window.print()}</script></body></html>`);
    printWindow.document.close();
  };

  const renderTable = (rows: Record<string, any>[], limit?: number) => {
    const visible = limit ? rows.slice(0, limit) : rows;
    if (!visible.length) return <div style={{ padding: '28px', textAlign: 'center', color: theme.muted }}>No data found for selected filters.</div>;
    const headers = Object.keys(visible[0]).filter(key => !key.endsWith('_Link'));
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ ...commonStyles.table(theme), fontSize: '11px' }}>
          <thead><tr>{headers.map(header => <th key={header} style={{ ...commonStyles.th(theme), padding: '7px 9px', fontSize: '10px' }}>{header.replace(/_/g, ' ')}</th>)}</tr></thead>
          <tbody>{visible.map((row, index) => (
            <tr key={index} style={{ backgroundColor: index % 2 ? theme.inputBg : 'transparent' }}>
              {headers.map(header => <td key={header} style={{ ...commonStyles.td(theme), padding: '7px 9px', fontSize: '11px', maxWidth: header === 'Story' || header === 'Summary' ? '280px' : undefined, whiteSpace: header === 'Story' || header === 'Summary' ? 'normal' : 'nowrap' }}>{renderCell(header, row)}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
    );
  };

  const renderPreview = () => {
    if (loading) return <Skeleton theme={theme} />;
    if (activeReport === 'overall') return (
      <div style={{ display: 'grid', gap: '14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(108px, 1fr))', gap: '8px' }}>
          {Object.entries(metrics).map(([label, value]) => <div key={label} style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '9px', backgroundColor: theme.inputBg }}><div style={{ fontSize: '10px', color: theme.muted, fontWeight: 800 }}>{label}</div><div style={{ fontSize: '18px', fontWeight: 900 }}>{value}</div></div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px' }}>
          <section><h3 style={sectionTitle(theme)}>Project Breakdown</h3>{renderTable(projectBreakdown)}</section>
          <section><h3 style={sectionTitle(theme)}>Squad Breakdown</h3>{renderTable(squadBreakdown)}</section>
        </div>
      </div>
    );
    if (activeReport === 'data') {
      const visible = showAllData ? cleanRows.data : cleanRows.data.slice(0, 25);
      return <div style={{ display: 'grid', gap: '10px' }}><div style={pill(theme)}>Showing {visible.length} of {cleanRows.data.length}</div>{renderTable(visible)}{cleanRows.data.length > 25 && <button onClick={() => setShowAllData(v => !v)} style={commonStyles.button(theme, 'secondary', 'sm')}>{showAllData ? 'Show first 25' : `View all ${cleanRows.data.length}`}</button>}</div>;
    }
    if (activeReport === 'defects') {
      const visible = showAllDefects ? cleanRows.defects : cleanRows.defects.slice(0, 25);
      const stats = [`Total: ${defectRows.length}`, `P1: ${metrics.P1}`, `P2: ${metrics.P2}`, `P3: ${metrics.P3}`, `SIT Misses: ${metrics['SIT Misses']}`, `Open: ${defectRows.filter(row => row.Status === 'Open').length}`, `Resolved: ${defectRows.filter(row => row.Status === 'Resolved' || row.Status === 'Closed').length}`];
      return <div style={{ display: 'grid', gap: '10px' }}><div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>{stats.map(stat => <span key={stat} style={pill(theme)}>{stat}</span>)}</div>{renderTable(visible)}{cleanRows.defects.length > 25 && <button onClick={() => setShowAllDefects(v => !v)} style={commonStyles.button(theme, 'secondary', 'sm')}>{showAllDefects ? 'Show first 25' : `View all ${cleanRows.defects.length}`}</button>}</div>;
    }
    if (activeReport === 'releases') return renderReleaseTimeline();
    if (activeReport === 'timesheet') return renderTimesheet();
    return renderBuilder();
  };

  const renderReleaseTimeline = () => {
    const grouped = cleanRows.releases.reduce<Record<string, Record<string, any>[]>>((acc, row) => {
      const key = row.Release_Date ? row.Release_Date.slice(0, 7) : 'No Date';
      acc[key] = [...(acc[key] || []), row];
      return acc;
    }, {});
    const monthGroups = Object.entries(grouped) as [string, Record<string, any>[]][];
    return <div style={{ display: 'grid', gap: '10px' }}>{monthGroups.sort(([a], [b]) => b.localeCompare(a)).map(([month, rows]) => <details key={month} open style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', backgroundColor: theme.inputBg, padding: '10px' }}><summary style={{ cursor: 'pointer', fontWeight: 900 }}>{month} ({rows.length})</summary>{rows.map(row => <div key={row.Release + row.Release_Date + generateId()} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 220px) 1fr', gap: '12px', alignItems: 'center', padding: '10px 0', borderTop: `1px solid ${theme.border}` }}><div><span style={commonStyles.badge(theme, theme.blue)}>{row.Release}</span><div style={{ marginTop: '5px', fontSize: '11px', color: theme.muted }}>{row.Project} · {row.Squad}</div></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', alignItems: 'center' }}>{['Release_Date', 'Regression', 'Beta', 'PROD'].map(key => <div key={key} style={{ fontSize: '11px', color: row[key] ? theme.text : theme.muted }}><span style={{ display: 'inline-block', width: '9px', height: '9px', borderRadius: '50%', backgroundColor: row[key] ? theme.green : 'transparent', border: `1px solid ${row[key] ? theme.green : theme.muted}`, marginRight: '5px' }} />{row[key] || 'Not set'}</div>)}</div></div>)}</details>)}</div>;
  };

  const renderTimesheet = () => {
    const selectedMonth = String(filters.month || now.getMonth() + 1).padStart(2, '0');
    const dateColumns = Array.from({ length: new Date(Number(filters.year), Number(selectedMonth), 0).getDate() }, (_, index) => `${filters.year}-${selectedMonth}-${String(index + 1).padStart(2, '0')}`);
    return (
      <div style={{ display: 'grid', gap: '14px' }}>
        {renderTable(timesheetSummary)}
        <div style={{ overflowX: 'auto' }}>
          <table style={commonStyles.table(theme)}>
            <thead><tr><th style={commonStyles.th(theme)}>Employee</th>{dateColumns.map(date => <th key={date} style={{ ...commonStyles.th(theme), minWidth: '24px', padding: '5px' }}>{Number(date.slice(8))}</th>)}</tr></thead>
            <tbody>{timesheetUsers.map(user => <tr key={user.id}><td style={{ ...commonStyles.td(theme), fontWeight: 800, fontSize: '11px' }}>{user.username}</td>{dateColumns.map(date => { const entry = appState.timesheetEntries.find(item => item.userId === user.id && item.month === date.slice(0, 7)); const day = entry?.workingDays.find(item => item.date === date); return <td key={date} title={`${user.username}: ${day?.status || 'Not set'} on ${date}`} style={{ ...commonStyles.td(theme), padding: '5px' }}><span style={{ display: 'block', width: '10px', height: '10px', borderRadius: '2px', backgroundColor: day ? STATUS_COLORS[day.status] : theme.border }} /></td>; })}</tr>)}</tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderBuilder = () => (
    <div style={{ display: 'grid', gap: '12px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>{(['overall', 'data', 'defects', 'releases', 'timesheet'] as ReportKey[]).map(section => <label key={section} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '12px', fontWeight: 700 }}><input type="checkbox" checked={filters.sections.includes(section)} onChange={() => setFilters(previous => ({ ...previous, sections: previous.sections.includes(section) ? previous.sections.filter(item => item !== section) : [...previous.sections, section] }))} />{reportCards.find(card => card.id === section)?.name}</label>)}</div>
      <button type="button" onClick={() => { setLoading(true); setTimeout(() => { setLoading(false); setBuilderReady(true); }, 420); }} style={{ ...commonStyles.button(theme, 'primary'), width: 'fit-content' }}>{loading && <Loader2 size={14} className="spin" />}Generate</button>
      {builderReady && builderSections().map(section => <details key={section.title} open style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '10px', backgroundColor: theme.inputBg }}><summary style={{ cursor: 'pointer', fontWeight: 900 }}>{section.title} <span style={pill(theme)}>{section.rows.length}</span></summary><div style={{ marginTop: '10px' }}>{renderTable(section.rows, 10)}</div></details>)}
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto auto 1fr', gap: '14px', minHeight: 'calc(100vh - 96px)' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
        <div><h1 style={{ margin: 0, fontSize: '22px' }}>Reports & Exports</h1><div style={{ color: theme.muted, fontSize: '12px' }}>Last generated: Today {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div></div>
      </header>
      <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
        {reportCards.map(card => {
          const Icon = card.icon;
          const active = activeReport === card.id;
          return <button key={card.id} type="button" onClick={() => resetHiddenFilters(card.id)} style={{ minWidth: '190px', textAlign: 'left', border: `1px solid ${active ? theme.blue : theme.border}`, borderRadius: '8px', padding: '12px', backgroundColor: active ? `${theme.blue}10` : theme.surface, color: theme.text, boxShadow: active ? '0 10px 24px rgba(15,23,42,0.16)' : '0 1px 2px rgba(0,0,0,0.06)', cursor: 'pointer', transition: 'transform 0.15s ease, box-shadow 0.15s ease' }}><Icon size={28} style={{ color: active ? theme.blue : theme.muted, marginBottom: '8px' }} /><div style={{ fontWeight: 900, fontSize: '13px' }}>{card.name}</div><div style={{ color: theme.muted, fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.description}</div></button>;
        })}
      </div>
      <main style={{ ...commonStyles.card(theme), minHeight: 0, display: 'grid', gridTemplateRows: 'auto 1fr auto', gap: '14px', overflow: 'hidden' }}>
        <FilterStrip />
        <section style={{ overflowY: 'auto', minHeight: '360px' }}>{renderPreview()}</section>
        <ExportBar />
      </main>
    </div>
  );

  function FilterStrip() {
    const showProject = activeReport !== 'timesheet';
    const showRelease = activeReport !== 'timesheet';
    const showPriority = activeReport === 'defects' || activeReport === 'builder';
    const showEmployee = activeReport === 'timesheet';
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: '9px', padding: '10px', border: `1px solid ${theme.border}`, borderRadius: '8px', backgroundColor: theme.inputBg }}>
        {showProject && <CompactSelect label="Project" value={filters.projectId} onChange={value => setFilter('projectId', value)} options={appState.projects.map(project => ({ value: project.id, label: project.name }))} all="All Projects" disabled={currentUser.role !== 'superadmin'} />}
        <CompactSelect label="Squad" value={filters.squadId} onChange={value => setFilter('squadId', value)} options={appState.squads.filter(squad => !filters.projectId || squad.projectId === filters.projectId).map(squad => ({ value: squad.id, label: squad.name }))} all="All Squads" />
        {showRelease && <CompactSelect label="Release" value={filters.release} onChange={value => setFilter('release', value)} options={releaseOptions.map(release => ({ value: release, label: release }))} all="All Releases" />}
        <CompactSelect label="Year" value={filters.year} onChange={value => setFilter('year', value)} options={years.map(year => ({ value: year, label: year }))} />
        <CompactSelect label="Month" value={filters.month} onChange={value => setFilter('month', value)} options={MONTHS.map((month, index) => ({ value: String(index + 1), label: month }))} all="All Months" />
        {showPriority && <CompactSelect label="Priority" value={filters.priority} onChange={value => setFilter('priority', value)} options={['P1', 'P2', 'P3'].map(value => ({ value, label: value }))} all="All Priorities" />}
        {showPriority && <CompactSelect label="SIT Miss" value={filters.sitMiss} onChange={value => setFilter('sitMiss', value)} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} all="All SIT" />}
        {showEmployee && <CompactSelect label="Employee" value={filters.employeeId} onChange={value => setFilter('employeeId', value)} options={appState.users.map(user => ({ value: user.id, label: user.username }))} all="All Employees" />}
        <button type="button" onClick={triggerLoading} style={commonStyles.button(theme, 'primary', 'sm')}>{loading && <Loader2 size={13} className="spin" />}Apply</button>
        <button type="button" onClick={resetFilters} style={{ border: 0, background: 'transparent', color: theme.blue, cursor: 'pointer', fontWeight: 800, fontSize: '12px' }}>Reset</button>
        {activeFilterCount > 0 && <span style={pill(theme)}>{activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'} active</span>}
      </div>
    );
  }

  function CompactSelect({ label, value, options, onChange, all, disabled }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; all?: string; disabled?: boolean }) {
    return <label style={{ display: 'grid', gap: '3px', fontSize: '10px', color: theme.muted, fontWeight: 800, textTransform: 'uppercase' }}>{label}<select value={value} disabled={disabled} onChange={event => onChange(event.target.value)} style={{ ...commonStyles.select(theme), opacity: disabled ? 0.6 : 1 }}>{all && <option value="">{all}</option>}{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  }

  function ExportBar() {
    return (
      <div style={{ position: 'sticky', bottom: 0, margin: '0 -12px -12px', padding: '12px', borderTop: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
        <div style={{ marginRight: 'auto', minWidth: '220px' }}><b>{activeCard.name}</b><span style={{ color: theme.muted, fontSize: '12px' }}> · {activeFilterCount || 'No'} filters active · {MONTHS[Number(filters.month || now.getMonth() + 1) - 1]} {filters.year}</span><div style={{ color: theme.muted, fontSize: '11px', marginTop: '3px' }}>{recordCount} records · Excel includes sheets · CSV is a flat file · PDF opens print view</div></div>
        <button disabled={loading} onClick={exportExcel} style={{ ...commonStyles.button(theme, 'success'), opacity: loading ? 0.55 : 1 }}><Download size={15} />Download Excel</button>
        <button disabled={loading} onClick={exportCsv} style={{ ...commonStyles.button(theme, 'primary'), opacity: loading ? 0.55 : 1 }}><Download size={15} />Download CSV</button>
        <button disabled={loading || !canPdf} title={canPdf ? 'Download PDF' : 'PDF not available for this report'} onClick={exportPdf} style={{ ...commonStyles.button(theme, canPdf ? 'danger' : 'secondary'), opacity: loading || !canPdf ? 0.45 : 1 }}><Download size={15} />Download PDF</button>
      </div>
    );
  }
}

function breakdownRows(dataRows: Record<string, any>[], defectRows: Record<string, any>[], key: 'Project' | 'Squad') {
  const map = new Map<string, { Stories: number; TC_Cr: number; TC_Ex: number; Defects: number; SIT_Miss: number }>();
  dataRows.forEach(row => {
    const item = map.get(row[key]) || { Stories: 0, TC_Cr: 0, TC_Ex: 0, Defects: 0, SIT_Miss: 0 };
    item.Stories += 1;
    item.TC_Cr += Number(row.TC_Cr || 0);
    item.TC_Ex += Number(row.TC_Ex || 0);
    map.set(row[key], item);
  });
  defectRows.forEach(row => {
    const item = map.get(row[key]) || { Stories: 0, TC_Cr: 0, TC_Ex: 0, Defects: 0, SIT_Miss: 0 };
    item.Defects += 1;
    if (row.SIT_Miss === 'YES') item.SIT_Miss += 1;
    map.set(row[key], item);
  });
  return Array.from(map.entries()).map(([name, item]) => ({ [key]: name, Stories: item.Stories, 'TC Cr': item.TC_Cr, 'TC Ex': item.TC_Ex, 'Coverage%': item.TC_Cr ? `${((item.TC_Ex / item.TC_Cr) * 100).toFixed(1)}%` : '0.0%', Defects: item.Defects, 'SIT Miss': item.SIT_Miss }));
}

function defectAge(date: string, status: string, resolvedDate?: string | null) {
  const resolved = status === 'Resolved' || status === 'Closed';
  const end = resolved && resolvedDate ? new Date(`${resolvedDate}T00:00:00`).getTime() : Date.now();
  const start = new Date(`${date}T00:00:00`).getTime();
  const days = Math.max(0, Math.floor((end - start) / 86400000));
  return { ageDays: resolved ? '' : days, resolvedInDays: resolved ? days : '' };
}

function renderPrintTable(rows: Record<string, any>[]) {
  if (!rows.length) return '<p>No rows.</p>';
  const headers = Object.keys(rows[0]);
  return `<table><thead><tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${headers.map(header => `<td>${String(row[header] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function sectionTitle(theme: ThemeTokens) {
  return { margin: '0 0 8px', fontSize: '13px', color: theme.text };
}

function pill(theme: ThemeTokens) {
  return { display: 'inline-flex', alignItems: 'center', width: 'fit-content', borderRadius: '999px', border: `1px solid ${theme.blue}33`, backgroundColor: `${theme.blue}12`, color: theme.blue, padding: '3px 8px', fontSize: '11px', fontWeight: 800 };
}

function renderCell(header: string, row: Record<string, any>) {
  if ((header === 'Story' && row.Story_Link) || (header === 'Summary' && row.Link)) {
    const link = row.Story_Link || row.Link;
    return <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: 700 }}>{row[header]}</a>;
  }
  if (header === 'SIT_Miss') return row[header] === 'YES' ? <CheckCircle2 size={15} color="#dc2626" /> : <XCircle size={15} color="#64748b" />;
  return row[header] === undefined || row[header] === null || row[header] === '' ? '—' : row[header];
}

function Skeleton({ theme }: { theme: ThemeTokens }) {
  return <div style={{ display: 'grid', gap: '12px', padding: '6px' }}>{Array.from({ length: 7 }, (_, index) => <div key={index} style={{ height: index === 0 ? '48px' : '28px', borderRadius: '8px', background: `linear-gradient(90deg, ${theme.inputBg}, ${theme.border}, ${theme.inputBg})`, animation: 'shimmer 1s infinite linear' }} />)}</div>;
}
