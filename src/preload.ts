/**
 * Preload Script
 *
 * Exposes safe APIs to the renderer process
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, SyncSession, SyncResult } from './mls/types';

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: AppSettings): Promise<void> =>
    ipcRenderer.invoke('save-settings', settings),

  // Sync history
  getSyncHistory: (): Promise<SyncSession[]> => ipcRenderer.invoke('get-sync-history'),
  addSyncSession: (session: SyncSession): Promise<void> =>
    ipcRenderer.invoke('add-sync-session', session),
  clearSyncHistory: (): Promise<void> => ipcRenderer.invoke('clear-sync-history'),

  // Dialogs
  selectDirectory: (): Promise<string | null> => ipcRenderer.invoke('select-directory'),

  // Notifications
  showNotification: (title: string, body: string): Promise<void> =>
    ipcRenderer.invoke('show-notification', title, body),

  // App info
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('open-external', url),

  // Sync control
  startSync: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('start-sync'),
  stopSync: (): Promise<void> => ipcRenderer.invoke('stop-sync'),
  testSync: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('test-sync'),

  // Test VLS login
  testVlsLogin: (credentials: { email: string; password: string }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('test-vls-login', credentials),

  // Auto-update controls
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: (): Promise<void> => ipcRenderer.invoke('download-update'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('install-update'),

  // Auto-update events
  onUpdateAvailable: (callback: (info: { version: string; releaseNotes?: string }) => void): void => {
    ipcRenderer.on('update-available', (_, info) => callback(info));
  },
  onUpdateDownloadProgress: (callback: (progress: { percent: number; transferred: number; total: number }) => void): void => {
    ipcRenderer.on('update-download-progress', (_, progress) => callback(progress));
  },
  onUpdateDownloaded: (callback: (info: { version: string }) => void): void => {
    ipcRenderer.on('update-downloaded', (_, info) => callback(info));
  },

  // Sync events (from main to renderer)
  onTriggerSync: (callback: () => void): void => {
    ipcRenderer.on('trigger-sync', callback);
  },

  // Sync progress events (renderer will use these to update UI)
  onSyncProgress: (
    callback: (progress: { current: number; total: number; address: string }) => void
  ): void => {
    ipcRenderer.on('sync-progress', (_, progress) => callback(progress));
  },

  onSyncResult: (callback: (result: SyncResult) => void): void => {
    ipcRenderer.on('sync-result', (_, result) => callback(result));
  },

  onSyncComplete: (callback: (session: SyncSession) => void): void => {
    ipcRenderer.on('sync-complete', (_, session) => callback(session));
  },

  onSyncError: (callback: (error: string) => void): void => {
    ipcRenderer.on('sync-error', (_, error) => callback(error));
  },

  // Main process log forwarding — shows in DevTools console
  onMainLog: (callback: (entry: { level: string; message: string; timestamp: string }) => void): void => {
    ipcRenderer.on('main-log', (_, entry) => callback(entry));
  },
});

// Type declaration for TypeScript
declare global {
  interface Window {
    electronAPI: {
      getSettings: () => Promise<AppSettings>;
      saveSettings: (settings: AppSettings) => Promise<void>;
      getSyncHistory: () => Promise<SyncSession[]>;
      addSyncSession: (session: SyncSession) => Promise<void>;
      clearSyncHistory: () => Promise<void>;
      selectDirectory: () => Promise<string | null>;
      showNotification: (title: string, body: string) => Promise<void>;
      getAppVersion: () => Promise<string>;
      openExternal: (url: string) => Promise<void>;
      startSync: () => Promise<{ success: boolean; error?: string }>;
      stopSync: () => Promise<void>;
      testSync: () => Promise<{ success: boolean; error?: string }>;
      testVlsLogin: (credentials: { email: string; password: string }) => Promise<{ success: boolean; error?: string }>;
      checkForUpdates: () => Promise<void>;
      downloadUpdate: () => Promise<void>;
      installUpdate: () => Promise<void>;
      onUpdateAvailable: (callback: (info: { version: string; releaseNotes?: string }) => void) => void;
      onUpdateDownloadProgress: (callback: (progress: { percent: number; transferred: number; total: number }) => void) => void;
      onUpdateDownloaded: (callback: (info: { version: string }) => void) => void;
      onTriggerSync: (callback: () => void) => void;
      onSyncProgress: (
        callback: (progress: { current: number; total: number; address: string }) => void
      ) => void;
      onSyncResult: (callback: (result: SyncResult) => void) => void;
      onSyncComplete: (callback: (session: SyncSession) => void) => void;
      onSyncError: (callback: (error: string) => void) => void;
      onMainLog: (callback: (entry: { level: string; message: string; timestamp: string }) => void) => void;
    };
  }
}
