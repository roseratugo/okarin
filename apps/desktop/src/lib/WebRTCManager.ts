/**
 * WebRTCManager - Orchestrates WebRTC connections and signaling
 * Integrates PeerManager with SignalingClient to establish peer-to-peer connections
 */

import { PeerManager, PeerConnectionEventHandlers } from './PeerManager';
import { SignalingClient, SignalingEventHandlers, SignalingClientConfig } from './SignalingClient';

export interface WebRTCManagerConfig {
  roomId: string;
  participantId: string;
  participantName: string;
  token: string;
  signalingServerUrl: string;
  iceServers?: { urls: string[] }[];
  maxPeers?: number;
}

export interface WebRTCManagerEventHandlers {
  onParticipantJoined?: (participantId: string, participantName: string) => void;
  onParticipantLeft?: (participantId: string) => void;
  onRemoteTrack?: (participantId: string, track: MediaStreamTrack, stream: MediaStream) => void;
  onConnectionStateChange?: (participantId: string, state: string) => void;
  onError?: (error: Error) => void;
}

/**
 * WebRTCManager orchestrates the WebRTC connection lifecycle:
 * 1. Connects to signaling server
 * 2. Listens for participant join/leave events
 * 3. Creates peer connections via PeerManager
 * 4. Handles SDP offer/answer exchange
 * 5. Handles ICE candidate exchange
 */
export class WebRTCManager {
  private peerManager: PeerManager;
  private signalingClient: SignalingClient;
  private config: WebRTCManagerConfig;
  private eventHandlers: WebRTCManagerEventHandlers;
  private isInitialized = false;

  constructor(config: WebRTCManagerConfig, eventHandlers: WebRTCManagerEventHandlers = {}) {
    this.config = config;
    this.eventHandlers = eventHandlers;

    // Setup PeerManager event handlers
    const peerEventHandlers: PeerConnectionEventHandlers = {
      onTrack: (peerId: string, event: RTCTrackEvent) => {
        console.log(`WebRTCManager: Received track from ${peerId}: ${event.track.kind}`);
        this.eventHandlers.onRemoteTrack?.(peerId, event.track, event.streams[0]);
      },

      onIceCandidate: (peerId: string, candidate: RTCIceCandidate) => {
        console.log(`WebRTCManager: Sending ICE candidate to ${peerId}`);
        this.signalingClient.sendIceCandidate(peerId, candidate.toJSON());
      },

      onConnectionStateChange: (peerId: string, state: string) => {
        console.log(`WebRTCManager: Connection state for ${peerId}: ${state}`);
        this.eventHandlers.onConnectionStateChange?.(peerId, state);

        if (state === 'failed' || state === 'closed') {
          console.warn(`WebRTCManager: Connection ${state} for ${peerId}, removing peer`);
          this.peerManager.removePeer(peerId);
        }
      },

      onIceConnectionStateChange: (peerId: string, state: string) => {
        console.log(`WebRTCManager: ICE connection state for ${peerId}: ${state}`);

        if (state === 'failed') {
          console.warn(`WebRTCManager: ICE connection failed for ${peerId}, attempting restart`);
          this.restartIce(peerId).catch((error) => {
            console.error(`WebRTCManager: Failed to restart ICE for ${peerId}:`, error);
          });
        }
      },

      onError: (peerId: string, error: Error) => {
        console.error(`WebRTCManager: PeerManager error for ${peerId}:`, error);
        this.eventHandlers.onError?.(error);
      },
    };

    // Create PeerManager
    this.peerManager = new PeerManager(
      config.iceServers || [{ urls: ['stun:stun.l.google.com:19302'] }],
      peerEventHandlers,
      config.maxPeers || 4
    );

    // Setup SignalingClient event handlers
    const signalingEventHandlers: SignalingEventHandlers = {
      onParticipantJoined: (participantId: string, participantName: string) => {
        console.log(`WebRTCManager: Participant joined: ${participantId} (${participantName})`);
        this.handleParticipantJoined(participantId, participantName);
      },

      onParticipantLeft: (participantId: string) => {
        console.log(`WebRTCManager: Participant left: ${participantId}`);
        this.handleParticipantLeft(participantId);
      },

      onOffer: (from: string, offer: RTCSessionDescriptionInit) => {
        console.log(`WebRTCManager: Received offer from ${from}`);
        this.handleOffer(from, offer);
      },

      onAnswer: (from: string, answer: RTCSessionDescriptionInit) => {
        console.log(`WebRTCManager: Received answer from ${from}`);
        this.handleAnswer(from, answer);
      },

      onIceCandidate: (from: string, candidate: RTCIceCandidateInit) => {
        console.log(`WebRTCManager: Received ICE candidate from ${from}`);
        this.handleIceCandidate(from, candidate);
      },

      onError: (error: Error) => {
        console.error('WebRTCManager: SignalingClient error:', error);
        this.eventHandlers.onError?.(error);
      },
    };

    // Create SignalingClient
    const signalingConfig: SignalingClientConfig = {
      serverUrl: config.signalingServerUrl,
      roomId: config.roomId,
      participantId: config.participantId,
      participantName: config.participantName,
      token: config.token,
    };

    this.signalingClient = new SignalingClient(signalingConfig, signalingEventHandlers);
  }

  /**
   * Initialize and connect to signaling server
   */
  async initialize(localStream?: MediaStream): Promise<void> {
    if (this.isInitialized) {
      console.warn('WebRTCManager: Already initialized');
      return;
    }

    console.log('WebRTCManager: Initializing...');

    // Set local stream if provided
    if (localStream) {
      this.peerManager.setLocalStream(localStream);
    }

    // Connect to signaling server
    await this.signalingClient.connect();

    this.isInitialized = true;
    console.log('WebRTCManager: Initialized successfully');
  }

  /**
   * Set or update local media stream
   */
  setLocalStream(stream: MediaStream): void {
    this.peerManager.setLocalStream(stream);
  }

  /**
   * Disconnect and cleanup all resources
   */
  async disconnect(): Promise<void> {
    console.log('WebRTCManager: Disconnecting...');

    // Close all peer connections
    this.peerManager.closeAll();

    // Disconnect from signaling server
    this.signalingClient.disconnect();

    this.isInitialized = false;
    console.log('WebRTCManager: Disconnected');
  }

  /**
   * Get all connected peer IDs
   */
  getConnectedPeers(): string[] {
    return this.peerManager.getAllPeers();
  }

  /**
   * Get peer connection count
   */
  getPeerCount(): number {
    return this.peerManager.getPeerCount();
  }

  /**
   * Private: Handle participant joined event
   */
  private async handleParticipantJoined(
    participantId: string,
    participantName: string
  ): Promise<void> {
    try {
      // Don't create connection to self
      if (participantId === this.config.participantId) {
        console.log('WebRTCManager: Ignoring self join');
        return;
      }

      // Notify event handler
      this.eventHandlers.onParticipantJoined?.(participantId, participantName);

      // Create peer connection
      this.peerManager.createPeerConnection(participantId);

      // Create and send offer
      const offer = await this.peerManager.createOffer(participantId);
      this.signalingClient.sendOffer(participantId, offer);

      console.log(`WebRTCManager: Sent offer to ${participantId}`);
    } catch (error) {
      console.error(
        `WebRTCManager: Failed to handle participant joined for ${participantId}:`,
        error
      );
      this.eventHandlers.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Private: Handle participant left event
   */
  private handleParticipantLeft(participantId: string): void {
    try {
      // Remove peer connection
      this.peerManager.removePeer(participantId);

      // Notify event handler
      this.eventHandlers.onParticipantLeft?.(participantId);

      console.log(`WebRTCManager: Removed peer ${participantId}`);
    } catch (error) {
      console.error(
        `WebRTCManager: Failed to handle participant left for ${participantId}:`,
        error
      );
      this.eventHandlers.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Private: Handle incoming offer
   */
  private async handleOffer(from: string, offer: RTCSessionDescriptionInit): Promise<void> {
    try {
      // Create peer connection if it doesn't exist
      if (!this.peerManager.hasPeer(from)) {
        this.peerManager.createPeerConnection(from);
      }

      // Handle offer and get answer
      const answer = await this.peerManager.handleOffer(from, offer);

      // Send answer back
      this.signalingClient.sendAnswer(from, answer);

      console.log(`WebRTCManager: Sent answer to ${from}`);
    } catch (error) {
      console.error(`WebRTCManager: Failed to handle offer from ${from}:`, error);
      this.eventHandlers.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Private: Handle incoming answer
   */
  private async handleAnswer(from: string, answer: RTCSessionDescriptionInit): Promise<void> {
    try {
      await this.peerManager.handleAnswer(from, answer);
      console.log(`WebRTCManager: Processed answer from ${from}`);
    } catch (error) {
      console.error(`WebRTCManager: Failed to handle answer from ${from}:`, error);
      this.eventHandlers.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Private: Handle incoming ICE candidate
   */
  private async handleIceCandidate(from: string, candidate: RTCIceCandidateInit): Promise<void> {
    try {
      await this.peerManager.handleIceCandidate(from, candidate);
    } catch (error) {
      console.error(`WebRTCManager: Failed to handle ICE candidate from ${from}:`, error);
      this.eventHandlers.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Private: Restart ICE for a peer connection
   */
  private async restartIce(peerId: string): Promise<void> {
    try {
      const offer = await this.peerManager.restartIce(peerId);
      this.signalingClient.sendOffer(peerId, offer);
      console.log(`WebRTCManager: ICE restart offer sent to ${peerId}`);
    } catch (error) {
      console.error(`WebRTCManager: Failed to restart ICE for ${peerId}:`, error);
      throw error;
    }
  }
}
