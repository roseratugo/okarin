import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ReactNode, ReactElement } from 'react';

interface ProtectedRouteProps {
  children?: ReactNode;
  requireRoom?: boolean;
  requireHost?: boolean;
  redirectTo?: string;
}

export default function ProtectedRoute({
  children,
  requireRoom = false,
  requireHost = false,
  redirectTo = '/',
}: ProtectedRouteProps): ReactElement {
  const location = useLocation();

  const roomInfo = sessionStorage.getItem('currentRoom');
  const hasRoom = roomInfo !== null;
  const parsedRoom = roomInfo ? JSON.parse(roomInfo) : null;
  const isHost = parsedRoom?.isHost || false;

  if (requireRoom && !hasRoom) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  if (requireHost && !isHost) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  return <>{children || <Outlet />}</>;
}
