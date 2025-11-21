import { useEffect, useRef, useCallback, useState, type ReactElement } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { invoke } from '../lib/tauri';
import { AbstractBackground } from '../components/ui';
import { useRoomStore, useRecordingStore, useSettingsStore } from '../stores';
import { useCloudfareCalls } from '../hooks/useCloudfareCalls';
import { useMediaRecorder } from '../hooks/useMediaRecorder';
import { useMediaDevices } from '../hooks/useMediaDevices';
import * as Recording from '../lib/recording';
import './RecordingPage.css';
import type { TrackInfo } from '../lib/CloudflareCalls';

const SPEAKING_THRESHOLD = 25;
const VOICE_UPDATE_INTERVAL = 100;

export default function RecordingPage(): ReactElement {
  const { roomId: urlRoomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  // Stores
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
    addParticipant,
    removeParticipant,
    updateParticipantSpeaking,
    updateParticipantMuted,
    updateParticipantVideo,
  } = useRoomStore();

  const { isRecording, recordingTime, startRecording, stopRecording, incrementRecordingTime } =
    useRecordingStore();

  const {
    audioSettings,
    videoSettings,
    selectedAudioInput,
    selectedVideoInput,
    selectedAudioOutput,
    setSelectedAudioInput,
    setSelectedVideoInput,
    setSelectedAudioOutput,
  } = useSettingsStore();
  const mediaRecorder = useMediaRecorder();
  const {
    audioInputDevices,
    audioOutputDevices,
    videoInputDevices,
    refresh: refreshDevices,
  } = useMediaDevices();

  // Refresh devices when local stream is available
  useEffect(() => {
    if (localStream) {
      refreshDevices();
    }
  }, [localStream, refreshDevices]);

  // State
  const [isLeaving, setIsLeaving] = useState(false);
  const [error, setError] = useState('');
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [roomIdCopied, setRoomIdCopied] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const participantsRecordingRef = useRef<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const localTracksRef = useRef<TrackInfo[]>([]);
  const sessionToParticipantRef = useRef<Map<string, string>>(new Map());
  const isInitializedRef = useRef(false);
  const isRecordingRef = useRef(isRecording);
  const mediaRecorderRef = useRef(mediaRecorder);

  // Keep refs updated
  useEffect(() => {
    isRecordingRef.current = isRecording;
    mediaRecorderRef.current = mediaRecorder;
  }, [isRecording, mediaRecorder]);

  const signalingServerUrl = import.meta.env.VITE_SIGNALING_SERVER_URL || 'http://localhost:3001';

  // Cloudflare Calls
  const {
    connect: cloudflareConnect,
    publishTracks,
    subscribeToParticipant,
    setTrackEnabled,
    disconnect: cloudflareDisconnect,
  } = useCloudfareCalls({
    appId: import.meta.env.VITE_CLOUDFLARE_APP_ID || '',
    signalingUrl: signalingServerUrl,
    onTrackAdded: (track, _trackInfo, sessionId) => {
      const participantId = sessionToParticipantRef.current.get(sessionId) || sessionId;
      const videoElement = remoteVideoRefs.current.get(participantId);

      if (videoElement && track.kind === 'video') {
        videoElement.srcObject = new MediaStream([track]);
      }

      if (track.kind === 'video') {
        updateParticipantVideo(participantId, track.enabled);
      } else if (track.kind === 'audio') {
        updateParticipantMuted(participantId, !track.enabled);
        const audioElement = document.createElement('audio');
        audioElement.srcObject = new MediaStream([track]);
        audioElement.autoplay = true;
        audioElement.id = `audio-${participantId}`;
        document.body.appendChild(audioElement);
      }
    },
    onTrackRemoved: () => {},
    onError: (err) => console.error('Cloudflare Calls error:', err),
  });

  // Voice detection
  const setupVoiceDetection = useCallback(
    (stream: MediaStream) => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close();

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
          updateParticipantSpeaking('self', average > SPEAKING_THRESHOLD);
          animationFrameRef.current = requestAnimationFrame(checkVoiceActivity);
        };

        animationFrameRef.current = requestAnimationFrame(checkVoiceActivity);
      } catch (err) {
        console.error('Voice detection error:', err);
      }
    },
    [updateParticipantSpeaking]
  );

  const cleanupVoiceDetection = useCallback(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close();
  }, []);

  // Initialize room from session storage
  useEffect(() => {
    if (!roomId || roomId !== urlRoomId) {
      const storedRoom = sessionStorage.getItem('currentRoom');
      if (storedRoom) {
        const info = JSON.parse(storedRoom);
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
        navigate('/');
      }
    }
  }, [roomId, urlRoomId, setRoom, navigate]);

  // Initialize media
  useEffect(() => {
    const initializeMedia = async () => {
      if (!mediaSettings) return;

      try {
        const constraints: MediaStreamConstraints = {
          video: mediaSettings.videoEnabled
            ? {
                ...(mediaSettings.selectedVideoDevice
                  ? { deviceId: { exact: mediaSettings.selectedVideoDevice } }
                  : {}),
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 60 },
              }
            : false,
          audio: mediaSettings.audioEnabled
            ? {
                ...(mediaSettings.selectedAudioDevice
                  ? { deviceId: { exact: mediaSettings.selectedAudioDevice } }
                  : {}),
                sampleRate: { ideal: 48000 },
                channelCount: { ideal: 2 },
                echoCancellation: audioSettings.echoCancellation,
                noiseSuppression: audioSettings.noiseSuppression,
                autoGainControl: audioSettings.autoGainControl,
              }
            : false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        setLocalStream(stream);

        if (videoRef.current && mediaSettings.videoEnabled) {
          videoRef.current.srcObject = stream;
        }

        // Update participant state
        updateParticipantVideo('self', mediaSettings.videoEnabled);
        updateParticipantMuted('self', !mediaSettings.audioEnabled);

        if (mediaSettings.audioEnabled) {
          setupVoiceDetection(stream);
        }
      } catch (err) {
        console.warn('Media access error:', err);
        updateParticipantMuted('self', true);
        updateParticipantVideo('self', false);
      }
    };

    initializeMedia();
    return () => cleanupVoiceDetection();
  }, [
    mediaSettings,
    audioSettings,
    setupVoiceDetection,
    cleanupVoiceDetection,
    setLocalStream,
    updateParticipantMuted,
    updateParticipantVideo,
  ]);

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      localStream?.getTracks().forEach((track) => track.stop());
    };
  }, [localStream]);

  // Initialize Cloudflare Calls
  useEffect(() => {
    if (!roomId || !localStream || isInitializedRef.current) return;

    let isCancelled = false;

    const initializeCloudflare = async () => {
      try {
        const storedRoom = sessionStorage.getItem('currentRoom');
        if (!storedRoom) return;

        const roomInfo = JSON.parse(storedRoom);
        if (!roomInfo.token || !roomInfo.participantId) return;

        isInitializedRef.current = true;
        const sessionId = await cloudflareConnect();
        if (isCancelled) return;

        const tracks = localStream.getTracks();
        const trackInfos = await publishTracks(tracks);
        if (isCancelled) return;

        localTracksRef.current = trackInfos;

        const wsUrl = signalingServerUrl.replace('http', 'ws') + '/ws';
        const ws = new WebSocket(`${wsUrl}?token=${roomInfo.token}`);
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              type: 'cloudflare-session',
              roomId,
              participantId: roomInfo.participantId,
              participantName: roomInfo.userName,
              sessionId,
              tracks: localTracksRef.current.map((t) => ({ trackName: t.trackName, kind: t.kind })),
            })
          );
        };

        ws.onmessage = async (event) => {
          try {
            const message = JSON.parse(event.data);

            switch (message.type) {
              case 'cloudflare-session': {
                const {
                  participantId,
                  participantName,
                  sessionId: remoteSessionId,
                  tracks: remoteTracks,
                } = message;
                if (participantId === roomInfo.participantId) return;

                sessionToParticipantRef.current.set(remoteSessionId, participantId);
                addParticipant({
                  id: participantId,
                  name: participantName,
                  isHost: false,
                  isSpeaking: false,
                  isMuted: true,
                  isVideoOn: false,
                });

                if (remoteTracks?.length > 0) {
                  await subscribeToParticipant(
                    remoteSessionId,
                    remoteTracks.map((t: { trackName: string }) => t.trackName)
                  );
                }
                break;
              }

              case 'participant-left':
              case 'leave': {
                const participantId = message.participantId || message.from;
                if (!participantId || participantId === roomInfo.participantId) break;

                removeParticipant(participantId);
                remoteVideoRefs.current.delete(participantId);
                document.getElementById(`audio-${participantId}`)?.remove();

                if (isRecordingRef.current && participantsRecordingRef.current.has(participantId)) {
                  mediaRecorderRef.current.stopRecording(participantId).catch(console.error);
                  participantsRecordingRef.current.delete(participantId);
                }
                break;
              }

              case 'track-state': {
                const { participantId, kind, enabled } = message;
                if (kind === 'video') updateParticipantVideo(participantId, enabled);
                else if (kind === 'audio') updateParticipantMuted(participantId, !enabled);
                break;
              }

              case 'existing-participants': {
                for (const p of message.participants) {
                  if (p.participantId === roomInfo.participantId) continue;
                  addParticipant({
                    id: p.participantId,
                    name: p.participantName,
                    isHost: false,
                    isSpeaking: false,
                    isMuted: true,
                    isVideoOn: false,
                  });
                  if (p.sessionId && p.tracks?.length > 0) {
                    await subscribeToParticipant(
                      p.sessionId,
                      p.tracks.map((t: { trackName: string }) => t.trackName)
                    );
                  }
                }
                break;
              }
            }
          } catch (err) {
            console.error('WebSocket message error:', err);
          }
        };

        ws.onerror = (err) => console.error('WebSocket error:', err);
      } catch (err) {
        console.error('Failed to initialize Cloudflare Calls:', err);
      }
    };

    initializeCloudflare();

    return () => {
      isCancelled = true;
      isInitializedRef.current = false;
      cloudflareDisconnect();
      wsRef.current?.close();
      document.querySelectorAll('[id^="audio-"]').forEach((el) => el.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, localStream]);

  // Recording timer
  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(incrementRecordingTime, 1000);
    return () => clearInterval(interval);
  }, [isRecording, incrementRecordingTime]);

  // Format time
  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Handlers
  const handleToggleMute = useCallback(() => {
    const self = participants.find((p) => p.id === 'self');
    if (!self) return;

    const newMuted = !self.isMuted;

    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !newMuted;
        if (!newMuted) setupVoiceDetection(localStream);
        else {
          cleanupVoiceDetection();
          updateParticipantSpeaking('self', false);
        }
      }
    }

    updateParticipantMuted('self', newMuted);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: 'track-state', kind: 'audio', enabled: !newMuted })
      );
    }

    const audioTrackInfo = localTracksRef.current.find((t) => t.kind === 'audio');
    if (audioTrackInfo) setTrackEnabled(audioTrackInfo.trackName, !newMuted);
  }, [
    participants,
    localStream,
    setupVoiceDetection,
    cleanupVoiceDetection,
    updateParticipantMuted,
    updateParticipantSpeaking,
    setTrackEnabled,
  ]);

  const handleToggleVideo = useCallback(() => {
    const self = participants.find((p) => p.id === 'self');
    if (!self) return;

    const newVideoOn = !self.isVideoOn;

    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) videoTrack.enabled = newVideoOn;
    }

    updateParticipantVideo('self', newVideoOn);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: 'track-state', kind: 'video', enabled: newVideoOn })
      );
    }

    const videoTrackInfo = localTracksRef.current.find((t) => t.kind === 'video');
    if (videoTrackInfo) setTrackEnabled(videoTrackInfo.trackName, newVideoOn);
  }, [participants, localStream, updateParticipantVideo, setTrackEnabled]);

  const handleToggleRecording = useCallback(async () => {
    if (isRecording) {
      try {
        await Promise.all(participants.map((p) => mediaRecorder.stopRecording(p.id)));
        const metadata = await Recording.stopRecording();
        stopRecording();
        participantsRecordingRef.current.clear();

        const duration = `${Math.floor(metadata.durationSeconds / 60)}:${(metadata.durationSeconds % 60).toString().padStart(2, '0')}`;
        setError(`Recording saved! Duration: ${duration}`);
        setTimeout(() => setError(''), 3000);
      } catch (err) {
        setError(`Failed to stop recording: ${err}`);
      }
    } else {
      try {
        const outputDir = await invoke<string>('get_recording_directory');
        await Recording.startRecording({
          roomId: roomId || 'unknown',
          outputDir,
          audioSampleRate: audioSettings.sampleRate,
          audioChannels: audioSettings.channelCount,
          videoWidth: videoSettings.width,
          videoHeight: videoSettings.height,
          videoFps: videoSettings.frameRate,
        });

        for (const participant of participants) {
          const stream = participant.id === 'self' ? localStream : participant.stream;
          if (!stream) continue;

          await Recording.addParticipantTrack(participant.id, participant.name, true, true);
          await mediaRecorder.startRecording(participant.id, stream);
          participantsRecordingRef.current.add(participant.id);
        }

        startRecording();
      } catch (err) {
        setError(`Failed to start recording: ${err}`);
      }
    }
  }, [
    isRecording,
    participants,
    localStream,
    mediaRecorder,
    roomId,
    audioSettings,
    videoSettings,
    startRecording,
    stopRecording,
  ]);

  const handleToggleSpeaker = useCallback(() => {
    const newEnabled = !speakerEnabled;
    setSpeakerEnabled(newEnabled);

    // Mute/unmute all remote audio elements
    document.querySelectorAll<HTMLAudioElement>('[id^="audio-"]').forEach((el) => {
      el.muted = !newEnabled;
    });
  }, [speakerEnabled]);

  // Handle device changes
  const handleAudioInputChange = useCallback(
    async (deviceId: string) => {
      setSelectedAudioInput(deviceId);
      if (!localStream) return;

      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: deviceId },
            sampleRate: { ideal: 48000 },
            channelCount: { ideal: 2 },
            echoCancellation: audioSettings.echoCancellation,
            noiseSuppression: audioSettings.noiseSuppression,
            autoGainControl: audioSettings.autoGainControl,
          },
        });
        const newAudioTrack = newStream.getAudioTracks()[0];
        const oldAudioTrack = localStream.getAudioTracks()[0];

        if (oldAudioTrack) {
          localStream.removeTrack(oldAudioTrack);
          oldAudioTrack.stop();
        }
        localStream.addTrack(newAudioTrack);

        // Update track enabled state
        const self = participants.find((p) => p.id === 'self');
        newAudioTrack.enabled = !self?.isMuted;

        if (!self?.isMuted) {
          setupVoiceDetection(localStream);
        }
      } catch (err) {
        console.error('Failed to switch audio device:', err);
      }
    },
    [localStream, participants, setSelectedAudioInput, setupVoiceDetection, audioSettings]
  );

  const handleVideoInputChange = useCallback(
    async (deviceId: string) => {
      setSelectedVideoInput(deviceId);
      if (!localStream) return;

      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: deviceId },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 60 },
          },
        });
        const newVideoTrack = newStream.getVideoTracks()[0];
        const oldVideoTrack = localStream.getVideoTracks()[0];

        if (oldVideoTrack) {
          localStream.removeTrack(oldVideoTrack);
          oldVideoTrack.stop();
        }
        localStream.addTrack(newVideoTrack);

        // Update video element
        if (videoRef.current) {
          videoRef.current.srcObject = localStream;
        }

        // Update track enabled state
        const self = participants.find((p) => p.id === 'self');
        newVideoTrack.enabled = self?.isVideoOn ?? true;
      } catch (err) {
        console.error('Failed to switch video device:', err);
      }
    },
    [localStream, participants, setSelectedVideoInput]
  );

  const handleAudioOutputChange = useCallback(
    (deviceId: string) => {
      setSelectedAudioOutput(deviceId);
      // Set audio output on all remote audio elements
      document.querySelectorAll<HTMLAudioElement>('[id^="audio-"]').forEach((el) => {
        if ('setSinkId' in el) {
          (el as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> })
            .setSinkId(deviceId)
            .catch(console.error);
        }
      });
    },
    [setSelectedAudioOutput]
  );

  const handleLeave = useCallback(() => {
    if (isLeaving) return;
    setIsLeaving(true);
    if (isRecording) stopRecording();
    cleanupVoiceDetection();

    // Navigate first, then cleanup
    navigate('/', { replace: true });
    leaveRoom();
    sessionStorage.removeItem('currentRoom');
  }, [isLeaving, isRecording, stopRecording, cleanupVoiceDetection, leaveRoom, navigate]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key.toLowerCase()) {
        case 'm':
          handleToggleMute();
          break;
        case 'v':
          handleToggleVideo();
          break;
        case 's':
          handleToggleSpeaker();
          break;
        case 'r':
          if (isHost) handleToggleRecording();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToggleMute, handleToggleVideo, handleToggleSpeaker, handleToggleRecording, isHost]);

  const getDeviceLabel = (device: { label: string }, index: number): string => {
    return device.label || `Device ${index + 1}`;
  };

  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const self = participants.find((p) => p.id === 'self');

  if (!roomId || !roomName) {
    return (
      <AbstractBackground>
        <div className="call-page">
          <p className="call-loading">Loading room...</p>
        </div>
      </AbstractBackground>
    );
  }

  // Format room ID for display
  const formattedRoomId = roomId ? `${roomId.slice(0, 3)}-${roomId.slice(3)}` : '';

  const handleCopyRoomId = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
      setRoomIdCopied(true);
      setTimeout(() => setRoomIdCopied(false), 1500);
    }
  };

  return (
    <AbstractBackground>
      <div className="call-page">
        {/* Recording indicator */}
        {isRecording && (
          <div className="call-recording-indicator">
            <span className="recording-dot" />
            <span className="recording-time">{formatTime(recordingTime)}</span>
          </div>
        )}

        {/* Error/Success message */}
        {error && (
          <div className="call-message">
            <p>{error}</p>
          </div>
        )}

        {/* Video Grid */}
        <main className="call-grid" data-count={Math.min(participants.length, 9)}>
          {participants.map((participant) => (
            <div
              key={participant.id}
              className={`call-participant ${participant.isSpeaking && !participant.isMuted ? 'speaking' : ''}`}
            >
              <video
                ref={(el) => {
                  if (participant.id === 'self' && el) videoRef.current = el;
                  else if (el) remoteVideoRefs.current.set(participant.id, el);
                }}
                autoPlay
                playsInline
                muted={participant.id === 'self'}
                className={`participant-video ${!participant.isVideoOn ? 'hidden' : ''}`}
              />
              {!participant.isVideoOn && (
                <div className="participant-avatar">{getInitials(participant.name)}</div>
              )}
              <div className="participant-info">
                <span className="participant-name">{participant.name}</span>
                {participant.isMuted && (
                  <span className="participant-muted">
                    <svg fill="currentColor" viewBox="0 0 20 20">
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
          ))}
        </main>

        {/* Controls */}
        <footer className="call-controls">
          {/* Room ID */}
          <button
            type="button"
            className={`room-id-btn ${roomIdCopied ? 'copied' : ''}`}
            onClick={handleCopyRoomId}
            aria-label="Copy room ID"
          >
            <span className="room-id-text">{formattedRoomId}</span>
            <svg fill="currentColor" viewBox="0 0 20 20">
              <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
              <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
            </svg>
          </button>

          <div className="controls-center">
            {/* Microphone with select */}
            <div className="media-control-group">
              <button
                type="button"
                className={`control-btn ${self?.isMuted ? 'control-btn--off' : ''}`}
                onClick={handleToggleMute}
                aria-label={self?.isMuted ? 'Unmute' : 'Mute'}
              >
                {self?.isMuted ? (
                  <svg fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <svg fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
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
                  onChange={(e) => handleAudioInputChange(e.target.value)}
                >
                  {audioInputDevices.map((device, index) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {getDeviceLabel(device, index)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Camera with select */}
            <div className="media-control-group">
              <button
                type="button"
                className={`control-btn ${!self?.isVideoOn ? 'control-btn--off' : ''}`}
                onClick={handleToggleVideo}
                aria-label={self?.isVideoOn ? 'Stop video' : 'Start video'}
              >
                {self?.isVideoOn ? (
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
                  onChange={(e) => handleVideoInputChange(e.target.value)}
                >
                  {videoInputDevices.map((device, index) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {getDeviceLabel(device, index)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Speaker with select */}
            <div className="media-control-group">
              <button
                type="button"
                className={`control-btn ${!speakerEnabled ? 'control-btn--off' : ''}`}
                onClick={handleToggleSpeaker}
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
                  onChange={(e) => handleAudioOutputChange(e.target.value)}
                >
                  {audioOutputDevices.map((device, index) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {getDeviceLabel(device, index)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Record button */}
            {isHost && (
              <button
                type="button"
                className={`control-btn control-btn--record ${isRecording ? 'control-btn--recording' : ''}`}
                onClick={handleToggleRecording}
                aria-label={isRecording ? 'Stop recording' : 'Start recording'}
              >
                {isRecording ? (
                  <svg fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                ) : (
                  <svg fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="8" />
                  </svg>
                )}
              </button>
            )}
          </div>

          {/* Leave button */}
          <button
            type="button"
            className="control-btn control-btn--leave"
            onClick={handleLeave}
            disabled={isLeaving}
            aria-label="Leave call"
          >
            <svg fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
            </svg>
          </button>
        </footer>
      </div>
    </AbstractBackground>
  );
}
