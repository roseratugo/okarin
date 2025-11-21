import { Routes, Route } from 'react-router-dom';
import { useEffect, ReactElement } from 'react';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import UpdateChecker from './components/UpdateChecker';
import CreateRoomPage from './pages/CreateRoomPage';
import JoinRoomPage from './pages/JoinRoomPage';
import PreJoinPage from './pages/PreJoinPage';
import RecordingPage from './pages/RecordingPage';
import NotFoundPage from './pages/NotFoundPage';
import TestPreJoin from './pages/TestPreJoin';
import MediaTest from './pages/MediaTest';
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
    <ErrorBoundary>
      <UpdateChecker />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<JoinRoomPage />} />
          <Route path="/create" element={<CreateRoomPage />} />
          <Route path="/prejoin/:roomId" element={<PreJoinPage />} />

          <Route
            path="/recording/:roomId"
            element={
              <ProtectedRoute requireRoom={true} redirectTo="/">
                <RecordingPage />
              </ProtectedRoute>
            }
          />

          {process.env.NODE_ENV === 'development' && (
            <>
              <Route path="/test-prejoin" element={<TestPreJoin />} />
              <Route path="/test-media" element={<MediaTest />} />
            </>
          )}

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
