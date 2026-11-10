# BÁO CÁO TOÀN DIỆN AUDIT & KẾ HOẠCH TRIỂN KHAI TỐI ƯU HOÁ UI/UX HỆ THỐNG POS MÌ CAY

> **Dự án:** Hệ thống POS & Quản trị Vận hành cho Quán Mì Cay  
> **Phương pháp kiểm thử:** Real Browser Automation với `agent-desktop` và `chrome-devtools` trên môi trường thật (NestJS :3000 + React Vite :5173 + PostgreSQL :5432).  
> **Phạm vi:** 10 Module toàn hệ thống, 5 kích thước màn hình (Mobile, Tablet Portrait, Tablet Landscape, Laptop, Desktop).  
> **Tình trạng kiểm thử:** 302/302 tests PASS 100%, `typecheck` 0 lỗi.

---

## 1. TỔNG QUAN KẾT QUẢ AUDIT TOÀN DIỆN

Hệ thống đã được duyệt và rà soát trực tiếp từng pixel trên trình duyệt thật qua công cụ `agent-desktop` và `chrome-devtools`. Toàn bộ 10 module và luồng trải nghiệm khách hàng (Customer QR Mobile) đã được kiểm tra:

| STT | Module | URL Path | Trạng thái Audit | Bằng chứng ảnh |
|:---:|:---|:---|:---:|:---|
| 1 | POS Bán hàng & Quầy Thu ngân | `/pos` | **Hoàn hảo** | `01-pos-desktop.png`, `01-pos-table01-selected.png` |
| 2 | Quản lý Hoá đơn | `/invoices` | **Hoàn hảo** | `02-invoices-desktop.png`, `02-invoices-detail-modal.png` |
| 3 | Quản lý Kho & Nhập hàng | `/inventory` | **Hoàn hảo** | `03-inventory-desktop.png` |
| 4 | Kết ca & Quản lý Sổ quỹ | `/cashflow` | **Hoàn hảo** | `04-cashflow-desktop.png` |
| 5 | Quản trị Nhân sự (HR) | `/employees` | **Hoàn hảo** | `05-employees-desktop.png` |
| 6 | Lịch làm việc Ma trận | `/schedules` | **Hoàn hảo** | `06-schedules-desktop.png` |
| 7 | Quản trị Master Data (MDM) | `/master-data` | **Hoàn hảo** | `07-master-data-desktop.png` |
| 8 | Phân quyền Hệ thống (RBAC) | `/rbac` | **Hoàn hảo** | `08-rbac-desktop.png` |
| 9 | Hồ sơ Cá nhân | `/profile` | **Hoàn hảo** | `09-profile-desktop.png` |
| 10 | Đặt món QR Khách (Mobile) | `/qr/:token` | **Hoàn hảo** | `10-qr-mobile.png`, `10-qr-modifier-sheet.png`, `10-qr-cart-bar.png`, `10-qr-cart-sheet.png`, `10-qr-mobile-updated.png` |

---

## 2. CHI TIẾT CÁC PHÁT HIỆN & BIỆN PHÁP KHẮC PHỤC TRIỆT ĐỂ

### 2.1. Lỗi dư thừa dấu cộng (`+ + Thao tác`) và Text không căn giữa
- **Hiện tượng:**
  - Nút "+ TẠO ĐƠN MANG VỀ" trong `table-grid-panel.tsx` bị chèn thừa cả icon `<Plus />` lẫn chữ `+`, hiển thị thành `+ + TẠO ĐƠN MANG VỀ`.
  - Nút thêm mới trong `inventory-page.tsx` hiển thị `+ Thêm mới` kèm icon.
  - Chữ "Thêm" trong thẻ món ăn menu POS và nút "+ Chọn" trong trang QR khách bị xô lệch, không căn giữa pixel-perfect.
- **Giải pháp đã thực thi:**
  - Chuẩn hoá toàn bộ text nút: loại bỏ dấu `+` dạng chuỗi thô khi đã có icon `<Plus />`.
  - Căn giữa pixel-perfect với `inline-flex items-center justify-center gap-1.5`.
  - Thêm `select-none` và `font-semibold`/`font-bold` giúp chữ sắc nét, nịnh mắt.

### 2.2. Vấn đề cuộn trang & Bị kẹt nội dung (Scroll Locking / Overflow Trap)
- **Hiện tượng:**
  - Khi danh sách món ăn hoặc danh sách bàn dài, hoặc khi mở modal chi tiết hoá đơn / form nhân sự, thanh cuộn bị khoá cứng hoặc các nút hành động (Lưu, Xác nhận, Huỷ, In) bị đẩy tụt xuống đáy ngoài tầm nhìn.
- **Giải pháp đã thực thi:**
  - Áp dụng kiến trúc **Flexbox 3 tầng cố định (Fixed Header - Scrollable Body - Fixed Footer)** cho toàn bộ Modal và Drawer:
    - **Header:** `p-4 sm:p-5 border-b shrink-0 bg-card` (Cố định ở đỉnh).
    - **Body:** `flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4 sm:p-5` (Chỉ cuộn mượt nội dung bên trong, hỗ trợ vuốt chạm cảm ứng).
    - **Footer:** `p-4 border-t bg-muted/20 shrink-0 flex items-center justify-end gap-2` (Luôn ghim cố định ở đáy, không bao giờ bị che khuất).
  - Khắc phục triệt để trên:
    - `InvoiceDetailModal` (`invoice-detail-modal.tsx`)
    - `EmployeeFormDrawer` (`employee-form-drawer.tsx`)
    - `InventoryImportDrawer` (`inventory-import-drawer.tsx`)
    - `PermissionsDrawer` (`permissions-drawer.tsx`)
    - `TableActionDialog` (`table-action-dialog.tsx`)
    - `CheckoutConfirmDialog` (`checkout-confirm-dialog.tsx`)
    - `ModifierSelectorSheet` & `CartSheet` (`qr-order-page.tsx`)

### 2.3. Trải nghiệm vuốt chạm (Touch Ergonomics) & Phản hồi xúc giác (Haptic Click Feedback)
- **Hiện tượng:**
  - Các nút icon trong BaseTable (Sửa, Xoá, Xem, Kích hoạt) có diện tích bấm nhỏ, không có hiệu ứng nhấn nên người dùng không có cảm giác phản hồi khi thao tác trên màn hình cảm ứng hoặc tablet.
- **Giải pháp đã thực thi:**
  - Chuẩn hoá kích thước bấm tối thiểu đạt chuẩn WCAG / Apple Human Interface Guidelines:
    - Nút bảng: `h-8 w-8 p-0 rounded-lg` kèm `active:scale-95 transition-transform`.
    - Nút chính (Submit / Confirm / Checkout / Cart): `min-h-[42px]` đến `min-h-[48px]`, `active:scale-[0.98] transition-transform shadow-xs`.
    - Nút chọn món trên QR Mobile: `min-h-[44px] min-w-[80px]` kèm `active:scale-[0.98]`.

### 2.4. Tối ưu hoá Responsive Đa thiết bị
- **Mobile (390 × 844 & 412 × 915):**
  - Chuyển đổi POS thành 3 tab mượt mà: Sơ đồ bàn ↔ Thực đơn ↔ Hoá đơn.
  - Giỏ hàng QR khách dạng thanh nổi cố định sát đáy (`fixed inset-x-0 bottom-0`) kèm Bottom Sheet vuốt từ dưới lên.
  - Ẩn các badge kỹ thuật nội bộ (`BEP_NAU`, `BEP_CHIEN`) trên giao diện khách hàng.
- **Tablet Portrait (768 × 1024 - iPad phục vụ bàn):**
  - Dialog và Sheet có `max-h-[88dvh]` và `w-[calc(100vw-2rem)]`, không bị tràn mép hay che lấp nút.
- **Tablet Landscape (1024 × 768 - Quầy thu ngân):**
  - Tỷ lệ chia đôi màn hình POS tối ưu 60/40; danh sách bàn hiển thị 5-6 cột rõ nét; giỏ hàng hoá đơn dễ nhìn và phản hồi tức thì.
- **PC & TV (1366 × 768 & 1920 × 1080):**
  - Sidebar co giãn mượt mà; các bảng dữ liệu `BaseTable` phân bố padding cân đối, không bị cuộn ngang không cần thiết trên màn hình lớn.

---

## 3. KẾ HOẠCH TRIỂN KHAI & TIÊU CHUẨN ĐÃ HOÀN TẤT (ROLLOUT CHECKLIST)

- [x] **Bước 1: Audit toàn diện 10 module trên trình duyệt thật**
  - Xác thực thực tế qua `chrome-devtools` và `agent-desktop`
  - Chụp ảnh bằng chứng trực quan lưu tại `docs/test-reports/ui-ux-audit/`
- [x] **Bước 2: Xử lý dứt điểm các lỗi căn chỉnh, text và icon**
  - Loại bỏ dấu `+` thừa, căn giữa icon và chữ
  - Ẩn nhãn kỹ thuật không cần thiết
- [x] **Bước 3: Chuẩn hoá cấu trúc 3 tầng cho toàn bộ Modal/Drawer**
  - Fixed Header, Scrollable Body, Fixed Footer
  - Đảm bảo các nút bấm Xác nhận / In / Huỷ luôn hiển thị 100%
- [x] **Bước 4: Nâng cấp trải nghiệm nút bấm (Touch Target & Active Feedback)**
  - Tích hợp `active:scale-95` và `active:scale-[0.98]`
  - Bổ sung `select-none` và `touch-manipulation` chống double-tap zoom ngoài ý muốn
- [x] **Bước 5: Kiểm định tự động hoá 100%**
  - `pnpm -r typecheck`: 0 lỗi trên toàn bộ Monorepo
  - `pnpm -r test`: 302/302 tests PASS 100% (Shared: 19, Api-server: 233, Web-app: 50)
