import { Participant, IceServer } from '../types';

export type ServerMessage =
  | JoinedMessage
  | ParticipantJoinedMessage
  | ParticipantLeftMessage
  | OfferRelayMessage
  | AnswerRelayMessage
  | IceCandidateRelayMessage
  | RecordingStartedMessage
  | RecordingStoppedMessage
  | ErrorMessage;

export interface JoinedMessage {
  type: 'joined';
  selfId: string;
  participants: Participant[];
  iceServers: IceServer[];
}

export interface ParticipantJoinedMessage {
  type: 'participant-joined';
  participant: Participant;
}

export interface ParticipantLeftMessage {
  type: 'participant-left';
  participantId: string;
}

export interface OfferRelayMessage {
  type: 'offer';
  from: string;
  sdp: string;
}

export interface AnswerRelayMessage {
  type: 'answer';
  from: string;
  sdp: string;
}

export interface IceCandidateRelayMessage {
  type: 'ice-candidate';
  from: string;
  candidate: RTCIceCandidateInit;
}

export interface RecordingStartedMessage {
  type: 'recording-started';
  sessionId: string;
  startedAt: Date;
}

export interface RecordingStoppedMessage {
  type: 'recording-stopped';
  sessionId: string;
  endedAt: Date;
}

export interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
  details?: unknown;
}
