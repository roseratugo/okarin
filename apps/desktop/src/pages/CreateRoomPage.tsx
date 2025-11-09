import { useState, useCallback, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import { Input } from '@podcast-recorder/ui';
import { invoke } from '@tauri-apps/api/core';
import PreJoinScreen, { JoinSettings } from '../components/PreJoinScreen';
import './CreateRoomPage.css';

export default function CreateRoomPage(): ReactElement {
  const navigate = useNavigate();
  const [roomName, setRoomName] = useState('');
  const [userName, setUserName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [showPreJoin, setShowPreJoin] = useState(false);
  const [generatedRoomId, setGeneratedRoomId] = useState('');

  const handleCreateRoom = useCallback(async () => {
    if (!roomName.trim() || !userName.trim()) {
      setError('Please enter both room name and your name');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      const roomId = await invoke<string>('generate_room_id');
      setGeneratedRoomId(roomId);
      setShowPreJoin(true);
      setIsCreating(false);
    } catch {
      setError('Failed to create room. Please try again.');
      setIsCreating(false);
    }
  }, [roomName, userName]);

  const handleJoinWithSettings = useCallback(
    (settings: JoinSettings) => {
      sessionStorage.setItem(
        'currentRoom',
        JSON.stringify({
          roomId: generatedRoomId,
          roomName: roomName.trim(),
          userName: userName.trim(),
          isHost: true,
          createdAt: new Date().toISOString(),
          mediaSettings: settings,
        })
      );

      navigate(`/recording/${generatedRoomId}`);
    },
    [generatedRoomId, roomName, userName, navigate]
  );

  const handleCancelPreJoin = useCallback(() => {
    setShowPreJoin(false);
    setGeneratedRoomId('');
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

          {/* Debug: Quick join without prejoin */}
          {process.env.NODE_ENV === 'development' && (
            <div
              style={{
                marginTop: '1rem',
                paddingTop: '1rem',
                borderTop: '1px solid var(--color-border)',
              }}
            >
              <Button
                variant="secondary"
                className="btn btn-secondary btn-full"
                onClick={async () => {
                  if (!roomName.trim() || !userName.trim()) {
                    setError('Please enter both room name and your name');
                    return;
                  }
                  try {
                    const roomId = await invoke<string>('generate_room_id');
                    sessionStorage.setItem(
                      'currentRoom',
                      JSON.stringify({
                        roomId,
                        roomName: roomName.trim(),
                        userName: userName.trim(),
                        isHost: true,
                        createdAt: new Date().toISOString(),
                        mediaSettings: {
                          videoEnabled: false,
                          audioEnabled: true,
                          selectedVideoDevice: '',
                          selectedAudioDevice: '',
                        },
                      })
                    );
                    navigate(`/recording/${roomId}`);
                  } catch {
                    setError('Failed to create room');
                  }
                }}
                disabled={isCreating}
              >
                Quick Join (Skip Media Setup)
              </Button>
            </div>
          )}

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
