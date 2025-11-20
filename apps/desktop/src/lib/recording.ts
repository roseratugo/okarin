import { invoke } from './tauri';

export interface RecordingConfig {
  roomId: string;
  outputDir: string;
  audioSampleRate?: number;
  audioChannels?: number;
  videoWidth?: number;
  videoHeight?: number;
  videoFps?: number;
}

export interface ParticipantMetadata {
  id: string;
  name: string;
  audioFile?: string;
  videoFile?: string;
  joinedAt: string;
  leftAt?: string;
}

export interface RecordingMetadata {
  id: string;
  roomId: string;
  startedAt: string;
  stoppedAt?: string;
  durationSeconds: number;
  participants: Record<string, ParticipantMetadata>;
  outputDirectory: string;
}

export type RecordingStatus =
  | { type: 'Idle' }
  | { type: 'Recording'; startedAt: string }
  | { type: 'Paused'; startedAt: string; pausedAt: string }
  | { type: 'Stopped' };

/**
 * Start a new recording session
 */
export async function startRecording(config: RecordingConfig): Promise<string> {
  return invoke<string>('start_recording', {
    roomId: config.roomId,
    outputDir: config.outputDir,
    audioSampleRate: config.audioSampleRate,
    audioChannels: config.audioChannels,
    videoWidth: config.videoWidth,
    videoHeight: config.videoHeight,
    videoFps: config.videoFps,
  });
}

/**
 * Stop the current recording session
 */
export async function stopRecording(): Promise<RecordingMetadata> {
  return invoke<RecordingMetadata>('stop_recording');
}

/**
 * Pause the current recording
 */
export async function pauseRecording(): Promise<void> {
  return invoke<void>('pause_recording');
}

/**
 * Resume the paused recording
 */
export async function resumeRecording(): Promise<void> {
  return invoke<void>('resume_recording');
}

/**
 * Add a participant track to the recording
 */
export async function addParticipantTrack(
  participantId: string,
  participantName: string,
  recordAudio: boolean,
  recordVideo: boolean
): Promise<void> {
  return invoke<void>('add_participant_track', {
    participantId,
    participantName,
    recordAudio,
    recordVideo,
  });
}

/**
 * Add an audio chunk for a participant
 */
export async function addAudioChunk(participantId: string, chunk: Uint8Array): Promise<void> {
  return invoke<void>('add_audio_chunk', {
    participantId,
    chunk: Array.from(chunk),
  });
}

/**
 * Add a video chunk for a participant
 */
export async function addVideoChunk(participantId: string, chunk: Uint8Array): Promise<void> {
  return invoke<void>('add_video_chunk', {
    participantId,
    chunk: Array.from(chunk),
  });
}

/**
 * Get the current recording status
 */
export async function getRecordingStatus(): Promise<RecordingStatus> {
  return invoke<RecordingStatus>('get_recording_status');
}

/**
 * Get the recording metadata (if available)
 */
export async function getRecordingMetadata(): Promise<RecordingMetadata | null> {
  return invoke<RecordingMetadata | null>('get_recording_metadata');
}

/**
 * Get the current recording ID
 */
export async function getRecordingId(): Promise<string | null> {
  return invoke<string | null>('get_recording_id');
}
