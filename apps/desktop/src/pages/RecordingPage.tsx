import { useEffect, useRef, useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { invoke } from '../lib/tauri';
import Button, { IconButton } from '../components/Button';
import { useRoomStore, useRecordingStore, useSettingsStore } from '../stores';
import { useCloudfareCalls } from '../hooks/useCloudfareCalls';
import { useMediaRecorder } from '../hooks/useMediaRecorder';
import * as Recording from '../lib/recording';
import './RecordingPage.css';
import type { ReactElement } from 'react';
import type { TrackInfo } from '../lib/CloudflareCalls';

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
    addParticipant,
    removeParticipant,
    updateParticipantSpeaking,
    updateParticipantMuted,
    updateParticipantVideo,
  } = useRoomStore();

  const { isRecording, recordingTime, startRecording, stopRecording, incrementRecordingTime } =
    useRecordingStore();

  // Settings store
  const { audioSettings, videoSettings } = useSettingsStore();

  // Media recorder hook for Rust integration
  const mediaRecorder = useMediaRecorder();

  // Local UI state
  const [isLeaving, setIsLeaving] = useState(false);
  const [showInviteDropdown, setShowInviteDropdown] = useState(false);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [showRecordingInfo, setShowRecordingInfo] = useState(false);
  const [recordingParticipantsCount, setRecordingParticipantsCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const inviteDropdownRef = useRef<HTMLDivElement>(null);
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const participantsRecordingRef = useRef<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const localTracksRef = useRef<TrackInfo[]>([]);
  // Map Cloudflare sessionId to participant UUID
  const sessionToParticipantRef = useRef<Map<string, string>>(new Map());

  // Get signaling URL from env
  const signalingServerUrl = import.meta.env.VITE_SIGNALING_SERVER_URL || 'http://localhost:3001';

  // Cloudflare Calls SFU
  const cloudflare = useCloudfareCalls({
    appId: import.meta.env.VITE_CLOUDFLARE_APP_ID || '',
    signalingUrl: signalingServerUrl,
    onTrackAdded: (track, _trackInfo, sessionId) => {
      // Map sessionId to participant UUID
      const participantId = sessionToParticipantRef.current.get(sessionId) || sessionId;
      console.log(`Track added from ${participantId} (session: ${sessionId}): ${track.kind}`);

      // Update video element for this participant
      const videoElement = remoteVideoRefs.current.get(participantId);
      if (videoElement && track.kind === 'video') {
        const stream = new MediaStream([track]);
        videoElement.srcObject = stream;
      }

      // Update participant state
      if (track.kind === 'video') {
        updateParticipantVideo(participantId, track.enabled);
      } else if (track.kind === 'audio') {
        updateParticipantMuted(participantId, !track.enabled);
      }

      // Handle audio playback
      if (track.kind === 'audio') {
        const audioElement = document.createElement('audio');
        audioElement.srcObject = new MediaStream([track]);
        audioElement.autoplay = true;
        audioElement.id = `audio-${participantId}`;
        document.body.appendChild(audioElement);
      }
    },
    onTrackRemoved: (trackId) => {
      console.log(`Track removed: ${trackId}`);
    },
    onError: (error) => {
      console.error('Cloudflare Calls error:', error);
    },
  });

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
            ? {
                ...(mediaSettings.selectedVideoDevice && mediaSettings.selectedVideoDevice !== ''
                  ? { deviceId: { exact: mediaSettings.selectedVideoDevice } }
                  : {}),
                // Request highest quality, let browser pick best available
                width: { ideal: 4096 },
                height: { ideal: 2160 },
                frameRate: { ideal: 60 },
                aspectRatio: { ideal: videoSettings.aspectRatio === '16:9' ? 16 / 9 : 4 / 3 },
              }
            : false,
          audio: mediaSettings.audioEnabled
            ? {
                ...(mediaSettings.selectedAudioDevice && mediaSettings.selectedAudioDevice !== ''
                  ? { deviceId: { exact: mediaSettings.selectedAudioDevice } }
                  : {}),
                // Force highest audio quality (48kHz is WebRTC max)
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

        // Log actual video resolution
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const settings = videoTrack.getSettings();
          console.log('Video track settings:', {
            width: settings.width,
            height: settings.height,
            frameRate: settings.frameRate,
            aspectRatio: settings.aspectRatio,
            deviceId: settings.deviceId,
          });
        }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Initialize Cloudflare Calls SFU
  useEffect(() => {
    if (!roomId || !localStream) return;

    const initializeCloudflare = async () => {
      try {
        // Get JWT token from CreateRoomPage or JoinRoomPage
        const storedRoom = sessionStorage.getItem('currentRoom');
        if (!storedRoom) {
          console.error('No room token found');
          return;
        }

        const roomInfo = JSON.parse(storedRoom) as {
          token?: string;
          userName?: string;
          participantId?: string;
        };

        if (!roomInfo.token || !roomInfo.participantId) {
          console.error('No JWT token or participant ID found');
          return;
        }

        // Connect to Cloudflare Calls
        const sessionId = await cloudflare.connect();
        console.log('Connected to Cloudflare Calls, session:', sessionId);

        // Publish local tracks
        const tracks = localStream.getTracks();
        const trackInfos = await cloudflare.publishTracks(tracks);
        localTracksRef.current = trackInfos;
        console.log('Published tracks:', trackInfos);

        // Connect to WebSocket for room signaling
        const wsUrl = signalingServerUrl.replace('http', 'ws') + '/ws';
        const ws = new WebSocket(`${wsUrl}?token=${roomInfo.token}`);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('WebSocket connected');
          console.log('Broadcasting cloudflare-session with tracks:', localTracksRef.current);
          ws.send(JSON.stringify({
            type: 'cloudflare-session',
            roomId,
            participantId: roomInfo.participantId,
            participantName: roomInfo.userName,
            sessionId,
            tracks: localTracksRef.current.map(t => ({
              trackName: t.trackName,
              kind: t.kind,
            })),
          }));
        };

        ws.onmessage = async (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log('WebSocket message received:', message.type, message);

            switch (message.type) {
              case 'cloudflare-session': {
                // Another participant announced their session
                const { participantId, participantName, sessionId: remoteSessionId, tracks: remoteTracks } = message;

                if (participantId === roomInfo.participantId) return;

                console.log(`Participant ${participantName} joined with session ${remoteSessionId}`);

                // Store mapping from sessionId to participantId
                sessionToParticipantRef.current.set(remoteSessionId, participantId);

                // Add participant to UI
                addParticipant({
                  id: participantId,
                  name: participantName,
                  isHost: false,
                  isSpeaking: false,
                  isMuted: true,
                  isVideoOn: false,
                });

                // Subscribe to their tracks
                if (remoteTracks && remoteTracks.length > 0) {
                  await cloudflare.subscribeToParticipant(
                    remoteSessionId,
                    remoteTracks.map((t: { trackName: string }) => t.trackName)
                  );
                }
                break;
              }

              case 'participant-left': {
                const { participantId } = message;
                console.log(`Participant left: ${participantId}`);
                removeParticipant(participantId);
                remoteVideoRefs.current.delete(participantId);

                // Clean up session mapping
                for (const [sessionId, pId] of sessionToParticipantRef.current.entries()) {
                  if (pId === participantId) {
                    sessionToParticipantRef.current.delete(sessionId);
                    break;
                  }
                }

                // Clean up audio element
                const audioEl = document.getElementById(`audio-${participantId}`);
                if (audioEl) audioEl.remove();

                // Stop recording for this participant
                if (isRecording && participantsRecordingRef.current.has(participantId)) {
                  mediaRecorder.stopRecording(participantId).catch((err) => {
                    console.error(`Error stopping recording for ${participantId}:`, err);
                  });
                  participantsRecordingRef.current.delete(participantId);
                  setRecordingParticipantsCount(participantsRecordingRef.current.size);
                }
                break;
              }

              case 'track-state': {
                const { participantId, kind, enabled } = message;
                if (kind === 'video') {
                  updateParticipantVideo(participantId, enabled);
                } else if (kind === 'audio') {
                  updateParticipantMuted(participantId, !enabled);
                }
                break;
              }

              case 'leave': {
                // Handle leave message from server (WsMessage format)
                const participantId = message.from || message.data?.participant_id;
                if (!participantId || participantId === roomInfo.participantId) break;

                console.log(`Participant left: ${participantId}`);
                removeParticipant(participantId);
                remoteVideoRefs.current.delete(participantId);

                // Clean up session mapping
                for (const [sessionId, pId] of sessionToParticipantRef.current.entries()) {
                  if (pId === participantId) {
                    sessionToParticipantRef.current.delete(sessionId);
                    break;
                  }
                }

                // Clean up audio element
                const audioEl = document.getElementById(`audio-${participantId}`);
                if (audioEl) audioEl.remove();

                // Stop recording for this participant
                if (isRecording && participantsRecordingRef.current.has(participantId)) {
                  mediaRecorder.stopRecording(participantId).catch((err) => {
                    console.error(`Error stopping recording for ${participantId}:`, err);
                  });
                  participantsRecordingRef.current.delete(participantId);
                  setRecordingParticipantsCount(participantsRecordingRef.current.size);
                }
                break;
              }

              case 'existing-participants': {
                // When we join, get list of existing participants
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

                  // Subscribe to their tracks
                  if (p.sessionId && p.tracks?.length > 0) {
                    await cloudflare.subscribeToParticipant(
                      p.sessionId,
                      p.tracks.map((t: { trackName: string }) => t.trackName)
                    );
                  }
                }
                break;
              }
            }
          } catch (error) {
            console.error('WebSocket message error:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected');
        };

      } catch (error) {
        console.error('Failed to initialize Cloudflare Calls:', error);
      }
    };

    initializeCloudflare();

    return () => {
      cloudflare.disconnect();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      // Clean up audio elements
      document.querySelectorAll('[id^="audio-"]').forEach(el => el.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, localStream]);

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

  const handleToggleRecording = useCallback(async () => {
    if (isRecording) {
      // Stop recording
      try {
        console.log('Stopping recording...');

        // Stop all participant recorders (process and send final files)
        await Promise.all(
          participants.map((participant) => mediaRecorder.stopRecording(participant.id))
        );

        // Stop Rust recording
        const metadata = await Recording.stopRecording();
        console.log('Recording stopped:', metadata);

        // Update UI state
        stopRecording();
        setRecordingId(null);
        participantsRecordingRef.current.clear();
        setRecordingParticipantsCount(0);

        // Show success message with details
        const participantCount = Object.keys(metadata.participants).length;
        const duration = `${Math.floor(metadata.durationSeconds / 60)}:${(metadata.durationSeconds % 60).toString().padStart(2, '0')}`;

        alert(
          `Recording saved!\n\n` +
            `Duration: ${duration}\n` +
            `Participants: ${participantCount}\n` +
            `Location: ${metadata.outputDirectory}`
        );
      } catch (error) {
        console.error('Failed to stop recording:', error);
        alert(`Failed to stop recording: ${error}`);
      }
    } else {
      // Start recording
      try {
        console.log('Starting recording...');

        // Get recording directory
        const outputDir = await invoke<string>('get_recording_directory');

        // Start Rust recording session with settings from store
        const recId = await Recording.startRecording({
          roomId: roomId || 'unknown',
          outputDir,
          audioSampleRate: audioSettings.sampleRate,
          audioChannels: audioSettings.channelCount,
          videoWidth: videoSettings.width,
          videoHeight: videoSettings.height,
          videoFps: videoSettings.frameRate,
        });

        console.log('Recording started with ID:', recId);
        setRecordingId(recId);

        // Add all current participants to recording
        for (const participant of participants) {
          const stream = participant.id === 'self' ? localStream : participant.stream;
          if (!stream) continue;

          try {
            // Add participant track to Rust recording
            await Recording.addParticipantTrack(
              participant.id,
              participant.name,
              true, // record audio
              true // record video
            );

            // Start MediaRecorder for this participant
            await mediaRecorder.startRecording(participant.id, stream);
            participantsRecordingRef.current.add(participant.id);
            setRecordingParticipantsCount(participantsRecordingRef.current.size);

            console.log(`Started recording for participant: ${participant.name}`);
          } catch (error) {
            console.error(`Failed to add participant ${participant.name}:`, error);
          }
        }

        // Update UI state
        startRecording();
      } catch (error) {
        console.error('Failed to start recording:', error);
        alert(`Failed to start recording: ${error}`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isRecording,
    startRecording,
    stopRecording,
    roomId,
    participants,
    localStream,
    mediaRecorder,
  ]);

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

    // Notify remote peers of audio state change via WebSocket
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'track-state',
        kind: 'audio',
        enabled: !newMutedState,
      }));
    }

    // Update track in Cloudflare
    const audioTrackInfo = localTracksRef.current.find(t => t.kind === 'audio');
    if (audioTrackInfo) {
      cloudflare.setTrackEnabled(audioTrackInfo.trackName, !newMutedState);
    }
  }, [
    participants,
    localStream,
    setupVoiceDetection,
    cleanupVoiceDetection,
    updateParticipantMuted,
    updateParticipantSpeaking,
    cloudflare,
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

    // Notify remote peers of video state change via WebSocket
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'track-state',
        kind: 'video',
        enabled: newVideoState,
      }));
    }

    // Update track in Cloudflare
    const videoTrackInfo = localTracksRef.current.find(t => t.kind === 'video');
    if (videoTrackInfo) {
      cloudflare.setTrackEnabled(videoTrackInfo.trackName, newVideoState);
    }
  }, [participants, localStream, updateParticipantVideo, cloudflare]);

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'm':
          handleToggleMute();
          break;
        case 'v':
          handleToggleVideo();
          break;
        case 'r':
          if (isHost) {
            handleToggleRecording();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToggleMute, handleToggleVideo, handleToggleRecording, isHost]);

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
              <>
                <div className="recording-timer">
                  <span className="recording-indicator"></span>
                  <span className="recording-time">{formatTime(recordingTime)}</span>
                </div>
                <button
                  onClick={() => setShowRecordingInfo(!showRecordingInfo)}
                  className="recording-info-toggle"
                  title="Recording Info"
                  style={{
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#3b82f6',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
                    e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.3)';
                  }}
                >
                  <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Info
                </button>
              </>
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

      {showRecordingInfo && isRecording && (
        <div
          style={{
            background: 'rgba(17, 24, 39, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '12px',
            padding: '20px',
            margin: '16px 24px',
            color: '#e5e7eb',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'start',
              marginBottom: '16px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#f3f4f6' }}>
              Recording Information
            </h3>
            <button
              onClick={() => setShowRecordingInfo(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#9ca3af',
                cursor: 'pointer',
                padding: '4px',
              }}
              title="Close"
            >
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '16px',
            }}
          >
            <div>
              <h4
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#9ca3af',
                }}
              >
                Recording ID
              </h4>
              <p style={{ margin: 0, fontSize: '14px', fontFamily: 'monospace', color: '#f3f4f6' }}>
                {recordingId || 'Loading...'}
              </p>
            </div>

            <div>
              <h4
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#9ca3af',
                }}
              >
                Video Settings
              </h4>
              <p style={{ margin: 0, fontSize: '14px', color: '#f3f4f6' }}>
                {videoSettings.width}x{videoSettings.height} @ {videoSettings.frameRate}fps
              </p>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#9ca3af' }}>
                Aspect Ratio: {videoSettings.aspectRatio}
              </p>
            </div>

            <div>
              <h4
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#9ca3af',
                }}
              >
                Audio Settings
              </h4>
              <p style={{ margin: 0, fontSize: '14px', color: '#f3f4f6' }}>
                {audioSettings.sampleRate / 1000}kHz • {audioSettings.channelCount} ch
              </p>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#9ca3af' }}>
                {audioSettings.echoCancellation && 'Echo Cancellation • '}
                {audioSettings.noiseSuppression && 'Noise Suppression'}
              </p>
            </div>

            <div>
              <h4
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#9ca3af',
                }}
              >
                Participants Recording
              </h4>
              <p style={{ margin: 0, fontSize: '14px', color: '#f3f4f6' }}>
                {recordingParticipantsCount} / {participants.length}
              </p>
            </div>
          </div>
        </div>
      )}

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
                    ref={(el) => {
                      if (participant.id === 'self' && el) {
                        videoRef.current = el;
                      } else if (el) {
                        remoteVideoRefs.current.set(participant.id, el);
                      }
                    }}
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
