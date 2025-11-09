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

function App(): ReactElement {
  useEffect(() => {
    const savedSettings = localStorage.getItem('appSettings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      if (settings.theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else if (settings.theme === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.toggle('dark', prefersDark);
      }
    }
  }, []);

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
          </>
        )}

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default App;
