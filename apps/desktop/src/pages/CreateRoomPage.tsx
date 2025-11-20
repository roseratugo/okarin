import { useState, useCallback, useEffect, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import { Input } from '@podcast-recorder/ui';
import PreJoinScreen, { JoinSettings } from '../components/PreJoinScreen';
import { createRoom, joinRoom, login, getMe, AuthUser } from '../lib/signalingApi';
import './CreateRoomPage.css';

export default function CreateRoomPage(): ReactElement {
  const navigate = useNavigate();
  const [roomName, setRoomName] = useState('');
  const [userName, setUserName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [showPreJoin, setShowPreJoin] = useState(false);
  const [createdRoomId, setCreatedRoomId] = useState('');

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
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
    if (!roomName.trim() || !userName.trim()) {
      setError('Please enter both room name and your name');
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
      const response = await createRoom(roomName.trim(), authToken);
      setCreatedRoomId(response.room_id);
      setShowPreJoin(true);
      setIsCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room. Please try again.');
      setIsCreating(false);
    }
  }, [roomName, userName]);

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
      <div className="create-room-page">
        <div className="room-card">
          <div className="room-card-header">
            <h1>Loading...</h1>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="create-room-page">
        <div className="room-card">
          <div className="room-card-header">
            <h1>Founder Member Login</h1>
            <p>Login to create recording rooms</p>
          </div>

          <div className="room-form">
            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoggingIn}
                className="input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password" className="form-label">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoggingIn}
                className="input"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>

            {error && (
              <div className="alert alert-error">
                <p>{error}</p>
              </div>
            )}
          </div>

          <div className="room-actions">
            <Button
              variant="primary"
              className="btn btn-primary btn-full"
              onClick={handleLogin}
              disabled={isLoggingIn}
            >
              {isLoggingIn ? 'Logging in...' : 'Login'}
            </Button>

            <Button
              variant="ghost"
              className="btn btn-ghost btn-full"
              onClick={() => navigate('/')}
              disabled={isLoggingIn}
            >
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {showPreJoin && (
        <PreJoinScreen
          roomName={roomName}
          userName={userName}
          onJoin={handleJoinWithSettings}
          onCancel={handleCancelPreJoin}
        />
      )}
      <div className="create-room-page">
        <div className="room-card">
          <div className="room-card-header">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1>Create Recording Room</h1>
                <p>Logged in as {authUser?.name}</p>
              </div>
              <Button variant="ghost" onClick={handleLogout} style={{ padding: '8px 12px' }}>
                Logout
              </Button>
            </div>
          </div>

          <div className="room-form">
            <div className="form-group">
              <label htmlFor="roomName" className="form-label">
                Room Name
              </label>
              <Input
                id="roomName"
                type="text"
                placeholder="e.g., Episode 42 Recording"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                disabled={isCreating}
                className="input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="userName" className="form-label">
                Your Name
              </label>
              <Input
                id="userName"
                type="text"
                placeholder="e.g., John Doe"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                disabled={isCreating}
                className="input"
              />
            </div>

            {error && (
              <div className="alert alert-error">
                <p>{error}</p>
              </div>
            )}
          </div>

          <div className="room-actions">
            <Button
              variant="primary"
              className="btn btn-primary btn-full"
              onClick={handleCreateRoom}
              disabled={isCreating}
            >
              {isCreating ? 'Creating Room...' : 'Create Room'}
            </Button>

            <Button
              variant="ghost"
              className="btn btn-ghost btn-full"
              onClick={() => navigate('/')}
              disabled={isCreating}
            >
              Back to Home
            </Button>
          </div>

          <div className="room-info">
            <p>
              Once created, you&apos;ll receive a Room ID that others can use to join your recording
              session.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
