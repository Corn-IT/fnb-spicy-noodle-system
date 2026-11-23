import * as React from 'react';

import { useStoreSettings } from '@/hooks/use-store-settings';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';

/**
 * Menu order for the signed-in account: the account's own order when set,
 * otherwise the store-level order from "Cài đặt Cửa hàng".
 */
export function useEffectiveNavOrder(): {
  navOrder: readonly string[];
  navGroupOrder: readonly string[];
} {
  const { settings } = useStoreSettings();
  const userNavOrder = useUiPreferencesStore((state) => state.userNavOrder);
  const userNavGroupOrder = useUiPreferencesStore((state) => state.userNavGroupOrder);

  return React.useMemo(
    () => ({
      navOrder: userNavOrder.length > 0 ? userNavOrder : settings.navOrder,
      navGroupOrder: userNavGroupOrder.length > 0 ? userNavGroupOrder : settings.navGroupOrder,
    }),
    [settings.navOrder, settings.navGroupOrder, userNavOrder, userNavGroupOrder],
  );
}
