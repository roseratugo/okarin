import React from 'react';
import { cn } from '../../lib/utils';
import './Input.css';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return <input type={type} className={cn('glass-input', className)} ref={ref} {...props} />;
  }
);

Input.displayName = 'Input';
