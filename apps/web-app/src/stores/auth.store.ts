import { type SessionRevokeReason, type UserPermissions } from '@fnb/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const AUTH_STORAGE_KEY = 'fnb-auth' as const;

export interface AuthenticatedUser {
  id: number;
  employeeId: number;
  username: string;
  fullName?: string;
  avatarUrl?: string | null;
  isSuperAdmin: boolean;
  permissions: UserPermissions;
}

export type AuthNoticeReason =
  | 'SESSION_EXPIRED'
  | 'SESSION_REPLACED'
  | 'SESSION_REVOKED'
  | 'UNAUTHENTICATED';

export interface AuthNoticeMeta {
  reason?: SessionRevokeReason;
  at?: string | null;
}

interface AuthState {
  sessionRevision: number;
  accessToken: string | null;
  user: AuthenticatedUser | null;
  authNotice: AuthNoticeReason | null;
  authNoticeMeta: AuthNoticeMeta | null;
  setAuth: (payload: { accessToken: string; user: AuthenticatedUser }) => void;
  setAccessToken: (accessToken: string) => void;
  updateUser: (partial: Partial<AuthenticatedUser>) => void;
  clearAuth: (reason?: AuthNoticeReason | null, meta?: AuthNoticeMeta | null) => void;
  clearAuthNotice: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      sessionRevision: 0,
      accessToken: null,
      user: null,
      authNotice: null,
      authNoticeMeta: null,
      setAuth: ({ accessToken, user }) =>
        set((state) => ({ accessToken, user, authNotice: null, authNoticeMeta: null, sessionRevision: state.sessionRevision + 1 })),
      setAccessToken: (accessToken) => set({ accessToken }),
      updateUser: (partial) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...partial } : null,
        })),
      clearAuth: (reason = null, meta = null) =>
        set((state) => ({ accessToken: null, user: null, authNotice: reason, authNoticeMeta: meta, sessionRevision: state.sessionRevision + 1 })),
      clearAuthNotice: () => set({ authNotice: null, authNoticeMeta: null }),
    }),
    {
      name: AUTH_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
      }),
    },
  ),
);
