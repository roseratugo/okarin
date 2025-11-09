import { useEffect, useRef, useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Button, { IconButton } from '../components/Button';
import { useRoomStore, useRecordingStore } from '../stores';
import './RecordingPage.css';
import type { ReactElement } from 'react';

// Voice detection threshold (0-255, higher = less sensitive)
const SPEAKING_THRESHOLD = 25;

// Update interval for voice detection (ms) - throttle to ~10 updates/sec instead of 60fps
const VOICE_UPDATE_INTERVAL = 100;

export default function RecordingPage(): ReactElement {
  const { roomId: urlRoomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  // Zustand stores
  const {
    roomId,
    roomName,
    isHost,
    participants,
    mediaSettings,
    localStream,
    setRoom,
    leaveRoom,
    setLocalStream,
    updateParticipantSpeaking,
    updateParticipantMuted,
    updateParticipantVideo,
  } = useRoomStore();

  const { isRecording, recordingTime, startRecording, stopRecording, incrementRecordingTime } =
    useRecordingStore();

  // Local UI state
  const [isLeaving, setIsLeaving] = useState(false);
  const [showInviteDropdown, setShowInviteDropdown] = useState(false);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const inviteDropdownRef = useRef<HTMLDivElement>(null);

  const setupVoiceDetection = useCallback(
    (stream: MediaStream) => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }

      try {
        audioContextRef.current = new AudioContext();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 512;
        analyserRef.current.smoothingTimeConstant = 0.8;

        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(analyserRef.current);

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        let lastUpdateTime = 0;

        const checkVoiceActivity = (timestamp: number) => {
          if (!analyserRef.current) return;

          if (timestamp - lastUpdateTime < VOICE_UPDATE_INTERVAL) {
            animationFrameRef.current = requestAnimationFrame(checkVoiceActivity);
            return;
          }

          lastUpdateTime = timestamp;
          analyserRef.current.getByteFrequencyData(dataArray);

          const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
          const isSpeaking = average > SPEAKING_THRESHOLD;

          updateParticipantSpeaking('self', isSpeaking);

          animationFrameRef.current = requestAnimationFrame(checkVoiceActivity);
        };

        animationFrameRef.current = requestAnimationFrame(checkVoiceActivity);
      } catch (error) {
        console.error('Error setting up voice detection:', error);
      }
    },
    [updateParticipantSpeaking]
  );

  const cleanupVoiceDetection = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
  }, []);

  useEffect(() => {
    if (!roomId || roomId !== urlRoomId) {
      const storedRoom = sessionStorage.getItem('currentRoom');
      if (storedRoom) {
        const info = JSON.parse(storedRoom) as {
          roomId: string;
          roomName: string;
          userName: string;
          isHost: boolean;
          createdAt?: string;
          joinedAt?: string;
          mediaSettings?: {
            videoEnabled: boolean;
            audioEnabled: boolean;
            selectedVideoDevice: string;
            selectedAudioDevice: string;
          };
        };

        setRoom({
          roomId: info.roomId,
          roomName: info.roomName,
          userName: info.userName,
          isHost: info.isHost,
          mediaSettings: info.mediaSettings,
          createdAt: info.createdAt,
          joinedAt: info.joinedAt,
        });
      } else {
        navigate(`/room/join`);
      }
    }
  }, [roomId, urlRoomId, setRoom, navigate]);

  useEffect(() => {
    const initializeMedia = async () => {
      if (!mediaSettings) return;

      try {
        const constraints: MediaStreamConstraints = {
          video: mediaSettings.videoEnabled
            ? mediaSettings.selectedVideoDevice && mediaSettings.selectedVideoDevice !== ''
              ? { deviceId: { exact: mediaSettings.selectedVideoDevice } }
              : true
            : false,
          audio: mediaSettings.audioEnabled
            ? mediaSettings.selectedAudioDevice && mediaSettings.selectedAudioDevice !== ''
              ? { deviceId: { exact: mediaSettings.selectedAudioDevice } }
              : true
            : false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        setLocalStream(stream);

        if (videoRef.current && mediaSettings.videoEnabled) {
          videoRef.current.srcObject = stream;
        }

        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = mediaSettings.audioEnabled;

          if (mediaSettings.audioEnabled) {
            setupVoiceDetection(stream);
          }
        }
      } catch (error) {
        const err = error as { name?: string; message?: string };
        console.warn('Media access error:', err.name, err.message);

        if (
          err.name === 'NotFoundError' ||
          err.name === 'NotAllowedError' ||
          err.name === 'OverconstrainedError'
        ) {
          console.info('Continuing without media devices - this is common in development mode');
          updateParticipantMuted('self', true);
          updateParticipantVideo('self', false);
        }
      }
    };

    initializeMedia();

    return () => {
      cleanupVoiceDetection();
    };
  }, [
    mediaSettings,
    setupVoiceDetection,
    cleanupVoiceDetection,
    setLocalStream,
    updateParticipantMuted,
    updateParticipantVideo,
  ]);

  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [localStream]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        incrementRecordingTime();
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, incrementRecordingTime]);

  const formatTime = useCallback((seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const handleToggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const handleToggleMute = useCallback(() => {
    const selfParticipant = participants.find((p) => p.id === 'self');
    if (!selfParticipant) return;

    const newMutedState = !selfParticipant.isMuted;

    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !newMutedState;

        if (!newMutedState) {
          setupVoiceDetection(localStream);
        } else {
          cleanupVoiceDetection();
          updateParticipantSpeaking('self', false);
        }
      }
    }

    updateParticipantMuted('self', newMutedState);
  }, [
    participants,
    localStream,
    setupVoiceDetection,
    cleanupVoiceDetection,
    updateParticipantMuted,
    updateParticipantSpeaking,
  ]);

  const handleToggleVideo = useCallback(() => {
    const selfParticipant = participants.find((p) => p.id === 'self');
    if (!selfParticipant) return;

    const newVideoState = !selfParticipant.isVideoOn;

    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = newVideoState;
      }
    }

    updateParticipantVideo('self', newVideoState);
  }, [participants, localStream, updateParticipantVideo]);

  const handleLeaveRoom = useCallback(() => {
    if (isLeaving) return;

    setIsLeaving(true);

    if (isRecording) {
      stopRecording();
    }

    cleanupVoiceDetection();
    leaveRoom();

    sessionStorage.removeItem('currentRoom');
    navigate('/');
  }, [isLeaving, isRecording, stopRecording, cleanupVoiceDetection, leaveRoom, navigate]);

  const copyRoomId = useCallback(() => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
    }
  }, [roomId]);

  const getInviteLink = useCallback(() => {
    if (!roomId) return '';
    return `${window.location.origin}/room/join?roomId=${encodeURIComponent(roomId)}`;
  }, [roomId]);

  const handleInviteClick = useCallback(() => {
    setShowInviteDropdown((prev) => !prev);
    setInviteLinkCopied(false);
  }, []);

  const handleCopyInviteLink = useCallback(() => {
    const link = getInviteLink();
    if (link) {
      navigator.clipboard.writeText(link);
      setInviteLinkCopied(true);
      setTimeout(() => setInviteLinkCopied(false), 2000);
    }
  }, [getInviteLink]);

  useEffect(() => {
    if (!showInviteDropdown) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowInviteDropdown(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (inviteDropdownRef.current && !inviteDropdownRef.current.contains(e.target as Node)) {
        setShowInviteDropdown(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showInviteDropdown]);

  const getInitials = useCallback((name: string): string => {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }, []);

  if (!roomId || !roomName) {
    return (
      <div className="recording-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#9ca3af' }}>Loading room...</p>
      </div>
    );
  }

  return (
    <div className="recording-page">
      <header className="recording-header">
        <div className="recording-header-content">
          <div className="recording-header-left">
            <h1>{roomName}</h1>
            <div className="recording-room-id">
              <code>{roomId}</code>
              <button onClick={copyRoomId} className="recording-copy-btn" title="Copy Room ID">
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div className="recording-header-right">
            {isRecording && (
              <div className="recording-timer">
                <span className="recording-indicator"></span>
                <span className="recording-time">{formatTime(recordingTime)}</span>
              </div>
            )}
            <Button
              onClick={handleLeaveRoom}
              disabled={isLeaving}
              loading={isLeaving}
              variant="danger"
              size="sm"
              icon={
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
              }
            >
              {isLeaving ? 'Leaving...' : 'Leave Room'}
            </Button>
          </div>
        </div>
      </header>

      <main className="recording-main">
        <div className="recording-video-section">
          <div className="recording-video-grid">
            {participants.map((participant) => (
              <div
                key={participant.id}
                className={`participant-card ${participant.isSpeaking && !participant.isMuted ? 'speaking' : ''}`}
              >
                <div className="participant-video">
                  <video
                    ref={participant.id === 'self' ? videoRef : null}
                    autoPlay
                    playsInline
                    muted={participant.id === 'self'}
                    className="participant-video-stream"
                    style={{ display: participant.isVideoOn ? 'block' : 'none' }}
                  />
                  {!participant.isVideoOn && (
                    <div className="participant-avatar">{getInitials(participant.name)}</div>
                  )}
                </div>

                <div className="participant-info">
                  <div className="participant-info-content">
                    <span className="participant-name">
                      <span>{participant.name}</span>
                      {participant.isHost && <span className="participant-host-badge">Host</span>}
                    </span>
                    <div className="participant-status">
                      {participant.isMuted && (
                        <span className="status-muted">
                          <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="recording-sidebar">
          <div className="sidebar-header">
            <h2>Participants ({participants.length})</h2>
          </div>

          <div className="sidebar-content">
            <div className="participants-list">
              {participants.map((participant) => (
                <div key={participant.id} className="participant-item">
                  <div className="participant-item-avatar">{getInitials(participant.name)}</div>
                  <div className="participant-item-info">
                    <p className="participant-item-name">
                      {participant.name}
                      {participant.id === 'self' && ' (You)'}
                    </p>
                    {participant.isHost && <p className="participant-item-role">Host</p>}
                  </div>
                </div>
              ))}
            </div>

            <div className="sidebar-invite">
              <div ref={inviteDropdownRef} style={{ position: 'relative' }}>
                {showInviteDropdown && (
                  <div className="invite-dropdown">
                    <label className="invite-dropdown-label">Lien d&apos;invitation</label>
                    <div className="invite-input-container">
                      <input
                        type="text"
                        value={getInviteLink()}
                        readOnly
                        className="invite-input"
                      />
                      <button
                        onClick={handleCopyInviteLink}
                        className="invite-copy-btn"
                        title="Copier le lien"
                      >
                        {inviteLinkCopied ? (
                          <svg
                            width="20"
                            height="20"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        ) : (
                          <svg
                            width="20"
                            height="20"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                    <div className="invite-dropdown-arrow"></div>
                  </div>
                )}
                <div>
                  <Button
                    variant="secondary"
                    fullWidth
                    onClick={handleInviteClick}
                    aria-expanded={showInviteDropdown}
                    aria-haspopup="true"
                    icon={
                      <svg
                        width="20"
                        height="20"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                        />
                      </svg>
                    }
                  >
                    Inviter
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </main>

      <footer className="recording-controls">
        <div className="recording-controls-content">
          <IconButton
            className={`control-btn control-btn-mute ${participants.find((p) => p.id === 'self')?.isMuted ? 'active' : ''}`}
            onClick={handleToggleMute}
            aria-label={participants.find((p) => p.id === 'self')?.isMuted ? 'Unmute' : 'Mute'}
            size="lg"
            variant="ghost"
            icon={
              participants.find((p) => p.id === 'self')?.isMuted ? (
                <svg width="24" height="24" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg width="24" height="24" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                    clipRule="evenodd"
                  />
                </svg>
              )
            }
          />

          <IconButton
            className={`control-btn control-btn-video ${participants.find((p) => p.id === 'self')?.isVideoOn ? '' : 'active'}`}
            onClick={handleToggleVideo}
            aria-label={
              participants.find((p) => p.id === 'self')?.isVideoOn ? 'Stop Video' : 'Start Video'
            }
            size="lg"
            variant="ghost"
            icon={
              participants.find((p) => p.id === 'self')?.isVideoOn ? (
                <svg width="24" height="24" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                </svg>
              ) : (
                <svg width="24" height="24" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                    clipRule="evenodd"
                  />
                </svg>
              )
            }
          />

          {isHost && (
            <IconButton
              className={`control-btn control-btn-record ${isRecording ? 'recording' : ''}`}
              onClick={handleToggleRecording}
              aria-label={isRecording ? 'Stop Recording' : 'Start Recording'}
              size="lg"
              variant={isRecording ? 'danger' : 'ghost'}
              icon={
                <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                  {isRecording ? (
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  ) : (
                    <circle cx="12" cy="12" r="8" />
                  )}
                </svg>
              }
            />
          )}

          <IconButton
            className="control-btn control-btn-screen"
            aria-label="Share Screen"
            size="lg"
            variant="ghost"
            icon={
              <svg width="24" height="24" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M3 4a1 1 0 011-1h12a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm3 2.5a.5.5 0 01.5-.5h1a.5.5 0 010 1h-1a.5.5 0 01-.5-.5zm3 0a.5.5 0 01.5-.5h1a.5.5 0 010 1h-1a.5.5 0 01-.5-.5zm3 0a.5.5 0 01.5-.5h1a.5.5 0 010 1h-1a.5.5 0 01-.5-.5zm-6 3a.5.5 0 01.5-.5h1a.5.5 0 010 1h-1a.5.5 0 01-.5-.5zm3 0a.5.5 0 01.5-.5h1a.5.5 0 010 1h-1a.5.5 0 01-.5-.5zm3 0a.5.5 0 01.5-.5h1a.5.5 0 010 1h-1a.5.5 0 01-.5-.5zM7 16a1 1 0 011-1h4a1 1 0 010 2H8a1 1 0 01-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            }
          />
        </div>
      </footer>
    </div>
  );
}
