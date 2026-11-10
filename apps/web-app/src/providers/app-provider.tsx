import { type QueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { ThermalPrintProvider } from '@/components/print-slips';
import { Toaster } from '@/components/ui/toast';
import { QueryProvider } from '@/providers/query-provider';
import { SocketProvider } from '@/providers/socket-provider';
import { ThemeProvider } from '@/providers/theme-provider';

export interface AppProviderProps {
  children: React.ReactNode;
  queryClient?: QueryClient;
}

export function AppProvider({ children, queryClient }: AppProviderProps) {
  return (
    <QueryProvider client={queryClient}>
      <ThemeProvider>
        <SocketProvider>
          <ThermalPrintProvider>
            {children}
            <Toaster />
          </ThermalPrintProvider>
        </SocketProvider>
      </ThemeProvider>
    </QueryProvider>
  );
}
