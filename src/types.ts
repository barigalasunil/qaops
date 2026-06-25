/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface UserPermissions {
  dashboard: 'edit' | 'view' | 'none';
  dataEntry: 'edit' | 'view' | 'none';
  defects: 'edit' | 'view' | 'none';
  releases: 'edit' | 'view' | 'none';
  timesheet: 'edit' | 'view' | 'none';
  export: 'edit' | 'view' | 'none';
  settings: 'edit' | 'view' | 'none';
}

export interface User {
  id: string;
  username: string;
  password?: string;
  role: 'superadmin' | 'admin' | 'lead' | 'member';
  squadId: string | null;
  projectId: string | null;
  permissions?: UserPermissions;
  createdBy: string | null;
  createdByRole: 'superadmin' | 'admin' | 'lead' | 'member' | null;
  mustChangePassword: boolean;
  loginCount: number;
  failedLoginAttempts: number;
  lockedUntil: number | null;
}

export interface Project {
  id: string;
  name: string;
}

export interface Squad {
  id: string;
  name: string;
  projectId: string | null;
}

export interface Release {
  id: string;
  name: string;
}

export interface DataEntry {
  id: string;
  date: string;
  release: string; // free text field
  projectId: string;
  squadId: string;
  jiraStoryLink: string;
  jiraStorySummary: string;
  tcCreated: number;
  tcExecuted: number;
  tcPassed: number;
  tcFailed: number;
  notes: string;
  addedBy: string;
  addedByName: string;
  customFields?: Record<string, any>;
}

export interface Defect {
  id: string;
  date: string;
  release: string; // free text
  projectId: string;
  squadId: string;
  jiraDefectLink: string;
  jiraDefectSummary: string;
  priority: 'P1' | 'P2' | 'P3';
  status: 'Open' | 'In Progress' | 'Re-Opened' | 'Resolved' | 'Closed';
  sitMiss: boolean;
  storyLink?: string;
  storySummary?: string;
  notes: string;
  addedBy: string;
  addedByName: string;
  customFields?: Record<string, any>;
}

export interface ReleaseEntry {
  id: string;
  releaseName: string; // free text
  projectId: string;
  squadId: string;
  releaseDate: string;
  regressionStartDate?: string;
  regressionEndDate?: string;
  betaDate?: string;
  prodReleaseDate?: string;
  addedBy: string;
  addedByName: string;
  createdAt: string;
}

export interface WorkingDay {
  date: string; // YYYY-MM-DD
  dayName: string;
  isWeekendDay: boolean;
  status: 'Weekend' | 'Working' | 'Leave' | 'Holiday' | 'WFH' | 'Training';
  isNightDeployment: boolean;
  isWeekendSupport: boolean;
  notes: string;
  lastModifiedBy: string | null;
  lastModifiedByRole: User['role'] | null;
  lastModifiedAt: string | null;
  isAdminAdjustment: boolean;
  // Legacy fields retained for loading older localStorage records.
  isNightShift?: boolean;
  isWeekend?: boolean;
}

export interface TimesheetEntry {
  id: string;
  userId: string;
  userName: string;
  month: string; // "YYYY-MM"
  workingDays: WorkingDay[];
}

export interface CustomField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'url' | 'date';
  options?: string[]; // comma-separated strings inside array of options
  appliesTo: 'dataEntry' | 'defect' | 'both';
}

export interface AppState {
  users: User[];
  projects: Project[];
  squads: Squad[];
  releases: Release[];
  releaseNames?: Release[]; // Added master list of release names
  dataEntries: DataEntry[];
  defects: Defect[];
  releaseEntries: ReleaseEntry[];
  timesheetEntries: TimesheetEntry[];
  customFields: CustomField[];
}
