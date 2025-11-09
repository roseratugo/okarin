import { Routes, Route } from 'react-router-dom';
import { useEffect, ReactElement } from 'react';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import HomePage from './pages/HomePage';
import RoomPage from './pages/RoomPage';
import CreateRoomPage from './pages/CreateRoomPage';
import JoinRoomPage from './pages/JoinRoomPage';
import RecordingPage from './pages/RecordingPage';
import SettingsPage from './pages/SettingsPage';
import NotFoundPage from './pages/NotFoundPage';
import TestPreJoin from './pages/TestPreJoin';
import MediaTest from './pages/MediaTest';
import TestPeerManager from './pages/TestPeerManager';
import { useSettingsStore } from './stores';

function App(): ReactElement {
  const theme = useSettingsStore((state) => state.theme);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', prefersDark);
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }
  }, [theme]);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />

        <Route path="/room" element={<RoomPage />}>
          <Route path="create" element={<CreateRoomPage />} />
          <Route path="join" element={<JoinRoomPage />} />
        </Route>

        <Route
          path="/recording/:roomId"
          element={
            <ProtectedRoute requireRoom={true} redirectTo="/room/join">
              <RecordingPage />
            </ProtectedRoute>
          }
        />

        <Route path="/settings" element={<SettingsPage />} />

        {process.env.NODE_ENV === 'development' && (
          <>
            <Route path="/test-prejoin" element={<TestPreJoin />} />
            <Route path="/test-media" element={<MediaTest />} />
            <Route path="/test-peer-manager" element={<TestPeerManager />} />
          </>
        )}

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default App;
