import type { Product } from '@fnb/shared';
import type { ProductOptionsDialogInitialValue } from '../components/product-options-dialog';

/**
 * Sự kiện điều hướng mà mỗi giao diện POS (chuột / cảm ứng) tự quyết định cách hiển thị:
 * - `draft-started`: vừa chọn bàn trống hoặc bắt đầu đơn mang về mới → cần mở thực đơn.
 * - `order-opened`: vừa chọn bàn / đơn mang về đang có hoá đơn.
 * - `draft-submitted`: vừa tạo đơn từ giỏ nháp thành công (đơn mới đã được chọn).
 */
export type PosWorkspaceViewEvent =
  | 'draft-started'
  | 'draft-target-picker'
  | 'draft-parked'
  | 'draft-discarded'
  | 'order-opened'
  | 'draft-submitted';

export interface UsePosWorkspaceOptions {
  onViewChange?: (event: PosWorkspaceViewEvent) => void;
}

export interface PosEditingItemTarget {
  kind: 'draft' | 'order';
  product: Product;
  draftIndex?: number;
  orderItemId?: number;
  editInstanceKey: string;
  initialValue: ProductOptionsDialogInitialValue;
}

export type NotifyErrFn = (key: string, err: unknown) => void;
