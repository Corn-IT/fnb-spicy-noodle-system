# Báo cáo nghiệm thu 9 module POS

**Ngày:** 2026-11-08  
**Kết quả:** Nghiệm thu một phần. Typecheck và test đạt; API/DB hiện khỏe. Chưa thể xác nhận toàn bộ thao tác trực tiếp trên trình duyệt vì quyền điều khiển trình duyệt vẫn báo tắt.

## Kết quả theo module

| Module | Kết quả thực tế | Lỗi phát hiện và xử lý / phần chưa xác nhận |
|---|---|---|
| POS Counter | Đã tạo đơn DINE_IN và TAKEAWAY; bếp tách món; thử MOVE đơn có món đã gửi bếp và xác nhận phiếu thông báo đổi bàn. Đơn takeaway giữ `table_id = NULL`; thao tác bàn hiện cảnh báo EC-POS-03. | MOVE đã xác nhận trực tiếp. MERGE/SWAP và hai nhánh hủy món chưa commit trên trình duyệt; có kiểm thử API. Không tuyên bố đã nghiệm thu các nhánh này trực tiếp. |
| QR & Realtime | Khách gửi món qua QR; thu ngân nhận thông báo Lượt 2 và hóa đơn cập nhật. | Chưa kiểm tra trang QR đổi tên bàn sau MOVE do trang QR đang mở trên bàn khác và API đã ngừng phản hồi. |
| Thanh toán & in | In tạm tính có VietQR Napas247 động; đơn vẫn `SERVING`, bàn vẫn `OCCUPIED`. Một đơn QA thanh toán CASH thành công và bàn được giải phóng. | Đã mở và kiểm tra biểu mẫu TRANSFER/SPLIT, gồm kiểm tra tổng SPLIT; chưa xác nhận thanh toán thật bằng TRANSFER/SPLIT. Chốt tiền là thao tác tài chính cần người dùng tự xác nhận. |
| Hóa đơn | Bộ lọc ngày/trạng thái/phương thức hiển thị; chi tiết có lịch sử MOVE và các batch gọi món. Dialog hủy hiển thị giới hạn lý do tối thiểu 10 ký tự. | Không gửi hủy hóa đơn; quy tắc superadmin được kiểm tra bằng API/test. |
| Nhập kho | Phát hiện form chưa có trường chọn nhà cung cấp MDM. Đã bổ sung danh mục SUPPLIER, tab MDM, combobox nhà cung cấp, snapshot tên nhà cung cấp, migration và schema dùng chung. Trình duyệt hiển thị lựa chọn SUPPLIER và form nhập vật tư. | Lần bấm lưu ban đầu không có phản hồi rõ ràng. API và DB đã được khởi động lại, health báo `database=connected`, và Prisma xác nhận toàn bộ migration đã áp dụng. Chưa thể thử lưu lại sau khi khởi động vì quyền điều khiển trình duyệt báo đang tắt. Chưa xác nhận tạo/xóa phiếu hoặc nguồn EXTERNAL trực tiếp. |
| Kết ca | Lưới 9 mệnh giá và giải thích chênh lệch hiển thị. Preview tính 154.000đ tiền két mong đợi, không cộng doanh thu QR. | Không chốt ca; nút chốt cần người dùng xác nhận kết quả tài chính. |
| Nhân sự | Trang và bảng nhân viên đã được mở để kiểm tra giao diện; API có kiểm thử liên kết tài khoản 1-1 và bật/tắt hoạt động. | Chưa tạo/tắt nhân viên trên trình duyệt. |
| Lịch tuần | Trang tải ma trận 7 ngày × 3 ca; danh sách nhân viên hiện trong bộ chọn. | Sửa mapping UI `availableEmployees` để khớp response API. Chưa lưu phân ca trực tiếp trong phiên cuối. |
| MDM, RBAC & Profile | MDM chuẩn hóa tên để phát hiện trùng; đã thêm SUPPLIER. Cashier không thấy mục quản trị; API/test kiểm tra quyền truy cập. | Chưa thấy trang 403 trong trình duyệt do route guard đưa hard navigation về đăng nhập. Chưa đổi mật khẩu; kiểm tra lưu theme qua phiên chưa hoàn tất. |

## Trở ngại nghiệm thu trình duyệt

Đã khởi động lại API và web POS; `/api/v1/health` trả `status=ok`, `database=connected`, và `prisma migrate status` báo schema up to date. Sau khi người dùng bật lại local browser use, công cụ điều khiển trình duyệt vẫn báo tính năng này đang tắt. Vì vậy không thể xác minh thao tác nhập kho lần nữa hoặc tiếp tục các luồng UI còn thiếu trong lượt này.

## Thay đổi và kiểm tra

- Lịch tuần: sửa mapping response `availableEmployees`.
- Nhập kho/MDM: thêm SUPPLIER, lựa chọn nhà cung cấp từ MDM, lưu `supplierMdmId` và `supplierNameSnapshot`, migration DB và kiểm thử liên quan.
- Kiểu dữ liệu được kiểm tra ở shared, API và web.
- `pnpm -r typecheck`: PASS.
- Bổ sung kiểm thử giao diện nhập kho: xác nhận toast thành công sau khi lưu và toast lỗi khi API từ chối, drawer vẫn mở khi lỗi.
- `pnpm -r test`: PASS — 292 test trên 30 file.

Các ảnh nghiệm thu trình duyệt trước đó nằm trong `docs/test-reports/screenshots/`. Báo cáo này không đánh dấu 100% PASS vì các thao tác MERGE/SWAP, hủy món, TRANSFER/SPLIT, chốt ca, void, lưu phiếu nhập sau khởi động lại, phân ca và lưu theme chưa được xác nhận đầy đủ trực tiếp.
