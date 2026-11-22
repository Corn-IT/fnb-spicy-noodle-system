import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { ThermalPrintProvider } from '@/components/print-slips';
import { Toaster } from '@/components/ui/toast';
import { bootstrapAuthSession } from '@/lib/api-client';
import { QueryProvider } from '@/providers/query-provider';
import { SocketProvider } from '@/providers/socket-provider';
import { StoreSettingsProvider } from '@/providers/store-settings-provider';
import { ThemeProvider } from '@/providers/theme-provider';
import { AUTH_STORAGE_KEY, type AuthenticatedUser, useAuthStore } from '@/stores/auth.store';

function SameBrowserAuthSync() {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    void bootstrapAuthSession();

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== AUTH_STORAGE_KEY) {
        return;
      }

      if (!event.newValue) {
        queryClient.clear();
        useAuthStore.getState().clearAuth();
        return;
      }

      try {
        const parsed = JSON.parse(event.newValue) as {
          state?: { user?: AuthenticatedUser | null };
        };
        const nextUser = parsed?.state?.user ?? null;
        const currentState = useAuthStore.getState();

        if (!nextUser) {
          if (currentState.user || currentState.accessToken) {
            queryClient.clear();
            currentState.clearAuth();
          }
          return;
        }

        if (currentState.user?.id !== nextUser.id) {
          queryClient.clear();
          useAuthStore.setState({
            accessToken: null,
            user: nextUser,
            authNotice: null,
            authNoticeMeta: null,
          });
          void bootstrapAuthSession();
        }
      } catch {
        // Ignore malformed cross-tab storage payloads
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [queryClient]);

  return null;
}

export interface AppProviderProps {
  children: React.ReactNode;
  queryClient?: QueryClient;
}

export function AppProvider({ children, queryClient }: AppProviderProps) {
  return (
    <QueryProvider client={queryClient}>
      <SameBrowserAuthSync />
      <StoreSettingsProvider>
        <ThemeProvider>
          <SocketProvider>
            <ThermalPrintProvider>
              {children}
              <Toaster />
            </ThermalPrintProvider>
          </SocketProvider>
        </ThemeProvider>
      </StoreSettingsProvider>
    </QueryProvider>
  );
}
