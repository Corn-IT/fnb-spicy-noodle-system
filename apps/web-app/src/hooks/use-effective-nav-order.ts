import { useStoreSettings } from '@/hooks/use-store-settings';

/** Store menu order applies to every account; route visibility is still filtered by RBAC. */
export function useEffectiveNavOrder(): {
  navOrder: readonly string[];
  navGroupOrder: readonly string[];
} {
  const { settings } = useStoreSettings();
  return { navOrder: settings.navOrder, navGroupOrder: settings.navGroupOrder };
}
