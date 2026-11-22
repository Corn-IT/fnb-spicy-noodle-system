# Story 19: Mở rộng Triển khai Vật lý Linh động — In Nhiệt Đa Nền tảng (`iMin D3-505` Android POS USB RawBT + `iPOS.vn iTP6` LAN `:9100` + Bung Két Tiền `RJ11`)

> **Story ID:** `STORY-19`  
> **Tên file:** `docs/stories/story-19-physical-thermal-printer-and-cash-drawer.md`  
> **Phạm vi:** Out-of-Scope Hardware Deployment Extension (Triển khai vật lý đa thiết bị)  
> **Thiết bị mục tiêu:** Máy POS để bàn 2 màn hình **iMin D3-505 (`I20D02`, Android 11)** + Máy in hoá đơn nhiệt **iPOS.vn iTP6 (Khổ 80mm, `250mm/s`, Auto-cutter, `Serial & USB & Ethernet`, `ESC/POS`)** + **Két đựng tiền `RJ11 24V === 1A`**.  
> **Quy tắc bất biến áp dụng:** Hard Invariant 1 (Cô lập Module), Hard Invariant 3 (Cắt rời tối đa 3 phiếu bếp), Hard Invariant 4 (Đợi ảnh VietQR tải xong trước khi gửi lệnh in), Hard Invariant 5 (Tuyệt đối không giữ khoá DB khi gọi socket in LAN), Hard Invariant 8 (RBAC 401 vs 403), Hard Invariant 9 (Giữ cấu hình thiết bị in trong `localStorage` khi thu ngân đăng xuất đổi ca).

---

## 1. HỒ SƠ PHẦN CỨNG THỰC TẾ TẠI QUÁN

### 1.1. Máy POS Quầy Thu Ngân: `iMin D3-505` (`Kiểu máy: I20D02`)
- **Hệ điều hành:** Android 11 (iMin UI), IP LAN `192.168.1.2`.
- **Đặc điểm:** Không có máy in nhiệt tích hợp trong thân máy; kết nối với máy in nhiệt rời qua cổng **USB Type-A** hoặc mạng **LAN RJ45 / Wi-Fi**.
- **Hạn chế của Chrome trên Android 11:** Không hỗ trợ cờ `--kiosk-printing` (luôn bật hộp thoại Android Print Spooler nếu gọi `window.print()`) và giới hạn quyền WebUSB trực tiếp tới USB Printer Class `0x07`.

### 1.2. Máy In Nhiệt Hoá Đơn & Bếp: `iPOS.vn iTP6`
- **Khổ giấy:** `80mm` (vùng in chuẩn `72mm` = `576 dots` / `72 bytes/dòng` ở độ phân giải `203 DPI`), có dao cắt giấy tự động (**Auto-cutter**).
- **Tập lệnh:** Chuẩn **`ESC/POS`**.
- **Sơ đồ 5 chân cắm phía sau máy `iPOS.vn iTP6` (Từ trái qua phải):**
  1. **Cổng 1 (Tròn 3 chân — ĐANG CẮM):** Nguồn DC `24V === 2.5A` (kèm lõi lọc nhiễu ferrite).
  2. **Cổng 2 (DB9 9 chân — ĐỂ TRỐNG):** Cổng `Serial (RS-232)`.
  3. **Cổng 3 (Vuông USB Type-B — ĐANG CẮM):** Cáp **USB** nối trực tiếp vào cổng USB-A của máy POS **`iMin D3-505`**.
  4. **Cổng 4 (RJ45 8 chân — ĐỂ TRỐNG):** Cổng mạng **`Ethernet (LAN TCP :9100)`** dự phòng mở rộng.
  5. **Cổng 5 (RJ11 nhỏ — ĐANG CẮM):** Dây kích mở **Két đựng tiền (`Cash Drawer 24V === 1A`)** đặt ngay bên dưới máy in.

---

## 2. KIẾN TRÚC KỸ THUẬT (`HYBRID MULTI-DRIVER PRINT ENGINE`)

### 2.1. 3 Chế độ Điều phối Lệnh In (`ThermalPrinterDriver`)
1. **`BROWSER` (Mặc định):** Gọi `window.print()` kết hợp CSS `@media print` — tương thích PC Windows/macOS chạy `--kiosk-printing`.
2. **`RAWBT_USB` (Android POS `iMin D3-505` cắm cáp USB vào Cổng 3 của `iPOS iTP6`):**
   - Mã hoá toàn bộ các khối `.ticket-page` trong `#thermal-print-container` sang chuỗi byte `ESC/POS` (Monochrome Raster `576 dots` chia dải `GS v 0` 128 dòng/dải).
   - Ưu tiên truyền thẳng qua **RawBT Local WebSocket (`ws://127.0.0.1:40213/`)** để in ngầm 1 chạm dưới 500ms; tự động fallback sang **`rawbt:base64,<payload>`** (Android URI Intent) nếu WebSocket nền chưa bật.
3. **`LAN_ESCPOS` (Cắm dây mạng RJ45 vào Cổng 4 của `iPOS iTP6`):**
   - Gửi chuỗi byte `ESC/POS` (Base64) qua API `POST /api/v1/pos/print/lan-escpos` để Backend đẩy trực tiếp qua `net.Socket` tới `IP_MÁY_IN:9100` (có lớp bảo vệ chống SSRF chỉ cho phép dải IP LAN RFC1918 và `127.0.0.1`).

### 2.2. Tự động Cắt Rời 3 Phiếu Bếp (`GS V 66 0`) & Bung Két Tiền (`ESC p 0 50 250`)
- Sau mỗi thẻ `.ticket-page` (ví dụ 3 phiếu `BEP_NAU`, `BEP_CHIEN`, `PHA_CHE` của `KitchenSplitSlip`), bộ encoder tự động chèn lệnh đẩy giấy `ESC d 4` (`0x1B 0x64 0x04`) và dao cắt tự động **`GS V 66 0` (`0x1D 0x56 0x42 0x00`)**.
- Khi in `OFFICIAL_RECEIPT` có thu tiền mặt (`paymentMethod === 'CASH' || paymentMethod === 'SPLIT'`) và bật `cashDrawerKick = true`, bộ encoder tự động đính kèm lệnh **`ESC p 0 50 250` (`0x1B 0x70 0x00 0x32 0xFA`)** để kích mở két tiền qua Cổng số 5 (`RJ11 24V`).

---

## 3. DANH SÁCH FILE TRIỂN KHAI

- [x] `packages/shared/src/schemas/order.schema.ts` — Schemas `ThermalPrinterDriverSchema`, `ThermalPrinterDeviceConfigSchema`, `LanEscPosPrintRequestSchema`, `LanEscPosPrintResponseSchema` và hàm chống SSRF `isAllowedLanPrinterHost()`.
- [x] `apps/api-server/src/modules/pos/thermal-lan-print.service.ts` — Dịch vụ kết nối TCP Socket `:9100` tới máy in nhiệt LAN (`iPOS iTP6` Cổng số 4).
- [x] `apps/api-server/src/modules/pos/pos.controller.ts` & `pos.module.ts` — Endpoint `POST /api/v1/pos/print/lan-escpos` bảo vệ bởi `JwtAuthGuard` và kiểm tra quyền RBAC.
- [x] `apps/web-app/src/components/print-slips/printer-config.store.ts` — Zustand store lưu cấu hình máy in theo từng thiết bị tại `localStorage` (`fnb-thermal-printer-device-config`), giữ nguyên khi đăng xuất (**Hard Invariant 9**).
- [x] `apps/web-app/src/components/print-slips/escpos-encoder.util.ts` — Bộ chuyển đổi DOM `.ticket-page` sang 1-bit Monochrome Raster (`576 dots`), chia dải `GS v 0`, cắt giấy `GS V 66 0` và phát xung mở két tiền `ESC p`.
- [x] `apps/web-app/src/components/print-slips/physical-print-transport.util.ts` — Bộ truyền tải lệnh in qua RawBT WebSocket (`ws://127.0.0.1:40213/`), RawBT Android Intent (`rawbt:base64,...`) và LAN TCP `:9100`.
- [x] `apps/web-app/src/components/print-slips/thermal-print-provider.tsx` — Điều phối đa chế độ in và cung cấp hàm `kickCashDrawerNow()`.
- [x] `apps/web-app/src/features/store-settings/components/printer-hardware-settings-panel.tsx` — Giao diện chọn chế độ kết nối máy in, cấu hình khổ giấy, bật/tắt tự bung két tiền và 2 nút **`[In phiếu kiểm tra kết nối (80mm)]`** / **`[Test bung két tiền (RJ11)]`** trong trang Cài đặt (`/settings` → Tab `Phiếu in`).
