import { useState, useEffect, useRef, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AbstractBackground, Button } from '../components/ui';
import { useMediaDevices } from '../hooks/useMediaDevices';
import { useSettingsStore } from '../stores';
import { joinRoom } from '../lib/signalingApi';
import './PreJoinPage.css';

type RoomData = {
  roomName: string;
  userName: string;
};

export default function PreJoinPage(): ReactElement {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  // Get room data from session storage
  const roomData = sessionStorage.getItem('pendingRoom');
  const { roomName, userName }: RoomData = roomData
    ? JSON.parse(roomData)
    : { roomName: '', userName: '' };

  // Settings store
  const selectedAudioInput = useSettingsStore((state) => state.selectedAudioInput);
  const selectedVideoInput = useSettingsStore((state) => state.selectedVideoInput);
  const selectedAudioOutput = useSettingsStore((state) => state.selectedAudioOutput);
  const setSelectedAudioInput = useSettingsStore((state) => state.setSelectedAudioInput);
  const setSelectedVideoInput = useSettingsStore((state) => state.setSelectedVideoInput);
  const setSelectedAudioOutput = useSettingsStore((state) => state.setSelectedAudioOutput);

  // Media devices
  const { audioInputDevices, audioOutputDevices, videoInputDevices } = useMediaDevices();

  // Format room ID for display
  const formattedRoomId = roomId ? `${roomId.slice(0, 3)}-${roomId.slice(3)}` : '';
  const displayRoomName = roomName || `Room ${formattedRoomId}`;

  // Redirect if no room data
  useEffect(() => {
    if (!roomId || !userName) {
      navigate('/');
    }
  }, [roomId, userName, navigate]);

  // Initialize media on mount and when device selection changes
  useEffect(() => {
    if (!roomId || !userName) return;

    let cancelled = false;

    (async () => {
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        const constraints: MediaStreamConstraints = {
          video: {
            ...(selectedVideoInput ? { deviceId: { exact: selectedVideoInput } } : {}),
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 60 },
          },
          audio: {
            ...(selectedAudioInput ? { deviceId: { exact: selectedAudioInput } } : {}),
            sampleRate: { ideal: 48000 },
            channelCount: { ideal: 2 },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = mediaStream;

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }

        setError('');
      } catch (err) {
        if (cancelled) return;

        const mediaError = err as { name?: string };
        if (mediaError.name === 'NotAllowedError') {
          setError('Please allow camera and microphone access');
        } else if (mediaError.name === 'NotFoundError') {
          setError('No camera or microphone found');
        } else {
          setError('Unable to access camera or microphone');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [roomId, userName, selectedVideoInput, selectedAudioInput]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const toggleVideo = () => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoEnabled;
      }
    }
    setVideoEnabled((prev) => !prev);
  };

  const toggleAudio = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioEnabled;
      }
    }
    setAudioEnabled((prev) => !prev);
  };

  const toggleSpeaker = () => {
    setSpeakerEnabled((prev) => !prev);
  };

  const handleJoin = async () => {
    if (!roomId) return;

    setIsJoining(true);

    try {
      const response = await joinRoom(roomId, userName);

      sessionStorage.setItem(
        'currentRoom',
        JSON.stringify({
          roomId,
          roomName: displayRoomName,
          userName,
          participantId: response.participant_id,
          token: response.token,
          isHost: false,
          joinedAt: new Date().toISOString(),
          mediaSettings: {
            videoEnabled: videoEnabled && (streamRef.current?.getVideoTracks().length ?? 0) > 0,
            audioEnabled: audioEnabled && (streamRef.current?.getAudioTracks().length ?? 0) > 0,
            selectedVideoDevice: selectedVideoInput || '',
            selectedAudioDevice: selectedAudioInput || '',
          },
        })
      );

      sessionStorage.removeItem('pendingRoom');
      navigate(`/recording/${roomId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room');
      setIsJoining(false);
    }
  };

  const handleCancel = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    sessionStorage.removeItem('pendingRoom');
    navigate('/');
  };

  const getDeviceLabel = (device: { label: string }, index: number): string => {
    return device.label || `Device ${index + 1}`;
  };

  return (
    <AbstractBackground>
      <div className="prejoin-page">
        <div className="prejoin-container">
          {/* Header */}
          <h1 className="prejoin-title">Ready to join?</h1>

          {/* Video preview */}
          <div className="prejoin-preview">
            <div className="preview-container">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`preview-video ${!videoEnabled ? 'hidden' : ''}`}
              />
              {!videoEnabled && (
                <div className="preview-placeholder">
                  <div className="preview-avatar">{userName.substring(0, 2).toUpperCase()}</div>
                </div>
              )}
            </div>

            {/* Media controls with dropdowns */}
            <div className="media-controls">
              {/* Microphone */}
              <div className="media-control-group">
                <button
                  type="button"
                  className={`media-toggle ${!audioEnabled ? 'media-toggle--off' : ''}`}
                  onClick={toggleAudio}
                  aria-label={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
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
                <div className="media-select-wrapper">
                  <svg fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <select
                    className="media-select"
                    value={selectedAudioInput || ''}
                    onChange={(e) => setSelectedAudioInput(e.target.value)}
                  >
                    {audioInputDevices.map((device, index) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {getDeviceLabel(device, index)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Camera */}
              <div className="media-control-group">
                <button
                  type="button"
                  className={`media-toggle ${!videoEnabled ? 'media-toggle--off' : ''}`}
                  onClick={toggleVideo}
                  aria-label={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
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
                <div className="media-select-wrapper">
                  <svg fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <select
                    className="media-select"
                    value={selectedVideoInput || ''}
                    onChange={(e) => setSelectedVideoInput(e.target.value)}
                  >
                    {videoInputDevices.map((device, index) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {getDeviceLabel(device, index)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Speaker */}
              <div className="media-control-group">
                <button
                  type="button"
                  className={`media-toggle ${!speakerEnabled ? 'media-toggle--off' : ''}`}
                  onClick={toggleSpeaker}
                  aria-label={speakerEnabled ? 'Mute speaker' : 'Unmute speaker'}
                >
                  {speakerEnabled ? (
                    <svg fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z"
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
                <div className="media-select-wrapper">
                  <svg fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <select
                    className="media-select"
                    value={selectedAudioOutput || ''}
                    onChange={(e) => setSelectedAudioOutput(e.target.value)}
                  >
                    {audioOutputDevices.map((device, index) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {getDeviceLabel(device, index)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="prejoin-error" role="alert">
              <p>{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="prejoin-actions">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button variant="primary" size="md" onClick={handleJoin} disabled={isJoining}>
              {isJoining ? 'Joining...' : 'Join'}
            </Button>
          </div>
        </div>
      </div>
    </AbstractBackground>
  );
}
