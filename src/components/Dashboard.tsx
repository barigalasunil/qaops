/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { ThemeTokens, commonStyles } from '../theme';
import { AppState, User } from '../types';
import { StatCard, FilterBar } from './Shared';

interface DashboardProps {
  currentUser: User;
  appState: AppState;
  theme: ThemeTokens;
}

export function Dashboard({ currentUser, appState, theme }: DashboardProps) {
  const [capacityCollapsed, setCapacityCollapsed] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({
    projectId: currentUser.role === 'superadmin' ? '' : (currentUser.projectId || ''),
    squadId: '',
    release: '',
    month: '',
  });

  // Filter Data Entries and Defects based on criteria
  const filteredData = useMemo(() => {
    let entries = [...appState.dataEntries];
    let defects = [...appState.defects];

    if (filters.projectId) {
      entries = entries.filter((e) => e.projectId === filters.projectId);
      defects = defects.filter((d) => d.projectId === filters.projectId);
    }
    if (filters.squadId) {
      entries = entries.filter((e) => e.squadId === filters.squadId);
      defects = defects.filter((d) => d.squadId === filters.squadId);
    }
    if (filters.release) {
      entries = entries.filter((e) => e.release === filters.release);
      defects = defects.filter((d) => d.release === filters.release);
    }
    if (filters.month) {
      entries = entries.filter((e) => e.date && e.date.substring(0, 7) === filters.month);
      defects = defects.filter((d) => d.date && d.date.substring(0, 7) === filters.month);
    }

    return { entries, defects };
  }, [appState.dataEntries, appState.defects, filters]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const entries = filteredData.entries;
    const defects = filteredData.defects;

    const storiesTested = entries.length;
    let tcCreated = 0;
    let tcExecuted = 0;
    let tcPassed = 0;
    let tcFailed = 0;

    entries.forEach((e) => {
      tcCreated += e.tcCreated || 0;
      tcExecuted += e.tcExecuted || 0;
      tcPassed += e.tcPassed || 0;
      tcFailed += e.tcFailed || 0;
    });

    const totalDefects = defects.length;
    const sitMisses = defects.filter((d) => d.sitMiss).length;
    const p1 = defects.filter((d) => d.priority === 'P1').length;
    const p2 = defects.filter((d) => d.priority === 'P2').length;
    const p3 = defects.filter((d) => d.priority === 'P3').length;

    const coveragePct = tcCreated > 0 ? (tcExecuted / tcCreated) * 100 : null;
    const passRatePct = tcExecuted > 0 ? (tcPassed / tcExecuted) * 100 : null;
    const failRatePct = tcExecuted > 0 ? (tcFailed / tcExecuted) * 100 : null;
    const sitMissPct = totalDefects > 0 ? (sitMisses / totalDefects) * 100 : null;

    return {
      storiesTested,
      tcCreated,
      tcExecuted,
      tcPassed,
      tcFailed,
      totalDefects,
      sitMisses,
      p1,
      p2,
      p3,
      coveragePct,
      passRatePct,
      failRatePct,
      sitMissPct,
    };
  }, [filteredData]);

  const previousMetrics = useMemo(() => {
    if (!filters.month) return null;
    const baseMonth = filters.month || new Date().toISOString().slice(0, 7);
    const date = new Date(`${baseMonth}-01T00:00:00`);
    date.setMonth(date.getMonth() - 1);
    const prevMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const entries = appState.dataEntries
      .filter(entry => entry.date?.slice(0, 7) === prevMonth)
      .filter(entry => !filters.projectId || entry.projectId === filters.projectId)
      .filter(entry => !filters.squadId || entry.squadId === filters.squadId)
      .filter(entry => !filters.release || entry.release === filters.release);
    const defects = appState.defects
      .filter(defect => defect.date?.slice(0, 7) === prevMonth)
      .filter(defect => !filters.projectId || defect.projectId === filters.projectId)
      .filter(defect => !filters.squadId || defect.squadId === filters.squadId)
      .filter(defect => !filters.release || defect.release === filters.release);
    if (!entries.length && !defects.length) return null;
    const created = entries.reduce((sum, entry) => sum + (entry.tcCreated || 0), 0);
    const executed = entries.reduce((sum, entry) => sum + (entry.tcExecuted || 0), 0);
    const passed = entries.reduce((sum, entry) => sum + (entry.tcPassed || 0), 0);
    const failed = entries.reduce((sum, entry) => sum + (entry.tcFailed || 0), 0);
    const sitMisses = defects.filter(defect => defect.sitMiss).length;
    return {
      storiesTested: entries.length,
      tcCreated: created,
      tcExecuted: executed,
      tcPassed: passed,
      tcFailed: failed,
      totalDefects: defects.length,
      sitMisses,
      p1: defects.filter(defect => defect.priority === 'P1').length,
      p2: defects.filter(defect => defect.priority === 'P2').length,
      p3: defects.filter(defect => defect.priority === 'P3').length,
      coveragePct: created > 0 ? (executed / created) * 100 : null,
      passRatePct: executed > 0 ? (passed / executed) * 100 : null,
      failRatePct: executed > 0 ? (failed / executed) * 100 : null,
      sitMissPct: defects.length > 0 ? (sitMisses / defects.length) * 100 : null,
    };
  }, [appState.dataEntries, appState.defects, filters]);

  const trend = (key: keyof typeof metrics, lowerIsBetter = false) => {
    if (!filters.month || !previousMetrics) return { label: '— No previous data', color: theme.muted };
    const current = metrics[key];
    const previous = previousMetrics[key];
    if (typeof current !== 'number' || typeof previous !== 'number' || !previous) return { label: '— No previous data', color: theme.muted };
    const delta = ((current - previous) / Math.abs(previous)) * 100;
    if (delta === 0) return { label: '→ No change', color: theme.muted };
    const improved = lowerIsBetter ? delta < 0 : delta > 0;
    return { label: `${delta > 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(1)}% vs last month`, color: improved ? theme.green : theme.red };
  };

  const releaseHealth = useMemo(() => {
    const releases = Array.from(new Set([...appState.dataEntries.map(entry => entry.release), ...appState.defects.map(defect => defect.release)].filter(Boolean)));
    return releases.map(release => {
      const entries = appState.dataEntries.filter(entry => entry.release === release);
      const defects = appState.defects.filter(defect => defect.release === release);
      const created = entries.reduce((sum, entry) => sum + (entry.tcCreated || 0), 0);
      const executed = entries.reduce((sum, entry) => sum + (entry.tcExecuted || 0), 0);
      const passed = entries.reduce((sum, entry) => sum + (entry.tcPassed || 0), 0);
      const coverage = created ? (executed / created) * 100 : 0;
      const passRate = executed ? (passed / executed) * 100 : 0;
      const sitRate = defects.length ? (defects.filter(defect => defect.sitMiss).length / defects.length) * 100 : 0;
      const p1 = defects.some(defect => defect.priority === 'P1');
      const score = (coverage >= 80 ? 30 : 0) + (passRate >= 90 ? 30 : 0) + (sitRate < 10 ? 20 : 0) + (!p1 ? 20 : 0);
      return { release, score };
    }).sort((a, b) => b.score - a.score);
  }, [appState.dataEntries, appState.defects]);

  const squadCapacity = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return appState.squads
      .filter(squad => currentUser.role === 'superadmin' || squad.projectId === currentUser.projectId)
      .map(squad => {
      const members = appState.users
        .filter(user => user.squadId === squad.id)
        .filter(user => currentUser.role !== 'lead' || user.reportsTo === currentUser.id || (currentUser.directReports || []).includes(user.id));
      return {
        squad,
        members: members.map(member => {
          const entry = appState.timesheetEntries.find(item => item.userId === member.id && item.month === today.slice(0, 7));
          const day = entry?.workingDays.find(item => item.date === today);
          const status = day?.isStatusSet ? day.status : 'Not filled';
          return { member, status, location: day?.workLocation || '—' };
        }),
      };
    }).filter(item => item.members.length);
  }, [appState.squads, appState.timesheetEntries, appState.users, currentUser]);

  const renderCapacity = () => {
    const todayLabel = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    return (
      <div style={commonStyles.card(theme)}>
        <h3 style={{ fontSize: '13px', fontWeight: 700, color: theme.text, marginBottom: '10px', borderLeft: `3px solid ${theme.amber}`, paddingLeft: '6px', textTransform: 'uppercase' }}>Today's Squad Capacity · {todayLabel}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
          {squadCapacity.length ? squadCapacity.map(group => {
            const collapsed = capacityCollapsed.has(group.squad.id);
            const available = group.members.filter(({ status }) => status === 'Working' || status === 'WFH').length;
            const leave = group.members.filter(({ status }) => status === 'Leave' || status === 'Holiday').length;
            const unknown = group.members.filter(({ status }) => status === 'Not filled').length;
            return (
              <div key={group.squad.id} style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '10px', backgroundColor: theme.inputBg }}>
                <button type="button" onClick={() => setCapacityCollapsed(previous => { const next = new Set(previous); next.has(group.squad.id) ? next.delete(group.squad.id) : next.add(group.squad.id); return next; })} style={{ width: '100%', border: 0, background: 'transparent', color: theme.text, display: 'flex', justifyContent: 'space-between', cursor: 'pointer', fontWeight: 900, padding: 0 }}>
                  <span>{group.squad.name}</span><span>{collapsed ? '+' : '-'}</span>
                </button>
                {!collapsed && <div style={{ display: 'grid', gap: '7px', marginTop: '10px' }}>{group.members.map(({ member, status, location }) => {
                  const color = status === 'Working' || status === 'WFH' ? '#22c55e' : status === 'Leave' || status === 'Holiday' ? '#ef4444' : status === 'Training' ? '#f59e0b' : '#64748b';
                  return <div key={member.id} style={{ display: 'grid', gridTemplateColumns: '1fr 92px 70px', gap: '8px', alignItems: 'center', fontSize: '12px' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontWeight: 700 }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color }} />{member.username}</span><span style={{ color: status === 'Not filled' ? theme.muted : theme.text, fontStyle: status === 'Not filled' ? 'italic' : 'normal' }}>{status}</span><span style={{ color: theme.muted }}>{status === 'Working' || status === 'WFH' ? location : '—'}</span></div>;
                })}</div>}
                <div style={{ marginTop: '10px', color: theme.muted, fontSize: '11px', fontWeight: 800 }}>{available} available · {leave} on leave · {unknown} unknown</div>
              </div>
            );
          }) : <div style={{ color: theme.muted, fontSize: '12px' }}>No squad assignments yet.</div>}
        </div>
      </div>
    );
  };

  // Project-wise aggregation
  const projectBreakdown = useMemo(() => {
    const breakdownMap = new Map<string, {
      id: string;
      name: string;
      stories: number;
      tcCreated: number;
      tcExecuted: number;
      tcPassed: number;
      tcFailed: number;
      defects: number;
      sitMisses: number;
    }>();

    // Init projects
    appState.projects.forEach((p) => {
      breakdownMap.set(p.id, {
        id: p.id,
        name: p.name,
        stories: 0,
        tcCreated: 0,
        tcExecuted: 0,
        tcPassed: 0,
        tcFailed: 0,
        defects: 0,
        sitMisses: 0,
      });
    });

    filteredData.entries.forEach((e) => {
      let data = breakdownMap.get(e.projectId);
      if (!data) {
        // dynamic fallback if project was deleted
        data = { id: e.projectId, name: 'Unknown Project', stories: 0, tcCreated: 0, tcExecuted: 0, tcPassed: 0, tcFailed: 0, defects: 0, sitMisses: 0 };
        breakdownMap.set(e.projectId, data);
      }
      data.stories += 1;
      data.tcCreated += e.tcCreated || 0;
      data.tcExecuted += e.tcExecuted || 0;
      data.tcPassed += e.tcPassed || 0;
      data.tcFailed += e.tcFailed || 0;
    });

    filteredData.defects.forEach((d) => {
      let data = breakdownMap.get(d.projectId);
      if (!data) {
        data = { id: d.projectId, name: 'Unknown Project', stories: 0, tcCreated: 0, tcExecuted: 0, tcPassed: 0, tcFailed: 0, defects: 0, sitMisses: 0 };
        breakdownMap.set(d.projectId, data);
      }
      data.defects += 1;
      if (d.sitMiss) data.sitMisses += 1;
    });

    return Array.from(breakdownMap.values()).filter(p => p.stories > 0 || p.defects > 0);
  }, [appState.projects, filteredData]);

  // Squad-wise aggregation
  const squadBreakdown = useMemo(() => {
    const breakdownMap = new Map<string, {
      id: string;
      name: string;
      stories: number;
      tcCreated: number;
      tcExecuted: number;
      tcPassed: number;
      tcFailed: number;
      defects: number;
      sitMisses: number;
    }>();

    appState.squads.forEach((s) => {
      breakdownMap.set(s.id, {
        id: s.id,
        name: s.name,
        stories: 0,
        tcCreated: 0,
        tcExecuted: 0,
        tcPassed: 0,
        tcFailed: 0,
        defects: 0,
        sitMisses: 0,
      });
    });

    filteredData.entries.forEach((e) => {
      let data = breakdownMap.get(e.squadId);
      if (!data) {
        data = { id: e.squadId, name: 'Unknown Squad', stories: 0, tcCreated: 0, tcExecuted: 0, tcPassed: 0, tcFailed: 0, defects: 0, sitMisses: 0 };
        breakdownMap.set(e.squadId, data);
      }
      data.stories += 1;
      data.tcCreated += e.tcCreated || 0;
      data.tcExecuted += e.tcExecuted || 0;
      data.tcPassed += e.tcPassed || 0;
      data.tcFailed += e.tcFailed || 0;
    });

    filteredData.defects.forEach((d) => {
      let data = breakdownMap.get(d.squadId);
      if (!data) {
        data = { id: d.squadId, name: 'Unknown Squad', stories: 0, tcCreated: 0, tcExecuted: 0, tcPassed: 0, tcFailed: 0, defects: 0, sitMisses: 0 };
        breakdownMap.set(d.squadId, data);
      }
      data.defects += 1;
      if (d.sitMiss) data.sitMisses += 1;
    });

    return Array.from(breakdownMap.values()).filter(s => s.stories > 0 || s.defects > 0);
  }, [appState.squads, filteredData]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Top filter bar */}
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

      {/* Metrics Cards Grid */}
      <div key={JSON.stringify(filters)} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
        <StatCard animationIndex={0} label="Stories Tested" value={metrics.storiesTested} accentColor={theme.blue} subLabel={trend('storiesTested').label} subLabelColor={trend('storiesTested').color} theme={theme} />
        <StatCard animationIndex={1} label="TC Created" value={metrics.tcCreated} accentColor={theme.indigo} subLabel={trend('tcCreated').label} subLabelColor={trend('tcCreated').color} theme={theme} />
        <StatCard animationIndex={2} label="TC Executed" value={metrics.tcExecuted} accentColor={theme.indigo} subLabel={trend('tcExecuted').label} subLabelColor={trend('tcExecuted').color} theme={theme} />
        <StatCard animationIndex={3} label="TC Passed" value={metrics.tcPassed} accentColor={theme.green} subLabel={trend('tcPassed').label} subLabelColor={trend('tcPassed').color} theme={theme} />
        <StatCard animationIndex={4} label="TC Failed" value={metrics.tcFailed} accentColor={theme.red} subLabel={trend('tcFailed', true).label} subLabelColor={trend('tcFailed', true).color} theme={theme} />
        <StatCard
          label="Coverage %"
          value={metrics.coveragePct !== null ? `${metrics.coveragePct.toFixed(1)}%` : '—'}
          accentColor={theme.blue}
          isPercentage
          animationIndex={5}
          subLabel={trend('coveragePct').label}
          subLabelColor={trend('coveragePct').color}
          theme={theme}
        />
        <StatCard
          label="Pass Rate %"
          value={metrics.passRatePct !== null ? `${metrics.passRatePct.toFixed(1)}%` : '—'}
          accentColor={theme.green}
          isPercentage
          animationIndex={6}
          subLabel={trend('passRatePct').label}
          subLabelColor={trend('passRatePct').color}
          theme={theme}
        />
        <StatCard
          label="Fail Rate %"
          value={metrics.failRatePct !== null ? `${metrics.failRatePct.toFixed(1)}%` : '—'}
          accentColor={theme.red}
          isPercentage
          animationIndex={7}
          subLabel={trend('failRatePct', true).label}
          subLabelColor={trend('failRatePct', true).color}
          theme={theme}
        />
        <StatCard animationIndex={8} label="Total Defects" value={metrics.totalDefects} accentColor={theme.orange} subLabel={trend('totalDefects', true).label} subLabelColor={trend('totalDefects', true).color} theme={theme} />
        <StatCard animationIndex={9} label="SIT Misses" value={metrics.sitMisses} accentColor={theme.red} subLabel={trend('sitMisses', true).label} subLabelColor={trend('sitMisses', true).color} theme={theme} />
        <StatCard
          label="SIT Miss Rate %"
          value={metrics.sitMissPct !== null ? `${metrics.sitMissPct.toFixed(1)}%` : '—'}
          accentColor={theme.red}
          isPercentage
          animationIndex={10}
          subLabel={trend('sitMissPct', true).label}
          subLabelColor={trend('sitMissPct', true).color}
          theme={theme}
        />
        <StatCard animationIndex={11} label="P1 Defects" value={metrics.p1} accentColor={theme.red} subLabel={trend('p1', true).label} subLabelColor={trend('p1', true).color} theme={theme} />
        <StatCard animationIndex={12} label="P2 Defects" value={metrics.p2} accentColor={theme.orange} subLabel={trend('p2', true).label} subLabelColor={trend('p2', true).color} theme={theme} />
        <StatCard animationIndex={13} label="P3 Defects" value={metrics.p3} accentColor={theme.amber} subLabel={trend('p3', true).label} subLabelColor={trend('p3', true).color} theme={theme} />
      </div>

      <div style={commonStyles.card(theme)}>
        <h3 style={{ fontSize: '13px', fontWeight: 700, color: theme.text, marginBottom: '10px', borderLeft: `3px solid ${theme.green}`, paddingLeft: '6px', textTransform: 'uppercase' }}>Release Health</h3>
        <div style={{ display: 'grid', gap: '8px' }}>
          {releaseHealth.length ? releaseHealth.map(item => {
            const color = item.score >= 80 ? theme.green : item.score >= 50 ? theme.amber : theme.red;
            const label = item.score >= 80 ? 'Healthy' : item.score >= 50 ? 'At Risk' : 'Critical';
            return <div key={item.release} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 80px', gap: '10px', alignItems: 'center', fontSize: '12px' }}><b>{item.release}</b><div style={{ height: '10px', backgroundColor: theme.inputBg, borderRadius: '999px', overflow: 'hidden' }}><div style={{ width: `${item.score}%`, height: '100%', backgroundColor: color }} /></div><span style={{ color, fontWeight: 800 }}>{label}</span></div>;
          }) : <div style={{ color: theme.muted, fontSize: '12px' }}>No release data yet.</div>}
        </div>
      </div>

      {/* Squad-wise Breakdown Table */}
      <div style={commonStyles.card(theme)}>
        <h3 style={{ fontSize: '13px', fontWeight: 700, color: theme.text, marginBottom: '10px', borderLeft: `3px solid ${theme.indigo}`, paddingLeft: '6px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
          Squad-wise Breakdown
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={commonStyles.table(theme)}>
            <thead>
              <tr style={{ backgroundColor: theme.inputBg }}>
                <th style={commonStyles.th(theme)}>Squad</th>
                <th style={commonStyles.th(theme)}>Stories</th>
                <th style={commonStyles.th(theme)}>TC Created</th>
                <th style={commonStyles.th(theme)}>TC Executed</th>
                <th style={commonStyles.th(theme)}>TC Passed</th>
                <th style={commonStyles.th(theme)}>TC Failed</th>
                <th style={commonStyles.th(theme)}>Coverage %</th>
                <th style={commonStyles.th(theme)}>Pass %</th>
                <th style={commonStyles.th(theme)}>Defects</th>
                <th style={commonStyles.th(theme)}>SIT Misses</th>
              </tr>
            </thead>
            <tbody>
              {squadBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ ...commonStyles.td(theme), textAlign: 'center', color: theme.muted, padding: '16px' }}>
                    No squad entries found for current filters.
                  </td>
                </tr>
              ) : (
                squadBreakdown.map((row, index) => {
                  const cov = row.tcCreated > 0 ? (row.tcExecuted / row.tcCreated) * 100 : null;
                  const pass = row.tcExecuted > 0 ? (row.tcPassed / row.tcExecuted) * 100 : null;
                  return (
                    <tr key={row.id} style={{ backgroundColor: index % 2 === 1 ? theme.inputBg : 'transparent' }}>
                      <td style={{ ...commonStyles.td(theme), fontWeight: 700 }}>{row.name}</td>
                      <td style={commonStyles.td(theme)}>{row.stories}</td>
                      <td style={commonStyles.td(theme)}>{row.tcCreated}</td>
                      <td style={commonStyles.td(theme)}>{row.tcExecuted}</td>
                      <td style={commonStyles.td(theme)}>{row.tcPassed}</td>
                      <td style={commonStyles.td(theme)}>{row.tcFailed}</td>
                      <td style={{ ...commonStyles.td(theme), fontWeight: 600, color: cov !== null ? (cov >= 80 ? theme.green : cov >= 50 ? theme.amber : theme.red) : theme.text }}>
                        {cov !== null ? `${cov.toFixed(1)}%` : '—'}
                      </td>
                      <td style={{ ...commonStyles.td(theme), fontWeight: 600, color: pass !== null ? (pass >= 80 ? theme.green : pass >= 50 ? theme.amber : theme.red) : theme.text }}>
                        {pass !== null ? `${pass.toFixed(1)}%` : '—'}
                      </td>
                      <td style={commonStyles.td(theme)}>{row.defects}</td>
                      <td style={{ ...commonStyles.td(theme), color: row.sitMisses > 0 ? theme.red : theme.text, fontWeight: row.sitMisses > 0 ? 700 : 'normal' }}>
                        {row.sitMisses}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {currentUser.role !== 'member' && renderCapacity()}

      {/* Project-wise Breakdown Table */}
      <div style={commonStyles.card(theme)}>
        <h3 style={{ fontSize: '13px', fontWeight: 700, color: theme.text, marginBottom: '10px', borderLeft: `3px solid ${theme.blue}`, paddingLeft: '6px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
          Project-wise Breakdown
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={commonStyles.table(theme)}>
            <thead>
              <tr style={{ backgroundColor: theme.inputBg }}>
                <th style={commonStyles.th(theme)}>Project</th>
                <th style={commonStyles.th(theme)}>Stories</th>
                <th style={commonStyles.th(theme)}>TC Created</th>
                <th style={commonStyles.th(theme)}>TC Executed</th>
                <th style={commonStyles.th(theme)}>TC Passed</th>
                <th style={commonStyles.th(theme)}>TC Failed</th>
                <th style={commonStyles.th(theme)}>Coverage %</th>
                <th style={commonStyles.th(theme)}>Pass %</th>
                <th style={commonStyles.th(theme)}>Defects</th>
                <th style={commonStyles.th(theme)}>SIT Misses</th>
              </tr>
            </thead>
            <tbody>
              {projectBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ ...commonStyles.td(theme), textAlign: 'center', color: theme.muted, padding: '16px' }}>
                    No project entries found for current filters.
                  </td>
                </tr>
              ) : (
                projectBreakdown.map((row, index) => {
                  const cov = row.tcCreated > 0 ? (row.tcExecuted / row.tcCreated) * 100 : null;
                  const pass = row.tcExecuted > 0 ? (row.tcPassed / row.tcExecuted) * 100 : null;
                  return (
                    <tr key={row.id} style={{ backgroundColor: index % 2 === 1 ? theme.inputBg : 'transparent' }}>
                      <td style={{ ...commonStyles.td(theme), fontWeight: 700 }}>{row.name}</td>
                      <td style={commonStyles.td(theme)}>{row.stories}</td>
                      <td style={commonStyles.td(theme)}>{row.tcCreated}</td>
                      <td style={commonStyles.td(theme)}>{row.tcExecuted}</td>
                      <td style={commonStyles.td(theme)}>{row.tcPassed}</td>
                      <td style={commonStyles.td(theme)}>{row.tcFailed}</td>
                      <td style={{ ...commonStyles.td(theme), fontWeight: 600, color: cov !== null ? (cov >= 80 ? theme.green : cov >= 50 ? theme.amber : theme.red) : theme.text }}>
                        {cov !== null ? `${cov.toFixed(1)}%` : '—'}
                      </td>
                      <td style={{ ...commonStyles.td(theme), fontWeight: 600, color: pass !== null ? (pass >= 80 ? theme.green : pass >= 50 ? theme.amber : theme.red) : theme.text }}>
                        {pass !== null ? `${pass.toFixed(1)}%` : '—'}
                      </td>
                      <td style={commonStyles.td(theme)}>{row.defects}</td>
                      <td style={{ ...commonStyles.td(theme), color: row.sitMisses > 0 ? theme.red : theme.text, fontWeight: row.sitMisses > 0 ? 700 : 'normal' }}>
                        {row.sitMisses}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
