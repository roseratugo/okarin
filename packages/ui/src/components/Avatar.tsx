import React from 'react';
import { cn } from '../utils/cn';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  fallback?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, alt, fallback, size = 'md', ...props }, ref) => {
    const sizeClasses = {
      sm: 'h-8 w-8 text-xs',
      md: 'h-10 w-10 text-sm',
      lg: 'h-12 w-12 text-base',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'relative flex shrink-0 overflow-hidden rounded-full',
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {src ? (
          <img className="aspect-square h-full w-full object-cover" src={src} alt={alt} />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gray-200 text-gray-600 font-medium">
            {fallback || alt?.charAt(0)?.toUpperCase() || '?'}
          </div>
        )}
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';
