/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Filter, X, Check, AlertTriangle } from 'lucide-react';
import { ThemeTokens, commonStyles } from '../theme';
import { Project, Squad, AppState } from '../types';

// Toast Notification
interface ToastProps {
  toast: { message: string; type: 'success' | 'error' | 'warning'; exiting?: boolean } | null;
  theme: ThemeTokens;
}

export function Toast({ toast, theme }: ToastProps) {
  if (!toast) return null;
  const isSuccess = toast.type === 'success';
  const isWarning = toast.type === 'warning';
  const accent = isSuccess ? theme.green : isWarning ? theme.amber : theme.red;
  return (
    <div
      id="toast-notification"
      className={toast.exiting ? 'toast-out' : 'toast-in'}
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        backgroundColor: theme.surface,
        color: theme.text,
        border: `1px solid ${accent}`,
        borderRadius: '8px',
        padding: '12px 20px',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        zIndex: 9999,
        transition: 'all 0.2s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          backgroundColor: `${accent}20`,
          color: accent,
        }}
      >
        {isSuccess ? <Check size={16} /> : isWarning ? <AlertTriangle size={16} /> : <X size={16} />}
      </div>
      <span style={{ fontSize: '14px', fontWeight: 500 }}>{toast.message}</span>
    </div>
  );
}

// Badge
interface BadgeProps {
  label: string;
  colorHex: string;
  theme: ThemeTokens;
}

export function Badge({ label, colorHex, theme }: BadgeProps) {
  return (
    <span style={commonStyles.badge(theme, colorHex)}>
      {label}
    </span>
  );
}

// Stat Card
interface StatCardProps {
  value: string | number;
  label: string;
  accentColor: string;
  subLabel?: string;
  theme: ThemeTokens;
  isPercentage?: boolean;
  animationIndex?: number;
}

export function StatCard({ value, label, accentColor, subLabel, theme, isPercentage, animationIndex }: StatCardProps) {
  const finalColor = useMemo(() => {
    if (isPercentage && typeof value === 'number') {
      if (value >= 80) return theme.green;
      if (value >= 50) return theme.amber;
      return theme.red;
    }
    if (isPercentage && typeof value === 'string' && value.endsWith('%')) {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        if (num >= 80) return theme.green;
        if (num >= 50) return theme.amber;
        return theme.red;
      }
    }
    return accentColor;
  }, [value, isPercentage, accentColor, theme]);

  return (
    <div style={{
      ...commonStyles.card(theme),
      flex: 1,
      minWidth: '130px',
      padding: '10px 12px',
      animation: animationIndex === undefined ? undefined : 'cardIn 0.25s ease-out both',
      animationDelay: animationIndex === undefined ? undefined : `${animationIndex * 40}ms`,
    }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: theme.muted, textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.02em' }}>
        {label}
      </div>
      <div style={{ fontSize: '20px', fontWeight: 800, color: finalColor, lineHeight: 1 }}>
        {typeof value === 'number' && isPercentage ? `${value.toFixed(1)}%` : value}
      </div>
      {subLabel && (
        <div style={{ fontSize: '11px', color: theme.muted, marginTop: '4px' }}>
          {subLabel}
        </div>
      )}
    </div>
  );
}

// Reusable Form Field
interface FieldProps {
  key?: string;
  label: string;
  type: string;
  value: any;
  onChange: (val: any) => void;
  options?: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  theme: ThemeTokens;
  error?: string;
  disabled?: boolean;
}

export function Field({
  label,
  type,
  value,
  onChange,
  options = [],
  placeholder = '',
  required = false,
  theme,
  error,
  disabled
}: FieldProps) {
  if (type === 'checkbox') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0' }}>
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
          disabled={disabled}
        />
        <label style={{ fontSize: '14px', fontWeight: 500, color: theme.text, cursor: 'pointer' }}>
          {label}
        </label>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <label style={commonStyles.label(theme)}>
        {label} {required && <span style={{ color: theme.red }}>*</span>}
      </label>
      {type === 'select' ? (
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          disabled={disabled}
          style={{
            ...commonStyles.input(theme),
            borderColor: error ? '#ef4444' : theme.border,
            opacity: disabled ? 0.6 : 1,
            cursor: disabled ? 'not-allowed' : 'default',
          }}
        >
          {placeholder && <option value="" disabled={disabled}>{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={value === undefined || value === null ? '' : value}
          onChange={(e) => onChange(type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          style={{
            ...commonStyles.input(theme),
            borderColor: error ? '#ef4444' : theme.border,
            opacity: disabled ? 0.6 : 1,
            cursor: disabled ? 'not-allowed' : 'default',
          }}
        />
      )}
      {error && <span style={{ color: '#ef4444', fontSize: '11px', marginTop: '3px' }}>{error}</span>}
    </div>
  );
}

// Filter Bar
interface FilterBarProps {
  projects: Project[];
  squads: Squad[];
  dataEntries: any[];
  defects: any[];
  releaseNames?: { id: string; name: string }[];
  filters: {
    projectId: string;
    squadId: string;
    release: string;
    month: string;
  };
  setFilters: React.Dispatch<React.SetStateAction<{
    projectId: string;
    squadId: string;
    release: string;
    month: string;
  }>>;
  theme: ThemeTokens;
  showProject?: boolean;
  lockedProjectId?: string;
}

export function FilterBar({ projects, squads, dataEntries, defects, releaseNames = [], filters, setFilters, theme, showProject = true, lockedProjectId }: FilterBarProps) {
  // Extract distinct release names from dataEntries and defects, combined with master releaseNames
  const distinctReleases = useMemo(() => {
    const releasesSet = new Set<string>();
    releaseNames.forEach(r => { if (r.name) releasesSet.add(r.name); });
    dataEntries.forEach(e => { if (e.release) releasesSet.add(e.release); });
    defects.forEach(d => { if (d.release) releasesSet.add(d.release); });
    return Array.from(releasesSet).sort();
  }, [releaseNames, dataEntries, defects]);

  // Extract distinct months YYYY-MM from entries and defects
  const distinctMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    dataEntries.forEach(e => {
      if (e.date && e.date.length >= 7) monthsSet.add(e.date.substring(0, 7));
    });
    defects.forEach(d => {
      if (d.date && d.date.length >= 7) monthsSet.add(d.date.substring(0, 7));
    });
    return Array.from(monthsSet).sort().reverse();
  }, [dataEntries, defects]);

  const hasActiveFilters = filters.projectId || filters.squadId || filters.release || filters.month;

  const handleClear = () => {
    setFilters({ projectId: lockedProjectId || '', squadId: '', release: '', month: '' });
  };

  return (
    <div
      style={{
        ...commonStyles.card(theme),
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        alignItems: 'flex-end',
        marginBottom: '16px',
        padding: '8px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: theme.text, fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>
        <Filter size={14} style={{ color: theme.blue }} />
        <span>Filters</span>
      </div>

      {/* Project Selector */}
      {showProject && <div style={{ flex: 1, minWidth: '130px' }}>
        <label style={{ ...commonStyles.label(theme), fontSize: '10px', marginBottom: '2px' }}>Project</label>
        <select
          value={filters.projectId}
          onChange={(e) => setFilters(prev => ({ ...prev, projectId: e.target.value }))}
          style={commonStyles.input(theme)}
        >
          <option value="">All Projects</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>}

      {/* Squad Selector */}
      <div style={{ flex: 1, minWidth: '130px' }}>
        <label style={{ ...commonStyles.label(theme), fontSize: '10px', marginBottom: '2px' }}>Squad</label>
        <select
          value={filters.squadId}
          onChange={(e) => setFilters(prev => ({ ...prev, squadId: e.target.value }))}
          style={commonStyles.input(theme)}
        >
          <option value="">All Squads</option>
          {squads.filter(s => !filters.projectId || !s.projectId || s.projectId === filters.projectId).map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Release Selector */}
      <div style={{ flex: 1, minWidth: '130px' }}>
        <label style={{ ...commonStyles.label(theme), fontSize: '10px', marginBottom: '2px' }}>Release</label>
        <select
          value={filters.release}
          onChange={(e) => setFilters(prev => ({ ...prev, release: e.target.value }))}
          style={commonStyles.input(theme)}
        >
          <option value="">All Releases</option>
          {distinctReleases.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* Month Selector */}
      <div style={{ flex: 1, minWidth: '130px' }}>
        <label style={{ ...commonStyles.label(theme), fontSize: '10px', marginBottom: '2px' }}>Month</label>
        <select
          value={filters.month}
          onChange={(e) => setFilters(prev => ({ ...prev, month: e.target.value }))}
          style={commonStyles.input(theme)}
        >
          <option value="">All Months</option>
          {distinctMonths.map(m => {
            const [year, month] = m.split('-');
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const label = `${months[parseInt(month) - 1]} ${year}`;
            return <option key={m} value={m}>{label}</option>;
          })}
        </select>
      </div>

      {hasActiveFilters && (
        <button
          onClick={handleClear}
          style={{
            ...commonStyles.button(theme, 'secondary', 'sm'),
            borderColor: theme.red,
            color: theme.red,
          }}
        >
          <X size={12} />
          Clear
        </button>
      )}
    </div>
  );
}

// View-Only Banner
interface ViewOnlyBannerProps {
  theme: ThemeTokens;
}

export function ViewOnlyBanner({ theme }: ViewOnlyBannerProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        backgroundColor: `${theme.blue}15`,
        border: `1px solid ${theme.blue}40`,
        borderRadius: '8px',
        marginBottom: '16px',
        color: theme.blue,
        fontSize: '14px',
        fontWeight: 500,
      }}
    >
      <span style={{ fontSize: '18px' }}>👁</span>
      <span>View only — contact your admin to request edit access</span>
    </div>
  );
}
