import { useEffect, useState, type ReactElement } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import Button from './Button';
import './UpdateChecker.css';

interface UpdateInfo {
  version: string;
  body?: string;
}

export default function UpdateChecker(): ReactElement | null {
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkForUpdate = async () => {
      try {
        const update = await check();
        if (update) {
          setUpdateAvailable({
            version: update.version,
            body: update.body,
          });
        }
      } catch (err) {
        console.error('Failed to check for updates:', err);
      }
    };

    checkForUpdate();
  }, []);

  const handleUpdate = async () => {
    if (!updateAvailable) return;

    setIsDownloading(true);
    setError(null);

    try {
      const update = await check();
      if (!update) return;

      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength || 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setDownloadProgress(Math.round((downloaded / contentLength) * 100));
            }
            break;
          case 'Finished':
            setDownloadProgress(100);
            break;
        }
      });

      await relaunch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
      setIsDownloading(false);
    }
  };

  const handleDismiss = () => {
    setUpdateAvailable(null);
  };

  if (!updateAvailable) return null;

  return (
    <div className="update-banner">
      <div className="update-content">
        <div className="update-info">
          <strong>Update Available</strong>
          <span>Version {updateAvailable.version} is ready to install</span>
        </div>
        {error && <span className="update-error">{error}</span>}
        <div className="update-actions">
          {isDownloading ? (
            <div className="update-progress">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${downloadProgress}%` }} />
              </div>
              <span>{downloadProgress}%</span>
            </div>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={handleDismiss}>
                Later
              </Button>
              <Button variant="primary" size="sm" onClick={handleUpdate}>
                Update Now
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
