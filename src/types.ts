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
  holidayList: 'edit' | 'view' | 'none';
  settings: 'edit' | 'view' | 'none';
}

export interface User {
  id: string;
  username: string;
  password?: string;
  role: 'superadmin' | 'admin' | 'lead' | 'member' | 'guest';
  squadId: string | null;
  projectId: string | null;
  email: string;
  permissions?: UserPermissions;
  createdBy: string | null;
  createdByRole: 'superadmin' | 'admin' | 'lead' | 'member' | 'guest' | null;
  mustChangePassword: boolean;
  loginCount: number;
  failedLoginAttempts: number;
  lockedUntil: number | null;
  passwordChangedAt?: string;
  loginHistory?: (string | { timestamp: string; sessionId?: string })[];
  birthday: string | null; // "MM-DD" — no year for privacy
  loginCountWithoutBirthday: number; // incremented each login when birthday is null
  reportsTo?: string | null;
  directReports?: string[];
  jobTitle?: string;
  baseOffice?: 'Bengaluru' | 'Mumbai';
  notifications?: UserNotification[];
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

export interface Sprint {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
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
  tcExecuted: number | null;
  tcPassed: number | null;
  tcFailed: number | null;
  storyPoints: number | null;
  notes: string;
  storyStatus?: 'In Progress' | 'Completed' | 'Blocked' | 'On Hold';
  addedBy: string;
  addedByName: string;
  lastEditedBy: string | null;
  lastEditedAt: string | null;
  lastEditedByRole: User['role'] | null;
  customFields?: Record<string, any>;
  sprintId: string;
  sprintName: string;
}

export interface Defect {
  id: string;
  date: string;
  release: string; // free text
  projectId: string;
  squadId: string;
  jiraDefectLink: string;
  jiraDefectSummary: string;
  jiraCreatedDate?: string | null;
  priority: 'P1' | 'P2' | 'P3';
  status: 'Open' | 'In Progress' | 'Re-Opened' | 'Resolved' | 'Closed';
  resolvedDate?: string | null;
  statusHistory?: DefectStatusHistory[];
  sitMiss: boolean;
  storyLink?: string;
  storySummary?: string;
  notes: string;
  addedBy: string;
  addedByName: string;
  customFields?: Record<string, any>;
  sprintId: string;
  sprintName: string;
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
  totalStoryPoints?: number | null;
  uatStoryPoints?: number | null;
  addedBy: string;
  addedByName: string;
  createdAt: string;
  lastEditedBy?: string | null;
  lastEditedAt?: string | null;
}

export interface WorkingDay {
  date: string; // YYYY-MM-DD
  dayName: string;
  isWeekendDay: boolean;
  status: 'Weekend' | 'Working' | 'Leave' | 'Holiday' | 'WFH' | 'Training' | null;
  isStatusSet: boolean;
  isNightDeployment: boolean;
  isWeekendSupport: boolean;
  notes: string;
  workLocation: string | null;
  locationAudit?: {
    editedBy: string;
    editedByRole: User['role'];
    editedOn: string;
    previousLocation: string | null;
    newLocation: string | null;
  } | null;
  lastModifiedBy: string | null;
  lastModifiedByRole: User['role'] | null;
  lastModifiedAt: string | null;
  isAdminAdjustment: boolean;
  // Legacy fields retained for loading older localStorage records.
  isNightShift?: boolean;
  isWeekend?: boolean;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
  type: 'Holiday' | 'Optional Holiday';
  year: number;
  createdBy: string;
  createdAt: string;
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

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  username: string;
  role: User['role'];
  action: 'LOGIN' | 'LOGOUT' | 'CREATE_USER' | 'DELETE_USER' | 'RESET_PASSWORD'
    | 'DATA_ENTRY_ADD' | 'DATA_ENTRY_EDIT' | 'DEFECT_ADD' | 'DEFECT_DELETE'
    | 'TIMESHEET_SAVE' | 'TIMESHEET_ADMIN_ADJUST' | 'PERMISSION_CHANGE'
    | 'HOLIDAY_ADD' | 'HOLIDAY_DELETE' | 'RELEASE_ADD'
    | 'BACKUP' | 'RESTORE'
    | 'ANNOUNCEMENT_ADD' | 'ANNOUNCEMENT_DELETE'
    | 'LEAVE_APPROVED' | 'LEAVE_REJECTED';
  details: string;
  ipHint: string;
}

export interface UserNotification {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'alert';
  read: boolean;
  createdAt: string;
  link?: string;
}

export interface NotificationEntry {
  id: string;
  userId: string;
  message: string;
  read: boolean;
  createdAt: string;
  type: 'timesheet' | 'user' | 'password' | 'defect' | 'system';
}

export interface DefectStatusHistory {
  status: Defect['status'];
  changedBy: string;
  changedAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'alert';
  postedBy: string;
  postedByName: string;
  postedAt: string;
  expiresAt: string | null;
  targetRoles: User['role'][];
  projectId: string | null;
}

export interface LeaveRequest {
  id: string;
  userId: string;
  userName: string;
  startDate: string;
  endDate: string;
  type: 'Annual' | 'Sick' | 'Personal' | 'Other';
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  approverId: string | null;
  approverName: string | null;
  approvedAt: string | null;
  createdAt: string;
  reviewedBy: string | null;
  rejectionReason: string | null;
}

export interface BackupMetadata {
  id: string;
  filename: string;
  createdAt: string;
  version: string;
  size: number;
  createdBy: string;
}

export interface Recognition {
  id: string;
  fromUserId: string;
  fromUsername: string;
  toUserId: string;
  toUsername: string;
  toSquad: string;
  toProject: string;
  message: string;
  emoji: '🌟' | '🏆' | '💪' | '🎯' | '🔥' | '👏' | '🚀' | '💡';
  projectId: string;
  createdAt: string;
}

export interface AppState {
  users: User[];
  projects: Project[];
  squads: Squad[];
  releases: Release[];
  releaseNames?: Release[];
  dataEntries: DataEntry[];
  defects: Defect[];
  releaseEntries: ReleaseEntry[];
  timesheetEntries: TimesheetEntry[];
  holidays: Holiday[];
  customFields: CustomField[];
  auditLog: AuditLogEntry[];
  notifications: NotificationEntry[];
  announcements: Announcement[];
  leaveRequests: LeaveRequest[];
  backupMetadata: BackupMetadata[];
  recognitions: Recognition[];
  sprints: Sprint[];
}
