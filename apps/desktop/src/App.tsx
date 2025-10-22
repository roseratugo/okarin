import { useState } from 'react';
import { Button } from '@podcast-recorder/ui';
import './App.css';

function App(): JSX.Element {
  const [roomId, setRoomId] = useState('');

  return (
    <div className="container">
      <h1>Welcome to Podcast Recorder!</h1>

      <div className="row">
        <div>
          <Button onClick={() => console.log('Create room')}>Create Room</Button>
        </div>
        <div>
          <input
            type="text"
            placeholder="Enter Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
          <Button variant="secondary" onClick={() => console.log('Join room:', roomId)}>
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
