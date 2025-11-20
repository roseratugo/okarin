import { useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import { useState, useEffect, type ReactElement } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getMe } from '../lib/signalingApi';
import './HomePage.css';

export default function HomePage(): ReactElement {
  const navigate = useNavigate();
  const [appName, setAppName] = useState('');
  const [appVersion, setAppVersion] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [clickCount, setClickCount] = useState(0);

  useEffect(() => {
    invoke<string>('get_app_name').then(setAppName).catch(console.error);
    invoke<string>('get_app_version').then(setAppVersion).catch(console.error);

    const token = localStorage.getItem('authToken');
    if (token) {
      getMe(token)
        .then(() => setIsAuthenticated(true))
        .catch(() => {
          localStorage.removeItem('authToken');
          setIsAuthenticated(false);
        });
    }
  }, []);

  const handleTitleClick = () => {
    const newCount = clickCount + 1;
    if (newCount >= 5) {
      navigate('/room/create');
      setClickCount(0);
    } else {
      setClickCount(newCount);
      setTimeout(() => setClickCount(0), 2000);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        navigate('/room/create');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  return (
    <div className="home-page">
      <div className="home-content">
        <div className="home-header">
          <h1 className="home-title" onClick={handleTitleClick} style={{ cursor: 'default' }}>
            {appName || 'Podcast Recorder'}
          </h1>
          <p className="home-subtitle">Record, collaborate, and create amazing podcasts together</p>
          {appVersion && <p className="home-version">Version {appVersion}</p>}
        </div>

        <div className="home-actions">
          {isAuthenticated && (
            <div className="action-card">
              <div className="action-card-header">
                <h2>Start Recording</h2>
                <p>Create a new recording room and invite your co-hosts to join you</p>
              </div>
              <Button
                variant="primary"
                fullWidth
                size="lg"
                onClick={() => navigate('/room/create')}
                icon={
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                }
              >
                Create New Room
              </Button>
            </div>
          )}

          <div className="action-card">
            <div className="action-card-header">
              <h2>Join Recording</h2>
              <p>Enter a room ID to join an existing recording session</p>
            </div>
            <Button
              variant="secondary"
              fullWidth
              size="lg"
              onClick={() => navigate('/room/join')}
              icon={
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                  />
                </svg>
              }
            >
              Join Existing Room
            </Button>
          </div>
        </div>

        <div className="features-section">
          <h3>Features</h3>
          <div className="features-grid">
            <div className="feature-item">
              <span className="feature-check">✓</span>
              <span>High-quality audio recording</span>
            </div>
            <div className="feature-item">
              <span className="feature-check">✓</span>
              <span>Real-time collaboration</span>
            </div>
            <div className="feature-item">
              <span className="feature-check">✓</span>
              <span>Video & screen sharing</span>
            </div>
            <div className="feature-item">
              <span className="feature-check">✓</span>
              <span>Multi-track recording</span>
            </div>
            <div className="feature-item">
              <span className="feature-check">✓</span>
              <span>Cloud backup & sync</span>
            </div>
            <div className="feature-item">
              <span className="feature-check">✓</span>
              <span>Export to popular formats</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
