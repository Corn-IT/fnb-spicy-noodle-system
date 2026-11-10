# Story 10: Xây dựng Hệ thống Component In Nhiệt Khổ 80mm (`@media print` Tự Cắt Giấy, 5 Mẫu Phiếu & Mã VietQR Động)

> **Story ID:** `STORY-10`  
> **Tên file:** `docs/stories/story-10-frontend-thermal-print-80mm-and-vietqr.md`  
> **Phase thực thi:** Phase 5 (Frontend Thermal Printing 80mm & Dynamic VietQR)  
> **Agent phụ trách:** Antigravity  
> **Phụ thuộc (Dependencies):** `story-01`, `story-04`, `story-05`, `story-08`, `story-09`  
> **Quy tắc bất biến áp dụng:** Hard Invariant 3 (In tách rời tối đa 3 phiếu bếp cho các món `NEW` kèm Logo riêng từng trạm, không bao giờ in chữ `COMBO`), Hard Invariant 4 (Phiếu Tạm tính nhúng ảnh VietQR động chuẩn Napas247 giữ nguyên `SERVING` vs Hoá đơn Thanh toán chính thức `PAID`)  
> **Tài liệu tham chiếu:** `docs/bmad/01-PRD-Master.md` (§4), `.agents/rules/04-frontend-ux-table-and-print.md` (§7), `docs/bmad/03-Edge-Cases-And-Invariants.md` (`EC-POS-04`, `EC-POS-06`), `references/seokju-na__react-thermal-printer`

---

## 1. MỤC TIÊU (OBJECTIVES)

Hiện thực hoá hệ thống in nhiệt khổ giấy **80mm (vùng in an toàn 72mm)** hoạt động trực tiếp từ trình duyệt máy POS (tương thích cờ `--kiosk-printing` với tốc độ phản hồi dưới 500ms) và tự động kích hoạt dao cắt giấy vật lý giữa các phiếu bằng CSS `break-after: page; page-break-after: always;`. Cung cấp đầy đủ **5 mẫu phiếu in nhiệt chuẩn** đặt tại `apps/web-app/src/components/print-slips/` để tái sử dụng cho cả Màn hình POS (Module 1) và Màn hình Lịch sử Hoá đơn (Module 2 — In lại hoá đơn).

---

## 2. DANH SÁCH FILE CHECKLIST (FILE MANIFEST & CHECKLIST)

### 2.1. Hệ thống In Nhiệt Dùng chung (`apps/web-app/src/components/print-slips/`)
- [x] `apps/web-app/src/components/print-slips/thermal-print-provider.tsx` — Quản lý hàng đợi in (`printQueue`), render vùng `#thermal-print-container` ở chế độ ẩn trên màn hình thường nhưng hiển thị độc quyền khi `@media print`, tự động chờ ảnh mã VietQR (`onload`) tải xong trước khi gọi `window.print()`.
- [x] `apps/web-app/src/components/print-slips/station-logos.tsx` — Bộ biểu tượng SVG đen trắng độ tương phản cao tối ưu cho đầu in nhiệt:
  - `CHEF_HAT_NOODLE` cho trạm `BEP_NAU` (`"BẾP NẤU (MÌ CAY)"`)
  - `FRENCH_FRIES` cho trạm `BEP_CHIEN` (`"BẾP CHIÊN"`)
  - `DRINK_CUP` cho trạm `PHA_CHE` (`"QUẦY NƯỚC UỐNG"`)
- [x] `apps/web-app/src/components/print-slips/kitchen-split-slip.tsx` — **Mẫu 1: Phiếu Tách Bếp** (nhận mảng `tickets` từ API `split-kitchen`, render tối đa 3 trang `.ticket-page` tách rời nhau để máy in tự động cắt thành 3 phiếu riêng biệt cho 3 trạm).
- [x] `apps/web-app/src/components/print-slips/table-transfer-notice-slip.tsx` — **Mẫu 2: Phiếu Thông Báo Chuyển Bàn (`EC-POS-04`)** (`"⚠️ THÔNG BÁO ĐỔI BÀN ⚠️"`, `CHUYỂN TỪ: >>> BÀN 01 <<< SANG BÀN: >>> BÀN 07 <<<`, danh sách các trạm bị ảnh hưởng).
- [x] `apps/web-app/src/components/print-slips/kitchen-cancel-item-slip.tsx` — **Mẫu 3: Phiếu Báo Huỷ Món / Điều Chỉnh Bếp (`EC-POS-06` Nhánh B)** (`"PHIẾU BÁO HUỶ MÓN"`, tên bàn, số lượng và tên món vừa huỷ sau khi đã in bếp).
- [x] `apps/web-app/src/components/print-slips/provisional-vietqr-slip.tsx` — **Mẫu 4: Phiếu Tạm Tính Kèm Mã VietQR Động (Hard Invariant 4)** (danh sách món, tổng thanh toán, hình ảnh mã VietQR chuẩn Napas247 nhúng sẵn `amount` và nội dung `TT {order_code}`, kèm dòng lưu ý `"Phiếu này dùng để kiểm tra món ăn"`).
- [x] `apps/web-app/src/components/print-slips/official-receipt-slip.tsx` — **Mẫu 5: Hoá Đơn Thanh Toán Chính Thức (`PAID`)** (in sau khi chốt thanh toán hoặc khi bấm `"In lại hoá đơn"` ở Module 2; hiển thị rõ phương thức `CASH` / `TRANSFER` / `SPLIT` kèm chi tiết số tiền mặt và chuyển khoản).
- [x] `apps/web-app/src/components/print-slips/vietqr-url.util.ts` — Hàm tiện ích xây dựng URL ảnh VietQR động chuẩn Napas247 và fallback QR SVG nội bộ nếu mạng ngoại vi chập chờn.
- [x] `apps/web-app/src/components/print-slips/index.ts` — Barrel export cho toàn bộ components và hook `useThermalPrinter()`.
- [x] `apps/web-app/src/components/print-slips/__tests__/thermal-print.test.tsx` — Unit tests kiểm chứng render đúng 5 mẫu phiếu, phân tách `.ticket-page` cho 3 trạm bếp, hiển thị nhãn `"[GỌI THÊM - LƯỢT 2]"` và dòng cảnh báo đổi bàn.

---

## 3. CHI TIẾT KỸ THUẬT & NGHIỆP VỤ (TECHNICAL SPECIFICATIONS)

### 3.1. Quy chuẩn CSS `@media print` Khổ 80mm (`.agents/rules/04` §7)
Bắt buộc khai báo trong `apps/web-app/src/index.css`:
```css
@media print {
  @page {
    size: 80mm auto;
    margin: 0;
  }
  body * {
    visibility: hidden;
  }
  #thermal-print-container,
  #thermal-print-container * {
    visibility: visible;
  }
  #thermal-print-container {
    position: absolute;
    left: 0;
    top: 0;
    width: 72mm; /* Trừ lề an toàn 4mm mỗi bên cho khổ giấy nhiệt 80mm */
    color: #000 !important;
    background: #fff !important;
  }
  .ticket-page {
    width: 100%;
    padding: 2mm 0;
    break-after: page;
    page-break-after: always; /* Kích hoạt dao cắt giấy tự động giữa các phiếu */
  }
}
```

### 3.2. Quy tắc Hiển thị trên Phiếu Tách Bếp (Mẫu 1 — Hard Invariant 3)
1. Mỗi trạm trong mảng `tickets` (`BEP_NAU`, `BEP_CHIEN`, `PHA_CHE`) được bao bọc trong một thẻ `<div className="ticket-page">` độc lập để máy in tự động cắt rời từng phiếu.
2. Trên đầu mỗi phiếu phải hiển thị đúng Logo SVG (`CHEF_HAT_NOODLE` / `FRENCH_FRIES` / `DRINK_CUP`) và tiêu đề trạm in đậm cỡ chữ lớn.
3. Hiển thị rõ tên bàn (`BÀN 07`) hoặc nhãn đơn mang về (`MANG VỀ #08`).
4. Nếu `batchNo > 1`: hiển thị khối chữ đảo màu nổi bật `"[GỌI THÊM - LƯỢT {batchNo}]"`.
5. Nếu đơn có lịch sử chuyển bàn: hiển thị dòng cảnh báo `"[GHI CHÚ ĐỔI BÀN: Chuyển từ BÀN 01 sang BÀN 07]"`.
6. Dưới mỗi món chính, liệt kê rõ **Cấp độ cay (0–7)**, các dòng **+ Thêm Topping** và ghi chú riêng của món (`item_note`).

### 3.3. Cơ chế Đợi Ảnh VietQR Trước Khi Gọi `window.print()` (Mẫu 4)
Khi in `ProvisionalVietQrSlip`:
- Component phải lắng nghe sự kiện `onLoad` (hoặc `onError` fallback sang SVG QR) của thẻ `<img src={vietQrUrl} />` trước khi kích hoạt `window.print()`, đảm bảo tờ phiếu tạm tính in ra luôn có hình mã QR sắc nét, không bao giờ bị trắng khung ảnh QR.

---

## 4. TIÊU CHÍ NGHIỆM THU (ACCEPTANCE CRITERIA)

- [x] **AC-10.1 (Auto Page-Cut 3 Kitchen Tickets):** Khi một đơn hàng có món mới ở cả 3 trạm (`BEP_NAU`, `BEP_CHIEN`, `PHA_CHE`), `#thermal-print-container` render đúng 3 khối `.ticket-page` với thuộc tính `break-after: page; page-break-after: always` và đúng 3 logo tương ứng.
- [x] **AC-10.2 (Add-on Batch & Table Transfer Banner):** Khi `batchNo = 2` và đơn vừa chuyển từ Bàn 01 sang Bàn 07, phiếu bếp hiển thị rõ cả 2 dòng `"[GỌI THÊM - LƯỢT 2]"` và `"[GHI CHÚ ĐỔI BÀN: Chuyển từ BÀN 01 sang BÀN 07]"`.
- [x] **AC-10.3 (Automatic Print on Table Move/Merge & Item Cancel):** Khi `table-action` trả về `requireKitchenNoticePrint = true` (`EC-POS-04`), hệ thống tự động gọi in `TableTransferNoticeSlip`; khi huỷ món đã `PRINTED` (`EC-POS-06` Nhánh B), hệ thống tự động gọi in `KitchenCancelItemSlip`.
- [x] **AC-10.4 (Provisional VietQR Slip Integrity — Invariant 4):** Phiếu tạm tính hiển thị đầy đủ danh sách món, tổng tiền, ảnh mã VietQR nhúng sẵn `amount` và nội dung `TT {order_code}`, và chờ ảnh tải xong mới gọi `window.print()`.
- [x] **AC-10.5 (Typecheck & Tests):** `pnpm -r typecheck` và `pnpm -r test` pass 100%.
