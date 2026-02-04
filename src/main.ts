/**
 * Electron Main Process
 *
 * Handles window creation, IPC, and background tasks
 */

import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import Store from 'electron-store';
import { autoUpdater } from 'electron-updater';
import type { AppSettings, SyncSession, SyncResult } from './mls/types';
import { SyncEngine, SyncEngineConfig } from './sync/engine';

// Active sync engine instance
let activeSyncEngine: SyncEngine | null = null;

// Initialize secure storage
const store = new Store<{
  settings: AppSettings;
  syncHistory: SyncSession[];
}>({
  encryptionKey: 'mls-vls-syndicator-secure-key',
  defaults: {
    settings: {
      searchCriteria: {},
      autoSync: false,
      syncIntervalHours: 24,
    },
    syncHistory: [],
  },
});

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    title: 'MLS VLS Syndicator',
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false, // Don't show until ready
  });

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
  }

  // Show when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray(): void {
  const iconPath = path.join(__dirname, '../assets/icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Syndicator',
      click: () => {
        mainWindow?.show();
      },
    },
    {
      label: 'Sync Now',
      click: () => {
        mainWindow?.webContents.send('trigger-sync');
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('MLS VLS Syndicator');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    mainWindow?.show();
  });
}

// ============================================
// Auto Updater Setup
// ============================================
function setupAutoUpdater(): void {
  // Configure auto updater
  autoUpdater.autoDownload = false; // Don't auto-download, let user decide
  autoUpdater.autoInstallOnAppQuit = true;

  // Check for updates
  autoUpdater.checkForUpdates().catch((err) => {
    console.log('Auto-update check failed:', err.message);
  });

  // Update available
  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    mainWindow?.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  // No update available
  autoUpdater.on('update-not-available', () => {
    console.log('App is up to date');
  });

  // Download progress
  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update-download-progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  // Update downloaded
  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    mainWindow?.webContents.send('update-downloaded', {
      version: info.version,
    });
  });

  // Error
  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err.message);
  });
}

// App lifecycle
app.whenReady().then(() => {
  createWindow();
  createTray();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

// ============================================
// IPC Handlers
// ============================================

// Get app settings
ipcMain.handle('get-settings', async (): Promise<AppSettings> => {
  return store.get('settings');
});

// Save app settings
ipcMain.handle('save-settings', async (_, settings: AppSettings): Promise<void> => {
  store.set('settings', settings);
});

// Get sync history
ipcMain.handle('get-sync-history', async (): Promise<SyncSession[]> => {
  return store.get('syncHistory');
});

// Add sync session to history
ipcMain.handle('add-sync-session', async (_, session: SyncSession): Promise<void> => {
  const history = store.get('syncHistory');
  history.unshift(session); // Add to beginning
  // Keep only last 100 sessions
  if (history.length > 100) {
    history.pop();
  }
  store.set('syncHistory', history);
});

// Clear sync history
ipcMain.handle('clear-sync-history', async (): Promise<void> => {
  store.set('syncHistory', []);
});

// Select directory (for image temp folder, logs, etc.)
ipcMain.handle('select-directory', async (): Promise<string | null> => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

// Show notification
ipcMain.handle('show-notification', async (_, title: string, body: string): Promise<void> => {
  const { Notification } = require('electron');
  new Notification({ title, body }).show();
});

// Get app version
ipcMain.handle('get-app-version', async (): Promise<string> => {
  return app.getVersion();
});

// ============================================
// Auto Update IPC Handlers
// ============================================

// Check for updates manually
ipcMain.handle('check-for-updates', async (): Promise<void> => {
  autoUpdater.checkForUpdates();
});

// Download update
ipcMain.handle('download-update', async (): Promise<void> => {
  autoUpdater.downloadUpdate();
});

// Install update (quit and install)
ipcMain.handle('install-update', async (): Promise<void> => {
  autoUpdater.quitAndInstall();
});

// Open external link
ipcMain.handle('open-external', async (_, url: string): Promise<void> => {
  const { shell } = require('electron');
  shell.openExternal(url);
});

// ============================================
// Sync Engine IPC Handlers
// ============================================

// Start sync
ipcMain.handle('start-sync', async (): Promise<{ success: boolean; error?: string }> => {
  if (activeSyncEngine?.isRunning()) {
    return { success: false, error: 'Sync is already running' };
  }

  const settings = store.get('settings');

  // Validate credentials
  if (!settings.vlsCredentials?.email || !settings.vlsCredentials?.password) {
    return { success: false, error: 'VLS Homes credentials not configured' };
  }

  try {
    // Create temp directory for images
    const tempDir = path.join(app.getPath('temp'), 'mls-vls-syndicator');

    const config: SyncEngineConfig = {
      mlsCredentials: settings.mlsCredentials || {
        clientId: '',
        clientSecret: '',
        tokenEndpoint: '',
        apiEndpoint: '',
        mlsName: '',
      },
      vlsCredentials: settings.vlsCredentials,
      airtableCredentials: settings.airtableCredentials,
      searchCriteria: settings.searchCriteria || {},
      tempImageDir: tempDir,
      onProgress: (current, total, address) => {
        mainWindow?.webContents.send('sync-progress', { current, total, address });
      },
      onResult: (result) => {
        mainWindow?.webContents.send('sync-result', result);
      },
    };

    activeSyncEngine = new SyncEngine(config);

    // Run sync in background
    activeSyncEngine.start()
      .then(async (session) => {
        // Save session to history
        const history = store.get('syncHistory');
        history.unshift(session);
        if (history.length > 100) history.pop();
        store.set('syncHistory', history);

        // Update last sync time
        settings.lastSyncTime = new Date();
        store.set('settings', settings);

        // Notify renderer
        mainWindow?.webContents.send('sync-complete', session);

        // Show notification
        const { Notification } = require('electron');
        new Notification({
          title: 'Sync Complete',
          body: `Posted: ${session.posted} | Failed: ${session.failed} | Skipped: ${session.skipped}`,
        }).show();

        // Cleanup
        await activeSyncEngine?.cleanup();
        activeSyncEngine = null;
      })
      .catch(async (error) => {
        mainWindow?.webContents.send('sync-error', error.message || 'Unknown error');
        await activeSyncEngine?.cleanup();
        activeSyncEngine = null;
      });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start sync';
    return { success: false, error: message };
  }
});

// Stop sync
ipcMain.handle('stop-sync', async (): Promise<void> => {
  if (activeSyncEngine) {
    activeSyncEngine.stop();
  }
});

// Run test sync with sample listings
ipcMain.handle('test-sync', async (): Promise<{ success: boolean; error?: string }> => {
  const settings = store.get('settings');

  if (!settings.vlsCredentials?.email || !settings.vlsCredentials?.password) {
    return { success: false, error: 'VLS Homes credentials not configured' };
  }

  const { VLSPoster } = await import('./vls/poster');

  const poster = new VLSPoster({
    credentials: settings.vlsCredentials,
    headless: false, // Show browser so we can see what happens
    slowMo: 100,     // Slow down for visibility
  });

  // Sample test listing
  const testListing = {
    mlsNumber: 'TEST-' + Date.now(),
    address: '999 Test Boulevard',
    city: 'Miami',
    state: 'FL',
    zip: '33101',
    price: 299000,
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1500,
    yearBuilt: 2010,
    lotSize: 5000,
    propertyType: 'Single Family',
    description: 'TEST LISTING - This is a test listing created by MLS-VLS Syndicator. Please delete.',
    imageUrls: [
      'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800',
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800',
    ],
    status: 'Active',
  };

  try {
    mainWindow?.webContents.send('sync-progress', { current: 0, total: 1, address: 'Logging into VLS Homes...' });

    await poster.init();
    const loggedIn = await poster.login();

    if (!loggedIn) {
      await poster.close();
      return { success: false, error: 'Failed to login to VLS Homes' };
    }

    mainWindow?.webContents.send('sync-progress', { current: 1, total: 1, address: testListing.address });

    // Download test images first
    const { ImageDownloader } = await import('./mls/image-downloader');
    const tempDir = path.join(app.getPath('temp'), 'mls-vls-syndicator');
    const downloader = new ImageDownloader({ tempDir });

    mainWindow?.webContents.send('sync-progress', { current: 1, total: 1, address: 'Downloading test images...' });

    const imageResults = await downloader.downloadAll(testListing.imageUrls, testListing.mlsNumber);
    const imagePaths = imageResults.filter(r => r.success).map(r => r.localPath);

    console.log('Downloaded images:', imagePaths);

    mainWindow?.webContents.send('sync-progress', { current: 1, total: 1, address: 'Posting listing to VLS...' });

    // Post the listing
    const result = await poster.postListing(testListing as any, imagePaths);

    // Cleanup
    await downloader.cleanup(imageResults);
    await poster.close();

    if (result.success) {
      mainWindow?.webContents.send('sync-result', {
        mlsNumber: testListing.mlsNumber,
        address: testListing.address,
        status: 'success',
        message: `Posted! VLS ID: ${result.vlsListingId}`,
        timestamp: new Date(),
      });
      mainWindow?.webContents.send('sync-complete', { posted: 1, failed: 0, skipped: 0 });
      return { success: true };
    } else {
      mainWindow?.webContents.send('sync-error', result.error || 'Failed to post listing');
      return { success: false, error: result.error };
    }
  } catch (error) {
    await poster.close();
    const msg = error instanceof Error ? error.message : 'Unknown error';
    mainWindow?.webContents.send('sync-error', msg);
    return { success: false, error: msg };
  }
});

// Test VLS login (for settings validation)
ipcMain.handle('test-vls-login', async (_, credentials: { email: string; password: string }): Promise<{ success: boolean; error?: string }> => {
  const { VLSPoster } = await import('./vls/poster');

  const poster = new VLSPoster({
    credentials,
    headless: true,
  });

  try {
    await poster.init();
    const success = await poster.login();
    await poster.close();

    if (success) {
      return { success: true };
    } else {
      return { success: false, error: 'Login failed - check credentials' };
    }
  } catch (error) {
    await poster.close();
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed'
    };
  }
});
