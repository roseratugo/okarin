export type ClientMessage =
  | JoinMessage
  | LeaveMessage
  | OfferMessage
  | AnswerMessage
  | IceCandidateMessage
  | TrackMetadataMessage
  | StartRecordingMessage
  | StopRecordingMessage;

export interface JoinMessage {
  type: 'join';
  roomId: string;
  token: string;
  name: string;
}

export interface LeaveMessage {
  type: 'leave';
}

export interface OfferMessage {
  type: 'offer';
  to: string;
  sdp: string;
}

export interface AnswerMessage {
  type: 'answer';
  to: string;
  sdp: string;
}

export interface IceCandidateMessage {
  type: 'ice-candidate';
  to: string;
  candidate: RTCIceCandidateInit;
}

export interface TrackMetadataMessage {
  type: 'track-metadata';
  trackId: string;
  kind: 'audio' | 'video';
  label?: string;
  enabled: boolean;
}

export interface StartRecordingMessage {
  type: 'start-recording';
}

export interface StopRecordingMessage {
  type: 'stop-recording';
}
