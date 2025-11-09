import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import { Input } from '@podcast-recorder/ui';
import { invoke } from '@tauri-apps/api/core';
import './SettingsPage.css';
import { ReactElement } from 'react';

interface Settings {
  displayName: string;
  defaultAudioInput: string;
  defaultAudioOutput: string;
  defaultVideoInput: string;
  videoQuality: 'low' | 'medium' | 'high' | 'ultra';
  audioQuality: 'low' | 'medium' | 'high';
  autoRecordOnJoin: boolean;
  saveRecordingsPath: string;
  theme: 'light' | 'dark' | 'system';
}

export default function SettingsPage(): ReactElement {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings>({
    displayName: '',
    defaultAudioInput: '',
    defaultAudioOutput: '',
    defaultVideoInput: '',
    videoQuality: 'high',
    audioQuality: 'high',
    autoRecordOnJoin: false,
    saveRecordingsPath: '',
    theme: 'system',
  });

  const [appVersion, setAppVersion] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    // Load settings from localStorage
    const savedSettings = localStorage.getItem('appSettings');
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }

    // Get app version
    invoke<string>('get_app_version').then(setAppVersion).catch(console.error);
  }, []);

  const handleSettingChange = (key: keyof Settings, value: string | boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      // Save to localStorage
      localStorage.setItem('appSettings', JSON.stringify(settings));

      // Apply theme
      if (settings.theme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.setAttribute('data-theme', 'dark');
      } else if (settings.theme === 'light') {
        document.documentElement.classList.remove('dark');
        document.documentElement.setAttribute('data-theme', 'light');
      } else {
        // System preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.toggle('dark', prefersDark);
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
      }

      setHasChanges(false);
      // TODO: Show success toast
    } catch (error) {
      console.error('Failed to save settings:', error);
      // TODO: Show error toast
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetSettings = () => {
    const confirmReset = window.confirm('Are you sure you want to reset all settings to default?');
    if (confirmReset) {
      const defaultSettings: Settings = {
        displayName: '',
        defaultAudioInput: '',
        defaultAudioOutput: '',
        defaultVideoInput: '',
        videoQuality: 'high',
        audioQuality: 'high',
        autoRecordOnJoin: false,
        saveRecordingsPath: '',
        theme: 'system',
      };
      setSettings(defaultSettings);
      setHasChanges(true);
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-container">
        {/* Header */}
        <div className="settings-header">
          <div className="settings-header-content">
            <h1>Settings</h1>
            <p>Configure your podcast recorder preferences</p>
          </div>
          <Button variant="ghost" onClick={() => navigate('/')} className="btn btn-ghost">
            Back to Home
          </Button>
        </div>

        {/* Settings Sections */}
        <div className="settings-sections">
          {/* User Profile */}
          <div className="settings-card">
            <h2>User Profile</h2>
            <div className="settings-form-group">
              <label className="settings-label">Display Name</label>
              <Input
                type="text"
                value={settings.displayName}
                onChange={(e) => handleSettingChange('displayName', e.target.value)}
                placeholder="Enter your display name"
                className="input"
              />
              <p className="settings-help">
                This name will be shown to other participants in recording rooms
              </p>
            </div>
          </div>

          {/* Audio & Video */}
          <div className="settings-card">
            <h2>Audio & Video</h2>
            <div className="settings-grid">
              {/* Audio Quality */}
              <div className="settings-form-group">
                <label className="settings-label">Audio Quality</label>
                <select
                  value={settings.audioQuality}
                  onChange={(e) => handleSettingChange('audioQuality', e.target.value)}
                  className="settings-select"
                >
                  <option value="low">Low (64 kbps)</option>
                  <option value="medium">Medium (128 kbps)</option>
                  <option value="high">High (256 kbps)</option>
                </select>
              </div>

              {/* Video Quality */}
              <div className="settings-form-group">
                <label className="settings-label">Video Quality</label>
                <select
                  value={settings.videoQuality}
                  onChange={(e) => handleSettingChange('videoQuality', e.target.value)}
                  className="settings-select"
                >
                  <option value="low">Low (360p)</option>
                  <option value="medium">Medium (720p)</option>
                  <option value="high">High (1080p)</option>
                  <option value="ultra">Ultra (4K)</option>
                </select>
              </div>
            </div>

            {/* Auto-record Toggle */}
            <div className="settings-checkbox-group">
              <input
                type="checkbox"
                id="autoRecord"
                checked={settings.autoRecordOnJoin}
                onChange={(e) => handleSettingChange('autoRecordOnJoin', e.target.checked)}
                className="settings-checkbox"
              />
              <label htmlFor="autoRecord" className="settings-checkbox-label">
                Automatically start recording when joining a room
              </label>
            </div>
          </div>

          {/* Recording Storage */}
          <div className="settings-card">
            <h2>Recording Storage</h2>
            <div className="settings-form-group">
              <label className="settings-label">Save Recordings To</label>
              <div className="settings-input-group">
                <Input
                  type="text"
                  value={settings.saveRecordingsPath}
                  onChange={(e) => handleSettingChange('saveRecordingsPath', e.target.value)}
                  placeholder="/Users/username/Documents/Recordings"
                  className="input"
                />
                <Button variant="secondary" className="btn btn-secondary">
                  Browse
                </Button>
              </div>
              <p className="settings-help">Choose where to save your podcast recordings</p>
            </div>
          </div>

          {/* Appearance */}
          <div className="settings-card">
            <h2>Appearance</h2>
            <div className="settings-form-group">
              <label className="settings-label">Theme</label>
              <select
                value={settings.theme}
                onChange={(e) => handleSettingChange('theme', e.target.value)}
                className="settings-select"
              >
                <option value="system">System Default</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
              <p className="settings-help">Choose your preferred color theme</p>
            </div>
          </div>

          {/* About */}
          <div className="settings-card">
            <h2>About</h2>
            <div className="settings-about">
              <p>Podcast Recorder Desktop Application</p>
              {appVersion && <p>Version: {appVersion}</p>}
              <p>Built with Tauri, React, and TypeScript</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
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
