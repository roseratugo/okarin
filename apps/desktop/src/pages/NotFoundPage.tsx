import { type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import './NotFoundPage.css';

export default function NotFoundPage(): ReactElement {
  const navigate = useNavigate();

  return (
    <div className="notfound-page">
      <div className="notfound-content">
        {/* 404 Icon */}
        <div className="notfound-404">404</div>

        {/* Error Message */}
        <div className="notfound-message">
          <h1>Page Not Found</h1>
          <p>The page you&apos;re looking for doesn&apos;t exist or has been moved.</p>
        </div>

        {/* Actions */}
        <div className="notfound-actions">
          <Button
            variant="primary"
            fullWidth
            onClick={() => navigate('/')}
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
            }
          >
            Go Back Home
          </Button>

          <Button
            variant="ghost"
            fullWidth
            onClick={() => window.history.back()}
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
            }
          >
            Go Back
          </Button>
        </div>

        {/* Help Text */}
        <div className="notfound-help">
          <p>If you believe this is an error, please contact support or check your connection.</p>
        </div>
      </div>
    </div>
  );
}
