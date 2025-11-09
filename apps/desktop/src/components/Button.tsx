import { ButtonHTMLAttributes, ReactNode, type ReactElement } from 'react';
import './Button.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  loading?: boolean;
  children?: ReactNode;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  fullWidth = false,
  loading = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps): ReactElement {
  const buttonClasses = [
    'btn',
    `btn-${variant}`,
    `btn-${size}`,
    fullWidth ? 'btn-full' : '',
    loading ? 'btn-loading' : '',
    disabled ? 'btn-disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const hasIcon = icon || loading;
  const hasChildren = children;

  return (
    <button className={buttonClasses} disabled={disabled || loading} {...props}>
      {loading ? (
        <span className="btn-spinner">
          <svg className="spinner" viewBox="0 0 24 24">
            <circle className="spinner-circle" cx="12" cy="12" r="10" fill="none" strokeWidth="3" />
          </svg>
        </span>
      ) : (
        hasIcon && iconPosition === 'left' && <span className="btn-icon btn-icon-left">{icon}</span>
      )}

      {hasChildren && <span className="btn-text">{children}</span>}

      {!loading && hasIcon && iconPosition === 'right' && (
        <span className="btn-icon btn-icon-right">{icon}</span>
      )}
    </button>
  );
}

export function IconButton({
  icon,
  'aria-label': ariaLabel,
  ...props
}: Omit<ButtonProps, 'children'> & { 'aria-label': string }): ReactElement {
  return (
    <Button {...props} aria-label={ariaLabel}>
      {icon}
    </Button>
  );
}

export function TextButton({
  children,
  ...props
}: Omit<ButtonProps, 'icon' | 'iconPosition'>): ReactElement {
  return <Button {...props}>{children}</Button>;
}
