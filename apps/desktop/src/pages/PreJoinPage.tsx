import { useState, useEffect, useRef, useCallback, ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AbstractBackground } from '../components/ui';
import AudioVisualizer from '../components/AudioVisualizer';
import DeviceSelector from '../components/DeviceSelector';
import { useSettingsStore } from '../stores';
import { joinRoom } from '../lib/signalingApi';
import './PreJoinPage.css';

export default function PreJoinPage(): ReactElement {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const roomData = sessionStorage.getItem('pendingRoom');
  const { roomName, userName } = roomData ? JSON.parse(roomData) : { roomName: '', userName: '' };

  const selectedAudioInput = useSettingsStore((state) => state.selectedAudioInput);
  const selectedVideoInput = useSettingsStore((state) => state.selectedVideoInput);
  const audioSettings = useSettingsStore((state) => state.audioSettings);

  const initializeMedia = useCallback(async () => {
    try {
      setError('');

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: videoEnabled
          ? {
              ...(selectedVideoInput && selectedVideoInput !== ''
                ? { deviceId: { exact: selectedVideoInput } }
                : {}),
              width: { ideal: 4096 },
              height: { ideal: 2160 },
              frameRate: { ideal: 60 },
              aspectRatio: { ideal: 16 / 9 },
            }
          : false,
        audio: audioEnabled
          ? {
              ...(selectedAudioInput && selectedAudioInput !== ''
                ? { deviceId: { exact: selectedAudioInput } }
                : {}),
              sampleRate: { ideal: 48000 },
              channelCount: { ideal: 2 },
              echoCancellation: audioSettings.echoCancellation,
              noiseSuppression: audioSettings.noiseSuppression,
              autoGainControl: audioSettings.autoGainControl,
            }
          : false,
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);

      if (videoRef.current && videoEnabled) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      const error = err as { name?: string };
      if (error.name === 'NotAllowedError') {
        setError('Please allow camera and microphone access');
      } else if (error.name === 'NotFoundError') {
        setError('No camera or microphone found');
      } else if (error.name === 'OverconstrainedError') {
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: videoEnabled,
            audio: audioEnabled,
          });
          setStream(fallbackStream);
          if (videoRef.current && videoEnabled) {
            videoRef.current.srcObject = fallbackStream;
          }
        } catch {
          setError('Unable to access camera or microphone');
        }
      } else {
        setError('Unable to access camera or microphone');
      }
    }
  }, [stream, videoEnabled, audioEnabled, selectedVideoInput, selectedAudioInput, audioSettings]);

  useEffect(() => {
    if (!roomId || !userName) {
      navigate('/');
      return;
    }

    const setupMedia = async () => {
      if (videoEnabled || audioEnabled) {
        await initializeMedia();
      } else if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        setStream(null);
      }
    };

    void setupMedia();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVideoInput, selectedAudioInput, videoEnabled, audioEnabled]);

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

  const handleJoin = async () => {
    if (!roomId) return;

    setIsJoining(true);
    setError('');

    try {
      const response = await joinRoom(roomId, userName);

      sessionStorage.setItem(
        'currentRoom',
        JSON.stringify({
          roomId,
          roomName: roomName || `Room ${roomId.slice(0, 3)}-${roomId.slice(3)}`,
          userName,
          participantId: response.participant_id,
          token: response.token,
          isHost: false,
          joinedAt: new Date().toISOString(),
          mediaSettings: {
            videoEnabled: videoEnabled && (stream?.getVideoTracks().length ?? 0) > 0,
            audioEnabled: audioEnabled && (stream?.getAudioTracks().length ?? 0) > 0,
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
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    sessionStorage.removeItem('pendingRoom');
    navigate('/');
  };

  return (
    <AbstractBackground>
      <div className="prejoin-page">
        <div className="prejoin-content">
          <div className="prejoin-header">
            <h1 className="prejoin-title">Ready to join?</h1>
            <p className="prejoin-subtitle">
              {roomName || `Room ${roomId?.slice(0, 3)}-${roomId?.slice(3)}`}
            </p>
          </div>

          <div className="prejoin-main">
            <div className="prejoin-video-section">
              <div className="video-preview">
                {videoEnabled ? (
                  <video ref={videoRef} autoPlay playsInline muted className="preview-video" />
                ) : (
                  <div className="video-disabled">
                    <div className="video-avatar">{userName.substring(0, 2).toUpperCase()}</div>
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

              {audioEnabled && stream && <AudioVisualizer stream={stream} isActive={true} />}
            </div>

            <div className="prejoin-settings">
              <DeviceSelector />
            </div>
          </div>

          {error && (
            <div className="prejoin-error">
              <p>{error}</p>
            </div>
          )}

          <div className="prejoin-actions">
            <button onClick={handleCancel} className="prejoin-btn">
              Cancel
            </button>
            <button
              onClick={handleJoin}
              disabled={isJoining}
              className="prejoin-btn prejoin-btn-primary"
            >
              {isJoining ? 'Joining...' : 'Join Room'}
            </button>
          </div>
        </div>
      </div>
    </AbstractBackground>
  );
}
