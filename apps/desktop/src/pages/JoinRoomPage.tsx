import { useState, useEffect, useRef, type ReactElement } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AbstractBackground } from '../components/ui';
import { getRoomInfo, getMe } from '../lib/signalingApi';
import './JoinRoomPage.css';

export default function JoinRoomPage(): ReactElement {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const roomIdFromUrl = searchParams.get('roomId');
  const initialDigits = roomIdFromUrl ? roomIdFromUrl.replace(/\D/g, '').slice(0, 6).split('') : [];
  const [otpValues, setOtpValues] = useState<string[]>(
    Array(6)
      .fill('')
      .map((_, i) => initialDigits[i] || '')
  );
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [userName, setUserName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<1 | 2>(roomIdFromUrl ? 2 : 1);

  const roomId = otpValues.join('');

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newValues = [...otpValues];
    newValues[index] = value.slice(-1);
    setOtpValues(newValues);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpValues[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'Enter' && roomId.length === 6) {
      handleNextStep();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newValues = Array(6)
      .fill('')
      .map((_, i) => pastedData[i] || '');
    setOtpValues(newValues);
    if (pastedData.length === 6) {
      inputRefs.current[5]?.focus();
    } else {
      inputRefs.current[pastedData.length]?.focus();
    }
  };

  const handleNextStep = () => {
    const cleanId = roomId.replace(/-/g, '');
    if (cleanId.length !== 6) {
      setError('Please enter a valid room code (XXX-XXX)');
      return;
    }
    setError('');
    setStep(2);
  };

  // Check if authenticated and redirect to create page
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      getMe(token)
        .then(() => navigate('/create'))
        .catch(() => localStorage.removeItem('authToken'));
    }
  }, [navigate]);

  // Hidden login shortcut (Ctrl+Shift+L)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        navigate('/create');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  const handleJoinRoom = async () => {
    if (!roomId.trim() || !userName.trim()) {
      setError('Please enter both Room ID and your name');
      return;
    }

    setIsJoining(true);
    setError('');

    try {
      const roomInfo = await getRoomInfo(roomId.trim());

      sessionStorage.setItem(
        'pendingRoom',
        JSON.stringify({
          roomId: roomId.trim(),
          roomName: roomInfo.name,
          userName: userName.trim(),
        })
      );

      navigate(`/prejoin/${roomId.trim()}`);
    } catch (err) {
      setError('Failed to join room. Please check the Room ID and try again.');
      console.error('Error joining room:', err);
      setIsJoining(false);
    }
  };

  return (
    <AbstractBackground>
      <div className="join-room-page">
        <div className="join-content">
          <div className="join-header">
            <h1 className="join-title">OKARIN</h1>
            <p className="join-subtitle">Join a recording session</p>
          </div>

          <div className="join-form">
            {step === 1 ? (
              <>
                <div className="otp-container" onPaste={handleOtpPaste}>
                  <div className="otp-group">
                    {[0, 1, 2].map((i) => (
                      <input
                        key={i}
                        ref={(el) => {
                          inputRefs.current[i] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={otpValues[i]}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        disabled={isJoining}
                        className="otp-input"
                        autoFocus={i === 0}
                      />
                    ))}
                  </div>
                  <span className="otp-separator">-</span>
                  <div className="otp-group">
                    {[3, 4, 5].map((i) => (
                      <input
                        key={i}
                        ref={(el) => {
                          inputRefs.current[i] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={otpValues[i]}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        disabled={isJoining}
                        className="otp-input"
                      />
                    ))}
                  </div>
                </div>

                {error && (
                  <div className="join-error">
                    <p>{error}</p>
                  </div>
                )}

                <button
                  onClick={handleNextStep}
                  disabled={isJoining}
                  className="glass-btn glass-btn-primary join-btn"
                >
                  Next
                </button>
              </>
            ) : (
              <>
                <input
                  id="userName"
                  type="text"
                  placeholder="Your name"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  disabled={isJoining}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                  autoFocus
                  className="name-input"
                />

                {error && (
                  <div className="join-error">
                    <p>{error}</p>
                  </div>
                )}

                <button
                  onClick={handleJoinRoom}
                  disabled={isJoining}
                  className="glass-btn glass-btn-primary join-btn"
                >
                  {isJoining ? 'Joining...' : 'Join'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </AbstractBackground>
  );
}
