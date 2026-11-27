import { beforeEach, describe, expect, it } from 'vitest';

import { useUiPreferencesStore } from '@/stores/ui-preferences.store';

describe('per-account preferences', () => {
  beforeEach(() => {
    useUiPreferencesStore.setState({
      userDisplayScale: { perPath: {} },
      userNavOrder: [],
      userNavGroupOrder: [],
    });
  });

  it('applies server values on login', () => {
    useUiPreferencesStore.getState().hydrateFromServer({
      displayScale: { globalPercent: 120, perPath: { '/pos': 110 } },
      navOrder: ['/pos'],
      navGroupOrder: ['sales'],
    });
    const state = useUiPreferencesStore.getState();
    expect(state.userDisplayScale).toEqual({ globalPercent: 120, perPath: { '/pos': 110 } });
    expect(state.userNavOrder).toEqual(['/pos']);
    expect(state.userNavGroupOrder).toEqual(['sales']);
  });

  it('does not leak a previous account overrides when the next account has none', () => {
    const store = useUiPreferencesStore.getState();
    store.setUserDisplayScale({ globalPercent: 140, perPath: { '/pos': 130 } });
    store.setUserNavOrder(['/pos', '/dashboard']);
    store.setUserNavGroupOrder(['sales']);

    useUiPreferencesStore.getState().hydrateFromServer({ theme: 'light' });

    const state = useUiPreferencesStore.getState();
    expect(state.userDisplayScale).toEqual({ perPath: {} });
    expect(state.userNavOrder).toEqual([]);
    expect(state.userNavGroupOrder).toEqual([]);
  });


});

describe('per-account sidebar and voice preferences', () => {
  it('applies the collapsed state and voice choice from the server and resets them when absent', () => {
    useUiPreferencesStore.getState().hydrateFromServer({ sidebarCollapsed: true, voiceAlertEnabled: false });
    expect(useUiPreferencesStore.getState().sidebarCollapsed).toBe(true);
    expect(useUiPreferencesStore.getState().userVoiceAlertEnabled).toBe(false);

    useUiPreferencesStore.getState().hydrateFromServer({});
    expect(useUiPreferencesStore.getState().sidebarCollapsed).toBe(false);
    expect(useUiPreferencesStore.getState().userVoiceAlertEnabled).toBeUndefined();
  });
});

describe('syncing account preferences on session restore', () => {
  beforeEach(() => {
    useUiPreferencesStore.setState({ accountSyncPending: false });
    localStorage.clear();
  });

  it('keeps unsent local changes when a refresh response arrives, but login always overrides', () => {
    const store = useUiPreferencesStore.getState();
    store.setUserNavOrder(['/pos']);
    store.setAccountSyncPending(true);

    useUiPreferencesStore.getState().hydrateFromServer({ navOrder: ['/menu'] });
    expect(useUiPreferencesStore.getState().userNavOrder).toEqual(['/pos']);

    useUiPreferencesStore.getState().hydrateFromServer({ navOrder: ['/menu'] }, { force: true });
    expect(useUiPreferencesStore.getState().userNavOrder).toEqual(['/menu']);
  });

  it('applies server values after a refresh when nothing is pending', () => {
    useUiPreferencesStore.getState().hydrateFromServer({ sidebarCollapsed: true, navGroupOrder: ['hr'] });
    expect(useUiPreferencesStore.getState().sidebarCollapsed).toBe(true);
    expect(useUiPreferencesStore.getState().userNavGroupOrder).toEqual(['hr']);
  });

  it('copies the account voice choice to the device switch and defaults to enabled', () => {
    useUiPreferencesStore.getState().hydrateFromServer({ voiceAlertEnabled: false });
    expect(localStorage.getItem('fnb-pos-voice-alert')).toBe('false');
    useUiPreferencesStore.getState().hydrateFromServer({});
    expect(localStorage.getItem('fnb-pos-voice-alert')).toBe('true');
  });

  it('drops the previous account explicit theme when the next account never chose one', () => {
    useUiPreferencesStore.getState().setTheme('dark');
    expect(useUiPreferencesStore.getState().hasExplicitTheme).toBe(true);

    useUiPreferencesStore.getState().hydrateFromServer({ theme: 'system' });
    expect(useUiPreferencesStore.getState().hasExplicitTheme).toBe(false);

    useUiPreferencesStore.getState().hydrateFromServer({ theme: 'dark' });
    expect(useUiPreferencesStore.getState().hasExplicitTheme).toBe(true);
    expect(useUiPreferencesStore.getState().theme).toBe('dark');
  });
});
