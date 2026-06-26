/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { ThemeTokens, commonStyles } from '../theme';
import { AppState, User, WorkingDay } from '../types';
import { exportToCSV, exportToExcel, formatDate } from '../utils';
import { BarChart3, Bug, CalendarDays, ChevronDown, Clock, Download, FileSpreadsheet, HelpCircle, Rocket, Settings, SlidersHorizontal } from 'lucide-react';

interface ExportProps {
  currentUser: User;
  appState: AppState;
  theme: ThemeTokens;
  showToast: (msg: string, type: 'success' | 'error' | 'warning', duration?: number) => void;
}

type ReportKey = 'overall' | 'data' | 'defects' | 'releases' | 'timesheet' | 'builder';
type PreviewTab = 'preview' | 'summary' | 'analytics' | 'timeline' | 'table' | 'calendar' | 'grid';
type SitFilter = 'all' | 'yes' | 'no';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STATUS_COLORS: Record<WorkingDay['status'], string> = {
  Working: '#d1fae5',
  WFH: '#dbeafe',
  Leave: '#fee2e2',
  Holiday: '#ede9fe',
  Training: '#fef3c7',
  Weekend: '#f1f5f9',
};

const isoWeek = (dateString: string) => {
  const date = new Date(`${dateString}T00:00:00`);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
};

const sheetName = (value: string) => value.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet';

const downloadBlob = (blob: Blob, fileName: string) => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

const makeCsv = (rows: Record<string, any>[]) => {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: any) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map(row => headers.map(header => escape(row[header])).join(','))].join('\n');
};

function MultiSelect({
  label,
  values,
  options,
  onChange,
  theme,
}: {
  label: string;
  values: string[];
  options: { value: string; label: string }[];
  onChange: (values: string[]) => void;
  theme: ThemeTokens;
}) {
  const selected = new Set(values);
  const allSelected = options.length > 0 && values.length === options.length;
  return (
    <details style={{ position: 'relative' }}>
      <summary style={{ ...commonStyles.input(theme), cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{values.length ? `${values.length} ${label}${values.length === 1 ? '' : 's'} selected` : `All ${label}s`}</span>
        <ChevronDown size={14} />
      </summary>
      <div style={{ position: 'absolute', zIndex: 20, top: 'calc(100% + 6px)', left: 0, right: 0, backgroundColor: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '8px', boxShadow: '0 14px 35px rgba(0,0,0,0.2)', padding: '8px', maxHeight: '220px', overflowY: 'auto' }}>
        <button type="button" onClick={() => onChange(allSelected ? [] : options.map(option => option.value))} style={{ ...commonStyles.button(theme, 'secondary', 'sm'), width: '100%', marginBottom: '8px' }}>
          {allSelected ? 'Clear All' : 'Select All'}
        </button>
        {options.map(option => (
          <label key={option.value} style={{ display: 'flex', gap: '7px', alignItems: 'center', padding: '6px', fontSize: '12px', color: theme.text }}>
            <input
              type="checkbox"
              checked={selected.has(option.value)}
              onChange={() => {
                const next = new Set(selected);
                next.has(option.value) ? next.delete(option.value) : next.add(option.value);
                onChange(Array.from(next));
              }}
            />
            {option.label}
          </label>
        ))}
      </div>
    </details>
  );
}

function EmptyState({ theme, onReset }: { theme: ThemeTokens; onReset: () => void }) {
  return (
    <div style={{ minHeight: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: theme.muted }}>
      <div>
        <FileSpreadsheet size={34} style={{ margin: '0 auto 10px' }} />
        <div style={{ fontWeight: 800, color: theme.text, marginBottom: '4px' }}>No data found for selected filters</div>
        <button type="button" onClick={onReset} style={{ ...commonStyles.button(theme, 'secondary', 'sm'), marginTop: '10px' }}>Reset Filters</button>
      </div>
    </div>
  );
}

export function Export({ currentUser, appState, theme, showToast }: ExportProps) {
  const now = new Date();
  const [activeReport, setActiveReport] = useState<ReportKey>('overall');
  const [tab, setTab] = useState<PreviewTab>('preview');
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [builderReady, setBuilderReady] = useState(false);
  const [builderLoading, setBuilderLoading] = useState(false);
  const [filters, setFilters] = useState({
    projects: currentUser.role === 'superadmin' ? [] as string[] : [currentUser.projectId || ''].filter(Boolean),
    squads: [] as string[],
    releases: [] as string[],
    employees: [] as string[],
    priorities: [] as string[],
    statuses: [] as string[],
    sit: 'all' as SitFilter,
    year: String(now.getFullYear()),
    months: [] as string[],
    weekFrom: '',
    weekTo: '',
    sections: ['data', 'defects', 'releases', 'timesheet', 'overall'] as ReportKey[],
  });

  const years = Array.from({ length: 5 }, (_, index) => String(now.getFullYear() - 2 + index));
  const projectMap = useMemo(() => new Map(appState.projects.map(project => [project.id, project.name])), [appState.projects]);
  const squadMap = useMemo(() => new Map(appState.squads.map(squad => [squad.id, squad.name])), [appState.squads]);
  const userMap = useMemo(() => new Map(appState.users.map(user => [user.id, user])), [appState.users]);
  const releaseOptions = useMemo(() => {
    const names = new Set<string>();
    (appState.releaseNames || []).forEach(release => release.name && names.add(release.name));
    appState.dataEntries.forEach(entry => entry.release && names.add(entry.release));
    appState.defects.forEach(defect => defect.release && names.add(defect.release));
    appState.releaseEntries.forEach(release => release.releaseName && names.add(release.releaseName));
    return Array.from(names).sort();
  }, [appState]);

  const setFilter = (key: keyof typeof filters, value: any) => {
    setBuilderReady(false);
    setFilters(previous => ({ ...previous, [key]: value }));
  };

  const resetFilters = () => setFilters(previous => ({
    ...previous,
    projects: currentUser.role === 'superadmin' ? [] : [currentUser.projectId || ''].filter(Boolean),
    squads: [],
    releases: [],
    employees: [],
    priorities: [],
    statuses: [],
    sit: 'all',
    months: [],
    weekFrom: '',
    weekTo: '',
  }));

  const datePasses = (date = '') => {
    if (!date) return true;
    if (filters.year && date.slice(0, 4) !== filters.year) return false;
    if (filters.months.length && !filters.months.includes(String(Number(date.slice(5, 7))))) return false;
    if (filters.weekFrom || filters.weekTo) {
      const week = isoWeek(date);
      if (filters.weekFrom && week < Number(filters.weekFrom)) return false;
      if (filters.weekTo && week > Number(filters.weekTo)) return false;
    }
    return true;
  };

  const scopePasses = (record: { projectId?: string; squadId?: string; release?: string }) => {
    if (filters.projects.length && record.projectId && !filters.projects.includes(record.projectId)) return false;
    if (filters.squads.length && record.squadId && !filters.squads.includes(record.squadId)) return false;
    if (filters.releases.length && record.release && !filters.releases.includes(record.release)) return false;
    return true;
  };

  const dataRows = useMemo(() => appState.dataEntries
    .filter(entry => scopePasses(entry) && datePasses(entry.date))
    .map(entry => ({
      Date: entry.date,
      Release: entry.release,
      Project: projectMap.get(entry.projectId) || 'Unknown',
      Squad: squadMap.get(entry.squadId) || 'Unknown',
      Jira_Story_Link: entry.jiraStoryLink,
      Jira_Story_Summary: entry.jiraStorySummary,
      TC_Mode: entry.tcExecuted === null ? 'TCs Only' : 'Full',
      TC_Created: entry.tcCreated,
      TC_Executed: entry.tcExecuted ?? '',
      TC_Passed: entry.tcPassed ?? '',
      TC_Failed: entry.tcFailed ?? '',
      projectId: entry.projectId,
      squadId: entry.squadId,
    })), [appState.dataEntries, filters, projectMap, squadMap]);

  const defectRows = useMemo(() => appState.defects
    .filter(defect => scopePasses(defect) && datePasses(defect.date))
    .filter(defect => !filters.priorities.length || filters.priorities.includes(defect.priority))
    .filter(defect => !filters.statuses.length || filters.statuses.includes(defect.status))
    .filter(defect => filters.sit === 'all' || (filters.sit === 'yes' ? defect.sitMiss : !defect.sitMiss))
    .map(defect => ({
      Date: defect.date,
      Release: defect.release,
      Project: projectMap.get(defect.projectId) || 'Unknown',
      Squad: squadMap.get(defect.squadId) || 'Unknown',
      Jira_Defect_Link: defect.jiraDefectLink,
      Jira_Defect_Summary: defect.jiraDefectSummary,
      Priority: defect.priority,
      SIT_Miss: defect.sitMiss ? 'YES' : 'NO',
      Status: defect.status,
      Related_Story_Link: defect.storyLink || '',
      Related_Story_Summary: defect.storySummary || '',
      projectId: defect.projectId,
      squadId: defect.squadId,
    })), [appState.defects, filters, projectMap, squadMap]);

  const releaseRows = useMemo(() => appState.releaseEntries
    .filter(release => scopePasses({ projectId: release.projectId, squadId: release.squadId, release: release.releaseName }) && datePasses(release.releaseDate))
    .map(release => ({
      Release_Name: release.releaseName,
      Project: projectMap.get(release.projectId) || 'Unknown',
      Squad: squadMap.get(release.squadId) || 'Unknown',
      Release_Date: release.releaseDate,
      Regression_Start_Date: release.regressionStartDate || '',
      Regression_End_Date: release.regressionEndDate || '',
      Beta_Date: release.betaDate || '',
      PROD_Release_Date: release.prodReleaseDate || '',
      projectId: release.projectId,
      squadId: release.squadId,
    })), [appState.releaseEntries, filters, projectMap, squadMap]);

  const timesheetUsers = useMemo(() => appState.users
    .filter(user => !filters.employees.length || filters.employees.includes(user.id))
    .filter(user => !filters.squads.length || (user.squadId && filters.squads.includes(user.squadId)))
    .sort((a, b) => (squadMap.get(a.squadId || '') || '').localeCompare(squadMap.get(b.squadId || '') || '') || a.username.localeCompare(b.username)), [appState.users, filters.employees, filters.squads, squadMap]);

  const timesheetSheets = useMemo(() => timesheetUsers.map(user => {
    const entries = appState.timesheetEntries.filter(entry => entry.userId === user.id);
    const rows = entries.flatMap(entry => entry.workingDays
      .filter(day => datePasses(day.date))
      .map(day => ({
        Date: `${day.date}${day.isAdminAdjustment ? ' *' : ''}`,
        Day: day.dayName,
        Status: day.status,
        Night_Deployment: day.isNightDeployment ? 'Yes' : 'No',
        Weekend_Support: day.isWeekendSupport ? 'Yes' : 'No',
        Work_Location: day.workLocation || '',
        Notes: day.notes || '',
        Adjusted_By: day.isAdminAdjustment ? (day.lastModifiedBy || '') : '',
        Adjustment_Date: day.isAdminAdjustment ? (day.lastModifiedAt || '') : '',
      })));
    return { sheetName: sheetName(`${user.username} - ${squadMap.get(user.squadId || '') || 'No Squad'}`), data: rows, user };
  }), [appState.timesheetEntries, timesheetUsers, filters, squadMap]);

  const timesheetSummary = useMemo(() => {
    const rows: Record<string, any>[] = [];
    timesheetUsers.forEach(user => {
      const entries = appState.timesheetEntries.filter(entry => entry.userId === user.id);
      entries.forEach(entry => {
        if (filters.year && entry.month.slice(0, 4) !== filters.year) return;
        if (filters.months.length && !filters.months.includes(String(Number(entry.month.slice(5, 7))))) return;
        const counts = { Working: 0, WFH: 0, Leave: 0, Holiday: 0, Training: 0, Night: 0, Weekend: 0 };
        entry.workingDays.forEach(day => {
          if (day.status in counts) counts[day.status as keyof typeof counts]++;
          if (day.isNightDeployment) counts.Night++;
          if (day.isWeekendSupport) counts.Weekend++;
        });
        rows.push({
          'Employee Name': user.username,
          Squad: squadMap.get(user.squadId || '') || 'Unassigned',
          Month: entry.month,
          Working: counts.Working,
          WFH: counts.WFH,
          Leave: counts.Leave,
          Holiday: counts.Holiday,
          Training: counts.Training,
          'Night Deployments': counts.Night,
          'Weekend Support': counts.Weekend,
        });
      });
    });
    return rows;
  }, [appState.timesheetEntries, filters.months, filters.year, squadMap, timesheetUsers]);

  const metrics = useMemo(() => {
    const created = dataRows.reduce((sum, row) => sum + Number(row.TC_Created || 0), 0);
    const executed = dataRows.reduce((sum, row) => sum + Number(row.TC_Executed || 0), 0);
    const passed = dataRows.reduce((sum, row) => sum + Number(row.TC_Passed || 0), 0);
    const failed = dataRows.reduce((sum, row) => sum + Number(row.TC_Failed || 0), 0);
    const sitMisses = defectRows.filter(row => row.SIT_Miss === 'YES').length;
    return {
      'Stories Tested': dataRows.length,
      'TC Created': created,
      'TC Executed': executed,
      'TC Passed': passed,
      'TC Failed': failed,
      'Coverage %': created ? `${((executed / created) * 100).toFixed(1)}%` : '0.0%',
      'Pass Rate %': executed ? `${((passed / executed) * 100).toFixed(1)}%` : '0.0%',
      'Fail Rate %': executed ? `${((failed / executed) * 100).toFixed(1)}%` : '0.0%',
      'Total Defects': defectRows.length,
      'SIT Misses': sitMisses,
      'SIT Miss Rate %': defectRows.length ? `${((sitMisses / defectRows.length) * 100).toFixed(1)}%` : '0.0%',
      'P1 Defects': defectRows.filter(row => row.Priority === 'P1').length,
      'P2 Defects': defectRows.filter(row => row.Priority === 'P2').length,
      'P3 Defects': defectRows.filter(row => row.Priority === 'P3').length,
    };
  }, [dataRows, defectRows]);

  const breakdown = (rows: Record<string, any>[], key: string) => {
    const map = new Map<string, number>();
    rows.forEach(row => map.set(row[key] || 'Unknown', (map.get(row[key] || 'Unknown') || 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  };

  const cleanDataRows = dataRows.map(({ projectId, squadId, ...row }) => row);
  const cleanDefectRows = defectRows.map(({ projectId, squadId, ...row }) => row);
  const cleanReleaseRows = releaseRows.map(({ projectId, squadId, ...row }) => row);
  const summaryRows = Object.entries(metrics).map(([Metric, Value]) => ({ Metric, Value }));
  const projectBreakdown = breakdown([...dataRows, ...defectRows], 'Project');
  const squadBreakdown = breakdown([...dataRows, ...defectRows], 'Squad');

  const openPrint = (title: string, sections: { title: string; rows: Record<string, any>[] }[]) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Popup blocker blocked report generation. Please allow popups.', 'error');
      return;
    }
    const renderTable = (rows: Record<string, any>[]) => rows.length ? `
      <table><thead><tr>${Object.keys(rows[0]).map(key => `<th>${key}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(row => `<tr>${Object.values(row).map(value => `<td>${String(value ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>
    ` : '<p>No data found for selected filters.</p>';
    printWindow.document.write(`
      <html><head><title>${title}</title><style>
        body{font-family:Arial,sans-serif;padding:28px;color:#0f172a} h1{margin:0 0 6px} h2{margin-top:24px;color:#2563eb}
        .context{color:#64748b;margin-bottom:18px}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
        .card{border:1px solid #cbd5e1;border-radius:8px;padding:10px}.card b{display:block;font-size:18px;margin-top:4px}
        table{width:100%;border-collapse:collapse;margin-top:10px;font-size:11px} th,td{border:1px solid #cbd5e1;padding:7px;text-align:left} th{background:#f8fafc}
      </style></head><body>
      <h1>${title}</h1><div class="context">${filterContext()}</div>
      <div class="cards">${summaryRows.map(row => `<div class="card">${row.Metric}<b>${row.Value}</b></div>`).join('')}</div>
      ${sections.map(section => `<h2>${section.title}</h2>${renderTable(section.rows)}`).join('')}
      <script>window.onload=function(){window.print();}</script></body></html>
    `);
    printWindow.document.close();
  };

  const filterContext = () => {
    const project = filters.projects.length === 1 ? projectMap.get(filters.projects[0]) : filters.projects.length ? `${filters.projects.length} projects` : 'All Projects';
    const squad = filters.squads.length === 1 ? squadMap.get(filters.squads[0]) : filters.squads.length ? `${filters.squads.length} squads` : 'All Squads';
    const release = filters.releases.length === 1 ? filters.releases[0] : filters.releases.length ? `${filters.releases.length} releases` : 'All Releases';
    const month = filters.months.length === 1 ? MONTHS[Number(filters.months[0]) - 1] : filters.months.length ? `${filters.months.length} months` : 'All Months';
    return `Project: ${project} | Squad: ${squad} | Release: ${release} | ${month} ${filters.year}`;
  };

  const exportCurrentExcel = () => {
    if (activeReport === 'overall') exportToExcel([
      { sheetName: 'Summary', data: summaryRows },
      { sheetName: 'Project Breakdown', data: projectBreakdown },
      { sheetName: 'Squad Breakdown', data: squadBreakdown },
      { sheetName: 'Defects', data: cleanDefectRows },
    ], 'qa_hub_overall_summary');
    if (activeReport === 'data') exportToExcel([{ sheetName: 'Data Entries', data: cleanDataRows }], 'qa_hub_data_entries');
    if (activeReport === 'defects') exportToExcel([{ sheetName: 'Defect Log', data: cleanDefectRows }], 'qa_hub_defect_log');
    if (activeReport === 'releases') exportToExcel([{ sheetName: 'Release Roadmap', data: cleanReleaseRows }], 'qa_hub_release_roadmap');
    if (activeReport === 'timesheet') exportToExcel(timesheetSheets.map(sheet => ({ sheetName: sheet.sheetName, data: sheet.data })), 'qa_hub_timesheet');
    showToast('Excel report downloaded.', 'success');
  };

  const downloadZipCsvs = async () => {
    if (!(window as any).JSZip) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('JSZip failed to load'));
        document.head.appendChild(script);
      });
    }
    const zip = new (window as any).JSZip();
    builderSections().forEach(section => zip.file(`${section.title.replace(/\s+/g, '_').toLowerCase()}.csv`, makeCsv(section.rows)));
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, 'qa_hub_custom_report_csvs.zip');
    showToast('CSV zip downloaded.', 'success');
  };

  const builderSections = () => filters.sections.flatMap(section => {
    if (section === 'overall') return [{ title: 'Overall Summary', rows: summaryRows }];
    if (section === 'data') return [{ title: 'Data Entries', rows: cleanDataRows }];
    if (section === 'defects') return [{ title: 'Defect Log', rows: cleanDefectRows }];
    if (section === 'releases') return [{ title: 'Release Roadmap', rows: cleanReleaseRows }];
    if (section === 'timesheet') return [{ title: 'Timesheet', rows: timesheetSummary }];
    return [];
  });

  const renderTable = (rows: Record<string, any>[], limit = 20) => {
    if (!rows.length) return <EmptyState theme={theme} onReset={resetFilters} />;
    return (
      <div style={{ overflowX: 'auto', maxHeight: '460px', border: `1px solid ${theme.border}`, borderRadius: '8px' }}>
        <table style={commonStyles.table(theme)}>
          <thead><tr>{Object.keys(rows[0]).map(key => <th key={key} style={commonStyles.th(theme)}>{key}</th>)}</tr></thead>
          <tbody>
            {rows.slice(0, limit).map((row, index) => (
              <tr key={index} style={{ backgroundColor: index % 2 ? `${theme.inputBg}cc` : 'transparent' }}>
                {Object.values(row).map((value, valueIndex) => (
                  <td key={valueIndex} title={String(value ?? '')} style={{ ...commonStyles.td(theme), maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(value ?? '')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderBars = (title: string, rows: { name: string; count: number }[]) => {
    const max = Math.max(1, ...rows.map(row => row.count));
    return (
      <div style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '12px', backgroundColor: theme.inputBg }}>
        <h4 style={{ margin: '0 0 10px', fontSize: '13px' }}>{title}</h4>
        {rows.length ? rows.map(row => (
          <div key={row.name} style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}><span>{row.name}</span><b>{row.count}</b></div>
            <div style={{ height: '7px', backgroundColor: `${theme.muted}22`, borderRadius: '99px', overflow: 'hidden', marginTop: '4px' }}>
              <div style={{ width: `${(row.count / max) * 100}%`, height: '100%', backgroundColor: theme.blue }} />
            </div>
          </div>
        )) : <span style={{ color: theme.muted, fontSize: '12px' }}>No rows</span>}
      </div>
    );
  };

  const filtersPanel = (mode: ReportKey) => (
    <aside style={{ display: filtersOpen ? 'grid' : 'none', gap: '12px', alignContent: 'start', minWidth: '260px' }}>
      <button type="button" onClick={() => setFiltersOpen(false)} style={{ ...commonStyles.button(theme, 'secondary', 'sm'), justifySelf: 'start' }}>Hide Filters</button>
      {mode === 'timesheet' && <><label style={commonStyles.label(theme)}>Employee</label><MultiSelect label="Employee" values={filters.employees} options={appState.users.map(user => ({ value: user.id, label: user.username }))} onChange={values => setFilter('employees', values)} theme={theme} /></>}
      {mode !== 'timesheet' && mode !== 'overall' && <><label style={commonStyles.label(theme)}>Project</label><MultiSelect label="Project" values={filters.projects} options={appState.projects.map(project => ({ value: project.id, label: project.name }))} onChange={values => setFilter('projects', values)} theme={theme} /></>}
      {mode === 'overall' && <><label style={commonStyles.label(theme)}>Project</label><select value={filters.projects[0] || ''} onChange={event => setFilter('projects', event.target.value ? [event.target.value] : [])} style={commonStyles.input(theme)}><option value="">All Projects</option>{appState.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></>}
      <label style={commonStyles.label(theme)}>Squad</label>
      {mode === 'overall'
        ? <select value={filters.squads[0] || ''} onChange={event => setFilter('squads', event.target.value ? [event.target.value] : [])} style={commonStyles.input(theme)}><option value="">All Squads</option>{appState.squads.map(squad => <option key={squad.id} value={squad.id}>{squad.name}</option>)}</select>
        : <MultiSelect label="Squad" values={filters.squads} options={appState.squads.map(squad => ({ value: squad.id, label: squad.name }))} onChange={values => setFilter('squads', values)} theme={theme} />}
      {(mode === 'data' || mode === 'defects' || mode === 'builder' || mode === 'overall') && <>
        <label style={commonStyles.label(theme)}>Release</label>
        {mode === 'overall'
          ? <select value={filters.releases[0] || ''} onChange={event => setFilter('releases', event.target.value ? [event.target.value] : [])} style={commonStyles.input(theme)}><option value="">All Releases</option>{releaseOptions.map(release => <option key={release} value={release}>{release}</option>)}</select>
          : <MultiSelect label="Release" values={filters.releases} options={releaseOptions.map(release => ({ value: release, label: release }))} onChange={values => setFilter('releases', values)} theme={theme} />}
      </>}
      {(mode === 'defects' || mode === 'builder') && <>
        <label style={commonStyles.label(theme)}>Priority</label><MultiSelect label="Priority" values={filters.priorities} options={['P1', 'P2', 'P3'].map(value => ({ value, label: value }))} onChange={values => setFilter('priorities', values)} theme={theme} />
        {mode === 'defects' && <><label style={commonStyles.label(theme)}>Status</label><MultiSelect label="Status" values={filters.statuses} options={['Open', 'In Progress', 'Re-Opened', 'Resolved', 'Closed'].map(value => ({ value, label: value }))} onChange={values => setFilter('statuses', values)} theme={theme} /></>}
        <label style={commonStyles.label(theme)}>SIT Miss</label><select value={filters.sit} onChange={event => setFilter('sit', event.target.value as SitFilter)} style={commonStyles.input(theme)}><option value="all">All</option><option value="yes">SIT Misses Only</option><option value="no">Non-SIT Only</option></select>
      </>}
      <label style={commonStyles.label(theme)}>Year</label><select value={filters.year} onChange={event => setFilter('year', event.target.value)} style={commonStyles.input(theme)}>{years.map(year => <option key={year} value={year}>{year}</option>)}</select>
      <label style={commonStyles.label(theme)}>Month</label>
      {mode === 'overall'
        ? <select value={filters.months[0] || ''} onChange={event => setFilter('months', event.target.value ? [event.target.value] : [])} style={commonStyles.input(theme)}><option value="">All Months</option>{MONTHS.map((month, index) => <option key={month} value={String(index + 1)}>{month}</option>)}</select>
        : <MultiSelect label="Month" values={filters.months} options={MONTHS.map((month, index) => ({ value: String(index + 1), label: month }))} onChange={values => setFilter('months', values)} theme={theme} />}
      {mode !== 'overall' && mode !== 'releases' && mode !== 'timesheet' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div><label style={commonStyles.label(theme)}>Week From</label><input type="number" min="1" max="53" value={filters.weekFrom} onChange={event => setFilter('weekFrom', event.target.value)} style={commonStyles.input(theme)} /></div>
          <div><label style={commonStyles.label(theme)}>Week To</label><input type="number" min="1" max="53" value={filters.weekTo} onChange={event => setFilter('weekTo', event.target.value)} style={commonStyles.input(theme)} /></div>
        </div>
      )}
      {mode === 'builder' && (
        <>
          <label style={commonStyles.label(theme)}>Report Sections</label>
          {(['data', 'defects', 'releases', 'timesheet', 'overall'] as ReportKey[]).map(section => (
            <label key={section} style={{ display: 'flex', gap: '8px', fontSize: '12px', fontWeight: 700 }}><input type="checkbox" checked={filters.sections.includes(section)} onChange={() => setFilter('sections', filters.sections.includes(section) ? filters.sections.filter(item => item !== section) : [...filters.sections, section])} />{section === 'overall' ? 'Overall Summary' : section}</label>
          ))}
          <button type="button" onClick={() => { setBuilderLoading(true); setTimeout(() => { setBuilderLoading(false); setBuilderReady(true); }, 450); }} style={{ ...commonStyles.button(theme, 'primary'), marginTop: '8px' }}><SlidersHorizontal size={15} />Generate Report</button>
        </>
      )}
      {mode === 'overall' && <><button type="button" style={commonStyles.button(theme, 'primary')}>Apply Filters</button><button type="button" onClick={resetFilters} style={{ border: 0, background: 'transparent', color: theme.blue, cursor: 'pointer', fontWeight: 700 }}>Reset Filters</button></>}
    </aside>
  );

  const downloadBar = (children: React.ReactNode) => (
    <div style={{ position: 'sticky', bottom: 0, zIndex: 10, marginTop: '16px', padding: '12px', borderTop: `1px solid ${theme.border}`, backgroundColor: theme.surface, display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
      {children}
    </div>
  );

  const renderOverall = () => (
    <div style={{ display: 'grid', gridTemplateColumns: filtersOpen ? '260px 1fr' : '1fr', gap: '16px' }}>
      {filtersPanel('overall')}
      <div>
        {!filtersOpen && <button type="button" onClick={() => setFiltersOpen(true)} style={{ ...commonStyles.button(theme, 'secondary', 'sm'), marginBottom: '10px' }}>Filters</button>}
        <section style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '14px', backgroundColor: theme.card }}>
          <h2 style={{ margin: '0 0 4px', fontSize: '18px' }}>QA Hub - Overall Summary Report</h2>
          <div style={{ color: theme.muted, fontSize: '12px', marginBottom: '14px' }}>{filterContext()}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '14px' }}>
            {summaryRows.map(row => <div key={row.Metric} style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '10px', backgroundColor: theme.inputBg }}><div style={{ color: theme.muted, fontSize: '10px', textTransform: 'uppercase', fontWeight: 800 }}>{row.Metric}</div><div style={{ fontSize: '18px', fontWeight: 900, marginTop: '4px' }}>{row.Value}</div></div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {renderTable(projectBreakdown.map(row => ({ Project: row.name, Records: row.count })), 8)}
            {renderTable(squadBreakdown.map(row => ({ Squad: row.name, Records: row.count })), 8)}
          </div>
          {renderTable([{ P1: metrics['P1 Defects'], P2: metrics['P2 Defects'], P3: metrics['P3 Defects'], SIT_Misses: metrics['SIT Misses'] }], 1)}
        </section>
        {downloadBar(<><button onClick={() => openPrint('QA Hub - Overall Summary Report', [{ title: 'Project Breakdown', rows: projectBreakdown.map(row => ({ Project: row.name, Records: row.count })) }, { title: 'Squad Breakdown', rows: squadBreakdown.map(row => ({ Squad: row.name, Records: row.count })) }, { title: 'Defects', rows: cleanDefectRows }])} style={commonStyles.button(theme, 'secondary')}><Download size={15} />Download PDF</button><button onClick={exportCurrentExcel} style={commonStyles.button(theme, 'primary')}><Download size={15} />Download Excel</button><button onClick={() => exportToCSV(summaryRows, 'qa_hub_overall_summary')} style={commonStyles.button(theme, 'secondary')}><Download size={15} />Download CSV</button></>)}
      </div>
    </div>
  );

  const renderData = () => (
    <div style={{ display: 'grid', gridTemplateColumns: filtersOpen ? '260px 1fr' : '1fr', gap: '16px' }}>
      {filtersPanel('data')}<div>{!filtersOpen && <button type="button" onClick={() => setFiltersOpen(true)} style={{ ...commonStyles.button(theme, 'secondary', 'sm'), marginBottom: '10px' }}>Filters</button>}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}><button onClick={() => setTab('preview')} style={commonStyles.button(theme, tab === 'preview' ? 'primary' : 'secondary', 'sm')}>Preview</button><button onClick={() => setTab('summary')} style={commonStyles.button(theme, tab === 'summary' ? 'primary' : 'secondary', 'sm')}>Summary</button><span style={{ alignSelf: 'center', color: theme.muted, fontSize: '12px' }}>Showing {Math.min(20, cleanDataRows.length)} of {cleanDataRows.length} total entries</span></div>
      {tab === 'summary' ? <div style={{ display: 'grid', gap: '12px' }}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: '10px' }}>{['Stories Tested', 'TC Created', 'TC Executed', 'TC Passed', 'TC Failed', 'Pass Rate %'].map(key => <div key={key} style={{ ...commonStyles.card(theme), backgroundColor: theme.inputBg }}><div style={{ fontSize: '10px', color: theme.muted, textTransform: 'uppercase', fontWeight: 800 }}>{key}</div><b style={{ fontSize: '18px' }}>{(metrics as any)[key]}</b></div>)}</div>{renderBars('Entries by Squad', breakdown(dataRows, 'Squad'))}{renderBars('Entries by Project', breakdown(dataRows, 'Project'))}{renderBars('Entries by Release', breakdown(dataRows, 'Release'))}</div> : renderTable(cleanDataRows, 20)}
      {downloadBar(<><button onClick={exportCurrentExcel} style={commonStyles.button(theme, 'primary')}><Download size={15} />Download Excel</button><button onClick={() => exportToCSV(cleanDataRows, 'qa_hub_data_entries')} style={commonStyles.button(theme, 'secondary')}><Download size={15} />Download CSV</button></>)}</div>
    </div>
  );

  const renderDefects = () => (
    <div style={{ display: 'grid', gridTemplateColumns: filtersOpen ? '260px 1fr' : '1fr', gap: '16px' }}>
      {filtersPanel('defects')}<div>{!filtersOpen && <button type="button" onClick={() => setFiltersOpen(true)} style={{ ...commonStyles.button(theme, 'secondary', 'sm'), marginBottom: '10px' }}>Filters</button>}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}><button onClick={() => setTab('preview')} style={commonStyles.button(theme, tab === 'preview' ? 'primary' : 'secondary', 'sm')}>Preview</button><button onClick={() => setTab('analytics')} style={commonStyles.button(theme, tab === 'analytics' ? 'primary' : 'secondary', 'sm')}>Analytics</button></div>
      {tab === 'analytics' ? <div style={{ display: 'grid', gap: '12px' }}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: '10px' }}>{['Total Defects', 'SIT Misses', 'SIT Miss Rate %', 'P1 Defects', 'P2 Defects', 'P3 Defects'].map(key => <div key={key} style={{ ...commonStyles.card(theme), backgroundColor: theme.inputBg }}><div style={{ fontSize: '10px', color: theme.muted, textTransform: 'uppercase', fontWeight: 800 }}>{key}</div><b style={{ fontSize: '18px' }}>{(metrics as any)[key]}</b></div>)}</div>{renderBars('Status Breakdown', breakdown(defectRows, 'Status'))}{renderBars('Top 5 Releases', breakdown(defectRows, 'Release').slice(0, 5))}{renderBars('Top 5 Squads', breakdown(defectRows, 'Squad').slice(0, 5))}</div> : renderTable(cleanDefectRows, 20)}
      {downloadBar(<><button onClick={exportCurrentExcel} style={commonStyles.button(theme, 'primary')}><Download size={15} />Download Excel</button><button onClick={() => exportToCSV(cleanDefectRows, 'qa_hub_defect_log')} style={commonStyles.button(theme, 'secondary')}><Download size={15} />Download CSV</button></>)}</div>
    </div>
  );

  const renderReleases = () => {
    const grouped = cleanReleaseRows.reduce<Record<string, Record<string, any>[]>>((acc, row) => {
      const key = row.Release_Date ? row.Release_Date.slice(0, 7) : 'No Date';
      acc[key] = [...(acc[key] || []), row];
      return acc;
    }, {});
    return (
      <div style={{ display: 'grid', gridTemplateColumns: filtersOpen ? '260px 1fr' : '1fr', gap: '16px' }}>
        {filtersPanel('releases')}<div>{!filtersOpen && <button type="button" onClick={() => setFiltersOpen(true)} style={{ ...commonStyles.button(theme, 'secondary', 'sm'), marginBottom: '10px' }}>Filters</button>}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>{(['timeline', 'table', 'calendar'] as PreviewTab[]).map(item => <button key={item} onClick={() => setTab(item)} style={commonStyles.button(theme, tab === item ? 'primary' : 'secondary', 'sm')}>{item === 'timeline' ? 'Timeline View' : item === 'table' ? 'Table View' : 'Calendar'}</button>)}</div>
        {tab === 'table' ? renderTable(cleanReleaseRows, 20) : tab === 'calendar' ? renderTable(cleanReleaseRows.map(row => ({ Date: row.Release_Date, Release: row.Release_Name, Project: row.Project, Squad: row.Squad })), 31) : (
          <div style={{ display: 'grid', gap: '10px' }}>{(Object.entries(grouped) as [string, Record<string, any>[]][]).sort(([a], [b]) => b.localeCompare(a)).map(([month, rows]) => <details key={month} open style={{ ...commonStyles.card(theme), backgroundColor: theme.inputBg }}><summary style={{ cursor: 'pointer', fontWeight: 800 }}>{month} ({rows.length})</summary>{rows.map(row => <div key={row.Release_Name + row.Release_Date} style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: '12px', alignItems: 'center', padding: '10px 0', borderTop: `1px solid ${theme.border}` }}><b>{row.Release_Name}</b><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px' }}>{['Regression_Start_Date', 'Regression_End_Date', 'Beta_Date', 'PROD_Release_Date'].map(key => <div key={key} style={{ color: row[key] ? theme.text : theme.muted, fontSize: '11px' }}><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: row[key] ? theme.blue : 'transparent', border: `1px solid ${theme.blue}`, marginRight: '5px' }} />{row[key] || 'Missing'}</div>)}</div></div>)}</details>)}</div>
        )}
        {downloadBar(<><button onClick={exportCurrentExcel} style={commonStyles.button(theme, 'primary')}><Download size={15} />Download Excel</button><button onClick={() => exportToCSV(cleanReleaseRows, 'qa_hub_release_roadmap')} style={commonStyles.button(theme, 'secondary')}><Download size={15} />Download CSV</button><button onClick={() => openPrint('QA Hub - Release Roadmap', [{ title: 'Release Timeline', rows: cleanReleaseRows }])} style={commonStyles.button(theme, 'secondary')}><Download size={15} />Download PDF</button></>)}</div>
      </div>
    );
  };

  const renderTimesheet = () => {
    const selectedMonth = filters.months[0] || String(now.getMonth() + 1);
    const dateColumns = Array.from({ length: new Date(Number(filters.year), Number(selectedMonth), 0).getDate() }, (_, index) => `${filters.year}-${String(selectedMonth).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`);
    return (
      <div style={{ display: 'grid', gridTemplateColumns: filtersOpen ? '260px 1fr' : '1fr', gap: '16px' }}>
        {filtersPanel('timesheet')}<div>{!filtersOpen && <button type="button" onClick={() => setFiltersOpen(true)} style={{ ...commonStyles.button(theme, 'secondary', 'sm'), marginBottom: '10px' }}>Filters</button>}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}><button onClick={() => setTab('summary')} style={commonStyles.button(theme, tab === 'summary' ? 'primary' : 'secondary', 'sm')}>Summary Table</button><button onClick={() => setTab('grid')} style={commonStyles.button(theme, tab === 'grid' ? 'primary' : 'secondary', 'sm')}>Attendance Grid</button></div>
        {tab === 'grid' ? <div style={{ overflowX: 'auto' }}><table style={commonStyles.table(theme)}><thead><tr><th style={commonStyles.th(theme)}>Employee</th>{dateColumns.map(date => <th key={date} style={{ ...commonStyles.th(theme), minWidth: '38px' }}>{Number(date.slice(8))}</th>)}</tr></thead><tbody>{timesheetUsers.map(user => <tr key={user.id}><td style={{ ...commonStyles.td(theme), fontWeight: 800 }}>{user.username}</td>{dateColumns.map(date => { const entry = appState.timesheetEntries.find(item => item.userId === user.id && item.month === date.slice(0, 7)); const day = entry?.workingDays.find(item => item.date === date); return <td key={date} title={day?.status || 'Not set'} style={{ ...commonStyles.td(theme), backgroundColor: day ? STATUS_COLORS[day.status] : 'transparent', color: '#0f172a', textAlign: 'center', padding: '8px' }}>{day ? day.status.slice(0, 1) : '-'}</td>; })}</tr>)}</tbody></table></div> : renderTable(timesheetSummary, 20)}
        {downloadBar(<><button onClick={exportCurrentExcel} style={commonStyles.button(theme, 'primary')}><Download size={15} />Download Excel</button><button onClick={() => exportToCSV(timesheetSummary, 'qa_hub_timesheet_summary')} style={commonStyles.button(theme, 'secondary')}><Download size={15} />Download CSV</button></>)}</div>
      </div>
    );
  };

  const renderBuilder = () => (
    <div style={{ display: 'grid', gridTemplateColumns: filtersOpen ? '260px 1fr' : '1fr', gap: '16px' }}>
      {filtersPanel('builder')}<div>{!filtersOpen && <button type="button" onClick={() => setFiltersOpen(true)} style={{ ...commonStyles.button(theme, 'secondary', 'sm'), marginBottom: '10px' }}>Filters</button>}
      {builderLoading ? <div style={{ minHeight: '300px', display: 'grid', placeItems: 'center', color: theme.muted }}>Building your report...</div> : !builderReady ? <EmptyState theme={theme} onReset={() => setBuilderReady(true)} /> : <div style={{ display: 'grid', gap: '10px' }}>{builderSections().map(section => <details key={section.title} open style={commonStyles.card(theme)}><summary style={{ cursor: 'pointer', fontWeight: 900 }}>{section.title} <span style={{ color: theme.muted, fontSize: '11px' }}>({section.rows.length} rows)</span></summary><div style={{ marginTop: '10px' }}>{renderTable(section.rows, 10)}</div></details>)}</div>}
      {builderReady && downloadBar(<><span style={{ marginRight: 'auto', color: theme.muted, fontSize: '12px' }}>Your custom report contains {builderSections().length} sections - {builderSections().reduce((sum, section) => sum + section.rows.length, 0)} total records</span><button onClick={() => { exportToExcel(builderSections().map(section => ({ sheetName: sheetName(section.title), data: section.rows })), 'qa_hub_custom_report'); showToast('Full Excel downloaded.', 'success'); }} style={commonStyles.button(theme, 'primary')}><Download size={15} />Download Full Excel</button><button onClick={() => openPrint('QA Hub - Custom Report', builderSections())} style={commonStyles.button(theme, 'secondary')}><Download size={15} />Download Full PDF</button><button onClick={downloadZipCsvs} style={commonStyles.button(theme, 'secondary')}><Download size={15} />Download All CSVs</button></>)}</div>
    </div>
  );

  const reports = [
    { group: 'STANDARD REPORTS', items: [
      { id: 'overall' as ReportKey, icon: BarChart3, name: 'Overall Summary', description: 'KPIs, metrics and defect breakdown' },
      { id: 'data' as ReportKey, icon: CalendarDays, name: 'Data Entries', description: 'Story and test execution records' },
      { id: 'defects' as ReportKey, icon: Bug, name: 'Defect Log', description: 'Defects, priorities and SIT misses' },
      { id: 'releases' as ReportKey, icon: Rocket, name: 'Release Roadmap', description: 'Release timeline and milestones' },
      { id: 'timesheet' as ReportKey, icon: Clock, name: 'Timesheet', description: 'Roster, attendance and support logs' },
    ] },
    { group: 'CUSTOM REPORTS', items: [
      { id: 'builder' as ReportKey, icon: Settings, name: 'Report Builder', description: 'Combine sections with shared filters' },
    ] },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: '12px', height: 'calc(100vh - 96px)', backgroundColor: `${theme.inputBg}80`, borderRadius: '8px', padding: '12px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 2px' }}>
        <h1 style={{ margin: 0, fontSize: '18px', letterSpacing: '0', textTransform: 'uppercase' }}>Export & Reports</h1>
        <button type="button" title="Help" style={commonStyles.button(theme, 'secondary', 'sm')}><HelpCircle size={14} />Help</button>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '12px', minHeight: 0 }}>
        <nav style={{ ...commonStyles.card(theme), overflowY: 'auto', padding: '10px' }}>
          {reports.map(group => (
            <section key={group.group} style={{ marginBottom: '14px' }}>
              <div style={{ color: theme.muted, fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', margin: '8px 6px' }}>{group.group}</div>
              {group.items.map(item => {
                const Icon = item.icon;
                const active = activeReport === item.id;
                return (
                  <button key={item.id} type="button" onClick={() => { setActiveReport(item.id); setTab(item.id === 'releases' ? 'timeline' : item.id === 'timesheet' ? 'summary' : 'preview'); setFiltersOpen(true); }} style={{ width: '100%', textAlign: 'left', border: `1px solid ${active ? `${theme.blue}55` : theme.border}`, borderLeft: `4px solid ${active ? theme.blue : 'transparent'}`, borderRadius: '8px', backgroundColor: active ? `${theme.blue}12` : theme.surface, color: theme.text, padding: '10px', marginBottom: '8px', cursor: 'pointer', boxShadow: active ? '0 8px 22px rgba(0,0,0,0.12)' : 'none' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontWeight: 900 }}><Icon size={16} />{item.name}</div>
                    <div style={{ marginLeft: '24px', color: theme.muted, fontSize: '11px', marginTop: '3px' }}>{item.description}</div>
                  </button>
                );
              })}
            </section>
          ))}
        </nav>
        <main style={{ ...commonStyles.card(theme), overflowY: 'auto', minWidth: 0 }}>
          {activeReport === 'overall' && renderOverall()}
          {activeReport === 'data' && renderData()}
          {activeReport === 'defects' && renderDefects()}
          {activeReport === 'releases' && renderReleases()}
          {activeReport === 'timesheet' && renderTimesheet()}
          {activeReport === 'builder' && renderBuilder()}
        </main>
      </div>
    </div>
  );
}
