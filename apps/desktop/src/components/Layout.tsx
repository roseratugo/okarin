import { type ReactElement } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navigation from './Navigation';
import './Layout.css';

export default function Layout(): ReactElement {
  const location = useLocation();
  const isRecordingPage = location.pathname.startsWith('/recording/');

  return (
    <div className="layout">
      {!isRecordingPage && <Navigation />}
      <main className={isRecordingPage ? 'layout-main no-nav' : 'layout-main'}>
        <Outlet />
      </main>
    </div>
  );
}
