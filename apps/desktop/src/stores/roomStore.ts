import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { createStorageAdapter } from '../lib/tauriStorage';

export interface Participant {
  id: string;
  name: string;
  isHost: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  isVideoOn: boolean;
  stream?: MediaStream;
}

export interface MediaSettings {
  videoEnabled: boolean;
  audioEnabled: boolean;
  selectedVideoDevice: string;
  selectedAudioDevice: string;
}

export interface RoomState {
  roomId: string | null;
  roomName: string | null;
  userName: string | null;
  isHost: boolean;
  participants: Participant[];
  mediaSettings: MediaSettings | null;
  localStream: MediaStream | null;
  createdAt: string | null;
  joinedAt: string | null;
}

export interface RoomActions {
  setRoom: (roomInfo: {
    roomId: string;
    roomName: string;
    userName: string;
    isHost: boolean;
    mediaSettings?: MediaSettings;
    createdAt?: string;
    joinedAt?: string;
  }) => void;
  leaveRoom: () => void;
  addParticipant: (participant: Participant) => void;
  removeParticipant: (participantId: string) => void;
  updateParticipant: (participantId: string, updates: Partial<Participant>) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setMediaSettings: (settings: MediaSettings) => void;
  updateParticipantSpeaking: (participantId: string, isSpeaking: boolean) => void;
  updateParticipantMuted: (participantId: string, isMuted: boolean) => void;
  updateParticipantVideo: (participantId: string, isVideoOn: boolean) => void;
}

export type RoomStore = RoomState & RoomActions;

const initialState: RoomState = {
  roomId: null,
  roomName: null,
  userName: null,
  isHost: false,
  participants: [],
  mediaSettings: null,
  localStream: null,
  createdAt: null,
  joinedAt: null,
};

export const useRoomStore = create<RoomStore>()(
  devtools(
    persist(
      (set) => ({
        ...initialState,

        setRoom: (roomInfo) =>
          set(
            (state) => ({
              roomId: roomInfo.roomId,
              roomName: roomInfo.roomName,
              userName: roomInfo.userName,
              isHost: roomInfo.isHost,
              mediaSettings: roomInfo.mediaSettings || state.mediaSettings,
              createdAt: roomInfo.createdAt || null,
              joinedAt: roomInfo.joinedAt || null,
              participants: [
                {
                  id: 'self',
                  name: roomInfo.userName,
                  isHost: roomInfo.isHost,
                  isSpeaking: false,
                  isMuted: !roomInfo.mediaSettings?.audioEnabled,
                  isVideoOn: roomInfo.mediaSettings?.videoEnabled || false,
                },
              ],
            }),
            false,
            'setRoom'
          ),

        leaveRoom: () =>
          set(
            (state) => {
              if (state.localStream) {
                state.localStream.getTracks().forEach((track) => track.stop());
              }
              return initialState;
            },
            false,
            'leaveRoom'
          ),

        addParticipant: (participant) =>
          set(
            (state) => ({
              participants: [...state.participants, participant],
            }),
            false,
            'addParticipant'
          ),

        removeParticipant: (participantId) =>
          set(
            (state) => ({
              participants: state.participants.filter((p) => p.id !== participantId),
            }),
            false,
            'removeParticipant'
          ),

        updateParticipant: (participantId, updates) =>
          set(
            (state) => ({
              participants: state.participants.map((p) =>
                p.id === participantId ? { ...p, ...updates } : p
              ),
            }),
            false,
            'updateParticipant'
          ),

        setLocalStream: (stream) =>
          set(
            (state) => {
              if (state.localStream && state.localStream !== stream) {
                state.localStream.getTracks().forEach((track) => track.stop());
              }
              return { localStream: stream };
            },
            false,
            'setLocalStream'
          ),

        setMediaSettings: (settings) => set({ mediaSettings: settings }, false, 'setMediaSettings'),

        updateParticipantSpeaking: (participantId, isSpeaking) =>
          set(
            (state) => ({
              participants: state.participants.map((p) =>
                p.id === participantId ? { ...p, isSpeaking } : p
              ),
            }),
            false,
            'updateParticipantSpeaking'
          ),

        updateParticipantMuted: (participantId, isMuted) =>
          set(
            (state) => ({
              participants: state.participants.map((p) =>
                p.id === participantId ? { ...p, isMuted } : p
              ),
            }),
            false,
            'updateParticipantMuted'
          ),

        updateParticipantVideo: (participantId, isVideoOn) =>
          set(
            (state) => ({
              participants: state.participants.map((p) =>
                p.id === participantId ? { ...p, isVideoOn } : p
              ),
            }),
            false,
            'updateParticipantVideo'
          ),
      }),
      {
        name: 'room-storage',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        storage: createStorageAdapter('room.json') as any, // Type incompatibility between StateStorage and PersistStorage
        partialize: (state) => ({
          roomId: state.roomId,
          roomName: state.roomName,
          userName: state.userName,
          isHost: state.isHost,
          mediaSettings: state.mediaSettings,
          createdAt: state.createdAt,
          joinedAt: state.joinedAt,
        }),
      }
    ),
    { name: 'RoomStore' }
  )
);
