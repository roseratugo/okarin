import { useEffect, useState } from 'react';
import { VIDEO_QUALITY_PRESETS, type VideoQuality } from '../lib/videoQualityPresets';

interface VideoCapabilities {
  supportedQualities: VideoQuality[];
  maxWidth: number;
  maxHeight: number;
  maxFrameRate: number;
  isLoading: boolean;
}

/**
 * Hook to detect supported video capabilities from the user's camera
 */
export function useVideoCapabilities(): VideoCapabilities {
  const [capabilities, setCapabilities] = useState<VideoCapabilities>({
    supportedQualities: ['low', 'medium', 'high', 'ultra'],
    maxWidth: 1920,
    maxHeight: 1080,
    maxFrameRate: 30,
    isLoading: true,
  });

  useEffect(() => {
    async function detectCapabilities() {
      try {
        // Request temporary access to video to check capabilities
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

        const videoTrack = stream.getVideoTracks()[0];
        const trackCapabilities = videoTrack.getCapabilities?.();

        // Stop the stream immediately after getting capabilities
        stream.getTracks().forEach((track) => track.stop());

        if (!trackCapabilities) {
          console.warn('getCapabilities not supported, using defaults');
          setCapabilities((prev) => ({ ...prev, isLoading: false }));
          return;
        }

        console.log('Video capabilities:', trackCapabilities);

        const maxWidth = trackCapabilities.width?.max || 1920;
        const maxHeight = trackCapabilities.height?.max || 1080;
        const maxFrameRate = trackCapabilities.frameRate?.max || 30;

        // Determine which quality presets are supported
        const supportedQualities: VideoQuality[] = [];

        for (const [quality, preset] of Object.entries(VIDEO_QUALITY_PRESETS)) {
          // Check if the preset resolution is within camera capabilities
          if (preset.width <= maxWidth && preset.height <= maxHeight) {
            supportedQualities.push(quality as VideoQuality);
          }
        }

        // If no presets are supported (unlikely), add at least 'low'
        if (supportedQualities.length === 0) {
          supportedQualities.push('low');
        }

        console.log('Supported quality presets:', supportedQualities);

        setCapabilities({
          supportedQualities,
          maxWidth,
          maxHeight,
          maxFrameRate,
          isLoading: false,
        });
      } catch (error) {
        console.error('Failed to detect video capabilities:', error);
        // Use conservative defaults if detection fails
        setCapabilities({
          supportedQualities: ['low', 'medium'],
          maxWidth: 1280,
          maxHeight: 720,
          maxFrameRate: 30,
          isLoading: false,
        });
      }
    }

    detectCapabilities();
  }, []);

  return capabilities;
}
