import React, { useEffect, useRef } from 'react';
import { cn } from '../utils/cn';
import { Avatar } from './Avatar';

export interface VideoTileProps extends React.HTMLAttributes<HTMLDivElement> {
  stream?: MediaStream;
  participantName: string;
  isAudioMuted?: boolean;
  isVideoMuted?: boolean;
  isSpeaking?: boolean;
}

export const VideoTile = React.forwardRef<HTMLDivElement, VideoTileProps>(
  (
    {
      className,
      stream,
      participantName,
      isAudioMuted = false,
      isVideoMuted = false,
      isSpeaking = false,
      ...props
    },
    ref
  ) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
      if (videoRef.current && stream) {
        videoRef.current.srcObject = stream;
      }
    }, [stream]);

    return (
      <div
        ref={ref}
        className={cn(
          'relative overflow-hidden rounded-lg bg-gray-900',
          isSpeaking && 'ring-2 ring-green-500',
          className
        )}
        {...props}
      >
        {stream && !isVideoMuted ? (
          <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Avatar size="lg" fallback={participantName} alt={participantName} />
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white truncate">{participantName}</span>
            <div className="flex gap-1">
              {isAudioMuted && (
                <span className="text-red-500">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              )}
              {isVideoMuted && (
                <span className="text-red-500">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

VideoTile.displayName = 'VideoTile';
