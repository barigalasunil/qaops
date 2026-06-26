/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ThemeTokens {
  bg: string;
  surface: string;
  card: string;
  border: string;
  text: string;
  muted: string;
  sidebarBg: string;
  sidebarActive: string;
  inputBg: string;
  blue: string;
  indigo: string;
  green: string;
  amber: string;
  red: string;
  orange: string;
}

export const getTheme = (isDark: boolean): ThemeTokens => {
  return {
    bg: isDark ? '#0f172a' : '#f1f5f9',
    surface: isDark ? '#1e293b' : '#ffffff',
    card: isDark ? '#1e293b' : '#ffffff',
    border: isDark ? '#334155' : '#e2e8f0',
    text: isDark ? '#f8fafc' : '#0f172a',
    muted: isDark ? '#94a3b8' : '#64748b',
    sidebarBg: isDark ? '#0f172a' : '#1e293b',
    sidebarActive: '#334155',
    inputBg: isDark ? '#0f172a' : '#f8fafc',
    
    // Constant accents
    blue: '#3b82f6',
    indigo: '#6366f1',
    green: '#10b981',
    amber: '#f59e0b',
    red: '#ef4444',
    orange: '#f97316'
  };
};

export const commonStyles = {
  card: (theme: ThemeTokens) => ({
    backgroundColor: theme.card,
    borderRadius: '8px',
    border: `1px solid ${theme.border}`,
    padding: '12px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
    transition: 'all 0.2s ease',
  }),
  input: (theme: ThemeTokens) => ({
    padding: '6px 10px',
    borderRadius: '6px',
    border: `1px solid ${theme.border}`,
    backgroundColor: theme.inputBg,
    color: theme.text,
    fontSize: '12px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.2s ease',
  }),
  button: (theme: ThemeTokens, variant: 'primary' | 'secondary' | 'danger' | 'success' = 'primary', size: 'sm' | 'md' = 'md') => {
    let bg = theme.blue;
    let color = '#ffffff';
    let hoverBg = '#2563eb';

    if (variant === 'secondary') {
      bg = theme.border;
      color = theme.text;
      hoverBg = theme.sidebarActive;
    } else if (variant === 'danger') {
      bg = theme.red;
      color = '#ffffff';
      hoverBg = '#dc2626';
    } else if (variant === 'success') {
      bg = theme.green;
      color = '#ffffff';
      hoverBg = '#059669';
    }

    return {
      padding: size === 'sm' ? '4px 8px' : '6px 12px',
      borderRadius: '6px',
      border: 'none',
      fontWeight: 600,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
      fontSize: size === 'sm' ? '11px' : '12px',
      backgroundColor: bg,
      color: color,
      transition: 'opacity 0.15s ease, transform 0.1s ease, background-color 0.15s ease',
      userSelect: 'none' as const,
    };
  },
  label: (theme: ThemeTokens) => ({
    display: 'block',
    fontSize: '11px',
    fontWeight: 600,
    marginBottom: '3px',
    color: theme.text,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.02em',
  }),
  badge: (theme: ThemeTokens, colorHex: string) => ({
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    borderRadius: '999px',
    fontSize: '10px',
    fontWeight: 600,
    backgroundColor: `${colorHex}1a`, // 10% opacity
    color: colorHex,
    border: `1px solid ${colorHex}33`, // 20% opacity
  }),
  table: (theme: ThemeTokens) => ({
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '12px',
  }),
  th: (theme: ThemeTokens) => ({
    padding: '10px 14px',
    borderBottom: `2px solid ${theme.border}`,
    textAlign: 'left' as const,
    fontWeight: 600,
    color: theme.muted,
    fontSize: '10px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0',
    position: 'sticky' as const,
    top: 0,
    zIndex: 2,
    backgroundColor: theme.inputBg,
  }),
  td: (theme: ThemeTokens) => ({
    padding: '11px 14px',
    borderBottom: `1px solid ${theme.border}`,
    color: theme.text,
    fontSize: '12px',
  })
};
