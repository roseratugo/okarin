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
    <div className={className}>
      <div className="settings-group">
        <label htmlFor="audio-input">Microphone</label>
        <select
          id="audio-input"
          value={selectedAudioInput || ''}
          onChange={(e) => setSelectedAudioInput(e.target.value || null)}
          className="device-select"
        >
          <option value="">Default</option>
          {audioInputDevices.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {getDeviceLabel(device, index)}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-group">
        <label htmlFor="audio-output">Speaker</label>
        <select
          id="audio-output"
          value={selectedAudioOutput || ''}
          onChange={(e) => setSelectedAudioOutput(e.target.value || null)}
          className="device-select"
        >
          <option value="">Default</option>
          {audioOutputDevices.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {getDeviceLabel(device, index)}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-group">
        <label htmlFor="video-input">Camera</label>
        <select
          id="video-input"
          value={selectedVideoInput || ''}
          onChange={(e) => setSelectedVideoInput(e.target.value || null)}
          className="device-select"
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
