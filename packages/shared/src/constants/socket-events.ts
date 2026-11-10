export const SocketNamespace = '/pos' as const;

export const SocketEvents = {
  ORDER_QR_NEW: 'order:qr_new',
  ORDER_QR_ADDON: 'order:qr_addon',
  ORDER_SESSION_REDIRECTED: 'order:session_redirected',
  ORDER_STATUS_UPDATED: 'order:status_updated',
  TABLE_GRID_SYNC: 'table:grid_sync',
} as const;

export const SocketRooms = {
  POS_CASHIER: 'pos_cashier_room',
  orderSession: (orderId: number | string) => `order_session_${orderId}`,
} as const;

export type SocketEvent = (typeof SocketEvents)[keyof typeof SocketEvents];
