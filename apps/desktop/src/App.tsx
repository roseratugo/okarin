import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@podcast-recorder/ui';
import './App.css';

interface AppState {
  appName: string;
  appVersion: string;
  roomId: string;
  generatedRoomId: string;
  error: string | null;
}

function App(): JSX.Element {
  const [state, setState] = useState<AppState>({
    appName: '',
    appVersion: '',
    roomId: '',
    generatedRoomId: '',
    error: null,
  });

  useEffect(() => {
    Promise.all([invoke<string>('get_app_name'), invoke<string>('get_app_version')])
      .then(([name, version]) => {
        setState((prev) => ({
          ...prev,
          appName: name,
          appVersion: version,
        }));
      })
      .catch((error) => {
        console.error('Failed to load app info:', error);
        setState((prev) => ({ ...prev, error: String(error) }));
      });
  }, []);

  const handleCreateRoom = (): void => {
    void (async () => {
      try {
        const newRoomId = await invoke<string>('generate_room_id');
        setState((prev) => ({
          ...prev,
          generatedRoomId: newRoomId,
          error: null,
        }));
      } catch (error) {
        console.error('Failed to create room:', error);
        setState((prev) => ({
          ...prev,
          error: `Failed to create room: ${String(error)}`,
        }));
      }
    })();
  };

  const handleJoinRoom = (): void => {
    if (!state.roomId.trim()) {
      setState((prev) => ({ ...prev, error: 'Please enter a room ID' }));
      return;
    }
    console.log('Joining room:', state.roomId);
    // TODO: Implement actual room joining logic
  };

  return (
    <div className="container">
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1>Welcome to {state.appName}!</h1>
        <p style={{ color: '#666' }}>v{state.appVersion}</p>
      </div>

      {state.error && (
        <div
          style={{
            padding: '1rem',
            marginBottom: '1rem',
            backgroundColor: '#fee',
            border: '1px solid #fcc',
            borderRadius: '4px',
            color: '#c00',
          }}
        >
          {state.error}
        </div>
      )}

      <div className="row">
        <div>
          <h3>Create Room</h3>
          <Button onClick={handleCreateRoom}>Generate Room ID</Button>
          {state.generatedRoomId && (
            <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#efe' }}>
              <p>
                <strong>Room ID:</strong> <code>{state.generatedRoomId}</code>
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(state.generatedRoomId);
                  setState((prev) => ({ ...prev, error: null }));
                }}
              >
                Copy to Clipboard
              </Button>
            </div>
          )}
        </div>

        <div>
          <h3>Join Room</h3>
          <input
            type="text"
            placeholder="Enter Room ID"
            value={state.roomId}
            onChange={(e) => setState((prev) => ({ ...prev, roomId: e.target.value }))}
            style={{ display: 'block', marginBottom: '0.5rem', width: '100%' }}
          />
          <Button variant="secondary" onClick={handleJoinRoom}>
            Join Room
          </Button>
        </div>
      </div>

      <p className="read-the-docs">
        Click on Create Room to start a new podcast session or Join Room with an existing ID
      </p>
    </div>
  );
}

export default App;
