import { useState, useEffect, useRef, useCallback, ReactElement } from 'react';
import { Button } from '@podcast-recorder/ui';
import AudioVisualizer from './AudioVisualizer';
import './PreJoinScreen.css';

interface MediaDeviceInfo {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput' | 'videoinput';
}

interface PreJoinScreenProps {
  roomName: string;
  userName: string;
  onJoin: (settings: JoinSettings) => void;
  onCancel: () => void;
}

export interface JoinSettings {
  videoEnabled: boolean;
  audioEnabled: boolean;
  selectedVideoDevice: string;
  selectedAudioDevice: string;
}

export default function PreJoinScreen({
  roomName,
  userName,
  onJoin,
  onCancel,
}: PreJoinScreenProps): ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState('');
  const [selectedAudioDevice, setSelectedAudioDevice] = useState('');
  const [permissionError, setPermissionError] = useState('');

  const getDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();

      const videoInputs = devices
        .filter((device) => device.kind === 'videoinput')
        .map((device) => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${device.deviceId.substring(0, 5)}`,
          kind: 'videoinput' as const,
        }));

      const audioInputs = devices
        .filter((device) => device.kind === 'audioinput')
        .map((device) => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${device.deviceId.substring(0, 5)}`,
          kind: 'audioinput' as const,
        }));

      setVideoDevices(videoInputs);
      setAudioDevices(audioInputs);

      if (videoInputs.length > 0 && !selectedVideoDevice) {
        setSelectedVideoDevice(videoInputs[0].deviceId);
      }
      if (audioInputs.length > 0 && !selectedAudioDevice) {
        setSelectedAudioDevice(audioInputs[0].deviceId);
      }
    } catch {
      setPermissionError('Unable to access media devices. Please check your browser permissions.');
    }
  }, [selectedVideoDevice, selectedAudioDevice]);

  const initializeMedia = useCallback(async () => {
    try {
      setPermissionError('');

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: videoEnabled
          ? selectedVideoDevice && selectedVideoDevice !== '' && selectedVideoDevice !== 'default'
            ? { deviceId: { exact: selectedVideoDevice } }
            : true
          : false,
        audio: audioEnabled
          ? selectedAudioDevice && selectedAudioDevice !== '' && selectedAudioDevice !== 'default'
            ? { deviceId: { exact: selectedAudioDevice } }
            : true
          : false,
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);

      if (videoRef.current && videoEnabled) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      const err = error as { name?: string };
      if (err.name === 'NotAllowedError') {
        setPermissionError('Please allow camera and microphone access to continue');
      } else if (err.name === 'NotFoundError') {
        setPermissionError('No camera or microphone found');
      } else if (err.name === 'NotReadableError') {
        setPermissionError('Camera or microphone is already in use by another application');
      } else if (err.name === 'OverconstrainedError') {
        setPermissionError('Selected device not available. Trying default devices...');

        const fallbackConstraints: MediaStreamConstraints = {
          video: videoEnabled,
          audio: audioEnabled,
        };

        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
          setStream(fallbackStream);

          if (videoRef.current && videoEnabled) {
            videoRef.current.srcObject = fallbackStream;
          }

          setPermissionError('');
        } catch {
          setPermissionError('Unable to access any camera or microphone');
        }
      } else {
        setPermissionError(`Unable to access camera or microphone`);
      }
    }
  }, [stream, videoEnabled, audioEnabled, selectedVideoDevice, selectedAudioDevice]);

  useEffect(() => {
    const init = async () => {
      try {
        // Try to get permissions with audio only first (more likely to work)
        const tempStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        tempStream.getTracks().forEach((track) => track.stop());
        await getDevices();
      } catch (error) {
        console.warn('Cannot access media devices in dev mode:', error);
        setPermissionError(
          'Media devices may not be available in development mode. You can still join the room.'
        );
        await getDevices();
      }
    };

    init();
  }, [getDevices]);

  useEffect(() => {
    const setupMedia = async () => {
      if (videoEnabled || audioEnabled) {
        await initializeMedia();
      } else {
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
          setStream(null);
        }
      }
    };

    void setupMedia();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVideoDevice, selectedAudioDevice, videoEnabled, audioEnabled]);

  const toggleVideo = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoEnabled;
      }
    }
    setVideoEnabled(!videoEnabled);
  };

  const toggleAudio = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioEnabled;
      }
    }
    setAudioEnabled(!audioEnabled);
  };

  const handleJoin = () => {
    // Allow joining even without media access in dev mode
    onJoin({
      videoEnabled: videoEnabled && (stream?.getVideoTracks().length ?? 0) > 0,
      audioEnabled: audioEnabled && (stream?.getAudioTracks().length ?? 0) > 0,
      selectedVideoDevice: selectedVideoDevice || '',
      selectedAudioDevice: selectedAudioDevice || '',
    });
  };

  const handleCancel = () => {
    // Stop all tracks before canceling
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    onCancel();
  };

  return (
    <div className="prejoin-overlay">
      <div className="prejoin-modal">
        <div className="prejoin-header">
          <h2>Ready to join?</h2>
          <p>Check your camera and microphone before joining</p>
        </div>

        <div className="prejoin-content">
          <div className="prejoin-video-section">
            <div className="video-preview">
              {videoEnabled ? (
                <video ref={videoRef} autoPlay playsInline muted className="preview-video" />
              ) : (
                <div className="video-disabled">
                  <div className="video-avatar">{userName.substring(0, 2).toUpperCase()}</div>
                  <p>Camera is off</p>
                </div>
              )}
            </div>

            <div className="media-controls">
              <button
                className={`control-btn ${!audioEnabled ? 'disabled' : ''}`}
                onClick={toggleAudio}
              >
                {audioEnabled ? (
                  <svg fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <svg fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>

              <button
                className={`control-btn ${!videoEnabled ? 'disabled' : ''}`}
                onClick={toggleVideo}
              >
                {videoEnabled ? (
                  <svg fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                  </svg>
                ) : (
                  <svg fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            </div>

            {audioEnabled && (
              <AudioVisualizer stream={stream} isActive={audioEnabled && stream !== null} />
            )}
          </div>

          <div className="prejoin-settings">
            <div className="settings-group">
              <label>Camera</label>
              <select
                value={selectedVideoDevice}
                onChange={(e) => setSelectedVideoDevice(e.target.value)}
                className="device-select"
                disabled={videoDevices.length === 0}
              >
                {videoDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
                {videoDevices.length === 0 && <option>No camera found</option>}
              </select>
            </div>

            <div className="settings-group">
              <label>Microphone</label>
              <select
                value={selectedAudioDevice}
                onChange={(e) => setSelectedAudioDevice(e.target.value)}
                className="device-select"
                disabled={audioDevices.length === 0}
              >
                {audioDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
                {audioDevices.length === 0 && <option>No microphone found</option>}
              </select>
            </div>

            <div className="room-info-preview">
              <p className="info-label">Joining as</p>
              <p className="info-value">{userName}</p>
              <p className="info-label">Room</p>
              <p className="info-value">{roomName}</p>
            </div>
          </div>
        </div>

        {permissionError && (
          <div className="permission-error">
            <p>{permissionError}</p>
          </div>
        )}

        <div className="prejoin-actions">
          <Button variant="ghost" onClick={handleCancel} className="btn btn-ghost">
            Cancel
          </Button>
          <Button variant="primary" onClick={handleJoin} className="btn btn-primary">
            Join Room
          </Button>
        </div>
      </div>
    </div>
  );
}
