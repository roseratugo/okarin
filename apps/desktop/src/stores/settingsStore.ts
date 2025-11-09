import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { createStorageAdapter } from '../lib/tauriStorage';

export type ThemeMode = 'light' | 'dark' | 'system';
export type AudioQuality = 'low' | 'medium' | 'high';
export type VideoQuality = 'low' | 'medium' | 'high' | 'ultra';

export interface AudioSettings {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  sampleRate: number;
  channelCount: number;
  quality: AudioQuality;
}

export interface VideoSettings {
  quality: VideoQuality;
  frameRate: number;
  aspectRatio: string;
}

export interface NotificationSettings {
  participantJoined: boolean;
  participantLeft: boolean;
  recordingStarted: boolean;
  recordingStopped: boolean;
  soundEnabled: boolean;
}

export interface SettingsState {
  theme: ThemeMode;
  language: string;
  audioSettings: AudioSettings;
  videoSettings: VideoSettings;
  notifications: NotificationSettings;
  lastUsedAudioDevice: string | null;
  lastUsedVideoDevice: string | null;
  autoStartRecording: boolean;
  saveRecordingsPath: string | null;
}

export interface SettingsActions {
  setTheme: (theme: ThemeMode) => void;
  setLanguage: (language: string) => void;
  updateAudioSettings: (settings: Partial<AudioSettings>) => void;
  updateVideoSettings: (settings: Partial<VideoSettings>) => void;
  updateNotifications: (settings: Partial<NotificationSettings>) => void;
  setLastUsedAudioDevice: (deviceId: string) => void;
  setLastUsedVideoDevice: (deviceId: string) => void;
  setAutoStartRecording: (enabled: boolean) => void;
  setSaveRecordingsPath: (path: string) => void;
  resetSettings: () => void;
}

export type SettingsStore = SettingsState & SettingsActions;

const initialState: SettingsState = {
  theme: 'system',
  language: 'en',
  audioSettings: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000,
    channelCount: 2,
    quality: 'high',
  },
  videoSettings: {
    quality: 'high',
    frameRate: 30,
    aspectRatio: '16:9',
  },
  notifications: {
    participantJoined: true,
    participantLeft: true,
    recordingStarted: true,
    recordingStopped: true,
    soundEnabled: true,
  },
  lastUsedAudioDevice: null,
  lastUsedVideoDevice: null,
  autoStartRecording: false,
  saveRecordingsPath: null,
};

export const useSettingsStore = create<SettingsStore>()(
  devtools(
    persist(
      (set) => ({
        ...initialState,

        setTheme: (theme) => set({ theme }, false, 'setTheme'),

        setLanguage: (language) => set({ language }, false, 'setLanguage'),

        updateAudioSettings: (settings) =>
          set(
            (state) => ({
              audioSettings: { ...state.audioSettings, ...settings },
            }),
            false,
            'updateAudioSettings'
          ),

        updateVideoSettings: (settings) =>
          set(
            (state) => ({
              videoSettings: { ...state.videoSettings, ...settings },
            }),
            false,
            'updateVideoSettings'
          ),

        updateNotifications: (settings) =>
          set(
            (state) => ({
              notifications: { ...state.notifications, ...settings },
            }),
            false,
            'updateNotifications'
          ),

        setLastUsedAudioDevice: (deviceId) =>
          set({ lastUsedAudioDevice: deviceId }, false, 'setLastUsedAudioDevice'),

        setLastUsedVideoDevice: (deviceId) =>
          set({ lastUsedVideoDevice: deviceId }, false, 'setLastUsedVideoDevice'),

        setAutoStartRecording: (enabled) =>
          set({ autoStartRecording: enabled }, false, 'setAutoStartRecording'),

        setSaveRecordingsPath: (path) =>
          set({ saveRecordingsPath: path }, false, 'setSaveRecordingsPath'),

        resetSettings: () => set(initialState, false, 'resetSettings'),
      }),
      {
        name: 'settings-storage',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        storage: createStorageAdapter('settings.json') as any, // Type incompatibility between StateStorage and PersistStorage
        version: 1,
        migrate: (persistedState: unknown) => {
          return persistedState as SettingsState & SettingsActions;
        },
      }
    ),
    { name: 'SettingsStore' }
  )
);
