import { useState, useEffect, useCallback, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import { Input } from '@podcast-recorder/ui';
import { invoke } from '@tauri-apps/api/core';
import * as dialog from '@tauri-apps/plugin-dialog';
import { useSettingsStore } from '../stores';
import DeviceSelector from '../components/DeviceSelector';
import './SettingsPage.css';

export default function SettingsPage(): ReactElement {
  const navigate = useNavigate();

  const {
    theme,
    audioSettings,
    videoSettings,
    notifications,
    autoStartRecording,
    saveRecordingsPath,
    setTheme,
    updateAudioSettings,
    updateVideoSettings,
    updateNotifications,
    setAutoStartRecording,
    setSaveRecordingsPath,
    resetSettings,
  } = useSettingsStore();

  const [appVersion, setAppVersion] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    invoke<string>('get_app_version').then(setAppVersion).catch(console.error);
  }, []);

  const handleBrowseDirectory = useCallback(async () => {
    try {
      const selected = await dialog.open({
        directory: true,
        multiple: false,
        defaultPath: saveRecordingsPath || undefined,
      });

      if (selected && typeof selected === 'string') {
        setSaveRecordingsPath(selected);
        setHasChanges(true);
      }
    } catch (error) {
      console.error('Failed to open directory picker:', error);
    }
  }, [saveRecordingsPath, setSaveRecordingsPath]);

  const handleResetSettings = useCallback(async () => {
    const confirmed = await dialog.confirm(
      'Are you sure you want to reset all settings to default?',
      { title: 'Reset Settings', kind: 'warning' }
    );

    if (confirmed) {
      resetSettings();
      setHasChanges(false);
    }
  }, [resetSettings]);

  const handleSaveSettings = useCallback(() => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setHasChanges(false);
    }, 300);
  }, []);

  return (
    <div className="settings-page">
      <div className="settings-container">
        <div className="settings-header">
          <div className="settings-header-content">
            <h1>Settings</h1>
            <p>Configure your podcast recorder preferences</p>
          </div>
          <Button variant="ghost" onClick={() => navigate('/')} className="btn btn-ghost">
            Back to Home
          </Button>
        </div>

        <div className="settings-sections">
          <div className="settings-card">
            <h2>Audio Settings</h2>
            <div className="settings-grid">
              <div className="settings-form-group">
                <label className="settings-label">Audio Quality</label>
                <select
                  value={audioSettings.quality}
                  onChange={(e) => {
                    updateAudioSettings({ quality: e.target.value as 'low' | 'medium' | 'high' });
                    setHasChanges(true);
                  }}
                  className="settings-select"
                >
                  <option value="low">Low (64 kbps)</option>
                  <option value="medium">Medium (128 kbps)</option>
                  <option value="high">High (256 kbps)</option>
                </select>
              </div>

              <div className="settings-form-group">
                <label className="settings-label">Sample Rate</label>
                <select
                  value={audioSettings.sampleRate}
                  onChange={(e) => {
                    updateAudioSettings({ sampleRate: Number(e.target.value) });
                    setHasChanges(true);
                  }}
                  className="settings-select"
                >
                  <option value="44100">44.1 kHz</option>
                  <option value="48000">48 kHz</option>
                  <option value="96000">96 kHz</option>
                </select>
              </div>
            </div>

            <div className="settings-checkbox-group">
              <input
                type="checkbox"
                id="echoCancellation"
                checked={audioSettings.echoCancellation}
                onChange={(e) => {
                  updateAudioSettings({ echoCancellation: e.target.checked });
                  setHasChanges(true);
                }}
                className="settings-checkbox"
              />
              <label htmlFor="echoCancellation" className="settings-checkbox-label">
                Echo Cancellation
              </label>
            </div>

            <div className="settings-checkbox-group">
              <input
                type="checkbox"
                id="noiseSuppression"
                checked={audioSettings.noiseSuppression}
                onChange={(e) => {
                  updateAudioSettings({ noiseSuppression: e.target.checked });
                  setHasChanges(true);
                }}
                className="settings-checkbox"
              />
              <label htmlFor="noiseSuppression" className="settings-checkbox-label">
                Noise Suppression
              </label>
            </div>

            <div className="settings-checkbox-group">
              <input
                type="checkbox"
                id="autoGainControl"
                checked={audioSettings.autoGainControl}
                onChange={(e) => {
                  updateAudioSettings({ autoGainControl: e.target.checked });
                  setHasChanges(true);
                }}
                className="settings-checkbox"
              />
              <label htmlFor="autoGainControl" className="settings-checkbox-label">
                Auto Gain Control
              </label>
            </div>
          </div>

          <div className="settings-card">
            <h2>Video Settings</h2>
            <div className="settings-grid">
              <div className="settings-form-group">
                <label className="settings-label">Video Quality</label>
                <select
                  value={videoSettings.quality}
                  onChange={(e) => {
                    updateVideoSettings({
                      quality: e.target.value as 'low' | 'medium' | 'high' | 'ultra',
                    });
                    setHasChanges(true);
                  }}
                  className="settings-select"
                >
                  <option value="low">Low (360p)</option>
                  <option value="medium">Medium (720p)</option>
                  <option value="high">High (1080p)</option>
                  <option value="ultra">Ultra (4K)</option>
                </select>
              </div>

              <div className="settings-form-group">
                <label className="settings-label">Frame Rate</label>
                <select
                  value={videoSettings.frameRate}
                  onChange={(e) => {
                    updateVideoSettings({ frameRate: Number(e.target.value) });
                    setHasChanges(true);
                  }}
                  className="settings-select"
                >
                  <option value="15">15 FPS</option>
                  <option value="24">24 FPS</option>
                  <option value="30">30 FPS</option>
                  <option value="60">60 FPS</option>
                </select>
              </div>
            </div>
          </div>

          <div className="settings-card">
            <h2>Device Preferences</h2>
            <p className="settings-help" style={{ marginBottom: '1rem' }}>
              Select your preferred audio and video devices. These will be used by default when
              joining rooms.
            </p>
            <DeviceSelector />
          </div>

          <div className="settings-card">
            <h2>Notifications</h2>
            <div className="settings-checkbox-group">
              <input
                type="checkbox"
                id="participantJoined"
                checked={notifications.participantJoined}
                onChange={(e) => {
                  updateNotifications({ participantJoined: e.target.checked });
                  setHasChanges(true);
                }}
                className="settings-checkbox"
              />
              <label htmlFor="participantJoined" className="settings-checkbox-label">
                Notify when participant joins
              </label>
            </div>

            <div className="settings-checkbox-group">
              <input
                type="checkbox"
                id="participantLeft"
                checked={notifications.participantLeft}
                onChange={(e) => {
                  updateNotifications({ participantLeft: e.target.checked });
                  setHasChanges(true);
                }}
                className="settings-checkbox"
              />
              <label htmlFor="participantLeft" className="settings-checkbox-label">
                Notify when participant leaves
              </label>
            </div>

            <div className="settings-checkbox-group">
              <input
                type="checkbox"
                id="recordingStarted"
                checked={notifications.recordingStarted}
                onChange={(e) => {
                  updateNotifications({ recordingStarted: e.target.checked });
                  setHasChanges(true);
                }}
                className="settings-checkbox"
              />
              <label htmlFor="recordingStarted" className="settings-checkbox-label">
                Notify when recording starts
              </label>
            </div>

            <div className="settings-checkbox-group">
              <input
                type="checkbox"
                id="soundEnabled"
                checked={notifications.soundEnabled}
                onChange={(e) => {
                  updateNotifications({ soundEnabled: e.target.checked });
                  setHasChanges(true);
                }}
                className="settings-checkbox"
              />
              <label htmlFor="soundEnabled" className="settings-checkbox-label">
                Play notification sounds
              </label>
            </div>
          </div>

          <div className="settings-card">
            <h2>Recording Settings</h2>
            <div className="settings-checkbox-group">
              <input
                type="checkbox"
                id="autoStartRecording"
                checked={autoStartRecording}
                onChange={(e) => {
                  setAutoStartRecording(e.target.checked);
                  setHasChanges(true);
                }}
                className="settings-checkbox"
              />
              <label htmlFor="autoStartRecording" className="settings-checkbox-label">
                Automatically start recording when joining a room
              </label>
            </div>

            <div className="settings-form-group">
              <label className="settings-label">Save Recordings To</label>
              <div className="settings-input-group">
                <Input
                  type="text"
                  value={saveRecordingsPath || ''}
                  onChange={(e) => {
                    setSaveRecordingsPath(e.target.value);
                    setHasChanges(true);
                  }}
                  placeholder="/Users/username/Documents/Recordings"
                  className="input"
                />
                <Button
                  variant="secondary"
                  onClick={handleBrowseDirectory}
                  className="btn btn-secondary"
                >
                  Browse
                </Button>
              </div>
              <p className="settings-help">Choose where to save your podcast recordings</p>
            </div>
          </div>

          <div className="settings-card">
            <h2>Appearance</h2>
            <div className="settings-form-group">
              <label className="settings-label">Theme</label>
              <select
                value={theme}
                onChange={(e) => {
                  setTheme(e.target.value as 'light' | 'dark' | 'system');
                  setHasChanges(true);
                }}
                className="settings-select"
              >
                <option value="system">System Default</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
              <p className="settings-help">Choose your preferred color theme</p>
            </div>
          </div>

          <div className="settings-card">
            <h2>About</h2>
            <div className="settings-about">
              <p>Podcast Recorder Desktop Application</p>
              {appVersion && <p>Version: {appVersion}</p>}
              <p>Built with Tauri, React, and TypeScript</p>
              <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#9ca3af' }}>
                Settings are automatically saved using Tauri&apos;s secure storage
              </p>
            </div>
          </div>
        </div>

        <div className="settings-actions">
          <Button variant="ghost" onClick={handleResetSettings} className="btn btn-ghost">
            Reset to Defaults
          </Button>

          <div className="settings-actions-right">
            {hasChanges && <p className="settings-unsaved">You have unsaved changes</p>}
            <Button
              variant="secondary"
              onClick={() => navigate('/')}
              disabled={isSaving}
              className="btn btn-secondary"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveSettings}
              disabled={isSaving || !hasChanges}
              className="btn btn-primary"
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
