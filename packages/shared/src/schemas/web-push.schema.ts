import { z } from 'zod';

export const WEB_PUSH_VAPID_NORMALIZED_NAME = 'web_push_vapid_keys' as const;

export const WebPushNotificationKind = {
  QR_NEW: 'QR_NEW',
  QR_ADDON: 'QR_ADDON',
  QR_OVERDUE_REMINDER: 'QR_OVERDUE_REMINDER',
  TEST_PING: 'TEST_PING',
} as const;
export type WebPushNotificationKind =
  (typeof WebPushNotificationKind)[keyof typeof WebPushNotificationKind];
export const WebPushNotificationKindSchema = z.enum([
  'QR_NEW',
  'QR_ADDON',
  'QR_OVERDUE_REMINDER',
  'TEST_PING',
]);

export const WebPushSubscriptionKeysSchema = z.object({
  p256dh: z.string().trim().min(16, 'Khoá p256dh không hợp lệ').max(512),
  auth: z.string().trim().min(8, 'Khoá auth không hợp lệ').max(256),
});
export type WebPushSubscriptionKeys = z.infer<typeof WebPushSubscriptionKeysSchema>;

export const RegisterWebPushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .trim()
    .url('Push endpoint không hợp lệ')
    .max(2048)
    .refine((value) => value.startsWith('https://'), {
      message: 'Push endpoint bắt buộc sử dụng HTTPS',
    }),
  keys: WebPushSubscriptionKeysSchema,
  userAgent: z.string().trim().max(512).optional(),
  deviceLabel: z.string().trim().max(128).optional(),
});
export type RegisterWebPushSubscriptionInput = z.infer<typeof RegisterWebPushSubscriptionSchema>;

export const UnregisterWebPushSubscriptionSchema = z.object({
  endpoint: z.string().trim().url('Push endpoint không hợp lệ').max(2048),
});
export type UnregisterWebPushSubscriptionInput = z.infer<
  typeof UnregisterWebPushSubscriptionSchema
>;

export const WebPushVapidKeyResponseSchema = z.object({
  publicKey: z.string().min(32),
});
export type WebPushVapidKeyResponse = z.infer<typeof WebPushVapidKeyResponseSchema>;

export const WebPushSubscriptionStatusResponseSchema = z.object({
  subscribed: z.boolean(),
  activeCount: z.number().int().min(0),
});
export type WebPushSubscriptionStatusResponse = z.infer<
  typeof WebPushSubscriptionStatusResponseSchema
>;

export const WebPushNotificationPayloadSchema = z.object({
  kind: WebPushNotificationKindSchema,
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(500),
  tag: z.string().min(1).max(120),
  url: z.string().min(1).max(256).default('/pos'),
  orderId: z.number().int().positive().optional(),
  tableLabel: z.string().max(120).optional(),
  batchNo: z.number().int().positive().optional(),
  timestamp: z.string(),
});
export type WebPushNotificationPayload = z.infer<typeof WebPushNotificationPayloadSchema>;

export const SendTestWebPushSchema = z.object({
  delaySeconds: z.number().int().min(0).max(15).default(5),
});
export type SendTestWebPushInput = z.infer<typeof SendTestWebPushSchema>;

export const SendTestWebPushResponseSchema = z.object({
  scheduled: z.boolean(),
  delaySeconds: z.number().int().min(0).max(15),
  activeSubscriptions: z.number().int().min(0),
});
export type SendTestWebPushResponse = z.infer<typeof SendTestWebPushResponseSchema>;

export const QrPendingCheckResponseSchema = z.object({
  stillPending: z.boolean(),
});
export type QrPendingCheckResponse = z.infer<typeof QrPendingCheckResponseSchema>;
