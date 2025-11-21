import { ReactElement } from 'react';
import './AbstractBackground.css';

interface AbstractBackgroundProps {
  children: React.ReactNode;
}

export function AbstractBackground({ children }: AbstractBackgroundProps): ReactElement {
  return (
    <div className="abstract-bg">
      <div className="abstract-bg-gradient" />
      <div className="abstract-bg-blur" />
      <div className="abstract-bg-grain" />
      <div className="abstract-bg-content">{children}</div>
    </div>
  );
}
