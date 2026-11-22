# Story 15: Tuỳ chỉnh Màu Chữ Nhấn, Màu Đơn Giá & Tiêu đề / Mô tả Trang (`store-settings-v2`)

> **Trạng thái:** Chờ duyệt · **Tiền đề:** Kế thừa toàn bộ kiến trúc & quyết định D1–D16 của [Story 14](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/docs/stories/story-14-dynamic-store-settings-and-branding.md) và [Kế hoạch Store Settings v2](file:///c:/Users/ngomi/.gemini/antigravity/brain/76068e25-6871-454a-9151-0ea7e5701023/implementation_plan_store_settings_v2.md).

---

## 1. Mục tiêu Nghiệp vụ

Cho phép chủ quán cá nhân hoá sâu hơn lớp hiển thị chữ, giá tiền và đầu trang quản trị trên `/settings` mà **không phá vỡ** cấu hình đã lưu từ Story 14:

1. **Màu chữ nhấn (`accentTextColor`):** Tách màu của nhãn, icon nhấn, badge/link đang ăn theo `--primary` (`text-primary`) ra khỏi màu nền nút bấm (`brandColor`), hỗ trợ cặp màu Sáng / Tối độc lập hoặc theo `brandColor`.
2. **Màu đơn giá (`priceColor`):** Tuỳ chỉnh riêng màu hiển thị cho các con số đơn giá / số tiền đang ăn theo màu chủ đạo trên POS, Trang khách QR, Thực đơn, Hoá đơn, Kho, Kết ca, Bảng lương (giữ nguyên màu trạng thái nghiệp vụ như tiền mặt/thặng dư xanh lục hay thiếu két/xoá/cảnh báo đỏ).
3. **Tiêu đề & Mô tả trang (`pageHeaders`):** Đổi tên tab `"Tên menu"` thành `"Menu & Tiêu đề trang"` cho phép chỉnh 3 giá trị độc lập trên mỗi route: `Tên menu` (sidebar / Ctrl+K / tab trình duyệt) · `Tiêu đề trang (H1)` · `Mô tả trang (subtitle)`, đồng thời chuẩn hoá header cho toàn bộ các trang (gồm cả `/pos` và `/payment-qr`).

**Ngoài phạm vi Story 15:** Phiếu in nhiệt 80mm 5 mẫu (thuộc **Story 16**); Danh mục thông báo pop-up / toast / banner / dialog (thuộc **Story 17**); đổi màu nền, card, viền hay màu trạng thái semantic (`emerald`, `amber`, `rose`/`destructive`).

---

## 2. Các Quyết định Đã Khoá (D17–D21)

- **D17 — Mô hình 3 token màu (`brandColor`, `accentTextColor`, `priceColor`):**
  - `brandColor` (`#RRGGBB`): tiếp tục điều khiển `--primary`, `--primary-foreground`, `--ring` (nút bấm, nền nhấn, viền focus).
  - `accentTextColor` (`{ light: string | null, dark: string | null }`): điều khiển biến `--accent-text` (`text-accent-text`). Mặc định `light: null, dark: null` (kế thừa `--primary` của chế độ tương ứng).
  - `priceColor` (`{ light: string | null, dark: string | null }`): điều khiển biến `--price` (`text-price`). Mặc định `light: null, dark: null` (kế thừa `--primary` của chế độ tương ứng).
  - Quy tắc Sáng/Tối: nếu `light` có giá trị `#RRGGBB` và `dark === null`, frontend tự tính bản Tối bằng cách tăng lightness `+4%` (giới hạn `≤ 84%`) giống hệt công thức `buildStoreThemeVariables()` hiện tại; nếu cả `light` và `dark` đều có giá trị, dùng đúng từng màu đã chọn; nếu `light === null` nhưng `dark` có giá trị, Sáng dùng `--primary` (light) và Tối dùng `dark`.
  - Cảnh báo tương phản WCAG: tính tương phản của `--accent-text` và `--price` trên nền `--card` ở cả chế độ Sáng (`0 0% 100%`) và Tối (`222.2 41% 11.5%`); hiển thị cảnh báo mềm nếu `< 4.5:1` nhưng vẫn cho phép lưu.

- **D18 — Tương thích ngược Schema `.strict()` (`mergeStoreSettingsWithDefaults`):**
  - Do `StoreSettingsSchema` dùng `.strict()`, mọi bản ghi JSONB cũ (v1 trong bảng `master_data` dòng `SYSTEM_CONFIG / store_settings` hoặc `localStorage['store_settings_cache']`) thiếu các trường mới sẽ bị `safeParse()` từ chối và rơi về `DEFAULT_STORE_SETTINGS` (làm mất tên quán, màu, footer cũ của chủ quán).
  - **Bắt buộc** bổ sung helper `mergeStoreSettingsWithDefaults(candidate)` trong `@fnb/shared` thực hiện deep-merge an toàn từ `DEFAULT_STORE_SETTINGS` sang dữ liệu cũ trước khi chạy `.safeParse()`. Cả `StoreSettingsService.parseSettingsMetadata()` (backend) và `readCachedStoreSettings()` (frontend) đều gọi helper này.

- **D19 — Rà soát & Phân loại `text-primary`:**
  - Chia toàn bộ ~100+ vị trí `text-primary` (trừ `text-primary-foreground` và các class nền/viền `bg-primary`, `border-primary`, `ring-primary`) trong `apps/web-app/src` thành 2 nhóm:
    1. Con số tiền tệ / đơn giá → chuyển sang `text-price`.
    2. Nhãn, icon nhấn, tiêu đề phụ, link button (`button.tsx` variant `link`) → chuyển sang `text-accent-text` (kể cả các modifier như `hover:text-accent-text`, `group-hover:text-accent-text`).
  - Các con số mang màu trạng thái cố định (`text-emerald-*` thu/tiền mặt/hồ sơ đạt, `text-rose-*` chi két/thiếu hụt/cảnh báo, `text-amber-*` thừa két, `text-blue-*`/`text-purple-*` KPI thống kê QR thanh toán) **không** đổi sang `text-price`.
  - Phiếu in nhiệt đen trắng (`print-slips/*`) dùng `#000`/`#fff`, không bị ảnh hưởng bởi CSS token màu.

- **D20 — Chuẩn hoá `<PageHeader />` & Tiêu đề/Mô tả động:**
  - Component dùng chung `apps/web-app/src/components/layout/page-header.tsx`: nhận `path`, `defaultTitle`, `defaultSubtitle`, `defaultSubtitleNode` (optional `React.ReactNode` để giữ nguyên subtitle reactive trên `/cashflow` và `/payroll` khi chưa custom), `icon`, `actions`, và `hideWhenDefault?: boolean`.
  - Nếu `pageHeaders[path]?.title` khác rỗng → hiển thị chuỗi tuỳ chỉnh; ngược lại hiển thị `defaultTitle`.
  - Nếu `pageHeaders[path]?.subtitle` khác rỗng → hiển thị chuỗi tuỳ chỉnh dạng plain text; ngược lại hiển thị `defaultSubtitleNode ?? defaultSubtitle` (nếu có; các trang chưa có subtitle mặc định sẽ ẩn subtitle cho tới khi chủ quán nhập).
  - Thêm `<PageHeader />` vào `/pos` (`hideWhenDefault = true` — giữ nguyên giao diện POS tối đa không gian khi chủ quán chưa nhập tuỳ chỉnh; chỉ hiện thanh header khi `title` hoặc `subtitle` được nhập) và `/payment-qr` (hiện mặc định trên 4 thẻ KPI).
  - Đổi tên tab `"Tên menu"` → `"Menu & Tiêu đề trang"` trên `/settings`; mỗi dòng trong `ALLOWED_STORE_NAV_PATHS` hiển thị 3 ô input độc lập (`Tên menu`, `Tiêu đề trang H1`, `Mô tả trang`) và 1 nút `"Mặc định"` để khôi phục cả dòng.

- **D21 — Không có Database Migration:**
  - Giữ nguyên kiến trúc D2: dữ liệu `accentTextColor`, `priceColor`, `pageHeaders` lưu chung trong JSONB `metadata` của dòng `SYSTEM_CONFIG / store_settings` trong bảng `master_data`. RBAC (`settings.view`, `settings.update`), Audit Log (`SETTINGS`), Optimistic Concurrency (`409 STORE_SETTINGS_CONFLICT`), Socket (`store-settings:updated`), Cache (`store_settings_cache`, giữ nguyên khi logout chuẩn Invariant 9) không thay đổi.

---

## 3. Hợp đồng Dữ liệu (`packages/shared/src/schemas/store-settings.schema.ts`)

```ts
export const ColorOverrideSchema = z
  .object({
    light: HexColorSchema.nullable(),
    dark: HexColorSchema.nullable(),
  })
  .strict();

export const PageHeaderOverrideSchema = z
  .object({
    title: PlainText(80),
    subtitle: PlainText(200),
  })
  .strict();

// Mở rộng StoreSettingsSchema (giữ nguyên toàn bộ trường v1):
export const StoreSettingsSchema = z
  .object({
    storeName: PlainText(60).min(1, 'Tên cửa hàng không được để trống'),
    subtitle: PlainText(80),
    description: PlainText(300),
    brandColor: HexColorSchema,
    accentTextColor: ColorOverrideSchema,
    priceColor: ColorOverrideSchema,
    defaultTheme: ThemeModeSchema,
    qr: z.object({ /* giữ nguyên v1 */ }).strict(),
    receipt: z.object({ /* giữ nguyên v1 */ }).strict(),
    navLabels: z.record(NavPathSchema, PlainText(40).min(1, 'Tên menu không được để trống')),
    pageHeaders: z.record(NavPathSchema, PageHeaderOverrideSchema),
  })
  .strict();
```

**Hàm dùng chung mới tại `packages/shared/src/schemas/store-settings.schema.ts` (re-export qua `packages/shared/src/index.ts`):**
- `DEFAULT_STORE_SETTINGS`: bổ sung `accentTextColor: { light: null, dark: null }`, `priceColor: { light: null, dark: null }`, `pageHeaders: {}`.
- `NEUTRAL_STORE_SETTINGS`: đồng bộ thêm 3 trường mặc định tương tự.
- `sanitizeNavLabels(raw)`: giữ nguyên hành vi loại key ngoài `ALLOWED_STORE_NAV_PATHS` và chuỗi rỗng.
- `sanitizePageHeaders(raw)`: lọc bỏ key không thuộc `ALLOWED_STORE_NAV_PATHS`; với mỗi key hợp lệ, trim `title` và `subtitle`; nếu cả hai đều rỗng (`''`) thì loại bỏ key khỏi object để giữ JSON gọn.
- `mergeStoreSettingsWithDefaults(rawCandidate)`: deep-merge an toàn bản ghi cũ/thiếu trường (chỉ merge các trường plain-object hợp lệ vào khung `DEFAULT_STORE_SETTINGS`; không nuốt dữ liệu sai kiểu để `StoreSettingsSchema.safeParse()` vẫn phát hiện metadata hỏng thực sự như `{ brandColor: 'not-a-hex' }`).

---

## 4. Thay đổi Backend (`apps/api-server/src/modules/store-settings/`)

1. **`store-settings.service.ts`:**
   - Trong `parseSettingsMetadata(rawMetadata, isActive)`: gọi `mergeStoreSettingsWithDefaults(candidate)` trước `StoreSettingsSchema.safeParse(...)`; đồng thời áp `sanitizeNavLabels` và `sanitizePageHeaders`. Nếu `candidate` hỏng kiểu dữ liệu (VD `storeName: 999`), log `warn` và fallback `DEFAULT_STORE_SETTINGS` như AC-14.2.
   - Trong `updateSettings(rawInput, actorId)`: trim và sanitize cả `navLabels` và `pageHeaders` trước khi parse & lưu DB trong transaction `SELECT ... FOR UPDATE`; ghi Audit Log module `'SETTINGS'` chứa diff `before`/`after`; phát Socket `store-settings:updated`.
2. **Không thêm endpoint mới:** tái sử dụng `GET /api/v1/public/store-settings`, `GET /api/v1/settings`, `PUT /api/v1/settings`.

---

## 5. Theme Engine & Tailwind (`apps/web-app/`)

1. **`apps/web-app/src/utils/store-theme.ts`:**
   - Mở rộng `ThemeCssVariables` thêm `accentText: string` và `price: string` (định dạng `H S% L%` không bọc `hsl(...)` giống `primary`).
   - Mở rộng chữ ký `buildStoreThemeVariables(brandColor, accentTextColor?, priceColor?)`:
     - Hỗ trợ gọi 1 tham số (backward compatible cho các test cũ của Story 14).
     - `resolveTokenPairHsl(fallbackVars, override)`:
       - `light === null` → light dùng `fallbackVars.light.primary`; `dark` dùng `override.dark` nếu có, ngược lại dùng `fallbackVars.dark.primary`.
       - `light !== null` → light dùng `hexToHsl(override.light)`; `dark` dùng `override.dark ? hexToHsl(override.dark) : lightenForDark(lightHsl)` (`+4%` L, max `84%`).
   - `applyStoreThemeVariables(variables, mode)` & `syncDocumentThemeMode(mode, brandColor, accentTextColor?, priceColor?)`: tiêm `--accent-text` và `--price` cùng `--primary`, `--primary-foreground`, `--ring`.
2. **`apps/web-app/tailwind.config.js` & `apps/web-app/src/index.css`:**
   - `tailwind.config.js`: thêm `'accent-text': 'hsl(var(--accent-text))'` và `price: 'hsl(var(--price))'` trong `theme.extend.colors`.
   - `index.css`: thêm `--accent-text` và `--price` vào cả `:root` (`346.8 77.2% 49.8%`) và `.dark` (`346.8 77.2% 54%`) để tránh FOUC trước khi hydration.
3. **`apps/web-app/src/providers/theme-provider.tsx` & `apps/web-app/src/features/qr-order/components/qr-order-page.tsx`:**
   - Truyền thêm `settings.accentTextColor` và `settings.priceColor` vào `syncDocumentThemeMode(...)` (cả effect chính ở `ThemeProvider` và effect theme trang QR + cleanup restore).

---

## 6. Giao diện Frontend & Bảng Chuẩn hoá Tiêu đề Trang

### 6.1 Component `apps/web-app/src/components/layout/page-header.tsx` + `APP_NAVIGATION_ROUTES`
- Mở rộng interface `AppNavigationRoute` trong `apps/web-app/src/components/layout/command-palette.tsx` thêm `defaultPageTitle: string` và `defaultPageSubtitle?: string`.
- Thêm helper `resolvePageHeader(path, defaults, pageHeaders)` trong `apps/web-app/src/hooks/use-store-settings.ts`.
- Bảng ánh xạ toàn bộ các route (đối chiếu nguyên văn từ source hiện tại):

| Route | `defaultLabel` (Tên menu) | `defaultPageTitle` (H1 mặc định) | `defaultPageSubtitle` / Ghi chú |
|---|---|---|---|
| `/pos` | `Bán hàng POS` | `Bán hàng POS` | Không có subtitle mặc định · Header **ẩn khi mặc định**, chỉ hiện khi chủ quán tuỳ chỉnh H1 hoặc subtitle |
| `/menu` | `Quản trị Thực đơn` | `Quản trị Thực đơn & Phân cấp Tuỳ chọn Món` | `Quản lý đồng bộ 3 tầng: Khu vực Bếp → Danh mục con (MDM) → Sản phẩm (kèm Subtitle & Nhóm tuỳ chọn động) cho POS & QR.` |
| `/invoices` | `Quản lý Hoá đơn` | `Quản lý & Tra cứu Hoá đơn` | `Tra cứu lịch sử hoá đơn đã thanh toán, xem chi tiết các lượt gọi bếp, in lại bill nhiệt và điều chỉnh phương thức thanh toán theo quy trình duyệt.` |
| `/inventory` | `Nhập hàng Kho` | `Quản lý Nhập hàng Nguyên vật liệu` | `Tra cứu lịch sử nhập kho và mở Drawer bên phải để nhập hàng liên kết tự động với Master Data.` |
| `/cashflow` | `Ngân sách & Kết ca` | `Ngân sách, Dòng tiền & Đối soát Kết ca` | Subtitle động mặc định (`Ngân sách tiền lẻ mặc định đầu ca: <số tiền>`) qua `defaultSubtitleNode`; nếu chủ quán nhập custom subtitle thì hiển thị text tuỳ chỉnh |
| `/payment-qr` | `Mã QR thanh toán` | `Quản lý Mã QR Thanh toán (VietQR)` | Chưa có subtitle mặc định (ẩn tới khi nhập) |
| `/employees` | `Hồ sơ Nhân sự` | `Quản lý Hồ sơ Nhân sự` | Chưa có subtitle mặc định |
| `/schedules` | `Bảng tính ngày công` | `Bảng tính ngày công` | Chưa có subtitle mặc định |
| `/payroll` | `Bảng tính lương` | `Bảng tính lương` | Subtitle động mặc định hiển thị công thức & tham số tính lương qua `defaultSubtitleNode`; nếu nhập custom subtitle thì hiển thị text tuỳ chỉnh |
| `/master-data` | `Quản trị Master Data` | `Quản trị Master Data` | Chưa có subtitle mặc định |
| `/rbac` | `Phân quyền Hệ thống` | `Phân quyền Hệ thống` | Chưa có subtitle mặc định |
| `/settings` | `Cài đặt Cửa hàng` | `Cài đặt Cửa hàng` | `Tuỳ chỉnh tên cửa hàng, logo, favicon, màu thương hiệu, màn hình QR, phiếu in và tên menu.` |
| `/profile` | `Hồ sơ Tài khoản Cá nhân` | `Hồ sơ Tài khoản Cá nhân` | `Liên kết 1-1 giữa Tài khoản đăng nhập (users) và Hồ sơ Nhân sự (employees)` |

*(Lưu ý: Nếu `/profile` chưa nằm trong `ALLOWED_STORE_NAV_PATHS`, giữ đồng bộ giữa danh sách `ALLOWED_STORE_NAV_PATHS` trong `@fnb/shared` và các route được render ở `/settings` — không cho phép key ngoài danh sách hợp lệ.)*

### 6.2 Refactor `text-primary` → `text-price` & `text-accent-text`
- **Nhóm `text-price`** (con số giá món, đơn giá, thành tiền, tổng tạm tính, thực đếm tiền kết ca, tổng tiền nhập kho, tổng lương — hiện đang dùng `text-primary` trong các file như `live-invoice-panel.tsx`, `qr-order-page.tsx`, `pos-menu-panel.tsx`, `payroll-page.tsx`, `cashflow-page.tsx`, `inventory-page.tsx`, `inventory-import-drawer.tsx`, `edit-inventory-import-dialog.tsx`, `menu-management-page.tsx`, `product-form-drawer.tsx`, `invoices-page.tsx`, `invoice-detail-modal.tsx`, `split-order-items-dialog.tsx`, `checkout-confirm-dialog.tsx`, `modifier-selector-sheet.tsx`, v.v.).
- **Nhóm `text-accent-text`** (icon tiêu đề mục, badge check chọn lọc, chữ nhấn, liên kết `button.tsx` variant `link`, tên nhân viên/nhãn đang dùng `text-primary`, `hover:text-primary`, `group-hover:text-primary`).
- Bổ sung unit test tĩnh quét toàn bộ file `.ts`/`.tsx` (trừ test) trong `apps/web-app/src` đảm bảo **không** còn token class `text-primary` đứng riêng (chỉ cho phép `text-primary-foreground`).

### 6.3 Giao diện `/settings`
1. **Tab `"Giao diện"`:**
   - Thêm 2 section cấu hình: **Màu chữ nhấn (`accentTextColor`)** và **Màu đơn giá (`priceColor`)**.
   - Mỗi section có: nút chuyển `"Theo màu chủ đạo"` (reset `{ light: null, dark: null }`) vs `"Tuỳ chỉnh"`; 2 ô color picker + hex input cho chế độ **Sáng** và **Tối** (ô Tối có nút `"Tự động (+4% sáng)"` để set `null`); badge đo tỷ lệ tương phản với nền `--card` Sáng/Tối (cảnh báo khi `< 4.5:1`); thẻ xem trước mini hiển thị đồng thời trên nền Sáng và nền Tối: 1 nút `bg-primary`, nhãn + icon mẫu dùng `accentTextColor`, đơn giá `40.000 đ` dùng `priceColor`.
2. **Tab `"Menu & Tiêu đề trang"` (đổi từ `"Tên menu"`):**
   - Mỗi dòng route hiển thị thông tin route mặc định + 3 ô nhập (`Tên menu` max 40, `Tiêu đề trang H1` max 80, `Mô tả trang` max 200) + nút khôi phục mặc định cho cả dòng.
   - Bố cục responsive: xếp gọn trên Mobile 390px và Tablet 768px (`min-w-0`, không tràn ngang).

---

## 7. Tiêu chí Nghiệm thu

- **AC-15.1:** `mergeStoreSettingsWithDefaults()` đọc thành công metadata JSONB v1 (không có `accentTextColor`, `priceColor`, `pageHeaders`) và giữ nguyên toàn bộ `storeName`, `brandColor`, `qr`, `receipt`, `navLabels` đã lưu; metadata sai kiểu (`brandColor: 'not-a-hex'`) vẫn fallback `DEFAULT_STORE_SETTINGS` và log `warn`.
- **AC-15.2:** Chỉnh `priceColor` thành `#0D9488` (Light) / `#2DD4BF` (Dark), `accentTextColor` thành `#2563EB` (Light) / `#60A5FA` (Dark) trong khi giữ `brandColor = '#E11D48'`:
  - Nút bấm & sidebar active giữ màu `#E11D48`.
  - Mọi đơn giá ở POS (`/pos`), QR (`/qr/:token`), Thực đơn (`/menu`), Hoá đơn (`/invoices`), Kho (`/inventory`), Kết ca (`/cashflow`), Bảng lương (`/payroll`) đổi sang `#0D9488` (Light) và `#2DD4BF` (Dark).
  - Các con số trạng thái (tiền mặt/thặng dư emerald, chi két/thiếu két rose) giữ nguyên màu ngữ nghĩa.
- **AC-15.3:** Khi chọn `"Theo màu chủ đạo"` cho cả 2 token mới, giao diện Sáng & Tối **khớp 100%** với ảnh chụp trước nâng cấp.
- **AC-15.4:** Nếu chọn `accentTextColor.light = '#D97706'` và để trống `dark`, chế độ Tối tự sinh màu sáng hơn (+4% lightness); huy hiệu tương phản hiển thị đúng tỷ lệ `:1` và cảnh báo khi `< 4.5:1`.
- **AC-15.5:** Test quét source xác nhận không còn class `text-primary` đơn lẻ trong `apps/web-app/src` (ngoài `text-primary-foreground` và các test fixture).
- **AC-15.6:** Đổi `pageHeaders['/settings'] = { title: 'Thiết lập Quán', subtitle: 'Mô tả mới' }`: H1 và subtitle tại `/settings` cập nhật tức thì; sidebar, Ctrl+K và `document.title` vẫn dùng `navLabels['/settings']` (hoặc tên menu mặc định).
- **AC-15.7:** Đổi `pageHeaders['/pos']` → thanh `<PageHeader />` xuất hiện trên `/pos`; bấm khôi phục mặc định trên `/pos` → `<PageHeader />` ẩn đi trả lại 100% không gian bảng/bàn POS. Trên `/cashflow` và `/payroll`, khi để trống `subtitle` → subtitle động (ngân sách đầu ca / công thức lương) vẫn hiển thị bình thường; khi nhập custom subtitle → hiển thị nội dung custom.
- **AC-15.8:** Key `pageHeaders` ngoài `ALLOWED_STORE_NAV_PATHS` bị `sanitizePageHeaders()` loại bỏ khi lưu; mọi script tag trong `title`/`subtitle` hiển thị thuần dạng text (không XSS).
- **AC-15.9:** Audit Log module `'SETTINGS'`, locking `409 STORE_SETTINGS_CONFLICT`, và realtime Socket `store-settings:updated` hoạt động đầy đủ cho các trường mới.
- **AC-15.10:** `pnpm -r typecheck`, `pnpm -r test`, `pnpm -r lint`, `pnpm -r build` đạt exit code 0 và qua kiểm thử trình duyệt thực tế ở Desktop (1440×900), Tablet (768×1024), Mobile (390×844) ở cả Sáng & Tối.

---

## 8. Kế hoạch Thực hiện (TDD)

1. **`@fnb/shared`:** Thêm `ColorOverrideSchema`, `PageHeaderOverrideSchema`, mở rộng `StoreSettingsSchema`, `DEFAULT_STORE_SETTINGS`, `NEUTRAL_STORE_SETTINGS`, `sanitizePageHeaders`, `mergeStoreSettingsWithDefaults` + unit test (bao gồm hồi quy v1) → `pnpm --filter @fnb/shared test`.
2. **Backend (`api-server`):** Cập nhật `StoreSettingsService` dùng `mergeStoreSettingsWithDefaults` + `sanitizePageHeaders` + bổ sung test trong `store-settings.service.spec.ts` → `pnpm --filter api-server test`.
3. **Theme & Layout (`web-app`):** Cập nhật `store-theme.ts`, `tailwind.config.js`, `index.css`, `theme-provider.tsx`, `use-store-settings.ts`, `command-palette.tsx`, tạo `page-header.tsx` + unit test `store-theme` & `use-store-settings`.
4. **Refactor UI Toàn Hệ thống (`web-app`):** Áp `<PageHeader />` cho 13+2 trang; phân loại chuyển `text-primary` → `text-price` / `text-accent-text` + test quét source.
5. **Trang `/settings`:** Bổ sung 2 khối màu trong tab `"Giao diện"` + nâng cấp tab `"Menu & Tiêu đề trang"` + cập nhật `store-settings.test.tsx`.
6. **Kiểm chứng tổng thể:** `pnpm -r typecheck && pnpm -r test && pnpm -r lint && pnpm -r build` + kiểm thử Playwright/Browser thực tế (before/after parity + responsive + Sáng/Tối).
