/**
 * SignalingClient - WebSocket client for WebRTC signaling
 * Handles communication with the signaling server for peer discovery and SDP/ICE exchange
 */

export type MessageType = 'join' | 'leave' | 'offer' | 'answer' | 'ice' | 'track-state';

export interface SignalingMessage {
  type: MessageType;
  from: string;
  to: string;
  data: unknown;
}

export interface JoinData {
  participant_id: string;
  participant_name: string;
}

export interface TrackStateData {
  kind: 'video' | 'audio';
  enabled: boolean;
}

export interface SignalingEventHandlers {
  onParticipantJoined?: (participantId: string, participantName: string) => void;
  onParticipantLeft?: (participantId: string) => void;
  onOffer?: (from: string, offer: RTCSessionDescriptionInit) => void;
  onAnswer?: (from: string, answer: RTCSessionDescriptionInit) => void;
  onIceCandidate?: (from: string, candidate: RTCIceCandidateInit) => void;
  onTrackStateChange?: (from: string, kind: 'video' | 'audio', enabled: boolean) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
}

export interface SignalingClientConfig {
  serverUrl: string;
  roomId: string;
  participantId: string;
  participantName: string;
  token: string;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

export class SignalingClient {
  private ws: WebSocket | null = null;
  private config: SignalingClientConfig;
  private eventHandlers: SignalingEventHandlers;
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isIntentionallyClosed = false;
  private isConnected = false;

  constructor(config: SignalingClientConfig, eventHandlers: SignalingEventHandlers = {}) {
    this.config = {
      reconnectDelay: 2000,
      maxReconnectAttempts: 5,
      ...config,
    };
    this.eventHandlers = eventHandlers;
  }

  /**
   * Connect to the signaling server
   */
  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.warn('SignalingClient: Already connected');
      return;
    }

    this.isIntentionallyClosed = false;

    return new Promise((resolve, reject) => {
      try {
        const wsUrl = `${this.config.serverUrl}/ws?token=${this.config.token}`;
        console.log(`SignalingClient: Connecting to ${wsUrl}`);

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('SignalingClient: Connected to signaling server');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.eventHandlers.onConnected?.();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          console.error('SignalingClient: WebSocket error:', error);
          const err = new Error('WebSocket error');
          this.eventHandlers.onError?.(err);
          reject(err);
        };

        this.ws.onclose = (event) => {
          console.log(
            `SignalingClient: Disconnected (code: ${event.code}, reason: ${event.reason})`
          );
          this.isConnected = false;
          this.eventHandlers.onDisconnected?.();

          if (!this.isIntentionallyClosed && this.shouldReconnect()) {
            this.scheduleReconnect();
          }
        };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.eventHandlers.onError?.(err);
        reject(err);
      }
    });
  }

  /**
   * Disconnect from the signaling server
   */
  disconnect(): void {
    console.log('SignalingClient: Disconnecting');
    this.isIntentionallyClosed = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      // Send leave message before closing
      const leaveMessage: SignalingMessage = {
        type: 'leave',
        from: this.config.participantId,
        to: 'all',
        data: {
          participant_id: this.config.participantId,
        },
      };
      this.send(leaveMessage);

      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.isConnected = false;
  }

  /**
   * Send an offer to a specific peer
   */
  sendOffer(to: string, offer: RTCSessionDescriptionInit): void {
    const message: SignalingMessage = {
      type: 'offer',
      from: this.config.participantId,
      to,
      data: offer,
    };
    this.send(message);
  }

  /**
   * Send an answer to a specific peer
   */
  sendAnswer(to: string, answer: RTCSessionDescriptionInit): void {
    const message: SignalingMessage = {
      type: 'answer',
      from: this.config.participantId,
      to,
      data: answer,
    };
    this.send(message);
  }

  /**
   * Send an ICE candidate to a specific peer
   */
  sendIceCandidate(to: string, candidate: RTCIceCandidateInit): void {
    const message: SignalingMessage = {
      type: 'ice',
      from: this.config.participantId,
      to,
      data: candidate,
    };
    this.send(message);
  }

  /**
   * Send track state change to all peers
   */
  sendTrackStateChange(kind: 'video' | 'audio', enabled: boolean, to: string = 'all'): void {
    const message: SignalingMessage = {
      type: 'track-state',
      from: this.config.participantId,
      to,
      data: {
        kind,
        enabled,
      } as TrackStateData,
    };
    console.log(
      `SignalingClient: Sending track state to ${to} - ${kind}: ${enabled ? 'enabled' : 'disabled'}`
    );
    this.send(message);
  }

  /**
   * Check if client is connected
   */
  isClientConnected(): boolean {
    return this.isConnected && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get current participant ID
   */
  getParticipantId(): string {
    return this.config.participantId;
  }

  /**
   * Private: Send a message through the WebSocket
   */
  private send(message: SignalingMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('SignalingClient: Cannot send message - not connected');
      return;
    }

    try {
      const json = JSON.stringify(message);
      this.ws.send(json);
      console.log(`SignalingClient: Sent ${message.type} to ${message.to}`);
    } catch (error) {
      console.error('SignalingClient: Failed to send message:', error);
      this.eventHandlers.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Private: Handle incoming WebSocket messages
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as SignalingMessage;
      console.log(`SignalingClient: Received ${message.type} from ${message.from}`);

      switch (message.type) {
        case 'join': {
          const joinData = message.data as JoinData;
          this.eventHandlers.onParticipantJoined?.(
            joinData.participant_id,
            joinData.participant_name
          );
          break;
        }

        case 'leave': {
          const leaveData = message.data as { participant_id: string };
          this.eventHandlers.onParticipantLeft?.(leaveData.participant_id);
          break;
        }

        case 'offer': {
          const offer = message.data as RTCSessionDescriptionInit;
          this.eventHandlers.onOffer?.(message.from, offer);
          break;
        }

        case 'answer': {
          const answer = message.data as RTCSessionDescriptionInit;
          this.eventHandlers.onAnswer?.(message.from, answer);
          break;
        }

        case 'ice': {
          const candidate = message.data as RTCIceCandidateInit;
          this.eventHandlers.onIceCandidate?.(message.from, candidate);
          break;
        }

        case 'track-state': {
          const trackState = message.data as TrackStateData;
          this.eventHandlers.onTrackStateChange?.(
            message.from,
            trackState.kind,
            trackState.enabled
          );
          break;
        }

        default:
          console.warn(`SignalingClient: Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('SignalingClient: Failed to handle message:', error);
      this.eventHandlers.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Private: Check if should attempt reconnection
   */
  private shouldReconnect(): boolean {
    return (
      !this.isIntentionallyClosed &&
      this.reconnectAttempts < (this.config.maxReconnectAttempts || 5)
    );
  }

  /**
   * Private: Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectAttempts++;
    const delay = (this.config.reconnectDelay || 2000) * this.reconnectAttempts;

    console.log(
      `SignalingClient: Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`
    );

    this.reconnectTimeout = setTimeout(() => {
      console.log(`SignalingClient: Attempting reconnect (attempt ${this.reconnectAttempts})`);
      this.connect().catch((error) => {
        console.error('SignalingClient: Reconnect failed:', error);
      });
    }, delay);
  }
}
