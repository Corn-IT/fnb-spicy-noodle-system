import type { OrderItemModifierSelection } from '@fnb/shared';

export interface PosMenuSelectedItem {
  productId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  modifiers: OrderItemModifierSelection[];
  modifierLabels: string[];
  itemNote?: string;
}
