/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from 'react';
import { ThemeTokens, commonStyles } from '../theme';
import { AppState, User, AuditLogEntry, BackupMetadata } from '../types';
import { generateId } from '../utils';
import { Download, Upload, HardDrive, Clock, Archive, RefreshCw, Trash2, AlertTriangle, Check, Database } from 'lucide-react';

const APP_NAME = "QA Pulse";

interface BackupRestoreProps {
  currentUser: User;
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  showToast: (msg: string, type: 'success' | 'error' | 'warning') => void;
  theme: ThemeTokens;
}

export function BackupRestore({ currentUser, appState, setAppState, showToast, theme }: BackupRestoreProps) {
  const [activeTab, setActiveTab] = useState<'backup' | 'restore'>('backup');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (iso: string): string => {
    const d = new Date(iso);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  };

  const handleBackup = () => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const filename = `qa-hub-backup-${dateStr}.json`;
    const blob = JSON.stringify(appState, null, 2);
    const size = new Blob([blob]).size;

    const backupEntry: BackupMetadata = {
      id: generateId(),
      filename,
      createdAt: now.toISOString(),
      version: '4.0',
      size,
      createdBy: currentUser.username,
    };

    const auditEntry: AuditLogEntry = {
      id: generateId(),
      timestamp: now.toISOString(),
      userId: currentUser.id,
      username: currentUser.username,
      role: currentUser.role,
      action: 'BACKUP',
      details: `Created backup ${filename} (${formatSize(size)})`,
      ipHint: 'Browser session',
    } as AuditLogEntry;

    setAppState((prev) => ({
      ...prev,
      backupMetadata: [...prev.backupMetadata, backupEntry].slice(-50),
      auditLog: [auditEntry, ...(prev.auditLog || [])].slice(0, 500),
    }));

    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(new Blob([blob], { type: 'application/json' }));
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(anchor.href);

    showToast('Backup downloaded successfully.', 'success');
  };

  const handleDeleteBackup = (id: string) => {
    setAppState((prev) => ({
      ...prev,
      backupMetadata: prev.backupMetadata.filter((b) => b.id !== id),
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
  };

  const handleRestore = async () => {
    if (!selectedFile) return;

    try {
      const text = await selectedFile.text();
      const data = JSON.parse(text);

      if (!data.users || !Array.isArray(data.users)) {
        showToast('Invalid backup file: missing users array.', 'error');
        return;
      }

      setShowRestoreConfirm(true);
      return;

      const now = new Date().toISOString();
      const auditEntry: AuditLogEntry = {
        id: generateId(),
        timestamp: now,
        userId: currentUser.id,
        username: currentUser.username,
        role: currentUser.role,
        action: 'RESTORE',
        details: `Restored data from backup ${selectedFile.name}`,
        ipHint: 'Browser session',
      } as AuditLogEntry;

      setAppState({
        ...data,
        backupMetadata: appState.backupMetadata,
        auditLog: [auditEntry, ...(data.auditLog || [])].slice(0, 500),
      });

      showToast('Data restored successfully from backup.', 'success');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      showToast(`Restore failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    }
  };

  const sortedBackups = useMemo(() => {
    return [...(appState.backupMetadata || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [appState.backupMetadata]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Tab selection */}
      <div style={{ display: 'flex', borderBottom: `2px solid ${theme.border}`, gap: '16px' }}>
        {(['backup', 'restore'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '12px 16px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab ? `3px solid ${theme.blue}` : '3px solid transparent',
              color: activeTab === tab ? theme.blue : theme.muted,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              fontSize: '15px',
              textTransform: 'capitalize',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* BACKUP TAB */}
      {activeTab === 'backup' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={commonStyles.card(theme)}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', borderLeft: `4px solid ${theme.blue}`, paddingLeft: '8px' }}>
              <Download size={16} style={{ color: theme.blue }} />
              Create Backup
            </h3>
            <p style={{ fontSize: '13px', color: theme.muted, margin: '0 0 16px 0', lineHeight: 1.5 }}>
              Download a full snapshot of all {APP_NAME} data including users, projects, squads, releases, data entries, defects, timesheets, holidays, custom fields, announcements, leave requests, and audit logs.
            </p>
            <button onClick={handleBackup} style={commonStyles.button(theme, 'primary')}>
              <Download size={15} />
              Download Full Backup
            </button>
          </div>

          <div style={commonStyles.card(theme)}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', borderLeft: `4px solid ${theme.blue}`, paddingLeft: '8px' }}>
              <Archive size={16} style={{ color: theme.blue }} />
              Previous Backups
            </h3>
            {sortedBackups.length === 0 ? (
              <div style={{ padding: '28px', textAlign: 'center', color: theme.muted, fontSize: '13px' }}>
                No backups recorded yet.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={commonStyles.table(theme)}>
                  <thead>
                    <tr style={{ backgroundColor: theme.inputBg }}>
                      <th style={commonStyles.th(theme)}>Filename</th>
                      <th style={commonStyles.th(theme)}>Date</th>
                      <th style={commonStyles.th(theme)}>Size</th>
                      <th style={commonStyles.th(theme)}>Created By</th>
                      <th style={commonStyles.th(theme)}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedBackups.map((backup) => (
                      <tr key={backup.id}>
                        <td style={{ ...commonStyles.td(theme), fontWeight: 600 }}>{backup.filename}</td>
                        <td style={commonStyles.td(theme)}>{formatDate(backup.createdAt)}</td>
                        <td style={commonStyles.td(theme)}>{formatSize(backup.size)}</td>
                        <td style={commonStyles.td(theme)}>{backup.createdBy}</td>
                        <td style={commonStyles.td(theme)}>
                          <button
                            onClick={() => handleDeleteBackup(backup.id)}
                            style={commonStyles.button(theme, 'danger', 'sm')}
                            title="Delete backup metadata"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RESTORE TAB */}
      {activeTab === 'restore' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ ...commonStyles.card(theme), borderLeft: `4px solid ${theme.amber}`, backgroundColor: `${theme.amber}08` }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <AlertTriangle size={24} style={{ color: theme.amber, flexShrink: 0, marginTop: '2px' }} />
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: theme.text, margin: '0 0 8px 0' }}>
                  Warning: Destructive Action
                </h3>
                <p style={{ fontSize: '13px', color: theme.muted, margin: 0, lineHeight: 1.5 }}>
                  Restoring will REPLACE ALL current data with the data from the backup file. This action cannot be undone. Please ensure you have a current backup before proceeding.
                </p>
              </div>
            </div>
          </div>

          <div style={commonStyles.card(theme)}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', borderLeft: `4px solid ${theme.blue}`, paddingLeft: '8px' }}>
              <Upload size={16} style={{ color: theme.blue }} />
              Restore from File
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={commonStyles.label(theme)}>Select Backup File (.json)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileChange}
                  style={{ ...commonStyles.input(theme), padding: '6px 10px' }}
                />
              </div>
              <div>
                <button
                  onClick={handleRestore}
                  disabled={!selectedFile}
                  style={{
                    ...commonStyles.button(theme, 'primary'),
                    opacity: selectedFile ? 1 : 0.5,
                    cursor: selectedFile ? 'pointer' : 'not-allowed',
                  }}
                >
                  <Upload size={15} />
                  Restore Data
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showRestoreConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 12, padding: '32px 28px', width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '18px' }}>Restore Backup?</h3>
            <p style={{ fontSize: '14px', color: theme.text, margin: '0 0 24px' }}>Restoring will REPLACE ALL current data with the data from the backup file. This action cannot be undone. Ensure you have a current backup before proceeding.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setShowRestoreConfirm(false)} style={commonStyles.button(theme, 'secondary')}>Cancel</button>
              <button type="button" onClick={() => { setShowRestoreConfirm(false); handleRestore(); }} style={{ ...commonStyles.button(theme, 'primary'), backgroundColor: theme.red, borderColor: theme.red }}>Restore</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
