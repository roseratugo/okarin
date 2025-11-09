import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import Button from './Button';
import { useState, useEffect, type ReactElement } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './Navigation.css';

interface NavItem {
  path: string;
  label: string;
  icon?: ReactElement;
}

export default function Navigation(): ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const [appName, setAppName] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    invoke<string>('get_app_name')
      .then(setAppName)
      .catch(() => setAppName('Podcast Recorder'));
  }, []);

  const navItems: NavItem[] = [
    {
      path: '/',
      label: 'Home',
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
          />
        </svg>
      ),
    },
    {
      path: '/room/create',
      label: 'Create Room',
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      ),
    },
    {
      path: '/room/join',
      label: 'Join Room',
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      ),
    },
    {
      path: '/settings',
      label: 'Settings',
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      ),
    },
  ];

  const currentRoom = sessionStorage.getItem('currentRoom');
  const hasActiveRoom = currentRoom !== null;
  const roomInfo = currentRoom ? JSON.parse(currentRoom) : null;

  const isActiveLink = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="nav">
      <div className="nav-container">
        <div className="nav-content">
          {/* Logo and Desktop Nav */}
          <div className="nav-left">
            {/* Logo */}
            <button onClick={() => navigate('/')} className="nav-logo">
              <div className="nav-logo-icon">
                <svg fill="currentColor" viewBox="0 0 20 20">
                  <path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" />
                </svg>
              </div>
              <span className="nav-logo-text">{appName}</span>
            </button>

            {/* Desktop Navigation Items */}
            <div className="nav-items">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `nav-item ${isActive || isActiveLink(item.path) ? 'active' : ''}`
                  }
                >
                  {item.icon}
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>

          {/* Right Side Actions */}
          <div className="nav-right">
            {/* Active Room Indicator */}
            {hasActiveRoom && roomInfo && (
              <div className="room-indicator">
                <span className="room-indicator-dot"></span>
                <span className="room-indicator-text">In Room: {roomInfo.roomId}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigate(`/recording/${roomInfo.roomId}`)}
                  style={{ marginLeft: '0.5rem' }}
                >
                  Rejoin
                </Button>
              </div>
            )}

            {/* Quick Actions */}
            <Button variant="primary" size="sm" onClick={() => navigate('/room/create')}>
              New Recording
            </Button>

            {/* Mobile Menu Toggle */}
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="nav-menu-toggle">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <div className={`mobile-menu ${isMenuOpen ? 'open' : ''}`}>
        <div className="mobile-nav-items">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setIsMenuOpen(false)}
              className={({ isActive }) =>
                `nav-item ${isActive || isActiveLink(item.path) ? 'active' : ''}`
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}

          {/* Mobile Active Room Indicator */}
          {hasActiveRoom && roomInfo && (
            <div className="mobile-room-indicator">
              <div className="mobile-room-content">
                <div className="mobile-room-info">
                  <span className="room-indicator-dot"></span>
                  <span className="room-indicator-text">Room: {roomInfo.roomId}</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigate(`/recording/${roomInfo.roomId}`);
                    setIsMenuOpen(false);
                  }}
                >
                  Rejoin
                </Button>
              </div>
            </div>
          )}

          {/* Mobile Quick Action */}
          <div className="mobile-quick-action">
            <Button
              variant="primary"
              className="btn-full"
              onClick={() => {
                navigate('/room/create');
                setIsMenuOpen(false);
              }}
            >
              Start New Recording
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
