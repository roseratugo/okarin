import { useState, useEffect, useCallback } from 'react';

export interface MediaDeviceInfo {
  deviceId: string;
  kind: MediaDeviceKind;
  label: string;
  groupId: string;
}

export interface UseMediaDevicesReturn {
  devices: MediaDeviceInfo[];
  audioInputDevices: MediaDeviceInfo[];
  audioOutputDevices: MediaDeviceInfo[];
  videoInputDevices: MediaDeviceInfo[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useMediaDevices(): UseMediaDevicesReturn {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const audioInputDevices = devices.filter((d) => d.kind === 'audioinput');
  const audioOutputDevices = devices.filter((d) => d.kind === 'audiooutput');
  const videoInputDevices = devices.filter((d) => d.kind === 'videoinput');

  const enumerateDevices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Request permission first
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch (permErr) {
        console.warn('Permission request failed:', permErr);
      }

      const deviceList = await navigator.mediaDevices.enumerateDevices();
      setDevices(deviceList as MediaDeviceInfo[]);
    } catch (err) {
      console.error('Failed to enumerate devices:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void enumerateDevices();

    const handleDeviceChange = () => {
      void enumerateDevices();
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [enumerateDevices]);

  return {
    devices,
    audioInputDevices,
    audioOutputDevices,
    videoInputDevices,
    loading,
    error,
    refresh: enumerateDevices,
  };
}
