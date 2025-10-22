export interface Room {
  id: string;
  createdAt: Date;
  hostId: string;
  maxParticipants: number;
  iceServers: IceServer[];
  status: RoomStatus;
}

export enum RoomStatus {
  WAITING = 'waiting',
  ACTIVE = 'active',
  RECORDING = 'recording',
  CLOSED = 'closed',
}

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}
