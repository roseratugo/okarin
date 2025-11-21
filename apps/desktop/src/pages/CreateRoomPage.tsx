import { useState, useCallback, useEffect, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { AbstractBackground } from '../components/ui';
import PreJoinScreen, { JoinSettings } from '../components/PreJoinScreen';
import { createRoom, joinRoom, login, getMe, AuthUser } from '../lib/signalingApi';
import './CreateRoomPage.css';

export default function CreateRoomPage(): ReactElement {
  const navigate = useNavigate();
  const [roomName] = useState('Recording Session');
  const [userName, setUserName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [showPreJoin, setShowPreJoin] = useState(false);
  const [createdRoomId, setCreatedRoomId] = useState('');

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [_authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('authToken');
      if (token) {
        try {
          const { user } = await getMe(token);
          setAuthUser(user);
          setUserName(user.name);
          setIsAuthenticated(true);
        } catch {
          localStorage.removeItem('authToken');
        }
      }
      setIsCheckingAuth(false);
    };
    checkAuth();
  }, []);

  const handleLogin = useCallback(async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter email and password');
      return;
    }

    setIsLoggingIn(true);
    setError('');

    try {
      const response = await login(email.trim(), password);
      localStorage.setItem('authToken', response.token);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setIsLoggingIn(false);
    }
  }, [email, password]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('authToken');
    window.location.reload();
  }, []);

  const handleCreateRoom = useCallback(async () => {
    if (!userName.trim()) {
      setError('Please enter your name');
      return;
    }

    const authToken = localStorage.getItem('authToken');
    if (!authToken) {
      setError('Please login first');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      const response = await createRoom(authToken);
      setCreatedRoomId(response.room_id);
      setShowPreJoin(true);
      setIsCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room. Please try again.');
      setIsCreating(false);
    }
  }, [userName]);

  const handleJoinWithSettings = useCallback(
    async (settings: JoinSettings) => {
      setIsCreating(true);
      setError('');

      try {
        const joinResponse = await joinRoom(createdRoomId, userName.trim());

        sessionStorage.setItem(
          'currentRoom',
          JSON.stringify({
            roomId: createdRoomId,
            roomName: roomName.trim(),
            userName: userName.trim(),
            participantId: joinResponse.participant_id,
            token: joinResponse.token,
            isHost: true,
            createdAt: new Date().toISOString(),
            mediaSettings: settings,
          })
        );

        navigate(`/recording/${createdRoomId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to join room');
        setIsCreating(false);
        setShowPreJoin(false);
      }
    },
    [createdRoomId, roomName, userName, navigate]
  );

  const handleCancelPreJoin = useCallback(() => {
    setShowPreJoin(false);
    setCreatedRoomId('');
  }, []);

  if (isCheckingAuth) {
    return (
      <AbstractBackground>
        <div className="create-room-page">
          <div className="room-card">
            <div className="room-card-header">
              <h1>Loading...</h1>
            </div>
          </div>
        </div>
      </AbstractBackground>
    );
  }

  if (!isAuthenticated) {
    return (
      <AbstractBackground>
        <div className="login-page">
          <div className="login-content">
            <div className="login-header">
              <h1 className="login-title">OKARIN</h1>
              <p className="login-subtitle">Founder member login</p>
            </div>

            <div className="login-form">
              <input
                id="email"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoggingIn}
                className="login-input"
                autoFocus
              />

              <input
                id="password"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoggingIn}
                className="login-input"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />

              {error && (
                <div className="login-error">
                  <p>{error}</p>
                </div>
              )}

              <button
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="login-btn login-btn-primary"
              >
                {isLoggingIn ? 'Logging in...' : 'Login'}
              </button>
            </div>
          </div>
        </div>
      </AbstractBackground>
    );
  }

  return (
    <AbstractBackground>
      {showPreJoin && (
        <PreJoinScreen
          roomName={roomName}
          userName={userName}
          onJoin={handleJoinWithSettings}
          onCancel={handleCancelPreJoin}
        />
      )}
      <div className="login-page">
        <div className="login-content">
          <div className="login-header">
            <h1 className="login-title">OKARIN</h1>
            <p className="login-subtitle">Create a recording room</p>
          </div>

          <div className="login-form">
            <input
              id="userName"
              type="text"
              placeholder="Your name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              disabled={isCreating}
              className="login-input"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
              autoFocus
            />

            {error && (
              <div className="login-error">
                <p>{error}</p>
              </div>
            )}

            <button
              onClick={handleCreateRoom}
              disabled={isCreating}
              className="login-btn login-btn-primary"
            >
              {isCreating ? 'Creating...' : 'Create Room'}
            </button>

            <div className="login-separator"></div>

            <button onClick={handleLogout} className="login-btn">
              Logout
            </button>
          </div>
        </div>
      </div>
    </AbstractBackground>
  );
}
