import { useState, useRef, useEffect, type ReactElement } from 'react';
import { Button } from '@podcast-recorder/ui';

export default function MediaTest(): ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
    console.log(message);
  };

  const getDevices = async () => {
    try {
      addLog('Getting media devices...');
      const deviceList = await navigator.mediaDevices.enumerateDevices();
      setDevices(deviceList);
      addLog(`Found ${deviceList.length} devices`);
      deviceList.forEach((device) => {
        addLog(`- ${device.kind}: ${device.label || 'No label'} (${device.deviceId})`);
      });
    } catch (err) {
      const error = err as { message?: string };
      addLog(`Error getting devices: ${error.message || 'Unknown error'}`);
      setError(error.message || 'Unknown error');
    }
  };

  const requestCamera = async () => {
    try {
      addLog('Requesting camera access...');
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      addLog('Camera access granted');
    } catch (err) {
      const error = err as { name?: string; message?: string };
      addLog(`Camera error: ${error.name || 'Unknown'} - ${error.message || 'Unknown error'}`);
      setError(error.message || 'Unknown error');
    }
  };

  const requestMicrophone = async () => {
    try {
      addLog('Requesting microphone access...');
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStream(mediaStream);
      addLog('Microphone access granted');
    } catch (err) {
      const error = err as { name?: string; message?: string };
      addLog(`Microphone error: ${error.name || 'Unknown'} - ${error.message || 'Unknown error'}`);
      setError(error.message || 'Unknown error');
    }
  };

  const requestBoth = async () => {
    try {
      addLog('Requesting camera and microphone...');
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      addLog('Camera and microphone access granted');
    } catch (err) {
      const error = err as { name?: string; message?: string };
      addLog(`Media error: ${error.name || 'Unknown'} - ${error.message || 'Unknown error'}`);
      setError(error.message || 'Unknown error');
    }
  };

  const stopStream = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
      addLog('Stream stopped');
    }
  };

  useEffect(() => {
    const init = () => {
      if (!navigator.mediaDevices) {
        addLog('MediaDevices API not available!');
        setError('MediaDevices API not available');
      } else {
        addLog('MediaDevices API is available');
      }
    };

    init();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Media Access Test</h1>

      <div style={{ marginBottom: '2rem' }}>
        <h3>Actions:</h3>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <Button onClick={getDevices}>List Devices</Button>
          <Button onClick={requestCamera}>Request Camera</Button>
          <Button onClick={requestMicrophone}>Request Microphone</Button>
          <Button onClick={requestBoth}>Request Both</Button>
          <Button onClick={stopStream} variant="danger">
            Stop Stream
          </Button>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '1rem',
            background: '#fee',
            border: '1px solid #fcc',
            borderRadius: '4px',
            marginBottom: '1rem',
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div>
          <h3>Video Preview:</h3>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              maxWidth: '400px',
              background: '#000',
              borderRadius: '8px',
            }}
          />
        </div>

        <div>
          <h3>Devices ({devices.length}):</h3>
          <ul style={{ fontSize: '0.875rem' }}>
            {devices.map((device, idx) => (
              <li key={idx}>
                <strong>{device.kind}:</strong> {device.label || 'Unnamed'}
                <br />
                <small style={{ color: '#666' }}>ID: {device.deviceId}</small>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h3>Logs:</h3>
        <div
          style={{
            background: '#f5f5f5',
            padding: '1rem',
            borderRadius: '4px',
            maxHeight: '200px',
            overflow: 'auto',
            fontSize: '0.875rem',
            fontFamily: 'monospace',
          }}
        >
          {logs.map((log, idx) => (
            <div key={idx}>{log}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
