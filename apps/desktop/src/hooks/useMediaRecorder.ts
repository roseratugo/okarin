import { useCallback, useRef } from 'react';
import { addAudioChunk, addVideoChunk } from '../lib/recording';
import { getVideoQualityPreset } from '../lib/videoQualityPresets';
import { useSettingsStore } from '../stores';

interface MediaRecorderState {
  audioRecorder: MediaRecorder | null;
  videoRecorder: MediaRecorder | null;
  startTime: number;
}

interface UseMediaRecorderReturn {
  startRecording: (participantId: string, stream: MediaStream) => Promise<void>;
  stopRecording: (participantId: string) => Promise<void>;
}

/**
 * Hook to manage MediaRecorder for capturing and sending audio/video chunks to Rust
 */
export function useMediaRecorder(): UseMediaRecorderReturn {
  const recordersRef = useRef<Map<string, MediaRecorderState>>(new Map());
  const { audioSettings, videoSettings } = useSettingsStore();

  const startRecording = useCallback(
    async (participantId: string, stream: MediaStream) => {
      console.log(`Starting media recording for participant: ${participantId}`);

      // Separate audio and video tracks
      const audioTracks = stream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();

      // Log actual track settings BEFORE recording
      if (videoTracks.length > 0) {
        const videoTrack = videoTracks[0];
        const settings = videoTrack.getSettings();
        console.log(`[${participantId}] Video track settings BEFORE recording:`, {
          width: settings.width,
          height: settings.height,
          aspectRatio: settings.aspectRatio,
          frameRate: settings.frameRate,
          deviceId: settings.deviceId,
        });

        // Apply constraints to ensure we record at the desired resolution
        try {
          await videoTrack.applyConstraints({
            width: { ideal: videoSettings.width },
            height: { ideal: videoSettings.height },
            aspectRatio: { ideal: videoSettings.aspectRatio === '16:9' ? 16 / 9 : 4 / 3 },
            frameRate: { ideal: videoSettings.frameRate },
          });

          const newSettings = videoTrack.getSettings();
          console.log(`[${participantId}] Video track settings AFTER applying constraints:`, {
            width: newSettings.width,
            height: newSettings.height,
            aspectRatio: newSettings.aspectRatio,
            frameRate: newSettings.frameRate,
          });
        } catch (error) {
          console.error(`[${participantId}] Failed to apply video constraints:`, error);
        }
      }

      const recorderState: MediaRecorderState = {
        audioRecorder: null,
        videoRecorder: null,
        startTime: Date.now(),
      };

      // Setup audio recorder if audio tracks exist
      if (audioTracks.length > 0) {
        const audioStream = new MediaStream(audioTracks);

        // Use WebM with Opus codec for good quality and compatibility
        const audioMimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';

        console.log(`Audio MIME type: ${audioMimeType}`);

        // Calculate audio bitrate based on quality setting
        const audioBitrate =
          audioSettings.quality === 'high'
            ? 256000
            : audioSettings.quality === 'medium'
              ? 128000
              : 96000;

        const audioRecorder = new MediaRecorder(audioStream, {
          mimeType: audioMimeType,
          audioBitsPerSecond: audioBitrate,
        });

        audioRecorder.ondataavailable = async (event) => {
          if (event.data && event.data.size > 0) {
            try {
              // Send chunks to Rust immediately (streaming)
              const arrayBuffer = await event.data.arrayBuffer();
              const uint8Array = new Uint8Array(arrayBuffer);
              await addAudioChunk(participantId, uint8Array);
              console.log(`Sent audio chunk for ${participantId}: ${event.data.size} bytes`);
            } catch (error) {
              console.error(`Failed to send audio chunk for ${participantId}:`, error);
            }
          }
        };

        audioRecorder.onerror = (event) => {
          console.error(`Audio recorder error for ${participantId}:`, event);
        };

        // Start recording with timeslice for streaming chunks (1 second chunks)
        audioRecorder.start(1000);
        recorderState.audioRecorder = audioRecorder;

        console.log(`Audio recorder started for ${participantId}`);
      }

      // Setup video recorder if video tracks exist
      if (videoTracks.length > 0) {
        const videoStream = new MediaStream(videoTracks);

        // Use high quality video codec
        const videoMimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
            ? 'video/webm;codecs=vp8'
            : 'video/webm';

        console.log(`Video MIME type: ${videoMimeType}`);

        // Get video bitrate from quality preset
        const videoPreset = getVideoQualityPreset(videoSettings.quality);

        const videoRecorder = new MediaRecorder(videoStream, {
          mimeType: videoMimeType,
          videoBitsPerSecond: videoPreset.bitrate,
        });

        videoRecorder.ondataavailable = async (event) => {
          if (event.data && event.data.size > 0) {
            try {
              // Send chunks to Rust immediately (streaming)
              const arrayBuffer = await event.data.arrayBuffer();
              const uint8Array = new Uint8Array(arrayBuffer);
              await addVideoChunk(participantId, uint8Array);
              console.log(`Sent video chunk for ${participantId}: ${event.data.size} bytes`);
            } catch (error) {
              console.error(`Failed to send video chunk for ${participantId}:`, error);
            }
          }
        };

        videoRecorder.onerror = (event) => {
          console.error(`Video recorder error for ${participantId}:`, event);
        };

        // Start recording with timeslice for streaming chunks (1 second chunks)
        videoRecorder.start(1000);
        recorderState.videoRecorder = videoRecorder;

        console.log(`Video recorder started for ${participantId}`);
      }

      recordersRef.current.set(participantId, recorderState);
    },
    [audioSettings, videoSettings]
  );

  const stopRecording = useCallback(async (participantId: string) => {
    console.log(`Stopping media recording for participant: ${participantId}`);

    const recorderState = recordersRef.current.get(participantId);
    if (!recorderState) {
      console.warn(`No recorder found for participant: ${participantId}`);
      return;
    }

    // Stop recorders and wait for final chunks to be sent
    const audioPromise = new Promise<void>((resolve) => {
      if (recorderState.audioRecorder && recorderState.audioRecorder.state !== 'inactive') {
        recorderState.audioRecorder.onstop = () => {
          console.log(`Audio recorder stopped for ${participantId}`);
          resolve();
        };
        recorderState.audioRecorder.stop();
      } else {
        resolve();
      }
    });

    const videoPromise = new Promise<void>((resolve) => {
      if (recorderState.videoRecorder && recorderState.videoRecorder.state !== 'inactive') {
        recorderState.videoRecorder.onstop = () => {
          console.log(`Video recorder stopped for ${participantId}`);
          resolve();
        };
        recorderState.videoRecorder.stop();
      } else {
        resolve();
      }
    });

    // Wait for both recorders to stop (final chunks are sent in ondataavailable)
    await Promise.all([audioPromise, videoPromise]);

    recordersRef.current.delete(participantId);
    console.log(`Recording stopped for ${participantId}`);
  }, []);

  return {
    startRecording,
    stopRecording,
  };
}
