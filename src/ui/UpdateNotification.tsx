import React, { useState, useEffect } from 'react';

interface UpdateInfo {
  version: string;
  releaseNotes?: string;
}

interface DownloadProgress {
  percent: number;
  transferred: number;
  total: number;
}

type UpdateState = 'idle' | 'available' | 'downloading' | 'ready';

export default function UpdateNotification() {
  const [updateState, setUpdateState] = useState<UpdateState>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Listen for update events
    window.electronAPI.onUpdateAvailable((info) => {
      setUpdateInfo(info);
      setUpdateState('available');
      setDismissed(false);
    });

    window.electronAPI.onUpdateDownloadProgress((progress) => {
      setDownloadProgress(progress);
    });

    window.electronAPI.onUpdateDownloaded((info) => {
      setUpdateInfo(info);
      setUpdateState('ready');
    });
  }, []);

  const handleDownload = () => {
    setUpdateState('downloading');
    window.electronAPI.downloadUpdate();
  };

  const handleInstall = () => {
    window.electronAPI.installUpdate();
  };

  const handleDismiss = () => {
    setDismissed(true);
  };

  // Don't show anything if idle or dismissed
  if (updateState === 'idle' || dismissed) {
    return null;
  }

  return (
    <div className="update-notification">
      {updateState === 'available' && (
        <>
          <div className="update-icon">🎉</div>
          <div className="update-content">
            <strong>Update Available!</strong>
            <span>Version {updateInfo?.version} is ready to download</span>
          </div>
          <div className="update-actions">
            <button className="btn-update" onClick={handleDownload}>
              Download
            </button>
            <button className="btn-dismiss" onClick={handleDismiss}>
              Later
            </button>
          </div>
        </>
      )}

      {updateState === 'downloading' && (
        <>
          <div className="update-icon">⬇️</div>
          <div className="update-content">
            <strong>Downloading Update...</strong>
            <div className="update-progress-bar">
              <div
                className="update-progress-fill"
                style={{ width: `${downloadProgress?.percent || 0}%` }}
              />
            </div>
            <span>{Math.round(downloadProgress?.percent || 0)}% complete</span>
          </div>
        </>
      )}

      {updateState === 'ready' && (
        <>
          <div className="update-icon">✅</div>
          <div className="update-content">
            <strong>Update Ready!</strong>
            <span>Version {updateInfo?.version} will install on restart</span>
          </div>
          <div className="update-actions">
            <button className="btn-update" onClick={handleInstall}>
              Restart Now
            </button>
            <button className="btn-dismiss" onClick={handleDismiss}>
              Later
            </button>
          </div>
        </>
      )}
    </div>
  );
}
