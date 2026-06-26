/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ThemeTokens, commonStyles } from '../theme';
import { AppState, Holiday, TimesheetEntry, User, WorkingDay } from '../types';
import { getDaysForMonth, generateId, sanitise, formatDateTime, formatTime } from '../utils';
import { Field, StatCard, ViewOnlyBanner } from './Shared';
import { CheckCircle, Clock, Calendar, X, CalendarCheck } from 'lucide-react';
import { HolidayList } from './HolidayList';

const USER_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#f97316', '#84cc16'];
const LOCATION_OPTIONS = ['QX-BLR', 'VIL-Pune', 'VIL-MUM', 'VIL-BLR'];
const STATUS_OPTIONS: WorkingDay['status'][] = ['Weekend', 'Working', 'WFH', 'Leave', 'Holiday', 'Training'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const STATUS_COLORS: Record<WorkingDay['status'], { light: string; dark: string }> = {
  Working: { light: '#d1fae5', dark: '#064e3b' },
  WFH: { light: '#dbeafe', dark: '#1e3a5f' },
  Leave: { light: '#fee2e2', dark: '#4c1d1d' },
  Holiday: { light: '#ede9fe', dark: '#3b1f6e' },
  Training: { light: '#fef3c7', dark: '#451a03' },
  Weekend: { light: '#f1f5f9', dark: '#1a1f2e' },
};

const summarizeDays = (days: WorkingDay[], holidayMap: Map<string, Holiday>) => {
  let working = 0, leave = 0, wfh = 0, holiday = 0, training = 0, night = 0, weekend = 0;
  days.forEach((day) => {
    const effectiveStatus = day.isStatusSet ? day.status : holidayMap.has(day.date) ? 'Holiday' : day.isWeekendDay ? 'Weekend' : null;
    if (!effectiveStatus || effectiveStatus === 'Weekend') return;
    if (day.isNightDeployment) night++;
    if (day.isWeekendDay && day.isWeekendSupport) weekend++;
    if (effectiveStatus === 'Working') working++;
    else if (effectiveStatus === 'Leave') leave++;
    else if (effectiveStatus === 'WFH') wfh++;
    else if (effectiveStatus === 'Holiday') holiday++;
    else if (effectiveStatus === 'Training') training++;
  });
  return { working, leave, wfh, holiday, training, night, weekend };
};

interface TimesheetProps {
  currentUser: User;
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  showToast: (msg: string, type: 'success' | 'error' | 'warning', duration?: number) => void;
  theme: ThemeTokens;
  readOnly?: boolean;
}

export function Timesheet({ currentUser, appState, setAppState, showToast, theme, readOnly = false }: TimesheetProps) {
  const isAdminOrLead = currentUser.role === 'superadmin' || currentUser.role === 'admin' || currentUser.role === 'lead';
  const canLogForOthers = currentUser.role === 'superadmin' || currentUser.role === 'admin';

  const [activeSubTab, setActiveSubTab] = useState<'calendar' | 'monthly' | 'special' | 'locations' | 'holidays'>('calendar');
  const [quickEditDate, setQuickEditDate] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const [selectedMonthNumber, setSelectedMonthNumber] = useState(today.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const selectedMonth = `${selectedYear}-${String(selectedMonthNumber).padStart(2, '0')}`;
  const yearOptions = useMemo(
    () => Array.from({ length: 5 }, (_, index) => today.getFullYear() - 2 + index),
    [today]
  );

  // User selection (for Admin/Lead viewing options, defaults to current user)
  const [selectedUserId, setSelectedUserId] = useState(currentUser.id);

  // Temporary calendar grid state for active month log being edited
  const [editingDays, setEditingDays] = useState<WorkingDay[]>([]);
  const [locationRange, setLocationRange] = useState({ from: '', to: '' });
  const [locationView, setLocationView] = useState<'pending' | 'completed'>('pending');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // Find existing timesheet entry
  const existingEntry = useMemo(() => {
    return appState.timesheetEntries.find(
      (t) => t.userId === selectedUserId && t.month === selectedMonth
    );
  }, [appState.timesheetEntries, selectedUserId, selectedMonth]);

  const holidayMap = useMemo(() => {
    const map = new Map<string, Holiday>();
    (appState.holidays || [])
      .filter(holiday => holiday.date.slice(0, 7) === selectedMonth)
      .forEach(holiday => map.set(holiday.date, holiday));
    return map;
  }, [appState.holidays, selectedMonth]);

  // Load existing entry or generate new grid
  useEffect(() => {
    if (existingEntry) {
      setEditingDays(existingEntry.workingDays.map((day) => ({
        ...day,
        dayName: day.dayName || new Date(`${day.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' }),
        isWeekendDay: day.isWeekendDay ?? [0, 6].includes(new Date(`${day.date}T00:00:00`).getDay()),
        isStatusSet: day.isStatusSet ?? true,
        isNightDeployment: day.isNightDeployment ?? day.isNightShift ?? false,
        isWeekendSupport: day.isWeekendSupport ?? false,
        workLocation: day.workLocation ?? null,
        lastModifiedBy: day.lastModifiedBy ?? null,
        lastModifiedByRole: day.lastModifiedByRole ?? null,
        lastModifiedAt: day.lastModifiedAt ?? null,
        isAdminAdjustment: day.isAdminAdjustment ?? false,
      })));
    } else {
      setEditingDays(getDaysForMonth(selectedYear, selectedMonthNumber));
    }
  }, [existingEntry, selectedMonth, selectedMonthNumber, selectedUserId, selectedYear]);

  // Selected username lookup
  const selectedUser = useMemo(() => {
    return appState.users.find(u => u.id === selectedUserId) || currentUser;
  }, [appState.users, selectedUserId, currentUser]);

  // Working day parameters summary for the selected sheet
  const summary = useMemo(() => {
    const counts = summarizeDays(editingDays, holidayMap);
    return { ...counts, nightShifts: counts.night, weekendWork: counts.weekend };
  }, [editingDays, holidayMap]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setQuickEditDate(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const persistMonth = (days: WorkingDay[], successMessage?: string) => {
    const modifiedAt = new Date().toISOString();
    const isEditingAnotherUser = canLogForOthers && selectedUserId !== currentUser.id;
    setAppState((prev) => {
      const previousEntry = prev.timesheetEntries.find(
        (t) => t.userId === selectedUserId && t.month === selectedMonth
      );
      const filtered = prev.timesheetEntries.filter(
        (t) => !(t.userId === selectedUserId && t.month === selectedMonth)
      );

      const newEntry: TimesheetEntry = {
        id: previousEntry?.id || existingEntry?.id || generateId(),
        userId: selectedUserId,
        userName: selectedUser.username,
        month: selectedMonth,
        workingDays: days.map(day => {
          const previousDay = previousEntry?.workingDays.find(item => item.date === day.date);
          const changed = !previousDay || (
            previousDay.status !== day.status ||
            previousDay.isStatusSet !== day.isStatusSet ||
            previousDay.isNightDeployment !== day.isNightDeployment ||
            previousDay.isWeekendSupport !== day.isWeekendSupport ||
            (previousDay.workLocation || '') !== (day.workLocation || '') ||
            (previousDay.notes || '') !== (day.notes || '')
          );
          return {
            ...day,
            notes: sanitise(day.notes),
            lastModifiedBy: isEditingAnotherUser && changed ? currentUser.username : (day.lastModifiedBy ?? null),
            lastModifiedByRole: isEditingAnotherUser && changed ? currentUser.role : (day.lastModifiedByRole ?? null),
            lastModifiedAt: isEditingAnotherUser && changed ? modifiedAt : (day.lastModifiedAt ?? null),
            isAdminAdjustment: isEditingAnotherUser && changed ? true : (day.isAdminAdjustment ?? false),
          };
        }),
      };

      return {
        ...prev,
        timesheetEntries: [...filtered, newEntry],
      };
    });
    setLastSavedAt(modifiedAt);
    if (successMessage) showToast(successMessage, 'success');
    if (days.some(day => (day.status === 'Working' || day.status === 'WFH') && day.isStatusSet && !day.workLocation)) {
      showToast('⚠ Some working days have no location set. Update them in the Workplace Location tab.', 'warning', 5000);
    }
  };

  const handleDayChange = (index: number, key: keyof WorkingDay, val: any) => {
    setEditingDays((prev) => {
      const copy = [...prev];
      const current = copy[index];
      if (key === 'status' && val === '') {
        copy[index] = {
          ...current,
          status: current.isWeekendDay ? 'Weekend' : 'Working',
          isStatusSet: false,
        };
        persistMonth(copy);
        return copy;
      }
      const shouldMarkStatusSet = key === 'status' || key === 'workLocation' || key === 'notes' || key === 'isNightDeployment' || key === 'isWeekendSupport';
      copy[index] = {
        ...current,
        [key]: val,
        isStatusSet: shouldMarkStatusSet ? true : current.isStatusSet,
      };
      persistMonth(copy);
      return copy;
    });
  };

  const monthHeading = `${selectedUser.username}'s Roster for ${new Date(selectedYear, selectedMonthNumber - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`;
  const getEffectiveStatus = (day: WorkingDay): WorkingDay['status'] | null => (
    day.isStatusSet ? day.status : holidayMap.has(day.date) ? 'Holiday' : day.isWeekendDay ? 'Weekend' : null
  );
  const hasPendingLocations = editingDays.some(day => day.isStatusSet && (day.status === 'Working' || day.status === 'WFH') && !day.workLocation);
  const lastSavedLabel = lastSavedAt ? `Last saved ${formatTime(lastSavedAt)}` : 'Not saved this session';

  const renderMonthControls = () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end', marginBottom: '20px' }}>
      <div style={{ flex: 1, minWidth: '160px' }}>
        <label style={commonStyles.label(theme)}>Month</label>
        <select value={selectedMonthNumber} onChange={(event) => setSelectedMonthNumber(Number(event.target.value))} style={commonStyles.input(theme)}>
          {MONTH_NAMES.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
        </select>
      </div>
      <div style={{ flex: 1, minWidth: '120px' }}>
        <label style={commonStyles.label(theme)}>Year</label>
        <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))} style={commonStyles.input(theme)}>
          {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
      </div>
      {canLogForOthers && (
        <div style={{ flex: 1, minWidth: '160px' }}>
          <label style={commonStyles.label(theme)}>Logging for</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px', fontSize: '11px', color: theme.muted }}>
            <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: USER_COLORS[Math.max(0, appState.users.findIndex(u => u.id === selectedUserId)) % USER_COLORS.length] }} />
            {selectedUser.username}
          </div>
          <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} style={commonStyles.input(theme)}>
            {appState.users.map((u) => <option key={u.id} value={u.id}>{u.id === currentUser.id ? `Myself - ${u.username}` : `${u.username} (${u.role})`}</option>)}
          </select>
        </div>
      )}
      <div style={{ marginLeft: 'auto', color: lastSavedAt ? theme.green : theme.muted, fontSize: '12px', fontWeight: 700 }}>
        {lastSavedLabel}
      </div>
    </div>
  );

  const renderAdjustmentNotice = () => canLogForOthers && selectedUserId !== currentUser.id ? (
    <div style={{ marginBottom: '18px', padding: '12px 14px', borderRadius: '8px', backgroundColor: '#f59e0b', color: '#1f2937', fontWeight: 700, fontSize: '13px' }}>
      ⚠ You are editing {selectedUser.username}'s timesheet as {currentUser.username} ({currentUser.role === 'superadmin' ? 'Super Admin' : 'Admin'})
    </div>
  ) : null;

  const calendarCells = useMemo(() => {
    const firstDate = new Date(selectedYear, selectedMonthNumber - 1, 1);
    const leading = firstDate.getDay();
    const cells: (WorkingDay | null)[] = [...Array(leading).fill(null), ...editingDays];
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [editingDays, selectedMonthNumber, selectedYear]);

  const renderQuickEdit = () => {
    if (!quickEditDate) return null;
    const idx = editingDays.findIndex(day => day.date === quickEditDate);
    const day = editingDays[idx];
    if (!day) return null;
    const holiday = holidayMap.get(day.date);
    const readOnlyHoliday = !!holiday && holiday.type === 'Holiday' && !day.isStatusSet;
    const effectiveStatus = getEffectiveStatus(day) || day.status;
    const dateObj = new Date(`${day.date}T00:00:00`);
    return (
      <div onClick={() => setQuickEditDate(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(15, 23, 42, 0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <div onClick={(event) => event.stopPropagation()} style={{ ...commonStyles.card(theme), width: '100%', maxWidth: '360px', padding: '18px', boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '14px' }}>
            <strong>{dateObj.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}</strong>
            <button type="button" onClick={() => setQuickEditDate(null)} style={{ border: 0, background: 'transparent', color: theme.muted, cursor: 'pointer' }}><X size={16} /></button>
          </div>
          {readOnlyHoliday && (
            <div style={{ padding: '10px 12px', borderRadius: '8px', backgroundColor: `${theme.indigo}18`, color: theme.text, fontSize: '13px', marginBottom: '12px' }}>
              This is a public holiday: <strong>{holiday.name}</strong>
            </div>
          )}
          <div style={{ display: 'grid', gap: '12px' }}>
            <Field label="Status" type="select" value={effectiveStatus} onChange={(value) => handleDayChange(idx, 'status', value)} options={STATUS_OPTIONS.map(status => ({ value: status, label: status }))} theme={theme} disabled={readOnly || readOnlyHoliday} />
            <Field label="Night Deployment" type="checkbox" value={day.isNightDeployment} onChange={(value) => handleDayChange(idx, 'isNightDeployment', value)} theme={theme} disabled={readOnly || readOnlyHoliday} />
            <Field label="Weekend Support" type="checkbox" value={day.isWeekendSupport} onChange={(value) => handleDayChange(idx, 'isWeekendSupport', value)} theme={theme} disabled={readOnly || readOnlyHoliday} />
            <Field label="Work Location" type="select" value={day.workLocation || ''} onChange={(value) => handleDayChange(idx, 'workLocation', value || null)} options={LOCATION_OPTIONS.map(location => ({ value: location, label: location }))} placeholder="Not set" theme={theme} disabled={readOnly || readOnlyHoliday} />
            <Field label="Notes" type="text" value={day.notes || ''} onChange={(value) => handleDayChange(idx, 'notes', value)} theme={theme} disabled={readOnly || readOnlyHoliday} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setQuickEditDate(null)} style={commonStyles.button(theme, 'secondary')}>Close</button>
              {!readOnly && !readOnlyHoliday && <button type="button" onClick={() => { setQuickEditDate(null); showToast('Day saved.', 'success'); }} style={commonStyles.button(theme, 'primary')}>Save</button>}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCalendarView = () => (
    <div style={commonStyles.card(theme)}>
      {renderMonthControls()}
      {renderAdjustmentNotice()}
      <h4 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 12px', color: theme.text }}>{monthHeading}</h4>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 14px', alignItems: 'center', marginBottom: '12px', fontSize: '11px', color: theme.muted }}>
        {(['Working', 'WFH', 'Leave', 'Holiday', 'Training', 'Weekend'] as WorkingDay['status'][]).map(status => (
          <span key={status} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: theme.bg === '#0f172a' ? STATUS_COLORS[status].dark : STATUS_COLORS[status].light, border: `1px solid ${theme.border}` }} />
            {status}
          </span>
        ))}
        <span>🌙 Night Deployment</span>
        <span style={{ fontWeight: 800 }}>W+ Weekend Support</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(96px, 1fr))', gap: '8px', overflowX: 'auto' }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: theme.muted, padding: '0 4px' }}>{day}</div>
        ))}
        {calendarCells.map((day, index) => {
          if (!day) return <div key={`empty-${index}`} style={{ minHeight: '96px', borderRadius: '8px', backgroundColor: `${theme.muted}12`, border: `1px dashed ${theme.border}`, opacity: 0.55 }} />;
          const holiday = holidayMap.get(day.date);
          const effectiveStatus = getEffectiveStatus(day);
          const holidayAuto = !!holiday && !day.isStatusSet;
          const bg = effectiveStatus && (day.isStatusSet || holidayAuto)
            ? (theme.bg === '#0f172a' ? STATUS_COLORS[effectiveStatus].dark : STATUS_COLORS[effectiveStatus].light)
            : theme.card;
          return (
            <button key={day.date} type="button" onClick={() => setQuickEditDate(day.date)} style={{ minHeight: '96px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: bg, color: theme.text, cursor: 'pointer', padding: '8px', position: 'relative', textAlign: 'left' }}>
              <span style={{ position: 'absolute', top: '7px', left: '8px', fontSize: '11px', fontWeight: 800, color: theme.muted }}>{Number(day.date.slice(8))}</span>
              {holiday && (
                <span title={holiday.name} style={{ position: 'absolute', top: '6px', right: day.isNightDeployment ? '28px' : '8px', fontSize: '9px', fontWeight: 900, padding: '1px 5px', borderRadius: '999px', backgroundColor: holiday.type === 'Holiday' ? `${theme.red}22` : `${theme.amber}22`, color: holiday.type === 'Holiday' ? theme.red : theme.amber }}>
                  {holiday.type === 'Holiday' ? 'PH' : 'OH'}
                </span>
              )}
              {day.isNightDeployment && <span title="Night Deployment" style={{ position: 'absolute', top: '6px', right: '8px', fontSize: '13px' }}>🌙</span>}
              {day.isWeekendSupport && <span style={{ position: 'absolute', right: '8px', bottom: '7px', fontSize: '10px', fontWeight: 800, padding: '1px 5px', borderRadius: '999px', backgroundColor: `${theme.blue}22`, color: theme.blue }}>W+</span>}
              {day.isAdminAdjustment && <span title={day.lastModifiedAt ? `Adjusted by ${day.lastModifiedBy || 'Unknown'} on ${formatDateTime(day.lastModifiedAt)}` : 'Admin adjusted'} style={{ position: 'absolute', bottom: '6px', left: '8px', color: theme.amber, fontWeight: 900 }}>*</span>}
              {effectiveStatus && (day.isStatusSet || holidayAuto) && <div style={{ marginTop: '28px', fontSize: '12px', fontWeight: 700 }}>{effectiveStatus}</div>}
              {holidayAuto && <div title={holiday.name} style={{ marginTop: '5px', fontSize: '11px', color: theme.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{holiday.name}</div>}
              {day.isWeekendDay && <div style={{ marginTop: '4px', display: 'inline-flex', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#94a3b820', color: '#94a3b8', fontSize: '9px', fontWeight: 800 }}>WKD</div>}
              {day.isStatusSet && day.status === 'Working' && <div style={{ marginTop: '5px', fontSize: '11px', color: theme.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{day.workLocation || 'Location not set'}</div>}
            </button>
          );
        })}
      </div>
      {renderQuickEdit()}
    </div>
  );

  const renderLocationView = () => {
    const allLocationRows = editingDays.map((day, index) => ({ day, index })).filter(({ day }) => day.isStatusSet && day.status === 'Working');
    const pendingRows = allLocationRows.filter(({ day }) => !day.workLocation);
    const completedRows = allLocationRows.filter(({ day }) => !!day.workLocation);
    const locationRows = locationView === 'pending' ? pendingRows : completedRows;
    const isInRange = (date: string) => (!locationRange.from || date >= locationRange.from) && (!locationRange.to || date <= locationRange.to);
    return (
      <div style={commonStyles.card(theme)}>
        {renderMonthControls()}
        {renderAdjustmentNotice()}
        <h4 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 12px', color: theme.text }}>Workplace Location</h4>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <button type="button" onClick={() => setLocationView('pending')} style={commonStyles.button(theme, locationView === 'pending' ? 'primary' : 'secondary', 'sm')}>
            Pending ({pendingRows.length})
          </button>
          <button type="button" onClick={() => setLocationView('completed')} style={commonStyles.button(theme, locationView === 'completed' ? 'primary' : 'secondary', 'sm')}>
            Show completed ({completedRows.length})
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
          <div style={{ minWidth: '180px' }}><Field label="Edit from" type="date" value={locationRange.from} onChange={(value) => setLocationRange(prev => ({ ...prev, from: value }))} theme={theme} /></div>
          <div style={{ minWidth: '180px' }}><Field label="Edit to" type="date" value={locationRange.to} onChange={(value) => setLocationRange(prev => ({ ...prev, to: value }))} theme={theme} /></div>
        </div>
        <div style={{ overflowX: 'auto', border: `1px solid ${theme.border}`, borderRadius: '8px', maxHeight: '480px' }}>
          <table style={commonStyles.table(theme)}>
            <thead>
              <tr>
                <th style={commonStyles.th(theme)}>Date</th>
                <th style={commonStyles.th(theme)}>Day</th>
                <th style={commonStyles.th(theme)}>Status</th>
                <th style={commonStyles.th(theme)}>Location</th>
                <th style={commonStyles.th(theme)}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {locationRows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ ...commonStyles.td(theme), textAlign: 'center', color: locationView === 'pending' ? theme.green : theme.muted, padding: '28px', fontWeight: 700 }}>
                    {locationView === 'pending' ? <><CheckCircle size={18} style={{ verticalAlign: 'middle', marginRight: '6px' }} />All working days have a location set for this month.</> : 'No completed locations for working days yet.'}
                  </td>
                </tr>
              ) : locationRows.map(({ day, index }, rowIndex) => {
                const focused = isInRange(day.date);
                return (
                  <tr key={day.date} style={{ backgroundColor: !day.workLocation ? `${theme.amber}18` : rowIndex % 2 ? `${theme.inputBg}cc` : 'transparent', opacity: focused ? 1 : 0.45 }}>
                    <td style={{ ...commonStyles.td(theme), whiteSpace: 'nowrap', fontWeight: 700 }}>{day.date}</td>
                    <td style={commonStyles.td(theme)}>{day.dayName}</td>
                    <td style={commonStyles.td(theme)}>{day.status}</td>
                    <td style={commonStyles.td(theme)}>
                      <select value={day.workLocation || ''} disabled={readOnly} onChange={(event) => handleDayChange(index, 'workLocation', event.target.value || null)} style={{ ...commonStyles.input(theme), minWidth: '140px' }}>
                        <option value="">Not set</option>
                        {LOCATION_OPTIONS.map(location => <option key={location} value={location}>{location}</option>)}
                      </select>
                    </td>
                    <td style={commonStyles.td(theme)} title={day.notes || ''}>{day.notes || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Aggregated Team Timesheet Summary (visible to Admin/Lead only)
  const teamSummaries = useMemo(() => {
    return appState.timesheetEntries.map((entry) => {
      const entryHolidayMap = new Map<string, Holiday>();
      (appState.holidays || [])
        .filter(holiday => holiday.date.slice(0, 7) === entry.month)
        .forEach(holiday => entryHolidayMap.set(holiday.date, holiday));
      const counts = summarizeDays(entry.workingDays, entryHolidayMap);

      return {
        id: entry.id,
        userName: entry.userName,
        month: entry.month,
        userId: entry.userId,
        ...counts,
      };
    }).sort((a, b) => b.month.localeCompare(a.month));
  }, [appState.holidays, appState.timesheetEntries]);

  // Special work view log extraction (All shifts / Weekends worked)
  const specialLogs = useMemo(() => {
    const nightShifts: { userName: string; date: string; day: string; status: string; notes: string }[] = [];
    const weekendWork: { userName: string; date: string; day: string; status: string; notes: string }[] = [];

    const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    appState.timesheetEntries.forEach((entry) => {
      // Filter for member only if needed
      if (!isAdminOrLead && entry.userId !== currentUser.id) return;

      entry.workingDays.forEach((d) => {
        const dObj = new Date(d.date + 'T00:00:00');
        const dayOfWeek = weekdayNames[dObj.getDay()] || '';

        if (d.isNightDeployment) {
          nightShifts.push({
            userName: entry.userName,
            date: d.date,
            day: dayOfWeek,
            status: d.status,
            notes: d.notes,
          });
        }
        if (d.isWeekendDay && d.isWeekendSupport && (d.status === 'Working' || d.status === 'WFH')) {
          weekendWork.push({
            userName: entry.userName,
            date: d.date,
            day: dayOfWeek,
            status: d.status,
            notes: d.notes,
          });
        }
      });
    });

    // Sort newest first
    nightShifts.sort((a, b) => b.date.localeCompare(a.date));
    weekendWork.sort((a, b) => b.date.localeCompare(a.date));

    return { nightShifts, weekendWork };
  }, [appState.timesheetEntries, isAdminOrLead, currentUser.id]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {readOnly && <ViewOnlyBanner theme={theme} />}
      <div style={{ display: 'flex', borderBottom: `2px solid ${theme.border}`, gap: '16px', flexWrap: 'wrap' }}>
        {([
          ['calendar', 'Calendar View'],
          ['monthly', 'Monthly Log'],
          ['special', 'Special Work Log'],
          ['locations', 'Workplace Location'],
          ['holidays', 'Holidays'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveSubTab(id)}
            style={{
              padding: '12px 16px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeSubTab === id ? `3px solid ${theme.blue}` : '3px solid transparent',
              color: activeSubTab === id ? theme.blue : theme.muted,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              fontSize: '15px',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {activeSubTab === 'calendar' ? renderCalendarView() : activeSubTab === 'locations' ? renderLocationView() : activeSubTab === 'monthly' ? (
        <>
          {/* Monthly log editing segment */}
          <div style={commonStyles.card(theme)}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end', marginBottom: '20px' }}>
              <div style={{ flex: 1, minWidth: '160px' }}>
                <label style={commonStyles.label(theme)}>Month</label>
                <select
                  value={selectedMonthNumber}
                  onChange={(event) => setSelectedMonthNumber(Number(event.target.value))}
                  style={commonStyles.input(theme)}
                >
                  {MONTH_NAMES.map((month, index) => (
                    <option key={month} value={index + 1}>{month}</option>
                  ))}
                </select>
              </div>

              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={commonStyles.label(theme)}>Year</label>
                <select
                  value={selectedYear}
                  onChange={(event) => setSelectedYear(Number(event.target.value))}
                  style={commonStyles.input(theme)}
                >
                  {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </div>

              {canLogForOthers && (
                <div style={{ flex: 1, minWidth: '160px' }}>
                  <label style={commonStyles.label(theme)}>Logging for</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px', fontSize: '11px', color: theme.muted }}>
                    <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: USER_COLORS[Math.max(0, appState.users.findIndex(u => u.id === selectedUserId)) % USER_COLORS.length] }} />
                    {selectedUser.username}
                  </div>
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    style={commonStyles.input(theme)}
                  >
                    {appState.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.id === currentUser.id ? `Myself - ${u.username}` : `${u.username} (${u.role})`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ marginLeft: 'auto', color: lastSavedAt ? theme.green : theme.muted, fontSize: '12px', fontWeight: 700 }}>
                {lastSavedLabel}
              </div>
            </div>

            {canLogForOthers && selectedUserId !== currentUser.id && (
              <div style={{ marginBottom: '18px', padding: '12px 14px', borderRadius: '8px', backgroundColor: '#f59e0b', color: '#1f2937', fontWeight: 700, fontSize: '13px' }}>
                ⚠ You are editing {selectedUser.username}'s timesheet as {currentUser.username} ({currentUser.role === 'superadmin' ? 'Super Admin' : 'Admin'})
              </div>
            )}

            {/* Metric counts summary inside editing sheet */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px', marginBottom: '24px' }}>
              <StatCard label="Working" value={summary.working} accentColor={theme.blue} theme={theme} />
              <StatCard label="Leave" value={summary.leave} accentColor={theme.amber} theme={theme} />
              <StatCard label="WFH" value={summary.wfh} accentColor={theme.indigo} theme={theme} />
              <StatCard label="Holiday" value={summary.holiday} accentColor={theme.green} theme={theme} />
              <StatCard label="Training" value={summary.training} accentColor={theme.orange} theme={theme} />
              <StatCard label="Night Deployment" value={summary.nightShifts} accentColor={theme.indigo} theme={theme} />
              <StatCard label="Weekend Support" value={summary.weekendWork} accentColor={theme.red} theme={theme} />
            </div>

            {/* Grid list table of day statuses */}
            <h4 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px', color: theme.text }}>
              {monthHeading}
            </h4>
            <div style={{ maxHeight: '450px', overflowY: 'auto', border: `1px solid ${theme.border}`, borderRadius: '8px' }}>
              <table style={commonStyles.table(theme)}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr style={{ backgroundColor: theme.sidebarBg, color: '#ffffff' }}>
                    <th style={{ ...commonStyles.th(theme), color: '#ffffff' }}>Date</th>
                    <th style={{ ...commonStyles.th(theme), color: '#ffffff' }}>Day</th>
                    <th style={{ ...commonStyles.th(theme), color: '#ffffff' }}>Status</th>
                    <th style={{ ...commonStyles.th(theme), color: '#ffffff', textAlign: 'center' }}>Night Deployment</th>
                    <th style={{ ...commonStyles.th(theme), color: '#ffffff', textAlign: 'center' }}>Weekend Support</th>
                    <th style={{ ...commonStyles.th(theme), color: '#ffffff' }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {editingDays.map((day, idx) => {
                    const holiday = holidayMap.get(day.date);
                    const effectiveStatus = getEffectiveStatus(day);
                    const readOnlyHoliday = !!holiday && holiday.type === 'Holiday' && !day.isStatusSet;
                    return (
                      <tr key={day.date} style={{ backgroundColor: day.isWeekendDay ? `${theme.muted}0a` : 'transparent' }}>
                        <td style={{ ...commonStyles.td(theme), fontWeight: 600 }}>
                          {day.date.substring(8)}
                          {holiday && (
                            <span title={holiday.name} style={{ marginLeft: '6px', color: theme.muted, fontSize: '11px', fontWeight: 600 }}>
                              {holiday.name}
                            </span>
                          )}
                          {day.isAdminAdjustment && (
                            <span
                              title={`Adjusted by ${day.lastModifiedBy || 'Unknown'} (${day.lastModifiedByRole || 'Unknown'}) on ${day.lastModifiedAt ? formatDateTime(day.lastModifiedAt) : 'Unknown date'}`}
                              style={{ color: '#f59e0b', fontWeight: 700, marginLeft: '2px', cursor: 'help' }}
                            >
                              *
                            </span>
                          )}
                        </td>
                        <td style={{ ...commonStyles.td(theme), color: day.isWeekendDay ? '#94a3b8' : theme.text }}>
                          {day.dayName}
                          {day.isWeekendDay && <span style={{ marginLeft: '6px', padding: '1px 4px', borderRadius: '4px', backgroundColor: '#94a3b820', color: '#94a3b8', fontSize: '9px', fontWeight: 700 }}>WKD</span>}
                        </td>
                        <td style={commonStyles.td(theme)}>
                          <select
                            value={effectiveStatus || ''}
                            disabled={readOnly || readOnlyHoliday}
                            onChange={(e) => handleDayChange(idx, 'status', e.target.value)}
                            style={{
                              ...commonStyles.input(theme),
                              padding: '4px 8px',
                              width: '130px',
                              opacity: readOnly ? 0.6 : 1,
                              cursor: readOnly ? 'not-allowed' : 'pointer',
                            }}
                          >
                            <option value="">Not set</option>
                            <option value="Weekend">Weekend</option>
                            <option value="Working">Working</option>
                            <option value="WFH">WFH</option>
                            <option value="Leave">Leave</option>
                            <option value="Holiday">Holiday</option>
                            <option value="Training">Training</option>
                          </select>
                        </td>
                        <td style={{ ...commonStyles.td(theme), textAlign: 'center', verticalAlign: 'middle' }}>
                          <input
                            type="checkbox"
                            checked={day.isNightDeployment}
                            disabled={readOnly}
                            onChange={(e) => handleDayChange(idx, 'isNightDeployment', e.target.checked)}
                            style={{
                              display: 'block',
                              margin: '0 auto',
                              width: '16px',
                              height: '16px',
                              cursor: readOnly ? 'not-allowed' : 'pointer',
                              opacity: readOnly ? 0.6 : 1,
                            }}
                          />
                        </td>
                        <td style={{ ...commonStyles.td(theme), textAlign: 'center', verticalAlign: 'middle' }}>
                          <input
                            type="checkbox"
                            checked={day.isWeekendSupport}
                            disabled={readOnly || !day.isWeekendDay}
                            onChange={(e) => handleDayChange(idx, 'isWeekendSupport', e.target.checked)}
                            style={{
                              display: 'block',
                              margin: '0 auto',
                              width: '16px',
                              height: '16px',
                              cursor: readOnly || !day.isWeekendDay ? 'not-allowed' : 'pointer',
                              opacity: readOnly || !day.isWeekendDay ? 0.45 : 1,
                            }}
                          />
                        </td>
                        <td style={commonStyles.td(theme)}>
                          <input
                            type="text"
                            placeholder="Optional notes"
                            value={day.notes || ''}
                            disabled={readOnly}
                            onChange={(e) => handleDayChange(idx, 'notes', e.target.value)}
                            style={{
                              ...commonStyles.input(theme),
                              padding: '4px 8px',
                              fontSize: '12px',
                              opacity: readOnly ? 0.6 : 1,
                              cursor: readOnly ? 'not-allowed' : 'text',
                            }}
                          />
                          {day.isAdminAdjustment && (
                            <div title={`${day.lastModifiedByRole || ''} - ${day.lastModifiedAt ? formatDateTime(day.lastModifiedAt) : ''}`} style={{ marginTop: '5px', color: theme.amber, fontSize: '10px', fontWeight: 700 }}>
                              ✎ Adjusted by {day.lastModifiedBy}
                              <div style={{ color: theme.muted, fontWeight: 500 }}>
                                {day.lastModifiedByRole} - {day.lastModifiedAt ? formatDateTime(day.lastModifiedAt) : ''}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Admin Team view roll-up summary list */}
          {isAdminOrLead && (
            <div style={commonStyles.card(theme)}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: theme.text, marginBottom: '16px', borderLeft: `4px solid ${theme.blue}`, paddingLeft: '8px' }}>
                Team Timesheet Rollup Index
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={commonStyles.table(theme)}>
                  <thead>
                    <tr style={{ backgroundColor: theme.inputBg }}>
                      <th style={commonStyles.th(theme)}>Squad Member</th>
                      <th style={commonStyles.th(theme)}>Month</th>
                      <th style={commonStyles.th(theme)}>Working</th>
                      <th style={commonStyles.th(theme)}>Leave</th>
                      <th style={commonStyles.th(theme)}>WFH</th>
                      <th style={commonStyles.th(theme)}>Holiday</th>
                      <th style={commonStyles.th(theme)}>Training</th>
                      <th style={commonStyles.th(theme)}>Night Deployment</th>
                      <th style={commonStyles.th(theme)}>Weekend Support</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamSummaries.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ ...commonStyles.td(theme), textAlign: 'center', color: theme.muted, padding: '24px' }}>
                          No team timesheets logged yet.
                        </td>
                      </tr>
                    ) : (
                      teamSummaries.map((summaryRow, index) => {
                        const userIndex = Math.max(0, appState.users.findIndex(user => user.id === summaryRow.userId));
                        const userColor = USER_COLORS[userIndex % USER_COLORS.length];
                        return (
                        <tr key={summaryRow.id} style={{ backgroundColor: index % 2 === 1 ? theme.inputBg : 'transparent', borderLeft: `3px solid ${userColor}` }}>
                          <td style={{ ...commonStyles.td(theme), fontWeight: 600 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: userColor }} />
                              {summaryRow.userName}
                            </span>
                          </td>
                          <td style={commonStyles.td(theme)}>{summaryRow.month}</td>
                          <td style={commonStyles.td(theme)}>{summaryRow.working}</td>
                          <td style={{ ...commonStyles.td(theme), color: summaryRow.leave > 0 ? theme.orange : theme.text }}>{summaryRow.leave}</td>
                          <td style={commonStyles.td(theme)}>{summaryRow.wfh}</td>
                          <td style={commonStyles.td(theme)}>{summaryRow.holiday}</td>
                          <td style={commonStyles.td(theme)}>{summaryRow.training}</td>
                          <td style={{ ...commonStyles.td(theme), color: theme.indigo, fontWeight: 600 }}>{summaryRow.night}</td>
                          <td style={{ ...commonStyles.td(theme), color: theme.red, fontWeight: 600 }}>{summaryRow.weekend}</td>
                        </tr>
                      )})
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : activeSubTab === 'holidays' ? (
        <HolidayList
          currentUser={currentUser}
          appState={appState}
          setAppState={setAppState}
          showToast={showToast}
          theme={theme}
        />
      ) : (
        <>
          {/* SPECIAL WORK LOG SUBTAB */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', flexWrap: 'wrap' }}>
            
            {/* Night Shifts Table */}
            <div style={commonStyles.card(theme)}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={18} style={{ color: theme.indigo }} />
                Night Deployment Logs
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={commonStyles.table(theme)}>
                  <thead>
                    <tr style={{ backgroundColor: theme.inputBg }}>
                      <th style={commonStyles.th(theme)}>Squad Member</th>
                      <th style={commonStyles.th(theme)}>Date</th>
                      <th style={commonStyles.th(theme)}>Day</th>
                      <th style={commonStyles.th(theme)}>Status</th>
                      <th style={commonStyles.th(theme)}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {specialLogs.nightShifts.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ ...commonStyles.td(theme), textAlign: 'center', color: theme.muted, padding: '24px' }}>
                          No night deployments found.
                        </td>
                      </tr>
                    ) : (
                      specialLogs.nightShifts.map((row, idx) => (
                        <tr key={idx} style={{
                          backgroundColor: idx % 2 === 1 ? theme.inputBg : 'transparent',
                          borderLeft: `3px solid ${USER_COLORS[Math.max(0, appState.users.findIndex(user => user.username === row.userName)) % USER_COLORS.length]}`,
                        }}>
                          <td style={{ ...commonStyles.td(theme), fontWeight: 600 }}>{row.userName}</td>
                          <td style={commonStyles.td(theme)}>{row.date}</td>
                          <td style={commonStyles.td(theme)}>{row.day}</td>
                          <td style={commonStyles.td(theme)}>{row.status}</td>
                          <td style={{ ...commonStyles.td(theme), fontStyle: 'italic', fontSize: '12px' }}>{row.notes || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Weekend Work Table */}
            <div style={commonStyles.card(theme)}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} style={{ color: theme.red }} />
                Weekend Support Roster
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={commonStyles.table(theme)}>
                  <thead>
                    <tr style={{ backgroundColor: theme.inputBg }}>
                      <th style={commonStyles.th(theme)}>Squad Member</th>
                      <th style={commonStyles.th(theme)}>Date</th>
                      <th style={commonStyles.th(theme)}>Day</th>
                      <th style={commonStyles.th(theme)}>Status</th>
                      <th style={commonStyles.th(theme)}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {specialLogs.weekendWork.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ ...commonStyles.td(theme), textAlign: 'center', color: theme.muted, padding: '24px' }}>
                          No weekend support entries found.
                        </td>
                      </tr>
                    ) : (
                      specialLogs.weekendWork.map((row, idx) => (
                        <tr key={idx} style={{
                          backgroundColor: idx % 2 === 1 ? theme.inputBg : 'transparent',
                          borderLeft: `3px solid ${USER_COLORS[Math.max(0, appState.users.findIndex(user => user.username === row.userName)) % USER_COLORS.length]}`,
                        }}>
                          <td style={{ ...commonStyles.td(theme), fontWeight: 600 }}>{row.userName}</td>
                          <td style={commonStyles.td(theme)}>{row.date}</td>
                          <td style={commonStyles.td(theme)}>{row.day}</td>
                          <td style={commonStyles.td(theme)}>{row.status}</td>
                          <td style={{ ...commonStyles.td(theme), fontStyle: 'italic', fontSize: '12px' }}>{row.notes || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
}
