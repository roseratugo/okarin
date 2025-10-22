export interface Participant {
  id: string;
  name: string;
  roomId: string;
  joinedAt: Date;
  isHost: boolean;
  tracks: TrackInfo[];
  connectionState: ConnectionState;
}

export interface TrackInfo {
  id: string;
  participantId: string;
  kind: 'audio' | 'video';
  label?: string;
  enabled: boolean;
  muted: boolean;
}

export enum ConnectionState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  FAILED = 'failed',
}
