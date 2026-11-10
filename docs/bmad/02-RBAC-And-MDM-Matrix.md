# BMAD Phân quyền & Chuẩn hoá Dữ liệu Dùng chung
# 02-RBAC-And-MDM-Matrix.md — Ma trận Phân quyền & Quản trị Master Data

> **Tài liệu:** 02-RBAC-And-MDM-Matrix.md  
> **Phiên bản:** 1.0.0 (BMAD Phase 1 Final)  
> **Vai trò thực hiện:** BMAD Business Analyst & System Architect  
> **Trạng thái:** FINAL  
> **Ngày phê duyệt:** 2026-11-07  
> **Quy chuẩn tuân thủ:** Hard Invariant 7 (MDM Chuẩn hoá chuỗi) & Hard Invariant 8 (RBAC 401 vs 403)

---

## 1. KIẾN TRÚC BẢO MẬT & XÁC THỰC (AUTHENTICATION & GUARDS)

### 1.1. Chu trình Xác thực Hai Lớp (JWT Access & Refresh Token)
Hệ thống sử dụng cơ chế xác thực JWT kết hợp Token Rotation để bảo mật tối đa cho máy POS dùng chung tại quầy:

```
[Client / POS Web App] ── 1. POST /api/v1/auth/login ──► [IamController]
                       ◄── 2. AccessToken (Body 15m) +   [Bcrypt Verify]
                              RefreshToken (httpOnly 7d)
                              
[Mỗi Request API]      ── 3. Header Bearer <AccessToken> ──► [JwtAuthGuard]
                                                              ├── Hợp lệ  ──► [RbacGuard]
                                                              └── Hết hạn ──► 401 Unauthorized
                                                              
[Khi nhận mã 401]      ── 4. POST /api/v1/auth/refresh ────► [Cấp AccessToken mới]
```

- **AccessToken:**
  - Định dạng: JSON Web Token (JWT) được ký bởi `JWT_SECRET`.
  - Thời gian sống (TTL): Đúng 15 phút.
  - Vận chuyển: Client gửi trong HTTP Header `Authorization: Bearer <accessToken>`.
  - Payload: `{ sub: userId, employeeId, username, isSuperAdmin, permissions }`.
- **RefreshToken:**
  - Thời gian sống (TTL): Đúng 7 ngày.
  - Vận chuyển: Lưu trữ trong Cookie an toàn `httpOnly`, `sameSite: 'strict'`, `secure: true` (ở production).
  - Sử dụng để cấp lại AccessToken tự động qua `POST /api/v1/auth/refresh` mà không làm gián đoạn thu ngân đang thao tác.
- **Mật khẩu:**
  - Mã hoá một chiều bằng thuật toán `bcrypt` với cost factor = 10.
  - Yêu cầu độ dài tối thiểu: 6 ký tự.

### 1.2. Cơ chế Guard Hai Tầng tại Backend NestJS
Mọi request vào các endpoint quản trị đều đi qua chuỗi xử lý nghiêm ngặt:
1. **Tầng 1 — `JwtAuthGuard`:**
   - Trích xuất Bearer token từ header.
   - Giải mã và xác thực chữ ký số cùng thời hạn hiệu lực.
   - Nếu thiếu token, token sai format, hoặc token hết hạn -> **NGAY LẬP TỨC TRẢ VỀ HTTP 401 UNAUTHORIZED**. Tuyệt đối không cho đi tiếp vào RbacGuard.
2. **Tầng 2 — `RbacGuard`:**
   - Đọc metadata quyền hạn từ Decorator `@RequirePermission(module, action)` hoặc `@RequireSubPermission(module, subAction)`.
   - Nếu `user.is_super_admin === true` -> **CHO PHÉP TRUY CẬP NGAY LẬP TỨC (BYPASS TẤT CẢ KIỂM TRA)**.
   - Nếu người dùng thông thường: Kiểm tra cấu trúc JSONB `permissions` trong payload của user.
   - Nếu `permissions[module][action] === true` -> **CHO PHÉP TRUY CẬP**.
   - Nếu không có quyền -> **NGAY LẬP TỨC TRẢ VỀ HTTP 403 FORBIDDEN**.

---

## 2. QUY TẮC MÃ LỖI HTTP BẤT BIẾN (HARD INVARIANT 8)

> [!CRITICAL]
> **Quy tắc Vàng về Mã Lỗi HTTP:**
> - `401 Unauthorized`: **CHỈ DÙNG** khi Chưa đăng nhập, Thiếu token, Token giả mạo, hoặc Token hết hạn.
> - `403 Forbidden`: **CHỈ DÙNG** khi Đã đăng nhập thành công nhưng Tài khoản không có đủ quyền thao tác.
> - **NGHIÊM CẤM:** Không được trả 401 khi user thiếu quyền; Không được trả 403 khi chưa đăng nhập.

### Bảng Ánh xạ Mã lỗi Chuẩn Hệ thống
| HTTP Code | Error Type | Tình huống Kích hoạt | Response Body Mẫu |
|:---:|:---|:---|:---|
| **`401`** | `Unauthorized` | Request không gửi kèm Bearer token | `{"statusCode": 401, "error": "Unauthorized", "message": "Yêu cầu đăng nhập để truy cập tài nguyên"}` |
| **`401`** | `Unauthorized` | Token JWT hết hạn 15 phút | `{"statusCode": 401, "error": "Unauthorized", "message": "Phiên đăng nhập đã hết hạn, vui lòng làm mới token", "code": "AUTH_TOKEN_EXPIRED"}` |
| **`401`** | `Unauthorized` | Đăng nhập sai username hoặc password | `{"statusCode": 401, "error": "Unauthorized", "message": "Tên đăng nhập hoặc mật khẩu không chính xác", "code": "AUTH_CREDENTIALS_INVALID"}` |
| **`403`** | `Forbidden` | Thu ngân cố gọi `PUT /api/v1/cashflow/default-budget` | `{"statusCode": 403, "error": "Forbidden", "message": "Bạn không có quyền thay đổi ngân sách mặc định", "code": "RBAC_PERMISSION_DENIED"}` |
| **`403`** | `Forbidden` | Nhân viên vào thẳng URL `/rbac` hoặc `/` trên trình duyệt | Giao diện hiển thị trang cảnh báo `403 Không đủ quyền truy cập`, không cho render nội dung module |
| **`403`** | `Forbidden` | Thu ngân cố gọi `POST /api/v1/invoices/:id/void` | `{"statusCode": 403, "error": "Forbidden", "message": "Chỉ Quản lý hoặc Admin mới có quyền huỷ hoá đơn", "code": "RBAC_PERMISSION_DENIED"}` |
| **`409`** | `Conflict` | Vi phạm quy tắc nghiệp vụ (Merge đơn Takeaway, Bàn occupied) | `{"statusCode": 409, "error": "Conflict", "message": "Không thể gộp đơn mang về", "code": "POS_TAKEAWAY_CANNOT_MERGE"}` |
| **`422`** | `Unprocessable` | Dữ liệu gửi lên sai Zod Schema validation | `{"statusCode": 422, "error": "Unprocessable Entity", "message": "Dữ liệu không hợp lệ", "details": {"fieldErrors": {...}}}` |

---

## 3. CẤU TRÚC DỮ LIỆU PHÂN QUYỀN (JSONB PERMISSIONS SCHEMA)

Mọi quyền hạn của một tài khoản được lưu trữ trong cột `users.permissions` dạng JSONB theo schema chuẩn định nghĩa tại `packages/shared/`:

```typescript
// packages/shared/src/schemas/rbac.schema.ts
import { z } from 'zod';

export const ModulePermissionsSchema = z.object({
  // Quyền truy cập màn hình (hiển thị trên Sidebar và Route Guard)
  view: z.boolean().default(false),
  // Quyền CRUD cơ bản
  create: z.boolean().default(false),
  update: z.boolean().default(false),
  delete: z.boolean().default(false),
});

export const UserPermissionsSchema = z.object({
  // Module 0 & 1: POS & Đặt món
  pos: ModulePermissionsSchema.extend({
    splitKitchen: z.boolean().default(false),
    tableAction: z.boolean().default(false),
    checkout: z.boolean().default(false),
  }),
  // Module 2: Quản lý Hoá đơn
  invoices: z.object({
    view: z.boolean().default(false),
    reprint: z.boolean().default(false),
    void: z.boolean().default(false), // Sub-permission: Huỷ hoá đơn đã thanh toán
  }),
  // Module 3: Nhập hàng Kho
  inventory: ModulePermissionsSchema,
  // Module 4: Ngân sách & Dòng tiền Kết ca
  cashflow: z.object({
    view: z.boolean().default(false),
    create: z.boolean().default(false), // Kết ca
    config: z.boolean().default(false), // Sub-permission: Sửa ngân sách mặc định đầu ngày
  }),
  // Module 5: Nhân viên
  employees: ModulePermissionsSchema,
  // Module 6: Lịch làm việc
  schedules: z.object({
    view: z.boolean().default(false),
    update: z.boolean().default(false), // Xếp ca & Lưu lịch tuần
  }),
  // Module 7: Master Data
  mdm: z.object({
    view: z.boolean().default(false),
    write: z.boolean().default(false), // Thêm/Sửa/Xoá danh mục gốc
  }),
  // Module 8: Quản trị Phân quyền
  rbac: z.object({
    view: z.boolean().default(false),
    manage: z.boolean().default(false), // Chỉ dành cho Super Admin
  }),
});

export type UserPermissions = z.infer<typeof UserPermissionsSchema>;
```

### 3.1. Đặc quyền Bất biến của Super Admin
- Khi `users.is_super_admin === true`:
  - `RbacGuard` bỏ qua toàn bộ kiểm tra `permissions[module][action]`.
  - Trên màn hình phân quyền (Module 8 Drawer), toàn bộ hàng và các checkbox quyền của Super Admin hiển thị ở trạng thái **DISABLED / READONLY** kèm badge vàng `"Super Admin - Toàn quyền"`.
  - Không có bất kỳ người dùng nào (kể cả chính Super Admin) có thể vô hiệu hoá hoặc tước bớt quyền của tài khoản Super Admin.
  - Tài khoản Super Admin được khởi tạo mặc định trong file `apps/api-server/prisma/seed.ts`.

---

## 4. MA TRẬN PHÂN QUYỀN TOÀN HỆ THỐNG (RBAC MATRIX)

Hệ thống được thiết kế sẵn 4 vai trò vận hành tiêu chuẩn tương ứng với nghiệp vụ thực tế của quán mì cay:
1. `SUPER_ADMIN`: Chủ quán / Quản trị viên tối cao (Toàn quyền hệ thống).
2. `STORE_MANAGER`: Cửa hàng trưởng / Quản lý ca (Giám sát, huỷ hoá đơn sai, duyệt nhập hàng, xếp lịch nhân viên).
3. `CASHIER`: Thu ngân quầy (Tạo đơn, tách bếp, in tạm tính, thanh toán, kết ca, nhập nguyên liệu chợ).
4. `STAFF`: Nhân viên phục vụ / Đứng bếp (Chỉ xem lịch làm việc cá nhân và cập nhật hồ sơ cá nhân).

### Bảng Ma trận Phân quyền Chi tiết (10 Modules × Vai trò)

| Module | Tên Màn hình & Quyền | Mã Quyền (Permission Key) | SUPER_ADMIN | STORE_MANAGER | CASHIER | STAFF |
|:---|:---|:---|:---:|:---:|:---:|:---:|
| **0. Menu & Bàn** | Xem danh sách món & bàn | `pos:view` | ✅ | ✅ | ✅ | ❌ |
| | Cấu hình món ăn, giá, topping | `pos:update` | ✅ | ✅ | ❌ | ❌ |
| **1. POS Hợp nhất** | Truy cập màn hình POS quầy | `pos:view` | ✅ | ✅ | ✅ | ❌ |
| | Tạo đơn tại quầy / Mang về | `pos:create` | ✅ | ✅ | ✅ | ❌ |
| | Tách đơn 3 khu vực bếp | `pos:splitKitchen` | ✅ | ✅ | ✅ | ❌ |
| | Đổi bàn / Gộp bàn / Hoán đổi | `pos:tableAction` | ✅ | ✅ | ✅ | ❌ |
| | In tạm tính VietQR động | `pos:view` | ✅ | ✅ | ✅ | ❌ |
| | Chốt thanh toán & Đóng đơn | `pos:checkout` | ✅ | ✅ | ✅ | ❌ |
| **2. Hoá đơn** | Xem danh sách lịch sử hoá đơn | `invoices:view` | ✅ | ✅ | ✅ | ❌ |
| | In lại hoá đơn cũ | `invoices:reprint` | ✅ | ✅ | ✅ | ❌ |
| | **Huỷ hoá đơn đã thu tiền (Void)** | **`invoices:void`** | **✅** | **✅** | **❌** | **❌** |
| **3. Nhập hàng** | Xem lịch sử nhập hàng | `inventory:view` | ✅ | ✅ | ✅ | ❌ |
| | Thêm phiếu nhập hàng (Drawer) | `inventory:create` | ✅ | ✅ | ✅ | ❌ |
| | Xoá phiếu nhập nhầm trong ca | `inventory:delete` | ✅ | ✅ | ✅ (Chỉ ca hiện tại) | ❌ |
| | Xoá phiếu nhập của các ngày cũ | `inventory:delete` | ✅ | ✅ | ❌ | ❌ |
| **4. Dòng tiền** | Xem lịch sử kết ca | `cashflow:view` | ✅ | ✅ | ✅ | ❌ |
| | Đếm tiền & Bấm "Kết ca" | `cashflow:create` | ✅ | ✅ | ✅ | ❌ |
| | **Sửa Ngân sách mặc định đầu ngày** | **`cashflow:config`** | **✅** | **❌** | **❌** | **❌** |
| **5. Nhân viên** | Xem danh sách nhân viên | `employees:view` | ✅ | ✅ | ❌ | ❌ |
| | Thêm mới hồ sơ nhân viên | `employees:create` | ✅ | ✅ | ❌ | ❌ |
| | Chỉnh sửa hồ sơ nhân viên | `employees:update` | ✅ | ✅ | ❌ | ❌ |
| | Xoá mềm hồ sơ nhân viên | `employees:delete` | ✅ | ❌ | ❌ | ❌ |
| **6. Lịch làm việc**| Xem bảng ma trận lịch tuần | `schedules:view` | ✅ | ✅ | ✅ | ✅ |
| | Xếp ca, đổi ca & Bấm "Lưu" | `schedules:update` | ✅ | ✅ | ❌ | ❌ |
| | Sao chép lịch từ tuần trước | `schedules:update` | ✅ | ✅ | ❌ | ❌ |
| **7. Master Data** | Quản trị màn hình Master Data | `mdm:view` & `mdm:write` | ✅ | ❌ | ❌ | ❌ |
| | **Gọi API Autocomplete (Lookup)** | **`authenticated`** | **✅** | **✅** | **✅** | **✅** |
| **8. Phân quyền** | Xem danh sách tài khoản | `rbac:view` | ✅ | ❌ | ❌ | ❌ |
| | Tạo tài khoản & Cấu hình quyền | `rbac:manage` | ✅ | ❌ | ❌ | ❌ |
| **9. Hồ sơ & UI** | Xem & Cập nhật hồ sơ cá nhân | `authenticated` | ✅ | ✅ | ✅ | ✅ |
| | Tìm kiếm màn hình (Ctrl+K) | `authenticated` (Lọc theo RBAC) | ✅ | ✅ (Chỉ thấy quyền) | ✅ (Chỉ thấy quyền) | ✅ (Chỉ thấy Hồ sơ & Lịch) |
| | Lưu Theme & Độ rộng cột/sidebar | `authenticated` | ✅ | ✅ | ✅ | ✅ |

---

## 5. MAPPING PERMISSIONS VÀO HỆ THỐNG REST API

Mỗi Controller trong Backend NestJS sử dụng Decorator `@RequirePermission` để khai báo quyền hạn tương ứng:

```typescript
// apps/api-server/src/common/decorators/require-permission.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission_key';
export const RequirePermission = (module: string, action: string) =>
  SetMetadata(PERMISSION_KEY, { module, action });
```

### Bảng Mapping API Endpoints sang Quyền RBAC
```
====================================================================================================
HTTP METHOD | ENDPOINT                               | PERMISSION GUARD REQUIRED
====================================================================================================
-- MODULE 0 & 1: MENU & POS COUNTER
GET         | /api/v1/public/menu                    | Public (Kèm qr_token)
POST        | /api/v1/public/orders/qr               | Public (Kèm qr_token)
GET         | /api/v1/pos/tables                     | @RequirePermission('pos', 'view')
POST        | /api/v1/pos/orders                     | @RequirePermission('pos', 'create')
PATCH       | /api/v1/pos/orders/:id/items           | @RequirePermission('pos', 'update')
POST        | /api/v1/pos/orders/:id/split-kitchen   | @RequirePermission('pos', 'splitKitchen')
POST        | /api/v1/pos/orders/:id/table-action    | @RequirePermission('pos', 'tableAction')
GET         | /api/v1/pos/orders/:id/provisional-bill| @RequirePermission('pos', 'view')
POST        | /api/v1/pos/orders/:id/checkout        | @RequirePermission('pos', 'checkout')

-- MODULE 2: INVOICES
GET         | /api/v1/invoices                       | @RequirePermission('invoices', 'view')
GET         | /api/v1/invoices/:id                   | @RequirePermission('invoices', 'view')
POST        | /api/v1/invoices/:id/void              | @RequirePermission('invoices', 'void')

-- MODULE 3: INVENTORY
GET         | /api/v1/inventory-imports              | @RequirePermission('inventory', 'view')
POST        | /api/v1/inventory-imports              | @RequirePermission('inventory', 'create')
DELETE      | /api/v1/inventory-imports/:id          | @RequirePermission('inventory', 'delete')

-- MODULE 4: CASHFLOW
GET         | /api/v1/cashflow/settlements           | @RequirePermission('cashflow', 'view')
POST        | /api/v1/cashflow/settle                | @RequirePermission('cashflow', 'create')
PUT         | /api/v1/cashflow/default-budget        | @RequirePermission('cashflow', 'config')

-- MODULE 5: EMPLOYEES
GET         | /api/v1/employees                      | @RequirePermission('employees', 'view')
POST        | /api/v1/employees                      | @RequirePermission('employees', 'create')
PUT         | /api/v1/employees/:id                  | @RequirePermission('employees', 'update')
DELETE      | /api/v1/employees/:id                  | @RequirePermission('employees', 'delete')

-- MODULE 6: SCHEDULES
GET         | /api/v1/schedules                      | @RequirePermission('schedules', 'view')
PUT         | /api/v1/schedules/bulk-save            | @RequirePermission('schedules', 'update')

-- MODULE 7: MASTER DATA
GET         | /api/v1/mdm/lookup                     | AuthenticatedOnly (Mọi user đăng nhập)
GET         | /api/v1/mdm                            | @RequirePermission('mdm', 'view')
POST        | /api/v1/mdm                            | @RequirePermission('mdm', 'write')
PUT         | /api/v1/mdm/:id                        | @RequirePermission('mdm', 'write')
DELETE      | /api/v1/mdm/:id                        | @RequirePermission('mdm', 'write')

-- MODULE 8: IAM & RBAC
GET         | /api/v1/users                          | @RequirePermission('rbac', 'view')
POST        | /api/v1/users                          | SuperAdminOnly (is_super_admin = true)
PUT         | /api/v1/users/:id/permissions          | SuperAdminOnly (is_super_admin = true)

-- MODULE 9: PROFILE & UI PREFERENCES
GET         | /api/v1/profile                        | AuthenticatedOnly
PUT         | /api/v1/profile                        | AuthenticatedOnly
PATCH       | /api/v1/profile/ui-prefs               | AuthenticatedOnly
====================================================================================================
```

---

## 6. QUẢN TRỊ MASTER DATA & CHUẨN HOÁ CHUỖI (HARD INVARIANT 7)

### 6.1. Tách biệt Tuyệt đối giữa API Lookup và Quản trị MDM
- **Vấn đề đã triệt tiêu:** Nếu dùng chung một quyền hạn cho cả màn hình quản trị Master Data và API đổ dữ liệu dropdown, khi khoá quyền trang Master Data của Thu ngân, họ sẽ không thể chọn được tên nguyên liệu khi nhập hàng ở Module 3.
- **Giải pháp Kiến trúc:**
  1. `GET /api/v1/mdm/lookup?category=...`: Mở hoàn toàn cho mọi tài khoản đã đăng nhập (`@UseGuards(JwtAuthGuard)`).
     - Trả về danh sách tinh gọn: `[{ id: 1, name: "Ba Chỉ Bò Mỹ", metadata: { default_unit: "Kg", last_price: 180000 } }]`.
     - Phục vụ cho: Drawer Module 3 (Combobox autocomplete), Module 5 (Dropdown Chức vụ / Chuyên môn).
  2. `CRUD /api/v1/mdm`: Yêu cầu quyền `mdm:view` và `mdm:write`.
     - Phục vụ riêng cho: Màn hình Quản trị Danh mục gốc tại Module 7 (chỉ Admin).

### 6.2. 5 Danh mục Master Data Cốt lõi
```
master_data
├── CATEGORY: 'POSITION'    ── Quản lý Chức vụ Nhân sự (Quản lý, Thu ngân, Bếp chính...)
├── CATEGORY: 'SPECIALTY'   ── Quản lý Trạm Chuyên môn (BEP_NAU, BEP_CHIEN, PHA_CHE, PHUC_VU)
├── CATEGORY: 'INGREDIENT'  ── Quản lý Nguyên vật liệu (Bò Mỹ, Mì HQ, Kim chi, Đá bi...)
├── CATEGORY: 'UNIT'        ── Quản lý Đơn vị tính (Kg, Thùng, Gói, Két, Lon, Chai...)
└── CATEGORY: 'SUPPLIER'    ── Quản lý Nhà cung cấp nguyên vật liệu
```

### 6.3. Thuật toán Chuẩn hoá Chuỗi Tự động (Normalization Algorithm)
Hàm xử lý duy nhất đặt tại `apps/api-server/src/common/utils/normalized-string.util.ts`:

```typescript
export function normalizeVietnameseString(raw: string): string {
  if (!raw) return '';
  return raw
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Xoá toàn bộ dấu tiếng Việt
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' '); // Gộp khoảng trắng thừa ở giữa
}

export function toTitleCase(raw: string): string {
  if (!raw) return '';
  return raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
```

#### Quy trình Xử lý tại `MdmService.findOrCreate()`:
```typescript
@Injectable()
export class MdmService {
  constructor(private readonly prisma: PrismaService) {}

  async findOrCreate(category: string, rawInput: string, metadata: Record<string, unknown> = {}) {
    const trimmed = rawInput.trim();
    if (!trimmed) {
      throw new BadRequestException('Tên danh mục không được để trống');
    }

    const titleCased = toTitleCase(trimmed);
    const normalized = normalizeVietnameseString(trimmed);

    // Tìm kiếm với Composite Key (category + normalized_name)
    const existing = await this.prisma.masterData.findFirst({
      where: {
        category,
        normalized_name: normalized,
        is_active: true,
      },
    });

    if (existing) {
      // Nếu có metadata mới (ví dụ giá nhập gần nhất) -> cập nhật ngầm
      if (Object.keys(metadata).length > 0) {
        return this.prisma.masterData.update({
          where: { id: existing.id },
          data: { metadata: { ...(existing.metadata as object), ...metadata } },
        });
      }
      return existing;
    }

    // Chưa có -> Tạo mới và ghi nhận chuẩn hoá
    return this.prisma.masterData.create({
      data: {
        category,
        name: titleCased,
        normalized_name: normalized,
        metadata,
        is_active: true,
      },
    });
  }
}
```

### 6.4. Bảng Quy chuẩn Bỏ dấu Tiếng Việt Toàn diện
| Ký tự Gốc Tiếng Việt | Ký tự Chuẩn hoá (`normalized_name`) |
|:---|:---:|
| `a, á, à, ả, ã, ạ, ă, ắ, ằ, ẳ, ẵ, ặ, â, ấn, ầ, ẩ, ẫ, ậ` | `a` |
| `e, é, è, ẻ, ẽ, ẹ, ê, ế, ề, ể, ễ, ệ` | `e` |
| `i, í, ì, ỉ, ĩ, ị` | `i` |
| `o, ó, ò, ỏ, õ, ọ, ô, ố, ồ, ổ, ỗ, ộ, ơ, ớ, ờ, ở, ỡ, ợ` | `o` |
| `u, ú, ù, ủ, ũ, ụ, ư, ứ, ừ, ử, ữ, ự` | `u` |
| `y, ý, kỳ, ỷ, ỹ, tỵ` | `y` |
| `d, đ, Đ` | `d` |

- **Kết quả Thực tế:**
  - Nhân viên ca sáng nhập: `"Tương Ớt Hàn Quốc "` -> `name: "Tương Ớt Hàn Quốc"`, `normalized_name: "tuong ot han quoc"`.
  - Nhân viên ca tối nhập: `"tương ớt hàn quốc"` -> đối chiếu thấy `normalized_name` trùng -> Sử dụng ngay bản ghi cũ, **KHÔNG BAO GIỜ TẠO BẢN GHI RÁC**.

---

## 7. BỘ DỮ LIỆU SEED MẪU CHUẨN (MASTER SEED DATA)

Tệp dữ liệu mồi khởi tạo trong `apps/api-server/prisma/seed.ts` chứa dữ liệu thực tế chuẩn cho quán mì cay:

### 7.1. Chức vụ & Chuyên môn Nhân sự
```json
[
  { "category": "POSITION", "name": "Quản Lý Cửa Hàng", "normalized": "quan ly cua hang" },
  { "category": "POSITION", "name": "Thu Ngân Quầy", "normalized": "thu ngan quay" },
  { "category": "POSITION", "name": "Bếp Trưởng Mì Cay", "normalized": "bep truong mi cay" },
  { "category": "POSITION", "name": "Nhân Viên Đứng Bếp Chiên", "normalized": "nhan vien dung bep chien" },
  { "category": "POSITION", "name": "Nhân Viên Pha Chế", "normalized": "nhan vien pha che" },
  { "category": "POSITION", "name": "Nhân Viên Phục Vụ", "normalized": "nhan vien phuc vu" },
  { "category": "SPECIALTY", "name": "Bếp Nấu (Mì Cay)", "normalized": "bep nau (mi cay)" },
  { "category": "SPECIALTY", "name": "Bếp Chiên (Đồ Ăn Vặt)", "normalized": "bep chien (do an vat)" },
  { "category": "SPECIALTY", "name": "Pha Chế (Nước Uống)", "normalized": "pha che (nuoc uong)" },
  { "category": "SPECIALTY", "name": "Phục Vụ Bàn", "normalized": "phuc vu ban" }
]
```

### 7.2. Nguyên liệu & Đơn vị tính Nhập kho
```json
[
  { "category": "UNIT", "name": "Kg", "normalized": "kg" },
  { "category": "UNIT", "name": "Thùng", "normalized": "thung" },
  { "category": "UNIT", "name": "Gói", "normalized": "goi" },
  { "category": "UNIT", "name": "Két", "normalized": "ket" },
  { "category": "UNIT", "name": "Bao", "normalized": "bao" },
  { "category": "INGREDIENT", "name": "Mì Koreno Không Gia Vị", "normalized": "mi koreno khong gia vi", "metadata": { "default_unit": "Thùng", "last_price": 285000 } },
  { "category": "INGREDIENT", "name": "Ba Chỉ Bò Mỹ Đông Lạnh", "normalized": "ba chi bo my dong lanh", "metadata": { "default_unit": "Kg", "last_price": 175000 } },
  { "category": "INGREDIENT", "name": "Bạch Tuộc Tươi", "normalized": "bach tuoc tuoi", "metadata": { "default_unit": "Kg", "last_price": 140000 } },
  { "category": "INGREDIENT", "name": "Tôm Sú", "normalized": "tom su", "metadata": { "default_unit": "Kg", "last_price": 190000 } },
  { "category": "INGREDIENT", "name": "Kim Chi Cải Thảo", "normalized": "kim chi cai thao", "metadata": { "default_unit": "Kg", "last_price": 45000 } },
  { "category": "INGREDIENT", "name": "Ớt Bột Hàn Quốc (Cấp Độ)", "normalized": "ot bot han quoc (cap do)", "metadata": { "default_unit": "Kg", "last_price": 130000 } },
  { "category": "INGREDIENT", "name": "Khoai Tây Chiên Cắt Sợi", "normalized": "khoai tay chien cat soi", "metadata": { "default_unit": "Gói", "last_price": 55000 } },
  { "category": "INGREDIENT", "name": "Phô Mai Que Đông Lạnh", "normalized": "pho mai que dong lanh", "metadata": { "default_unit": "Hộp", "last_price": 85000 } },
  { "category": "INGREDIENT", "name": "Trà Đào Đóng Hộp", "normalized": "tra dao dong hop", "metadata": { "default_unit": "Lon", "last_price": 32000 } },
  { "category": "INGREDIENT", "name": "Đá Bi Dùng Trong Ngày", "normalized": "da bi dung trong ngay", "metadata": { "default_unit": "Bao", "last_price": 15000 } }
]
```

### 7.3. Tài khoản Mặc định Ban đầu (Default Accounts)
```
1. Super Admin:
   - Username: superadmin
   - Password: Password@123 (bcrypt hashed)
   - is_super_admin: true
   - permissions: {} (Bypass all)

2. Thu ngân Mẫu:
   - Username: cashier01
   - Password: Password@123
   - is_super_admin: false
   - permissions: {
       "pos": { "view": true, "create": true, "update": true, "delete": false, "splitKitchen": true, "tableAction": true, "checkout": true },
       "invoices": { "view": true, "reprint": true, "void": false },
       "inventory": { "view": true, "create": true, "delete": true },
       "cashflow": { "view": true, "create": true, "config": false },
       "employees": { "view": false },
       "schedules": { "view": true, "update": false },
       "mdm": { "view": false, "write": false },
       "rbac": { "view": false }
     }
```

---

> **Tài liệu Ma trận Phân quyền & Quản trị Master Data này là tài liệu kiểm soát bảo mật cao nhất.**  
> Mọi nỗ lực can thiệp hoặc thay đổi các mã lỗi 401/403, cấu trúc JSONB permissions, hoặc bỏ qua thuật toán chuẩn hoá Master Data đều bị coi là vi phạm nghiêm trọng Hiến pháp kỹ thuật dự án.
