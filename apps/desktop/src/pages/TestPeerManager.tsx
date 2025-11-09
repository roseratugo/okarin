import { useState, useEffect, useRef, type ReactElement } from 'react';
import { PeerManager, PeerConnectionEventHandlers } from '../lib/PeerManager';
import Button from '../components/Button';
import './TestPeerManager.css';

type PeerInfo = {
  id: string;
  connectionState: string;
  iceConnectionState: string;
  negotiationState: string;
  hasVideo: boolean;
  hasAudio: boolean;
};

export default function TestPeerManager(): ReactElement {
  const [peerManager, setPeerManager] = useState<PeerManager | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<Map<string, PeerInfo>>(new Map());
  const [logs, setLogs] = useState<string[]>([]);
  const [testPeerId, setTestPeerId] = useState('');

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${timestamp}] ${message}`, ...prev].slice(0, 50));
    console.log(message);
  };

  useEffect(() => {
    const eventHandlers: PeerConnectionEventHandlers = {
      onTrack: (peerId: string, event: RTCTrackEvent) => {
        addLog(`📹 Track received from ${peerId}: ${event.track.kind}`);

        const videoElement = remoteVideoRefs.current.get(peerId);
        if (videoElement) {
          if (!videoElement.srcObject) {
            videoElement.srcObject = event.streams[0];
          }
        }

        setPeers((prev) => {
          const newPeers = new Map(prev);
          const peer = newPeers.get(peerId) || {
            id: peerId,
            connectionState: 'new',
            iceConnectionState: 'new',
            negotiationState: 'stable',
            hasVideo: false,
            hasAudio: false,
          };
          if (event.track.kind === 'video') peer.hasVideo = true;
          if (event.track.kind === 'audio') peer.hasAudio = true;
          newPeers.set(peerId, peer);
          return newPeers;
        });
      },

      onIceCandidate: (peerId: string, candidate: RTCIceCandidate) => {
        addLog(`🧊 ICE candidate for ${peerId}: ${candidate.candidate.substring(0, 50)}...`);
      },

      onConnectionStateChange: (peerId: string, state: string) => {
        addLog(`🔗 Connection state for ${peerId}: ${state}`);
        setPeers((prev) => {
          const newPeers = new Map(prev);
          const peer = newPeers.get(peerId);
          if (peer) {
            peer.connectionState = state;
            newPeers.set(peerId, peer);
          }
          return newPeers;
        });

        if (state === 'closed' || state === 'failed') {
          setPeers((prev) => {
            const newPeers = new Map(prev);
            newPeers.delete(peerId);
            return newPeers;
          });
        }
      },

      onIceConnectionStateChange: (peerId: string, state: string) => {
        addLog(`❄️  ICE connection state for ${peerId}: ${state}`);
        setPeers((prev) => {
          const newPeers = new Map(prev);
          const peer = newPeers.get(peerId);
          if (peer) {
            peer.iceConnectionState = state;
            newPeers.set(peerId, peer);
          }
          return newPeers;
        });
      },

      onNegotiationNeeded: (peerId: string) => {
        addLog(`🤝 Negotiation needed for ${peerId}`);
      },

      onNegotiationStateChange: (peerId: string, state: string) => {
        addLog(`🔄 Negotiation state for ${peerId}: ${state}`);
        setPeers((prev) => {
          const newPeers = new Map(prev);
          const peer = newPeers.get(peerId);
          if (peer) {
            peer.negotiationState = state;
            newPeers.set(peerId, peer);
          }
          return newPeers;
        });
      },

      onError: (peerId: string, error: Error) => {
        addLog(`❌ Error for ${peerId}: ${error.message}`);
      },
    };

    const manager = new PeerManager([], eventHandlers, 4);
    setPeerManager(manager);
    addLog('✅ PeerManager initialized with max 4 peers');

    return () => {
      manager.closeAll();
      localStream?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startLocalMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      peerManager?.setLocalStream(stream);
      addLog('✅ Local media started (video + audio)');
    } catch (error) {
      addLog(`❌ Failed to get local media: ${error}`);
    }
  };

  const stopLocalMedia = () => {
    localStream?.getTracks().forEach((track) => track.stop());
    setLocalStream(null);
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    addLog('⏹️  Local media stopped');
  };

  const createPeer = async () => {
    if (!peerManager || !testPeerId) {
      addLog('❌ Enter a peer ID first');
      return;
    }

    try {
      const peerConnection = peerManager.createPeerConnection(testPeerId);
      addLog(`✅ Created peer connection for ${testPeerId}`);

      setPeers((prev) => {
        const newPeers = new Map(prev);
        newPeers.set(testPeerId, {
          id: testPeerId,
          connectionState: peerConnection.connectionState,
          iceConnectionState: peerConnection.iceConnectionState,
          negotiationState: 'stable',
          hasVideo: false,
          hasAudio: false,
        });
        return newPeers;
      });

      setTestPeerId('');
    } catch (error) {
      addLog(`❌ Failed to create peer: ${error}`);
    }
  };

  const createOffer = async () => {
    if (!peerManager || !testPeerId) {
      addLog('❌ Enter a peer ID first');
      return;
    }

    try {
      const offer = await peerManager.createOffer(testPeerId);
      addLog(`📤 Created offer for ${testPeerId}`);
      addLog(`SDP: ${offer.sdp?.substring(0, 100)}...`);
    } catch (error) {
      addLog(`❌ Failed to create offer: ${error}`);
    }
  };

  const removePeer = (peerId: string) => {
    peerManager?.removePeer(peerId);
    setPeers((prev) => {
      const newPeers = new Map(prev);
      newPeers.delete(peerId);
      return newPeers;
    });
    remoteVideoRefs.current.delete(peerId);
    addLog(`🗑️  Removed peer ${peerId}`);
  };

  const renegotiatePeer = async (peerId: string) => {
    if (!peerManager) {
      addLog('❌ PeerManager not initialized');
      return;
    }

    try {
      addLog(`🔄 Starting renegotiation for ${peerId}`);
      const offer = await peerManager.renegotiate(peerId);
      addLog(`✅ Renegotiation offer created for ${peerId}`);
      addLog(`SDP: ${offer.sdp?.substring(0, 100)}...`);
    } catch (error) {
      addLog(`❌ Failed to renegotiate: ${error}`);
    }
  };

  const closeAllPeers = () => {
    peerManager?.closeAll();
    setPeers(new Map());
    remoteVideoRefs.current.clear();
    addLog('🗑️  Closed all peer connections');
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="test-peer-manager">
      <div className="test-header">
        <h1>PeerManager Test Page</h1>
        <p>Test WebRTC peer connection management with up to 4 simultaneous connections</p>
      </div>

      <div className="test-grid">
        <div className="test-section">
          <h2>Local Media</h2>
          <div className="video-container">
            <video ref={localVideoRef} autoPlay muted playsInline />
          </div>
          <div className="controls">
            {!localStream ? (
              <Button onClick={startLocalMedia} variant="primary">
                Start Camera & Mic
              </Button>
            ) : (
              <Button onClick={stopLocalMedia} variant="secondary">
                Stop Media
              </Button>
            )}
          </div>
          <div className="status">Status: {localStream ? '🟢 Active' : '🔴 Inactive'}</div>
        </div>

        <div className="test-section">
          <h2>Peer Management</h2>
          <div className="peer-controls">
            <input
              type="text"
              value={testPeerId}
              onChange={(e) => setTestPeerId(e.target.value)}
              placeholder="Enter Peer ID (e.g., peer-1)"
              className="peer-input"
            />
            <div className="button-group">
              <Button onClick={createPeer} variant="primary" size="sm">
                Create Peer
              </Button>
              <Button onClick={createOffer} variant="secondary" size="sm">
                Create Offer
              </Button>
            </div>
          </div>

          <div className="peer-stats">
            <p>Active Peers: {peerManager?.getPeerCount() ?? 0} / 4</p>
            <p>Peer IDs: {peerManager?.getAllPeers().join(', ') || 'None'}</p>
          </div>

          <Button onClick={closeAllPeers} variant="danger" size="sm">
            Close All Connections
          </Button>
        </div>

        <div className="test-section peers-list">
          <h2>Connected Peers ({peers.size})</h2>
          {peers.size === 0 ? (
            <p className="empty-state">No peers connected yet</p>
          ) : (
            <div className="peer-grid">
              {Array.from(peers.values()).map((peer) => (
                <div key={peer.id} className="peer-card">
                  <div className="peer-header">
                    <h3>{peer.id}</h3>
                    <div className="peer-actions">
                      <button
                        onClick={() => renegotiatePeer(peer.id)}
                        className="renegotiate-btn"
                        title="Renegotiate connection"
                      >
                        🔄
                      </button>
                      <button
                        onClick={() => removePeer(peer.id)}
                        className="close-btn"
                        title="Remove peer"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <video
                    ref={(el) => {
                      if (el) remoteVideoRefs.current.set(peer.id, el);
                    }}
                    autoPlay
                    playsInline
                    className="peer-video"
                  />
                  <div className="peer-info">
                    <div className="info-row">
                      <span>Connection:</span>
                      <span className={`state ${peer.connectionState}`}>
                        {peer.connectionState}
                      </span>
                    </div>
                    <div className="info-row">
                      <span>ICE:</span>
                      <span className={`state ${peer.iceConnectionState}`}>
                        {peer.iceConnectionState}
                      </span>
                    </div>
                    <div className="info-row">
                      <span>Negotiation:</span>
                      <span className={`state ${peer.negotiationState}`}>
                        {peer.negotiationState}
                      </span>
                    </div>
                    <div className="info-row">
                      <span>Tracks:</span>
                      <span>
                        {peer.hasVideo ? '📹' : '⬜'} {peer.hasAudio ? '🎤' : '⬜'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="test-section logs-section">
          <div className="logs-header">
            <h2>Event Logs</h2>
            <Button onClick={clearLogs} variant="secondary" size="sm">
              Clear
            </Button>
          </div>
          <div className="logs">
            {logs.length === 0 ? (
              <p className="empty-state">No events yet</p>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="log-entry">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="test-instructions">
        <h3>📝 Testing Instructions</h3>
        <ol>
          <li>Click &quot;Start Camera & Mic&quot; to enable local media</li>
          <li>Enter a peer ID (e.g., &quot;peer-1&quot;) and click &quot;Create Peer&quot;</li>
          <li>Click &quot;Create Offer&quot; to initiate a connection (will see SDP in logs)</li>
          <li>Create up to 4 peers to test concurrent connections</li>
          <li>Monitor connection states and events in the logs</li>
          <li>Test disconnection by clicking ✕ on a peer card</li>
          <li>Use &quot;Close All Connections&quot; to reset</li>
        </ol>
        <p className="note">
          <strong>Note:</strong> For full testing with actual WebRTC connections, you&apos;ll need
          to integrate with the signaling server to exchange SDP and ICE candidates.
        </p>
      </div>
    </div>
  );
}
