import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Clock } from 'lucide-react';
import { ThemeTokens, commonStyles } from '../theme';
import { AppState, TimesheetEntry, User, WorkingDay } from '../types';
import { generateId } from '../utils';
import { StatCard, ViewOnlyBanner } from './Shared';
import { HolidayList } from './HolidayList';

const USER_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#f97316', '#84cc16'];
const LOCATION_OPTIONS = ['QX-BLR', 'VIL-BLR', 'VIL-Pune', 'VIL-MUM'];
const LOCATION_COLORS: Record<string, string> = {
  'QX-BLR': '#3b82f6',
  'VIL-BLR': '#6366f1',
  'VIL-Pune': '#f59e0b',
  'VIL-MUM': '#f97316',
};
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const STATUSES = ['Working', 'WFH', 'Leave', 'Holiday', 'Training', 'Weekend'] as const;

function generateMonthDays(year: number, month: number): WorkingDay[] {
  const count = new Date(year, month, 0).getDate();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(year, month - 1, i + 1);
    const dow = d.getDay();
    return {
      date: d.toISOString().slice(0, 10),
      dayName: d.toLocaleDateString('en-GB', { weekday: 'short' }),
      isWeekendDay: dow === 0 || dow === 6,
      status: null,
      isStatusSet: false,
      isNightDeployment: false,
      isWeekendSupport: false,
      workLocation: null,
      locationAudit: null,
      notes: '',
      lastModifiedBy: null,
      lastModifiedByRole: null,
      lastModifiedAt: null,
      isAdminAdjustment: false,
    };
  });
}

function getCellBg(status: WorkingDay['status'], isWeekendDay: boolean, isDark: boolean) {
  if (!status) return 'transparent';
  if (status === 'Weekend') return isDark ? '#111827' : '#f1f5f9';
  return ({
    Working: isDark ? '#064e3b' : '#d1fae5',
    WFH: isDark ? '#1e3a5f' : '#dbeafe',
    Leave: isDark ? '#7f1d1d' : '#fee2e2',
    Holiday: isDark ? '#3b1f6e' : '#ede9fe',
    Training: isDark ? '#451a03' : '#fef3c7',
  } as Record<string, string>)[status] || 'transparent';
}

interface TimesheetProps {
  currentUser: User;
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  showToast: (msg: string, type: 'success' | 'error' | 'warning', duration?: number) => void;
  theme: ThemeTokens;
  readOnly?: boolean;
}

export function Timesheet({ currentUser, appState, setAppState, showToast, theme, readOnly = false }: TimesheetProps) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const isDark = theme.bg === '#0f172a';
  const canLogForOthers = currentUser.role === 'superadmin' || currentUser.role === 'admin' || currentUser.role === 'lead';
  const canViewLocationAudit = currentUser.role === 'superadmin' || currentUser.role === 'admin' || currentUser.role === 'lead';
  const canEditOtherWorkLocation = canViewLocationAudit;
  const canViewTeam = currentUser.role === 'superadmin' || currentUser.role === 'admin' || currentUser.role === 'lead';

  const [selMonth, setSelMonth] = useState(today.getMonth() + 1);
  const [selYear, setSelYear] = useState(today.getFullYear());
  const [activeTab, setActiveTab] = useState<'calendar' | 'special' | 'holidays'>('calendar');
  const [targetId, setTargetId] = useState(currentUser.id);
  const [targetName, setTargetName] = useState(currentUser.username);
  const [monthData, setMonthData] = useState<WorkingDay[]>([]);
  const [popOpen, setPopOpen] = useState(false);
  const [popDay, setPopDay] = useState<WorkingDay | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const storeRef = useRef(appState);
  const popDayRef = useRef<WorkingDay | null>(null);

  useEffect(() => { storeRef.current = appState; }, [appState]);
  useEffect(() => { popDayRef.current = popDay; }, [popDay]);

  useEffect(() => {
    const key = `${selYear}-${String(selMonth).padStart(2, '0')}`;
    const found = storeRef.current.timesheetEntries.find(
      e => e.userId === targetId && e.month === key
    );
    setMonthData(
      found?.workingDays?.length
        ? found.workingDays.map(d => ({ ...d }))
        : generateMonthDays(selYear, selMonth)
    );
    setPopOpen(false);
    setPopDay(null);
    setLastSaved(null);
  }, [selMonth, selYear, targetId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setPopOpen(false);
        setPopDay(null);
        popDayRef.current = null;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function persist(next: AppState) {
    storeRef.current = next;
    setAppState(next);
  }

  function saveDay(updatedDay: WorkingDay) {
    const key = `${selYear}-${String(selMonth).padStart(2, '0')}`;

    setMonthData(prev => {
      const next = prev.map(d =>
        d.date === updatedDay.date ? { ...updatedDay } : d
      );

      const cur = storeRef.current;
      const idx = cur.timesheetEntries.findIndex(
        e => e.userId === targetId && e.month === key
      );

      const entries: TimesheetEntry[] = idx >= 0
        ? cur.timesheetEntries.map((e, i) =>
            i === idx ? { ...e, workingDays: next } : e)
        : [...cur.timesheetEntries, {
            id: generateId(),
            userId: targetId,
            userName: targetName,
            month: key,
            workingDays: next,
          }];

      const editingOther = targetId !== currentUser.id;
      const modifiedAt = updatedDay.lastModifiedAt || new Date().toISOString();
      const updatedStore: AppState = {
        ...cur,
        timesheetEntries: entries,
        users: editingOther ? cur.users.map(user => user.id === targetId ? {
          ...user,
          notifications: [{
            id: generateId(),
            message: `${currentUser.username} adjusted your timesheet for ${key}.`,
            read: false,
            createdAt: modifiedAt,
            type: 'info',
            link: 'timesheet',
          }, ...(user.notifications || [])].slice(0, 50),
        } : user) : cur.users,
        auditLog: [{
          id: generateId(),
          timestamp: modifiedAt,
          userId: currentUser.id,
          username: currentUser.username,
          role: currentUser.role,
          action: editingOther ? 'TIMESHEET_ADMIN_ADJUST' : 'TIMESHEET_SAVE',
          details: `${editingOther ? 'Adjusted' : 'Saved'} ${targetName}'s timesheet for ${key}`,
          ipHint: 'Browser session',
        }, ...(cur.auditLog || [])].slice(0, 500),
      };

      persist(updatedStore);
      return next;
    });

    setLastSaved(new Date());
  }

  function openPop(dateStr: string) {
    const d = monthData.find(x => x.date === dateStr);
    if (!d) return;
    const copy: WorkingDay = {
      date: d.date,
      dayName: d.dayName,
      isWeekendDay: d.isWeekendDay,
      status: d.status,
      isStatusSet: d.isStatusSet,
      isNightDeployment: d.isNightDeployment,
      isWeekendSupport: d.isWeekendSupport,
      workLocation: d.workLocation,
      locationAudit: d.locationAudit ?? null,
      notes: d.notes || '',
      lastModifiedBy: d.lastModifiedBy,
      lastModifiedByRole: d.lastModifiedByRole,
      lastModifiedAt: d.lastModifiedAt,
      isAdminAdjustment: d.isAdminAdjustment,
    };
    setPopDay(copy);
    popDayRef.current = copy;
    setPopOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setField(field: keyof WorkingDay, value: any) {
    setPopDay(prev => {
      if (!prev) return prev;
      const next = { ...prev, [field]: value, isStatusSet: field === 'status' ? true : prev.isStatusSet };
      if (field === 'status' && value !== 'Working') next.workLocation = null;
      popDayRef.current = next;
      return next;
    });
  }

  function savePop() {
    const d = popDayRef.current;
    if (!d) return;
    const originalDay = monthData.find(day => day.date === d.date);
    const locationChangedByPrivilegedUser = targetId !== currentUser.id
      && canEditOtherWorkLocation
      && (originalDay?.workLocation || null) !== (d.workLocation || null);
    const editedAt = new Date().toISOString();
    const final: WorkingDay = {
      ...d,
      locationAudit: locationChangedByPrivilegedUser ? {
        editedBy: currentUser.username,
        editedByRole: currentUser.role,
        editedOn: editedAt,
        previousLocation: originalDay?.workLocation || null,
        newLocation: d.workLocation || null,
      } : d.locationAudit ?? null,
      isStatusSet: !!d.status,
      lastModifiedBy: currentUser.username,
      lastModifiedByRole: currentUser.role,
      lastModifiedAt: editedAt,
      isAdminAdjustment: targetId !== currentUser.id,
    };
    saveDay(final);
    if (final.status === 'Working' && !final.workLocation) {
      showToast('⚠ Saved — please set office location.', 'warning');
    }
    setPopOpen(false);
    setPopDay(null);
    popDayRef.current = null;
  }

  function handleLoggingForChange(userId: string) {
    if (userId === 'self') {
      setTargetId(currentUser.id);
      setTargetName(currentUser.username);
      return;
    }
    const user = storeRef.current.users.find(u => u.id === userId);
    if (user) {
      setTargetId(user.id);
      setTargetName(user.username);
    }
  }

  function buildGrid() {
    const firstDow = new Date(selYear, selMonth - 1, 1).getDay();
    const cells: (WorkingDay | null)[] = [...Array(firstDow).fill(null), ...monthData];
    while (cells.length % 7) cells.push(null);
    return cells;
  }

  const summary = monthData.reduce((acc, day) => {
    if (day.isNightDeployment) acc.night++;
    if (day.isWeekendDay && day.isWeekendSupport) acc.weekend++;
    if (day.status === 'Working') acc.working++;
    else if (day.status === 'WFH') acc.wfh++;
    else if (day.status === 'Leave') acc.leave++;
    else if (day.status === 'Holiday') acc.holiday++;
    else if (day.status === 'Training') acc.training++;
    return acc;
  }, { working: 0, wfh: 0, leave: 0, holiday: 0, training: 0, night: 0, weekend: 0 });

  const teamSummaries = appState.timesheetEntries.map(entry => {
    const row = entry.workingDays.reduce((acc, day) => {
      if (day.isNightDeployment) acc.night++;
      if (day.isWeekendDay && day.isWeekendSupport) acc.weekend++;
      if (day.status === 'Working') acc.working++;
      else if (day.status === 'WFH') acc.wfh++;
      else if (day.status === 'Leave') acc.leave++;
      else if (day.status === 'Holiday') acc.holiday++;
      else if (day.status === 'Training') acc.training++;
      return acc;
    }, { working: 0, wfh: 0, leave: 0, holiday: 0, training: 0, night: 0, weekend: 0 });
    return { ...row, id: entry.id, userId: entry.userId, userName: entry.userName, month: entry.month };
  }).sort((a, b) => b.month.localeCompare(a.month));

  const specialLogs = (() => {
    const nightShifts: { userName: string; date: string; day: string; status: string; notes: string }[] = [];
    const weekendWork: { userName: string; date: string; day: string; status: string; notes: string }[] = [];
    appState.timesheetEntries.forEach(entry => {
      if (!canViewTeam && entry.userId !== currentUser.id) return;
      entry.workingDays.forEach(day => {
        const dayName = new Date(day.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
        const status = day.status || '';
        if (day.isNightDeployment) nightShifts.push({ userName: entry.userName, date: day.date, day: dayName, status, notes: day.notes || '' });
        if (day.isWeekendDay && day.isWeekendSupport && (day.status === 'Working' || day.status === 'WFH')) {
          weekendWork.push({ userName: entry.userName, date: day.date, day: dayName, status, notes: day.notes || '' });
        }
      });
    });
    nightShifts.sort((a, b) => b.date.localeCompare(a.date));
    weekendWork.sort((a, b) => b.date.localeCompare(a.date));
    return { nightShifts, weekendWork };
  })();

  function Controls() {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end', marginBottom: 20 }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={commonStyles.label(theme)}>Month</label>
          <select value={selMonth} onChange={e => setSelMonth(Number(e.target.value))} style={commonStyles.input(theme)}>
            {MONTH_NAMES.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label style={commonStyles.label(theme)}>Year</label>
          <select value={selYear} onChange={e => setSelYear(Number(e.target.value))} style={commonStyles.input(theme)}>
            {[today.getFullYear() - 2, today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1, today.getFullYear() + 2].map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
        {canLogForOthers && (
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={commonStyles.label(theme)}>Logging for</label>
            <select value={targetId === currentUser.id ? 'self' : targetId} onChange={e => handleLoggingForChange(e.target.value)} style={commonStyles.input(theme)}>
              <option value="self">Myself - {currentUser.username}</option>
              {appState.users.filter(user => user.id !== currentUser.id).map(user => (
                <option key={user.id} value={user.id}>{user.username} ({user.role})</option>
              ))}
            </select>
          </div>
        )}
        <div style={{ marginLeft: 'auto', color: lastSaved ? theme.green : theme.muted, fontSize: 11, fontWeight: 600 }}>
          {lastSaved ? `Last saved ${lastSaved.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}` : 'Not saved yet'}
        </div>
      </div>
    );
  }

  function CalendarGrid() {
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 4 }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} style={{
              textAlign: 'center',
              fontSize: 10,
              fontWeight: 700,
              color: day === 'Sun' || day === 'Sat' ? theme.red : theme.muted,
              textTransform: 'uppercase',
              padding: '4px 0',
            }}>{day}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
          {buildGrid().map((day, idx) => {
            if (!day) return <div key={`b${idx}`} style={{ minHeight: 72 }} />;

            const bg = getCellBg(day.status, day.isWeekendDay, isDark);
            const isToday = day.date === todayStr;
            const locCol = day.status === 'Working' && day.workLocation
              ? LOCATION_COLORS[day.workLocation]
              : null;
            const locationAuditTitle = day.locationAudit
              ? `Location updated by ${day.locationAudit.editedBy}\n\nPrevious: ${day.locationAudit.previousLocation || 'Not set'}\nCurrent: ${day.locationAudit.newLocation || 'Not set'}\n${new Date(day.locationAudit.editedOn).toLocaleDateString('en-GB')}`
              : '';

            return (
              <div key={day.date}
                onClick={() => !readOnly && openPop(day.date)}
                style={{
                  minHeight: 72,
                  background: bg || (isDark ? theme.card : '#f8fafc'),
                  border: isToday ? `2px solid ${theme.blue}` : `1px solid ${theme.border}`,
                  borderRadius: 8,
                  padding: '6px 6px 4px',
                  cursor: readOnly ? 'default' : 'pointer',
                  position: 'relative',
                  transition: 'background-color 0.25s ease',
                  userSelect: 'none',
                }}
              >
                <div style={{
                  fontSize: 12,
                  fontWeight: isToday ? 800 : 500,
                  color: isToday ? theme.blue : day.isWeekendDay ? theme.muted : theme.text,
                }}>
                  {new Date(day.date + 'T12:00:00').getDate()}
                  {day.isAdminAdjustment && (
                    <span style={{ color: '#f59e0b', marginLeft: 2, fontSize: 9 }}>*</span>
                  )}
                </div>

                {day.status && day.status !== 'Weekend' && (
                  <div style={{
                    fontSize: 9,
                    color: theme.muted,
                    marginTop: 2,
                    textTransform: 'uppercase',
                    letterSpacing: '0.3px',
                  }}>
                    {day.status}
                  </div>
                )}

                <div style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  alignItems: 'flex-end',
                }}>
                  {day.isNightDeployment && (
                    <span style={{ fontSize: 10 }} title="Night Deployment">🌙</span>
                  )}
                  {day.isWeekendSupport && (
                    <span style={{
                      fontSize: 8,
                      background: theme.orange + '33',
                      color: theme.orange,
                      borderRadius: 3,
                      padding: '1px 3px',
                      fontWeight: 700,
                    }}>W+</span>
                  )}
                </div>

                {locCol && (
                  <div title={day.workLocation || ''} style={{
                    position: 'absolute',
                    bottom: 4,
                    right: 4,
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: locCol,
                  }} />
                )}

                {canViewLocationAudit && day.locationAudit && (
                  <div title={locationAuditTitle} style={{
                    position: 'absolute',
                    bottom: 3,
                    right: 14,
                    fontSize: 10,
                    color: theme.amber,
                    fontWeight: 800,
                  }}>✎</div>
                )}

                {day.notes?.trim() && (
                  <div title={day.notes} style={{ position: 'absolute', bottom: 4, left: 4, fontSize: 9 }}>📝</div>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  }

  function DayPopover() {
    if (!popOpen || !popDay) return null;

    const closePopover = () => {
      setPopOpen(false);
      setPopDay(null);
      popDayRef.current = null;
    };
    const statusOptions: { value: WorkingDay['status']; label: string; icon: string; color: string }[] = [
      { value: 'Working', label: 'Working', icon: '🏢', color: theme.green },
      { value: 'WFH', label: 'WFH', icon: '🏠', color: theme.blue },
      { value: 'Leave', label: 'Leave', icon: '🏖', color: theme.red },
      { value: 'Holiday', label: 'Holiday', icon: '📅', color: theme.indigo },
      { value: 'Training', label: 'Training', icon: '🎓', color: theme.amber },
    ];
    const showLocation = popDay.status === 'Working';
    const canEditFullDay = targetId === currentUser.id || currentUser.role === 'superadmin' || currentUser.role === 'admin';
    const canEditWorkLocation = targetId === currentUser.id || canEditOtherWorkLocation;
    const columnStyle = {
      background: theme.inputBg,
      border: `1px solid ${theme.border}`,
      borderRadius: 10,
      padding: 16,
      minWidth: 0,
    };
    const chipStyle = (selected: boolean, color: string) => ({
      border: `1px solid ${selected ? color : theme.border}`,
      background: selected ? color : theme.card,
      color: selected ? '#ffffff' : theme.text,
      borderRadius: 999,
      padding: '10px 12px',
      minHeight: 42,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 8,
      cursor: 'pointer',
      fontSize: 13,
      fontWeight: 700,
      boxShadow: selected ? `0 8px 18px ${color}33` : 'none',
    });

    return createPortal(
      <div
        onClick={closePopover}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          zIndex: 9000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: theme.card,
            border: `1px solid ${theme.border}`,
            borderRadius: 14,
            width: 'min(960px, calc(100vw - 32px))',
            maxHeight: 'calc(100vh - 32px)',
            overflowY: 'auto',
            boxSizing: 'border-box',
            boxShadow: '0 24px 70px rgba(15, 23, 42, 0.32)',
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            padding: '20px 24px',
            borderBottom: `1px solid ${theme.border}`,
          }}>
            <div style={{ fontWeight: 800, color: theme.text, fontSize: 16 }}>
              📅 {new Date(popDay.date + 'T12:00:00').toLocaleDateString('en-GB', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </div>
            <button
              type="button"
              onClick={closePopover}
              aria-label="Close"
              style={{
                border: 'none',
                background: theme.inputBg,
                color: theme.text,
                borderRadius: 8,
                width: 32,
                height: 32,
                cursor: 'pointer',
                fontSize: 20,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: showLocation ? '1fr 1fr 1.3fr' : '1fr 1.7fr',
            gap: 16,
            padding: 24,
          }}>
            <section style={columnStyle}>
              <label style={{ ...commonStyles.label(theme), marginBottom: 12 }}>Status</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                {statusOptions.map(option => {
                  const selected = popDay.status === option.value;
                  return (
                    <button
                      key={option.label}
                      type="button"
                      disabled={!canEditFullDay}
                      onClick={() => setField('status', option.value)}
                      style={{ ...chipStyle(selected, option.color), opacity: canEditFullDay ? 1 : 0.58, cursor: canEditFullDay ? 'pointer' : 'not-allowed' }}
                    >
                      <span style={{ color: selected ? '#ffffff' : option.color }}>{option.icon}</span>
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {showLocation && (
              <section style={columnStyle}>
                <label style={{ ...commonStyles.label(theme), marginBottom: 12 }}>Work Location</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                  {LOCATION_OPTIONS.map(location => {
                    const selected = popDay.workLocation === location;
                    const color = LOCATION_COLORS[location] || theme.blue;
                    return (
                      <button
                        key={location}
                        type="button"
                        disabled={!canEditWorkLocation}
                        onClick={() => setField('workLocation', location)}
                        style={{ ...chipStyle(selected, color), opacity: canEditWorkLocation ? 1 : 0.58, cursor: canEditWorkLocation ? 'pointer' : 'not-allowed' }}
                      >
                        <span style={{ color: selected ? '#ffffff' : color }}>🏢</span>
                        <span>{location}</span>
                      </button>
                    );
                  })}
                </div>
                {!popDay.workLocation && (
                  <div style={{ fontSize: 11, color: theme.amber, marginTop: 10 }}>
                    ⚠ Please set your office location
                  </div>
                )}
                {canViewLocationAudit && popDay.locationAudit && (
                  <div style={{ fontSize: 11, color: theme.muted, marginTop: 10, lineHeight: 1.5 }}>
                    <strong style={{ color: theme.amber }}>Location updated by {popDay.locationAudit.editedBy}</strong>
                    <br />
                    {popDay.locationAudit.previousLocation || 'Not set'} → {popDay.locationAudit.newLocation || 'Not set'}
                    <br />
                    {new Date(popDay.locationAudit.editedOn).toLocaleDateString('en-GB')}
                  </div>
                )}
              </section>
            )}

            <section style={columnStyle}>
              <label style={{ ...commonStyles.label(theme), marginBottom: 12 }}>Other Details</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" id="nd"
                    checked={!!popDay.isNightDeployment}
                    disabled={!canEditFullDay}
                    onChange={e => setField('isNightDeployment', e.target.checked)}
                    style={{ accentColor: theme.blue, width: 14, height: 14, cursor: canEditFullDay ? 'pointer' : 'not-allowed' }} />
                  <label htmlFor="nd" style={{ fontSize: 12, color: theme.muted, cursor: 'pointer' }}>
                    🌙 Night Deployment
                  </label>
                </div>

                {popDay.isWeekendDay && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" id="ws"
                      checked={!!popDay.isWeekendSupport}
                      disabled={!canEditFullDay}
                      onChange={e => setField('isWeekendSupport', e.target.checked)}
                      style={{ accentColor: theme.orange, width: 14, height: 14, cursor: canEditFullDay ? 'pointer' : 'not-allowed' }} />
                    <label htmlFor="ws" style={{ fontSize: 12, color: theme.muted, cursor: 'pointer' }}>
                      W+ Weekend Support
                    </label>
                  </div>
                )}

                <div>
                  <label style={commonStyles.label(theme)}>Notes / Path Trace</label>
                  <textarea
                    style={{ ...commonStyles.input(theme), resize: 'vertical', minHeight: 112, fontFamily: 'inherit' }}
                    value={popDay.notes || ''}
                    disabled={!canEditFullDay}
                    onChange={e => setField('notes', e.target.value)}
                    placeholder="What did you work on today?"
                    maxLength={500}
                  />
                  <div style={{ fontSize: 10, color: theme.muted, textAlign: 'right' }}>
                    {(popDay.notes || '').length}/500
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '0 24px 24px' }}>
            <button style={commonStyles.button(theme, 'secondary')} onClick={closePopover}>
              Cancel
            </button>
            <button style={commonStyles.button(theme)} onClick={savePop}>
              Save
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  function LogTable({ type }: { type: 'night' | 'weekend' }) {
    const rows = type === 'night' ? specialLogs.nightShifts : specialLogs.weekendWork;
    return (
      <div style={commonStyles.card(theme)}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: theme.text, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          {type === 'night' ? <Clock size={18} style={{ color: theme.indigo }} /> : <Calendar size={18} style={{ color: theme.red }} />}
          {type === 'night' ? 'Night Deployment Logs' : 'Weekend Support Roster'}
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={commonStyles.table(theme)}>
            <thead>
              <tr>
                <th style={commonStyles.th(theme)}>Squad Member</th>
                <th style={commonStyles.th(theme)}>Date</th>
                <th style={commonStyles.th(theme)}>Day</th>
                <th style={commonStyles.th(theme)}>Status</th>
                <th style={commonStyles.th(theme)}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} style={{ ...commonStyles.td(theme), textAlign: 'center', color: theme.muted, padding: 24 }}>No entries found.</td></tr>
              ) : rows.map((row, index) => (
                <tr key={`${row.userName}-${row.date}-${index}`} style={{ backgroundColor: index % 2 === 1 ? theme.inputBg : 'transparent' }}>
                  <td style={{ ...commonStyles.td(theme), fontWeight: 600 }}>{row.userName}</td>
                  <td style={commonStyles.td(theme)}>{row.date}</td>
                  <td style={commonStyles.td(theme)}>{row.day}</td>
                  <td style={commonStyles.td(theme)}>{row.status || '—'}</td>
                  <td style={{ ...commonStyles.td(theme), maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.notes}>{row.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {readOnly && <ViewOnlyBanner theme={theme} />}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {[
          ['calendar', 'Calendar'],
          ['special', 'Special Logs'],
          ['holidays', 'Holiday List'],
        ].map(([key, label]) => (
          <button key={key} type="button" onClick={() => setActiveTab(key as typeof activeTab)} style={commonStyles.button(theme, activeTab === key ? 'primary' : 'secondary')}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'calendar' && (
        <div style={commonStyles.card(theme)}>
          <Controls />

          {targetId !== currentUser.id && (
            <div style={{ background: '#f59e0b22', border: '1px solid #f59e0b44', borderRadius: 8, padding: '8px 14px', marginBottom: 12, fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>
              ⚠ Editing {targetName}'s timesheet as {currentUser.username} ({currentUser.role})
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
            <StatCard value={summary.working} label="Working" accentColor={theme.green} theme={theme} />
            <StatCard value={summary.wfh} label="WFH" accentColor={theme.blue} theme={theme} />
            <StatCard value={summary.leave} label="Leave" accentColor={theme.red} theme={theme} />
            <StatCard value={summary.holiday} label="Holiday" accentColor={theme.indigo} theme={theme} />
            <StatCard value={summary.training} label="Training" accentColor={theme.amber} theme={theme} />
          </div>

          <h4 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px', color: theme.text }}>
            {targetName}'s Roster for {new Date(selYear, selMonth - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          </h4>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 14px', alignItems: 'center', marginBottom: 12, fontSize: 11, color: theme.muted }}>
            {STATUSES.map(status => (
              <span key={status} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: getCellBg(status, false, isDark), border: `1px solid ${theme.border}` }} />
                {status}
              </span>
            ))}
            <span>🌙 Night Deployment</span>
            <span style={{ fontWeight: 800 }}>W+ Weekend Support</span>
          </div>

          <CalendarGrid />
          <DayPopover />
        </div>
      )}

      {activeTab === 'special' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <LogTable type="night" />
            <LogTable type="weekend" />
          </div>
          {canViewTeam && (
            <div style={commonStyles.card(theme)}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: theme.text, marginBottom: 16, borderLeft: `4px solid ${theme.blue}`, paddingLeft: 8 }}>
                Team Timesheet Rollup Index
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={commonStyles.table(theme)}>
                  <thead>
                    <tr>
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
                      <tr><td colSpan={9} style={{ ...commonStyles.td(theme), textAlign: 'center', color: theme.muted, padding: 24 }}>No team timesheets logged yet.</td></tr>
                    ) : teamSummaries.map((row, index) => {
                      const userIndex = Math.max(0, appState.users.findIndex(user => user.id === row.userId));
                      const userColor = USER_COLORS[userIndex % USER_COLORS.length];
                      return (
                        <tr key={row.id} style={{ backgroundColor: index % 2 === 1 ? theme.inputBg : 'transparent', borderLeft: `3px solid ${userColor}` }}>
                          <td style={{ ...commonStyles.td(theme), fontWeight: 600 }}>{row.userName}</td>
                          <td style={commonStyles.td(theme)}>{row.month}</td>
                          <td style={commonStyles.td(theme)}>{row.working}</td>
                          <td style={commonStyles.td(theme)}>{row.leave}</td>
                          <td style={commonStyles.td(theme)}>{row.wfh}</td>
                          <td style={commonStyles.td(theme)}>{row.holiday}</td>
                          <td style={commonStyles.td(theme)}>{row.training}</td>
                          <td style={commonStyles.td(theme)}>{row.night}</td>
                          <td style={commonStyles.td(theme)}>{row.weekend}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'holidays' && (
        <HolidayList
          currentUser={currentUser}
          appState={appState}
          setAppState={setAppState}
          showToast={showToast}
          theme={theme}
        />
      )}
    </div>
  );
}
