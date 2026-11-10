import { type ColumnSizingState } from '@tanstack/react-table';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import {
  flattenColumnWidths,
  useUiPreferencesStore,
} from '@/stores/ui-preferences.store';

export function useColumnResizeSync(
  tableId: string,
  columnSizing: ColumnSizingState,
  isResizingColumn: string | false,
): void {
  const hasInteractedRef = React.useRef(false);

  React.useEffect(() => {
    if (isResizingColumn) {
      hasInteractedRef.current = true;
      return;
    }

    if (!hasInteractedRef.current || Object.keys(columnSizing).length === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      const store = useUiPreferencesStore.getState();
      store.setTableColumnWidths(tableId, columnSizing);

      const nextWidths = flattenColumnWidths({
        ...store.columnWidths,
        [tableId]: {
          ...(store.columnWidths[tableId] ?? {}),
          ...columnSizing,
        },
      });

      if (useAuthStore.getState().accessToken) {
        void apiClient
          .patch('/api/v1/profile/ui-prefs', {
            columnWidths: nextWidths,
          })
          .catch(() => {});
      }
    }, 500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [tableId, columnSizing, isResizingColumn]);
}
