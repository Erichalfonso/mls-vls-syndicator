import React, { useState, useEffect } from 'react';
import Settings from './Settings';
import SyncPanel from './SyncPanel';
import ResultsLog from './ResultsLog';
import UpdateNotification from './UpdateNotification';
import type { AppSettings, SyncSession } from '../mls/types';

type TabType = 'sync' | 'results' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('sync');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [syncHistory, setSyncHistory] = useState<SyncSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentSession, setCurrentSession] = useState<SyncSession | null>(null);
  const [appVersion, setAppVersion] = useState<string>('1.0.0');

  // Load settings and history on mount
  useEffect(() => {
    async function loadData() {
      try {
        const [loadedSettings, history, version] = await Promise.all([
          window.electronAPI.getSettings(),
          window.electronAPI.getSyncHistory(),
          window.electronAPI.getAppVersion(),
        ]);
        setSettings(loadedSettings);
        setSyncHistory(history);
        setAppVersion(version);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();

    // Forward main process logs to DevTools console
    window.electronAPI.onMainLog((entry) => {
      const prefix = `[Main ${entry.timestamp.split('T')[1]?.slice(0, 8) || ''}]`;
      if (entry.level === 'error') {
        console.error(prefix, entry.message);
      } else if (entry.level === 'warn') {
        console.warn(prefix, entry.message);
      } else {
        console.log(prefix, entry.message);
      }
    });

    // Listen for sync trigger from tray
    window.electronAPI.onTriggerSync(() => {
      setActiveTab('sync');
      // TODO: Trigger sync
    });

    // Listen for sync completion
    window.electronAPI.onSyncComplete((session) => {
      setSyncHistory((prev) => [session, ...prev]);
      setCurrentSession(null);
    });
  }, []);

  const handleSaveSettings = async (newSettings: AppSettings) => {
    await window.electronAPI.saveSettings(newSettings);
    setSettings(newSettings);
  };

  // Only require VLS credentials for now (MLS API not yet available)
  const isConfigured = settings?.vlsCredentials?.email && settings?.vlsCredentials?.password;

  if (isLoading) {
    return (
      <div className="app loading">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <UpdateNotification />
      <header className="app-header">
        <h1>🏠 MLS VLS Syndicator</h1>
        <nav className="tabs">
          <button
            className={`tab ${activeTab === 'sync' ? 'active' : ''}`}
            onClick={() => setActiveTab('sync')}
          >
            Sync
          </button>
          <button
            className={`tab ${activeTab === 'results' ? 'active' : ''}`}
            onClick={() => setActiveTab('results')}
          >
            History
          </button>
          <button
            className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
        </nav>
      </header>

      <main className="app-content">
        {activeTab === 'sync' && (
          <SyncPanel
            settings={settings!}
            isConfigured={!!isConfigured}
            currentSession={currentSession}
            onGoToSettings={() => setActiveTab('settings')}
          />
        )}

        {activeTab === 'results' && (
          <ResultsLog
            sessions={syncHistory}
            onClearHistory={async () => {
              await window.electronAPI.clearSyncHistory();
              setSyncHistory([]);
            }}
          />
        )}

        {activeTab === 'settings' && (
          <Settings settings={settings!} onSave={handleSaveSettings} />
        )}
      </main>

      <footer className="app-footer">
        <span>MLS VLS Syndicator v{appVersion}</span>
        {settings?.lastSyncTime && (
          <span>Last sync: {new Date(settings.lastSyncTime).toLocaleString()}</span>
        )}
      </footer>
    </div>
  );
}
