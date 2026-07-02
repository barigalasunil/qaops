import React, { useState, useMemo, useRef } from 'react';
import { ThemeTokens, commonStyles } from '../theme';
import { AppState, User, DataEntry, Defect, Holiday, AuditLogEntry } from '../types';
import { generateId, hashPassword, sanitise } from '../utils';
import { Upload, FileSpreadsheet, AlertTriangle, Check, X, ChevronDown, ChevronRight } from 'lucide-react';

interface BulkImportProps {
  currentUser: User;
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  showToast: (msg: string, type: 'success' | 'error' | 'warning') => void;
  theme: ThemeTokens;
}

type ImportType = 'dataEntries' | 'defects' | 'holidays' | 'users';

interface KnownField {
  field: string;
  label: string;
  required: boolean;
}

const DATA_FIELDS: KnownField[] = [
  { field: 'date', label: 'Date', required: true },
  { field: 'release', label: 'Release', required: true },
  { field: 'projectId', label: 'Project ID', required: true },
  { field: 'squadId', label: 'Squad ID', required: true },
  { field: 'jiraStoryLink', label: 'Jira Story Link', required: true },
  { field: 'jiraStorySummary', label: 'Jira Story Summary', required: true },
  { field: 'storyPoints', label: 'Story Points', required: false },
  { field: 'tcCreated', label: 'TC Created', required: false },
  { field: 'tcExecuted', label: 'TC Executed', required: false },
  { field: 'tcPassed', label: 'TC Passed', required: false },
  { field: 'tcFailed', label: 'TC Failed', required: false },
  { field: 'notes', label: 'Notes', required: false },
  { field: 'storyStatus', label: 'Story Status', required: false },
  { field: 'addedBy', label: 'Added By', required: false },
  { field: 'addedByName', label: 'Added By Name', required: false },
];

const DEFECT_FIELDS: KnownField[] = [
  { field: 'date', label: 'Date', required: true },
  { field: 'release', label: 'Release', required: true },
  { field: 'projectId', label: 'Project ID', required: true },
  { field: 'squadId', label: 'Squad ID', required: true },
  { field: 'jiraDefectLink', label: 'Jira Defect Link', required: true },
  { field: 'jiraDefectSummary', label: 'Jira Defect Summary', required: true },
  { field: 'priority', label: 'Priority (P1/P2/P3)', required: false },
  { field: 'status', label: 'Status', required: false },
  { field: 'sitMiss', label: 'SIT Miss (true/false)', required: false },
  { field: 'storyLink', label: 'Story Link', required: false },
  { field: 'storySummary', label: 'Story Summary', required: false },
  { field: 'notes', label: 'Notes', required: false },
  { field: 'addedBy', label: 'Added By', required: false },
  { field: 'addedByName', label: 'Added By Name', required: false },
];

const HOLIDAY_FIELDS: KnownField[] = [
  { field: 'date', label: 'Date', required: true },
  { field: 'name', label: 'Holiday Name', required: true },
  { field: 'type', label: 'Type (Holiday/Optional Holiday)', required: true },
];

const USER_FIELDS: KnownField[] = [
  { field: 'username', label: 'Username', required: true },
  { field: 'password', label: 'Password', required: false },
  { field: 'email', label: 'Email', required: false },
  { field: 'role', label: 'Role', required: false },
  { field: 'squadId', label: 'Squad ID', required: false },
  { field: 'projectId', label: 'Project ID', required: false },
  { field: 'jobTitle', label: 'Job Title', required: false },
];

const FIELD_ALIASES: Record<string, string> = {
  date: 'date',
  release: 'release',
  projectid: 'projectId',
  project: 'projectId',
  project_id: 'projectId',
  squadid: 'squadId',
  squad: 'squadId',
  squad_id: 'squadId',
  jirastorylink: 'jiraStoryLink',
  story_link: 'jiraStoryLink',
  jira_story_link: 'jiraStoryLink',
  jira_story: 'jiraStoryLink',
  jirastorysummary: 'jiraStorySummary',
  storysummary: 'jiraStorySummary',
  story_summary: 'jiraStorySummary',
  jira_story_summary: 'jiraStorySummary',
  storypoints: 'storyPoints',
  story_points: 'storyPoints',
  tccreated: 'tcCreated',
  tc_created: 'tcCreated',
  tcexecuted: 'tcExecuted',
  tc_executed: 'tcExecuted',
  tcpassed: 'tcPassed',
  tc_passed: 'tcPassed',
  tcfailed: 'tcFailed',
  tc_failed: 'tcFailed',
  notes: 'notes',
  comment: 'notes',
  storystatus: 'storyStatus',
  story_status: 'storyStatus',
  addedby: 'addedBy',
  added_by: 'addedBy',
  addedbyname: 'addedByName',
  added_by_name: 'addedByName',
  jiradfectlink: 'jiraDefectLink',
  defectlink: 'jiraDefectLink',
  defect_link: 'jiraDefectLink',
  jira_defect_link: 'jiraDefectLink',
  jiradefect: 'jiraDefectLink',
  jiradfectsummary: 'jiraDefectSummary',
  defectsummary: 'jiraDefectSummary',
  defect_summary: 'jiraDefectSummary',
  jira_defect_summary: 'jiraDefectSummary',
  priority: 'priority',
  status: 'status',
  sitmiss: 'sitMiss',
  sit_miss: 'sitMiss',
  sits: 'sitMiss',
  sit: 'sitMiss',
  story: 'storySummary',
  storylink: 'storyLink',
  name: 'name',
  holidayname: 'name',
  holiday_name: 'name',
  type: 'type',
  holidaytype: 'type',
  holiday_type: 'type',
  username: 'username',
  user: 'username',
  password: 'password',
  pass: 'password',
  email: 'email',
  role: 'role',
  jobtitle: 'jobTitle',
  job_title: 'jobTitle',
  title: 'jobTitle',
};

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      row.push(current.trim());
      current = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(current.trim());
      current = '';
      if (row.length > 0 && (row.length > 1 || row[0] !== '')) {
        rows.push(row);
      }
      row = [];
    } else {
      current += ch;
    }
  }
  if (current || row.length > 0) {
    row.push(current.trim());
    if (row.length > 0 && (row.length > 1 || row[0] !== '')) {
      rows.push(row);
    }
  }
  return rows;
}

function detectMapping(headers: string[], knownFields: KnownField[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  const usedIndices = new Set<number>();

  knownFields.forEach(({ field }) => {
    const aliasKey = field.toLowerCase();
    let bestIdx = -1;
    let bestScore = 0;

    headers.forEach((header, idx) => {
      if (usedIndices.has(idx)) return;
      const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normalizedRaw = header.toLowerCase();

      if (FIELD_ALIASES[normalized] === field || FIELD_ALIASES[normalizedRaw] === field) {
        if (3 > bestScore) {
          bestScore = 3;
          bestIdx = idx;
        }
      }

      if (normalized === aliasKey || normalizedRaw === aliasKey || normalizedRaw.replace(/[^a-z]/g, '') === aliasKey) {
        if (2 > bestScore) {
          bestScore = 2;
          bestIdx = idx;
        }
      }

      if (normalized.includes(aliasKey) || aliasKey.includes(normalized)) {
        if (1 > bestScore) {
          bestScore = 1;
          bestIdx = idx;
        }
      }
    });

    if (bestIdx >= 0) {
      mapping[field] = bestIdx;
      usedIndices.add(bestIdx);
    }
  });

  return mapping;
}

export function BulkImport({ currentUser, appState, setAppState, showToast, theme }: BulkImportProps) {
  const [activeTab, setActiveTab] = useState<ImportType>('dataEntries');
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, number>>({});
  const [importing, setImporting] = useState(false);
  const [expandedPreview, setExpandedPreview] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const headers = useMemo(() => {
    return parsedRows.length > 0 ? parsedRows[0] : [];
  }, [parsedRows]);

  const dataRows = useMemo(() => {
    return parsedRows.length > 1 ? parsedRows.slice(1) : [];
  }, [parsedRows]);

  const previewRows = useMemo(() => {
    return dataRows.slice(0, 5);
  }, [dataRows]);

  const knownFields = useMemo(() => {
    switch (activeTab) {
      case 'dataEntries': return DATA_FIELDS;
      case 'defects': return DEFECT_FIELDS;
      case 'holidays': return HOLIDAY_FIELDS;
      case 'users': return USER_FIELDS;
    }
  }, [activeTab]);

  const toggleMappingField = (field: string, colIdx: number) => {
    setColumnMapping(prev => {
      const next = { ...prev };
      const existingEntry = Object.entries(next).find(([, v]) => v === colIdx);
      if (existingEntry) {
        delete next[existingEntry[0]];
      }
      if (next[field] === colIdx) {
        delete next[field];
      } else {
        next[field] = colIdx;
      }
      return next;
    });
  };

  const getCellValue = (rowIdx: number, field: string): string => {
    const colIdx = columnMapping[field];
    if (colIdx === undefined || colIdx < 0 || colIdx >= (dataRows[rowIdx]?.length || 0)) return '';
    return dataRows[rowIdx][colIdx] || '';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setFileContent(text);
      const rows = parseCSV(text);
      setParsedRows(rows);
      if (rows.length > 0) {
        const detection = detectMapping(rows[0], knownFields);
        setColumnMapping(detection);
      } else {
        setColumnMapping({});
      }
      setExpandedPreview(true);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!fileContent || dataRows.length === 0) {
      showToast('No data to import.', 'warning');
      return;
    }

    setImporting(true);
    let imported = 0;
    let skipped = 0;

    try {
      switch (activeTab) {
        case 'dataEntries': {
          const newEntries: DataEntry[] = [];
          dataRows.forEach((row) => {
            const entry: Partial<DataEntry> = {};
            const requiredFields = ['date', 'release', 'projectId', 'squadId', 'jiraStoryLink', 'jiraStorySummary'];
            let hasAllRequired = true;

            DATA_FIELDS.forEach(({ field }) => {
              const val = columnMapping[field] !== undefined ? row[columnMapping[field]]?.trim() || '' : '';
              (entry as any)[field] = val;
              if (requiredFields.includes(field) && !val) {
                hasAllRequired = false;
              }
            });

            if (!hasAllRequired) {
              skipped++;
              return;
            }

            newEntries.push({
              id: generateId(),
              date: (entry.date || ''),
              release: sanitise(entry.release || ''),
              projectId: entry.projectId || '',
              squadId: entry.squadId || '',
              jiraStoryLink: entry.jiraStoryLink || '',
              jiraStorySummary: sanitise(entry.jiraStorySummary || ''),
              storyPoints: entry.storyPoints === '' || entry.storyPoints === undefined || entry.storyPoints === null ? null : Number(entry.storyPoints),
              tcCreated: Number(entry.tcCreated) || 0,
              tcExecuted: entry.tcExecuted ? Number(entry.tcExecuted) : null,
              tcPassed: entry.tcPassed ? Number(entry.tcPassed) : null,
              tcFailed: entry.tcFailed ? Number(entry.tcFailed) : null,
              notes: sanitise(entry.notes || ''),
              storyStatus: (entry.storyStatus as DataEntry['storyStatus']) || undefined,
              addedBy: currentUser.id,
              addedByName: currentUser.username,
              lastEditedBy: null,
              lastEditedAt: null,
              lastEditedByRole: null,
              sprintId: '',
              sprintName: '',
            });
            imported++;
          });

          if (newEntries.length > 0) {
            setAppState(prev => ({
              ...prev,
              dataEntries: [...prev.dataEntries, ...newEntries],
              auditLog: [{
                id: generateId(),
                timestamp: new Date().toISOString(),
                userId: currentUser.id,
                username: currentUser.username,
                role: currentUser.role,
                action: 'DATA_ENTRY_ADD',
                details: `Bulk imported ${newEntries.length} data entries`,
                ipHint: 'Browser session',
              }, ...(prev.auditLog || [])].slice(0, 500),
            }));
          }
          break;
        }

        case 'defects': {
          const newDefects: Defect[] = [];
          dataRows.forEach((row) => {
            const entry: Partial<Defect> = {};
            const requiredFields = ['date', 'release', 'projectId', 'squadId', 'jiraDefectLink', 'jiraDefectSummary'];
            let hasAllRequired = true;

            DEFECT_FIELDS.forEach(({ field }) => {
              const val = columnMapping[field] !== undefined ? row[columnMapping[field]]?.trim() || '' : '';
              (entry as any)[field] = val;
              if (requiredFields.includes(field) && !val) {
                hasAllRequired = false;
              }
            });

            if (!hasAllRequired) {
              skipped++;
              return;
            }

            const sitMissVal = (entry.sitMiss || '').toString().toLowerCase();
            newDefects.push({
              id: generateId(),
              date: (entry.date || ''),
              release: sanitise(entry.release || ''),
              projectId: entry.projectId || '',
              squadId: entry.squadId || '',
              jiraDefectLink: entry.jiraDefectLink || '',
              jiraDefectSummary: sanitise(entry.jiraDefectSummary || ''),
              priority: (['P1', 'P2', 'P3'].includes(entry.priority as string) ? entry.priority : 'P2') as 'P1' | 'P2' | 'P3',
              status: (['Open', 'In Progress', 'Re-Opened', 'Resolved', 'Closed'].includes(entry.status as string) ? entry.status : 'Open') as Defect['status'],
              sitMiss: sitMissVal === 'true' || sitMissVal === 'yes' || sitMissVal === '1',
              storyLink: entry.storyLink || undefined,
              storySummary: sanitise(entry.storySummary || '') || undefined,
              notes: sanitise(entry.notes || ''),
              addedBy: currentUser.id,
              addedByName: currentUser.username,
              sprintId: '',
              sprintName: '',
            });
            imported++;
          });

          if (newDefects.length > 0) {
            setAppState(prev => ({
              ...prev,
              defects: [...prev.defects, ...newDefects],
              auditLog: [{
                id: generateId(),
                timestamp: new Date().toISOString(),
                userId: currentUser.id,
                username: currentUser.username,
                role: currentUser.role,
                action: 'DEFECT_ADD',
                details: `Bulk imported ${newDefects.length} defects`,
                ipHint: 'Browser session',
              }, ...(prev.auditLog || [])].slice(0, 500),
            }));
          }
          break;
        }

        case 'holidays': {
          const newHolidays: Holiday[] = [];
          dataRows.forEach((row) => {
            const entry: Partial<Holiday> = {};
            const requiredFields = ['date', 'name', 'type'];
            let hasAllRequired = true;

            HOLIDAY_FIELDS.forEach(({ field }) => {
              const val = columnMapping[field] !== undefined ? row[columnMapping[field]]?.trim() || '' : '';
              (entry as any)[field] = val;
              if (requiredFields.includes(field) && !val) {
                hasAllRequired = false;
              }
            });

            if (!hasAllRequired) {
              skipped++;
              return;
            }

            if (entry.date && entry.name) {
              const typeVal = entry.type as string;
              const normalizedType = typeVal?.toLowerCase().includes('optional') ? 'Optional Holiday' : 'Holiday';
              newHolidays.push({
                id: generateId(),
                date: entry.date,
                name: sanitise(entry.name),
                type: normalizedType as 'Holiday' | 'Optional Holiday',
                year: Number(entry.date.slice(0, 4)),
                createdBy: currentUser.username,
                createdAt: new Date().toISOString(),
              });
              imported++;
            } else {
              skipped++;
            }
          });

          if (newHolidays.length > 0) {
            setAppState(prev => ({
              ...prev,
              holidays: [...(prev.holidays || []), ...newHolidays],
              auditLog: [{
                id: generateId(),
                timestamp: new Date().toISOString(),
                userId: currentUser.id,
                username: currentUser.username,
                role: currentUser.role,
                action: 'HOLIDAY_ADD',
                details: `Bulk imported ${newHolidays.length} holidays`,
                ipHint: 'Browser session',
              }, ...(prev.auditLog || [])].slice(0, 500),
            }));
          }
          break;
        }

        case 'users': {
          const newUsers: User[] = [];
          const userPromises: Promise<void>[] = [];

          dataRows.forEach((row) => {
            const entry: Partial<User & { password: string }> = {};
            const requiredFields = ['username'];
            let hasAllRequired = true;

            USER_FIELDS.forEach(({ field }) => {
              const val = columnMapping[field] !== undefined ? row[columnMapping[field]]?.trim() || '' : '';
              (entry as any)[field] = val;
              if (requiredFields.includes(field) && !val) {
                hasAllRequired = false;
              }
            });

            if (!hasAllRequired) {
              skipped++;
              return;
            }

            const p = (async () => {
              const hashedPassword = entry.password
                ? await hashPassword(entry.password)
                : await hashPassword('Default@123');

              newUsers.push({
                id: generateId(),
                username: sanitise(entry.username || ''),
                password: hashedPassword,
                email: (entry.email || '').trim(),
                role: (['superadmin', 'admin', 'lead', 'member', 'guest'].includes(entry.role as string) ? entry.role : 'member') as User['role'],
                squadId: entry.squadId || null,
                projectId: entry.projectId || null,
                jobTitle: sanitise(entry.jobTitle || '') || undefined,
                createdBy: currentUser.id,
                createdByRole: currentUser.role,
                mustChangePassword: true,
                loginCount: 0,
                failedLoginAttempts: 0,
                lockedUntil: null,
                birthday: null,
                loginCountWithoutBirthday: 0,
                directReports: [],
              });
              imported++;
            })();
            userPromises.push(p);
          });

          await Promise.all(userPromises);

          if (newUsers.length > 0) {
            setAppState(prev => ({
              ...prev,
              users: [...prev.users, ...newUsers],
              auditLog: [{
                id: generateId(),
                timestamp: new Date().toISOString(),
                userId: currentUser.id,
                username: currentUser.username,
                role: currentUser.role,
                action: 'CREATE_USER',
                details: `Bulk imported ${newUsers.length} users`,
                ipHint: 'Browser session',
              }, ...(prev.auditLog || [])].slice(0, 500),
            }));
          }
          break;
        }
      }

      showToast(`Imported ${imported} records successfully. ${skipped} rows skipped.`, imported > 0 ? 'success' : 'warning');
      setFileContent(null);
      setFileName('');
      setParsedRows([]);
      setColumnMapping({});
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      showToast('Import failed. Please check your file format.', 'error');
    } finally {
      setImporting(false);
    }
  };

  const usedColumnIndices = useMemo(() => {
    const used = new Set(Object.values(columnMapping).filter(v => v !== undefined));
    const result: { idx: number; field: string | null }[] = [];
    headers.forEach((header, idx) => {
      const field = Object.entries(columnMapping).find(([, v]) => v === idx)?.[0] || null;
      result.push({ idx, field });
    });
    return result;
  }, [headers, columnMapping]);

  const unmappedFields = useMemo(() => {
    return knownFields.filter(({ field }) => columnMapping[field] === undefined);
  }, [knownFields, columnMapping]);

  const tabLabels: Record<ImportType, string> = {
    dataEntries: 'Data Entries',
    defects: 'Defects',
    holidays: 'Holidays',
    users: 'Users',
  };

  const importInstructions: Record<ImportType, string> = {
    dataEntries: 'CSV must include headers: Date, Release, Project ID, Squad ID, Jira Story Link, Jira Story Summary. Optional: TC Created, TC Executed, TC Passed, TC Failed, Notes, Story Status.',
    defects: 'CSV must include headers: Date, Release, Project ID, Squad ID, Jira Defect Link, Jira Defect Summary. Optional: Priority, Status, SIT Miss, Story Link, Story Summary, Notes.',
    holidays: 'CSV must include headers: Date, Name, Type (Holiday or Optional Holiday).',
    users: 'CSV must include headers: Username. Optional: Password, Email, Role, Squad ID, Project ID, Job Title.',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Tab selection */}
      <div style={{ display: 'flex', borderBottom: `2px solid ${theme.border}`, gap: '16px' }}>
        {(Object.keys(tabLabels) as ImportType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              setFileContent(null);
              setFileName('');
              setParsedRows([]);
              setColumnMapping({});
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
            }}
            style={{
              padding: '12px 16px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab ? `3px solid ${theme.blue}` : '3px solid transparent',
              color: activeTab === tab ? theme.blue : theme.muted,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              fontSize: '15px',
            }}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      <div style={commonStyles.card(theme)}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Upload size={18} style={{ color: theme.blue }} />
          Import {tabLabels[activeTab]}
        </h3>

        <p style={{ fontSize: '12px', color: theme.muted, marginBottom: '16px', lineHeight: 1.5 }}>
          {importInstructions[activeTab]}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <label style={{ ...commonStyles.button(theme, 'secondary'), cursor: 'pointer' }}>
            <FileSpreadsheet size={16} />
            {fileName ? 'Change CSV File' : 'Select CSV File'}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </label>
          {fileName && (
            <span style={{ fontSize: '12px', color: theme.text }}>
              <Check size={14} style={{ color: theme.green, verticalAlign: 'middle', marginRight: '4px' }} />
              {fileName} ({dataRows.length} data rows)
            </span>
          )}
        </div>

        {headers.length > 0 && (
          <>
            {/* Column mapping */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }} onClick={() => setExpandedPreview(v => !v)}>
                {expandedPreview ? <ChevronDown size={16} style={{ color: theme.muted }} /> : <ChevronRight size={16} style={{ color: theme.muted }} />}
                <span style={{ fontSize: '13px', fontWeight: 600, color: theme.text }}>Column Mapping & Preview</span>
                <span style={{ fontSize: '11px', color: theme.muted }}>({usedColumnIndices.filter(c => c.field).length}/{knownFields.length} fields mapped)</span>
              </div>

              {expandedPreview && (
                <div style={{ overflowX: 'auto', border: `1px solid ${theme.border}`, borderRadius: '8px' }}>
                  <table style={commonStyles.table(theme)}>
                    <thead>
                      <tr>
                        <th style={{ ...commonStyles.th(theme), minWidth: '140px' }}>Known Field</th>
                        <th style={commonStyles.th(theme)}>Required</th>
                        <th style={{ ...commonStyles.th(theme), minWidth: '200px' }}>CSV Column</th>
                        <th style={commonStyles.th(theme)}>Preview (first 5 rows)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {knownFields.map(({ field, label, required }) => {
                        const mappedCol = columnMapping[field];
                        const mappedHeader = mappedCol !== undefined ? headers[mappedCol] || `Column ${mappedCol}` : null;
                        return (
                          <tr key={field}>
                            <td style={{ ...commonStyles.td(theme), fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</td>
                            <td style={commonStyles.td(theme)}>
                              {required ? (
                                <span style={{ fontSize: '10px', fontWeight: 600, color: theme.red }}>Required</span>
                              ) : (
                                <span style={{ fontSize: '10px', color: theme.muted }}>Optional</span>
                              )}
                            </td>
                            <td style={commonStyles.td(theme)}>
                              <select
                                value={mappedCol !== undefined ? String(mappedCol) : ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === '') {
                                    const next = { ...columnMapping };
                                    delete next[field];
                                    setColumnMapping(next);
                                  } else {
                                    toggleMappingField(field, Number(val));
                                  }
                                }}
                                style={commonStyles.select(theme)}
                              >
                                <option value="">— Skip / Not mapped —</option>
                                {headers.map((header, idx) => (
                                  <option key={idx} value={String(idx)}>
                                    {header || `Column ${idx + 1}`}
                                  </option>
                                ))}
                              </select>
                              {mappedHeader && !required && (
                                <span style={{ marginLeft: '6px', fontSize: '10px', color: theme.muted }}>(auto-detected)</span>
                              )}
                            </td>
                            <td style={{ ...commonStyles.td(theme), fontSize: '11px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {mappedCol !== undefined ? (
                                <div style={{ display: 'flex', gap: '12px' }}>
                                  {previewRows.map((row, ri) => (
                                    <span key={ri} style={{ backgroundColor: theme.inputBg, padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>
                                      {row[mappedCol] || <span style={{ color: theme.muted, fontStyle: 'italic' }}>empty</span>}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span style={{ color: theme.muted, fontStyle: 'italic' }}>Not mapped</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {usedColumnIndices.filter(c => !c.field).map(({ idx }) => (
                        <tr key={`unused-${idx}`}>
                          <td style={{ ...commonStyles.td(theme), color: theme.muted, fontStyle: 'italic' }}>Skip</td>
                          <td style={commonStyles.td(theme)}>
                            <span style={{ fontSize: '10px', color: theme.muted }}>—</span>
                          </td>
                          <td style={commonStyles.td(theme)}>
                            <span style={{ fontSize: '12px', color: theme.muted }}>{headers[idx] || `Column ${idx + 1}`}</span>
                          </td>
                          <td style={{ ...commonStyles.td(theme), fontSize: '11px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: '12px' }}>
                              {previewRows.map((row, ri) => (
                                <span key={ri} style={{ backgroundColor: theme.inputBg, padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>
                                  {row[idx] || <span style={{ color: theme.muted, fontStyle: 'italic' }}>empty</span>}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {unmappedFields.filter(f => f.required).length > 0 && (
              <div style={{ padding: '12px 16px', backgroundColor: `${theme.amber}1a`, border: `1px solid ${theme.amber}`, borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: theme.text }}>
                <AlertTriangle size={16} style={{ color: theme.amber, flexShrink: 0 }} />
                <span>Required fields not mapped: <strong>{unmappedFields.filter(f => f.required).map(f => f.label).join(', ')}</strong>. Please assign CSV columns before importing.</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => {
                  setFileContent(null);
                  setFileName('');
                  setParsedRows([]);
                  setColumnMapping({});
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                style={commonStyles.button(theme, 'secondary')}
                disabled={importing}
              >
                <X size={16} />
                Clear
              </button>
              <button
                onClick={handleImport}
                style={commonStyles.button(theme, unmappedFields.filter(f => f.required).length > 0 ? 'secondary' : 'primary')}
                disabled={importing || dataRows.length === 0 || unmappedFields.filter(f => f.required).length > 0}
              >
                {importing ? (
                  <>
                    <span className="spin" style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    Import {dataRows.length} Records
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {!fileContent && (
          <div style={{ padding: '40px', textAlign: 'center', color: theme.muted, border: `2px dashed ${theme.border}`, borderRadius: '8px' }}>
            <FileSpreadsheet size={40} style={{ marginBottom: '12px', opacity: 0.5 }} />
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>Select a CSV file to begin</div>
            <div style={{ fontSize: '12px' }}>Your data will be parsed and shown in a preview table before importing.</div>
          </div>
        )}
      </div>
    </div>
  );
}
