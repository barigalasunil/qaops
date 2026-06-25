/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { ThemeTokens, commonStyles } from '../theme';
import { AppState, User } from '../types';
import { exportToExcel, exportToCSV } from '../utils';
import { FilterBar } from './Shared';
import { Download, FileText, Printer, CheckCircle } from 'lucide-react';

interface ExportProps {
  currentUser: User;
  appState: AppState;
  theme: ThemeTokens;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export function Export({ currentUser, appState, theme, showToast }: ExportProps) {
  // Shared Filter Bar criteria
  const [filters, setFilters] = useState({
    projectId: currentUser.role === 'superadmin' ? '' : (currentUser.projectId || ''),
    squadId: '',
    release: '',
    month: '',
  });

  const projectMap = useMemo(() => new Map(appState.projects.map(p => [p.id, p.name])), [appState.projects]);
  const squadMap = useMemo(() => new Map(appState.squads.map(s => [s.id, s.name])), [appState.squads]);

  // Apply filters to Data Entries, Defects, and Releases
  const filteredData = useMemo(() => {
    let entries = [...appState.dataEntries];
    let defects = [...appState.defects];
    let releases = [...appState.releaseEntries];

    if (filters.projectId) {
      entries = entries.filter((e) => e.projectId === filters.projectId);
      defects = defects.filter((d) => d.projectId === filters.projectId);
      releases = releases.filter((r) => r.projectId === filters.projectId);
    }
    if (filters.squadId) {
      entries = entries.filter((e) => e.squadId === filters.squadId);
      defects = defects.filter((d) => d.squadId === filters.squadId);
      releases = releases.filter((r) => r.squadId === filters.squadId);
    }
    if (filters.release) {
      entries = entries.filter((e) => e.release === filters.release);
      defects = defects.filter((d) => d.release === filters.release);
    }
    if (filters.month) {
      entries = entries.filter((e) => e.date && e.date.substring(0, 7) === filters.month);
      defects = defects.filter((d) => d.date && d.date.substring(0, 7) === filters.month);
      releases = releases.filter((r) => r.releaseDate && r.releaseDate.substring(0, 7) === filters.month);
    }

    return { entries, defects, releases };
  }, [appState.dataEntries, appState.defects, appState.releaseEntries, filters]);

  // Formatted data arrays ready for sheet output
  const dataEntriesExport = useMemo(() => {
    return filteredData.entries.map((e) => ({
      ID: e.id,
      Date: e.date,
      Release: e.release,
      Project: projectMap.get(e.projectId) || 'Unknown',
      Squad: squadMap.get(e.squadId) || 'Unknown',
      Added_By: e.addedByName,
      Jira_Story_Summary: e.jiraStorySummary,
      Jira_Story_Link: e.jiraStoryLink,
      TC_Created: e.tcCreated,
      TC_Executed: e.tcExecuted,
      TC_Passed: e.tcPassed,
      TC_Failed: e.tcFailed,
      Coverage_Pct: e.tcCreated > 0 ? `${((e.tcExecuted / e.tcCreated) * 100).toFixed(1)}%` : '—',
      Pass_Rate_Pct: e.tcExecuted > 0 ? `${((e.tcPassed / e.tcExecuted) * 100).toFixed(1)}%` : '—',
      Notes: e.notes || '',
    }));
  }, [filteredData.entries, projectMap, squadMap]);

  const defectsExport = useMemo(() => {
    return filteredData.defects.map((d) => ({
      ID: d.id,
      Date: d.date,
      Release: d.release,
      Project: projectMap.get(d.projectId) || 'Unknown',
      Squad: squadMap.get(d.squadId) || 'Unknown',
      Added_By: d.addedByName,
      Jira_Defect_Summary: d.jiraDefectSummary,
      Jira_Defect_Link: d.jiraDefectLink,
      Priority: d.priority,
      Status: d.status,
      SIT_Miss: d.sitMiss ? 'YES' : 'NO',
      Related_Story_Summary: d.storySummary || '',
      Related_Story_Link: d.storyLink || '',
      Notes_Or_RC: d.notes || '',
    }));
  }, [filteredData.defects, projectMap, squadMap]);

  const releasesExport = useMemo(() => {
    return filteredData.releases.map((r) => ({
      ID: r.id,
      Release_Name: r.releaseName,
      Project: projectMap.get(r.projectId) || 'Unknown',
      Squad: squadMap.get(r.squadId) || 'Unknown',
      Added_By: r.addedByName,
      Release_Date: r.releaseDate,
      Regression_Start: r.regressionStartDate || '',
      Regression_End: r.regressionEndDate || '',
      Beta_Date: r.betaDate || '',
      PROD_Release_Date: r.prodReleaseDate || '',
      Submitted_On: r.createdAt || '',
    }));
  }, [filteredData.releases, projectMap, squadMap]);

  // Timesheet Monthly Rollup format
  const timesheetExportSheets = useMemo(() => {
    // Group timesheetEntries by Month
    const monthsMap = new Map<string, any[]>();
    
    appState.timesheetEntries.forEach((entry) => {
      // Apply filters if month is selected
      if (filters.month && entry.month !== filters.month) return;

      if (!monthsMap.has(entry.month)) {
        monthsMap.set(entry.month, []);
      }
      entry.workingDays.forEach(day => {
        monthsMap.get(entry.month)!.push({
          User_Name: entry.userName,
          Month: entry.month,
          Date: `${day.date}${day.isAdminAdjustment ? ' *' : ''}`,
          Day: day.dayName,
          Status: day.status,
          Night_Deployment: day.isNightDeployment ? 'Yes' : 'No',
          Weekend_Support: day.isWeekendSupport ? 'Yes' : 'No',
          Notes: day.notes || '',
          'Adjusted By': day.isAdminAdjustment ? (day.lastModifiedBy || '') : '',
          'Adjusted By Role': day.isAdminAdjustment ? (day.lastModifiedByRole || '') : '',
          'Adjustment Date': day.isAdminAdjustment ? (day.lastModifiedAt || '') : '',
          'Is Admin Adjustment (Yes/No)': day.isAdminAdjustment ? 'Yes' : '',
        });
      });
    });

    const sheetsList: { sheetName: string; data: any[] }[] = [];
    monthsMap.forEach((rows, m) => {
      sheetsList.push({
        sheetName: `TS-${m}`,
        data: rows,
      });
    });

    return sheetsList;
  }, [appState.timesheetEntries, filters.month]);

  // Handle Singular exports
  const handleExportDataEntries = (format: 'xlsx' | 'csv') => {
    if (dataEntriesExport.length === 0) {
      showToast('No entries to export.', 'error');
      return;
    }
    if (format === 'xlsx') {
      exportToExcel([{ sheetName: 'Data Entries', data: dataEntriesExport }], 'qa_hub_data_entries');
    } else {
      exportToCSV(dataEntriesExport, 'qa_hub_data_entries');
    }
    showToast('Exported Data Entries successfully.', 'success');
  };

  const handleExportDefects = (format: 'xlsx' | 'csv') => {
    if (defectsExport.length === 0) {
      showToast('No defects to export.', 'error');
      return;
    }
    if (format === 'xlsx') {
      exportToExcel([{ sheetName: 'Defects Log', data: defectsExport }], 'qa_hub_defects_log');
    } else {
      exportToCSV(defectsExport, 'qa_hub_defects_log');
    }
    showToast('Exported Defects Log successfully.', 'success');
  };

  const handleExportReleases = (format: 'xlsx' | 'csv') => {
    if (releasesExport.length === 0) {
      showToast('No releases to export.', 'error');
      return;
    }
    if (format === 'xlsx') {
      exportToExcel([{ sheetName: 'Release Log', data: releasesExport }], 'qa_hub_release_log');
    } else {
      exportToCSV(releasesExport, 'qa_hub_release_log');
    }
    showToast('Exported Release Schedule successfully.', 'success');
  };

  const handleExportTimesheetSummary = (format: 'xlsx' | 'csv') => {
    if (timesheetExportSheets.length === 0) {
      showToast('No timesheet logs available for export.', 'error');
      return;
    }
    if (format === 'xlsx') {
      exportToExcel(timesheetExportSheets, 'qa_hub_timesheet_details');
    } else {
      exportToCSV(timesheetExportSheets.flatMap(sheet => sheet.data), 'qa_hub_timesheet_details');
    }
    showToast('Exported Timesheets summary successfully.', 'success');
  };

  // Export full combined excel report
  const handleExportFullExcel = () => {
    const sheets: { sheetName: string; data: any[] }[] = [];

    sheets.push({ sheetName: 'Data Entries', data: dataEntriesExport });
    sheets.push({ sheetName: 'Defects', data: defectsExport });
    sheets.push({ sheetName: 'Releases', data: releasesExport });

    // Append individual timesheet months
    timesheetExportSheets.forEach((s) => {
      sheets.push(s);
    });

    // Summary metrics sheet
    const summaryRow = {
      Total_Stories_Tested: dataEntriesExport.length,
      TC_Created: dataEntriesExport.reduce((acc, curr) => acc + curr.TC_Created, 0),
      TC_Executed: dataEntriesExport.reduce((acc, curr) => acc + curr.TC_Executed, 0),
      TC_Passed: dataEntriesExport.reduce((acc, curr) => acc + curr.TC_Passed, 0),
      TC_Failed: dataEntriesExport.reduce((acc, curr) => acc + curr.TC_Failed, 0),
      Total_Defects_Logged: defectsExport.length,
      Total_SIT_Misses: defectsExport.filter(d => d.SIT_Miss === 'YES').length,
    };
    sheets.unshift({ sheetName: 'Summary Stats', data: [summaryRow] });

    exportToExcel(sheets, 'qa_hub_comprehensive_full_report');
    showToast('Comprehensive report compiled & exported!', 'success');
  };

  // PDF Print Trigger
  const handlePrintPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Popup blocker blocked report generation. Please allow popups.', 'error');
      return;
    }

    // Prepare table row markup
    const metricsHtml = `
      <div class="metrics-grid">
        <div class="card"><h3>Stories</h3><p>${dataEntriesExport.length}</p></div>
        <div class="card"><h3>TC Created</h3><p>${dataEntriesExport.reduce((acc, c) => acc + c.TC_Created, 0)}</p></div>
        <div class="card"><h3>TC Executed</h3><p>${dataEntriesExport.reduce((acc, c) => acc + c.TC_Executed, 0)}</p></div>
        <div class="card"><h3>TC Passed</h3><p>${dataEntriesExport.reduce((acc, c) => acc + c.TC_Passed, 0)}</p></div>
        <div class="card"><h3>TC Failed</h3><p>${dataEntriesExport.reduce((acc, c) => acc + c.TC_Failed, 0)}</p></div>
        <div class="card"><h3>Defects</h3><p>${defectsExport.length}</p></div>
        <div class="card"><h3>SIT Misses</h3><p>${defectsExport.filter(d => d.SIT_Miss === 'YES').length}</p></div>
      </div>
    `;

    const entriesRows = dataEntriesExport.map(e => `
      <tr>
        <td>${e.Date}</td>
        <td>${e.Release}</td>
        <td>${e.Project}</td>
        <td>${e.Squad}</td>
        <td>${e.Jira_Story_Summary}</td>
        <td>${e.TC_Created}</td>
        <td>${e.TC_Executed}</td>
        <td>${e.TC_Passed} / ${e.TC_Failed}</td>
        <td>${e.Coverage_Pct}</td>
        <td>${e.Pass_Rate_Pct}</td>
      </tr>
    `).join('');

    const defectsRows = defectsExport.map(d => `
      <tr>
        <td>${d.Date}</td>
        <td>${d.Project}</td>
        <td>${d.Squad}</td>
        <td>${d.Jira_Defect_Summary}</td>
        <td>${d.Priority}</td>
        <td>${d.SIT_Miss}</td>
        <td>${d.Status}</td>
        <td>${d.Notes_Or_RC}</td>
      </tr>
    `).join('');

    const printHtml = `
      <html>
        <head>
          <title>QA Hub Report Summary</title>
          <style>
            body { font-family: -apple-system, sans-serif; padding: 32px; color: #1e293b; background: #ffffff; line-height: 1.5; }
            h1 { font-size: 26px; color: #0f172a; margin-bottom: 4px; }
            h2 { font-size: 18px; color: #3b82f6; margin-top: 28px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; }
            .date-stamp { color: #64748b; font-size: 13px; margin-bottom: 24px; }
            .metrics-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 12px; margin: 16px 0; }
            .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; text-align: center; }
            .card h3 { margin: 0; font-size: 11px; text-transform: uppercase; color: #64748b; }
            .card p { margin: 4px 0 0 0; font-size: 20px; font-weight: bold; color: #0f172a; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
            th { background-color: #f8fafc; font-weight: 600; color: #475569; }
          </style>
        </head>
        <body>
          <h1>QA Hub v4 — Audited Operations Report</h1>
          <div class="date-stamp">Compiled on ${new Date().toLocaleDateString()}</div>
          
          <h2>Summary Metrics</h2>
          ${metricsHtml}

          <h2>Data Entries Log (${filteredData.entries.length} items)</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Release</th>
                <th>Project</th>
                <th>Squad</th>
                <th>Story Summary</th>
                <th>Created</th>
                <th>Executed</th>
                <th>Pass/Fail</th>
                <th>Cov %</th>
                <th>Pass %</th>
              </tr>
            </thead>
            <tbody>
              ${entriesRows || '<tr><td colspan="10" style="text-align:center;">No records match filters.</td></tr>'}
            </tbody>
          </table>

          <h2>Defects Summary (${filteredData.defects.length} items)</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Project</th>
                <th>Squad</th>
                <th>Defect Summary</th>
                <th>Priority</th>
                <th>SIT Miss</th>
                <th>Status</th>
                <th>RC Notes</th>
              </tr>
            </thead>
            <tbody>
              ${defectsRows || '<tr><td colspan="8" style="text-align:center;">No records match filters.</td></tr>'}
            </tbody>
          </table>

          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(printHtml);
    printWindow.document.close();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Filters (Applies globally to this page exports) */}
      <FilterBar
        projects={appState.projects}
        squads={appState.squads}
        dataEntries={appState.dataEntries}
        defects={appState.defects}
        releaseNames={appState.releaseNames || []}
        filters={filters}
        setFilters={setFilters}
        theme={theme}
        showProject={currentUser.role === 'superadmin'}
        lockedProjectId={currentUser.role === 'superadmin' ? undefined : (currentUser.projectId || '')}
      />

      {/* Grid of export options cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        
        {/* Data Entries card */}
        <div style={commonStyles.card(theme)}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: theme.text, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} style={{ color: theme.blue }} />
            Data Entries
          </h3>
          <p style={{ fontSize: '13px', color: theme.muted, marginBottom: '20px' }}>
            Export filtered metrics entries ({filteredData.entries.length} matching rows). Includes test coverage percentages and story scopes.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => handleExportDataEntries('xlsx')} style={{ ...commonStyles.button(theme, 'primary', 'sm'), flex: 1 }}>
              <Download size={14} />
              Excel (.xlsx)
            </button>
            <button onClick={() => handleExportDataEntries('csv')} style={{ ...commonStyles.button(theme, 'secondary', 'sm'), flex: 1 }}>
              <Download size={14} />
              CSV (.csv)
            </button>
          </div>
        </div>

        {/* Defects Log card */}
        <div style={commonStyles.card(theme)}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: theme.text, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} style={{ color: theme.orange }} />
            Defects Log
          </h3>
          <p style={{ fontSize: '13px', color: theme.muted, marginBottom: '20px' }}>
            Export filtered defects logs ({filteredData.defects.length} matching bugs). Includes priority levels, status workflows, and SIT Miss classifications.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => handleExportDefects('xlsx')} style={{ ...commonStyles.button(theme, 'primary', 'sm'), flex: 1, backgroundColor: theme.orange }}>
              <Download size={14} />
              Excel (.xlsx)
            </button>
            <button onClick={() => handleExportDefects('csv')} style={{ ...commonStyles.button(theme, 'secondary', 'sm'), flex: 1 }}>
              <Download size={14} />
              CSV (.csv)
            </button>
          </div>
        </div>

        {/* Releases Log card */}
        <div style={commonStyles.card(theme)}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: theme.text, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} style={{ color: theme.green }} />
            Release Roadmap
          </h3>
          <p style={{ fontSize: '13px', color: theme.muted, marginBottom: '20px' }}>
            Export QA release dates and regression test cycles ({filteredData.releases.length} matching entries).
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => handleExportReleases('xlsx')} style={{ ...commonStyles.button(theme, 'primary', 'sm'), flex: 1, backgroundColor: theme.green }}>
              <Download size={14} />
              Excel (.xlsx)
            </button>
            <button onClick={() => handleExportReleases('csv')} style={{ ...commonStyles.button(theme, 'secondary', 'sm'), flex: 1 }}>
              <Download size={14} />
              CSV (.csv)
            </button>
          </div>
        </div>

        {/* Timesheets card */}
        <div style={commonStyles.card(theme)}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: theme.text, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} style={{ color: theme.indigo }} />
            Timesheet Summaries
          </h3>
          <p style={{ fontSize: '13px', color: theme.muted, marginBottom: '20px' }}>
            Export attendance audits, training schedules, leave balances, night shifts, and weekend rosters.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => handleExportTimesheetSummary('xlsx')} style={{ ...commonStyles.button(theme, 'primary', 'sm'), flex: 1, backgroundColor: theme.indigo }}>
              <Download size={14} />
              Excel
            </button>
            <button onClick={() => handleExportTimesheetSummary('csv')} style={{ ...commonStyles.button(theme, 'secondary', 'sm'), flex: 1 }}>
              <Download size={14} />
              CSV
            </button>
          </div>
        </div>

        {/* Unified Comprehensive report card */}
        <div style={{ ...commonStyles.card(theme), gridColumn: '1 / -1', border: `1.5px dashed ${theme.blue}`, backgroundColor: `${theme.blue}05` }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: theme.text, marginBottom: '6px' }}>
            QA Hub Comprehensive Executive Report Compiler
          </h3>
          <p style={{ fontSize: '13px', color: theme.muted, marginBottom: '20px' }}>
            Generate a full combined multi-sheet workbook containing executive stats, test coverage tables, defect breakdown metrics, and active support timetables.
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={handleExportFullExcel} style={{ ...commonStyles.button(theme, 'primary'), flex: 1 }}>
              <Download size={16} />
              Download Combined Excel Workbook (.xlsx)
            </button>
            <button onClick={handlePrintPDF} style={{ ...commonStyles.button(theme, 'secondary'), flex: 1, color: theme.text }}>
              <Printer size={16} />
              Generate Print / PDF Report
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
