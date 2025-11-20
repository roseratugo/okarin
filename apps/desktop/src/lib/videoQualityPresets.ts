import type { VideoQuality as VideoQualityType } from '../stores/settingsStore';

export type VideoQuality = VideoQualityType;

export interface VideoQualityPreset {
  width: number;
  height: number;
  bitrate: number; // bits per second
  label: string;
}

export const VIDEO_QUALITY_PRESETS: Record<VideoQuality, VideoQualityPreset> = {
  low: {
    width: 640,
    height: 480,
    bitrate: 2_000_000, // 2 Mbps
    label: '480p (SD)',
  },
  medium: {
    width: 1280,
    height: 720,
    bitrate: 5_000_000, // 5 Mbps
    label: '720p (HD)',
  },
  high: {
    width: 1920,
    height: 1080,
    bitrate: 10_000_000, // 10 Mbps
    label: '1080p (Full HD)',
  },
  ultra: {
    width: 2560,
    height: 1440,
    bitrate: 20_000_000, // 20 Mbps
    label: '1440p (2K)',
  },
};

export function getVideoQualityPreset(quality: VideoQuality): VideoQualityPreset {
  return VIDEO_QUALITY_PRESETS[quality];
}
