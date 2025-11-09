type IceServer = {
  urls: string[];
  username?: string;
  credential?: string;
};

type PeerConnectionConfig = {
  iceServers: IceServer[];
};

type PeerConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';
type IceConnectionState =
  | 'new'
  | 'checking'
  | 'connected'
  | 'completed'
  | 'failed'
  | 'disconnected'
  | 'closed';

type NegotiationState = 'stable' | 'creating-offer' | 'creating-answer' | 'waiting-for-answer';

type NegotiationOperation = {
  type: 'offer' | 'answer' | 'renegotiate';
  peerId: string;
  offerOptions?: RTCOfferOptions;
  offer?: RTCSessionDescriptionInit;
  retries: number;
};

export type PeerConnectionEventHandlers = {
  onTrack?: (peerId: string, event: RTCTrackEvent) => void;
  onIceCandidate?: (peerId: string, candidate: RTCIceCandidate) => void;
  onConnectionStateChange?: (peerId: string, state: PeerConnectionState) => void;
  onIceConnectionStateChange?: (peerId: string, state: IceConnectionState) => void;
  onNegotiationNeeded?: (peerId: string) => void;
  onError?: (peerId: string, error: Error) => void;
  onNegotiationStateChange?: (peerId: string, state: NegotiationState) => void;
};

export class PeerManager {
  private peers: Map<string, RTCPeerConnection>;
  private localStream: MediaStream | null;
  private config: PeerConnectionConfig;
  private eventHandlers: PeerConnectionEventHandlers;
  private maxPeers: number;
  private negotiationStates: Map<string, NegotiationState>;
  private operationQueues: Map<string, NegotiationOperation[]>;
  private isProcessingQueue: Map<string, boolean>;
  private negotiationTimeouts: Map<string, NodeJS.Timeout>;
  private readonly NEGOTIATION_TIMEOUT = 30000;
  private readonly MAX_RETRIES = 3;

  constructor(
    iceServers: IceServer[] = [],
    eventHandlers: PeerConnectionEventHandlers = {},
    maxPeers: number = 4
  ) {
    this.peers = new Map();
    this.localStream = null;
    this.config = {
      iceServers: iceServers.length > 0 ? iceServers : this.getDefaultIceServers(),
    };
    this.eventHandlers = eventHandlers;
    this.maxPeers = maxPeers;
    this.negotiationStates = new Map();
    this.operationQueues = new Map();
    this.isProcessingQueue = new Map();
    this.negotiationTimeouts = new Map();
  }

  private getDefaultIceServers(): IceServer[] {
    return [
      { urls: ['stun:stun.l.google.com:19302'] },
      { urls: ['stun:stun1.l.google.com:19302'] },
    ];
  }

  private setNegotiationState(peerId: string, state: NegotiationState): void {
    this.negotiationStates.set(peerId, state);
    this.eventHandlers.onNegotiationStateChange?.(peerId, state);
  }

  private getNegotiationState(peerId: string): NegotiationState {
    return this.negotiationStates.get(peerId) || 'stable';
  }

  private canNegotiate(peerId: string): boolean {
    const state = this.getNegotiationState(peerId);
    return state === 'stable';
  }

  private queueOperation(operation: NegotiationOperation): void {
    const { peerId } = operation;
    if (!this.operationQueues.has(peerId)) {
      this.operationQueues.set(peerId, []);
    }
    this.operationQueues.get(peerId)!.push(operation);
    void this.processQueue(peerId);
  }

  private async processQueue(peerId: string): Promise<void> {
    if (this.isProcessingQueue.get(peerId)) {
      return;
    }

    this.isProcessingQueue.set(peerId, true);

    const queue = this.operationQueues.get(peerId);
    if (!queue || queue.length === 0) {
      this.isProcessingQueue.set(peerId, false);
      return;
    }

    const operation = queue[0];

    try {
      if (!this.canNegotiate(peerId)) {
        this.isProcessingQueue.set(peerId, false);
        return;
      }

      switch (operation.type) {
        case 'offer':
          await this.executeCreateOffer(peerId, operation.offerOptions);
          break;
        case 'answer':
          if (operation.offer) {
            await this.executeHandleOffer(peerId, operation.offer);
          }
          break;
        case 'renegotiate':
          await this.executeRenegotiation(peerId);
          break;
      }

      queue.shift();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (operation.retries < this.MAX_RETRIES) {
        operation.retries++;
        console.warn(`Retrying negotiation for ${peerId} (attempt ${operation.retries})`);
      } else {
        queue.shift();
        this.setNegotiationState(peerId, 'stable');
        this.eventHandlers.onError?.(peerId, err);
      }
    }

    this.isProcessingQueue.set(peerId, false);

    if (queue.length > 0) {
      setTimeout(() => void this.processQueue(peerId), 100);
    }
  }

  private startNegotiationTimeout(peerId: string): void {
    this.clearNegotiationTimeout(peerId);

    const timeout = setTimeout(() => {
      const state = this.getNegotiationState(peerId);
      if (state !== 'stable') {
        console.error(`Negotiation timeout for peer ${peerId}`);
        this.setNegotiationState(peerId, 'stable');
        this.eventHandlers.onError?.(peerId, new Error('Negotiation timeout'));

        const queue = this.operationQueues.get(peerId);
        if (queue && queue.length > 0) {
          const operation = queue[0];
          if (operation.retries < this.MAX_RETRIES) {
            operation.retries++;
            void this.processQueue(peerId);
          } else {
            queue.shift();
            void this.processQueue(peerId);
          }
        }
      }
    }, this.NEGOTIATION_TIMEOUT);

    this.negotiationTimeouts.set(peerId, timeout);
  }

  private clearNegotiationTimeout(peerId: string): void {
    const timeout = this.negotiationTimeouts.get(peerId);
    if (timeout) {
      clearTimeout(timeout);
      this.negotiationTimeouts.delete(peerId);
    }
  }

  setLocalStream(stream: MediaStream): void {
    this.localStream = stream;

    this.peers.forEach((peerConnection, peerId) => {
      stream.getTracks().forEach((track) => {
        const sender = peerConnection.getSenders().find((s) => s.track?.kind === track.kind);

        if (sender) {
          sender
            .replaceTrack(track)
            .then(() => {
              if (peerConnection.signalingState === 'stable') {
                void this.renegotiate(peerId);
              }
            })
            .catch((error) => {
              console.error(`Failed to replace track for peer ${peerId}:`, error);
              this.eventHandlers.onError?.(peerId, error);
            });
        } else {
          peerConnection.addTrack(track, stream);
          if (peerConnection.signalingState === 'stable') {
            void this.renegotiate(peerId);
          }
        }
      });
    });
  }

  createPeerConnection(peerId: string): RTCPeerConnection {
    if (this.peers.has(peerId)) {
      console.warn(`Peer connection already exists for ${peerId}`);
      return this.peers.get(peerId)!;
    }

    if (this.peers.size >= this.maxPeers) {
      const error = new Error(`Maximum peer connections (${this.maxPeers}) reached`);
      this.eventHandlers.onError?.(peerId, error);
      throw error;
    }

    const peerConnection = new RTCPeerConnection(this.config);

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, this.localStream!);
      });
    }

    peerConnection.ontrack = (event: RTCTrackEvent) => {
      this.eventHandlers.onTrack?.(peerId, event);
    };

    peerConnection.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
      if (event.candidate) {
        this.eventHandlers.onIceCandidate?.(peerId, event.candidate);
      }
    };

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState as PeerConnectionState;
      this.eventHandlers.onConnectionStateChange?.(peerId, state);

      if (state === 'failed' || state === 'closed' || state === 'disconnected') {
        this.handlePeerDisconnection(peerId, state);
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      const state = peerConnection.iceConnectionState as IceConnectionState;
      this.eventHandlers.onIceConnectionStateChange?.(peerId, state);
    };

    peerConnection.onnegotiationneeded = () => {
      this.eventHandlers.onNegotiationNeeded?.(peerId);
    };

    this.peers.set(peerId, peerConnection);
    return peerConnection;
  }

  private async executeCreateOffer(
    peerId: string,
    options?: RTCOfferOptions
  ): Promise<RTCSessionDescriptionInit> {
    let peerConnection = this.peers.get(peerId);

    if (!peerConnection) {
      peerConnection = this.createPeerConnection(peerId);
    }

    this.setNegotiationState(peerId, 'creating-offer');
    this.startNegotiationTimeout(peerId);

    const offer = await peerConnection.createOffer(options);
    await peerConnection.setLocalDescription(offer);

    this.setNegotiationState(peerId, 'waiting-for-answer');

    return offer;
  }

  private async executeHandleOffer(
    peerId: string,
    offer: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit> {
    let peerConnection = this.peers.get(peerId);

    if (!peerConnection) {
      peerConnection = this.createPeerConnection(peerId);
    }

    this.setNegotiationState(peerId, 'creating-answer');
    this.startNegotiationTimeout(peerId);

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    this.setNegotiationState(peerId, 'stable');
    this.clearNegotiationTimeout(peerId);

    return answer;
  }

  private async executeRenegotiation(peerId: string): Promise<RTCSessionDescriptionInit> {
    const peerConnection = this.peers.get(peerId);

    if (!peerConnection) {
      throw new Error(`No peer connection found for ${peerId}`);
    }

    const options: RTCOfferOptions = {
      iceRestart: false,
    };

    return this.executeCreateOffer(peerId, options);
  }

  async createOffer(peerId: string, options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit> {
    return new Promise((resolve, reject) => {
      this.queueOperation({
        type: 'offer',
        peerId,
        offerOptions: options,
        retries: 0,
      });

      const checkComplete = setInterval(() => {
        const state = this.getNegotiationState(peerId);
        const pc = this.peers.get(peerId);

        if (state === 'waiting-for-answer' && pc?.localDescription) {
          clearInterval(checkComplete);
          resolve(pc.localDescription.toJSON());
        }

        if (state === 'stable' && pc?.localDescription) {
          clearInterval(checkComplete);
          resolve(pc.localDescription.toJSON());
        }
      }, 50);

      setTimeout(() => {
        clearInterval(checkComplete);
        reject(new Error('Create offer timeout'));
      }, this.NEGOTIATION_TIMEOUT);
    });
  }

  async handleOffer(
    peerId: string,
    offer: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit> {
    return new Promise((resolve, reject) => {
      this.queueOperation({
        type: 'answer',
        peerId,
        offer,
        retries: 0,
      });

      const checkComplete = setInterval(() => {
        const state = this.getNegotiationState(peerId);
        const pc = this.peers.get(peerId);

        if (state === 'stable' && pc?.localDescription) {
          clearInterval(checkComplete);
          resolve(pc.localDescription.toJSON());
        }
      }, 50);

      setTimeout(() => {
        clearInterval(checkComplete);
        reject(new Error('Handle offer timeout'));
      }, this.NEGOTIATION_TIMEOUT);
    });
  }

  async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const peerConnection = this.peers.get(peerId);

    if (!peerConnection) {
      throw new Error(`No peer connection found for ${peerId}`);
    }

    if (this.getNegotiationState(peerId) !== 'waiting-for-answer') {
      throw new Error(`Invalid negotiation state for ${peerId}`);
    }

    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));

    this.setNegotiationState(peerId, 'stable');
    this.clearNegotiationTimeout(peerId);

    void this.processQueue(peerId);
  }

  async renegotiate(peerId: string): Promise<RTCSessionDescriptionInit> {
    return new Promise((resolve, reject) => {
      this.queueOperation({
        type: 'renegotiate',
        peerId,
        retries: 0,
      });

      const checkComplete = setInterval(() => {
        const state = this.getNegotiationState(peerId);
        const pc = this.peers.get(peerId);

        if (state === 'waiting-for-answer' && pc?.localDescription) {
          clearInterval(checkComplete);
          resolve(pc.localDescription.toJSON());
        }
      }, 50);

      setTimeout(() => {
        clearInterval(checkComplete);
        reject(new Error('Renegotiation timeout'));
      }, this.NEGOTIATION_TIMEOUT);
    });
  }

  async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    try {
      const peerConnection = this.peers.get(peerId);

      if (!peerConnection) {
        throw new Error(`No peer connection found for ${peerId}`);
      }

      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.eventHandlers.onError?.(peerId, err);
      throw err;
    }
  }

  private handlePeerDisconnection(peerId: string, state: PeerConnectionState): void {
    if (state === 'disconnected') {
      setTimeout(() => {
        const peerConnection = this.peers.get(peerId);
        if (peerConnection && peerConnection.connectionState === 'disconnected') {
          console.log(`Peer ${peerId} still disconnected after timeout, cleaning up`);
          this.removePeer(peerId);
        }
      }, 5000);
    } else if (state === 'failed' || state === 'closed') {
      this.removePeer(peerId);
    }
  }

  removePeer(peerId: string): void {
    const peerConnection = this.peers.get(peerId);

    if (peerConnection) {
      peerConnection.ontrack = null;
      peerConnection.onicecandidate = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.oniceconnectionstatechange = null;
      peerConnection.onnegotiationneeded = null;

      peerConnection.getSenders().forEach((sender) => {
        if (sender.track) {
          peerConnection.removeTrack(sender);
        }
      });

      peerConnection.close();
      this.peers.delete(peerId);
    }

    this.negotiationStates.delete(peerId);
    this.operationQueues.delete(peerId);
    this.isProcessingQueue.delete(peerId);
    this.clearNegotiationTimeout(peerId);
  }

  getPeerConnection(peerId: string): RTCPeerConnection | undefined {
    return this.peers.get(peerId);
  }

  getAllPeers(): string[] {
    return Array.from(this.peers.keys());
  }

  getPeerCount(): number {
    return this.peers.size;
  }

  getConnectionState(peerId: string): PeerConnectionState | undefined {
    const peerConnection = this.peers.get(peerId);
    return peerConnection?.connectionState as PeerConnectionState | undefined;
  }

  getIceConnectionState(peerId: string): IceConnectionState | undefined {
    const peerConnection = this.peers.get(peerId);
    return peerConnection?.iceConnectionState as IceConnectionState | undefined;
  }

  closeAll(): void {
    this.peers.forEach((_, peerId) => {
      this.removePeer(peerId);
    });
    this.peers.clear();
  }

  updateEventHandlers(handlers: Partial<PeerConnectionEventHandlers>): void {
    this.eventHandlers = { ...this.eventHandlers, ...handlers };
  }
}
