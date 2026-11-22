import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

import { normalizeClientError } from '@/components/error-display/error-resolver';
import { toast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api-client';

let lastBackgroundErrorToastAt = 0;

function handleBackgroundQueryError(error: unknown, hasStaleData: boolean): void {
  // Only toast when data is already visible on screen (so we never wipe active POS work).
  // When data === undefined, the route's SystemErrorView handles initial load errors directly.
  if (!hasStaleData) return;

  // 403 is already toasted in apiClient, and 401 redirects to /login on session expiry.
  if (error instanceof ApiClientError && (error.statusCode === 403 || error.statusCode === 401)) {
    return;
  }

  const now = Date.now();
  if (now - lastBackgroundErrorToastAt < 4000) return;
  lastBackgroundErrorToastAt = now;

  const isGuest = typeof window !== 'undefined' && window.location.pathname.startsWith('/qr');
  const normalized = normalizeClientError(error, {
    audience: isGuest ? 'guest' : 'staff',
  });

  toast({
    variant: 'destructive',
    title: normalized.title,
    description: `${normalized.reason} Dữ liệu đang hiển thị trên màn hình vẫn được giữ nguyên.`,
  });
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      handleBackgroundQueryError(error, query.state.data !== undefined);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
      networkMode: 'always',
    },
    mutations: {
      // Allow LAN/local mutations to execute and fail fast with NETWORK_ERROR instead of stalling buttons disabled while navigator.onLine is false
      networkMode: 'always',
    },
  },
});

export interface QueryProviderProps {
  children: React.ReactNode;
  client?: QueryClient;
}

export function QueryProvider({ children, client = queryClient }: QueryProviderProps) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
