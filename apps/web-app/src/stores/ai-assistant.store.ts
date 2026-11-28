import type {
  AiChatTurn,
  AiEngineRoute,
  AiQuotaStatus,
} from '@fnb/shared';
import { create } from 'zustand';

function generateClientSessionId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `web-${Date.now().toString(36)}-${rand}`;
}

export interface AiAssistantUiState {
  isOpen: boolean;
  isExpanded: boolean;
  clientSessionId: string;
  turns: AiChatTurn[];
  quotaStatus: AiQuotaStatus | null;
  lastRoute: AiEngineRoute | null;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  setOpen: (open: boolean) => void;
  setExpanded: (expanded: boolean) => void;
  appendExchange: (payload: {
    userTurn: AiChatTurn;
    assistantTurn: AiChatTurn;
    quotaStatus?: AiQuotaStatus;
  }) => void;
  setQuotaStatus: (quotaStatus: AiQuotaStatus | null) => void;
  clearConversation: () => void;
  reset: () => void;
}

const MAX_RENDERED_TURNS = 24;

export const useAiAssistantStore = create<AiAssistantUiState>((set) => ({
  isOpen: false,
  isExpanded: false,
  clientSessionId: generateClientSessionId(),
  turns: [],
  quotaStatus: null,
  lastRoute: null,

  openDrawer: () => set({ isOpen: true }),
  closeDrawer: () => set({ isOpen: false }),
  toggleDrawer: () => set((state) => ({ isOpen: !state.isOpen })),
  setOpen: (open) => set({ isOpen: open }),
  setExpanded: (expanded) => set({ isExpanded: expanded }),

  appendExchange: ({ userTurn, assistantTurn, quotaStatus }) =>
    set((state) => ({
      turns: [...state.turns, userTurn, assistantTurn].slice(-MAX_RENDERED_TURNS),
      quotaStatus: quotaStatus ?? state.quotaStatus,
      lastRoute: assistantTurn.route ?? state.lastRoute,
    })),

  setQuotaStatus: (quotaStatus) => set({ quotaStatus }),

  clearConversation: () =>
    set({
      turns: [],
      clientSessionId: generateClientSessionId(),
      lastRoute: null,
    }),

  reset: () =>
    set({
      isOpen: false,
      isExpanded: false,
      clientSessionId: generateClientSessionId(),
      turns: [],
      quotaStatus: null,
      lastRoute: null,
    }),
}));
