import React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          {
            'bg-white/20 backdrop-blur-sm text-white border border-white/30 hover:bg-white/30 focus-visible:ring-white/50':
              variant === 'primary',
            'bg-white/10 backdrop-blur-sm text-white/80 border border-white/20 hover:bg-white/20 focus-visible:ring-white/30':
              variant === 'secondary',
            'bg-red-500/80 backdrop-blur-sm text-white border border-red-400/30 hover:bg-red-500 focus-visible:ring-red-400':
              variant === 'danger',
            'text-white/70 hover:text-white hover:bg-white/10 focus-visible:ring-white/30':
              variant === 'ghost',
          },
          {
            'h-8 px-3 text-sm': size === 'sm',
            'h-10 px-4 text-base': size === 'md',
            'h-12 px-6 text-lg': size === 'lg',
          },
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
