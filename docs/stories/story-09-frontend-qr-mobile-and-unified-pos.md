# Story 09: Xây dựng Giao diện Khách Quét QR Đặt Món (`/qr/:token`) & Màn hình POS Hợp nhất (`pos-counter`)

> **Story ID:** `STORY-09`  
> **Tên file:** `docs/stories/story-09-frontend-qr-mobile-and-unified-pos.md`  
> **Phase thực thi:** Phase 5 (Frontend QR Guest & Unified POS Screen)  
> **Agent phụ trách:** Antigravity  
> **Phụ thuộc (Dependencies):** `story-01`, `story-04`, `story-05`, `story-08`  
> **Quy tắc bất biến áp dụng:** Hard Invariant 1 (Cô lập Module `qr-order` và `pos-counter`), Hard Invariant 2 (Đơn Mang về `MV-#` độc lập không chiếm bàn vật lý), Hard Invariant 3 (Nút `[Tách đơn]` disable chống double-click & chỉ tách món `NEW`), Hard Invariant 4 (Nút `[In tạm tính (QR)]` giữ `SERVING` vs Nút `[Thanh toán]` xác nhận 2 bước đóng `PAID`)  
> **Tài liệu tham chiếu:** `docs/bmad/01-PRD-Master.md` (§2.2, §3.1, §3.2), `docs/bmad/03-Edge-Cases-And-Invariants.md` (`EC-POS-01` → `EC-POS-06`, `EC-FIN-02`), `.agents/rules/04-frontend-ux-table-and-print.md` (§5, §6), `docs/architecture/04-audit-report.md` (`DISCREPANCY-SM-01`)

---

## 1. MỤC TIÊU (OBJECTIVES)

Hiện thực hoá 2 giao diện nghiệp vụ tiền tuyến quan trọng nhất của quán mì cay:
1. **Giao diện Khách Quét QR Đặt Món trên Điện thoại (`src/features/qr-order/` — Route `/qr/:token`):** Thiết kế Mobile-first tốc độ cao, không yêu cầu đăng nhập JWT, cho phép khách chọn món kèm **Cấp độ cay (0–7)** (Radio bắt buộc) và **Thêm Topping** (Checkbox cộng tiền), gửi đơn lần đầu hoặc gọi thêm món (Lượt 2, 3...), và lắng nghe Socket.io thời gian thực (`order:status_updated`, `order:session_redirected`) để tự động chuyển phiên sang bàn mới khi thu ngân đổi/gộp bàn mà không cần quét lại mã QR (`EC-POS-01`).
2. **Màn hình POS Hợp nhất tại Quầy (`src/features/pos-counter/` — Route `/pos`):** Thiết kế bố cục **Split-View 2 nửa màn hình**:
   - **Panel Trái (55%):** Chuyển đổi tức thì giữa **Tab 1: Sơ đồ 30 Bàn Vật lý** (mã màu chuẩn: Xanh lá = `AVAILABLE`, Cam nhấp nháy = `PENDING`, Đỏ = `OCCUPIED` + Khu vực thẻ đơn Mang về `Mang về #01`, `#02`... + Nút lớn `[+ TẠO ĐƠN MANG VỀ]`) và **Tab 2: Thực đơn Gọi món nhanh**.
   - **Panel Phải (45%):** **Hoá đơn Điện tử Thời gian thực (Live Invoice)** nhóm món theo từng lượt gọi (`Lượt 1`, `GỌI THÊM - Lượt 2`), cho phép sửa/xoá trực tiếp món `NEW` hoặc bấm `"Huỷ món bếp"` đối với món `PRINTED` (`EC-POS-06`), kèm cụm 4 nút hành động chuẩn: `[Đổi / Gộp bàn]`, `[Tách đơn]`, `[In tạm tính (QR)]`, và `[Thanh toán]` (Dialog xác nhận 2 bước hỗ trợ `CASH` / `TRANSFER` / `SPLIT`).

---

## 2. DANH SÁCH FILE CHECKLIST (FILE MANIFEST & CHECKLIST)

### 2.1. Feature Đặt món QR trên Mobile (`apps/web-app/src/features/qr-order/`)
- [x] `apps/web-app/src/features/qr-order/api/qr-order.api.ts` — Hooks gọi `GET /api/v1/public/menu?token=...` và `POST /api/v1/public/orders/qr`.
- [x] `apps/web-app/src/features/qr-order/hooks/use-qr-session-socket.ts` — Kết nối Socket.io ở chế độ QR Guest (`auth: { qrToken, orderId }`), lưu `activeOrderId` và `currentTableLabel` vào `sessionStorage`, tự động cập nhật UI và hiển thị banner thông báo khi nhận `order:session_redirected` (`EC-POS-01`) hoặc `order:status_updated`.
- [x] `apps/web-app/src/features/qr-order/components/qr-order-page.tsx` — Giao diện mobile hiển thị Header số bàn hiện tại, danh mục món ăn, giỏ hàng nổi dưới đáy màn hình, và màn hình theo dõi trạng thái đơn.
- [x] `apps/web-app/src/features/qr-order/components/modifier-selector-sheet.tsx` — Bottom sheet chọn Cấp độ cay 0–7 (Radio bắt buộc) và Topping thêm (Checkbox cộng tiền) + ghi chú món.
- [x] `apps/web-app/src/features/qr-order/index.ts` — Barrel export duy nhất (Hard Invariant 1).

### 2.2. Feature Màn hình POS Hợp nhất (`apps/web-app/src/features/pos-counter/`)
- [x] `apps/web-app/src/features/pos-counter/api/pos.api.ts` — TanStack Query & Mutation hooks cho toàn bộ endpoints `/api/v1/pos/*`.
- [x] `apps/web-app/src/features/pos-counter/hooks/use-pos-cashier-socket.ts` — Lắng nghe `order:qr_new` (phát âm thanh chuông báo + highlight bàn màu Cam nhấp nháy), `order:qr_addon` (hiện badge `"Gọi thêm Lượt N"`), và `table:grid_sync` (invalidate query sơ đồ bàn tức thì).
- [x] `apps/web-app/src/features/pos-counter/components/pos-unified-page.tsx` — Bố cục Split-View kết nối Panel Trái (Sơ đồ bàn / Menu) và Panel Phải (Live Invoice).
- [x] `apps/web-app/src/features/pos-counter/components/table-grid-panel.tsx` — Lưới 30 bàn vật lý (`Bàn 01`..`Bàn 30`) với đúng 3 màu trạng thái (`AVAILABLE` xanh lá, `PENDING` cam nhấp nháy, `OCCUPIED` đỏ) + Danh sách các thẻ đơn `Mang về #01, #02...` đang mở + Nút `[+ TẠO ĐƠN MANG VỀ]`.
- [x] `apps/web-app/src/features/pos-counter/components/pos-menu-panel.tsx` — Lưới chọn món nhanh theo trạm/danh mục kèm modal chọn Cấp độ cay 0–7, Topping, hoặc Combo.
- [x] `apps/web-app/src/features/pos-counter/components/live-invoice-panel.tsx` — Hoá đơn điện tử thời gian thực:
  - Hiển thị Header (`Bàn 07` hoặc `Mang về #02`, mã đơn `HD-...`, trạng thái `PENDING` / `SERVING`).
  - Gom nhóm món theo `batch_no` (`Lượt 1`, `GỌI THÊM - LƯỢT 2`), hiển thị badge trạng thái bếp (`Mới gọi` / `Đã in bếp` / `Đã huỷ`).
  - Xử lý sửa/huỷ món theo đúng 2 nhánh `EC-POS-06`.
  - Cụm 4 nút điều khiển chính ở chân hoá đơn.
- [x] `apps/web-app/src/features/pos-counter/components/table-action-dialog.tsx` — Modal thực hiện `MOVE` (chuyển sang bàn trống), `MERGE` (gộp vào bàn đang ăn — tự động ẩn/chặn nếu đơn hiện tại là `TAKEAWAY` theo `EC-POS-03`), và `SWAP` (hoán đổi 2 bàn).
- [x] `apps/web-app/src/features/pos-counter/components/checkout-confirm-dialog.tsx` — Dialog xác nhận Thanh toán 2 bước: chọn `CASH`, `TRANSFER`, hoặc `SPLIT` (nhập `cashAmount` + `transferAmount` tự động kiểm tra tổng khớp `totalAmount` theo `EC-FIN-02`), kèm 3 nút: `[Xác nhận & In hoá đơn]`, `[Xác nhận & Không in]`, `[Huỷ bỏ]`.
- [x] `apps/web-app/src/features/pos-counter/index.ts` — Barrel export duy nhất (Hard Invariant 1).
- [x] `apps/web-app/src/features/pos-counter/__tests__/pos-counter.test.tsx` — Bộ test Vitest cho luồng tạo đơn Mang về, Double-click guard trên nút `[Tách đơn]`, tách bạch `[In tạm tính]` vs `[Thanh toán]`, và redirect phiên QR (`EC-POS-01`).

---

## 3. CHI TIẾT KỸ THUẬT & NGHIỆP VỤ (TECHNICAL SPECIFICATIONS)

### 3.1. Mã màu Bàn ăn Chuẩn (`DISCREPANCY-SM-01` & `.agents/rules/04` §5)
- `AVAILABLE`: Nền/viền **Xanh lá** (`emerald-500` / `emerald-600`) — Bàn trống, click vào để tạo đơn tại quầy.
- `PENDING`: Nền/viền **Cam nhấp nháy** (`amber-500 animate-pulse`) — Có khách vừa quét QR gửi đơn mới chờ thu ngân duyệt.
- `OCCUPIED`: Nền/viền **Đỏ** (`rose-600`) — Đang có khách phục vụ, hiển thị tổng tiền tạm tính và số lượt gọi món.

### 3.2. Bảo vệ Chống Bấm Đôi Nút `[Tách đơn]` (`EC-POS-05`)
- Khi mutation `splitKitchenMutation.isPending === true` hoặc khi trong đơn không có món nào ở trạng thái `kitchen_status === 'NEW'`, nút `[Tách đơn]` **MUST** chuyển sang `disabled` (hiển thị icon Spinner khi đang gửi request).

### 3.3. Tách bạch Tuyệt đối `[In tạm tính (QR)]` và `[Thanh toán]` (Hard Invariant 4)
- Bấm **`[In tạm tính (QR)]`**: Gọi `GET /api/v1/pos/orders/:id/provisional-bill`, đẩy dữ liệu sang hệ thống in nhiệt (Story 10) để in Phiếu tạm tính có mã VietQR động; đơn hàng trên màn hình POS **vẫn giữ nguyên trạng thái `SERVING`** và bàn vẫn màu **Đỏ (`OCCUPIED`)**.
- Bấm **`[Thanh toán]`**: Bắt buộc mở `CheckoutConfirmDialog` (2 bước). Chỉ khi thu ngân bấm `[Xác nhận & In hoá đơn]` hoặc `[Xác nhận & Không in]` thì mới gọi `POST /api/v1/pos/orders/:id/checkout` để chuyển đơn sang `PAID` và giải phóng bàn về màu **Xanh lá (`AVAILABLE`)**.

---

## 4. TIÊU CHÍ NGHIỆM THU (ACCEPTANCE CRITERIA)

- [x] **AC-09.1 (QR Mobile Seamless Redirect `EC-POS-01`):** Khi điện thoại khách đang mở `/qr/:tokenBan01` (có `activeOrderId = 538`) và nhận được sự kiện Socket.io `order:session_redirected` sang `"Bàn 07"`, giao diện điện thoại tự động cập nhật tiêu đề thành `"Bàn 07"` mà không cần quét lại QR; khi bấm gọi thêm món, request gửi kèm `activeOrderId` về đúng Bàn 07.
- [x] **AC-09.2 (Unified POS 3 Order Sources):** Thu ngân có thể (A) duyệt đơn QR đang nhấp nháy cam, (B) click bàn trống màu xanh để tạo đơn tại bàn, và (C) bấm `[+ TẠO ĐƠN MANG VỀ]` để tạo đơn `Mang về #01` độc lập không chiếm bàn vật lý.
- [x] **AC-09.3 (Double-Click Prevention `EC-POS-05`):** Nút `[Tách đơn]` tự động disable ngay khi click và chỉ bật sáng khi trong giỏ hàng có ít nhất 1 món `kitchen_status === 'NEW'`.
- [x] **AC-09.4 (2-Step Checkout & Split Payment `EC-FIN-02`):** Dialog Thanh toán kiểm tra chặt chẽ `cashAmount + transferAmount === totalAmount` khi chọn `SPLIT`, cung cấp đủ 2 lựa chọn `"Xác nhận & In hoá đơn"` và `"Xác nhận & Không in"`.
- [x] **AC-09.5 (Feature Isolation Invariant 1):** `src/features/qr-order/` và `src/features/pos-counter/` hoàn toàn không import trực tiếp lẫn nhau; `pnpm -r typecheck` và `pnpm -r test` pass 100%.
