import { useState, type ReactElement } from 'react';
import PreJoinScreen, { JoinSettings } from '../components/PreJoinScreen';
import { Button } from '@podcast-recorder/ui';

export default function TestPreJoin(): ReactElement {
  const [showPreJoin, setShowPreJoin] = useState(false);
  const [settings, setSettings] = useState<JoinSettings | null>(null);

  const handleJoin = (joinSettings: JoinSettings) => {
    setSettings(joinSettings);
    setShowPreJoin(false);
    console.log('Join settings:', joinSettings);
  };

  const handleCancel = () => {
    setShowPreJoin(false);
    console.log('Cancelled');
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>PreJoin Screen Test</h1>

      <Button variant="primary" onClick={() => setShowPreJoin(true)}>
        Open PreJoin Screen
      </Button>

      {settings && (
        <div
          style={{ marginTop: '2rem', padding: '1rem', background: '#f0f0f0', borderRadius: '8px' }}
        >
          <h3>Settings Received:</h3>
          <pre>{JSON.stringify(settings, null, 2)}</pre>
        </div>
      )}

      {showPreJoin && (
        <PreJoinScreen
          roomName="Test Room"
          userName="Test User"
          onJoin={handleJoin}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
