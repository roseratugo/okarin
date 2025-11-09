import { type ReactElement } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import './RoomPage.css';

export default function RoomPage(): ReactElement {
  const location = useLocation();

  // Redirect /room to /room/create by default
  if (location.pathname === '/room' || location.pathname === '/room/') {
    return <Navigate to="/room/create" replace />;
  }

  return (
    <div className="room-page">
      <Outlet />
    </div>
  );
}
