import * as React from 'react';
import { RouterProvider } from 'react-router-dom';

import { AppErrorBoundary } from '@/components/error-display';
import { AppProvider } from '@/providers/app-provider';
import { createAppRouter } from '@/router';

export function App() {
  const router = React.useMemo(() => createAppRouter(), []);

  return (
    <AppErrorBoundary>
      <AppProvider>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
      </AppProvider>
    </AppErrorBoundary>
  );
}

export default App;
