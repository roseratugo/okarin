export interface PeerConnection {
  peerId: string;
  localDescription?: RTCSessionDescriptionInit;
  remoteDescription?: RTCSessionDescriptionInit;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  signalingState: RTCSignalingState;
}

export interface MediaConstraints {
  audio: AudioConstraints | boolean;
  video: VideoConstraints | boolean;
}

export interface AudioConstraints {
  deviceId?: string;
  sampleRate?: number;
  sampleSize?: number;
  channelCount?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

export interface VideoConstraints {
  deviceId?: string;
  width?: number | { min?: number; ideal?: number; max?: number };
  height?: number | { min?: number; ideal?: number; max?: number };
  frameRate?: number | { min?: number; ideal?: number; max?: number };
  facingMode?: 'user' | 'environment';
}
