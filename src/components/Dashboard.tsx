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
        <StatCard animationIndex={0} label="Stories Tested" value={metrics.storiesTested} accentColor={theme.blue} theme={theme} />
        <StatCard animationIndex={1} label="TC Created" value={metrics.tcCreated} accentColor={theme.indigo} theme={theme} />
        <StatCard animationIndex={2} label="TC Executed" value={metrics.tcExecuted} accentColor={theme.indigo} theme={theme} />
        <StatCard animationIndex={3} label="TC Passed" value={metrics.tcPassed} accentColor={theme.green} theme={theme} />
        <StatCard animationIndex={4} label="TC Failed" value={metrics.tcFailed} accentColor={theme.red} theme={theme} />
        <StatCard
          label="Coverage %"
          value={metrics.coveragePct !== null ? `${metrics.coveragePct.toFixed(1)}%` : '—'}
          accentColor={theme.blue}
          isPercentage
          animationIndex={5}
          theme={theme}
        />
        <StatCard
          label="Pass Rate %"
          value={metrics.passRatePct !== null ? `${metrics.passRatePct.toFixed(1)}%` : '—'}
          accentColor={theme.green}
          isPercentage
          animationIndex={6}
          theme={theme}
        />
        <StatCard
          label="Fail Rate %"
          value={metrics.failRatePct !== null ? `${metrics.failRatePct.toFixed(1)}%` : '—'}
          accentColor={theme.red}
          isPercentage
          animationIndex={7}
          theme={theme}
        />
        <StatCard animationIndex={8} label="Total Defects" value={metrics.totalDefects} accentColor={theme.orange} theme={theme} />
        <StatCard animationIndex={9} label="SIT Misses" value={metrics.sitMisses} accentColor={theme.red} theme={theme} />
        <StatCard
          label="SIT Miss Rate %"
          value={metrics.sitMissPct !== null ? `${metrics.sitMissPct.toFixed(1)}%` : '—'}
          accentColor={theme.red}
          isPercentage
          animationIndex={10}
          theme={theme}
        />
        <StatCard animationIndex={11} label="P1 Defects" value={metrics.p1} accentColor={theme.red} theme={theme} />
        <StatCard animationIndex={12} label="P2 Defects" value={metrics.p2} accentColor={theme.orange} theme={theme} />
        <StatCard animationIndex={13} label="P3 Defects" value={metrics.p3} accentColor={theme.amber} theme={theme} />
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
