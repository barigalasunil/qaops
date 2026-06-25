/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ThemeTokens, commonStyles } from '../theme';
import { AppState, TimesheetEntry, User, WorkingDay } from '../types';
import { getDaysForMonth, generateId, sanitise } from '../utils';
import { Field, StatCard, ViewOnlyBanner } from './Shared';
import { Clock, Save, Calendar } from 'lucide-react';

const USER_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#f97316', '#84cc16'];

const summarizeDays = (days: WorkingDay[]) => {
  let working = 0, leave = 0, wfh = 0, holiday = 0, training = 0, night = 0, weekend = 0;
  days.forEach((day) => {
    if (day.status === 'Weekend') return;
    if (day.isNightDeployment) night++;
    if (day.isWeekendDay && day.isWeekendSupport) weekend++;
    if (day.status === 'Working') working++;
    else if (day.status === 'Leave') leave++;
    else if (day.status === 'WFH') wfh++;
    else if (day.status === 'Holiday') holiday++;
    else if (day.status === 'Training') training++;
  });
  return { working, leave, wfh, holiday, training, night, weekend };
};

interface TimesheetProps {
  currentUser: User;
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  showToast: (msg: string, type: 'success' | 'error') => void;
  theme: ThemeTokens;
  readOnly?: boolean;
}

export function Timesheet({ currentUser, appState, setAppState, showToast, theme, readOnly = false }: TimesheetProps) {
  const isAdminOrLead = currentUser.role === 'superadmin' || currentUser.role === 'admin' || currentUser.role === 'lead';
  const canLogForOthers = currentUser.role === 'superadmin' || currentUser.role === 'admin';

  // Sub-tabs: "monthly" | "special"
  const [activeSubTab, setActiveSubTab] = useState<'monthly' | 'special'>('monthly');

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

  // Find existing timesheet entry
  const existingEntry = useMemo(() => {
    return appState.timesheetEntries.find(
      (t) => t.userId === selectedUserId && t.month === selectedMonth
    );
  }, [appState.timesheetEntries, selectedUserId, selectedMonth]);

  // Load existing entry or generate new grid
  useEffect(() => {
    if (existingEntry) {
      setEditingDays(existingEntry.workingDays.map((day) => ({
        ...day,
        dayName: day.dayName || new Date(`${day.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' }),
        isWeekendDay: day.isWeekendDay ?? [0, 6].includes(new Date(`${day.date}T00:00:00`).getDay()),
        isNightDeployment: day.isNightDeployment ?? day.isNightShift ?? false,
        isWeekendSupport: day.isWeekendSupport ?? false,
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
    const counts = summarizeDays(editingDays);
    return { ...counts, nightShifts: counts.night, weekendWork: counts.weekend };
  }, [editingDays]);

  const handleDayChange = (index: number, key: keyof WorkingDay, val: any) => {
    setEditingDays((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [key]: val };
      return copy;
    });
  };

  const handleSaveSheet = () => {
    const modifiedAt = new Date().toISOString();
    const isEditingAnotherUser = canLogForOthers && selectedUserId !== currentUser.id;
    setAppState((prev) => {
      const filtered = prev.timesheetEntries.filter(
        (t) => !(t.userId === selectedUserId && t.month === selectedMonth)
      );

      const newEntry: TimesheetEntry = {
        id: existingEntry?.id || generateId(),
        userId: selectedUserId,
        userName: selectedUser.username,
        month: selectedMonth,
        workingDays: editingDays.map(day => {
          const previousDay = existingEntry?.workingDays.find(item => item.date === day.date);
          const changed = !previousDay || (
            previousDay.status !== day.status ||
            previousDay.isNightDeployment !== day.isNightDeployment ||
            previousDay.isWeekendSupport !== day.isWeekendSupport ||
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

    showToast(`Timesheet for ${selectedUser.username} saved successfully!`, 'success');
  };

  // Aggregated Team Timesheet Summary (visible to Admin/Lead only)
  const teamSummaries = useMemo(() => {
    return appState.timesheetEntries.map((entry) => {
      const counts = summarizeDays(entry.workingDays);

      return {
        id: entry.id,
        userName: entry.userName,
        month: entry.month,
        userId: entry.userId,
        ...counts,
      };
    }).sort((a, b) => b.month.localeCompare(a.month));
  }, [appState.timesheetEntries]);

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
      {/* Sub-tab selection menu */}
      <div style={{ display: 'flex', borderBottom: `2px solid ${theme.border}`, gap: '16px' }}>
        <button
          onClick={() => setActiveSubTab('monthly')}
          style={{
            padding: '12px 16px',
            backgroundColor: 'transparent',
            border: 'none',
            borderBottom: activeSubTab === 'monthly' ? `3px solid ${theme.blue}` : '3px solid transparent',
            color: activeSubTab === 'monthly' ? theme.blue : theme.muted,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            fontSize: '15px',
          }}
        >
          Monthly Log
        </button>
        <button
          onClick={() => setActiveSubTab('special')}
          style={{
            padding: '12px 16px',
            backgroundColor: 'transparent',
            border: 'none',
            borderBottom: activeSubTab === 'special' ? `3px solid ${theme.blue}` : '3px solid transparent',
            color: activeSubTab === 'special' ? theme.blue : theme.muted,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            fontSize: '15px',
          }}
        >
          Special Work Log (Night Deployments & Weekend Support)
        </button>
      </div>

      {activeSubTab === 'monthly' ? (
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
                  {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((month, index) => (
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
                        {u.id === currentUser.id ? `Myself — ${u.username}` : `${u.username} (${u.role})`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {!readOnly && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleSaveSheet}
                    style={commonStyles.button(theme, 'primary')}
                  >
                    <Save size={16} />
                    Save Timesheet
                  </button>
                </div>
              )}
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
              {selectedUser.username}'s Roster for {new Date(selectedYear, selectedMonthNumber - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
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
                    return (
                      <tr key={day.date} style={{ backgroundColor: day.isWeekendDay ? `${theme.muted}0a` : 'transparent' }}>
                        <td style={{ ...commonStyles.td(theme), fontWeight: 600 }}>
                          {day.date.substring(8)}
                          {day.isAdminAdjustment && (
                            <span
                              title={`Adjusted by ${day.lastModifiedBy || 'Unknown'} (${day.lastModifiedByRole || 'Unknown'}) on ${day.lastModifiedAt ? new Date(day.lastModifiedAt).toLocaleString() : 'Unknown date'}`}
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
                            value={day.status}
                            disabled={readOnly}
                            onChange={(e) => handleDayChange(idx, 'status', e.target.value)}
                            style={{
                              ...commonStyles.input(theme),
                              padding: '4px 8px',
                              width: '130px',
                              opacity: readOnly ? 0.6 : 1,
                              cursor: readOnly ? 'not-allowed' : 'pointer',
                            }}
                          >
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
                            <div title={`${day.lastModifiedByRole || ''} · ${day.lastModifiedAt ? new Date(day.lastModifiedAt).toLocaleString() : ''}`} style={{ marginTop: '5px', color: theme.amber, fontSize: '10px', fontWeight: 700 }}>
                              ✎ Adjusted by {day.lastModifiedBy}
                              <div style={{ color: theme.muted, fontWeight: 500 }}>
                                {day.lastModifiedByRole} · {day.lastModifiedAt ? new Date(day.lastModifiedAt).toLocaleDateString() : ''}
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
