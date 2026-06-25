/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  LayoutDashboard,
  Database,
  AlertTriangle,
  Layers,
  Clock,
  Download,
  Settings as SettingsIcon,
  LogOut,
  Sun,
  Moon
} from 'lucide-react';
import { ThemeTokens } from '../theme';
import { User } from '../types';
import { getEffectivePermissions } from '../utils';

interface SidebarProps {
  currentUser: User;
  onLogout: () => void;
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  isDark: boolean;
  setIsDark: (dark: boolean) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  theme: ThemeTokens;
}

export function Sidebar({
  currentUser,
  onLogout,
  currentTab,
  setCurrentTab,
  isDark,
  setIsDark,
  collapsed,
  setCollapsed,
  theme
}: SidebarProps) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['superadmin', 'admin', 'lead'] },
    { id: 'dataEntry', label: 'Data Entry', icon: Database, roles: ['superadmin', 'admin', 'lead', 'member'] },
    { id: 'defects', label: 'Defects', icon: AlertTriangle, roles: ['superadmin', 'admin', 'lead', 'member'] },
    { id: 'releases', label: 'Releases', icon: Layers, roles: ['superadmin', 'admin', 'lead', 'member'] },
    { id: 'timesheet', label: 'Timesheet', icon: Clock, roles: ['superadmin', 'admin', 'lead', 'member'] },
    { id: 'export', label: 'Export', icon: Download, roles: ['superadmin', 'admin', 'lead'] },
    { id: 'settings', label: 'Settings', icon: SettingsIcon, roles: ['superadmin', 'admin'] },
  ];

  const visibleItems = navItems.filter((item) => {
    const permissions = getEffectivePermissions(currentUser);
    return permissions[item.id as keyof typeof permissions] !== 'none';
  });

  const roleColor = {
    superadmin: '#f59e0b',
    admin: '#6366f1',
    lead: '#3b82f6',
    member: '#22c55e',
  }[currentUser.role];

  return (
    <div
      style={{
        width: collapsed ? '56px' : '220px',
        backgroundColor: theme.sidebarBg,
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        height: '100vh',
        boxSizing: 'border-box',
        zIndex: 50,
        flexShrink: 0,
        boxShadow: '4px 0 10px rgba(0, 0, 0, 0.15)',
      }}
    >
      {/* Top logo */}
      <div>
        <div
          className="sidebar-logo"
          role="button"
          tabIndex={0}
          title="Toggle sidebar"
          onClick={() => setCollapsed(!collapsed)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') setCollapsed(!collapsed);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            padding: '12px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            height: '48px',
            boxSizing: 'border-box',
            cursor: 'pointer',
            transition: 'opacity 0.15s ease',
          }}
        >
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '6px',
                  backgroundColor: theme.blue,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '14px',
                  color: '#ffffff',
                }}
              >
                Q
              </div>
              <span style={{ fontWeight: 800, fontSize: '15px', tracking: '-0.025em', color: '#ffffff' }}>
                QA Hub
              </span>
              <span style={{ fontSize: '9px', backgroundColor: `${theme.indigo}44`, color: theme.indigo, padding: '1px 3px', borderRadius: '4px', fontWeight: 600 }}>
                v4
              </span>
            </div>
          )}
          {collapsed && (
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                backgroundColor: roleColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '14px',
                color: '#ffffff',
              }}
            >
              Q
            </div>
          )}
        </div>

        {/* Navigation Items */}
        <div style={{ padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: collapsed ? '0' : '10px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: isActive ? theme.sidebarActive : 'transparent',
                  color: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.7)',
                  border: 'none',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  fontSize: '12px',
                  fontWeight: isActive ? 700 : 500,
                }}
                title={collapsed ? item.label : undefined}
              >
                <Icon size={18} style={{ flexShrink: 0, color: isActive ? theme.blue : 'rgba(255, 255, 255, 0.6)' }} />
                <span style={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : 'auto', overflow: 'hidden', whiteSpace: 'nowrap', transition: 'opacity 0.2s ease' }}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer (Theme Toggle + User Session) */}
      <div
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '8px 4px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        {/* Theme Toggle */}
        <button
          onClick={() => setIsDark(!isDark)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: '8px',
            padding: '6px 10px',
            borderRadius: '6px',
            color: 'rgba(255, 255, 255, 0.7)',
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: '11px',
            width: '100%',
            transition: 'all 0.15s ease',
          }}
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {isDark ? (
            <>
              <Sun size={14} style={{ color: theme.amber, flexShrink: 0 }} />
              {!collapsed && <span>Light Mode</span>}
            </>
          ) : (
            <>
              <Moon size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
              {!collapsed && <span>Dark Mode</span>}
            </>
          )}
        </button>

        {/* User Info & Sign-out */}
        <div
          style={{
            display: 'flex',
            flexDirection: collapsed ? 'column' : 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 8px',
            borderRadius: '6px',
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            gap: collapsed ? '8px' : '4px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', width: collapsed ? 'auto' : '80%' }}>
            {/* Avatar badge */}
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: theme.blue,
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '11px',
                flexShrink: 0,
              }}
            >
              {currentUser.username.substring(0, 2).toUpperCase()}
            </div>
            {!collapsed && (
              <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                  {currentUser.username}
                </span>
                <span style={{ fontSize: '10px', color: roleColor, textTransform: 'capitalize', fontWeight: 700 }}>
                  {currentUser.role === 'superadmin' ? 'Super Admin' : currentUser.role}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={onLogout}
            style={{
              padding: '4px',
              borderRadius: '4px',
              backgroundColor: 'transparent',
              color: 'rgba(255, 255, 255, 0.6)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            title="Sign Out"
          >
            <LogOut size={14} style={{ color: theme.red }} />
          </button>
        </div>
      </div>
    </div>
  );
}
