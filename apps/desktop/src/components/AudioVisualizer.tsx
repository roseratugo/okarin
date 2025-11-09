import { useEffect, useRef, type ReactElement } from 'react';
import './AudioVisualizer.css';

interface AudioVisualizerProps {
  stream: MediaStream | null;
  isActive: boolean;
}

export default function AudioVisualizer({
  stream,
  isActive,
}: Readonly<AudioVisualizerProps>): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    if (!stream || !isActive) {
      ctx.clearRect(0, 0, rect.width, rect.height);
      const barCount = 48;
      const barWidth = rect.width / barCount;
      const minHeight = 2;

      const isDark = document.documentElement.classList.contains('dark');
      ctx.fillStyle = isDark ? '#9ca3af' : '#6b7280';

      for (let i = 0; i < barCount; i++) {
        const x = i * barWidth;
        const y = rect.height - minHeight;
        ctx.fillRect(x, y, barWidth - 2, minHeight);
      }

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      return undefined;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return undefined;

    try {
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 128;
      analyserRef.current.smoothingTimeConstant = 0.8;
      analyserRef.current.minDecibels = -90;
      analyserRef.current.maxDecibels = -10;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const barCount = 48;
      const barWidth = rect.width / barCount;
      const barGap = 2;
      const halfBars = Math.floor(barCount / 2);

      const mapBarToFrequency = (barIndex: number): number => {
        if (barIndex < halfBars) {
          const t = (halfBars - 1 - barIndex) / (halfBars - 1);
          return Math.floor(t * bufferLength * 0.5);
        } else {
          const mirrorIndex = barCount - 1 - barIndex;
          const t = (halfBars - 1 - mirrorIndex) / (halfBars - 1);
          return Math.floor(t * bufferLength * 0.5);
        }
      };

      const updateBars = () => {
        if (!analyserRef.current || !ctx) return;

        analyserRef.current.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, rect.width, rect.height);

        const isDark = document.documentElement.classList.contains('dark');
        ctx.fillStyle = isDark ? '#9ca3af' : '#6b7280';

        for (let i = 0; i < barCount; i++) {
          const freqIndex = mapBarToFrequency(i);
          const value = dataArray[freqIndex];
          const normalized = value / 255;
          const height = Math.max(2, normalized * rect.height);

          const x = i * barWidth;
          const y = rect.height - height;

          ctx.fillRect(x, y, barWidth - barGap, height);
        }

        animationRef.current = requestAnimationFrame(updateBars);
      };

      updateBars();

      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
        if (source) {
          source.disconnect();
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }
      };
    } catch (error) {
      console.error('Error setting up audio visualizer:', error);
      return undefined;
    }
  }, [stream, isActive]);

  return (
    <div className="audio-visualizer">
      <canvas ref={canvasRef} className="visualizer-canvas" />
      <div className="visualizer-label">Microphone</div>
    </div>
  );
}
