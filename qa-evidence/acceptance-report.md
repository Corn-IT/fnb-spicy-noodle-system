# Báo cáo nghiệm thu POS Mì Cay

Ngày kiểm tra: 2026-11-08

## Kết quả cổng kiểm tra

- `pnpm -r typecheck`: PASS.
- `pnpm -r test`: PASS — 302/302 bài (shared 19, API 233, web 50).
- Luồng HTTP tích hợp cần quyền loopback; lượt chạy trong môi trường hạn chế bị `EACCES`, lượt chạy lại với quyền loopback đã PASS.
- Hoàn tất các luồng nghiệm thu đã nêu; luồng tạo tài khoản nhân viên 1-1 cũng đã được gửi và xác minh trực tiếp trên trình duyệt.

## Theo module

| Module | Kết quả nghiệm thu | Lỗi đã phát hiện và sửa / trạng thái |
|---|---|---|
| 1. POS Counter | Đã kiểm tra MOVE/MERGE/SWAP, phiếu báo chuyển bàn, xoá món NEW, huỷ món PRINTED, mang về, EC-POS-03 và tách combo ra 3 trạm. | Sửa cách đánh số batch tách bếp để tính cả batch cũ đã PRINTED/CANCELLED; không in lại món đã gửi bếp. |
| 2. QR & realtime | Đã kiểm tra cấp cay, topping, ghi chú, gọi thêm lượt 2, thông báo POS realtime và đổi tên bàn trên trang QR sau MOVE. | Không phát hiện lỗi còn lại trong các luồng đã kiểm tra. |
| 3. Thanh toán & in ấn | Đã kiểm tra tạm tính VietQR giữ đơn SERVING và CASH/TRANSFER/SPLIT giải phóng bàn sau thanh toán. | Đã rà luồng in và trạng thái bàn theo các bất biến; không phát hiện lỗi logic mới trong lượt này. |
| 4. Hoá đơn | Đã kiểm tra bộ lọc, chi tiết theo batch, lịch sử chuyển bàn, chặn lý do huỷ ngắn, void chỉ superadmin và nút in lại trên trình duyệt. API in lại trả 201. | Siết quyền huỷ cho superadmin; nút in lại phải chờ API và dùng dữ liệu API trả về. Toast bị hộp thoại chi tiết che khuất nên đã thêm phản hồi thành công/lỗi ngay trong hộp thoại. |
| 5. Nhập kho | Đã kiểm tra chọn nhà cung cấp MDM, nguồn CASH_DRAWER/EXTERNAL, xem chi tiết và xoá mềm phiếu. | Hoàn thiện nối combobox nhà cung cấp với MDM cùng luồng API/UI liên quan. |
| 6. Kết ca | Đã kiểm tra lưới 9 mệnh giá, expected_cash không tính chuyển khoản, nguồn chi két, giải trình chênh lệch và chốt ca. | Không phát hiện lỗi công thức còn lại trong các kịch bản đã chạy. |
| 7. Nhân sự | Đã kiểm tra bảng 7 cột, short_name, bật/tắt hoạt động và tạo nhân viên kèm tài khoản liên kết trên browser; mở hồ sơ xác minh `qa_accept_20261108` gắn đúng 1-1. | Sửa giới hạn tra cứu MDM nhân sự khớp giới hạn API. Xoá mềm hồ sơ QA sau khi xác minh; hệ thống báo thành công và vô hiệu hoá tài khoản liên kết. |
| 8. Lịch tuần | Đã kiểm tra ma trận tuần, phân/xoá ca, lưu và điều hướng tuần theo Thứ Hai UTC+7. | Sửa ánh xạ danh sách nhân viên khả dụng cho ô lịch. |
| 9. MDM, RBAC & Profile | MDM chống trùng theo chuẩn hoá dấu; cashier01 đã mở trực tiếp `/rbac` và thấy 403 đúng tài khoản. Giao diện Dark/Light đã được xác nhận lưu qua phiên đăng nhập. Người dùng tự gửi biểu mẫu đổi mật khẩu cho tài khoản QA; sau đó trang không còn lỗi và các trường mật khẩu đã xoá. | Sửa phản hồi thành công MDM trùng; chuẩn hoá chống trùng topping tiếng Việt. Sửa đăng nhập để quay lại trang đích được bảo vệ an toàn thay vì luôn về `/pos`. Đổi mật khẩu QA đã hoàn tất theo xác nhận của người dùng. |

## Bằng chứng trình duyệt

- [cashier01 bị chặn 403](/C:/Users/ngomi/OneDrive/Documents/POS%20FnB/qa-evidence/rbac-cashier-403.png)
- [In lại hoá đơn có phản hồi thành công](/C:/Users/ngomi/OneDrive/Documents/POS%20FnB/qa-evidence/invoice-reprint-confirmed.png)
- [Biểu mẫu đổi mật khẩu trước khi người dùng xác nhận](/C:/Users/ngomi/OneDrive/Documents/POS%20FnB/qa-evidence/profile-password-handoff.png)

## Trạng thái cuối

Không còn luồng nghiệm thu nào đang chờ. Mật khẩu QA được người dùng tự đổi và xác nhận thành công. Tài khoản nhân viên QA mới được người dùng tự nhập mật khẩu và gửi biểu mẫu; sau khi xác minh liên kết, hồ sơ được xoá mềm để vô hiệu hoá tài khoản thử.
