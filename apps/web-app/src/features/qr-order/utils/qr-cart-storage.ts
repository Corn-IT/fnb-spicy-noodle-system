import type { OrderItemModifierSelection, Product, PublicMenuActiveOrder, PublicMenuResponse } from '@fnb/shared';

export interface CartLineItem {
  key: string;
  productId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  modifiers: OrderItemModifierSelection[];
  modifierLabels: string[];
  itemNote?: string;
}

export interface ReconciledCartLineItem extends CartLineItem {
  effectiveName: string;
  effectiveUnitPrice: number;
  isUnavailable: boolean;
  priceChanged: boolean;
}

export interface StoredQrDraftCart {
  items: CartLineItem[];
  takeawayNote: string;
}

export interface TakeawayKitchenProgress {
  label: string;
  detail: string;
  badgeClassName: string;
}

export const DEFAULT_STATION_LABELS: Record<string, string> = {
  BEP_NAU: 'Bếp nấu',
  BEP_CHIEN: 'Bếp chiên',
  PHA_CHE: 'Pha chế',
  COMBO: 'Combo',
};

export const KITCHEN_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  NEW: {
    label: 'Chờ bếp nhận',
    className: 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  PRINTED: {
    label: 'Bếp đã nhận',
    className: 'border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  PREPARING: {
    label: 'Đang chế biến',
    className: 'border-orange-500/50 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  },
  DONE: {
    label: 'Hoàn tất',
    className: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  CANCELLED: {
    label: 'Đã huỷ',
    className: 'border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  },
};

const getDraftCartKey = (qrToken: string) => `fnb_qr_draft_cart_${qrToken}`;

/** Reads the persisted guest QR cart and note for a QR token from localStorage. */
export function readStoredDraftCart(qrToken: string): StoredQrDraftCart {
  if (!qrToken) return { items: [], takeawayNote: '' };
  try {
    const raw = localStorage.getItem(getDraftCartKey(qrToken));
    if (!raw) return { items: [], takeawayNote: '' };
    const parsed = JSON.parse(raw) as Partial<StoredQrDraftCart>;
    const items = Array.isArray(parsed.items)
      ? parsed.items.filter(
          (item): item is CartLineItem =>
            Boolean(item) &&
            typeof item.key === 'string' &&
            typeof item.productId === 'number' &&
            typeof item.name === 'string' &&
            typeof item.quantity === 'number' &&
            item.quantity > 0 &&
            typeof item.unitPrice === 'number' &&
            Array.isArray(item.modifiers) &&
            Array.isArray(item.modifierLabels),
        )
      : [];
    const takeawayNote = typeof parsed.takeawayNote === 'string' ? parsed.takeawayNote : '';
    return { items, takeawayNote };
  } catch {
    return { items: [], takeawayNote: '' };
  }
}

/** Persists the current guest QR cart and note to localStorage, clearing empty drafts. */
export function writeStoredDraftCart(qrToken: string, draft: StoredQrDraftCart): void {
  if (!qrToken) return;
  const key = getDraftCartKey(qrToken);
  try {
    if (draft.items.length === 0 && !draft.takeawayNote.trim()) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(draft));
    }
  } catch {
    // Ignore storage quota errors
  }
}

/** Reconciles cached cart items against live menu product prices and modifier availability. */
export function reconcileCartItems(
  cart: CartLineItem[],
  menuData: PublicMenuResponse | undefined,
  productById: Map<number, Product>,
): ReconciledCartLineItem[] {
  const hasMenuProducts = menuData !== undefined;
  return cart.map((item) => {
    const product = productById.get(item.productId);
    if (!hasMenuProducts) {
      return {
        ...item,
        effectiveName: item.name,
        effectiveUnitPrice: item.unitPrice,
        isUnavailable: false,
        priceChanged: false,
      };
    }
    if (!product || !product.isAvailable) {
      return {
        ...item,
        effectiveName: item.name,
        effectiveUnitPrice: item.unitPrice,
        isUnavailable: true,
        priceChanged: false,
      };
    }
    const modById = new Map<number, { extraPrice: number; isAvailable?: boolean }>();
    for (const grp of product.modifierGroups) {
      for (const m of grp.modifiers) {
        modById.set(m.id, { extraPrice: m.extraPrice, isAvailable: m.isAvailable });
      }
    }
    let modExtra = 0;
    let isModifierUnavailable = false;
    for (const sel of item.modifiers) {
      if (sel.action === 'REMOVED_DEFAULT') continue;
      const targetModId =
        sel.action === 'SUBSTITUTED' && sel.substituteModifierId
          ? sel.substituteModifierId
          : sel.modifierId;
      const foundMod = modById.get(targetModId);
      if (!foundMod || foundMod.isAvailable === false) {
        isModifierUnavailable = true;
      } else {
        modExtra += foundMod.extraPrice;
      }
    }
    const latestUnitPrice = product.price + modExtra;
    return {
      ...item,
      effectiveName: product.name,
      effectiveUnitPrice: latestUnitPrice,
      isUnavailable: isModifierUnavailable,
      priceChanged: !isModifierUnavailable && latestUnitPrice !== item.unitPrice,
    };
  });
}

/** Computes takeaway order status copy and badge styling from kitchen item counts. */
export function buildTakeawayKitchenProgress(
  activeOrder: PublicMenuActiveOrder | null,
  placedTotalQty: number,
  kitchenCounts: { receivedQty: number; waitingQty: number },
): TakeawayKitchenProgress | null {
  if (!activeOrder) return null;
  const { receivedQty, waitingQty } = kitchenCounts;
  if (activeOrder.status === 'PENDING') {
    return {
      label: 'Chờ quầy xác nhận',
      detail: `Đang chờ thu ngân xác nhận đơn (${placedTotalQty} món)`,
      badgeClassName: 'border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-200',
    };
  }
  if (receivedQty === 0) {
    return {
      label: 'Quầy đã xác nhận • Chờ tách bếp',
      detail: `Thu ngân đã duyệt đơn — Đang chờ chuyển xuống bếp (${placedTotalQty} món)`,
      badgeClassName: 'border-sky-500/50 bg-sky-500/15 text-sky-800 dark:text-sky-200',
    };
  }
  if (waitingQty > 0) {
    return {
      label: `Bếp đã nhận ${receivedQty}/${placedTotalQty} món`,
      detail: `Còn ${waitingQty} món gọi thêm đang chờ quầy chuyển xuống bếp`,
      badgeClassName: 'border-sky-500/50 bg-sky-500/15 text-sky-800 dark:text-sky-200',
    };
  }
  return {
    label: `Bếp đang chế biến (${receivedQty}/${placedTotalQty} món)`,
    detail: 'Tất cả các món đã được chuyển xuống bếp chế biến',
    badgeClassName: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
  };
}
