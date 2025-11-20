import { useState, type ReactElement } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Button from '../components/Button';
import { Input } from '@podcast-recorder/ui';
import PreJoinScreen, { JoinSettings } from '../components/PreJoinScreen';
import { joinRoom, getRoomInfo } from '../lib/signalingApi';
import './JoinRoomPage.css';
import './CreateRoomPage.css'; // Reuse the same card styles

export default function JoinRoomPage(): ReactElement {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Initialize roomId from URL query params if present
  const roomIdFromUrl = searchParams.get('roomId');
  const [roomId, setRoomId] = useState(roomIdFromUrl || '');
  const [userName, setUserName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');
  const [showPreJoin, setShowPreJoin] = useState(false);
  const [roomName, setRoomName] = useState('');

  const handleJoinRoom = async () => {
    // Validate inputs
    if (!roomId.trim() || !userName.trim()) {
      setError('Please enter both Room ID and your name');
      return;
    }

    setIsJoining(true);
    setError('');

    try {
      // Check if room exists (room ID is already a UUID from server)
      const roomInfo = await getRoomInfo(roomId.trim());
      setRoomName(roomInfo.name);

      // Show pre-join screen (actual join happens after media setup)
      setShowPreJoin(true);
      setIsJoining(false);
    } catch (err) {
      setError('Failed to join room. Please check the Room ID and try again.');
      console.error('Error joining room:', err);
      setIsJoining(false);
    }
  };

  const handleJoinWithSettings = async (settings: JoinSettings) => {
    setIsJoining(true);
    setError('');

    try {
      // Join room on signaling server and get JWT token
      const response = await joinRoom(roomId.trim(), userName.trim());

      // Store room info with token
      sessionStorage.setItem(
        'currentRoom',
        JSON.stringify({
          roomId: roomId.trim(),
          roomName: roomName || `Room ${roomId}`,
          userName: userName.trim(),
          participantId: response.participant_id,
          token: response.token,
          isHost: false,
          joinedAt: new Date().toISOString(),
          mediaSettings: settings,
        })
      );

      // Navigate to the recording room
      navigate(`/recording/${roomId.trim()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room');
      setIsJoining(false);
      setShowPreJoin(false);
    }
  };

  const handleCancelPreJoin = () => {
    setShowPreJoin(false);
  };

  return (
    <>
      {showPreJoin && (
        <PreJoinScreen
          roomName={roomName || `Room ${roomId.toUpperCase()}`}
          userName={userName}
          onJoin={handleJoinWithSettings}
          onCancel={handleCancelPreJoin}
        />
      )}
      <div className="join-room-page">
        <div className="room-card">
          <div className="room-card-header">
            <h1>Join Recording Room</h1>
            <p>Enter the Room ID to join an existing session</p>
          </div>

          <div className="room-form">
            <div className="form-group">
              <label htmlFor="roomId" className="form-label">
                Room ID
              </label>
              <Input
                id="roomId"
                type="text"
                placeholder="e.g., 38d50f38-4ef4-4695-8d20-72443bcb7af7"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                disabled={isJoining}
                className="input room-id-input"
              />
              <p className="help-text">Ask your host for the Room ID</p>
            </div>

            <div className="form-group">
              <label htmlFor="userName" className="form-label">
                Your Name
              </label>
              <Input
                id="userName"
                type="text"
                placeholder="e.g., Jane Smith"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                disabled={isJoining}
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
              onClick={handleJoinRoom}
              disabled={isJoining}
            >
              {isJoining ? 'Joining Room...' : 'Join Room'}
            </Button>

            <Button
              variant="ghost"
              className="btn btn-ghost btn-full"
              onClick={() => navigate('/')}
              disabled={isJoining}
            >
              Back to Home
            </Button>
          </div>

          <div className="help-section">
            <p>Don&apos;t have a Room ID?</p>
            <p>
              Ask your host to share the Room ID, or{' '}
              <a
                onClick={() => navigate('/room/create')}
                style={{ cursor: isJoining ? 'not-allowed' : 'pointer' }}
              >
                create your own room
              </a>{' '}
              to start a new recording session.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
