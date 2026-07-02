import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ThemeTokens, commonStyles } from '../theme';
import { AppState, User, Recognition } from '../types';
import { getGreeting, getRelativeTime, getCurrentWeekRange, getNext14DaysRange, generateId } from '../utils';
import { Plus, X, ChevronLeft, ChevronRight } from 'lucide-react';

interface HomeProps {
  currentUser: User;
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  theme: ThemeTokens;
  onNavigate: (tab: string) => void;
  showToast: (msg: string, type: 'success' | 'error' | 'warning') => void;
}

const EMOJI_OPTIONS = ['🌟', '🏆', '💪', '🎯', '🔥', '👏', '🚀', '💡'] as const;

const OFFICE_LOCATIONS = ['QX-BLR', 'VIL-BLR', 'VIL-Pune', 'VIL-MUM'];
const BENGALURU_OFFICE_LOCATIONS = ['QX-BLR', 'VIL-BLR'];

function getBaseOffice(user: User): NonNullable<User['baseOffice']> {
  return user.baseOffice === 'Mumbai' ? 'Mumbai' : 'Bengaluru';
}

function getAttendancePolicy(user: User) {
  const baseOffice = getBaseOffice(user);
  return {
    baseOffice,
    target: baseOffice === 'Mumbai' ? 4 : 8,
    qualifyingLocations: baseOffice === 'Mumbai' ? OFFICE_LOCATIONS : BENGALURU_OFFICE_LOCATIONS,
  };
}

function computeLocationStats(timesheetEntries: { userId: string; month: string; workingDays: { date: string; status: string; workLocation: string | null; isWeekendDay: boolean; isWeekendSupport: boolean }[] }[], user: User, year: number, month: number) {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const policy = getAttendancePolicy(user);
  const entry = timesheetEntries.find(e => e.userId === user.id && e.month === monthKey);

  const today = new Date();
  const daysInMonth = new Date(year, month, 0).getDate();
  const isCurrentMonth = today.getFullYear() === year && (today.getMonth() + 1) === month;
  const daysRemaining = isCurrentMonth ? daysInMonth - today.getDate() : 0;
  if (!entry) return { count: 0, target: policy.target, remaining: policy.target, baseOffice: policy.baseOffice, qualifyingLocations: policy.qualifyingLocations, daysRemaining, isCurrentMonth, hasData: false };

  const workingDays = entry.workingDays || [];
  const count = workingDays.reduce((total, day) => {
    if (day.status !== 'Working') return total;
    if (!day.workLocation) return total;
    if (day.isWeekendDay && !day.isWeekendSupport) return total;
    return policy.qualifyingLocations.includes(day.workLocation) ? total + 1 : total;
  }, 0);

  return { count, target: policy.target, remaining: Math.max(policy.target - count, 0), baseOffice: policy.baseOffice, qualifyingLocations: policy.qualifyingLocations, daysRemaining, isCurrentMonth, hasData: workingDays.length > 0 };
}

function CompactLocationCard({ location, count, target, color, C }) {
  const pct = Math.min(Math.round(count / target * 100), 100);
  const remaining = Math.max(target - count, 0);
  const onTrack = pct >= 75;
  const met = count >= target;

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 10,
      padding: "14px 16px",
      position: "relative"
    }}>
      <div style={{ fontSize: 10, color, fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.5px",
                    marginBottom: 6 }}>
        📍 {location}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: C.text, lineHeight: 1 }}>
        {count}
        <span style={{ fontSize: 13, color: C.muted, fontWeight: 400 }}>
          /{target}
        </span>
      </div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 4,
                    textTransform: "uppercase", letterSpacing: "0.5px" }}>
        days this month
      </div>
      <div style={{ marginTop: 8, background: C.border,
                    borderRadius: 99, height: 4, overflow: "hidden" }}>
        <div style={{
          width: `${pct}%`,
          background: met ? C.green : onTrack ? C.amber : C.red,
          height: "100%",
          borderRadius: 99,
          transition: "width 0.8s ease"
        }} />
      </div>
      <div style={{ fontSize: 10, marginTop: 6,
                    color: met ? C.green : onTrack ? C.amber : C.red,
                    fontWeight: 600 }}>
        {met ? "✓ Target met" : remaining + " more needed"}
      </div>
    </div>
  );
}

function formatDateDisplay(isoString: string): string {
  const d = new Date(isoString + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
}

function isBirthdayInRange(birthday: string, todayStr: string, endStr: string): boolean {
  const today = new Date(todayStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  const [bMonth, bDay] = birthday.split('-').map(Number);
  for (let d = new Date(today); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getMonth() + 1 === bMonth && d.getDate() === bDay) return true;
  }
  return false;
}

function getBirthdayDateInRange(birthday: string, todayStr: string, endStr: string): Date | null {
  const today = new Date(todayStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  const [bMonth, bDay] = birthday.split('-').map(Number);
  for (let d = new Date(today); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getMonth() + 1 === bMonth && d.getDate() === bDay) return new Date(d);
  }
  return null;
}

export function Home({ currentUser, appState, setAppState, theme, onNavigate, showToast }: HomeProps) {
  const [showRecognitionModal, setShowRecognitionModal] = useState(false);
  const [recogTo, setRecogTo] = useState('');
  const [recogEmoji, setRecogEmoji] = useState<string>('🌟');
  const [recogMessage, setRecogMessage] = useState('');
  const [recogErrors, setRecogErrors] = useState<Record<string, string>>({});
  const [animatedValues, setAnimatedValues] = useState<Record<string, number>>({});
  const today = new Date();
  const [attendanceMonth, setAttendanceMonth] = useState(today.getMonth() + 1);
  const [attendanceYear, setAttendanceYear] = useState(today.getFullYear());
  const [attendanceUserId, setAttendanceUserId] = useState(currentUser.id);

  const todayStr = today.toISOString().slice(0, 10);
  const hour = today.getHours();

  const greeting = getGreeting();
  const dateFull = today.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });

  const { weekStart, weekEnd } = getCurrentWeekRange();
  const { today: rangeStart, end: rangeEnd } = getNext14DaysRange();

  const projectName = appState.projects.find(p => p.id === currentUser.projectId)?.name || '';
  const squadName = appState.squads.find(s => s.id === currentUser.squadId)?.name || '';

  // ---- Personal metrics ----
  const personalMetrics = useMemo(() => {
    const entries = appState.dataEntries.filter(e =>
      e.addedBy === currentUser.id && e.date >= weekStart && e.date <= weekEnd
    );
    const defects = appState.defects.filter(d =>
      d.addedBy === currentUser.id && d.date >= weekStart && d.date <= weekEnd
    );
    const stories = entries.length;
    const tcCreated = entries.reduce((s, e) => s + (e.tcCreated || 0), 0);
    const tcExecuted = entries.reduce((s, e) => s + (e.tcExecuted || 0), 0);
    const tcPassed = entries.reduce((s, e) => s + (e.tcPassed || 0), 0);
    const tcFailed = entries.reduce((s, e) => s + (e.tcFailed || 0), 0);
    const passRate = tcExecuted > 0 ? Math.round((tcPassed / tcExecuted) * 100) : 0;
    const defectCount = defects.length;
    return { stories, tcCreated, tcExecuted, tcPassed, tcFailed, passRate, defects: defectCount };
  }, [appState.dataEntries, appState.defects, currentUser.id, weekStart, weekEnd]);

  // Last week for comparison
  const lastWeekMetrics = useMemo(() => {
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(weekEnd);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);
    const lws = lastWeekStart.toISOString().slice(0, 10);
    const lwe = lastWeekEnd.toISOString().slice(0, 10);
    const entries = appState.dataEntries.filter(e =>
      e.addedBy === currentUser.id && e.date >= lws && e.date <= lwe
    );
    const defects = appState.defects.filter(d =>
      d.addedBy === currentUser.id && d.date >= lws && d.date <= lwe
    );
    return {
      stories: entries.length,
      tcCreated: entries.reduce((s, e) => s + (e.tcCreated || 0), 0),
      tcExecuted: entries.reduce((s, e) => s + (e.tcExecuted || 0), 0),
      tcPassed: entries.reduce((s, e) => s + (e.tcPassed || 0), 0),
      tcFailed: entries.reduce((s, e) => s + (e.tcFailed || 0), 0),
      passRate: entries.reduce((s, e) => s + (e.tcExecuted || 0), 0) > 0
        ? Math.round(entries.reduce((s, e) => s + (e.tcPassed || 0), 0) / entries.reduce((s, e) => s + (e.tcExecuted || 0), 0) * 100)
        : 0,
      defects: defects.length,
    };
  }, [appState.dataEntries, appState.defects, currentUser.id, weekStart, weekEnd]);

  const getTrend = (metric: keyof typeof personalMetrics, higherIsBetter: boolean) => {
    const current = personalMetrics[metric];
    const previous = lastWeekMetrics[metric];
    if (previous === 0) return { arrow: '', diff: '— No previous week data', color: theme.muted };
    const absDiff = current - previous;
    const pctChange = previous > 0 ? Math.round((absDiff / previous) * 100) : 0;
    const improved = higherIsBetter ? absDiff >= 0 : absDiff <= 0;
    const arrow = absDiff > 0 ? '↑' : absDiff < 0 ? '↓' : '';
    const sign = absDiff >= 0 ? '+' : '';
    return {
      arrow,
      diff: `${arrow} ${sign}${absDiff} vs last week  [${pctChange >= 0 ? '+' : ''}${pctChange}%]`,
      color: improved ? theme.green : theme.red,
    };
  };

  const metricsConfig = [
    { key: 'stories' as const, label: 'Stories Tested', accent: theme.blue, higherIsBetter: true },
    { key: 'tcCreated' as const, label: 'TC Created', accent: theme.indigo, higherIsBetter: true },
    { key: 'tcExecuted' as const, label: 'TC Executed', accent: theme.indigo, higherIsBetter: true },
    { key: 'tcPassed' as const, label: 'TC Passed', accent: theme.green, higherIsBetter: true },
    { key: 'tcFailed' as const, label: 'TC Failed', accent: theme.red, higherIsBetter: false },
    { key: 'passRate' as const, label: 'Pass Rate', accent: theme.green, higherIsBetter: true, isPct: true },
    { key: 'defects' as const, label: 'Defects Logged', accent: theme.orange, higherIsBetter: false },
  ];

  // Animated counter effect
  useEffect(() => {
    const targets: Record<string, number> = {};
    metricsConfig.forEach(m => { targets[m.key] = personalMetrics[m.key]; });
    const duration = 600;
    const startTime = Date.now();
    const initial: Record<string, number> = {};
    metricsConfig.forEach(m => { initial[m.key] = 0; });
    setAnimatedValues(initial);
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const next: Record<string, number> = {};
      metricsConfig.forEach(m => {
        next[m.key] = Math.round(progress * personalMetrics[m.key]);
      });
      setAnimatedValues(next);
      if (progress >= 1) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [personalMetrics.stories, personalMetrics.tcCreated, personalMetrics.tcExecuted, personalMetrics.tcPassed, personalMetrics.tcFailed, personalMetrics.passRate, personalMetrics.defects]);

  // Callout banner
  const calloutBanner = useMemo(() => {
    const hasData = personalMetrics.stories > 0 || personalMetrics.tcCreated > 0 || personalMetrics.tcExecuted > 0 || personalMetrics.defects > 0;
    if (!hasData) {
      return { type: 'empty' as const, message: 'No entries logged this week yet. Start by adding your first data entry!' };
    }
    let worstMetric: { key: string; label: string; drop: number } | null = null;
    metricsConfig.forEach(m => {
      const current = personalMetrics[m.key];
      const previous = lastWeekMetrics[m.key];
      if (previous > 0) {
        const pct = Math.round(((current - previous) / previous) * 100);
        if (pct < -20) {
          if (!worstMetric || pct < worstMetric.drop) {
            worstMetric = { key: m.key, label: m.label, drop: pct };
          }
        }
      }
    });
    if (worstMetric) {
      return { type: 'warning' as const, message: `Heads up — your ${worstMetric.label.toLowerCase()} is down ${Math.abs(worstMetric.drop)}% compared to last week. Keep it up and close the gap!` };
    }
    return { type: 'success' as const, message: 'Great week so far! You\'re on track or ahead of last week across all metrics.' };
  }, [personalMetrics, lastWeekMetrics]);

  // ---- Birthdays ----
  const { birthdays, isOwnBirthdayToday } = useMemo(() => {
    const projUsers = currentUser.role === 'superadmin'
      ? appState.users
      : appState.users.filter(u => u.projectId === currentUser.projectId);
    const allBdays = projUsers.filter(u => u.birthday && isBirthdayInRange(u.birthday, rangeStart, rangeEnd));
    const withDates = allBdays.map(u => ({
      user: u,
      date: getBirthdayDateInRange(u.birthday!, rangeStart, rangeEnd)!,
    })).sort((a, b) => a.date.getTime() - b.date.getTime());
    const ownBday = currentUser.birthday && isBirthdayInRange(currentUser.birthday, rangeStart, rangeEnd) &&
      getBirthdayDateInRange(currentUser.birthday, rangeStart, rangeEnd)?.toISOString().slice(0, 10) === todayStr;
    return { birthdays: withDates.slice(0, 5), isOwnBirthdayToday: !!ownBday, total: allBdays.length };
  }, [appState.users, currentUser, rangeStart, rangeEnd, todayStr]);

  // ---- Holidays ----
  const upcomingHolidays = useMemo(() => {
    const holidays = appState.holidays.filter(h => h.date >= todayStr && h.date <= rangeEnd);
    const sorted = holidays.sort((a, b) => a.date.localeCompare(b.date));
    const isTodayHoliday = sorted.some(h => h.date === todayStr);
    const todayHoliday = sorted.find(h => h.date === todayStr);
    const others = sorted.filter(h => h.date > todayStr);
    return { holidays: [...(todayHoliday ? [todayHoliday] : []), ...others].slice(0, 5), isTodayHoliday, total: sorted.length };
  }, [appState.holidays, todayStr, rangeEnd]);

  // ---- Recognitions ----
  const projectRecognitions = useMemo(() => {
    const recogs = currentUser.role === 'superadmin'
      ? appState.recognitions
      : appState.recognitions.filter(r => r.projectId === currentUser.projectId);
    return recogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [appState.recognitions, currentUser]);

  const recentRecognitions = projectRecognitions.slice(0, 5);

  const teamMembers = useMemo(() => {
    if (currentUser.role === 'superadmin') return appState.users.filter(u => u.id !== currentUser.id);
    return appState.users.filter(u => u.projectId === currentUser.projectId && u.id !== currentUser.id);
  }, [appState.users, currentUser]);

  const handleGiveRecognition = () => {
    const errors: Record<string, string> = {};
    if (!recogTo) errors.recipient = 'Please select a team member.';
    if (recogTo === currentUser.id) errors.recipient = 'You cannot recognise yourself.';
    if (!recogEmoji) errors.emoji = 'Please select an emoji.';
    const msg = recogMessage.trim();
    if (!msg) errors.message = 'Message is required.';
    else if (msg.length < 10) errors.message = 'Message must be at least 10 characters.';
    else if (msg.length > 280) errors.message = 'Message must be 280 characters or less.';
    setRecogErrors(errors);
    if (Object.keys(errors).length) return;

    const recipient = appState.users.find(u => u.id === recogTo);
    if (!recipient) return;

    const recognition: Recognition = {
      id: generateId(),
      fromUserId: currentUser.id,
      fromUsername: currentUser.username,
      toUserId: recipient.id,
      toUsername: recipient.username,
      toSquad: recipient.squadId || '',
      toProject: recipient.projectId || '',
      message: msg,
      emoji: recogEmoji as Recognition['emoji'],
      projectId: recipient.projectId || currentUser.projectId || '',
      createdAt: new Date().toISOString(),
    };

    setAppState(prev => ({
      ...prev,
      recognitions: [recognition, ...prev.recognitions],
      users: prev.users.map(u => u.id === recipient.id ? {
        ...u,
        notifications: [
          {
            id: generateId(),
            message: `${currentUser.username} recognised you: ${msg.slice(0, 60)}${msg.length > 60 ? '...' : ''}`,
            type: 'info' as const,
            read: false,
            createdAt: new Date().toISOString(),
            link: 'home',
          },
          ...(u.notifications || []),
        ].slice(0, 50),
      } : u),
    }));

    showToast(`Recognition sent to ${recipient.username}! 🌟`, 'success');
    setShowRecognitionModal(false);
    setRecogTo('');
    setRecogEmoji('🌟');
    setRecogMessage('');
    setRecogErrors({});
  };

  // ---- Role-based quick action visibility ----
  const userPerms = useMemo(() => {
    const perms = currentUser.role === 'superadmin'
      ? { dataEntry: 'edit' as const, defects: 'edit' as const, timesheet: 'edit' as const }
      : {
        dataEntry: (currentUser as any).permissions?.dataEntry || 'none',
        defects: (currentUser as any).permissions?.defects || 'none',
        timesheet: (currentUser as any).permissions?.timesheet || 'none',
      };
    return perms;
  }, [currentUser]);

  // ---- Attendance tracking ----
  const canViewOthersAttendance = ['lead', 'admin', 'superadmin'].includes(currentUser.role);
  const attendanceUserList = useMemo(() => {
    if (currentUser.role === 'superadmin') return appState.users;
    if (currentUser.role === 'admin') return appState.users.filter(u => u.projectId === currentUser.projectId);
    if (currentUser.role === 'lead') return appState.users.filter(u => u.projectId === currentUser.projectId);
    return [currentUser];
  }, [appState.users, currentUser]);

  const attendanceTargetUser = useMemo(() => {
    if (!canViewOthersAttendance) return currentUser;
    return appState.users.find(u => u.id === attendanceUserId) || currentUser;
  }, [appState.users, attendanceUserId, currentUser, canViewOthersAttendance]);

  const attendanceStats = useMemo(() =>
    computeLocationStats(appState.timesheetEntries, attendanceTargetUser, attendanceYear, attendanceMonth),
  [appState.timesheetEntries, attendanceTargetUser, attendanceYear, attendanceMonth]);

  const attendanceMonthLabel = new Date(attendanceYear, attendanceMonth - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const isAttendanceCurrentMonth = today.getFullYear() === attendanceYear && (today.getMonth() + 1) === attendanceMonth;

  function handleAttendanceMonth(delta: number) {
    let m = attendanceMonth + delta;
    let y = attendanceYear;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    setAttendanceMonth(m);
    setAttendanceYear(y);
  }

  const compactLocationBadges = useMemo(() => {
    const pct = Math.min(Math.round(attendanceStats.count / attendanceStats.target * 100), 100);
    const badgeColor = pct >= 75 ? theme.green : pct >= 40 ? theme.amber : theme.red;
    return [{ key: 'office-attendance', label: 'Office', count: attendanceStats.count, target: attendanceStats.target, pct, color: badgeColor }];
  }, [attendanceStats.count, attendanceStats.target, theme]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '1100px' }}>
      {/* Birthday banner */}
      {isOwnBirthdayToday && (
        <div style={{
          background: `linear-gradient(135deg, ${theme.amber}22, ${theme.orange}22)`,
          border: `1px solid ${theme.amber}66`,
          borderRadius: '12px',
          padding: '16px 20px',
          textAlign: 'center',
          animation: 'birthdayPulse 2s ease-in-out infinite',
        }}>
          <span style={{ fontSize: '20px', fontWeight: 700, color: theme.amber }}>
            🎉 Happy Birthday, {currentUser.username}! Wishing you a wonderful day from the whole team! 🎂
          </span>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', animation: 'pageEnter 0.4s ease-out forwards' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>
            {greeting}, {currentUser.username} 👋
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: theme.muted }}>
            {[currentUser.jobTitle, squadName, projectName].filter(Boolean).join(' · ') || 'No team assigned'}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          {compactLocationBadges.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end', cursor: 'pointer' }}
              onClick={() => document.querySelector('[data-attendance-widget]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              {compactLocationBadges.map(b => (
                <span key={b.key} style={{ fontSize: '11px', fontWeight: 700, color: b.color, whiteSpace: 'nowrap' }}>
                  {b.label}: {b.count}/{b.target}
                </span>
              ))}
            </div>
          )}
          <div style={{ fontSize: '13px', color: theme.muted, fontWeight: 500, whiteSpace: 'nowrap' }}>
            {dateFull}
          </div>
        </div>
      </div>

      {/* Section 1: My Week at a Glance */}
      <section style={{ animation: 'pageEnter 0.4s ease-out forwards', animationDelay: '0.1s' }}>
        <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: theme.text, marginBottom: '10px' }}>
          My Week at a Glance
        </h2>

        {/* Callout banner */}
        {calloutBanner.type === 'empty' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', backgroundColor: `${theme.blue}15`, border: `1px solid ${theme.blue}40`, borderRadius: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '18px' }}>📋</span>
            <span style={{ color: theme.text, fontSize: '13px', flex: 1 }}>{calloutBanner.message}</span>
            <button type="button" onClick={() => onNavigate('dataEntry')} style={{ ...commonStyles.button(theme, 'primary', 'sm') }}>+ Add Data Entry</button>
          </div>
        )}
        {calloutBanner.type === 'warning' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', backgroundColor: `${theme.amber}15`, border: `1px solid ${theme.amber}40`, borderRadius: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '18px' }}>⚠</span>
            <span style={{ color: theme.amber, fontSize: '13px', fontWeight: 500 }}>{calloutBanner.message}</span>
          </div>
        )}
        {calloutBanner.type === 'success' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', backgroundColor: `${theme.green}15`, border: `1px solid ${theme.green}40`, borderRadius: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '18px' }}>✓</span>
            <span style={{ color: theme.green, fontSize: '13px', fontWeight: 500 }}>{calloutBanner.message}</span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
          {metricsConfig.map((m, idx) => {
            const trend = getTrend(m.key, m.higherIsBetter);
            const val = m.isPct ? (animatedValues[m.key] ?? 0) : (animatedValues[m.key] ?? 0);
            const displayVal = m.isPct ? `${val}%` : val;
            return (
              <div key={m.key} style={{
                ...commonStyles.card(theme),
                padding: '20px',
                borderRadius: '12px',
                borderLeft: `4px solid ${m.accent}`,
                animation: 'cardIn 0.25s ease-out both',
                animationDelay: `${200 + idx * 60}ms`,
              }}>
                <div style={{ fontSize: '36px', fontWeight: 800, color: theme.text, lineHeight: 1.1 }}>
                  {displayVal}
                </div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: theme.muted, textTransform: 'uppercase', marginTop: '4px', letterSpacing: '0.02em' }}>
                  {m.label}
                </div>
                <div style={{ fontSize: '11px', color: trend.color, marginTop: '4px', fontWeight: 600 }}>
                  {trend.diff}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 3: Office Attendance Tracker */}
      <section data-attendance-widget style={{ animation: 'pageEnter 0.4s ease-out forwards', animationDelay: '0.3s' }}>
        <div style={commonStyles.card(theme)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
              📍 {attendanceTargetUser.id !== currentUser.id ? attendanceTargetUser.username + "'s " : ''}Office Attendance Tracker — {attendanceMonthLabel}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
              {canViewOthersAttendance && (
                <select value={attendanceUserId} onChange={e => setAttendanceUserId(e.target.value)} style={{ ...commonStyles.select(theme, true), minWidth: '140px', fontSize: '12px' }}>
                  <option value={currentUser.id}>Myself</option>
                  {attendanceUserList.filter(u => u.id !== currentUser.id).map(u => (
                    <option key={u.id} value={u.id}>{u.username}</option>
                  ))}
                </select>
              )}
              <button type="button" onClick={() => handleAttendanceMonth(-1)} style={{ border: 0, background: 'transparent', color: theme.muted, cursor: 'pointer', display: 'flex', padding: '4px' }}><ChevronLeft size={16} /></button>
              <span style={{ fontWeight: 700, minWidth: '100px', textAlign: 'center' }}>{attendanceMonthLabel}</span>
              <button type="button" onClick={() => handleAttendanceMonth(1)} style={{ border: 0, background: 'transparent', color: theme.muted, cursor: 'pointer', display: 'flex', padding: '4px' }}><ChevronRight size={16} /></button>
            </div>
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, color: theme.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
            OFFICE ATTENDANCE — {attendanceMonthLabel.toUpperCase()}
          </div>

          {!isAttendanceCurrentMonth && !attendanceStats.hasData ? (
            <div style={{ textAlign: 'center', padding: '32px', color: theme.muted, fontSize: '13px' }}>
              No data yet for this month.
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 320px) 1fr', gap: '12px', alignItems: 'stretch' }}>
                <CompactLocationCard
                  location="Office Attendance"
                  count={attendanceStats.count}
                  target={attendanceStats.target}
                  color={attendanceStats.baseOffice === 'Mumbai' ? '#f97316' : '#3b82f6'}
                  C={theme}
                />
                <div style={{
                  background: theme.inputBg,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 10,
                  padding: '14px 16px',
                  fontSize: 12,
                  color: theme.muted,
                  lineHeight: 1.6,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: theme.text, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                    Base Office: {attendanceStats.baseOffice}
                  </div>
                  <div>
                    Target: <strong style={{ color: theme.text }}>{attendanceStats.target} days/month</strong>
                  </div>
                  <div>
                    Remaining: <strong style={{ color: attendanceStats.remaining === 0 ? theme.green : theme.amber }}>{attendanceStats.remaining} day{attendanceStats.remaining === 1 ? '' : 's'}</strong>
                  </div>
                  <div>
                    Qualifying locations: {attendanceStats.qualifyingLocations.join(', ')}
                  </div>
                </div>
              </div>
              {attendanceStats.remaining > 0 && (
                <div style={{
                  background: theme.amber + "15",
                  border: `1px solid ${theme.amber}30`,
                  borderRadius: 8,
                  padding: "10px 14px",
                  marginTop: 8,
                  fontSize: 12,
                  color: theme.amber
                }}>
                  ⚠ {attendanceStats.remaining} more office day{attendanceStats.remaining === 1 ? '' : 's'} needed for the {attendanceStats.baseOffice} attendance target.
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Section 2: Two-column snapshot */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {/* Upcoming Holidays */}
        <section style={{ ...commonStyles.card(theme), animation: 'pageEnter 0.35s ease-out forwards', animationDelay: '0.6s', animationFillMode: 'both' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
            🗓 Upcoming Holidays
          </h3>
          {upcomingHolidays.holidays.length === 0 ? (
            <div style={{ color: theme.muted, fontSize: '12px' }}>No holidays in the next 14 days</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {upcomingHolidays.isTodayHoliday && upcomingHolidays.holidays[0]?.date === todayStr && (
                <div style={{ padding: '8px 10px', backgroundColor: `${theme.amber}18`, borderRadius: '6px', fontWeight: 700, color: theme.amber, fontSize: '13px' }}>
                  Today is {upcomingHolidays.holidays[0].name} 🎉
                </div>
              )}
              {upcomingHolidays.holidays.map(h => {
                const isPh = h.type === 'Holiday';
                return (
                  <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${theme.border}` }}>
                    <span style={{ fontSize: '12px', color: theme.text }}>{formatDateDisplay(h.date)}</span>
                    <span style={{ fontSize: '12px', color: theme.muted, flex: 1, marginLeft: '8px' }}>{h.name}</span>
                    <span style={{
                      ...commonStyles.badge(theme, isPh ? theme.red : theme.amber),
                      fontSize: '10px',
                    }}>
                      {isPh ? 'PH' : 'OH'}
                    </span>
                  </div>
                );
              })}
              {upcomingHolidays.total > 5 && (
                <button type="button" onClick={() => onNavigate('settings')} style={{ ...commonStyles.button(theme, 'secondary', 'sm'), alignSelf: 'flex-start', marginTop: '4px', fontSize: '11px' }}>
                  View all in Holiday List →
                </button>
              )}
            </div>
          )}
        </section>

        {/* Upcoming Birthdays */}
        <section style={{ ...commonStyles.card(theme), animation: 'pageEnter 0.35s ease-out forwards', animationDelay: '0.6s', animationFillMode: 'both' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
            🎂 Upcoming Birthdays
          </h3>
          {birthdays.length === 0 ? (
            <div style={{ color: theme.muted, fontSize: '12px' }}>No birthdays in the next 14 days</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {birthdays.map(({ user, date }) => {
                const isToday = date.toISOString().slice(0, 10) === todayStr;
                const squad = appState.squads.find(s => s.id === user.squadId);
                return (
                  <div key={user.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '6px 8px', borderRadius: '6px',
                    backgroundColor: isToday ? `${theme.amber}20` : 'transparent',
                    borderBottom: `1px solid ${theme.border}`,
                  }}>
                    <span style={{ fontSize: '12px', color: isToday ? theme.amber : theme.text, fontWeight: isToday ? 700 : 500 }}>
                      {isToday ? '🎂 Today!' : formatDateDisplay(date.toISOString().slice(0, 10))}
                    </span>
                    <span style={{ fontSize: '12px', color: theme.muted }}>{user.username}</span>
                    <span style={{ fontSize: '11px', color: theme.muted }}>{squad?.name || ''}</span>
                  </div>
                );
              })}
              {birthdays.length < (() => {
                const projUsers = currentUser.role === 'superadmin' ? appState.users : appState.users.filter(u => u.projectId === currentUser.projectId);
                return projUsers.filter(u => u.birthday && isBirthdayInRange(u.birthday, rangeStart, rangeEnd)).length;
              })() && (
                <div style={{ color: theme.muted, fontSize: '11px', marginTop: '4px' }}>
                  +{(() => {
                    const projUsers = currentUser.role === 'superadmin' ? appState.users : appState.users.filter(u => u.projectId === currentUser.projectId);
                    return projUsers.filter(u => u.birthday && isBirthdayInRange(u.birthday, rangeStart, rangeEnd)).length - birthdays.length;
                  })()} more this month
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Section 3: Recognitions */}
      <section style={{ animation: 'pageEnter 0.35s ease-out forwards', animationDelay: '0.8s', animationFillMode: 'both' }}>
        <div style={{ ...commonStyles.card(theme) }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
              🌟 Team Recognitions
            </h3>
            <button type="button" onClick={() => setShowRecognitionModal(true)} style={{ ...commonStyles.button(theme, 'primary', 'sm') }}>
              <Plus size={14} /> Give Recognition
            </button>
          </div>

          {recentRecognitions.length === 0 ? (
            <div style={{ color: theme.muted, fontSize: '12px', padding: '12px 0', textAlign: 'center' }}>
              No recognitions yet. Be the first to recognise a teammate!
              <div style={{ marginTop: '8px' }}>
                <button type="button" onClick={() => setShowRecognitionModal(true)} style={{ ...commonStyles.button(theme, 'primary', 'sm') }}>
                  <Plus size={14} /> Give Recognition
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recentRecognitions.map(r => {
                const emojiColors: Record<string, string> = {
                  '🌟': '#fbbf24', '🏆': '#f59e0b', '💪': '#ef4444', '🎯': '#3b82f6', '🔥': '#f97316', '👏': '#10b981', '🚀': '#8b5cf6', '💡': '#eab308',
                };
                return (
                  <div key={r.id} style={{
                    padding: '10px 12px',
                    borderLeft: `3px solid ${emojiColors[r.emoji] || theme.blue}`,
                    backgroundColor: theme.inputBg,
                    borderRadius: '8px',
                    animation: 'pageEnter 0.3s ease-out forwards',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: theme.text }}>
                        {r.emoji} {r.fromUsername} recognised {r.toUsername}
                      </span>
                      <span style={{ fontSize: '11px', color: theme.muted }}>{getRelativeTime(r.createdAt)}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: theme.muted, whiteSpace: 'pre-wrap' }}>"{r.message}"</div>
                  </div>
                );
              })}
              {projectRecognitions.length > 5 && (
                <button type="button" onClick={() => onNavigate('home')} style={{ ...commonStyles.button(theme, 'secondary', 'sm'), alignSelf: 'flex-start', fontSize: '11px' }}>
                  View all
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Section 4: Quick Actions */}
      <section style={{ animation: 'pageEnter 0.3s ease-out forwards', animationDelay: '0.9s', animationFillMode: 'both' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {userPerms.dataEntry !== 'none' && (
            <button type="button" onClick={() => onNavigate('dataEntry')} style={{
              ...commonStyles.button(theme, 'secondary', 'sm'),
              padding: '6px 12px', fontSize: '12px',
              border: `1px solid ${theme.border}`,
            }}>
              + Log Data Entry
            </button>
          )}
          {userPerms.defects !== 'none' && (
            <button type="button" onClick={() => onNavigate('defects')} style={{
              ...commonStyles.button(theme, 'secondary', 'sm'),
              padding: '6px 12px', fontSize: '12px',
              border: `1px solid ${theme.border}`,
            }}>
              + Log Defect
            </button>
          )}
          {userPerms.timesheet !== 'none' && (
            <button type="button" onClick={() => onNavigate('timesheet')} style={{
              ...commonStyles.button(theme, 'secondary', 'sm'),
              padding: '6px 12px', fontSize: '12px',
              border: `1px solid ${theme.border}`,
            }}>
              📅 Fill Timesheet
            </button>
          )}
          {currentUser.role !== 'guest' && currentUser.role !== 'member' && (
            <button type="button" onClick={() => onNavigate('leaveRequests')} style={{
              ...commonStyles.button(theme, 'secondary', 'sm'),
              padding: '6px 12px', fontSize: '12px',
              border: `1px solid ${theme.border}`,
            }}>
              🏖 Apply for Leave
            </button>
          )}
        </div>
      </section>

      {/* Give Recognition Modal */}
      {showRecognitionModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, backgroundColor: 'rgba(15,23,42,0.54)', display: 'grid', placeItems: 'center', padding: '20px', animation: 'modalBackdropIn 200ms ease-out' }}>
          <div onClick={e => e.stopPropagation()} style={{ ...commonStyles.card(theme), width: '100%', maxWidth: '480px', padding: '24px', animation: 'modalPanelIn 250ms ease-out', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '6px' }}>🌟 Give Recognition</h2>
              <button type="button" onClick={() => { setShowRecognitionModal(false); setRecogErrors({}); }} style={{ border: 0, background: 'transparent', color: theme.muted, cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Recipient */}
              <div>
                <label style={commonStyles.label(theme)}>Recognise</label>
                <select value={recogTo} onChange={e => setRecogTo(e.target.value)} style={{ ...commonStyles.select(theme, true), borderColor: recogErrors.recipient ? theme.red : theme.border }}>
                  <option value="">Select a team member</option>
                  {teamMembers.map(u => (
                    <option key={u.id} value={u.id}>{u.username}{u.jobTitle ? ` — ${u.jobTitle}` : ''}</option>
                  ))}
                </select>
                {recogErrors.recipient && <div style={{ color: theme.red, fontSize: '11px', marginTop: '3px' }}>{recogErrors.recipient}</div>}
              </div>

              {/* Emoji */}
              <div>
                <label style={commonStyles.label(theme)}>Choose an emoji</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {EMOJI_OPTIONS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => { setRecogEmoji(emoji); setRecogErrors(prev => { const n = { ...prev }; delete n.emoji; return n; }); }}
                      style={{
                        width: '40px', height: '40px', borderRadius: '8px', border: `2px solid ${recogEmoji === emoji ? theme.blue : theme.border}`,
                        backgroundColor: recogEmoji === emoji ? `${theme.blue}20` : 'transparent',
                        cursor: 'pointer', fontSize: '20px', display: 'grid', placeItems: 'center',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                {recogErrors.emoji && <div style={{ color: theme.red, fontSize: '11px', marginTop: '3px' }}>{recogErrors.emoji}</div>}
              </div>

              {/* Message */}
              <div>
                <label style={commonStyles.label(theme)}>Your message</label>
                <textarea
                  value={recogMessage}
                  onChange={e => { setRecogMessage(e.target.value); setRecogErrors(prev => { const n = { ...prev }; delete n.message; return n; }); }}
                  placeholder="Write what you want to recognise them for..."
                  maxLength={280}
                  style={{
                    ...commonStyles.input(theme),
                    minHeight: '72px',
                    resize: 'vertical',
                    borderColor: recogErrors.message ? theme.red : theme.border,
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
                  {recogErrors.message ? (
                    <span style={{ color: theme.red, fontSize: '11px' }}>{recogErrors.message}</span>
                  ) : (
                    <span style={{ color: theme.muted, fontSize: '11px' }}>Min 10 characters · Max 280 characters</span>
                  )}
                  <span style={{ color: recogMessage.length > 280 ? theme.red : theme.muted, fontSize: '11px' }}>{recogMessage.length}/280</span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button type="button" onClick={() => { setShowRecognitionModal(false); setRecogErrors({}); }} style={commonStyles.button(theme, 'secondary')}>
                  Cancel
                </button>
                <button type="button" onClick={handleGiveRecognition} style={commonStyles.button(theme, 'primary')}>
                  Send Recognition 🌟
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
