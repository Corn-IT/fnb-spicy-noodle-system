# Story 17: Danh mục Thông báo Tuỳ chỉnh Toàn Hệ thống & Trang Khách QR (`message-catalog`)

> **Trạng thái:** Chờ duyệt · **Tiền đề:** Thực hiện sau [Story 16](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/docs/stories/story-16-thermal-print-template-customizer.md), kế thừa toàn bộ nền tảng Story 14–16 và tuân thủ nghiêm ngặt Hard Invariants 1, 8, 9 trong `AGENTS.md`.

---

## 1. Mục tiêu Nghiệp vụ

Cho phép chủ quán tuỳ chỉnh **toàn bộ thông báo hiển thị tới người dùng cuối** (bao gồm khách quét QR tại bàn lẫn nhân viên/quản lý trên các màn hình vận hành) ngay từ trang `/settings`, phân theo module rõ ràng:

1. **Trang khách quét QR (`/qr/:token`):** Tuỳ chỉnh toàn bộ banner cố định (bao gồm `"Quý khách chuyển bàn vui lòng thông báo với lễ tân"`), màn hình chặn bảo mật QR (yêu cầu Wi-Fi, yêu cầu GPS, ngoài phạm vi GPS, lỗi định vị, QR không hợp lệ/hết hạn), trạng thái đơn realtime (`statusMessage`, `redirectNotice`), và các thông báo toast (đặt món thành công, lỗi gửi đơn, sao chép mật khẩu Wi-Fi, giữ tối thiểu 1 thành phần thay thế).
2. **Trang Quản trị & Bán hàng POS:** Tuỳ chỉnh ~200+ thông báo pop-up (`toast`), tiêu đề & mô tả hộp thoại xác nhận nghiệp vụ quan trọng (tách bếp, huỷ đơn/huỷ món, chuyển/gộp/hoán đổi bàn, kết ca bù chênh lệch, duyệt sửa thanh toán hoá đơn, xoá/ngưng nhân sự, xoá phiếu nhập kho, tắt QR thanh toán đang dùng, rời trang khi chưa lưu chấm công), và các thông báo lỗi trả về từ server theo mã lỗi `ErrorCodes` (403, conflict, validation/nghiệp vụ).
3. **Trải nghiệm cấu hình an toàn & gọn nhẹ:** Hỗ trợ tìm kiếm, lọc mục đã sửa, chèn biến `{variable}` dạng chip bấm, kiểm tra an toàn biến placeholder trước khi lưu, xem trước mẫu pop-up toast và khôi phục mặc định 1 click.

**Ngoài phạm vi Story 17:** Nhãn nút bấm (`Lưu cấu hình`, `Thanh toán`…), tiêu đề cột bảng (`TanStack Table`), placeholder ô tìm kiếm/input, nội dung báo cáo Excel.

---

## 2. Các Quyết định Đã Khoá (D27–D32)

- **D27 — Nguồn sự thật duy nhất (`@fnb/shared`):**
  - Định nghĩa `MESSAGE_CATALOG` tại `packages/shared/src/constants/message-catalog.ts` là nguồn mặc định duy nhất cho mọi khóa (`MessageKey`). Frontend **không** tự giữ bản sao default strings.
  - Mỗi entry gồm: `module` (1 trong 15 nhóm module), `kind` (`'toast' | 'banner' | 'block' | 'dialog'`), `title` (`string | null`), `description` (`string | null`), `variables` (`readonly string[]`), `label` (mô tả ngữ cảnh giúp chủ quán biết pop-up đó hiện khi nào).
  - 15 nhóm module:
    1. `QR_CUSTOMER` — Trang khách quét QR (Banner, màn hình chặn, toast đặt món)
    2. `POS` — Quầy thu ngân POS (gồm thao tác bàn, tách bếp, thanh toán, huỷ, socket thông báo đơn QR mới)
    3. `MENU` — Quản trị Thực đơn (sản phẩm, trạm bếp, danh mục con, đồng bộ Excel)
    4. `INVOICES` — Quản lý Hoá đơn (in lại, sửa/duyệt phương thức thanh toán)
    5. `INVENTORY` — Nhập hàng Kho
    6. `CASHFLOW` — Ngân sách & Kết ca
    7. `PAYMENT_QR` — Mã QR Thanh toán VietQR
    8. `EMPLOYEES` — Hồ sơ Nhân sự
    9. `SCHEDULES` — Bảng tính ngày công
    10. `PAYROLL` — Bảng tính lương
    11. `MDM` — Quản trị Master Data
    12. `RBAC` — Phân quyền Hệ thống
    13. `SETTINGS` — Cài đặt Cửa hàng
    14. `AUTH_PROFILE` — Đăng nhập & Hồ sơ Cá nhân
    15. `SYSTEM_ERRORS` — Mã lỗi hệ thống từ Server (`error.<ErrorCode>`)

- **D28 — Lưu trữ Sparse & Payload Public Gọn Nhẹ (Không Migration):**
  - Lưu **chỉ phần đã được sửa** (`messages: Record<MessageKey, { title?: string, description?: string }>`) vào 1 dòng riêng trong bảng `master_data`: `category = 'SYSTEM_CONFIG'`, `normalizedName = 'store_messages'`.
  - **Không** gộp toàn bộ 250+ câu vào `GET /api/v1/public/store-settings`.
  - `GET /api/v1/public/store-settings` chỉ đính kèm thêm trường `qrMessages` (chỉ gồm các key thuộc module `QR_CUSTOMER` đã được sửa, hoặc `{}` nếu chưa sửa) để trang khách `/qr/:token` hoạt động ngay không cần đăng nhập và payload luôn cực nhẹ.
  - Thêm endpoint `GET /api/v1/store-messages` trả về toàn bộ bản ghi override (`messages` + `updatedAt`) cho ứng dụng web nhân viên. Endpoint này chỉ dùng `@UseGuards(JwtAuthGuard)` — **mở cho mọi tài khoản đã đăng nhập** (tương tự `GET /api/v1/mdm/lookup`, **không** đòi hỏi `settings.view`, tuân thủ **Hard Invariant 8**) vì thu ngân hay nhân viên kho không có quyền mở `/settings` vẫn phải nhìn thấy các thông báo đã tuỳ chỉnh.

- **D29 — Lưu Đồng bộ Transaction & Realtime:**
  - `PUT /api/v1/settings` nhận thêm trường tuỳ chọn `messages?: Record<string, { title?: string; description?: string }>`.
  - Khi lưu có `messages`: `StoreSettingsService.updateSettings()` khoá dòng `store_settings` và `store_messages` (theo thứ tự chuẩn `ORDER BY id ASC FOR UPDATE` hoặc qua key cố định theo quy chuẩn lock một bảng chống deadlock của **Invariant 5**), kiểm tra `expectedUpdatedAt` (`409 STORE_SETTINGS_CONFLICT`), validate toàn bộ key/độ dài/biến placeholder, upsert `store_messages`, ghi Audit Log module `'SETTINGS'` (chỉ log danh sách key thay đổi + before/after ngắn gọn, không phình log), rồi phát Socket `store-settings:updated`.
  - Frontend `SocketProvider` khi nhận `store-settings:updated` sẽ invalidate cả `['store-settings']`, `['store-messages']`, và `['audit-logs', 'SETTINGS']`.

- **D30 — Kiểm tra Biến Placeholder & Bảo mật Plain Text:**
  - Mọi giá trị sửa (`title` tối đa 80 ký tự, `description` tối đa 300 ký tự) đi qua `PlainText`. Render thuần dạng React text (`textContent` / toast string), **tuyệt đối không** dùng `dangerouslySetInnerHTML`.
  - Trình kiểm tra `validateMessagePlaceholders(key, value)` (dùng chung ở `@fnb/shared`, frontend form và backend `updateSettings`):
    - Phân tích mọi cặp dấu `{token}` trong chuỗi người dùng nhập.
    - Từ chối ngay nếu phát hiện: ngoặc `{` hoặc `}` đứng lẻ không đóng/mở khớp; biến `{abc}` không nằm trong `MESSAGE_CATALOG[key].variables`.
    - Cho phép bỏ qua 1 số biến không muốn hiển thị trong câu (tối ưu sự linh hoạt diễn đạt cho chủ quán), nhưng **nghiêm cấm** tự chế biến lạ gây lỗi hiển thị `{abc}` thô ra UI. Khi có biến không hợp lệ, trả về HTTP 400 (`ErrorCodes.VALIDATION_FAILED`) kèm danh sách biến hợp lệ của key đó.
  - Khi cả `title` và `description` đều trống (hoặc bấm `"Khôi phục mặc định"`), xoá key đó khỏi map `messages` thay vì lưu object rỗng.

- **D31 — Xử lý Lỗi từ Server (`SYSTEM_ERRORS` — `error.<ErrorCode>`):**
  - Danh mục `SYSTEM_ERRORS` đăng ký toàn bộ các mã trong `ErrorCodes` (`packages/shared/src/constants/error-codes.ts` — 35 mã từ `AUTH_TOKEN_MISSING` đến `STORE_SETTINGS_CONFLICT`).
  - Mặc định trong catalog, các mục `error.<ErrorCode>` có `title: null, description: null`.
  - Nếu chủ quán chưa sửa → UI hiển thị nguyên văn `err.message` server trả về (giữ nguyên mọi thông báo chi tiết động từ server như khoảng cách GPS, tên món trùng, thông tin hạn mức…).
  - Nếu chủ quán đã sửa `error.<ErrorCode>` (ví dụ `RBAC_PERMISSION_DENIED`, `POS_TABLE_NOT_AVAILABLE`, `QR_WIFI_REQUIRED`…) → `resolveErrorMessage(err, fallbackTitle)` ưu tiên dùng bản dịch tuỳ chỉnh của chủ quán (hỗ trợ cả toast lỗi 403 tự động tại `apps/web-app/src/lib/api-client.ts`).

- **D32 — Tổ chức UI trên `/settings` (Tab thứ 7 `"Thông báo"` + nhúng trong Tab `"Trang khách QR"`):**
  - Thêm tab thứ 7 `"Thông báo"` (`value="messages"`) vào `StoreSettingsPage` cùng 1 nút `"Lưu cấu hình"` chung của trang.
  - Giao diện chỉnh sửa thông báo tách thành component tái sử dụng `MessageCatalogEditor` (`apps/web-app/src/features/store-settings/components/message-catalog-editor.tsx`):
    - Thanh công cụ: ô tìm kiếm theo từ khoá/tên/nội dung mặc định + nút lọc `"Chỉ hiện mục đã sửa (N)"` + bộ lọc module.
    - Nhóm Accordion theo module; mỗi mục hiển thị nhãn ngữ cảnh + huy hiệu loại (`Toast` · `Banner cố định` · `Màn hình chặn` · `Hộp thoại`) + input `Tiêu đề` + input `Nội dung` (placeholder = nguyên văn mặc định) + chip biến `{var}` bấm để chèn tại vị trí con trỏ + nút `"Xem thử Toast"` (với mục `toast`) + nút `"Khôi phục"`.
  - Tại tab `"Trang khách QR"` (`value="qr"`): nhúng sẵn `<MessageCatalogEditor fixedModule="QR_CUSTOMER" ... />` dùng chung state `draft.messages` với tab `"Thông báo"`, giúp chủ quán cấu hình đồng nhất màn hình khách quét QR tại cùng một chỗ.

---

## 3. Hợp đồng Dữ liệu (`@fnb/shared`)

### 3.1 `packages/shared/src/constants/message-catalog.ts` (Mới)
```ts
export const MessageModuleValues = [
  'QR_CUSTOMER',
  'POS',
  'MENU',
  'INVOICES',
  'INVENTORY',
  'CASHFLOW',
  'PAYMENT_QR',
  'EMPLOYEES',
  'SCHEDULES',
  'PAYROLL',
  'MDM',
  'RBAC',
  'SETTINGS',
  'AUTH_PROFILE',
  'SYSTEM_ERRORS',
] as const;
export type MessageModule = (typeof MessageModuleValues)[number];

export const MessageKindValues = ['toast', 'banner', 'block', 'dialog'] as const;
export type MessageKind = (typeof MessageKindValues)[number];

export interface MessageCatalogEntry {
  module: MessageModule;
  kind: MessageKind;
  label: string;
  title: string | null;
  description: string | null;
  variables: readonly string[];
}

export const MESSAGE_CATALOG = {
  // === QR_CUSTOMER ===
  'qr.banner.tableMoveNotice': {
    module: 'QR_CUSTOMER',
    kind: 'banner',
    label: 'Banner cảnh báo đổi bàn trên header trang khách QR',
    title: 'Quý khách chuyển bàn vui lòng thông báo với lễ tân',
    description: null,
    variables: [],
  },
  'qr.block.wifiTitle': {
    module: 'QR_CUSTOMER',
    kind: 'block',
    label: 'Màn hình chặn khi chưa kết nối Wi-Fi quán',
    title: 'Vui lòng kết nối Wi-Fi của quán',
    description: null, // null = dùng thông báo chi tiết từ server
    variables: [],
  },
  'qr.block.geoOutOfRangeTitle': {
    module: 'QR_CUSTOMER',
    kind: 'block',
    label: 'Màn hình chặn khi khách ở ngoài bán kính GPS cho phép',
    title: 'Ngoài phạm vi đặt món tại bàn',
    description: null,
    variables: [],
  },
  'qr.block.geoRequiredTitle': {
    module: 'QR_CUSTOMER',
    kind: 'block',
    label: 'Màn hình yêu cầu bật định vị GPS tại bàn',
    title: 'Xác nhận vị trí tại quán',
    description: null,
    variables: [],
  },
  'qr.block.invalidQr': {
    module: 'QR_CUSTOMER',
    kind: 'block',
    label: 'Màn hình khi mã QR không hợp lệ hoặc đã hết hạn',
    title: 'Mã QR không hợp lệ hoặc đã hết hạn',
    description: 'Vui lòng liên hệ nhân viên phục vụ để được hỗ trợ.',
    variables: [],
  },
  'qr.status.pending': {
    module: 'QR_CUSTOMER',
    kind: 'banner',
    label: 'Banner trạng thái sau khi khách vừa gửi đơn (chờ xác nhận)',
    title: 'Đã gửi đơn, vui lòng chờ thu ngân xác nhận',
    description: null,
    variables: [],
  },
  'qr.status.serving': {
    module: 'QR_CUSTOMER',
    kind: 'banner',
    label: 'Banner trạng thái khi bếp đang chế biến',
    title: 'Bếp đang chế biến món ăn của quý khách',
    description: null,
    variables: [],
  },
  'qr.status.paid': {
    module: 'QR_CUSTOMER',
    kind: 'banner',
    label: 'Banner trạng thái sau khi hoàn tất thanh toán',
    title: 'Cảm ơn quý khách và hẹn gặp lại!',
    description: null,
    variables: [],
  },
  'qr.status.voided': {
    module: 'QR_CUSTOMER',
    kind: 'banner',
    label: 'Banner trạng thái khi đơn hàng bị huỷ',
    title: 'Đơn hàng đã bị huỷ',
    description: null,
    variables: [],
  },
  'qr.status.redirectNotice': {
    module: 'QR_CUSTOMER',
    kind: 'banner',
    label: 'Banner thông báo bàn của khách vừa được thu ngân chuyển bàn',
    title: 'Đơn hàng của bạn đã được chuyển sang {newTableLabel}.',
    description: null,
    variables: ['newTableLabel'],
  },
  'qr.order.submitted': {
    module: 'QR_CUSTOMER',
    kind: 'toast',
    label: 'Toast khi khách gửi gọi món thành công',
    title: 'Đã gửi đặt món thành công',
    description: 'Lượt gọi #{batchNo} tại {tableLabel}',
    variables: ['batchNo', 'tableLabel'],
  },
  'qr.order.submitFailed': {
    module: 'QR_CUSTOMER',
    kind: 'toast',
    label: 'Toast lỗi khi không thể gửi đơn QR',
    title: 'Không thể gửi đơn',
    description: '{error}',
    variables: ['error'],
  },
  'qr.wifi.copied': {
    module: 'QR_CUSTOMER',
    kind: 'toast',
    label: 'Toast khi khách bấm chép mật khẩu Wi-Fi',
    title: 'Đã sao chép mật khẩu Wi-Fi',
    description: null,
    variables: [],
  },
  'qr.modifier.minMainDishRequired': {
    module: 'QR_CUSTOMER',
    kind: 'toast',
    label: 'Cảnh báo chọn tối thiểu 1 thành phần trong nhóm thay thế',
    title: 'Cần giữ lại ít nhất 1 đồ ăn chính',
    description: 'Nhóm "{groupName}" phải giữ tối thiểu 1 thành phần để thay thế cho các món bỏ chọn.',
    variables: ['groupName'],
  },
  // ... (Đầy đủ các entries phủ toàn bộ ~200+ toast, banner, block, dialog xác nhận nghiệp vụ và 35 mã ErrorCodes `error.<ErrorCode>`)
} as const satisfies Record<string, MessageCatalogEntry>;

export type MessageKey = keyof typeof MESSAGE_CATALOG;
```

**Hàm thuần xuất từ `@fnb/shared`:**
- `isValidMessageKey(key: string): key is MessageKey`
- `extractPlaceholders(text: string): { tokens: string[]; hasUnbalancedBraces: boolean }`
- `validateMessagePlaceholders(key: MessageKey, text: string): { valid: boolean; invalidTokens: string[]; hasUnbalancedBraces: boolean }`
- `interpolateMessageTemplate(template: string, vars?: Record<string, string | number | null | undefined>): string` (thay `{key}` bằng `String(val ?? '')`, giữ an toàn text thuần)
- `resolveStoreMessage(key: MessageKey, overrides?: StoreMessagesMap, vars?: Record<string, string | number | null | undefined>): { title: string; description?: string }`
- `sanitizeStoreMessages(raw: unknown): StoreMessagesMap` (lọc key không tồn tại, xoá entry có cả `title` & `description` rỗng/undefined).

### 3.2 Mở rộng `packages/shared/src/schemas/store-settings.schema.ts`
- `StoreMessageOverrideSchema = z.object({ title: PlainText(80).optional(), description: PlainText(300).optional() }).strict()`.
- `StoreMessagesMapSchema`: record keyed by valid `MessageKey`, kiểm tra placeholder qua `superRefine` với thông báo lỗi tiếng Việt rõ biến hợp lệ.
- `PublicStoreSettingsResponseSchema`: mở rộng thêm `qrMessages: StoreMessagesMap` (default `{}`).
- `UpdateStoreSettingsSchema`: mở rộng thêm `messages: StoreMessagesMapSchema.optional()`.
- `StoreMessagesResponseSchema`: `{ messages: StoreMessagesMap, updatedAt: string | null }`.

---

## 4. Thay đổi Backend (`apps/api-server/src/modules/store-settings/`)

1. **`store-settings.service.ts`:**
   - Hằng mới `STORE_MESSAGES_NORMALIZED_NAME = 'store_messages'`, `STORE_MESSAGES_DISPLAY_NAME = 'Danh mục Thông báo Tuỳ chỉnh'`.
   - Helper `extractQrMessages(messages)`: chỉ trích xuất các key thuộc `MESSAGE_CATALOG[k].module === 'QR_CUSTOMER'`.
   - `getPublicSettings()`: đọc thêm dòng `SYSTEM_CONFIG / store_messages` trong cùng `findMany`, gán `qrMessages: extractQrMessages(messages)` vào response.
   - `getMessages()`: đọc dòng `SYSTEM_CONFIG / store_messages` (thiếu/lỗi → `{ messages: {}, updatedAt: null }` kèm `warn` log) phục vụ nhân viên đã đăng nhập.
   - `updateSettings(rawInput, actorId)`:
     - Trong cùng `this.prisma.$transaction(...)`: khoá các dòng trong `master_data` theo `ORDER BY id ASC FOR UPDATE` (chuẩn **Hard Invariant 5** chống deadlock), kiểm tra `expectedUpdatedAt` trên `store_settings` (`409 STORE_SETTINGS_CONFLICT`), nếu payload có `messages`: validate `StoreMessagesMapSchema` (sai biến `{...}` → 400 `VALIDATION_FAILED` kèm danh sách biến hợp lệ), `sanitizeStoreMessages()`, upsert `SYSTEM_CONFIG / store_messages` với cùng `nextUpdatedAt`.
     - Ghi Audit Log `module: 'SETTINGS'` có `changedMessageKeys` (tên key thêm/sửa/xoá) nếu có thay đổi thông báo.
     - Phát `this.posSocketGateway?.emitStoreSettingsUpdated({ version: nextUpdatedAt })`.
2. **`store-settings.controller.ts`:**
   - Thêm endpoint:
     ```ts
     @Get('store-messages')
     @UseGuards(JwtAuthGuard)
     getMessages() {
       return this.storeSettingsService.getMessages();
     }
     ```
     (Chỉ yêu cầu `JwtAuthGuard`, **không** gắn `@RequirePermission` — giống `MdmController.lookup` chuẩn **Hard Invariant 8**).

---

## 5. Thay đổi Frontend (`apps/web-app/`)

### 5.1 Shared Hook & Resolver (Đặt ở `src/hooks` & `src/lib`, tuân thủ Invariant 1)
1. **`apps/web-app/src/hooks/use-app-messages.ts` (Mới):**
   - `STORE_MESSAGES_QUERY_KEY = ['store-messages'] as const`.
   - `useStoreMessagesQuery()`: fetch `GET /api/v1/store-messages`, `enabled: Boolean(accessToken)`, `staleTime: 60_000`.
   - Cache fallback ở `localStorage['store_messages_cache']` (tương tự `store_settings_cache`, **KHÔNG** xoá khi logout chuẩn Invariant 9).
   - Cung cấp `useAppMessages()`:
     - `resolveMessage(key, vars?)`: tự lấy override từ `storeMessages` (nếu đã đăng nhập) hoặc `settings.qrMessages` (nếu là màn hình khách QR chưa đăng nhập) → ghép `MESSAGE_CATALOG[key]` + thay biến `vars`.
     - `notify(key, vars?, options?: { variant?; duration? })`: bọc `toast(...)` hiển thị thông báo đã resolve.
     - `resolveErrorMessage(error, fallbackKey, vars?)`: kiểm tra `ApiClientError.code` → tra `error.<code >` nếu có trong override và được chủ quán sửa → ngược lại dùng `error.message` nguyên văn từ server (hoặc fallback default).
   - Export thêm helper `getResolvedErrorFromCache(error, fallbackTitle)` cho tầng không gọi React hook được (như `api-client.ts`).
2. **`apps/web-app/src/providers/socket-provider.tsx` & `apps/web-app/src/features/store-settings/api/store-settings.api.ts`:**
   - Khi nhận socket `store-settings:updated` hoặc lưu thành công `PUT /api/v1/settings`, invalidate thêm `['store-messages']` và cập nhật `store_messages_cache`.
3. **`apps/web-app/src/lib/api-client.ts`:**
   - Toast lỗi `403` tự động (`Không đủ quyền truy cập (403)`) đọc từ `resolveErrorFromStoreCache('error.RBAC_PERMISSION_DENIED', ...)` và fallback text chuẩn nếu chưa custom.

### 5.2 Áp dụng Toàn bộ UI (QR Khách + Quản trị + Hộp thoại Xác nhận)
1. **Trang khách QR (`qr-order-page.tsx`, `use-qr-session-socket.ts`, `modifier-selector-sheet.tsx`):**
   - Banner `qr.banner.tableMoveNotice` (`"Quý khách chuyển bàn vui lòng thông báo với lễ tân"`), 4 màn hình chặn/lỗi QR (`qr.block.*`), status banners (`qr.status.*`), GPS permission errors (`qr.gps.*`) và 4 lời gọi `toast` sử dụng `resolveMessage` / `notify` đọc từ `settings.qrMessages`.
2. **Toàn bộ `toast(...)` trong `apps/web-app/src/features/*` (~200 lời gọi ở ~30 file):**
   - Chuyển dần có hệ thống theo từng nhóm module sang `notify(key, vars, { variant })` và `resolveErrorMessage(err, ...)`:
     - Nhóm 1: `pos-counter` (`pos-unified-page.tsx`, `table-manage-dialog.tsx`, `qr-security-config-dialog.tsx`, `pos-menu-panel.tsx`, `live-invoice-panel.tsx`, `use-pos-cashier-socket.ts`).
     - Nhóm 2: `menu` & `payment-qr` (`menu-management-page.tsx`, `station-manage-dialog.tsx`, `category-manage-dialog.tsx`, `product-form-drawer.tsx`, `payment-qr-page.tsx`).
     - Nhóm 3: `invoices`, `inventory`, `cashflow` (`invoices-page.tsx`, `invoice-detail-modal.tsx`, `inventory-page.tsx`, `inventory-import-drawer.tsx`, `edit-inventory-import-dialog.tsx`, `cashflow-page.tsx`, `default-budget-dialog.tsx`).
     - Nhóm 4: `employees`, `schedules`, `payroll`, `master-data`, `rbac`, `profile`, `store-settings`.
3. **Hộp thoại Xác nhận Nghiệp vụ (`DialogTitle` / `DialogDescription`):**
   - Nối các dialog xác nhận/cảnh báo nghiệp vụ quan trọng (EC-POS-03 huỷ món bếp & huỷ đơn, chuyển/gộp/hoán đổi bàn, bù chênh lệch kết ca, duyệt/sửa thanh toán hoá đơn, đồng bộ Excel / xoá món, tắt/xoá QR thanh toán, xoá/ngưng nhân sự, xoá phiếu nhập kho, cảnh báo chưa lưu chấm công) vào key `kind: 'dialog'` tương ứng.
4. **Kiểm soát hồi quy bằng test quét source:**
   - Thêm test tĩnh quét toàn bộ file non-test trong `apps/web-app/src/features/`: **không** còn lời gọi `toast({` truyền `title:` dạng chuỗi literal cứng (bắt buộc đi qua `notify` / `resolveMessage`).

### 5.3 Giao diện Cấu hình trên `/settings`
1. **Component `apps/web-app/src/features/store-settings/components/message-catalog-editor.tsx` (Mới):**
   - Props: `messages`, `onChange`, `canUpdate`, `fixedModule?: MessageModule` (nếu có thì ẩn thanh lọc module, chỉ hiện module đó).
   - Cho phép tìm kiếm tiếng Việt không dấu (re-use `matchesVietnameseQuery` hoặc helper chuẩn hiện có), lọc `"Chỉ hiện mục đã sửa"`, bấm chip `{variable}` để chèn vào ô đang focus, kiểm tra lỗi placeholder realtime ngay dưới từng ô input và vô hiệu hoá lưu nếu có lỗi cú pháp biến, bấm `"Xem thử"` để gọi thử pop-up `toast` bằng nội dung đang soạn, nút `"Khôi phục"` từng mục và `"Khôi phục nhóm"`.
2. **`store-settings-page.tsx`:**
   - Nạp thêm `useStoreMessagesQuery()` khi mở `/settings`; hợp nhất `draft.messages` vào payload `PUT /api/v1/settings` và theo dõi `isDirty` / validation trước khi submit.
   - Bổ sung Tab thứ 7 `"Thông báo"` (render `<MessageCatalogEditor />` đầy đủ 15 module) và nhúng `<MessageCatalogEditor fixedModule="QR_CUSTOMER" />` ở nửa dưới Tab `"Trang khách QR"`.
   - Bổ sung responsive horizontal scroll cho `TabsList` (7 tab không vỡ/tràn trên Mobile 390px và Tablet 768px).

---

## 6. Tiêu chí Nghiệm thu

- **AC-17.1:** Sửa `qr.banner.tableMoveNotice` thành `"Cần đổi bàn xin báo nhân viên!"` → lưu trên `/settings` → tải lại trang `/qr/:token` thấy ngay banner mới; payload `GET /api/v1/public/store-settings` chỉ chứa override `qrMessages`, không chứa các thông báo nội bộ của trang quản trị.
- **AC-17.2:** Sửa thông báo tách bếp (`pos.splitKitchen.success`) bằng tài khoản `superadmin` → tài khoản `cashier01` (chỉ có quyền `pos`, **không** có `settings.view`) gọi được `GET /api/v1/store-messages` (HTTP 200) và khi bấm `"Tách Bếp"` thấy đúng tiêu đề/nội dung đã sửa (với đúng `{count}` biến thay thế). Chưa đăng nhập gọi `GET /api/v1/store-messages` nhận **401 Unauthorized** (Invariant 8).
- **AC-17.3:** Nhập chuỗi chứa biến sai `{tenKhongTonTai}` hoặc ngoặc lẻ `{abc` → UI chặn lưu & hiển thị rõ các biến hợp lệ; gọi trực tiếp API `PUT /api/v1/settings` với `{abc}` cũng bị từ chối với HTTP 400.
- **AC-17.4:** Chỉnh sửa `error.RBAC_PERMISSION_DENIED` → khi tài khoản thiếu quyền kích hoạt lỗi 403, toast hiển thị thông điệp mới; khi để mặc định (chưa sửa), server message nguyên văn được giữ nguyên.
- **AC-17.5:** Bấm `"Khôi phục mặc định"` tại 1 mục rồi lưu → key đó bị **xoá hoàn toàn** khỏi dòng `SYSTEM_CONFIG / store_messages` trong DB; UI hiển thị lại nguyên văn từ `MESSAGE_CATALOG`.
- **AC-17.6:** Sửa chuỗi trong `QR_CUSTOMER` từ Tab `"Trang khách QR"` và chuyển sang Tab `"Thông báo"` → nhìn thấy cùng trạng thái chỉnh sửa ngay (shared form state).
- **AC-17.7:** Khi mở POS trên máy thứ 2 và Admin lưu sửa thông báo → Socket `store-settings:updated` kích hoạt invalidate `['store-messages']`, máy POS thứ 2 nhận văn bản mới không cần F5.
- **AC-17.8:** Đăng xuất → `store_messages_cache` và `ui_preferences` không bị xoá nhầm; toàn bộ XSS `<script>` trong text tuỳ chỉnh chỉ render dạng text thuần.
- **AC-17.9:** Test quét source xác nhận toàn bộ `features/*` không còn `toast({` với `title:` hardcoded literal; mọi key trong `MESSAGE_CATALOG` đều có cấu trúc hợp lệ và mỗi biến trong `title`/`description` mặc định khớp chính xác với mảng `variables`.
- **AC-17.10:** Audit Log module `'SETTINGS'` ghi nhận thay đổi của `messages`, locking 409 vẫn hoạt động đồng bộ khi 2 tab admin sửa cùng lúc.
- **AC-17.11:** `pnpm -r typecheck`, `pnpm -r test`, `pnpm -r lint`, `pnpm -r build` pass 100%; kiểm thử trình duyệt thực tế across Desktop (1440×900), Tablet (768×1024), Mobile (390×844), Sáng & Tối, với cả `superadmin` và `cashier01`.

---

## 7. Kế hoạch Thực hiện (TDD — Chia theo Giai đoạn)

1. **`@fnb/shared`:** Xây dựng `message-catalog.ts` (audit & đăng ký đầy đủ 15 module + 35 `ErrorCodes`), helper validate/interpolate, mở rộng `store-settings.schema.ts` + viết test toàn vẹn catalog (mọi `{var}` trong default text phải nằm trong `variables`) → `pnpm --filter @fnb/shared test`.
2. **Backend (`api-server`):** Cập nhật `StoreSettingsService` (`store_messages`, `qrMessages`, `getMessages()`, lock & audit chung transaction), thêm `GET /api/v1/store-messages` trên `StoreSettingsController`, bổ sung unit test service & controller (kể cả test 401 khi không token và 200 với user không có `settings.view`) → `pnpm --filter api-server test`.
3. **Frontend Core (`web-app`):** Xây dựng `hooks/use-app-messages.ts`, cập nhật `socket-provider.tsx`, `api-client.ts`, `store-settings.api.ts` + unit test resolver/error mapping.
4. **Migration Messages theo Batch Module (`web-app`):**
   - Batch A: `qr-order` (`qr-order-page.tsx`, `use-qr-session-socket.ts`, `modifier-selector-sheet.tsx`) → test `qr-order`.
   - Batch B: `pos-counter` (toasts + operational dialogs) → test `pos-counter`.
   - Batch C: `menu` + `payment-qr` → test từng feature.
   - Batch D: `invoices` + `inventory` + `cashflow` → test từng feature.
   - Batch E: `employees` + `schedules` + `payroll` + `master-data` + `rbac` + `profile` + `store-settings` → test từng feature + source-scan guard test.
5. **UI `/settings` (`message-catalog-editor.tsx`, Tab 7 `"Thông báo"`, nhúng ở Tab `"Trang khách QR"`):** Tạo editor, tích hợp form & dirty/validation state + viết test trong `store-settings.test.tsx`.
6. **Kiểm chứng tổng thể:** `pnpm -r typecheck && pnpm -r test && pnpm -r lint && pnpm -r build` + kiểm thử trình duyệt thực tế (`superadmin` + `cashier01` + `/qr/:token`, 3 viewport, Sáng/Tối).
