# BMAD Quy tắc Bất biến & Danh mục Tình huống Biên
# 03-Edge-Cases-And-Invariants.md — 10 Hard Invariants & Edge Cases Catalog

> **Tài liệu:** 03-Edge-Cases-And-Invariants.md  
> **Phiên bản:** 1.0.0 (BMAD Phase 1 Final)  
> **Vai trò thực hiện:** BMAD Business Analyst, Principal Architect & QA Specialist  
> **Trạng thái:** FINAL  
> **Ngày phê duyệt:** 2026-11-07  
> **Mục tiêu:** Định hình "Hiến pháp kỹ thuật", loại bỏ 100% mơ hồ nghiệp vụ và rủi ro sập hệ thống trong giờ cao điểm.

---

## PHẦN 1: 10 QUY TẮC BẤT BIẾN (HARD INVARIANTS)

> [!CAUTION]
> **VIOLATION = REJECT.**  
> Mọi dòng code, migration, truy vấn SQL, cấu hình giao diện hay bài test vi phạm bất kỳ quy tắc nào dưới đây đều bị từ chối nghiệm thu ngay lập tức mà không có ngoại lệ.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               10 HARD INVARIANTS CỦA DỰ ÁN                             │
├────┬─────────────────────────────────┬─────────────────────────────────────────────────┤
│ #  │ Tên Quy tắc                     │ Tôn chỉ Bất biến (Non-negotiable Directive)     │
├────┼─────────────────────────────────┼─────────────────────────────────────────────────┤
│ 1  │ Cô lập Module                   │ CẤM import trực tiếp giữa các src/features/*    │
│ 2  │ Đơn Mang về (TAKEAWAY)          │ table_id = NULL, takeaway_number NOT NULL       │
│ 3  │ Delta Split 3 Trạm Bếp          │ CHỈ lọc kitchen_status = 'NEW', CẤM in lại cũ   │
│ 4  │ Tách bạch Tạm tính vs Thanh toán│ In tạm tính giữ SERVING; Thanh toán đóng PAID   │
│ 5  │ Khoá dòng Table Actions         │ Bắt buộc SELECT ... FOR UPDATE trong $trans     │
│ 6  │ Công thức Kết ca Dòng tiền      │ Chỉ tính CASH, trừ CASH_DRAWER; CẤM cộng QR     │
│ 7  │ MDM Chuẩn hoá Chuỗi             │ trim() -> Title Case -> strip diacritics -> low │
│ 8  │ RBAC 401 vs 403                 │ 401 khi hỏng/thiếu Auth; 403 khi thiếu Quyền    │
│ 9  │ Giữ UI Preferences khi Logout   │ Xoá token & data cache; CẤM xoá ui_preferences  │
│ 10 │ Kiểu Tiền tệ NUMERIC(12, 2)     │ Bắt buộc NUMERIC / Decimal; CẤM FLOAT / INT     │
└────┴─────────────────────────────────┴─────────────────────────────────────────────────┘
```

---

### INVARIANT 1: CÔ LẬP MODULE (FEATURE ISOLATION)
- **Đặc tả:** Ứng dụng Frontend (`apps/web-app`) tuân thủ nghiêm ngặt mô hình `bulletproof-react`. Mỗi thư mục trong `src/features/<feature>/` là một ranh giới đóng kín (Bounded Context):
  - Sole Public API của module là file barrel `index.ts`.
  - **NGHIÊM CẤM:** Không được phép import trực tiếp giữa các thư mục feature (Ví dụ: `src/features/invoices` cấm `import from '@/features/pos-counter/components/...'`).
  - Mọi logic, kiểu dữ liệu, hoặc thành phần giao diện cần chia sẻ giữa từ 2 modules trở lên **BẮT BUỘC** phải đưa vào:
    1. `packages/shared/`: Cho các kiểu dữ liệu TypeScript, Zod Schema, DTOs, Enums.
    2. `apps/web-app/src/components/`: Cho các UI Components dùng chung (BaseTable, PrintTemplates, Modal...).
    3. `apps/web-app/src/hooks/` hoặc `src/utils/`: Cho các hàm tiện ích toàn cục.
- **Hệ quả nếu vi phạm:** Gây ra hiện tượng phụ thuộc vòng (Circular Dependencies), phá vỡ khả năng phân mảnh story (BMAD Sharding), và khiến việc refactor một module làm sập toàn bộ các màn hình khác.

---

### INVARIANT 2: ĐƠN MANG VỀ (TAKEAWAY VS DINE-IN ENFORCEMENT)
- **Đặc tả:** Được thực thi bởi CHECK Constraint cứng ở tầng Database PostgreSQL:
  ```sql
  ALTER TABLE orders ADD CONSTRAINT chk_order_type_target CHECK (
    (order_type = 'DINE_IN' AND table_id IS NOT NULL AND takeaway_number IS NULL) OR
    (order_type = 'TAKEAWAY' AND table_id IS NULL AND takeaway_number IS NOT NULL)
  );
  ```
- **Hành vi bắt buộc:**
  1. Khi `order_type = 'TAKEAWAY'`: Cột `table_id` **BẮT BUỘC LÀ NULL**, cột `takeaway_number` **BẮT BUỘC KHÁC NULL**.
  2. Khi `order_type = 'DINE_IN'`: Cột `table_id` **BẮT BUỘC KHÁC NULL**, cột `takeaway_number` **BẮT BUỘC LÀ NULL**.
  3. Giá trị `takeaway_number` là số nguyên tự tăng trong ngày (`1, 2, 3...`) và **tự động reset về 1 vào 00:00:00 đầu ngày mới**. Nhãn hiển thị quy chuẩn: `"Mang về #01"`, `"Mang về #02"`.
- **Hệ quả nếu vi phạm:** Khách mua mang về bị gộp chung vào một "Bàn mang về" ảo, dẫn đến việc nhiều khách mua mang về độc lập bị nấu nhầm vào chung một hoá đơn; hoặc đơn ăn tại bàn bị mất thông tin bàn gây bưng nhầm đồ ăn.

---

### INVARIANT 3: DELTA SPLIT 3 TRẠM BẾP (IN TÁCH BẾP MÓN MỚI)
- **Đặc tả:** API `POST /api/v1/pos/orders/:id/split-kitchen`:
  1. **CHỈ ĐƯỢC PHÉP** truy vấn và xử lý các bản ghi `order_items` có `kitchen_status = 'NEW'`.
  2. Với các món có `station = 'COMBO'`: Phân rã thành các sub-items và gán về đúng trạm chế biến gốc (`BEP_NAU`, `BEP_CHIEN`, `PHA_CHE`). **CẤM TUYỆT ĐỐI** gửi phiếu in có chữ `COMBO` xuống bếp.
  3. Sau khi phân nhóm và chuẩn bị phiếu in, chuyển trạng thái toàn bộ các món đó từ `'NEW'` sang `'PRINTED'`.
  4. Đánh số lượt gọi: `batch_no = MAX(batch_no) + 1`. Nếu `batch_no > 1`, in dòng chữ: `"[GỌI THÊM - LƯỢT {batch_no}]"`.
  5. **NGHIÊM CẤM:** Tuyệt đối không bao giờ in lại các món đã ở trạng thái `'PRINTED'`.
- **Hệ quả nếu vi phạm:** Khi khách gọi thêm 1 ly nước ngọt ở lượt 2, máy in bếp nấu sẽ in lại 2 tô mì cay của lượt 1. Bếp nhìn phiếu tưởng đơn mới và nấu thêm 2 tô mì nữa, gây thất thoát chi phí thực phẩm và tranh cãi giữa bếp và thu ngân.

---

### INVARIANT 4: TÁCH BẠCH TẠM TÍNH VÀ THANH TOÁN (BILLING FLOW INTEGRITY)
- **Đặc tả:**
  - **Nút "In tạm tính (Kèm VietQR động)":**
    - Trạng thái của đơn hàng **BẮT BUỘC GIỮ NGUYÊN LÀ `'SERVING'`**.
    - Sinh ảnh mã VietQR động theo chuẩn Napas247 nhúng `total_amount` và nội dung `TT {order_code}`.
    - **CẤM TUYỆT ĐỐI** chuyển trạng thái đơn sang `'PAID'`.
    - Bàn ăn vẫn giữ nguyên trạng thái `'OCCUPIED'`.
  - **Nút "Thanh toán (Đóng đơn)":**
    - Mở pop-up xác nhận 2 bước chống bấm nhầm (`Xác nhận / Huỷ bỏ`).
    - Khi bấm Xác nhận: Cập nhật `orders.status = 'PAID'`, ghi nhận `paid_at = NOW()`, phương thức thanh toán (`CASH` / `TRANSFER` / `SPLIT`).
    - Giải phóng bàn: `dining_tables.status = 'AVAILABLE'`, `dining_tables.active_order_id = NULL`.
- **Hệ quả nếu vi phạm:** Nếu bấm "Tạm tính" mà hệ thống đã chuyển sang `PAID`, đơn hàng bị đóng lại, khách kiểm tra thấy thiếu/sai món sẽ không thể sửa được nữa, bàn bị giải phóng sớm khi khách chưa đứng dậy, và dòng tiền kết ca bị ghi nhận khống khi khách chưa chuyển tiền xong.

---

### INVARIANT 5: KHOÁ DÒNG CHO TABLE ACTIONS (CONCURRENCY CONTROL)
- **Đặc tả:** Mọi thao tác Chuyển bàn (`MOVE`), Gộp bàn (`MERGE`), Hoán đổi bàn (`SWAP`) và Tách bếp (`split-kitchen`) **BẮT BUỘC PHẢI THỰC HIỆN BÊN TRONG `prisma.$transaction()` VỚI CÂU LỆNH KHOÁ DÒNG**:
  ```typescript
  await prisma.$queryRaw`SELECT * FROM orders WHERE id = ${orderId} FOR UPDATE`;
  ```
- **Thứ tự khoá dòng chống Deadlock:** **ALWAYS** khoá bản ghi trong bảng `orders` trước, sau đó mới khoá các bản ghi trong bảng `dining_tables`.
- **Thời gian giữ khoá:** Phải hoàn thành dưới 50ms. **CẤM TUYỆT ĐỐI** gọi API bên thứ ba (như VietQR API hay Cloudflare R2) hoặc đọc ghi file trong khối transaction đã khoá dòng.
- **Hệ quả nếu vi phạm:** Xảy ra tranh chấp đồng thời (Race Condition) khi khách ở Bàn 1 đang bấm điện thoại gọi thêm món đúng tích tắc thu ngân bấm gộp Bàn 1 vào Bàn 7, làm mất món gọi thêm hoặc sinh ra hoá đơn mồ côi (Orphan Order).

---

### INVARIANT 6: CÔNG THỨC KẾT CA DÒNG TIỀN (CASHFLOW SETTLEMENT)
- **Đặc tả:** Công thức toán học tính tiền mặt lý thuyết trong két bắt buộc phải tuân thủ 100%:
  $$\text{expected\_cash} = \text{opening\_budget} + \sum_{\substack{\text{status} = \text{'PAID'} \\ \text{method} = \text{'CASH'}}} \text{total\_amount} - \sum_{\substack{\text{source} = \text{'CASH\_DRAWER'} \\ \text{is\_deleted} = \text{false}}} \text{total\_cost}$$
  $$\text{discrepancy} = \text{actual\_counted\_cash} - \text{expected\_cash}$$
- **2 ĐIỀU CẤM TUYỆT ĐỐI:**
  1. **FORBIDDEN** cộng doanh thu chuyển khoản QR (`TRANSFER`) vào `expected_cash` (vì tiền chuyển khoản nằm trong tài khoản ngân hàng của chủ, không nằm trong két tiền mặt của thu ngân).
  2. **FORBIDDEN** trừ phiếu nhập hàng thanh toán ngoài (`EXTERNAL`) khỏi `expected_cash` (vì khoản này do chủ chi riêng, không rút tiền từ két thu ngân).
- **Hệ quả nếu vi phạm:** Cứ mỗi hoá đơn chuyển khoản QR phát sinh trong ngày thì két tiền sẽ bị báo thiếu bấy nhiêu tiền. Thu ngân bị trừ lương oan ức và công thức đối soát trở nên vô giá trị.

---

### INVARIANT 7: MASTER DATA CHUẨN HOÁ CHUỖI (DATA NORMALIZATION)
- **Đặc tả:** Phương thức `MdmService.findOrCreate(category, rawInput)` phải thực hiện chuỗi 4 thao tác tuần tự:
  1. `trim()`: Xoá khoảng trắng ở 2 đầu.
  2. Title Case: Viết hoa chữ cái đầu mỗi từ (Ví dụ: `"Mì Kim Chi"`).
  3. Strip Diacritics & Lowercase: Chuyển toàn bộ ký tự tiếng Việt có dấu sang không dấu và viết thường để sinh `normalized_name` (Ví dụ: `"mi kim chi"`).
  4. Truy vấn đối chiếu `WHERE category = :cat AND normalized_name = :normalized AND is_active = true`. Chỉ tạo mới khi chưa tồn tại.
- **Hệ quả nếu vi phạm:** Cơ sở dữ liệu bị ô nhiễm nghiêm trọng (Data Pollution) bởi hàng trăm biến thể của cùng một món ("Mì Cay", "mì cay", "mi cay ", "Mỳ cay"), làm sai lệch hoàn toàn tính năng tìm kiếm lịch sử và gợi ý giá nhập kho.

---

### INVARIANT 8: PHÂN ĐỊNH MÃ LỖI RBAC 401 VS 403 (SECURITY CODE INTEGRITY)
- **Đặc tả:**
  - **HTTP 401 Unauthorized:** Dành riêng cho các lỗi liên quan đến Danh tính (Identity): Không có token, token hết hạn, token không đúng định dạng bí mật, hoặc sai thông tin đăng nhập. **CẤM TUYỆT ĐỐI TRẢ VỀ 403 CHO TRƯỜNG HỢP NÀY**.
  - **HTTP 403 Forbidden:** Dành riêng cho trường hợp Danh tính đã được xác thực hợp lệ (User đã đăng nhập thành công), nhưng tài khoản không có đủ quyền trong ma trận phân quyền để thực hiện hành động. **CẤM TUYỆT ĐỐI TRẢ VỀ 401 CHO TRƯỜNG HỢP NÀY**.
  - **Tách biệt MDM Lookup:** Endpoint `GET /api/v1/mdm/lookup` bắt buộc mở cho mọi tài khoản `authenticated` (không yêu cầu quyền quản trị MDM).
- **Hệ quả nếu vi phạm:** Trả về 401 khi user thiếu quyền sẽ khiến Frontend hiểu nhầm là hết hạn phiên đăng nhập và tự động đá văng thu ngân ra màn hình Login giữa giờ cao điểm.

---

### INVARIANT 9: GIỮ NGUYÊN CẤU HÌNH GIAO DIỆN KHI ĐĂNG XUẤT (UI PREFERENCES PRESERVATION)
- **Đặc tả:** Khi người dùng bấm nút "Đăng xuất" trên Navbar:
  1. Bắt buộc gọi `queryClient.clear()` để xoá sạch toàn bộ cache dữ liệu nghiệp vụ API (danh sách hoá đơn, dòng tiền, nhân viên).
  2. Xoá Access Token, Refresh Token và Auth State.
  3. **CẤM TUYỆT ĐỐI XOÁ `ui_preferences` KHỎI `localStorage` VÀ DATABASE**. Cấu hình theme (Sáng/Tối), độ rộng các cột bảng (Column Widths), và độ rộng Sidebar phải được giữ nguyên.
- **Hệ quả nếu vi phạm:** Mỗi khi nhân viên giao ca hoặc đăng xuất, toàn bộ độ rộng các cột bảng đã được căn chỉnh vừa mắt sẽ bị co rúm về mặc định, bắt người dùng phải dùng chuột kéo lại từng cột mỗi ngày.

---

### INVARIANT 10: KIỂU TIỀN TỆ BẮT BUỘC NUMERIC(12, 2) (DECIMAL MONETARY TYPE)
- **Đặc tả:** Toàn bộ các cột và biến biểu diễn tiền tệ:
  - Trong PostgreSQL: Bắt buộc dùng `NUMERIC(12, 2)`.
  - Trong Prisma Schema: Bắt buộc dùng `@db.Decimal(12, 2)` (kiểu TypeScript là `Prisma.Decimal`).
  - Trong Zod Schema: Bắt buộc validate qua `z.number().positive()` hoặc `z.instanceof(Decimal)`.
  - **NGHIÊM CẤM:** Tuyệt đối không dùng `FLOAT`, `DOUBLE`, `REAL`, hoặc `INT` cho tiền tệ.
- **Hệ quả nếu vi phạm:** Xảy ra sai số dấu phẩy động kinh điển (Ví dụ: `0.1 + 0.2 = 0.30000000000000004`), dẫn đến việc khi kết ca số tiền bị lệch vài đồng lẻ, làm trạng thái kết ca bị nhảy sang `SURPLUS` hoặc `SHORTAGE` sai thực tế.

---

## PHẦN 2: MINH HOẠ KỊCH BẢN KẾT CA HỖN HỢP (COMPREHENSIVE CASHFLOW SCENARIO)

Để kiểm chứng tính bất biến của **Hard Invariant 6**, hãy cùng phân tích kịch bản dòng tiền trong một ca làm việc thực tế tại quán mì cay:

### Dữ liệu Đầu vào trong Ca:
1. **Ngân sách mặc định đầu ca (`opening_budget`):** `1.000.000 đ` (Tiền lẻ trong két).
2. **Doanh thu bán hàng (5 đơn PAID):**
   - Đơn 1 (`HD001`): `150.000 đ` — Thanh toán: `CASH` (Tiền mặt).
   - Đơn 2 (`HD002`): `220.000 đ` — Thanh toán: `TRANSFER` (Chuyển khoản QR).
   - Đơn 3 (`HD003`): `85.000 đ` — Thanh toán: `CASH` (Tiền mặt).
   - Đơn 4 (`HD004`): `310.000 đ` — Thanh toán: `TRANSFER` (Chuyển khoản QR).
   - Đơn 5 (`HD005`): `120.000 đ` — Thanh toán: `CASH` (Tiền mặt).
   - *Tổng doanh thu bán hàng:* `885.000 đ` (Trong đó `CASH` = `355.000 đ`, `TRANSFER` = `530.000 đ`).
3. **Chi mua hàng nguyên vật liệu trong ca (Module 3):**
   - Phiếu 1: Mua đá bi và rau nấm: `120.000 đ` — Nguồn tiền: `CASH_DRAWER` (Lấy tiền trong két ra trả).
   - Phiếu 2: Nhập 2 thùng mì Koreno: `570.000 đ` — Nguồn tiền: `EXTERNAL` (Chủ quán chuyển khoản từ tài khoản riêng).
4. **Thu ngân đếm tiền thực tế trong két khi hết ca (`actual_counted_cash`):**
   - Lưới đếm tiền theo mệnh giá kiểm đếm được: `1.235.000 đ`.

### Tính toán theo Công thức Chuẩn:
$$\text{expected\_cash} = 1.000.000 + 355.000 - 120.000 = 1.235.000\text{ đ}$$
$$\text{discrepancy} = 1.235.000 - 1.235.000 = 0\text{ đ}$$
$$\text{status} = \text{'MATCHED' (Chuẩn)}$$

### So sánh với các cách tính Sai lầm (Common Bugs):
- **Nếu cộng gộp cả đơn TRANSFER (`530.000 đ`):**
  - $\text{expected\_cash} = 1.000.000 + 885.000 - 120.000 = 1.765.000\text{ đ}$
  - $\text{discrepancy} = 1.235.000 - 1.765.000 = -530.000\text{ đ}$ -> **Hệ thống báo THIẾU 530.000đ (SAI TRẦM TRỌNG)**.
- **Nếu trừ luôn phiếu nhập EXTERNAL (`570.000 đ`):**
  - $\text{expected\_cash} = 1.000.000 + 355.000 - 120.000 - 570.000 = 665.000\text{ đ}$
  - $\text{discrepancy} = 1.235.000 - 665.000 = +570.000\text{ đ}$ -> **Hệ thống báo THỪA 570.000đ (SAI TRẦM TRỌNG)**.

---

## PHẦN 3: DANH MỤC TÌNH HUỐNG BIÊN TOÀN DIỆN (DETAILED EDGE CASES CATALOG)

### 3.1. Nhóm POS, Đặt món QR & Tách Bếp (Modules 0 & 1)

#### `EC-POS-01`: Khách quét QR ở Bàn 1, sau đó dọn sang Bàn 7 và đặt thêm đồ từ Tab trình duyệt cũ
- **Bối cảnh:** Khách quét QR Bàn 1 gửi đơn. Sau 15 phút, khách xin chuyển sang Bàn 7 ngồi máy lạnh. Thu ngân đã bấm Chuyển bàn (`MOVE`) trên POS. Khách mở lại điện thoại (vẫn lưu tab trình duyệt cũ có URL `?table=01`) và bấm đặt thêm 2 chai nước.
- **Rủi ro:** Nếu hệ thống chỉ đọc `table=01` từ URL, một đơn hàng mới sẽ bị tạo cho Bàn 1 (lúc này Bàn 1 đã trống hoặc đã có khách khác vào ngồi).
- **Giải pháp Kỹ thuật:**
  1. Khi khách đặt đơn lần đầu, Backend trả về `activeOrderId = 538` và lưu vào `sessionStorage` trên điện thoại khách.
  2. Khi thu ngân chuyển bàn, Socket.io bắn sự kiện `order:session_redirected` tới room `order_session_538`.
  3. Trình duyệt khách nhận sự kiện và tự động cập nhật hiển thị thành `"Bàn 07"`.
  4. Khi khách bấm gọi thêm, request mang theo `activeOrderId = 538`. Backend kiểm tra thấy đơn 538 hiện đang gắn với Bàn 07 -> Tự động nạp món mới vào Bàn 07!
- **Tiêu chí Nghiệm thu (AC):** Món mới gọi thêm xuất hiện trên hoá đơn Bàn 07; Bàn 01 không phát sinh đơn mới.

#### `EC-POS-02`: Bàn đích khi Chuyển bàn (`MOVE`) không trống mà đang có khách (`OCCUPIED`)
- **Bối cảnh:** Thu ngân chọn nhầm bàn đích đang có khách ngồi ăn.
- **Giải pháp:** Backend kiểm tra trong transaction: Nếu `targetTable.status !== 'AVAILABLE'` -> Bắn ngay lỗi `HTTP 409 Conflict` kèm mã `POS_TABLE_NOT_AVAILABLE` và thông báo `"Bàn đích đang có khách phục vụ, vui lòng chọn bàn trống hoặc dùng tính năng Gộp bàn"`. Giao diện POS hiển thị toast lỗi màu đỏ, rollback toàn bộ transaction.

#### `EC-POS-03`: Yêu cầu Gộp bàn (`MERGE`) đối với đơn Mang về (`TAKEAWAY`)
- **Bối cảnh:** Thu ngân vô tình chọn đơn Mang về để gộp vào một bàn ăn tại chỗ.
- **Giải pháp:** Backend kiểm tra `if (order.order_type === 'TAKEAWAY')` -> Bắn lỗi `HTTP 409 Conflict` kèm mã `POS_TAKEAWAY_CANNOT_MERGE`. Đơn mang về là độc lập, **CẤM TUYỆT ĐỐI** tham gia vào nghiệp vụ MERGE bàn.

#### `EC-POS-04`: Chuyển bàn khi đơn ĐÃ CÓ món gửi xuống bếp (`kitchen_status = 'PRINTED'`)
- **Bối cảnh:** Khách chuyển từ Bàn 1 sang Bàn 7 sau khi bếp đã nấu được 5 phút (phiếu bếp cũ in chữ to BÀN 01).
- **Giải pháp:**
  1. Backend kiểm tra: Đơn có ít nhất 1 món `PRINTED` -> Đặt cờ `requireKitchenNoticePrint = true`.
  2. Trả về đối tượng `kitchenTransferSlip`:
     ```json
     {
       "title": "THÔNG BÁO CHUYỂN BÀN",
       "fromLabel": "BÀN 01",
       "toLabel": "BÀN 07",
       "orderCode": "HD-20261107-0039",
       "affectedStations": ["BEP_NAU", "PHA_CHE"]
     }
     ```
  3. Máy in nhiệt quầy tự động in ngay 1 phiếu cảnh báo chuyển bàn đưa xuống bếp để nhân viên bưng đồ qua Bàn 7.

#### `EC-POS-05`: Thu ngân Click liên tiếp nhiều lần vào nút "Tách đơn" (Double-Click Race)
- **Bối cảnh:** Giờ cao điểm mạng lag hoặc thu ngân sốt ruột bấm nút "Tách đơn" 3 lần liên tục trong 1 giây.
- **Giải pháp:**
  1. Frontend: Nút "Tách đơn" tự động disable và hiển thị Spinner ngay khi có request đang bay (`isPending = true`).
  2. Backend: Nhờ khoá dòng `SELECT ... FOR UPDATE`, request 1 khoá bản ghi và chuyển toàn bộ món `NEW` sang `PRINTED`. Request 2 và 3 khi được mở khoá sẽ thấy danh sách món `NEW` rỗng -> Trả về HTTP 200 `"Không có món mới cần tách"`, không sinh thêm phiếu in trùng lặp.

#### `EC-POS-06`: Khách xin Huỷ/Sửa món TRƯỚC vs SAU khi bấm "Tách đơn"
- **Bối cảnh:** Khách đổi ý không muốn ăn nữa hoặc muốn đổi cấp độ cay.
- **Giải pháp Phân nhánh:**
  - **Nhánh A (Món còn ở trạng thái `NEW` - Chưa in bếp):** Thu ngân click xoá hoặc sửa trực tiếp trên Hoá đơn điện tử. Backend hard delete hoặc cập nhật trực tiếp bản ghi, **KHÔNG CẦN IN PHIẾU BÁO BẾP**.
  - **Nhánh B (Món đã ở trạng thái `PRINTED` - Đã in phiếu xuống bếp):** Thu ngân bấm nút `"Huỷ món bếp"`. Backend chuyển trạng thái món sang `CANCELLED`, và tự động sinh phiếu `"PHIẾU BÁO HUỶ MÓN: BÀN 07 - HUỶ 01 MÌ BÒ CẤP 3"` bắn xuống máy in bếp nấu ngay lập tức.

---

### 3.2. Nhóm Hoá đơn & Dòng tiền (Modules 2 & 4)

#### `EC-FIN-01`: Huỷ hoá đơn đã thanh toán thành công (`status = 'PAID'`)
- **Bối cảnh:** Khách đã trả tiền xong và về, 10 phút sau chủ quán phát hiện thu ngân tính nhầm tiền hoặc nhân viên thông đồng gian lận bill.
- **Giải pháp:**
  1. Bắt buộc kiểm tra quyền: Chỉ tài khoản có quyền `invoices:void` (Quản lý/Admin) mới được phép gọi API `POST /api/v1/invoices/:id/void`. Thu ngân bấm vào sẽ nhận `403 Forbidden`.
  2. Bắt buộc truyền trường `voidReason` (lý do huỷ tối thiểu 10 ký tự).
  3. Backend chuyển trạng thái hoá đơn từ `PAID` sang `VOIDED`.
  4. Số tiền của hoá đơn `VOIDED` sẽ tự động bị loại bỏ khỏi công thức tính tiền mặt trong két và doanh thu ngày của Module 4.

#### `EC-FIN-02`: Thanh toán Hỗn hợp (Khách trả một phần Tiền mặt, một phần Chuyển khoản QR)
- **Bối cảnh:** Tổng hoá đơn `300.000 đ`. Khách đưa `100.000 đ` tiền mặt và muốn quét QR chuyển khoản nốt `200.000 đ`.
- **Giải pháp:**
  1. Tại dialog Thanh toán, thu ngân chọn phương thức `SPLIT`.
  2. Nhập `cash_amount = 100000`, `transfer_amount = 200000`. Hệ thống kiểm tra: `cash_amount + transfer_amount === total_amount` mới cho xác nhận.
  3. Khi kết ca ở Module 4: Hệ thống **CHỈ CỘNG 100.000 Đ** (tiền mặt) vào két thu ngân; 200.000 đ chuyển khoản được ghi nhận vào cột Doanh thu Ngân hàng.

#### `EC-FIN-03`: Tiền thực tế trong két bị Thừa (`SURPLUS`) hoặc Thiếu (`SHORTAGE`) khi Kết ca
- **Bối cảnh:** Do thu ngân thối nhầm tiền cho khách trong ca đông hoặc làm rơi mất tiền lẻ.
- **Giải pháp:**
  1. Sau khi nhập số tiền thực đếm, nếu `discrepancy_amount !== 0`, hệ thống hiển thị badge Cảnh báo màu Vàng (`SURPLUS`) hoặc Đỏ (`SHORTAGE`) kèm số tiền lệch.
  2. Bắt buộc thu ngân phải nhập ô `Ghi chú giải trình chênh lệch` mới được bấm nút "Xác nhận Đóng ca".
  3. Bản ghi kết ca lưu đầy đủ chi tiết số tờ từng mệnh giá (`denominations_detail`), người đóng ca và thời điểm đóng ca để chủ quán kiểm tra camera đối soát.

---

### 3.3. Nhóm Nhân sự & Lịch làm việc Excel (Modules 5 & 6)

#### `EC-HR-01`: Xung đột Trùng tên viết tắt Nhân viên trong Lịch làm việc
- **Bối cảnh:** Quán tuyển dụng 2 nhân viên cùng có tên lót và tên là "Văn Anh" (Nguyễn Văn Anh - ID 12 và Trần Văn Anh - ID 15).
- **Giải pháp Thuật toán:**
  ```typescript
  function resolveShortName(fullName: string, existingList: { shortName: string; id: number }[], empId: number): string {
    const words = fullName.trim().split(/\s+/);
    const lastName = words[words.length - 1];
    const middleInitial = words.length > 2 ? words[words.length - 2][0] + '.' : '';
    let candidate = `${middleInitial}${lastName}`; // "V.Anh"

    const isDuplicate = existingList.some(e => e.shortName === candidate && e.id !== empId);
    if (isDuplicate) {
      const firstInitial = words[0][0] + '.';
      candidate = `${firstInitial}${middleInitial}${lastName} (#${empId})`; // "N.V.Anh (#12)"
    }
    return candidate;
  }
  ```
- **Kết quả:** Trên bảng lịch làm việc, ô ca làm việc hiển thị tách bạch rõ ràng `N.V.Anh (#12)` và `T.V.Anh (#15)`.

#### `EC-HR-02`: Nhân viên bị Xoá mềm (`is_deleted = true`) giữa tuần làm việc
- **Bối cảnh:** Bạn nhân viên Nguyễn Văn Anh nghỉ việc vào ngày Thứ Tư. Quản lý vào Module 5 bấm xoá nhân viên đó.
- **Rủi ro:** Khi mở lại bảng Lịch làm việc của tuần đó ở Module 6, nếu câu query JOIN trực tiếp không xử lý, ô phân ca Thứ Năm và Thứ Sáu của bạn đó sẽ bị lỗi `null reference` làm sập (crash) toàn bộ màn hình.
- **Giải pháp:**
  1. API `GET /api/v1/schedules` truy vấn lịch sử dựa trên ID nhân viên mà không lọc `is_deleted = false` đối với các tuần trong quá khứ hoặc tuần hiện tại.
  2. Trên giao diện bảng ma trận, nếu nhân viên có `is_deleted === true`, Tag tên của bạn đó hiển thị trạng thái xám mờ (grayed out) kèm tooltip `(Đã nghỉ việc)`, bảng vẫn render bình thường 100%.

#### `EC-HR-03`: Người dùng chỉnh sửa Lịch làm việc nhưng quên bấm "Lưu" (Unsaved Changes)
- **Bối cảnh:** Quản lý ngồi xếp lịch suốt 20 phút cho cả tuần, vừa sửa xong thì có khách gọi, quản lý tiện tay click vào menu "Bán hàng POS" trên Sidebar hoặc ấn F5 trình duyệt.
- **Giải pháp:**
  1. Quản lý trạng thái `isDirty = true` trên client state khi có bất kỳ ô nào thay đổi giá trị.
  2. Đăng ký đồng thời 2 lớp bảo vệ:
     - Lớp 1 (Browser Native): `window.addEventListener('beforeunload', (e) => { if (isDirty) { e.preventDefault(); e.returnValue = ''; } })`.
     - Lớp 2 (In-app SPA Router): React Router Blocker bắt sự kiện chuyển route nội bộ, hiển thị Modal xác nhận:
       ```
       ┌─────────────────────────────────────────────────────────────┐
       │                 ⚠️ CẢNH BÁO THAY ĐỔI CHƯA LƯU               │
       ├─────────────────────────────────────────────────────────────┤
       │ Bạn có thay đổi trên bảng Lịch làm việc chưa được lưu lại.   │
       │ Nếu rời đi bây giờ, mọi chỉnh sửa phân ca của bạn sẽ bị mất!│
       ├─────────────────────────────────────────────────────────────┤
       │           [ HUỶ BỎ & Ở LẠI ]       [ RỜI ĐI KHÔNG LƯU ]      │
       └─────────────────────────────────────────────────────────────┘
       ```

---

### 3.4. Nhóm Giao diện, Navbar & Đăng xuất (Modules 8 & 9)

#### `EC-UI-01`: Đăng xuất trên Máy tính Quầy dùng chung nhiều Ca (Logout Cleanliness)
- **Bối cảnh:** Thu ngân ca sáng hết giờ làm, bấm "Đăng xuất" để thu ngân ca tối vào đăng nhập làm việc.
- **Rủi ro:** Nếu không dọn sạch cache, thu ngân ca tối có thể bấm nút Back trình duyệt và xem được doanh thu hay hoá đơn của ca sáng; hoặc ngược lại nếu xoá sạch `localStorage` thì thu ngân ca tối sẽ bị mất toàn bộ cấu hình kéo giãn cột bảng và theme Tối.
- **Giải pháp (Tuân thủ Hard Invariant 9):**
  1. Gọi `queryClient.clear()` -> Xoá sạch toàn bộ cache dữ liệu nghiệp vụ API trong RAM.
  2. Xoá Access Token và Refresh Token.
  3. **GIỮ NGUYÊN** khoá `localStorage.getItem('fnb-ui-preferences')`.
  4. Điều hướng trình duyệt về `/login`. Khi thu ngân mới đăng nhập, giao diện lập tức đọc lại độ rộng cột bảng và sidebar mà không cần cấu hình lại.

#### `EC-UI-02`: Thanh tìm kiếm Category trên Navbar (`Ctrl + K`) bị lộ màn hình cấm
- **Bối cảnh:** Thu ngân quầy chỉ có quyền vào màn hình POS và Nhập hàng, nhưng nhấn `Ctrl + K` gõ chữ "Phân quyền" hoặc "Nhân viên".
- **Giải pháp:**
  - Danh sách routes đưa vào component `Command` của Shadcn **BẮT BUỘC ĐƯỢC LỌC QUA PERMISSIONS**:
    ```typescript
    const accessibleRoutes = allRoutes.filter(route => 
      user.is_super_admin || user.permissions[route.module]?.view === true
    );
    ```
  - Thu ngân chỉ nhìn thấy các màn hình mà tài khoản mình có quyền `view = true`.

---

## PHẦN 4: MA TRẬN TRUY VẾT YÊU CẦU ĐẾN 10 INVARIANTS (TRACEABILITY MATRIX)

| Module Chức năng | Invariant 1 (Cô lập) | Invariant 2 (Takeaway) | Invariant 3 (Delta Split) | Invariant 4 (Tạm tính) | Invariant 5 (Khoá dòng) | Invariant 6 (Kết ca) | Invariant 7 (MDM Chuỗi) | Invariant 8 (401 vs 403) | Invariant 9 (Logout UI) | Invariant 10 (Numeric 12,2) |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Module 0: Menu & Bàn** | ✅ | ✅ | ✅ | — | — | — | — | ✅ | — | ✅ |
| **Module 1: POS Hợp nhất** | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | — | ✅ |
| **Module 2: Hoá đơn** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | — | ✅ |
| **Module 3: Nhập hàng** | ✅ | — | — | — | — | ✅ | ✅ | ✅ | — | ✅ |
| **Module 4: Dòng tiền** | ✅ | — | — | — | — | ✅ | — | ✅ | — | ✅ |
| **Module 5: Nhân viên** | ✅ | — | — | — | — | — | ✅ | ✅ | — | — |
| **Module 6: Lịch làm việc**| ✅ | — | — | — | — | — | — | ✅ | — | — |
| **Module 7: Master Data** | ✅ | — | — | — | — | — | ✅ | ✅ | — | — |
| **Module 8: Phân quyền** | ✅ | — | — | — | — | — | — | ✅ | — | — |
| **Module 9: Layout & UI** | ✅ | — | — | — | — | — | — | ✅ | ✅ | — |

---

> **Tài liệu 03-Edge-Cases-And-Invariants.md là cẩm nang nghiệm thu chất lượng cao nhất cho QA và Developer.**  
> Mọi kịch bản kiểm thử tự động (Unit Test, E2E Test) ở Phase 4B và Phase 5 bắt buộc phải hiện thực hoá toàn bộ các ca kiểm thử trong tài liệu này.
