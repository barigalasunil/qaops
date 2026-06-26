/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { CalendarCheck, Plus, Trash2 } from 'lucide-react';
import { ThemeTokens, commonStyles } from '../theme';
import { AppState, Holiday, User } from '../types';
import { formatDate, generateId, sanitise } from '../utils';
import { Field, Badge } from './Shared';

interface HolidayListProps {
  currentUser: User;
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  showToast: (msg: string, type: 'success' | 'error' | 'warning', duration?: number) => void;
  theme: ThemeTokens;
}

export function HolidayList({ currentUser, appState, setAppState, showToast, theme }: HolidayListProps) {
  const today = useMemo(() => new Date(), []);
  const [filters, setFilters] = useState({ year: String(today.getFullYear()), type: '' });
  const [form, setForm] = useState({
    date: '',
    name: '',
    type: 'Holiday' as Holiday['type'],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const yearOptions = useMemo(() => Array.from({ length: 5 }, (_, index) => today.getFullYear() - 2 + index), [today]);

  const updateForm = (key: keyof typeof form, value: any) => {
    setForm(previous => ({ ...previous, [key]: value }));
    setErrors(previous => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  };

  const filteredHolidays = useMemo(() => (
    [...(appState.holidays || [])]
      .filter(holiday => holiday.year === Number(filters.year))
      .filter(holiday => !filters.type || holiday.type === filters.type)
      .sort((a, b) => a.date.localeCompare(b.date))
  ), [appState.holidays, filters]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const existing = (appState.holidays || []).find(holiday => holiday.date === form.date);
    if (!form.date) nextErrors.date = 'Date is required.';
    if (!form.name.trim()) nextErrors.name = 'Holiday Name is required.';
    else if (form.name.trim().length < 2) nextErrors.name = 'Holiday Name must be at least 2 characters.';
    if (!form.type) nextErrors.type = 'Type is required.';
    if (existing) nextErrors.date = `A holiday is already added for this date (${existing.name}). Remove it first to replace.`;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const holiday: Holiday = {
      id: generateId(),
      date: form.date,
      name: sanitise(form.name.trim()),
      type: form.type,
      year: Number(form.date.slice(0, 4)),
      createdBy: currentUser.username,
      createdAt: new Date().toISOString(),
    };
    setAppState(previous => ({
      ...previous,
      holidays: [...(previous.holidays || []), holiday],
    }));
    setForm({ date: '', name: '', type: 'Holiday' });
    setFilters(previous => ({ ...previous, year: String(holiday.year) }));
    showToast('Holiday added.', 'success');
  };

  const handleDelete = (id: string) => {
    setAppState(previous => ({
      ...previous,
      holidays: (previous.holidays || []).filter(holiday => holiday.id !== id),
    }));
    showToast('Holiday removed.', 'success');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ ...commonStyles.card(theme), display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ minWidth: '160px' }}>
          <Field
            label="Year"
            type="select"
            value={filters.year}
            onChange={(value) => setFilters(previous => ({ ...previous, year: value }))}
            options={yearOptions.map(year => ({ value: String(year), label: String(year) }))}
            theme={theme}
          />
        </div>
        <div style={{ minWidth: '190px' }}>
          <Field
            label="Type"
            type="select"
            value={filters.type}
            onChange={(value) => setFilters(previous => ({ ...previous, type: value }))}
            options={[
              { value: 'Holiday', label: 'Holiday' },
              { value: 'Optional Holiday', label: 'Optional Holiday' },
            ]}
            placeholder="All"
            theme={theme}
          />
        </div>
      </div>

      <div style={commonStyles.card(theme)}>
        <h3 style={{ margin: '0 0 14px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CalendarCheck size={18} style={{ color: theme.blue }} />
          Add Holiday
        </h3>
        <form noValidate onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', alignItems: 'end' }}>
          <Field label="Date" type="date" value={form.date} onChange={(value) => updateForm('date', value)} error={errors.date} required theme={theme} />
          <Field label="Holiday Name" type="text" value={form.name} onChange={(value) => updateForm('name', value)} error={errors.name} required theme={theme} />
          <Field
            label="Type"
            type="select"
            value={form.type}
            onChange={(value) => updateForm('type', value as Holiday['type'])}
            options={[
              { value: 'Holiday', label: 'Holiday' },
              { value: 'Optional Holiday', label: 'Optional Holiday' },
            ]}
            error={errors.type}
            required
            theme={theme}
          />
          <button type="submit" style={commonStyles.button(theme, 'primary')}>
            <Plus size={16} />
            Add Holiday
          </button>
        </form>
      </div>

      <div style={commonStyles.card(theme)}>
        <h3 style={{ margin: '0 0 14px', fontSize: '16px', borderLeft: `4px solid ${theme.blue}`, paddingLeft: '8px' }}>
          Holiday List
        </h3>
        <div style={{ overflowX: 'auto', border: `1px solid ${theme.border}`, borderRadius: '8px' }}>
          <table style={commonStyles.table(theme)}>
            <thead>
              <tr>
                <th style={commonStyles.th(theme)}>Date</th>
                <th style={commonStyles.th(theme)}>Day of Week</th>
                <th style={commonStyles.th(theme)}>Holiday Name</th>
                <th style={commonStyles.th(theme)}>Type</th>
                <th style={commonStyles.th(theme)}>Added By</th>
                <th style={commonStyles.th(theme)}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredHolidays.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...commonStyles.td(theme), padding: '28px', textAlign: 'center', color: theme.muted }}>
                    No holidays match the selected filters.
                  </td>
                </tr>
              ) : filteredHolidays.map(holiday => {
                const date = new Date(`${holiday.date}T00:00:00`);
                return (
                  <tr key={holiday.id}>
                    <td style={{ ...commonStyles.td(theme), whiteSpace: 'nowrap', fontWeight: 700 }}>{formatDate(holiday.date)}</td>
                    <td style={commonStyles.td(theme)}>{date.toLocaleDateString('en-GB', { weekday: 'long' })}</td>
                    <td style={commonStyles.td(theme)}>{holiday.name}</td>
                    <td style={commonStyles.td(theme)}>
                      <Badge label={holiday.type} colorHex={holiday.type === 'Holiday' ? theme.red : theme.amber} theme={theme} />
                    </td>
                    <td style={commonStyles.td(theme)}>{holiday.createdBy}</td>
                    <td style={commonStyles.td(theme)}>
                      <button type="button" onClick={() => handleDelete(holiday.id)} title="Delete holiday" style={{ border: 0, background: 'transparent', color: theme.red, cursor: 'pointer', padding: '4px' }}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
