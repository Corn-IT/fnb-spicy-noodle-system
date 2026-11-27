---
trigger: model_decision
description: Frontend React UX, POS core layout, Base Table (TanStack Table v8), and 80mm thermal receipt printing rules for apps/web-app.
---

# 04 — Frontend UX, POS Touch, Base Table & In nhiệt 80mm

> Áp dụng cho: Mọi Agent chỉnh sửa `apps/web-app/`. Đồng bộ với Stories 08–21 (`StoreSettings`, `PrintTemplates`, `MessageCatalog`, `Discounts`, `Physical Thermal Printer`, `POS Touch Shell & Hub`).

---

## 1. Core Layout, Store Settings Động & UI Preferences

### Sidebar & Navbar (Desktop Shell — `AppShell`)
- **Sidebar (trái):** Resizable (`180px–480px`), hỗ trợ thu gọn (`sidebarCollapsed`), tuỳ biến tên/thứ tự nhóm menu cấp cửa hàng (`navLabels`, `navGroupLabels`, `navOrder`, `navGroupOrder`) áp dụng cho mọi tài khoản. Các thứ tự cá nhân cũ trong `users.ui_preferences` được giữ nhưng không ghi đè cấu hình cửa hàng. **CHỈ** hiện màn hình mà user có quyền `view = true` (hoặc `isSuperAdmin`).
- **Navbar (trên):** Command Palette (`Ctrl+K` / `Cmd+K`, lọc tuyệt đối theo RBAC), chuyển nhanh POS Cảm ứng, điều khiển cảnh báo âm thanh/Web Push, Avatar dropdown (`Hồ sơ tài khoản`, `Đăng xuất`).
- **Trang Hồ sơ (`/profile`):** JOIN `employees` + `users`; `Chức vụ` & `Chuyên môn` readonly; cho phép sửa thông tin cá nhân/ngân hàng, tải/xoá Avatar (`/api/v1/profile/avatar`), đổi mật khẩu (`PATCH /api/v1/profile/password`), xem phiên hiện tại, và **Đặt lại loa và thanh bên**.
- **Cài đặt Cửa hàng Động (`/settings`):** Áp dụng động qua `StoreSettingsProvider` (`brandColor`, `primaryTextColor`, `accentTextColor`, `priceColor`, `pageHeaders`, `displayScale` `80%–150%`, `logo`/`favicon`/`qr-logo`, 5 mẫu `printTemplates`, `qrCard`, và `messages` catalog).

## 2. Logout Behavior (Hard Invariant 9)

Khi bấm Đăng xuất, thực hiện **ĐÚNG** thứ tự:
1. `queryClient.clear()` → xoá sạch bộ nhớ đệm API dữ liệu nghiệp vụ.
2. Xoá auth tokens & Zustand auth state (`auth.store.ts`).
3. **FORBIDDEN** xoá `ui_preferences` (`theme`, `sidebarWidth`, `columnWidths`, `displayScale`, `navOrder`, `navGroupOrder`, `sidebarCollapsed`, `voiceAlertEnabled`) khỏi `localStorage` và DB.
4. Khi tài khoản thay đổi `ui_preferences`, đồng bộ đa thiết bị qua `account:preferences_updated` và sync khi focus lại cửa sổ.

## 3. BaseTable Component (`apps/web-app/src/components/base-table/`)

- Xây dựng trên **TanStack Table v8** với `columnResizeMode: 'onChange'`, dùng **CSS Variables + `requestAnimationFrame`** (60fps, debounce `500ms` lưu vào `localStorage` & `PATCH /api/v1/profile/ui-prefs`).
- Hỗ trợ 2D touch pan mượt trên thiết bị di động/tablet và nâng cấp biến thể `touch-ui:` khi chạy trong Touch Shell.
- Hỗ trợ tìm kiếm tiếng Việt không dấu (chuẩn hoá đồng bộ với backend `f_search_norm`), bộ lọc kép tách bạch, phân trang server-side và xuất Excel (`src/lib/excel-export.ts`).
- **Lưu ý quy tắc phân biệt tìm kiếm ở `/inventory`:** Thanh tìm kiếm trên BaseTable dùng để **lọc lịch sử**; Combobox trong Drawer bên phải dùng để **tìm/tạo mới Nguyên liệu & Nhà cung cấp** qua `GET /api/v1/mdm/lookup`.
- **Master Data (`/master-data`):** Quản trị 7 danh mục chuẩn hoá (`POSITION`, `SPECIALTY`, `INGREDIENT`, `UNIT`, `SUPPLIER`, `MENU_CATEGORY`, `KITCHEN_STATION`).
- **Phân quyền (`/rbac`):** Tách riêng **Drawer Thông tin tài khoản** (`PUT /api/v1/users/:id`) và **Drawer Phân quyền** (`PUT /api/v1/users/:id/permissions`); hàng Super Admin luôn readonly/disabled.
- **Toast & Overlays:** Bấm tắt toast góc màn hình **KHÔNG** được làm đóng Dialog/Drawer/Dropdown đang mở (`utils/toast-target.ts`).

## 4. POS Desktop (`/pos`) & POS Cảm ứng Touch Shell (`/pos/touch/*`)

### 4.1. POS Desktop Split-View (`/pos`)
- Trái: Sơ đồ bàn (`AVAILABLE` / `PENDING` / `OCCUPIED`) + khu Mang về (`MV-#`) và Thực đơn 3 tầng động (Cấp cay, Size M/L, Auto-Check, Đổi món chính, Topping, cờ `Gói mang về` từng món).
- Phải: `LiveInvoicePanel` theo từng lượt gọi (`batch_no`), áp/gỡ giảm giá, `[Tách đơn]`, `[In lại bếp]`, `[Chuyển/Gộp/Đổi bàn/Mang về]`, `[In tạm tính / Tạm tính tách đơn]`, `[Thanh toán / Tách thanh toán]`. Khi đơn không còn `PENDING`/`SERVING`, bắt buộc khoá/ẩn toàn bộ nút thao tác ghi.
- Giỏ chưa gửi có thể bắt đầu từ bàn, từ Mang về hoặc chưa gán bàn; phải có mục riêng để lưu/resume/xoá giỏ đã lưu trên mọi máy POS. Draft hiển thị giá hiện tại để tham khảo nhưng backend chỉ chốt giá mới nhất lúc tạo đơn. Trước khi gửi phải chọn bàn vật lý còn trống hoặc Mang về. Draft không chiếm trạng thái bàn hay xuất hiện trong danh sách đơn/QR khách. Khi TAKEAWAY được MOVE/MERGE vào bàn, các món chuyển phải có `is_takeaway = false` để phiếu bếp không còn nhãn `[MANG VỀ]`.
- Với đơn TAKEAWAY đang mở, thao tác bàn trên invoice gọi nhãn **`Gán bàn`** và mở picker MOVE hiện có; tiếp tục dùng kiểm tra bàn trống và flow in thông báo đổi bàn đã có.

### 4.2. POS Cảm ứng Toàn màn hình kiểu iPOS (`/pos/touch/*` — Stories 20 & 21)
- Kích hoạt chế độ kiosk (`data-pos-touch="true"`, Tailwind variant `touch-ui:`, Screen Wake Lock), ẩn Sidebar/Navbar của `AppShell`.
- **Sơ đồ 4 Tab trên `/pos/touch`:**
  - `Tất cả` *(mặc định)*: Ô `+ Đơn mang về mới`, một ô `Giỏ chưa gán bàn` → các thẻ `Mang về #NN` → các thẻ `Bàn 01..N`. Ô `Giỏ chưa gán bàn` chỉ xuất hiện một lần trong lưới.
  - `Phòng bàn`: Chỉ lưới bàn vật lý.
  - `Mang về`: Ô `+ Đơn mang về mới`, một ô `Giỏ chưa gán bàn` + đơn mang về đang phục vụ. Ô `Giỏ chưa gán bàn` chỉ xuất hiện một lần trong lưới.
  - `Lưu tạm`: Ô `Giỏ chưa gán bàn` ở đầu lưới, sau đó là danh sách giỏ đã lưu; hiển thị số lượng và empty state, chọn thẻ để resume hoặc xoá theo quyền. Ô tạo giỏ chỉ xuất hiện một lần.
- `Giỏ chưa gán bàn` mở giỏ mới chưa gán đích; có ở `Tất cả`, `Mang về` và `Lưu tạm`, không có ở `Phòng bàn`. Sau khi lưu thành công, POS Touch tự chuyển sang tab `Lưu tạm`. Draft dùng cùng state hook với Desktop và không tạo `orders` trước khi bấm gửi.
- **TouchShellLayout & Thanh đáy 4 nút (`Bán hàng · Hoá đơn · Kết ca · Quản lý`):** Tự động ẩn khi ở màn gọi món/tính tiền (`TouchOrderScreen`).
- **Trung tâm Quản lý (`/pos/touch/hub`) & 2 màn cảm ứng chuyên biệt:**
  - `/pos/touch/stock-status`: Báo hết món & topping 1 chạm (`menu` permission).
  - `/pos/touch/printer`: Cấu hình máy in & mở két tiền (`pos.view`, nút **Mở két tiền** bắt buộc xác nhận 2 bước + quyền `pos.openCashDrawer`).
  - Tái sử dụng các màn sẵn có qua `React.lazy()` trong `router.tsx` (tuân thủ Invariant 1): `/pos/touch/dashboard`, `/pos/touch/invoices`, `/pos/touch/cashflow`, `/pos/touch/inventory`, `/pos/touch/menu`, `/pos/touch/discounts`, `/pos/touch/payment-qr`, `/pos/touch/settings`, `/pos/touch/profile`.

## 5. QR Order Page (`/q/:token` & `/qr/:token` — Mobile-first)

- Hỗ trợ cả đường dẫn ngắn `/q/:token`, đường dẫn đầy đủ `/qr/:token`, và **QR Mang về** (`guestSessionToken`).
- Không yêu cầu JWT; hỗ trợ kiểm tra Wi-Fi/GPS (`QrSecurityService`).
- Lắng nghe Socket.io: `order:status_updated`, `order:session_redirected`, `order:qr_auto_cancelled`, `qr:order_notice` (thông báo tức thời tự tắt sau ~6s, nút `✕` `>= 44×44px`, không replay sau F5), `table:qr_rotated` (khoá phiên QR cũ tức thì), `menu:updated`, `store-settings:updated`, và đồng bộ lại khi quay về foreground (`visibilitychange`).
- **TanStack Query `networkMode: 'always'`:** Khi mất mạng không treo nút gửi, báo toast lỗi rõ ràng và bảo toàn giỏ hàng.

## 6. In nhiệt 80mm Đa Nền tảng & 5 Mẫu Phiếu Tuỳ biến (Stories 16 & 19)

### 3 Chế độ In Vật lý (`src/components/print-slips/`):
1. **Browser Kiosk (`BROWSER`):** `#thermal-print-container` + `@page { size: 80mm auto; margin: 0; }` + `break-after: page` + Chrome/Edge `--kiosk-printing`.
2. **Android POS USB (`RAWBT`):** Cho máy `iMin D3-505` (Android 11) cắm cáp USB tới máy in nhiệt `iPOS.vn iTP6` (80mm / 576 dots) qua RawBT Print Service, gửi byte ESC/POS trực tiếp.
3. **LAN ESC/POS (`LAN_ESCPOS`):** Gửi payload ESC/POS qua `POST /api/v1/pos/print/lan-escpos` tới IP máy in cổng TCP `:9100`.
- Hỗ trợ xung lệnh mở két tiền `RJ11 24V` (`ESC p`) qua RawBT / LAN ESC/POS (chỉ kích hoạt khi có quyền `pos:openCashDrawer`).

### 5 Mẫu Phiếu Chuẩn (Cấu hình động qua `storeSettings.printTemplates`, cỡ chữ `6pt–16pt` bước `0.5pt`):
1. `kitchen` — Phiếu tách bếp cắt rời từng trạm (`BEP_NAU`, `BEP_CHIEN`, `PHA_CHE`, `BEP_*`, nhãn `GỌI THÊM - LƯỢT N`, nhãn `[MANG VỀ]`).
2. `tableTransfer` — Phiếu thông báo đổi/gộp/chuyển bàn (`EC-POS-04`).
3. `kitchenCancel` — Phiếu báo huỷ món đã in bếp (`EC-POS-06` Nhánh B).
4. `provisional` — Phiếu tạm tính kèm mã VietQR động xoay vòng (giữ nguyên `SERVING` — Invariant 4).
5. `official` — Hoá đơn thanh toán chính thức (`PAID`, cấm in lại hoá đơn `VOIDED`).

## 7. Unsaved Changes Guard (`/schedules`)

- Bắt buộc duy trì đồng thời: `window.addEventListener('beforeunload', ...)` + React Router navigation blocker + hộp thoại xác nhận khi đổi tuần chưa lưu.

## Chính sách cấu hình cửa hàng dùng chung

- Theme, display scale (80–150%, gồm điện thoại và Touch POS), thứ tự menu/nhóm luôn lấy từ Store Settings; không dùng override cá nhân cũ. Giữ dữ liệu `ui_preferences` và hành vi logout.
- QR khách dùng `qr.theme`; `system` theo OS và cập nhật khi OS đổi. Không có nút theme riêng.
- Settings và danh mục thông báo authenticated refresh khi socket connect/reconnect, trở lại foreground/online và mỗi 60 giây foreground; giữ cache khi offline. Giữ draft quản trị và phiên bản `expectedUpdatedAt` của draft cho 409.
- Chỉ Super Admin chỉnh/khôi phục phần cứng tại Settings và Touch Printer; tài khoản khác in bằng cấu hình có sẵn, quyền mở két giữ nguyên. Cấu hình local theo origin/browser profile, đồng bộ tab, giữ khi đổi tài khoản/logout; đây là UI permission, không chống DevTools.
- Nội dung/cấu hình giọng nói chung ở Settings; bật/tắt loa cá nhân ở profile và toolbar.
