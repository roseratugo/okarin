/**
 * API client for signaling server
 */

const SIGNALING_SERVER_URL = import.meta.env.VITE_SIGNALING_SERVER_URL || 'http://localhost:3000';

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

/**
 * Create a new room
 */
export async function createRoom(roomName: string, createdBy: string): Promise<CreateRoomResponse> {
  const response = await fetch(`${SIGNALING_SERVER_URL}/api/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: roomName,
      created_by: createdBy,
      max_participants: 4,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to create room: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Join an existing room
 */
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

/**
 * Get room information
 */
export async function getRoomInfo(roomId: string): Promise<RoomInfo> {
  const response = await fetch(`${SIGNALING_SERVER_URL}/api/rooms/${roomId}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get room info: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Leave a room
 */
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
