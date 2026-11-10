import { type UserPermissions } from '@fnb/shared';
import { create } from 'zustand';

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

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  setAuth: ({ accessToken, user }) => set({ accessToken, user }),
  setAccessToken: (accessToken) => set({ accessToken }),
  updateUser: (partial) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...partial } : null,
    })),
  clearAuth: () => set({ accessToken: null, user: null }),
}));
