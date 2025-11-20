/**
 * Cloudflare Calls SFU Client
 *
 * This replaces the mesh P2P PeerManager with Cloudflare's Selective Forwarding Unit (SFU)
 * for better scalability and quality.
 */

export interface CloudflareCallsConfig {
  appId: string;
  // Session token obtained from your backend (which authenticates with Cloudflare)
  sessionToken?: string;
}

export interface TrackInfo {
  trackId: string;
  trackName: string;
  kind: 'audio' | 'video';
  mid?: string;
}

export interface SessionInfo {
  sessionId: string;
  createdAt: string;
}

export interface PullTrackRequest {
  sessionId: string;
  trackName: string;
}

type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

export class CloudflareCalls {
  private config: CloudflareCallsConfig;
  private peerConnection: RTCPeerConnection | null = null;
  private sessionId: string | null = null;
  private localTracks: Map<string, TrackInfo> = new Map();
  private remoteTracks: Map<string, MediaStreamTrack> = new Map();
  private transceivers: Map<string, RTCRtpTransceiver> = new Map();
  // Map mid to trackName for remote tracks
  private midToTrackName: Map<string, string> = new Map();

  // Event handlers
  public onTrackAdded?: (track: MediaStreamTrack, trackInfo: TrackInfo) => void;
  public onTrackRemoved?: (trackId: string) => void;
  public onConnectionStateChange?: (state: ConnectionState) => void;
  public onError?: (error: Error) => void;

  constructor(config: CloudflareCallsConfig) {
    this.config = config;
    // Config will be used for future features like auth tokens
    void this.config;
  }

  /**
   * Create a new empty session with Cloudflare Calls
   */
  async createSession(signalingUrl: string): Promise<SessionInfo> {
    console.log('createSession called');

    const response = await fetch(`${signalingUrl}/cloudflare/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create session: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    this.sessionId = data.sessionId;
    console.log('Session created:', this.sessionId);

    return {
      sessionId: data.sessionId,
      createdAt: data.createdAt,
    };
  }

  /**
   * Initialize the peer connection
   */
  async initialize(): Promise<void> {
    this.peerConnection = new RTCPeerConnection({
      iceServers: [
        // Cloudflare provides TURN, but we can also add Google STUN as fallback
        { urls: 'stun:stun.cloudflare.com:3478' },
      ],
      bundlePolicy: 'max-bundle',
    });

    this.peerConnection.ontrack = (event) => {
      const track = event.track;
      const transceiver = event.transceiver;
      const mid = transceiver.mid;

      if (mid) {
        this.remoteTracks.set(mid, track);

        // Get the real trackName from our mapping
        const trackName = this.midToTrackName.get(mid) || mid;

        const trackInfo: TrackInfo = {
          trackId: track.id,
          trackName,
          kind: track.kind as 'audio' | 'video',
          mid,
        };

        this.onTrackAdded?.(track, trackInfo);
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      if (this.peerConnection) {
        this.onConnectionStateChange?.(this.peerConnection.connectionState as ConnectionState);
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      if (this.peerConnection?.iceConnectionState === 'failed') {
        this.onError?.(new Error('ICE connection failed'));
      }
    };
  }

  /**
   * Push local tracks to Cloudflare
   */
  async pushTracks(
    tracks: MediaStreamTrack[],
    signalingUrl: string
  ): Promise<TrackInfo[]> {
    if (!this.peerConnection || !this.sessionId) {
      throw new Error('Must initialize and create session first');
    }

    const trackInfos: TrackInfo[] = [];

    // Add tracks to peer connection
    for (const track of tracks) {
      const transceiver = this.peerConnection.addTransceiver(track, {
        direction: 'sendonly',
      });

      const trackName = `${this.sessionId}-${track.kind}-${track.id}`;
      this.transceivers.set(trackName, transceiver);

      trackInfos.push({
        trackId: track.id,
        trackName,
        kind: track.kind as 'audio' | 'video',
      });
    }

    // Create offer
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    // Send to Cloudflare via our signaling server
    const response = await fetch(`${signalingUrl}/cloudflare/session/${this.sessionId}/tracks/new`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionDescription: {
          type: 'offer',
          sdp: offer.sdp,
        },
        tracks: trackInfos.map(t => ({
          location: 'local',
          trackName: t.trackName,
          mid: this.transceivers.get(t.trackName)?.mid,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to push tracks: ${response.statusText}`);
    }

    const data = await response.json();

    // Set remote answer
    await this.peerConnection.setRemoteDescription({
      type: 'answer',
      sdp: data.sessionDescription.sdp,
    });

    // Update local tracks map with server-assigned track IDs
    for (const trackInfo of trackInfos) {
      this.localTracks.set(trackInfo.trackName, trackInfo);
    }

    return trackInfos;
  }

  /**
   * Pull remote tracks from other participants
   */
  async pullTracks(
    tracksToPull: PullTrackRequest[],
    signalingUrl: string
  ): Promise<void> {
    if (!this.peerConnection || !this.sessionId) {
      throw new Error('Must initialize and create session first');
    }

    // Request tracks from Cloudflare - NO sessionDescription, Cloudflare will generate the offer
    const response = await fetch(`${signalingUrl}/cloudflare/session/${this.sessionId}/tracks/new`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tracks: tracksToPull.map(t => ({
          location: 'remote',
          sessionId: t.sessionId,
          trackName: t.trackName,
        })),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to pull tracks: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();

    // Check for track errors and store mid → trackName mapping
    if (data.tracks) {
      const errors = data.tracks.filter((t: { errorCode?: string }) => t.errorCode);
      if (errors.length > 0) {
        console.error('Track pull errors:', errors);
        throw new Error(`Failed to pull tracks: ${errors[0].errorDescription || errors[0].errorCode}`);
      }

      // Store mid → trackName mapping for ontrack handler
      for (const trackData of data.tracks) {
        if (trackData.mid && trackData.trackName) {
          this.midToTrackName.set(trackData.mid, trackData.trackName);
        }
      }
    }

    // Cloudflare returns an offer that we need to answer
    if (!data.sessionDescription?.sdp) {
      console.error('No session description in response:', data);
      throw new Error('No session description returned from Cloudflare');
    }

    // Set remote offer from Cloudflare
    await this.peerConnection.setRemoteDescription({
      type: data.sessionDescription.type,
      sdp: data.sessionDescription.sdp,
    });

    // Create and set local answer
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    // Send answer back to Cloudflare via renegotiate
    if (data.requiresImmediateRenegotiation) {
      const renegotiateResponse = await fetch(`${signalingUrl}/cloudflare/session/${this.sessionId}/renegotiate`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionDescription: {
            type: 'answer',
            sdp: answer.sdp,
          },
        }),
      });

      if (!renegotiateResponse.ok) {
        const errorText = await renegotiateResponse.text();
        throw new Error(`Failed to renegotiate: ${renegotiateResponse.statusText} - ${errorText}`);
      }
    }

    console.log('Successfully pulled tracks:', tracksToPull.map(t => t.trackName));
  }

  /**
   * Update track (e.g., mute/unmute, enable/disable video)
   */
  async updateTrack(trackName: string, enabled: boolean): Promise<void> {
    const transceiver = this.transceivers.get(trackName);
    if (transceiver?.sender?.track) {
      transceiver.sender.track.enabled = enabled;
    }
  }

  /**
   * Replace a track (e.g., switch camera)
   */
  async replaceTrack(trackName: string, newTrack: MediaStreamTrack): Promise<void> {
    const transceiver = this.transceivers.get(trackName);
    if (transceiver?.sender) {
      await transceiver.sender.replaceTrack(newTrack);
    }
  }

  /**
   * Close the connection and clean up
   */
  async close(): Promise<void> {
    // Stop all local tracks
    for (const transceiver of this.transceivers.values()) {
      if (transceiver.sender?.track) {
        transceiver.sender.track.stop();
      }
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Clear state
    this.localTracks.clear();
    this.remoteTracks.clear();
    this.transceivers.clear();
    this.midToTrackName.clear();
    this.sessionId = null;
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Get all local track infos
   */
  getLocalTracks(): TrackInfo[] {
    return Array.from(this.localTracks.values());
  }

  /**
   * Get connection state
   */
  getConnectionState(): ConnectionState {
    return (this.peerConnection?.connectionState as ConnectionState) ?? 'new';
  }
}

export default CloudflareCalls;
