const SIGNALING_SERVER_URL = import.meta.env.VITE_SIGNALING_SERVER_URL || 'http://localhost:3000';
const AUTH_SERVER_URL = import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:3001';

export interface CreateRoomResponse {
  room_id: string;
  created_at: string;
}

export interface JoinRoomResponse {
  token: string;
  participant_id: string;
  ice_servers: { urls: string[]; username?: string; credential?: string }[];
}

export interface RoomInfo {
  id: string;
  name: string;
  host_id: string;
  participant_count: number;
  created_at: string;
  ttl_seconds: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${AUTH_SERVER_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Login failed: ${response.statusText}`);
  }

  return response.json();
}

export async function getMe(authToken: string): Promise<{ user: AuthUser }> {
  const response = await fetch(`${AUTH_SERVER_URL}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get user: ${response.statusText}`);
  }

  return response.json();
}

export async function createRoom(roomName: string, authToken: string): Promise<CreateRoomResponse> {
  const response = await fetch(`${SIGNALING_SERVER_URL}/api/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      name: roomName,
      max_participants: 4,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to create room: ${response.statusText}`);
  }

  return response.json();
}

export async function joinRoom(roomId: string, participantName: string): Promise<JoinRoomResponse> {
  const response = await fetch(`${SIGNALING_SERVER_URL}/api/rooms/${roomId}/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      participant_name: participantName,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to join room: ${response.statusText}`);
  }

  return response.json();
}

export async function getRoomInfo(roomId: string): Promise<RoomInfo> {
  const response = await fetch(`${SIGNALING_SERVER_URL}/api/rooms/${roomId}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get room info: ${response.statusText}`);
  }

  return response.json();
}

export async function leaveRoom(roomId: string, token: string): Promise<void> {
  const response = await fetch(`${SIGNALING_SERVER_URL}/api/rooms/${roomId}/leave`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to leave room: ${response.statusText}`);
  }
}
