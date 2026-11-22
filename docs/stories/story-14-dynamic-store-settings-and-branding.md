# Story 14: Cài đặt Cửa hàng Động — Branding, Theme, Phiếu in & Tên Menu (`store-settings`)

## 1. Mục tiêu Nghiệp vụ
Gỡ bỏ toàn bộ branding đang hard-code (`ĂN VẶT TRAN`, `/images/logo-icon.jpg`, màu `rose` viết cứng) và cho phép chủ quán tự cấu hình qua giao diện `/settings`:
1. Thông tin quán: tên hiển thị, sub-title, mô tả.
2. Logo & Favicon (upload ảnh, lưu trong PostgreSQL).
3. Giao diện: 1 màu thương hiệu sinh tự động cho Sáng/Tối, theme mặc định cấp quán.
4. Trang khách quét QR: ghi đè logo/tên/sub-title, dòng chào mừng, theme riêng.
5. Phiếu in nhiệt 80mm (tạm tính + hoá đơn): tên in, địa chỉ, SĐT, footer, bật/tắt in logo.
6. Đổi tên hiển thị các mục menu sidebar quản trị.

**Ngoài phạm vi (đã khoá):** CMS/i18n toàn bộ nhãn UI; chỉnh nền/viền/card; đổi icon/thứ tự/ẩn menu; đổi H1 trong từng trang; di chuyển QR Security và Ngân sách mặc định vào `/settings`; phiếu bếp.

## 2. Các Quyết định Đã Khoá (D1–D16)
- **D1 — Phạm vi:** Mức B (Branding + Theme). Không xây CMS.
- **D2 — Lưu trữ cấu hình:** Tái dùng mẫu của `QrSecurityService`: 1 dòng `master_data` với `category = SYSTEM_CONFIG`, `normalized_name = 'store_settings'`, toàn bộ cấu hình nằm trong `metadata` JSONB, được kiểm tra bằng `StoreSettingsSchema` (Zod) ở `@fnb/shared`. **Không có migration.** Thiếu dòng hoặc metadata lỗi → trả `DEFAULT_STORE_SETTINGS`.
- **D3 — Lưu trữ ảnh:** Mỗi ảnh là 1 dòng `master_data` riêng (`SYSTEM_CONFIG` / `store_logo`, `store_favicon`, `store_qr_logo`), `metadata = { mime, base64, byteSize, updatedAt }`. Không nhét ảnh vào JSON cấu hình, để payload `GET public/store-settings` luôn nhỏ.
- **D4 — Giới hạn ảnh:** Server chỉ nhận PNG/JPEG/WebP (kiểm tra **magic bytes**, không tin `mime` client gửi). Logo/QR logo ≤ 512KB, favicon ≤ 128KB sau khi decode. **Cấm SVG** (rủi ro XSS).
- **D5 — Xử lý ảnh ở client:** Dùng Canvas để thu nhỏ trước khi gửi (logo/QR logo cạnh dài ≤ 512px → WebP; favicon 64×64 → PNG). Input chấp nhận PNG/JPEG/WebP/ICO. Gửi JSON base64, **không thêm multer/sharp**.
- **D6 — Phục vụ ảnh:** `GET /api/v1/public/store-assets/:kind?v=<updatedAt>` trả binary kèm `Content-Type` đúng mime, `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`. URL có `v` nên khi đổi ảnh tự vô hiệu cache. Chưa có ảnh → 404, frontend hiển thị placeholder (chữ cái đầu của tên quán trên nền `primary`).
- **D7 — Theme màu:** 1 color picker `brandColor` (`#RRGGBB`). Frontend sinh `--primary`, `--ring`, `--primary-foreground` cho `:root` và `.dark` (bản tối tăng lightness ~+4%), tự chọn chữ trắng/đen theo tương phản WCAG ≥ 4.5:1. Không đổi các biến khác. Đồng thời rà ~110 dòng `rose|red|orange-*` viết cứng: màu thương hiệu → `primary`, màu huỷ/cảnh báo → `destructive` hoặc giữ nguyên nếu mang nghĩa trạng thái.
- **D8 — Sáng/Tối:** Giữ lựa chọn riêng của từng nhân viên (Invariant 9). Thêm `defaultTheme: 'light' | 'dark'` (áp cho trang Login và user chưa từng chọn) và `qr.theme: 'light' | 'dark' | 'system'` cho trang khách QR.
- **D9 — Chống nháy (FOUC):** Frontend render ngay bằng cache `localStorage['store_settings_cache']`, song song gọi `GET /api/v1/public/store-settings` để cập nhật. Lần đầu chưa có cache thì `index.html` hiển thị title `POS` và không có favicon riêng. Khi đăng xuất **KHÔNG** xoá cache này (giống `ui_preferences`). Xoá mọi chuỗi `ĂN VẶT TRAN` khỏi source; giá trị hiện tại chuyển thành dữ liệu seed.
- **D10 — RBAC:** Thêm `settings: { view, update }` vào `UserPermissionsSchema` (mặc định `false`). `normalizeLegacyPermissions`: nếu `settings` chưa có và `rbac.update === true` → cấp `{ view: true, update: true }`. Thêm ô tương ứng ở màn hình phân quyền. `GET public/*` không cần đăng nhập; `GET /settings` cần `settings.view`; `PUT` cần `settings.update` (401/403 theo Invariant 8).
- **D11 — Audit:** Thêm `'SETTINGS'` vào `AuditModuleValues`. Mỗi lần lưu cấu hình hoặc đổi/xoá ảnh ghi Audit Log (before/after; với ảnh chỉ ghi `kind`, `byteSize`, `mime`, **không ghi base64**).
- **D12 — Realtime & chống ghi đè:** Sau khi lưu, server phát Socket.io `store-settings:updated` với payload `{ version }` (không gửi dữ liệu) tới các client POS đã xác thực → client invalidate query. Trang QR không nghe socket. `PUT` gửi kèm `expectedUpdatedAt`; nếu khác bản trong DB → `409 STORE_SETTINGS_CONFLICT`.
- **D13 — Phiếu in:** `receipt.printName` (để trống = dùng `storeName`), `address`, `phone`, `footerNote` (≤ 200 ký tự, cho phép xuống dòng), `showLogo` (mặc định `false`). Áp cho `provisional-vietqr-slip` và `official-receipt-slip`. Phiếu bếp giữ nguyên.
- **D14 — Bố cục UI:** Feature mới `features/store-settings`, route `/settings`, 1 trang 6 tab: Thông tin quán · Logo & Favicon · Giao diện · Trang khách QR · Phiếu in · Tên menu. Tab Phiếu in có xem trước trực tiếp. Có 1 nút Lưu chung cho cả trang (ảnh upload riêng, lưu ngay khi chọn).
- **D15 — Tên menu:** `navLabels: Record<path, string>` (≤ 40 ký tự; để trống/xoá key = tên mặc định; có nút khôi phục). Áp cho sidebar, Command Palette và `document.title = "<Tên menu> · <Tên quán>"`. Key không khớp route nào trong `APP_NAVIGATION_ROUTES` thì bỏ qua khi render và bị loại khi lưu.
- **D16 — Trang QR & mô tả:** `qr.storeName`, `qr.subtitle` (để trống = dùng giá trị chung), `qr.logo` qua asset `store_qr_logo` (không có thì dùng `store_logo`), `qr.welcomeMessage` (≤ 160 ký tự, chữ thuần). `description` (≤ 300 ký tự) hiển thị ở trang Login và gán vào `<meta name="description">`. `subtitle` (≤ 80 ký tự) hiển thị dưới logo ở sidebar, top-navbar và trang QR.

## 3. Hợp đồng Dữ liệu (`packages/shared/src/schemas/store-settings.schema.ts`)
```ts
const PlainText = (max: number) => z.string().trim().max(max); // render dạng text, không bao giờ dangerouslySetInnerHTML
const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const ThemeMode = z.enum(['light', 'dark']);

export const StoreSettingsSchema = z.object({
  storeName: PlainText(60).min(1),
  subtitle: PlainText(80),
  description: PlainText(300),
  brandColor: HexColor,
  defaultTheme: ThemeMode,
  qr: z.object({
    storeName: PlainText(60),
    subtitle: PlainText(80),
    welcomeMessage: PlainText(160),
    theme: z.enum(['light', 'dark', 'system']),
  }).strict(),
  receipt: z.object({
    printName: PlainText(60),
    address: PlainText(160),
    phone: PlainText(20),
    footerNote: PlainText(200),
    showLogo: z.boolean(),
  }).strict(),
  navLabels: z.record(z.string().startsWith('/'), PlainText(40).min(1)),
}).strict();

export const StoreAssetKindSchema = z.enum(['logo', 'favicon', 'qr-logo']);

// Response công khai = settings + phiên bản ảnh (null = chưa có)
export const PublicStoreSettingsResponseSchema = StoreSettingsSchema.extend({
  updatedAt: z.string().datetime().nullable(),
  assets: z.object({ logo: z.string().nullable(), favicon: z.string().nullable(), qrLogo: z.string().nullable() }),
});

export const UpdateStoreSettingsSchema = StoreSettingsSchema.extend({
  expectedUpdatedAt: z.string().datetime().nullable(),
});

export const UploadStoreAssetSchema = z.object({
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  base64: z.string().min(1),
});
```
**Seed `DEFAULT_STORE_SETTINGS`:** `storeName: 'Ăn Vặt Tran'`, `receipt.printName: 'QUÁN ĂN VẶT TRAN'`, `brandColor` = màu tương đương `346.8 77.2% 49.8%` hiện tại (`#E11D48`), `defaultTheme: 'light'`, `qr.theme: 'system'`, các trường còn lại rỗng, `navLabels: {}`. Không seed ảnh (file `logo-icon.jpg` hiện tại 750KB, vượt giới hạn D4) → chủ quán upload lại qua UI.

## 4. API (module mới `apps/api-server/src/modules/store-settings`)
| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/v1/public/store-settings` | Công khai | Settings + version ảnh. `Cache-Control: no-cache` |
| GET | `/api/v1/public/store-assets/:kind` | Công khai | Binary ảnh (D6) |
| GET | `/api/v1/settings` | `settings.view` | Giống bản public (để form dùng chung) |
| PUT | `/api/v1/settings` | `settings.update` | Lưu toàn bộ, chống ghi đè (D12), audit, phát socket |
| PUT | `/api/v1/settings/assets/:kind` | `settings.update` | Upload ảnh (D4), audit, phát socket |
| DELETE | `/api/v1/settings/assets/:kind` | `settings.update` | Xoá ảnh → về placeholder |

Body JSON của `PUT assets` có thể tới ~700KB → nâng body limit **chỉ cho route này** lên `1mb`, các route khác giữ mặc định.
Mã lỗi: `400 STORE_ASSET_INVALID_TYPE`, `413 STORE_ASSET_TOO_LARGE`, `409 STORE_SETTINGS_CONFLICT`.

## 5. Các điểm thay hard-code ở Frontend
| File | Thay đổi |
|---|---|
| `index.html` | Title `POS`, bỏ `<link rel="icon">` cố định |
| `components/layout/resizable-sidebar.tsx`, `top-navbar.tsx` | Logo/tên/sub-title + `navLabels` |
| `components/layout/command-palette.tsx` | Áp `navLabels` |
| `features/profile/components/login-page.tsx` | Logo/tên/mô tả, theme `defaultTheme` |
| `features/qr-order/components/qr-order-page.tsx` | Override QR + welcome + `qr.theme` |
| `components/print-slips/provisional-vietqr-slip.tsx`, `official-receipt-slip.tsx` | Header/footer phiếu (D13) |
| `providers/theme-provider.tsx` | Tiêm biến CSS từ `brandColor` |
| Mới: `providers/store-settings-provider.tsx` (hoặc hook `useStoreSettings` trong `src/hooks`) | Cache localStorage + query + listener socket + cập nhật `document.title`/favicon/meta |

Hook `useStoreSettings` dùng chung cho nhiều feature nên **phải** đặt ở `src/hooks` hoặc `src/providers` (Invariant 1: cấm import chéo giữa các feature).

## 6. Tiêu chí Nghiệm thu
- **AC-14.1:** `pnpm -r typecheck` và `pnpm -r test` pass. `grep -ri "ĂN VẶT TRAN\|logo-icon"` trong `apps/web-app/src` và `index.html` trả về 0 kết quả (trừ seed/test fixtures).
- **AC-14.2:** Chưa có dòng `store_settings` → `GET public/store-settings` trả default; metadata hỏng → trả default kèm log `warn`, không 500.
- **AC-14.3:** Upload SVG, hoặc file PNG bị đổi đuôi thành text → 400; logo 513KB → 413; favicon PNG hợp lệ → 200 và `assets.favicon` đổi version.
- **AC-14.4:** `GET public/store-assets/logo?v=…` trả đúng `Content-Type`, header `immutable` và `nosniff`; chưa có ảnh → 404, UI hiện placeholder chữ cái đầu.
- **AC-14.5:** Không token → 401; có token nhưng thiếu `settings.update` → 403; user cũ có `rbac.update` tự động có `settings.update`.
- **AC-14.6:** Hai admin cùng mở form, A lưu trước, B lưu sau với `expectedUpdatedAt` cũ → B nhận 409 và UI báo "Cấu hình đã bị người khác thay đổi, tải lại?".
- **AC-14.7:** Lưu thành công → máy POS thứ hai đang mở cập nhật tên/logo/màu trong vòng ≤ 2s mà không cần reload.
- **AC-14.8:** Đổi `brandColor` sang màu sáng (`#FACC15`) → `--primary-foreground` tự đổi sang chữ tối, tương phản ≥ 4.5:1 ở cả Sáng và Tối.
- **AC-14.9:** Đăng xuất → `store_settings_cache` và `ui_preferences` vẫn còn; reload trang Login hiển thị ngay branding đã cache.
- **AC-14.10:** Đổi `navLabels['/pos'] = 'Bán hàng'` → sidebar, Command Palette và tab trình duyệt hiển thị "Bán hàng · <Tên quán>". Lưu key `/khong-ton-tai` → bị loại khi lưu.
- **AC-14.11:** Phiếu tạm tính và hoá đơn hiển thị `printName`, địa chỉ, SĐT, footer nhiều dòng; `showLogo = false` → không có thẻ `<img>`. Phiếu bếp không đổi (snapshot test giữ nguyên).
- **AC-14.12:** Chuỗi `<script>alert(1)</script>` trong `welcomeMessage` hiển thị nguyên văn dạng text, không thực thi.
- **AC-14.13:** Audit Log module `SETTINGS` có bản ghi cho mỗi lần lưu/upload/xoá, không chứa base64.

## 7. Kế hoạch Thực hiện (TDD)
1. `@fnb/shared`: schema + permission `settings` + `AuditModule 'SETTINGS'` + test schema → verify: `pnpm --filter @fnb/shared test`.
2. Backend `StoreSettingsService` (get/default/update/conflict, asset validate magic bytes) + controller + socket emit + test (AC-14.2 → 14.6, 14.13).
3. Frontend core: hook/provider, cache localStorage, sinh màu theme + test tương phản (AC-14.8, 14.9).
4. Thay hard-code 8 vị trí + rà màu `rose/red/orange` (AC-14.1, 14.10, 14.11, 14.12).
5. Trang `/settings` 6 tab + ô quyền `settings` ở màn hình RBAC + test UI.
6. `pnpm -r typecheck && pnpm -r test && pnpm -r lint`.

## 8. Câu hỏi Còn Mở
- Sau khi chủ quán upload logo mới, có xoá các file tĩnh `public/images/logo-icon.jpg` và `logo.jpg` không? (Đề xuất: xoá trong cùng PR vì sau story này không còn chỗ nào tham chiếu.)
