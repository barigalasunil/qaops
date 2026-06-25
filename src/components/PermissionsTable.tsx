/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { UserPermissions } from '../types';
import { ThemeTokens, commonStyles } from '../theme';

interface PermissionsTableProps {
  value: UserPermissions;
  onChange?: (updated: UserPermissions) => void;
  readOnly?: boolean;
  theme: ThemeTokens;
}

const PAGE_OPTIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'dataEntry', label: 'Data Entry' },
  { id: 'defects', label: 'Defects' },
  { id: 'releases', label: 'Releases' },
  { id: 'timesheet', label: 'Timesheet' },
  { id: 'export', label: 'Export' },
  { id: 'settings', label: 'Settings' },
] as const;

export function PermissionsTable({ value, onChange, readOnly = false, theme }: PermissionsTableProps) {
  const handleRadioChange = (pageId: keyof UserPermissions, optionValue: 'edit' | 'view' | 'none') => {
    if (readOnly || !onChange) return;
    onChange({
      ...value,
      [pageId]: optionValue,
    });
  };

  const getOptionColor = (opt: 'edit' | 'view' | 'none', isSelected: boolean) => {
    if (!isSelected) return theme.muted;
    if (opt === 'edit') return theme.green;
    if (opt === 'view') return theme.blue;
    return theme.muted;
  };

  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${theme.border}`, borderRadius: '6px' }}>
      <table style={{ ...commonStyles.table(theme), margin: 0, width: '100%' }}>
        <thead>
          <tr style={{ backgroundColor: theme.inputBg }}>
            <th style={{ ...commonStyles.th(theme), width: '40%', padding: '12px', textAlign: 'left' }}>Page</th>
            <th style={{ ...commonStyles.th(theme), width: '20%', padding: '12px', textAlign: 'center' }}>Edit</th>
            <th style={{ ...commonStyles.th(theme), width: '20%', padding: '12px', textAlign: 'center' }}>View</th>
            <th style={{ ...commonStyles.th(theme), width: '20%', padding: '12px', textAlign: 'center' }}>None</th>
          </tr>
        </thead>
        <tbody>
          {PAGE_OPTIONS.map((page) => {
            const currentValue = value?.[page.id] || 'none';
            return (
              <tr key={page.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                <td style={{ ...commonStyles.td(theme), fontWeight: 600, padding: '12px', textAlign: 'left' }}>
                  {page.label}
                </td>
                {(['edit', 'view', 'none'] as const).map((opt) => {
                  const id = `perm-${page.id}-${opt}`;
                  const isSelected = currentValue === opt;
                  const optionColor = getOptionColor(opt, isSelected);

                  return (
                    <td
                      key={opt}
                      style={{
                        ...commonStyles.td(theme),
                        padding: '12px',
                        textAlign: 'center',
                        backgroundColor: isSelected ? `${optionColor}0a` : 'transparent',
                      }}
                    >
                      <label
                        htmlFor={id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          cursor: readOnly ? 'default' : 'pointer',
                          fontSize: '12px',
                          color: optionColor,
                          fontWeight: isSelected ? 600 : 400,
                          width: '100%',
                          minHeight: '24px',
                        }}
                      >
                        <input
                          type="radio"
                          id={id}
                          name={`radio-${page.id}`}
                          checked={isSelected}
                          disabled={readOnly}
                          onChange={() => handleRadioChange(page.id, opt)}
                          style={{
                            cursor: readOnly ? 'default' : 'pointer',
                            accentColor: opt === 'edit' ? theme.green : opt === 'view' ? theme.blue : theme.muted,
                          }}
                        />
                        <span style={{ textTransform: 'capitalize' }}>{opt}</span>
                      </label>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
