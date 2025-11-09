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

export type PeerConnectionEventHandlers = {
  onTrack?: (peerId: string, event: RTCTrackEvent) => void;
  onIceCandidate?: (peerId: string, candidate: RTCIceCandidate) => void;
  onConnectionStateChange?: (peerId: string, state: PeerConnectionState) => void;
  onIceConnectionStateChange?: (peerId: string, state: IceConnectionState) => void;
  onNegotiationNeeded?: (peerId: string) => void;
  onError?: (peerId: string, error: Error) => void;
};

export class PeerManager {
  private peers: Map<string, RTCPeerConnection>;
  private localStream: MediaStream | null;
  private config: PeerConnectionConfig;
  private eventHandlers: PeerConnectionEventHandlers;
  private maxPeers: number;

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
  }

  private getDefaultIceServers(): IceServer[] {
    return [
      { urls: ['stun:stun.l.google.com:19302'] },
      { urls: ['stun:stun1.l.google.com:19302'] },
    ];
  }

  setLocalStream(stream: MediaStream): void {
    this.localStream = stream;

    this.peers.forEach((peerConnection, peerId) => {
      stream.getTracks().forEach((track) => {
        const sender = peerConnection.getSenders().find((s) => s.track?.kind === track.kind);

        if (sender) {
          sender.replaceTrack(track).catch((error) => {
            console.error(`Failed to replace track for peer ${peerId}:`, error);
            this.eventHandlers.onError?.(peerId, error);
          });
        } else {
          peerConnection.addTrack(track, stream);
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

  async handleOffer(
    peerId: string,
    offer: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit> {
    try {
      let peerConnection = this.peers.get(peerId);

      if (!peerConnection) {
        peerConnection = this.createPeerConnection(peerId);
      }

      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      return answer;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.eventHandlers.onError?.(peerId, err);
      throw err;
    }
  }

  async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    try {
      const peerConnection = this.peers.get(peerId);

      if (!peerConnection) {
        throw new Error(`No peer connection found for ${peerId}`);
      }

      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.eventHandlers.onError?.(peerId, err);
      throw err;
    }
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

  async createOffer(peerId: string): Promise<RTCSessionDescriptionInit> {
    try {
      let peerConnection = this.peers.get(peerId);

      if (!peerConnection) {
        peerConnection = this.createPeerConnection(peerId);
      }

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      return offer;
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
