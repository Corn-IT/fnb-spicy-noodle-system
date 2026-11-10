import { type UserPermissions } from '@fnb/shared';
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

interface AuthState {
  accessToken: string | null;
  user: AuthenticatedUser | null;
  setAuth: (payload: { accessToken: string; user: AuthenticatedUser }) => void;
  setAccessToken: (accessToken: string) => void;
  updateUser: (partial: Partial<AuthenticatedUser>) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      setAuth: ({ accessToken, user }) => set({ accessToken, user }),
      setAccessToken: (accessToken) => set({ accessToken }),
      updateUser: (partial) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...partial } : null,
        })),
      clearAuth: () => set({ accessToken: null, user: null }),
    }),
    {
      name: AUTH_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
      }),
    },
  ),
);
