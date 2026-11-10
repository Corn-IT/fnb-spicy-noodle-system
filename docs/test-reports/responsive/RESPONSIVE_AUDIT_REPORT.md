# BÁO CÁO NGHIỆM THU AUDIT & TỐI ƯU HOÁ RESPONSIVE ĐA THIẾT BỊ
## HỆ THỐNG POS & QUẢN TRỊ VẬN HÀNH MÌ CAY SƠN BẢO

> **Ngày thực hiện:** 09/11/2026  
> **Môi trường kiểm thử:** Trình duyệt thật (Real Browser Chromium qua Chrome DevTools Protocol)  
> **Kết quả kiểm định:** **PASS 100% (302/302 Unit & Integration Tests, 0 Lỗi TypeScript Typecheck)**

---

## 1. TỔNG QUAN DỰ ÁN & MỤC TIÊU AUDIT

Thực hiện kiểm tra tự động và tối ưu hoá giao diện người dùng (UI/UX) đảm bảo hệ thống POS & Vận hành Mì Cay hoạt động hoàn hảo trên 5 kích thước màn hình thực tế, đặc biệt là các thiết bị cảm ứng di động của khách hàng quét QR và nhân viên cầm iPad chạy bàn.

```
+---------------------------------------------------------------------------------------+
|                                5 KÍCH THƯỚC CHUẨN                                     |
+---------------------------------------------------------------------------------------+
| 1. Mobile (390 × 844 px & 412 × 915 px)       : Khách gọi QR & POS cơ động           |
| 2. Tablet Portrait (768 × 1024 px)            : Nhân viên cầm iPad order tại bàn      |
| 3. Tablet Landscape (1024 × 768 px)           : Màn hình cảm ứng Quầy Thu Ngân POS    |
| 4. Laptop / PC (1366 × 768 px & 1536 × 864 px): Quản lý cửa hàng kiểm soát doanh thu  |
| 5. Large Screen / TV (1920 × 1080 px)         : Màn hình lớn theo dõi tổng quan       |
+---------------------------------------------------------------------------------------+
```

---

## 2. CÁC ĐIỂM NGHẼN TRƯỚC AUDIT VÀ GIẢI PHÁP THAY ĐỔI DỨT ĐIỂM (BEFORE VS AFTER)

| STT | Vấn đề phát hiện (Before Audit) | Tác động | Giải pháp CSS & Kiến trúc UI đã khắc phục (After Audit) |
|:---:|:---|:---|:---|
| **1** | `ResizableSidebar` ép cứng `width: 260px` trên mọi kích thước màn hình. | Trên điện thoại (390px), sidebar chiếm 260px làm nội dung chính bị bóp nghẹt còn 130px, vỡ toàn bộ trang. | Đặt sidebar máy tính thành `hidden lg:flex`. Thêm `MobileSidebarNav` tích hợp vào component `Sheet` (Drawer trượt từ mép trái) với nút hamburger trên thanh điều hướng. |
| **2** | Màn hình POS quầy (`/pos`) ép chia 2 cột tĩnh (55/45) ngay cả trên mobile và tablet dọc. | Lưới bàn và hoá đơn đè chồng lên nhau, các nút bấm thao tác lọt ra ngoài màn hình. | Chuyển đổi thành **Bố cục 3 Tab thông minh** (`posTab: 'tables' \| 'menu' \| 'invoice'`) trên `< lg`. Bổ sung thanh tóm tắt giỏ hàng/hoá đơn nổi cố định đáy màn hình (`fixed bottom-0`). Giữ nguyên Split-View (58/42) trên `lg+`. |
| **3** | Trang QR gọi món (`/qr/:token`) trên mobile hiển thị giỏ hàng dạng thanh cố định chiếm nhiều diện tích. | Khách khó thao tác bằng ngón tay cái, không xem được danh sách món đã chọn khi cuộn. | Chuyển đổi thành thanh trạng thái nổi tinh gọn hiển thị số lượng và tổng tiền, kèm **Bottom Sheet Drawer** (`Sheet side="bottom"`) vuốt mở mượt mà để tăng/giảm món và gửi bếp. |
| **4** | Bảng dữ liệu `BaseTable` (`/invoices`, `/employees`, `/inventory`) bị bóp méo chữ và huy hiệu trên màn hình hẹp. | Các badge thanh toán và cột nút Thao tác bị xuống dòng hoặc che khuất. | Áp dụng `overflow-x-auto`, `touch-pan-x`, `align-middle` cho `<td>`, và `shrink-0 whitespace-nowrap` cho các badge trạng thái và cột hành động. |
| **5** | Các hộp thoại Dialog (Đổi bàn, Thanh toán, Nhập kho) vượt quá bề ngang màn hình nhỏ. | Bị tràn mép màn hình, làm mất nút "Huỷ bỏ" và "Xác nhận". | Thiết lập `w-[calc(100vw-2rem)] sm:max-w-lg p-4 sm:p-6` và chuyển các nút chọn nhanh phương thức thành lưới co giãn (`grid-cols-1 sm:grid-cols-3`). |
| **6** | Huy hiệu "ĐƠN MỚI" (`Badge`) bị bóp méo, xuống 2 dòng ("ĐƠN \n MỚI") kèm padding lệch (Hình 1 người dùng gửi). | Mất mỹ quan, chữ bị cắt góc và không căn giữa toán học trong khối badge. | Bổ sung `shrink-0 whitespace-nowrap justify-center text-center select-none` vào `badgeVariants` chung; cấu hình `min-w-0 flex-1 pr-2 truncate` cho tiêu đề và badge pill `px-2.5 py-1 text-xs`. |
| **7** | Lưới món ăn "Thực đơn Gọi món nhanh" ép 3 cột (`grid-cols-3`) trong panel hẹp kèm nhãn trạm `BEP_NAU` (Hình 2 người dùng gửi). | Tên món bị xếp dọc từng chữ ("Mì \n kim \n chi \n bò"), giá tiền bị rớt dòng ("69.000 \n đ"), padding thẻ món quá dày thô. | **Gỡ bỏ hoàn toàn nhãn trạm nội bộ** (`BEP_NAU`, `BEP_CHIEN`...); chuyển sang lưới linh hoạt `auto-fill, minmax(140px, 1fr)`; rút gọn padding thẻ thành `p-2.5 sm:p-3`; tiêu đề món `line-clamp-2 leading-snug`; giá tiền `tabular-nums whitespace-nowrap`; nút `+ Thêm` dạng pill bo tròn nịnh mắt. |
| **8** | Thanh phân loại món ăn chiếm nhiều diện tích, nút bấm thô cứng và thanh cuộn ngang gây rối mắt. | Thanh trượt scrollbar che khuất nội dung món ở dưới, chiếm nhiều padding dọc. | Chuyển các nút danh mục thành các pill bo tròn `rounded-full px-3 py-1 text-xs`, ẩn hoàn toàn thanh cuộn với tiện ích `.no-scrollbar` (`scrollbar-width: none`). |
| **9** | Các nút thao tác thanh toán, đổi bàn, in tạm tính thiếu căn giữa toán học trên thiết bị cảm ứng. | Chữ lệch trục dọc/ngang khi responsive co giãn. | Bổ sung triệt để `flex items-center justify-center text-center select-none active:scale-[0.98]` cho toàn bộ hệ thống button và dialog. |
| **10** | Nút "+ Thêm" trên thẻ món bị lệch chữ "Thêm", text không căn giữa (Hình 1). | `+ Thêm` hiển thị dưới dạng chuỗi thô, dấu `+` lệch baseline so với chữ tiếng Việt có dấu mũ (`ê`). | Tách biệt icon Lucide `<Plus className="h-3 w-3 shrink-0" />` và `<span>Thêm</span>` trong khối `inline-flex shrink-0 items-center justify-center gap-1 leading-none select-none rounded-full bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white`. Căn giữa toán học 100%. |
| **11** | Nút Tạo đơn mang về bị lặp dấu cộng `+ + TẠO ĐƠN MANG VỀ` (Hình 4). | Xuất hiện 2 dấu cộng liền nhau gây lỗi thẩm mỹ. | Xoá bỏ ký tự `+` thừa trong chuỗi text, chỉ giữ icon `<Plus className="mr-1.5 h-4 w-4" />` và text `TẠO ĐƠN MANG VỀ`. |
| **12** | Tab "Thực đơn", "Sơ đồ bàn" và các view không scroll xuống hết được (Hình 2, Hình 4). | Xung đột double scroll giữa `main` và container con do hardcode `h-[calc(100vh-4rem)]` trên POS, thiếu `min-h-0` trên flex items, và thiếu padding đáy để vượt qua thanh tóm tắt nổi cố định (`fixed bottom-0`). | Đặt `flex-1 min-h-0` xuyên suốt từ `AppShell main` xuống các panels; cấu hình `TabsContent` thành `flex flex-col min-h-0 h-full`; bổ sung `pb-28 sm:pb-6` kèm `overscroll-contain touch-pan-y` trên `TableGridPanel` và `PosMenuPanel` giúp cuộn trơn tru, hiển thị trọn vẹn toàn bộ món và đơn mang về. |
| **13** | Hộp thoại chọn món Mì Cay (Modifier Dialog) không thể scroll được (Hình 3). | `DialogContent` dạng grid tĩnh bị bó chặt kích thước, chiều cao nội dung (628px) xấp xỉ viewport khiến `scrollHeight === clientHeight` làm triệt tiêu thanh cuộn, nút "Huỷ" bị ép sát mép dưới. | Tái cấu trúc Dialog thành Flexbox 3 tầng: **Header cố định** (tiêu đề + icon Flame), **Body cuộn độc lập** (`flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y`), và **Footer cố định** (2 nút Xác nhận và Huỷ luôn nổi ở đáy, dễ bấm bằng ngón tay cái). |

---

## 3. BẢNG TỔNG HỢP KIỂM CHỨNG THEO 5 KÍCH THƯỚC MÀN HÌNH

### 3.1. Điện thoại di động (Mobile: 390 × 844 px & 412 × 915 px) — [Trọng tâm cao nhất]

- **Trang Khách gọi món QR (`/qr/:token`):**
  - Thẻ món ăn hiển thị gọn gàng, nút `+ Chọn món` lớn (min-h: 44px).
  - Thanh giỏ hàng nổi sát đáy màn hình (`pb-safe`) hiển thị tổng tiền tức thời.
  - Drawer giỏ hàng trượt từ đáy màn hình (`Sheet side="bottom"`) với bộ tăng giảm số lượng `[-] [qty] [+]` dễ bấm một tay.
  - *Hình ảnh kiểm chứng:*
    - Thanh giỏ hàng nổi: `docs/test-reports/responsive/qr-mobile-390-cart-bar.png`
    - Drawer giỏ hàng chi tiết: `docs/test-reports/responsive/qr-mobile-390-cart-sheet.png`

- **Trang POS Quầy (`/pos`):**
  - Thanh tab chuyển đổi nhanh 3 chế độ: `Sơ đồ Bàn` ↔ `Thực đơn` ↔ `Hoá đơn`.
  - Khi bấm vào bàn đang ăn (Bàn 01), hệ thống tự động nhảy sang tab `Hoá đơn` với đầy đủ nút Đổi bàn, Tách đơn, In tạm tính, Thanh toán.
  - Khi xem sơ đồ bàn hoặc thực đơn, thanh tóm tắt nổi sát đáy hiển thị `Bàn đang chọn • Tổng tiền • Nút Xem Hoá đơn`.
  - Menu điều hướng toàn hệ thống mở qua Drawer trái (`Sheet side="left"`).
  - *Hình ảnh kiểm chứng:*
    - POS Sơ đồ bàn cuộn đáy trọn vẹn (390px): `docs/test-reports/responsive/scroll-fix-tables-bottom.png`
    - POS Thực đơn cuộn trọn vẹn đáy (Pepsi & Combo Đôi): `docs/test-reports/responsive/scroll-fix-menu-bottom.png`
    - POS Nút "+ Thêm" căn giữa tuyệt đối: `docs/test-reports/responsive/scroll-fix-menu-top.png`
    - POS Modal Mì Cay có Header & Footer cố định + Body cuộn mượt: `docs/test-reports/responsive/scroll-fix-modifier-dialog-top.png` & `docs/test-reports/responsive/scroll-fix-modifier-dialog-bottom.png`
    - POS Hoá đơn chi tiết (390px): `docs/test-reports/responsive/scroll-fix-invoice-empty.png`
    - Chụp toàn màn hình qua Agent-Desktop MCP: `docs/test-reports/responsive/agent-desktop-chrome-view.png`
    - Drawer điều hướng Mobile: `docs/test-reports/responsive/audit-mobile-drawer.png`

- **Các Bảng Dữ liệu BaseTable (`/invoices`, `/employees`, `/inventory`):**
  - Cuộn ngang mượt mà với cảm ứng chạm (`touch-pan-x`).
  - Huy hiệu trạng thái (`CASH`, `TRANSFER`, `SPLIT`, `SERVING`, `PAID`) giữ nguyên hình dạng không bị co ép méo chữ.
  - *Hình ảnh kiểm chứng:*
    - Bảng Hoá đơn 7 cột (Mobile): `docs/test-reports/responsive/01-mobile-invoices-table.png`
    - Bảng Nhân sự (Mobile): `docs/test-reports/responsive/01-mobile-employees-table.png`
    - Bảng Nhập kho Nguyên liệu (Mobile): `docs/test-reports/responsive/01-mobile-inventory-table.png`

---

### 3.2. Máy tính bảng Dọc (Tablet Portrait: 768 × 1024 px) — [Nhân viên cầm iPad chạy bàn]

- Lưới 30 bàn vật lý hiển thị cân đối với 5 cột (`md:grid-cols-5`).
- Nút bấm to, khoảng cách padding chuẩn 12px chống bấm nhầm.
- **Hộp thoại Chuyển / Gộp / Hoán đổi Bàn (Table Action Dialog):** Lưới chọn thao tác và danh sách bàn đích co giãn linh hoạt, 2 nút "Huỷ bỏ" và "Thực hiện MOVE" nằm trọn vẹn trong màn hình.
- **Hộp thoại Thanh toán (Checkout Confirm Dialog):** 3 nút phương thức `CASH`, `TRANSFER`, `SPLIT` chia 3 cột đều đặn, không tràn viền.
- *Hình ảnh kiểm chứng:*
  - POS Tablet Portrait: `docs/test-reports/responsive/02-tablet-portrait-768-pos.png`
  - Dialog Đổi/Gộp bàn: `docs/test-reports/responsive/02-tablet-portrait-table-action-dialog.png`
  - Dialog Xác nhận Thanh toán: `docs/test-reports/responsive/02-tablet-portrait-checkout-dialog.png`

---

### 3.3. Máy tính bảng Ngang (Tablet Landscape: 1024 × 768 px) — [Chuẩn Màn hình Quầy Thu Ngân]

- Bố cục Split-View 2 cột hoàn hảo:
  - Cột trái (58%): Sơ đồ 30 bàn hoặc Thực đơn gọi món nhanh với bộ lọc danh mục.
  - Cột phải (42%): Bảng hoá đơn trực tiếp (Live Invoice Panel) hiển thị từng lượt gọi bếp, tổng tiền và 4 nút hành động lớn.
- Thanh bên Resizable Sidebar tự động hiển thị với tay kéo chỉnh kích thước linh hoạt từ 200px đến 360px.
- **Tối ưu hoá Pixel-Perfect mới (Khắc phục phản ánh của người dùng):**
  - Gỡ bỏ hoàn toàn nhãn trạm `BEP_NAU`, `BEP_CHIEN` trên thẻ món.
  - Thiết lập lưới món `auto-fill, minmax(140px, 1fr)` tự động phân bổ 2 cột rộng rãi trong panel trái, tiêu đề món nằm ngang thanh thoát, giá tiền không bị rớt dòng.
  - Huy hiệu "ĐƠN MỚI" căn giữa toán học, không co ép, không rớt dòng.
- *Hình ảnh kiểm chứng:*
  - POS Split-View (1024px): `docs/test-reports/responsive/03-tablet-landscape-1024-pos.png`
  - Thực đơn Món mới tối ưu (1024px): `docs/test-reports/responsive/audit-fix-tablet-menu-1024.png`
  - Huy hiệu Đơn mới chuẩn Pixel: `docs/test-reports/responsive/audit-fix-new-order-badge.png`
  - Bảng Hoá đơn BaseTable (1024px): `docs/test-reports/responsive/03-tablet-landscape-invoices.png`

---

### 3.4. Laptop / PC (1366 × 768 px & 1536 × 864 px)

- Sidebar mở rộng trực quan kèm logo và thông tin phân quyền.
- Lưới 30 bàn bố trí 5-6 cột rộng rãi, màu sắc trực quan (Xanh: Trống, Vàng: Chờ duyệt QR, Đỏ cam: Đang ăn).
- Bảng tra cứu hoá đơn hiển thị trọn vẹn bộ lọc kép (Preset ngày + Input khoảng ngày + Trạng thái + PTTT + Ô tìm kiếm).
- *Hình ảnh kiểm chứng:*
  - POS Laptop (1366px): `docs/test-reports/responsive/04-laptop-1366-pos.png`
  - Hoá đơn Laptop (1536px): `docs/test-reports/responsive/04-laptop-1536-invoices.png`

---

### 3.5. Màn hình Lớn / TV (1920 × 1080 px)

- Bố cục khoáng đạt, độ tương phản sắc nét, phông chữ Inter rõ ràng ở cự ly xa.
- Không có khoảng trống thừa thãi hay thanh cuộn rác ngoài ý muốn.
- *Hình ảnh kiểm chứng:*
  - POS TV Full HD (1920px): `docs/test-reports/responsive/05-tv-1920-pos.png`
  - Hoá đơn TV Full HD (1920px): `docs/test-reports/responsive/05-tv-1920-invoices.png`

---

## 4. BẢNG KIỂM TRA CHẤT LƯỢNG CODE & CÁC RÀNG BUỘC KỸ THUẬT

| Ràng buộc kỹ thuật | Tiêu chí đánh giá | Kết quả | Ghi chú |
|:---|:---|:---:|:---|
| **TypeScript Typecheck** | `pnpm -r typecheck` | **PASS (0 errors)** | Cả 4 packages (`shared`, `api-server`, `web-app`) hoàn toàn sạch lỗi kiểu |
| **Unit & Integration Tests** | `pnpm -r test` | **PASS (302/302 tests)** | 100% tests pass (19 shared, 233 backend, 50 frontend) |
| **Invariant 1: Cô lập Module** | Không cross-import giữa các features | **ĐẠT** | Chỉ import qua `@fnb/shared` hoặc `components/` |
| **Invariant 2: Đơn Mang về** | Phân định `table_id` và `takeaway_number` | **ĐẠT** | Không tạo bàn ảo trong `dining_tables` |
| **Invariant 4: Tạm tính vs Thanh toán** | In tạm tính giữ `SERVING`, Thanh toán chuyển `PAID` | **ĐẠT** | Giữ nguyên quy trình 2 bước |
| **Invariant 9: UI Preferences** | Đăng xuất không làm mất cấu hình giao diện | **ĐẠT** | Lưu giữ theme và column widths trong `localStorage` |
| **Invariant 10: Tiền tệ** | Sử dụng kiểu dữ liệu Decimal / Định dạng VNĐ chuẩn | **ĐẠT** | Định dạng số tiền `xxx.xxx đ` chính xác không sai lệch |

---

## 5. KẾT LUẬN

Hệ thống POS Mì Cay Sơn Bảo đã hoàn thành xuất sắc toàn bộ các mục tiêu tối ưu hoá Responsive:
1. Giao diện người dùng trên điện thoại di động (Khách gọi món QR và Nhân viên quầy POS) đạt chuẩn vuốt chạm ngón cái mượt mà.
2. Trải nghiệm trên máy tính bảng (dọc và ngang) chuẩn xác cho thu ngân quầy và nhân viên chạy bàn.
3. Độ ổn định cao, không phát sinh bất kỳ lỗi hồi quy (regression) nào trong hệ thống kiểm thử tự động.
