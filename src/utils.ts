/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import { AppState, User, UserPermissions } from './types';

export const DEFAULT_PERMISSIONS = {
  superadmin: {
    dashboard: 'edit',
    dataEntry: 'edit',
    defects: 'edit',
    releases: 'edit',
    timesheet: 'edit',
    export: 'edit',
    holidayList: 'edit',
    settings: 'edit',
  },
  admin: {
    dashboard: 'edit',
    dataEntry: 'edit',
    defects: 'edit',
    releases: 'edit',
    timesheet: 'edit',
    export: 'edit',
    holidayList: 'edit',
    settings: 'edit',
  },
  lead: {
    dashboard: 'view',
    dataEntry: 'edit',
    defects: 'edit',
    releases: 'edit',
    timesheet: 'edit',
    export: 'view',
    holidayList: 'none',
    settings: 'none',
  },
  member: {
    dashboard: 'none',
    dataEntry: 'edit',
    defects: 'edit',
    releases: 'edit',
    timesheet: 'edit',
    export: 'none',
    holidayList: 'none',
    settings: 'none',
  },
} as const;

export const getPermissionsForRole = (role: 'superadmin' | 'admin' | 'lead' | 'member'): UserPermissions => {
  return { ...DEFAULT_PERMISSIONS[role] };
};

export const hashPassword = async (password: string): Promise<string> => {
  const data = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
};

export const isPasswordHash = (value?: string): boolean => /^[a-f0-9]{64}$/i.test(value || '');

export const sanitise = <T>(value: T): T => {
  if (typeof value !== 'string') return value;
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;') as T;
};

export const getEffectivePermissions = (user: User): UserPermissions => {
  return user.role === 'superadmin'
    ? getPermissionsForRole('superadmin')
    : (user.permissions || getPermissionsForRole(user.role));
};

export const scopeAppStateForUser = (state: AppState, user: User): AppState => {
  if (user.role === 'superadmin') return state;

  const projectId = user.projectId;
  const squadId = user.squadId;
  const projectUsers = state.users.filter((u) => {
    if (u.id === user.id) return true;
    if (u.projectId !== projectId) return false;
    if (user.role === 'admin') return true;
    return u.squadId === squadId;
  });
  const visibleUserIds = new Set(projectUsers.map((u) => u.id));

  const inScope = (record: { projectId: string; squadId?: string }) => {
    if (record.projectId !== projectId) return false;
    if ((user.role === 'lead' || user.role === 'member') && squadId) {
      return record.squadId === squadId;
    }
    return true;
  };

  return {
    ...state,
    users: projectUsers,
    projects: state.projects.filter((p) => p.id === projectId),
    squads: state.squads.filter((s) => s.projectId === projectId && (
      user.role === 'admin' || !squadId || s.id === squadId
    )),
    dataEntries: state.dataEntries.filter(inScope),
    defects: state.defects.filter(inScope),
    releaseEntries: state.releaseEntries.filter(inScope),
    timesheetEntries: state.timesheetEntries.filter((entry) => visibleUserIds.has(entry.userId)),
  };
};

export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 11);
};

export const formatDate = (str: string): string => {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  if (isNaN(d.getTime())) return str;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

export function formatTime(isoString: string): string {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDateTime(isoString: string): string {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + formatTime(isoString);
}

export const getMonthLabel = (str: string): string => {
  if (!str) return '—';
  const parts = str.split('-');
  if (parts.length < 2) return str;
  const year = parseInt(parts[0]);
  const month = parseInt(parts[1]);
  const date = new Date(year, month - 1, 1);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
};

export const checkIsWeekend = (dateStr: string): boolean => {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
};

export const getDaysInMonth = (year: number, month: number): string[] => {
  const dates: string[] = [];
  const date = new Date(year, month - 1, 1);
  while (date.getMonth() === month - 1) {
    const dStr = date.getDate().toString().padStart(2, '0');
    const mStr = month.toString().padStart(2, '0');
    dates.push(`${year}-${mStr}-${dStr}`);
    date.setDate(date.getDate() + 1);
  }
  return dates;
};

export const getDaysForMonth = (year: number, month: number) => {
  const daysInMonth = new Date(year, month, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(year, month - 1, index + 1);
    const dayName = date.toLocaleDateString('en-GB', { weekday: 'short' });
    const isWeekendDay = date.getDay() === 0 || date.getDay() === 6;
    const monthPart = String(month).padStart(2, '0');
    const dayPart = String(index + 1).padStart(2, '0');
    return {
      date: `${year}-${monthPart}-${dayPart}`,
      dayName,
      isWeekendDay,
      status: (isWeekendDay ? 'Weekend' : 'Working') as 'Weekend' | 'Working',
      isStatusSet: false,
      isNightDeployment: false,
      isWeekendSupport: false,
      notes: '',
      workLocation: null,
      lastModifiedBy: null,
      lastModifiedByRole: null,
      lastModifiedAt: null,
      isAdminAdjustment: false,
    };
  });
};

// Excel / CSV Export helper
export const exportToExcel = (sheets: { sheetName: string; data: any[] }[], fileName: string) => {
  try {
    const wb = XLSX.utils.book_new();
    sheets.forEach(({ sheetName, data }) => {
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 30)); // 31 chars max for sheet name
    });
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  } catch (error) {
    console.error('Failed to export to Excel', error);
  }
};

export const exportToCSV = (data: any[], fileName: string) => {
  try {
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `${fileName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('Failed to export to CSV', error);
  }
};
