import * as React from 'react';
import { RouterProvider } from 'react-router-dom';

import { AppProvider } from '@/providers/app-provider';
import { createAppRouter } from '@/router';

export function App() {
  const router = React.useMemo(() => createAppRouter(), []);

  return (
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  );
}

export default App;
