import { useCallback, useEffect, useRef, useState } from 'react';
import { CloudflareCalls, TrackInfo } from '../lib/CloudflareCalls';

export interface UseCloudflareCallsOptions {
  appId: string;
  signalingUrl: string;
  onTrackAdded?: (track: MediaStreamTrack, trackInfo: TrackInfo, participantId: string) => void;
  onTrackRemoved?: (trackId: string) => void;
  onError?: (error: Error) => void;
}

export interface RemoteParticipant {
  id: string;
  sessionId: string;
  audioTrack?: MediaStreamTrack;
  videoTrack?: MediaStreamTrack;
}

export function useCloudfareCalls(options: UseCloudflareCallsOptions) {
  const { appId, signalingUrl, onTrackAdded, onTrackRemoved, onError } = options;

  const clientRef = useRef<CloudflareCalls | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [localTracks, setLocalTracks] = useState<TrackInfo[]>([]);
  const [remoteParticipants, setRemoteParticipants] = useState<Map<string, RemoteParticipant>>(
    new Map()
  );

  // Store callbacks in refs to avoid re-creating client
  const onTrackAddedRef = useRef(onTrackAdded);
  const onTrackRemovedRef = useRef(onTrackRemoved);
  const onErrorRef = useRef(onError);

  // Update refs when callbacks change
  useEffect(() => {
    onTrackAddedRef.current = onTrackAdded;
    onTrackRemovedRef.current = onTrackRemoved;
    onErrorRef.current = onError;
  }, [onTrackAdded, onTrackRemoved, onError]);

  // Initialize client only once per appId
  useEffect(() => {
    const client = new CloudflareCalls({ appId });

    client.onConnectionStateChange = (state) => {
      setIsConnected(state === 'connected');
    };

    client.onTrackAdded = (track, trackInfo) => {
      // Extract participant ID from track name (format: sessionId-kind-trackId)
      // The sessionId is 64 chars, then -kind- then trackId (UUID format)
      // Example: bf7a989d67e9986ac39b4693cf8eab82d9d46a3ffb4f9559340bd3a66b7ccb2a-video-f57cff80-1fbe-4ba4-9710-e544ad7d8549
      const trackName = trackInfo.trackName;
      const kindMatch = trackName.match(/-(audio|video)-/);
      if (!kindMatch) {
        console.error('Invalid track name format:', trackName);
        return;
      }
      const kindIndex = trackName.indexOf(kindMatch[0]);
      const participantSessionId = trackName.substring(0, kindIndex);

      setRemoteParticipants((prev) => {
        const updated = new Map(prev);
        const participant = updated.get(participantSessionId) || {
          id: participantSessionId,
          sessionId: participantSessionId,
        };

        if (track.kind === 'audio') {
          participant.audioTrack = track;
        } else if (track.kind === 'video') {
          participant.videoTrack = track;
        }

        updated.set(participantSessionId, participant);
        return updated;
      });

      onTrackAddedRef.current?.(track, trackInfo, participantSessionId);
    };

    client.onTrackRemoved = (trackId) => {
      onTrackRemovedRef.current?.(trackId);
    };

    client.onError = (error) => {
      onErrorRef.current?.(error);
    };

    clientRef.current = client;

    return () => {
      client.close();
      clientRef.current = null;
    };
  }, [appId]);

  // Create session and initialize
  const connect = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;

    try {
      await client.initialize();
      const session = await client.createSession(signalingUrl);
      setSessionId(session.sessionId);
      return session.sessionId;
    } catch (error) {
      onError?.(error as Error);
      throw error;
    }
  }, [signalingUrl, onError]);

  // Publish local tracks
  const publishTracks = useCallback(
    async (tracks: MediaStreamTrack[]) => {
      const client = clientRef.current;
      console.log('publishTracks: client exists?', !!client, 'sessionId:', client?.getSessionId());
      if (!client || !client.getSessionId()) {
        throw new Error('Must connect before publishing tracks');
      }

      try {
        const trackInfos = await client.pushTracks(tracks, signalingUrl);
        setLocalTracks(trackInfos);
        return trackInfos;
      } catch (error) {
        onError?.(error as Error);
        throw error;
      }
    },
    [signalingUrl, onError]
  );

  // Subscribe to remote participant tracks
  const subscribeToParticipant = useCallback(
    async (participantSessionId: string, trackNames: string[], retryCount = 0) => {
      const client = clientRef.current;
      if (!client || !client.getSessionId()) {
        throw new Error('Must connect before subscribing');
      }

      try {
        const tracksToPull = trackNames.map((trackName) => ({
          sessionId: participantSessionId,
          trackName,
        }));

        await client.pullTracks(tracksToPull, signalingUrl);
      } catch (error) {
        const errorMessage = (error as Error).message || '';

        // Retry on "Track not found" errors (timing issue)
        if (errorMessage.includes('Track not found') && retryCount < 3) {
          console.log(`Track not found, retrying in ${(retryCount + 1) * 500}ms... (attempt ${retryCount + 1}/3)`);
          await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 500));
          return subscribeToParticipant(participantSessionId, trackNames, retryCount + 1);
        }

        onError?.(error as Error);
        throw error;
      }
    },
    [signalingUrl, onError]
  );

  // Update track state (mute/unmute)
  const setTrackEnabled = useCallback(async (trackName: string, enabled: boolean) => {
    const client = clientRef.current;
    if (!client) return;

    await client.updateTrack(trackName, enabled);
  }, []);

  // Disconnect
  const disconnect = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;

    await client.close();
    setSessionId(null);
    setIsConnected(false);
    setLocalTracks([]);
    setRemoteParticipants(new Map());
  }, []);

  return {
    sessionId,
    isConnected,
    localTracks,
    remoteParticipants,
    connect,
    publishTracks,
    subscribeToParticipant,
    setTrackEnabled,
    disconnect,
  };
}

export default useCloudfareCalls;
