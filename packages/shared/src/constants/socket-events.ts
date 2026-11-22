export const SocketNamespace = '/pos' as const;

export const SocketEvents = {
  ORDER_QR_NEW: 'order:qr_new',
  ORDER_QR_ADDON: 'order:qr_addon',
  ORDER_QR_AUTO_CANCELLED: 'order:qr_auto_cancelled',
  ORDER_SESSION_REDIRECTED: 'order:session_redirected',
  ORDER_STATUS_UPDATED: 'order:status_updated',
  QR_ORDER_NOTICE: 'qr:order_notice',
  TABLE_QR_ROTATED: 'table:qr_rotated',
  TABLE_GRID_SYNC: 'table:grid_sync',
  MENU_UPDATED: 'menu:updated',
  SCHEDULE_UPDATED: 'schedule:updated',
  PAYROLL_UPDATED: 'payroll:updated',
  STORE_SETTINGS_UPDATED: 'store-settings:updated',
  SESSION_REVOKED: 'session:revoked',
  PERMISSIONS_UPDATED: 'account:permissions_updated',
} as const;

export const SocketRooms = {
  POS_CASHIER: 'pos_cashier_room',
  PUBLIC_MENU: 'public_menu_room',
  tableSession: (tableId: number | string) => `table_session_${tableId}`,
  orderSession: (orderId: number | string) => `order_session_${orderId}`,
  userAccount: (userId: number | string) => `user_account_${userId}`,
  userSession: (sessionId: string) => `user_session_${sessionId}`,
} as const;

export type SocketEvent = (typeof SocketEvents)[keyof typeof SocketEvents];
