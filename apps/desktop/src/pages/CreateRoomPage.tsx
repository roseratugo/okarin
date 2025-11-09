import { useState, useCallback, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import { Input } from '@podcast-recorder/ui';
import PreJoinScreen, { JoinSettings } from '../components/PreJoinScreen';
import { createRoom, joinRoom } from '../lib/signalingApi';
import './CreateRoomPage.css';

export default function CreateRoomPage(): ReactElement {
  const navigate = useNavigate();
  const [roomName, setRoomName] = useState('');
  const [userName, setUserName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [showPreJoin, setShowPreJoin] = useState(false);
  const [createdRoomId, setCreatedRoomId] = useState('');

  const handleCreateRoom = useCallback(async () => {
    if (!roomName.trim() || !userName.trim()) {
      setError('Please enter both room name and your name');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      // Create room on signaling server
      const response = await createRoom(roomName.trim(), userName.trim());
      setCreatedRoomId(response.room_id);

      // Show pre-join screen (actual join happens after media setup)
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
        // Join the room as host to get JWT token
        const joinResponse = await joinRoom(createdRoomId, userName.trim());

        // Store room info with token
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

        // Navigate to recording page
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
            <h1>Create Recording Room</h1>
            <p>Start a new podcast recording session</p>
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
