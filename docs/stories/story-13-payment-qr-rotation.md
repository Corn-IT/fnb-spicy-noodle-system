# Story 13: Quản lý Mã QR Thanh toán & Tự động Xoay vòng theo Hạn mức (`payment-qr`)

## 1. Mục tiêu Nghiệp vụ
Thay thế mã VietQR cố định trên phiếu in tạm tính bằng module Quản lý Mã QR Thanh toán (`payment-qr`), cho phép:
1. Quản lý danh sách nhiều tài khoản ngân hàng VietQR theo thứ tự ưu tiên xoay vòng (`priority ASC`).
2. Theo dõi chính xác tổng tiền chuyển khoản đã thu của từng mã QR theo Ngày, Tháng, Năm lịch Việt Nam (`Asia/Ho_Chi_Minh`, `+07:00`) tính từ các hoá đơn `status = 'PAID'` (`TRANSFER` lấy `total_amount`, `SPLIT` lấy `transfer_amount`).
3. Cấu hình hạn mức nhận tối đa theo Ngày (`daily_limit`), Tháng (`monthly_limit`), Năm (`yearly_limit`) — không bắt buộc (`NULL` = không giới hạn).
4. Tự động xoay vòng sang mã QR ưu tiên tiếp theo ngay trước khi in phiếu tạm tính nếu `used + billAmount > limit`, và tự động quay lại mã ưu tiên cao hơn khi sang kỳ mới (00:00 đầu ngày/tháng/năm).

## 2. Các Quyết định Nghiệp vụ Đã Khóa (D1–D16)
- **D1 & D2**: Mã QR chỉ in trên phiếu tạm tính (`POST /api/v1/pos/orders/:id/provisional-bill` và `POST /api/v1/pos/orders/:id/split-provisional-bill`), giữ nguyên `status = 'SERVING'` (Hard Invariant 4). Khi in tạm tính, ghi nhận `orders.payment_account_id`. Khi chốt thanh toán `TRANSFER`/`SPLIT` mà chưa in tạm tính (`payment_account_id IS NULL`), tự động gắn mã QR đang active tại thời điểm checkout; nếu chốt `CASH` thì đặt `payment_account_id = NULL`.
- **D3 & D4**: Doanh thu từng mã QR tính động (on-the-fly) từ bảng `orders` (`status = 'PAID'`) theo mốc thời gian Việt Nam (`+07:00`). Hoá đơn `VOIDED` tự động bị loại trừ.
- **D5 & D6**: Kiểm tra hạn mức trước khi in (`used + billAmount <= limit`). Nếu tất cả mã QR đang bật đều vượt hạn mức, fallback về mã có `priority` cao nhất kèm cảnh báo `qrOverLimit = true` và ghi `AuditLog` để không chặn bán hàng. Nếu không có mã nào đang bật (`is_active = true`), trả `409 Conflict` (`PAYMENT_QR_NOT_CONFIGURED`).
- **D10**: Mã QR đã phát sinh hoá đơn (`hasOrders = true`) không được xoá cứng (`409 PAYMENT_QR_IN_USE`) và khoá chỉnh sửa `bankCode` + `accountNo` (`409 PAYMENT_QR_LOCKED_FIELD`).

## 3. Tiêu chí Nghiệm thu (Acceptance Criteria)
- **AC-13.1**: Bảng vật lý `payment_accounts` sử dụng `NUMERIC(12, 2)` cho cả 3 cột hạn mức (Hard Invariant 10) và seed mặc định tài khoản `VPB - 186877721 - THAN THI LOAN`.
- **AC-13.2**: Thuật toán `PaymentQrService.selectActivePaymentAccountForBill` xoay vòng chính xác qua hạn mức Ngày / Tháng / Năm, tính đúng phần `transfer_amount` của đơn `SPLIT`, loại trừ đơn `VOIDED`, và tự động quay về mã `#1` khi sang ngày mới.
- **AC-13.3**: Giao diện `/payment-qr` hiển thị BaseTable với thứ tự ưu tiên (`↑`/`↓`), trạng thái, 3 cột tiến độ Ngày/Tháng/Năm, Drawer thêm/sửa kèm VietQR preview, và Drawer đối soát danh sách hoá đơn chuyển khoản của từng mã QR.
