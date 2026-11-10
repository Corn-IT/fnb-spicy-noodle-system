# 06 — Xử lý Lỗi & Logging (Error Handling & Logging Rules)

> Áp dụng cho: Codex (Phase 4B), Antigravity (Phase 5).

---

## 1. Standard Error Response DTO

Mọi API error response **MUST** theo format này (định nghĩa trong `packages/shared/`):

```typescript
// packages/shared/src/dto/api-error.dto.ts
import { z } from 'zod';

export const ApiErrorResponseSchema = z.object({
  statusCode: z.number(),        // HTTP status code (400, 401, 403, 404, 409, 422, 500)
  error: z.string(),             // Short error type: "Bad Request", "Forbidden", "Conflict"
  message: z.string(),           // Human-readable description (Vietnamese)
  code: z.string().optional(),   // Machine-readable: "POS_TABLE_OCCUPIED", "CASHFLOW_FORMULA_MISMATCH"
  details: z.unknown().optional(), // Zod validation errors, field-level errors
  requestId: z.string().optional(), // UUID v4 trace ID
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
```

- **MUST** dùng NestJS `ExceptionFilter` để chuẩn hoá tất cả error responses.
- **NEVER** trả raw Prisma errors hoặc stack traces cho client ở production.

## 2. Error Codes by Module

Định nghĩa tại `packages/shared/src/constants/error-codes.ts`:

```typescript
export const ErrorCodes = {
  // Auth & RBAC
  AUTH_TOKEN_MISSING: 'AUTH_TOKEN_MISSING',           // 401
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',           // 401
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',           // 401
  AUTH_CREDENTIALS_INVALID: 'AUTH_CREDENTIALS_INVALID', // 401
  RBAC_PERMISSION_DENIED: 'RBAC_PERMISSION_DENIED',   // 403
  RBAC_SUPER_ADMIN_REQUIRED: 'RBAC_SUPER_ADMIN_REQUIRED', // 403

  // POS
  POS_TABLE_NOT_AVAILABLE: 'POS_TABLE_NOT_AVAILABLE',     // 409
  POS_TABLE_NOT_OCCUPIED: 'POS_TABLE_NOT_OCCUPIED',       // 409
  POS_ORDER_NOT_ACTIVE: 'POS_ORDER_NOT_ACTIVE',           // 409
  POS_NO_NEW_ITEMS_TO_SPLIT: 'POS_NO_NEW_ITEMS_TO_SPLIT', // Giữ hằng số contract; endpoint split-kitchen trả HTTP 200 OK idempotent ({ tickets: [] }) theo EC-POS-05
  POS_TAKEAWAY_CANNOT_MERGE: 'POS_TAKEAWAY_CANNOT_MERGE', // 409
  POS_CONCURRENT_MODIFICATION: 'POS_CONCURRENT_MODIFICATION', // 409

  // Cashflow
  CASHFLOW_ALREADY_SETTLED: 'CASHFLOW_ALREADY_SETTLED',   // 409
  CASHFLOW_BUDGET_NOT_SET: 'CASHFLOW_BUDGET_NOT_SET',     // 400

  // Inventory
  INVENTORY_ALREADY_DELETED: 'INVENTORY_ALREADY_DELETED', // 409

  // HR
  HR_CITIZEN_ID_DUPLICATE: 'HR_CITIZEN_ID_DUPLICATE',     // 409
  HR_USERNAME_TAKEN: 'HR_USERNAME_TAKEN',                  // 409
  HR_EMPLOYEE_DELETED: 'HR_EMPLOYEE_DELETED',              // 404

  // Validation
  VALIDATION_FAILED: 'VALIDATION_FAILED',                  // 422
} as const;
```

## 3. Zod Validation Error Format

Khi Zod validation fail, trường `details` **MUST** chứa field errors có cấu trúc:

```json
{
  "statusCode": 422,
  "error": "Unprocessable Entity",
  "message": "Dữ liệu không hợp lệ",
  "code": "VALIDATION_FAILED",
  "details": {
    "fieldErrors": {
      "orderType": ["Giá trị phải là 'DINE_IN' hoặc 'TAKEAWAY'"],
      "items": ["Phải có ít nhất 1 món trong đơn hàng"]
    }
  }
}
```

- Dùng `ZodError.flatten()` hoặc `.format()` để sinh field-level errors.
- **MUST** implement dưới dạng NestJS Pipe validate request body bằng Zod schema từ `@fnb/shared`.

```typescript
// apps/api-server/src/common/pipes/zod-validation.pipe.ts
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new UnprocessableEntityException({
        code: ErrorCodes.VALIDATION_FAILED,
        message: 'Dữ liệu không hợp lệ',
        details: { fieldErrors: result.error.flatten().fieldErrors },
      });
    }
    return result.data;
  }
}
```

## 4. Logging Rules

- Dùng NestJS built-in `Logger` hoặc `Pino` cho structured logging.

### Log Levels:

| Level | Khi nào | Ví dụ |
|-------|---------|-------|
| `ERROR` | Unhandled exceptions, DB connection fail, critical violations | Prisma connection refused |
| `WARN` | Handled nhưng bất thường | Concurrent lock retry, cashflow discrepancy detected |
| `LOG` (INFO) | Business events quan trọng | Order created, settlement completed, table transferred |
| `DEBUG` | Chi tiết execution flow | Chỉ bật ở development |

### Business Events BẮT BUỘC phải log:

```
[LOG] Order created: orderId=542, orderType=TAKEAWAY, tableId=null
[LOG] Split kitchen: orderId=542, batchNo=2, BEP_NAU=3items, BEP_CHIEN=1item, PHA_CHE=2items
[LOG] Table transfer: orderId=538, action=MOVE, from=Ban_01, to=Ban_07
[LOG] Settlement: date=2026-11-07, shift=Ca_Toi, expected=2850000, actual=2850000, discrepancy=0
[WARN] Permission denied: userId=15, endpoint=PUT /cashflow/default-budget, required=cashflow:config
```

### NEVER log:
- Passwords, JWT tokens, password_hash
- Số citizen_id đầy đủ (mask nếu cần)
- Stack traces trong production response (chỉ log server-side)

## 5. Request ID Tracing

- Sinh `requestId` (UUID v4) cho mọi incoming HTTP request qua NestJS middleware.
- Gắn `requestId` vào **MỌI** log entries trong request lifecycle đó.
- Trả `requestId` trong error responses để debug.

```typescript
// apps/api-server/src/common/middleware/request-id.middleware.ts
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    req['requestId'] = randomUUID();
    res.setHeader('X-Request-Id', req['requestId']);
    next();
  }
}
```

## 6. Global Exception Filter

```typescript
// apps/api-server/src/common/filters/global-exception.filter.ts
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    // 1. Extract request context (requestId, path, method)
    // 2. Map known exceptions → ApiErrorResponse format
    // 3. Log error with requestId (ERROR level)
    // 4. Return standardized JSON response
    // 5. In production: NEVER expose stack traces in response body
  }
}
```

- Register globally: `app.useGlobalFilters(new GlobalExceptionFilter())` trong `main.ts`.

## 7. Health Check

- `GET /api/v1/health` — public, không cần auth.
- Response: `{ status: 'ok', timestamp, database: 'connected' | 'disconnected', uptime }`.
- Dùng bởi Docker `HEALTHCHECK` và monitoring.
