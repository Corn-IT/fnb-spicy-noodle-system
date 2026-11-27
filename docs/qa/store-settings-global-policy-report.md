# QA — Cấu hình Cửa hàng dùng chung

Ngày kiểm tra: 27/11/2026 (Asia/Ho_Chi_Minh).
Baseline: `8ec506b033deb39add0c9ecd18a4a01c627d16d9`.

## Hành vi đã triển khai

- Theme, tỷ lệ và thứ tự menu của cửa hàng áp dụng cho mọi tài khoản; preferences cũ vẫn được giữ nhưng không ghi đè các mục này. Danh sách chức năng vẫn lọc theo RBAC.
- QR theo `qr.theme`, bao gồm theo hệ điều hành khi chọn `system`; cấu hình thương hiệu mới không bị theme nhân viên ghi đè lên QR.
- Nội dung/giọng đọc/nhắc đơn dùng chung; bật/tắt loa thuộc hồ sơ/thanh công cụ cá nhân.
- Super Admin cấu hình máy in trên thiết bị. Đổi tài khoản không mất cấu hình; các tab cùng origin/profile đồng bộ; tài khoản thường không sửa/reset qua ứng dụng.
- Settings/messages tải lại khi kết nối Socket, quay lại tab, online và mỗi 60 giây ở foreground. Bản nháp quản trị giữ phiên bản ban đầu; cập nhật cũ nhận 409 và không mất nội dung.
- POS thường áp dụng cả 150% trên điện thoại. Sửa các lỗi chiều rộng/xuống dòng ở POS, Touch header, Hub, máy in, tìm kiếm bảng, lọc ngày hóa đơn và nút chọn món QR.
- Không đổi API/schema/database migration hoặc sửa ngược snapshot của đơn cũ.

## Kết quả kiểm tra cuối

| Lớp kiểm tra | Kết quả | Bằng chứng |
|---|---|---|
| TypeScript | PASS | `pnpm -r typecheck` |
| ESLint | PASS | `pnpm -r lint` |
| Build | PASS | `pnpm -r build`, frontend build dùng API/Socket cùng origin preview |
| Unit/integration | PASS — 991/991 | Shared 91, API 452, Web 448; `pnpm -r --workspace-concurrency=1 test --maxWorkers=2` |
| Coverage | PASS — cổng cấu hình hiện có | `pnpm -r test:coverage --maxWorkers=2`; số đo bên dưới |
| Chromium hồi quy | PASS — 80; 1 skip có điều kiện | Toàn bộ suite mock ngoài hai suite responsive và suite `@real`; ca phone-only bỏ qua trên desktop |
| Toàn bộ route | PASS — 18 test | 30 route × 17 viewport ở mức mặc định, cộng sanity inventory/payroll |
| Ma trận cấu hình | PASS — 8 test | 9 route × 17 viewport × 4 tỷ lệ × 2 theme = 1.224 trạng thái; thêm mở/đóng dialog POS và các tab Cài đặt |
| WebKit mobile | PASS — 11; 3 skip có điều kiện | Account preferences, display scale, tương tác; ma trận light/dark 150% tại 390px |
| WebKit tablet | PASS — 13; 1 skip có điều kiện | Account preferences, display scale, tương tác; ma trận light/dark 150% tại 1180px |
| API/database/Socket thật trên bản build | PASS — 1 hành trình tích hợp | Ba browser context độc lập; cập nhật, mất kết nối, QR, 403/409, lưu UI, giữ draft, máy in và đổi tài khoản |
| Exploratory + smoke bản build | PASS | Ego Lite: đăng nhập, lưu/tải lại/khôi phục cấu hình, POS mobile 320px/150%, quyền máy in, loa cá nhân, đăng xuất |
| In giấy/cắt giấy/mở két/âm thanh vật lý | NOT RUN | Không có thiết bị thật trong phiên kiểm tra |

Các skip thuộc điều kiện desktop/mobile của test, không bỏ qua lỗi hoặc luồng cấu hình chung. Suite font/raster và toast có import module `/src/` chạy trên Vite dev đúng thiết kế; responsive, WebKit và hành trình backend thật chạy trên frontend production build được phục vụ bằng Vite preview.

Phép đo responsive kiểm tra cả document overflow, điều khiển vượt khung, chữ bị cắt, che khuất và kích thước dialog. Với vùng cuộn/sticky column, kiểm tra thêm nút có thực sự tiếp cận được sau cuộn; có regression riêng bảo đảm không chấp nhận nút bị `overflow:hidden` che mất. Chờ nội dung thật trước khi audit, không kiểm tra skeleton thay cho màn hình.

Viewport: 320×568, 360×740, 390×844, 430×932, 667×375, 768×1024, 820×1180, 1024×600, 1024×768, 1180×820, 1366×768, 1920×1080, 2560×1440 và các breakpoint 639/640/767/1023px. Tỷ lệ: 80/100/125/150%, sáng/tối. Touch Shell giữ giới hạn hỗ trợ từ 768px; trên điện thoại kiểm tra thông báo và đường trở về POS thường.

## Coverage thực tế

| Package | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| Shared | 96,80% | 90,20% | 94,79% | 97,27% |
| API toàn package | 79,12% | 64,03% | 81,78% | 81,46% |
| Web toàn package | 74,99% | 67,41% | 68,72% | 76,67% |

Shared vượt cả bốn ngưỡng 90% hiện có; branch của hợp đồng Store Settings đạt 100%. Không thay đổi ngưỡng coverage. Coverage API/Web toàn package còn thấp hơn 90%; lệnh coverage hiện không cấu hình ngưỡng toàn cục cho hai package này. Không coi cổng coverage xanh là bằng chứng toàn repo đã phủ 90%.

## Môi trường, artifact và khả năng tái hiện

- Node 22.23.5, pnpm, Playwright 1.65.1, Chromium/WebKit, PostgreSQL 16.16.
- Database riêng được tạo trong `/tmp/fnb-store-policy-qa/pgdata`, migrate/seed bằng script chính thức; API test ở cổng 3000, Vite dev 5173/5175, preview 4173. Không seed/query/sửa database đang vận hành.
- Suite thật yêu cầu `E2E_REAL_ISOLATED=1`, `E2E_MODE=real` và một backend seed dùng riêng. Có cleanup khôi phục settings/messages kể cả khi test lỗi.
- Artifact local tại `/tmp/fnb-store-policy-qa/`: `typecheck.log`, `lint.log`, `build.log`, `test.log`, `coverage-final.log`, `e2e-regression-final.log`, `e2e-matrix-final.log`, `e2e-real-final.log`, `e2e-webkit-mobile-final.log`, `e2e-webkit-tablet-final.log`; ảnh, report JSON và trace trong các thư mục `final-*`.
- 18 test route đã qua trong lượt `e2e-responsive-final.log`; các lỗi matrix phát hiện trong cùng lượt được sửa và toàn bộ 8 test matrix chạy lại xanh tại `e2e-matrix-final.log`.
- Ego TaskSpace đã đóng; dữ liệu cấu hình thử thủ công đã khôi phục. Artifact trong `/tmp` không được version hóa và có thể mất sau khi hệ điều hành dọn tệp tạm.

Ví dụ chạy lại sau khi chuẩn bị frontend/backend test:

```bash
pnpm -r typecheck
pnpm -r lint
pnpm -r --workspace-concurrency=1 test --maxWorkers=2
pnpm -r test:coverage --maxWorkers=2
VITE_API_BASE_URL=http://127.0.0.1:4173 VITE_SOCKET_URL=http://127.0.0.1:4173/pos pnpm -r build
E2E_BASE_URL=http://127.0.0.1:4173 pnpm --filter @fnb/web-app e2e --project=chromium-desktop e2e/responsive-matrix.spec.ts e2e/all-routes-responsive-visual.spec.ts
E2E_BASE_URL=http://127.0.0.1:4173 E2E_MODE=real E2E_REAL_ISOLATED=1 pnpm --filter @fnb/web-app e2e --project=chromium-desktop e2e/store-settings-global-real.spec.ts
```

## Review và giới hạn

Review độc lập phát hiện theme staff/QR tranh ghi document, minimum width của header POS và khoảng trống trong kiểm thử dialog/che khuất. Đã sửa và thêm regression; lượt review sau không còn finding cụ thể. Các lỗi responsive tiếp theo được xác minh bằng Playwright.

Cấu hình máy in local thuộc origin/browser profile, không phải định danh phần cứng; xóa dữ liệu hoặc đổi trình duyệt cần cấu hình lại. Khóa sửa local kiểm soát giao diện ứng dụng, không ngăn người dùng DevTools sửa localStorage. Thiết bị offline dùng cache cho tới khi kết nối lại. Giấy in, dao cắt, két và âm thanh thật cần nghiệm thu riêng trên thiết bị thực.
