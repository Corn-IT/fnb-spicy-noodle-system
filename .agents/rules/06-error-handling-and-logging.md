---
trigger: model_decision
description: Standard Error Response DTO, NestJS exception filters, request ID tracing, and structured logging conventions.
---

# 06 — Xử lý Lỗi, Audit Logs & Logging (Error Handling, Audit & Logging Rules)

> Áp dụng cho: Mọi Agent làm việc trên Backend (`apps/api-server`), Shared (`packages/shared`) và xử lý lỗi trên Frontend (`apps/web-app`).

---

## 1. Standard Error Response Schema

Định nghĩa tại **`packages/shared/src/schemas/api-error.schema.ts`** (không tạo file trùng ở nơi khác):

```typescript
export const ApiErrorResponseSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
  requestId: z.string().optional(),
});
```

- **MUST** chuẩn hoá mọi exception qua `GlobalExceptionFilter` (`apps/api-server/src/common/filters/global-exception.filter.ts`).
- **NEVER** trả raw Prisma errors hoặc stack traces cho client ở production.
- Trên Frontend: map mã lỗi qua `packages/shared/src/constants/http-error-catalog.ts` và `message-catalog.ts` để hỗ trợ thông báo tuỳ biến từ `/settings`.

## 2. Error Codes Catalog (`packages/shared/src/constants/error-codes.ts`)

Sử dụng đúng các hằng số trong `ErrorCodes` (48 mã lỗi chuẩn — không hardcode string rời rạc):
- **Auth & Single-Session (401/409):** `AUTH_TOKEN_MISSING`, `AUTH_TOKEN_EXPIRED`, `AUTH_TOKEN_INVALID`, `AUTH_CREDENTIALS_INVALID`, `AUTH_SESSION_REPLACED`, `AUTH_SESSION_REVOKED`, `AUTH_SESSION_CONFLICT_ONLINE`.
- **RBAC (403):** `RBAC_PERMISSION_DENIED`, `RBAC_SUPER_ADMIN_REQUIRED`.
- **POS & QR Security (403/409):** `POS_TABLE_NOT_AVAILABLE`, `POS_TABLE_NOT_OCCUPIED`, `POS_ORDER_NOT_ACTIVE`, `POS_NO_NEW_ITEMS_TO_SPLIT` *(giữ contract; `split-kitchen` trả 200 idempotent)*, `POS_TAKEAWAY_CANNOT_MERGE`, `POS_CONCURRENT_MODIFICATION`, `POS_DISCOUNT_BLOCKS_SPLIT`, `QR_WIFI_REQUIRED`, `QR_GEO_REQUIRED`, `QR_GEO_OUT_OF_RANGE`.
- **Discounts (404/409):** `DISCOUNT_NOT_FOUND`, `DISCOUNT_INACTIVE`, `DISCOUNT_EXPIRED`, `DISCOUNT_NOT_STARTED`, `DISCOUNT_OUT_OF_TIME_WINDOW`, `DISCOUNT_USAGE_EXHAUSTED`, `DISCOUNT_NOT_APPLICABLE`, `DISCOUNT_LOCKED_FIELDS`.
- **Payment QR (409):** `PAYMENT_QR_NOT_CONFIGURED`, `PAYMENT_QR_LOCKED_FIELD`, `PAYMENT_QR_IN_USE`, `PAYMENT_QR_CANNOT_DELETE_ACTIVE`, `PAYMENT_QR_LAST_ACTIVE`, `PAYMENT_QR_DUPLICATE_ACCOUNT`.
- **Cashflow & Inventory (400/403/409):** `CASHFLOW_ALREADY_SETTLED`, `CASHFLOW_BUDGET_NOT_SET`, `CASHFLOW_DISCREPANCY_NOTE_REQUIRED`, `INVENTORY_ALREADY_DELETED`, `INVENTORY_PAST_SHIFT_FORBIDDEN`.
- **MDM, HR & Store Settings (404/409/422):** `MDM_NAME_TAKEN`, `HR_CITIZEN_ID_DUPLICATE`, `HR_USERNAME_TAKEN`, `HR_EMPLOYEE_DELETED`, `HR_EMPLOYEE_ACCOUNT_EXISTS`, `STORE_ASSET_INVALID_TYPE`, `STORE_ASSET_TOO_LARGE`, `STORE_SETTINGS_CONFLICT`, `VALIDATION_FAILED`.

## 3. Zod Validation Error Format

- Dùng `ZodValidationPipe` (`apps/api-server/src/common/pipes/zod-validation.pipe.ts`) với schema từ `@fnb/shared`.
- Khi fail, ném `UnprocessableEntityException` (HTTP `422`) với `code: ErrorCodes.VALIDATION_FAILED` và `details: { fieldErrors: result.error.flatten().fieldErrors }`.

## 4. Audit Logging (`AuditLogModule` — `audit_logs`)

- Mọi thao tác ghi quan trọng trên 13 phân hệ (`POS`, `DISCOUNTS`, `MENU`, `INVOICES`, `INVENTORY`, `CASHFLOW`, `PAYMENT_QR`, `EMPLOYEES`, `SCHEDULES`, `PAYROLL`, `MDM`, `RBAC`, `SETTINGS`) **MUST** ghi nhận qua `AuditLogService`.
- **Bảo mật dữ liệu nhạy cảm:** `ip_address` và `device_label` chỉ được trả về qua API khi `actor.isSuperAdmin === true` (`AuditLogController`). Nhật ký module `RBAC` chỉ cho phép Super Admin xem.

## 5. Structured Application Logging & Request ID Tracing

- `RequestIdMiddleware` sinh UUID v4 gắn vào `requestId` (`AsyncLocalStorage` trong `common/context/request-context.ts`) và trả header `X-Request-Id`.
- `LoggingInterceptor` log các sự kiện quan trọng kèm `requestId`.
- **NEVER log:** Passwords, `password_hash`, JWT access/refresh tokens, VAPID private key, số `citizen_id` đầy đủ.

## 6. Health Check

- `GET /api/v1/health` (public) trả `{ status: 'ok', timestamp, database: 'connected' | 'disconnected', uptime }`, dùng cho Docker `HEALTHCHECK`.
