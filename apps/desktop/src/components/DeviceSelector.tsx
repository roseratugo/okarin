import { type ReactElement } from 'react';
import { useMediaDevices } from '@podcast-recorder/ui';
import { useSettingsStore } from '../stores';

type DeviceSelectorProps = {
  className?: string;
};

export default function DeviceSelector({ className = '' }: DeviceSelectorProps): ReactElement {
  const { audioInputDevices, audioOutputDevices, videoInputDevices, loading, error } =
    useMediaDevices();

  const selectedAudioInput = useSettingsStore((state) => state.selectedAudioInput);
  const selectedAudioOutput = useSettingsStore((state) => state.selectedAudioOutput);
  const selectedVideoInput = useSettingsStore((state) => state.selectedVideoInput);
  const setSelectedAudioInput = useSettingsStore((state) => state.setSelectedAudioInput);
  const setSelectedAudioOutput = useSettingsStore((state) => state.setSelectedAudioOutput);
  const setSelectedVideoInput = useSettingsStore((state) => state.setSelectedVideoInput);

  if (loading) {
    return (
      <div className={className}>
        <p className="text-sm text-gray-500">Loading devices...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={className}>
        <p className="text-sm text-red-500">Failed to load devices: {error.message}</p>
      </div>
    );
  }

  const getDeviceLabel = (device: { label: string }, index: number): string => {
    return device.label || `Device ${index + 1}`;
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="device-select-group">
        <label htmlFor="audio-input" className="block text-sm font-medium mb-2">
          Microphone
        </label>
        <select
          id="audio-input"
          value={selectedAudioInput || ''}
          onChange={(e) => setSelectedAudioInput(e.target.value || null)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800 dark:border-gray-600"
        >
          <option value="">Default</option>
          {audioInputDevices.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {getDeviceLabel(device, index)}
            </option>
          ))}
        </select>
      </div>

      <div className="device-select-group">
        <label htmlFor="audio-output" className="block text-sm font-medium mb-2">
          Speaker
        </label>
        <select
          id="audio-output"
          value={selectedAudioOutput || ''}
          onChange={(e) => setSelectedAudioOutput(e.target.value || null)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800 dark:border-gray-600"
        >
          <option value="">Default</option>
          {audioOutputDevices.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {getDeviceLabel(device, index)}
            </option>
          ))}
        </select>
      </div>

      <div className="device-select-group">
        <label htmlFor="video-input" className="block text-sm font-medium mb-2">
          Camera
        </label>
        <select
          id="video-input"
          value={selectedVideoInput || ''}
          onChange={(e) => setSelectedVideoInput(e.target.value || null)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white dark:bg-gray-800 dark:border-gray-600"
        >
          <option value="">Default</option>
          {videoInputDevices.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {getDeviceLabel(device, index)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
