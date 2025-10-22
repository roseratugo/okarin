export interface RecordingSession {
  id: string;
  roomId: string;
  startedAt: Date;
  endedAt?: Date;
  participants: string[];
  files: RecordingFile[];
  manifest: RecordingManifest;
}

export interface RecordingFile {
  id: string;
  sessionId: string;
  participantId: string;
  participantName: string;
  trackKind: 'audio' | 'video';
  filePath: string;
  sizeBytes: number;
  durationMs: number;
  mimeType: string;
}

export interface RecordingManifest {
  version: string;
  sessionId: string;
  roomId: string;
  startedAt: string;
  endedAt?: string;
  participants: ParticipantManifest[];
  synchronization: {
    referenceTime: number;
    offsetMs: number;
  };
}

export interface ParticipantManifest {
  id: string;
  name: string;
  joinedAt: string;
  leftAt?: string;
  files: {
    audio?: string;
    video?: string;
  };
}
