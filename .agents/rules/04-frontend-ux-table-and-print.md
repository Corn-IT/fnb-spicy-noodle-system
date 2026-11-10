# 04 — Frontend UX, Base Table & In nhiệt (Frontend UX, Table & Thermal Print Rules)

> Áp dụng cho: Antigravity (Phase 5 — stories 08-12). Kết hợp skills: `react-vite-expert`, `tailwindcss-design-system`, `frontend-checklist`.

---

## 1. Core Layout (Module 9)

### Sidebar (trái):
- Resizable: user kéo chuột thay đổi độ rộng → lưu vào `ui_preferences.sidebar_width`.
- Hiển thị menu navigation cho các module — **CHỈ** hiện modules mà user có `permissions[module].view = true`.
- Collapsed mode: chỉ hiện icon, hover để xem tooltip.

### Navbar (trên):
- Thứ tự góc phải: `[Search icon]` → `[Dark/Light toggle]` → `[Avatar dropdown]`.
- Avatar dropdown: `Hồ sơ tài khoản`, `Đăng xuất`.

### Command Palette (Ctrl+K):
- Popup tìm kiếm tất cả màn hình theo tên.
- **MUST** lọc theo RBAC — user chỉ thấy màn hình có quyền truy cập.
- Dùng component `Command` từ `shadcn-ui/ui`.

### Trang Hồ sơ tài khoản:
- Đọc từ **CẢ HAI** bảng `employees` + `users` (JOIN).
- Chức vụ và Chuyên môn hiển thị dạng badge **readonly** (lấy từ `employees`).
- Cho phép sửa: thông tin cá nhân, ngân hàng, avatar (upload + crop).

## 2. Logout Behavior (HARD INVARIANT)

Khi bấm Đăng xuất, thực hiện **ĐÚNG** thứ tự:
1. `queryClient.clear()` → xoá toàn bộ TanStack Query cache (dữ liệu API).
2. Xoá auth tokens khỏi memory/storage.
3. Xoá Zustand auth state.
4. **FORBIDDEN** xoá `ui_preferences` khỏi `localStorage`.
5. **FORBIDDEN** xoá `ui_preferences` khỏi Zustand store (nếu persisted riêng).

> Lý do: người dùng tiếp theo đăng nhập trên cùng máy KHÔNG nên mất column widths, sidebar width, theme. Đây là settings per-device, lưu cả `localStorage` lẫn sync lên `users.ui_preferences` trên DB.

## 3. BaseTable Component (TanStack Table v8)

- **MUST** xây trên TanStack Table v8 với `columnResizeMode: 'onChange'`.
- **MỌI** data table trong hệ thống **MUST** dùng shared BaseTable component.
- Nằm tại: `apps/web-app/src/components/base-table/`.

### Performance kéo giãn cột:
- Dùng **CSS Variables** + `requestAnimationFrame` cho 60fps drag — **NEVER** re-render React state mỗi pixel.
- Khi thả chuột sau kéo: `debounce(500ms)` → save column widths vào `localStorage` → async `PATCH /api/v1/profile/ui-prefs`.

### Tính năng:
- Column resize: kéo giãn mọi cột.
- Column order & visibility: cấu hình per-table, lưu vào `ui_preferences`.
- Pagination: server-side, page sizes cấu hình được.
- Thanh tìm kiếm: text input cho keyword filtering.

### Cấu trúc Cột & Bộ lọc theo Module (Đồng bộ `01-PRD-Master.md`):
| Module | Các Cột Chuẩn trên BaseTable | Bộ lọc & Thanh công cụ | Hành động |
|--------|------------------------------|------------------------|-----------|
| 2 (Hoá đơn) | 7 cột: `1. STT`, `2. Mã HĐ (HD-YYYYMMDD-NNNN)`, `3. Bàn/Hình thức`, `4. Thời điểm tạo`, `5. Tổng tiền & PTTT` (Badge `CASH`/`TRANSFER`/`SPLIT`), `6. Ghi chú & Trạng thái`, `7. Thao tác` | **Bộ lọc kép tách bạch:** Bên trái `DateRangePicker` (mặc định `Hôm nay`) + Bên phải Dropdown tiêu chí (`Mã hoá đơn`, `Số bàn`, `Ghi chú`) kèm ô `keyword` (điều kiện AND) | Icon `Eye` xem chi tiết/in lại bill; Nút `Huỷ đơn (Void)` (chỉ hiện khi có `invoices:void`, bắt buộc nhập `void_reason` >= 10 ký tự) |
| 4 (Lịch sử Kết ca) | Ngày/Ca, Ngân sách đầu ca, Thu tiền mặt, Thu QR, Chi tiền két, Tiền lý thuyết, Tiền thực đếm, Chênh lệch, Tình trạng (`Chuẩn`/`Dư`/`Thiếu`), Người đóng ca | Lọc theo khoảng ngày + Lưới đếm tiền theo mệnh giá (`500k..1k`) & Bảng tóm tắt bàn giao tiền mặt cuối ca | Nút `[Kết ca]` (bắt buộc nhập ghi chú giải trình nếu `discrepancy_amount !== 0`) |
| 5 (Nhân viên) | 7 cột: `1. STT`, `2. Tên nhân viên (+ short_name)`, `3. Năm sinh`, `4. Chức vụ`, `5. Chuyên môn`, `6. Ghi chú`, `7. Thao tác` | Dropdown lọc theo `Chức vụ` hoặc `Chuyên môn` (lấy từ MDM) + ô tìm kiếm Tên / SĐT | Icon `Eye` xem chi tiết, `Pencil` chỉnh sửa, `Trash` xoá mềm có confirm |
| 3 (Nhập hàng) | 9+1 cột: `1. STT`, `2. Ngày nhập`, `3. Tên món hàng`, `4. Nhà cung cấp`, `5. ĐVT`, `6. Đơn giá`, `7. Số lượng`, `8. Thành tiền`, `9. Nguồn tiền & Ghi chú` (`CASH_DRAWER`/`EXTERNAL`), `10. Thao tác` + Dòng tổng kết chân bảng | Keyword + Date range → chỉ dùng lọc **lịch sử** | Nút `[+ Thêm mới]` mở Drawer bên phải; chọn NCC từ MDM; Icon `Trash` xoá mềm có confirm |
| 7 (MDM) | Danh mục gốc 5 Tabs: `POSITION`, `SPECIALTY`, `INGREDIENT`, `UNIT`, `SUPPLIER` (Tên hiển thị, `normalized_name`, `metadata`, trạng thái) | Chuyển Tab Category + Keyword | CRUD trực tiếp qua `MdmService.findOrCreate()` |
| 8 (Phân quyền) | `username`, `Họ tên nhân viên` (1-1), `Trạng thái`, nút `[+ Thêm mới tài khoản]` (chỉ Super Admin) | Keyword tìm user | Click Bánh răng Settings / Row → mở Drawer Phân quyền |

## 4. Drawer Component Pattern

- Mở từ bên **PHẢI** màn hình (nhất quán toàn hệ thống).
- Dùng component `Sheet` từ `shadcn-ui/ui`.

### Module 3 — Drawer Nhập hàng:
- Form multi-line cho thêm items nhập hàng.
- Trường tên nguyên liệu: **Combobox** gọi `GET /api/v1/mdm/lookup?category=INGREDIENT` autocomplete.
- Trường nhà cung cấp: **Combobox** gọi `GET /api/v1/mdm/lookup?category=SUPPLIER`; phiếu lưu MDM ID và tên nhà cung cấp tại thời điểm nhập.
- Nếu user gõ tên mới không có trong MDM → auto-save qua `MdmService.findOrCreate` khi submit.
- ⚠️ **QUAN TRỌNG**: Thanh tìm kiếm trên BaseTable là cho **lọc lịch sử**. Combobox trong Drawer là cho **tìm/thêm nguyên liệu**. Đây là 2 cơ chế tìm kiếm **KHÁC NHAU** — NEVER nhầm lẫn.

### Module 8 — Drawer Phân quyền:
- Mở khi click vào hàng user trên table.
- Hiển thị checkboxes truy cập màn hình (`view`) per module.
- Bên dưới mỗi module checkbox: Dropdown CRUD (create, update, delete).
- Sub-permissions: checkboxes bổ sung (cashflow:config, invoices:void).
- Hàng Super Admin: tất cả checkboxes hiển thị nhưng **DISABLED** (readonly).

## 5. POS Unified Screen (Module 1)

### Layout Split-View:
- Panel trái (50-60%): chuyển đổi giữa:
  - **Tab 1**: Sơ đồ bàn (bàn 01-30 dạng ô màu) + nút "Mang về MV-#" phía dưới.
    - Màu ô: xanh lá = `AVAILABLE`, cam = `PENDING`, đỏ = `OCCUPIED`.
  - **Tab 2**: Menu chọn món (categories trên, items dưới với +/- số lượng, cấp độ cay, topping).
- Panel phải (40-50%): Hoá đơn điện tử (live updating):
  - Header: số bàn hoặc "Mang về #08".
  - Danh sách món nhóm theo `batch_no` ("Lượt 1", "GỌI THÊM - Lượt 2").
  - Cụm nút hành động:
    1. `[Đổi/Gộp bàn]` — modal chọn bàn đích + loại action.
    2. `[Tách đơn]` — gọi split-kitchen API, auto-print 3 phiếu nhiệt.
    3. `[In tạm tính (QR)]` — in phiếu tạm tính + VietQR, giữ `SERVING`.
    4. `[Thanh toán]` — dialog xác nhận 2 bước → `PAID`.

## 6. QR Order Page (Mobile-first)

- Route: `/qr/:token` — không cần authentication.
- Responsive mobile design.
- Hiển thị: menu nhà hàng (hình ảnh, cấp độ cay, topping, số lượng, nút gửi đơn).
- Sau khi gửi: hiện trạng thái "Đã gửi đơn, vui lòng chờ thu ngân xác nhận".
- Lắng nghe Socket.io:
  - `order:status_updated` → cập nhật text ("Bếp đang chế biến" / "Cảm ơn quý khách").
  - `order:session_redirected` → seamless redirect bàn mới (không cần quét QR lại).

## 7. In nhiệt 80mm (Thermal Print Rules — Đồng bộ PRD §4)

### Cấu hình Trình duyệt & CSS `@media print`:
- Khởi chạy trình duyệt máy POS với cờ `--kiosk-printing` để in ngầm dưới 500ms và tự động kích hoạt dao cắt giấy vật lý giữa các phiếu.
```css
@media print {
  @page {
    size: 80mm auto;
    margin: 0;
  }
  body * {
    visibility: hidden;
  }
  #thermal-print-container, #thermal-print-container * {
    visibility: visible;
  }
  #thermal-print-container {
    position: absolute;
    left: 0;
    top: 0;
    width: 72mm; /* Trừ lề an toàn 4mm mỗi bên cho khổ giấy 80mm */
  }
  .ticket-page {
    width: 100%;
    padding: 2mm 0;
    break-after: page;
    page-break-after: always; /* Kích hoạt dao cắt giấy tự động giữa các phiếu */
  }
}
```

### 5 Mẫu Phiếu In Nhiệt Chuẩn:
1. **Phiếu Tách bếp (Tối đa 3 phiếu rời nhau theo từng trạm có món mới):**
   - Header: Logo trạm (`CHEF_HAT_NOODLE` / `FRENCH_FRIES` / `DRINK_CUP`) + Tiêu đề trạm (`BẾP NẤU (MÌ CAY)` / `BẾP CHIÊN` / `QUẦY NƯỚC UỐNG`).
   - Body: Số bàn (hoặc `"Mang về #08"`), Mã đơn, Thời gian, Lượt gọi (`"Lượt 1"` hoặc `"[GỌI THÊM - LƯỢT {batch_no}]"`), danh sách món + cấp độ cay + topping + ghi chú.
   - Nếu bàn vừa chuyển: Dòng cảnh báo `"[GHI CHÚ ĐỔI BÀN: Chuyển từ BÀN 01 sang BÀN 07]"`.
2. **Phiếu Thông báo Chuyển bàn (`EC-POS-04`):**
   - Tự động in ngay khi thực hiện `MOVE` / `MERGE` / `SWAP` trên đơn đã có món `kitchen_status = 'PRINTED'`.
   - Nội dung: `"⚠️ THÔNG BÁO ĐỔI BÀN ⚠️"`, Mã đơn, `"CHUYỂN TỪ: >>> BÀN 01 <<< SANG BÀN: >>> BÀN 07 <<<"`, thời gian và danh sách các trạm bị ảnh hưởng.
3. **Phiếu Báo Huỷ Món / Điều chỉnh Bếp (`EC-POS-06` Nhánh B):**
   - Tự động in xuống trạm bếp tương ứng khi thu ngân huỷ hoặc sửa món đã ở trạng thái `PRINTED` (`"PHIẾU BÁO HUỶ MÓN: BÀN 07 - HUỶ 01 MÌ BÒ CẤP 3"`).
4. **Phiếu Tạm tính (Kèm mã VietQR động — Hard Invariant 4):**
   - Danh sách món + tổng tiền + ảnh mã VietQR động chuẩn Napas247 (nhúng sẵn `total_amount` và nội dung `TT {order_code}`). Đơn vẫn giữ nguyên trạng thái `SERVING`.
5. **Hoá đơn Thanh toán Chính thức (Bill cuối — `PAID`):**
   - In sau khi bấm `Thanh toán → Xác nhận & In hoá đơn`, ghi rõ trạng thái `PAID`, phương thức thanh toán (`CASH` / `TRANSFER` / `SPLIT`), thời điểm thanh toán và tên thu ngân.

## 8. Unsaved Changes Guard (Module 6)

- **MUST** implement **CẢ HAI**:
  1. `window.addEventListener('beforeunload', handler)` — bắt close/refresh trình duyệt.
  2. React Router navigation blocker — bắt chuyển trang trong app.
- Dialog: `"Bạn có thay đổi chưa lưu. Bạn có chắc muốn rời trang?"`.
- Active khi grid đã sửa nhưng chưa save. Deactivate sau khi save thành công.
