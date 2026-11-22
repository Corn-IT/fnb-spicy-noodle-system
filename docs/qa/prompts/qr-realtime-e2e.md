/goal Thực hiện chiến dịch Kiểm thử E2E Realtime cho giao diện KHÁCH HÀNG (quét QR tại bàn & QR Mang về) trên hệ thống POS Mì Cay: kiểm tra MỌI sự kiện / trạng thái / thông báo đi từ POS sang UI QR, vừa kiểm thử vừa hotfix (unit test + giao diện thực tế + kiểm thử toàn diện). Không dừng cho đến khi Sổ độ phủ đạt 100% PASS/FIXED và DoD ở mục 8 đều exit code 0.

══════════════════════════════════════════════
0. CHUẨN BỊ (làm 1 lần)
══════════════════════════════════════════════
- Đọc AGENTS.md + toàn bộ `.agents/rules/*.md`. Dùng context7 khi cần tra docs Socket.io / TanStack Query.
- Khởi chạy PostgreSQL + api-server + web-app, seed dữ liệu.
- Phiên trình duyệt (Chrome DevTools, mỗi phiên một ngữ cảnh cô lập):
  - `thungan` trên `/pos` (1366×768) — nguồn phát sự kiện.
  - `superadmin` trên `/menu`, `/settings` — nguồn phát sự kiện Menu/Cài đặt.
  - `qr_guest_A`, `qr_guest_B`: 2 máy khách ẩn danh CÙNG một bàn (375×667 và 390×844).
  - `qr_guest_C`: máy khách bàn khác (dùng cho MOVE/MERGE/SWAP).
  - `qr_guest_T`: máy khách quét QR Mang về.
- Được tạo/sửa/xoá dữ liệu thử nghiệm không giới hạn.
- Tạo SỔ ĐỘ PHỦ tại `docs/qa/qr-realtime-ledger.md`. Mỗi dòng: `Mã | Sự kiện POS → QR | Chế độ (Bàn/Mang về) | Máy khách (A/B/C/T) | Viewport | Light/Dark | Độ trễ đo (ms) | Loại thông báo (Tức thời/Bền) | Tự tắt đúng? | Sau F5 đúng? | Trạng thái (TODO/PASS/FAIL→FIXED/BLOCKED) | File hotfix | Ghi chú`. Cập nhật NGAY sau mỗi sự kiện. Sổ là nguồn sự thật để chạy tiếp nếu bị gián đoạn.

══════════════════════════════════════════════
1. HIỆN TRẠNG ĐÃ KHẢO SÁT (điểm xuất phát, phải tự kiểm chứng lại)
══════════════════════════════════════════════
- UI QR (`apps/web-app/src/features/qr-order/hooks/use-qr-session-socket.ts`) chỉ nghe 5 sự kiện: `ORDER_STATUS_UPDATED`, `ORDER_SESSION_REDIRECTED`, `ORDER_QR_AUTO_CANCELLED`, `MENU_UPDATED`, `STORE_SETTINGS_UPDATED`.
- `statusMessage` và `redirectNotice` được ghi vào CẢ `localStorage` lẫn `sessionStorage`; các banner `qr-status-banner` và `qr-redirect-banner` (`qr-order-page.tsx`) không có nút đóng, không tự tắt → nghi là nguyên nhân "phải F5 mới tắt".
- Các điểm phát sự kiện phía server (`apps/api-server/src/modules/pos/*`): `approveQrOrder`, `cancelOrder`, `patchOrderItems` (chỉ gửi `status`, không kèm chi tiết món), `applyDiscount`/`removeDiscount` (chỉ gửi `status: 'SERVING'`), `checkout`, `splitCheckout`, `kitchen-split.service`, `qr-auto-cancel.service`, `table-transfer.service` (`ORDER_SESSION_REDIRECTED` CHỈ gửi tới room của đơn cũ). In tạm tính hiện KHÔNG phát sự kiện nào sang QR.
- Danh sách món / tổng tiền phía khách lấy qua `GET public/menu` (kèm `activeOrderId` + `guestSessionToken`), làm mới bằng `invalidateQueries(['public-menu', token])`.

══════════════════════════════════════════════
2. QUY TẮC HIỂN THỊ THÔNG BÁO (chuẩn để đánh PASS)
══════════════════════════════════════════════
2.1 Thông báo TỨC THỜI (chuyển/gộp/đổi bàn, quầy đã xác nhận, bếp đang làm, menu thay đổi, quầy huỷ/giảm món, áp/gỡ giảm giá, quầy in tạm tính):
  - Tự tắt sau 5–8 giây VÀ có nút ✕ đóng tay (chạm ≥ 44px, có `aria-label`).
  - Sự kiện mới thay thế/xếp chồng gọn gàng, không đè che nút Gửi đơn / giỏ hàng.
  - KHÔNG được lưu vào storage; F5 hoặc mở lại trang thì KHÔNG hiện lại.
2.2 Trạng thái BỀN (Đang chờ quầy xác nhận `PENDING`, Đã thanh toán `PAID`, Đơn bị huỷ `VOIDED`, Tự huỷ do quá hạn):
  - Hiển thị cố định cho đến khi trạng thái thay đổi (nhận qua realtime) — tuyệt đối không cần F5 để tắt hoặc đổi.
  - Khi mở lại trang sau đó: trạng thái được dựng lại từ snapshot server (không dựa vào banner cũ trong storage). Đơn đã kết thúc thì KHÔNG còn hiện banner kết thúc.
2.3 Kết thúc đơn:
  - `PAID`: banner cố định "Cảm ơn, đơn đã thanh toán", khoá gọi thêm vào đơn cũ; nút "Gọi đơn mới" (hoặc quét lại) mở phiên mới sạch.
  - `VOIDED` / tự huỷ: banner đỏ cố định kèm lý do; giỏ hàng chưa gửi được GIỮ LẠI để gửi lại thành đơn mới.
2.4 Ngưỡng realtime: ≤ 2 giây từ lúc POS bấm nút đến lúc UI QR thay đổi (banner + dữ liệu đơn), đo trên LAN (ghi `Độ trễ đo` vào sổ, ví dụ dùng `performance.now()` / timestamp socket). KHÔNG BAO GIỜ phải F5.
2.5 Mọi văn bản thông báo mới phải đi qua message catalog (`@fnb/shared` `message-catalog` + `resolveCachedAppMessage`) để tuỳ biến được ở `/settings`, hiển thị tiếng Việt có dấu, dữ liệu XSS hiển thị dạng chữ thuần.

══════════════════════════════════════════════
3. KẾT NỐI LẠI & BỎ LỠ SỰ KIỆN
══════════════════════════════════════════════
- Khi socket kết nối lại HOẶC tab quay lại foreground (`visibilitychange`) → tự tải lại snapshot đơn từ server và đồng bộ trạng thái/banner. KHÔNG phát lại thông báo tức thời đã cũ, chỉ hiện trạng thái bền hiện tại.
- Khi socket rớt: hiện chỉ báo nhỏ "Mất kết nối, đang kết nối lại…", tự ẩn khi kết nối lại.
- Kịch bản bắt buộc: (a) DevTools Offline 30s, trong lúc đó POS đổi trạng thái → bật lại mạng; (b) tab khách chuyển nền rồi quay lại sau khi POS thanh toán; (c) mạng chậm "Slow 3G"; (d) dừng api-server 10s rồi khởi động lại.

══════════════════════════════════════════════
4. MA TRẬN SỰ KIỆN POS → QR (checklist tối thiểu, phát hiện thêm thì bổ sung vào sổ)
══════════════════════════════════════════════
Với MỖI dòng: kiểm tra trên máy A VÀ máy B cùng bàn (cả 2 nhận như nhau, giỏ chưa gửi vẫn riêng từng máy), Light + Dark, 375×667 + 390×844, đo độ trễ, kiểm tra tự tắt và hành vi sau F5.

A. Vòng đời đơn tại bàn
 RT-01 Khách A gửi đơn đầu → banner bền "Đang chờ quầy xác nhận"; máy B thấy đơn & món mới.
 RT-02 Khách B gọi thêm (add-on) → máy A thấy món mới trong đơn ≤ 2s.
 RT-03 POS duyệt đơn QR (`approveQrOrder` approved) → "Quầy đã xác nhận…" (tức thời), trạng thái → SERVING.
 RT-04 POS từ chối đơn QR → trạng thái + lý do đúng, giỏ chưa gửi được giữ.
 RT-05 POS tách bếp (`split-kitchen`) → "Bếp đang chế biến" (tức thời); tách bếp lần 2 không có món mới → KHÔNG bắn thông báo trùng.
 RT-06 POS huỷ / giảm SL món (`patchOrderItems`) → danh sách món + tổng tiền trên QR cập nhật ngay + thông báo tức thời "Quầy đã huỷ <SL> × <món>". [SỰ KIỆN MỚI — đã duyệt]
 RT-07 POS áp / gỡ giảm giá → tổng tiền QR cập nhật + thông báo tức thời. [SỰ KIỆN MỚI — đã duyệt]
 RT-08 POS in tạm tính → thông báo tức thời "Quầy đã in phiếu tạm tính: <tổng>" (KHÔNG hiện VietQR trên máy khách), đơn vẫn SERVING. [SỰ KIỆN MỚI — đã duyệt]
 RT-09 POS thanh toán CASH / TRANSFER / SPLIT → banner bền PAID theo mục 2.3, khoá gọi thêm, "Gọi đơn mới" mở phiên sạch; F5 sau đó không còn banner PAID cũ.
 RT-10 POS huỷ đơn (`cancelOrder`, VOIDED) → banner đỏ bền + lý do, giữ giỏ chưa gửi; F5 sau đó không còn banner cũ.
 RT-11 Đơn QR quá hạn tự huỷ (`qr-auto-cancel`) → banner đỏ bền; giảm thời gian cấu hình ở `/settings` để test nhanh.
 RT-12 Hai thu ngân thao tác đồng thời trên cùng đơn (thanh toán / huỷ) → QR chỉ nhận trạng thái cuối cùng đúng, không nhấp nháy sai.

B. Bàn
 RT-13 MOVE bàn → khách thấy thông báo chuyển bàn (tức thời), nhãn bàn mới, vẫn gọi thêm được vào đơn đã chuyển.
 RT-14 MERGE bàn → khách ở CẢ bàn nguồn và bàn đích nhận thông báo & thấy đơn đúng. [SỰ KIỆN MỚI — đã duyệt]
 RT-15 SWAP bàn → khách ở CẢ hai bàn nhận thông báo & đơn đúng. [SỰ KIỆN MỚI — đã duyệt]
 RT-16 Xoay QR token bàn (table-manage-dialog) → máy khách đang mở token cũ nhận hành vi rõ ràng (thông báo mã hết hiệu lực / hướng dẫn quét lại), không treo.

C. Menu & Cài đặt
 RT-17 Hết món / tắt món ở `/menu` → menu QR cập nhật ≤ 2s; món đang nằm trong giỏ chưa gửi bị đánh dấu "Hết món" và chặn gửi (không chỉ ẩn khỏi menu). [SỰ KIỆN MỚI — đã duyệt]
 RT-18 Đổi giá / tên / ảnh / modifier món → menu và giỏ hiển thị đúng; gửi đơn dùng giá mới hoặc báo rõ thay đổi.
 RT-19 Bật lại món → xuất hiện lại realtime.
 RT-20 `/settings` đổi thương hiệu / theme / logo / mẫu thông báo / Wi-Fi / GPS / bật-tắt đặt món QR → UI QR áp dụng realtime.

D. Mang về (`qr_guest_T`)
 RT-21 Gửi đơn Mang về → thẻ số thứ tự (`qr-takeaway-ticket-number`) đúng, trạng thái chờ.
 RT-22 POS duyệt / tách bếp / thanh toán / huỷ đơn Mang về → tiến trình bếp (`takeawayKitchenProgress`) và trạng thái đổi realtime theo mục 2.
 RT-23 Sau PAID/VOIDED → bắt đầu phiên Mang về mới sạch, không dính banner/đơn cũ.

E. Kết nối & bền vững (mục 3)
 RT-24 Offline 30s rồi online lại. RT-25 Chạy nền → foreground. RT-26 Slow 3G. RT-27 Restart api-server. RT-28 Mở 2 tab cùng máy khách → không nhân đôi thông báo / âm thanh.

F. UI chung của thông báo
 RT-29 Thông báo không che nút Gửi đơn, giỏ, Modifier Sheet; không tràn ngang ở 375×667; tương phản WCAG AA ở cả Light/Dark; có `role="status"`/`aria-live` phù hợp.
 RT-30 Nhiều sự kiện dồn dập (5 sự kiện trong 3 giây) → không chồng chất vô hạn, không rò rỉ timer (kiểm tra console, không có warning React).

══════════════════════════════════════════════
5. GIAO THỨC THỰC THI (cho từng RT-xx)
══════════════════════════════════════════════
 a) Thực hiện thao tác ở POS/Menu/Settings → quan sát máy khách A, B (và C/T nếu liên quan) → đo độ trễ → chờ kiểm tra tự tắt → F5 kiểm tra trạng thái dựng lại.
 b) Gặp lỗi → HOTFIX ngay: tái hiện → viết test tái hiện (Vitest cho hook/component QR, unit/integration cho service/gateway phía server) → sửa tối thiểu, đúng phạm vi (tuân thủ 10 Invariant, Ponytail ultra) → kiểm tra lại trên trình duyệt → chạy test package bị ảnh hưởng → ghi file:line vào sổ.
 c) Sự kiện MỚI chỉ được làm trong 5 mục đã duyệt (RT-06, RT-07, RT-08, RT-14/15, RT-17). Phát hiện nhu cầu sự kiện mới khác → ghi vào sổ mục "Đề xuất chờ duyệt", KHÔNG tự làm.
 d) Payload socket mới phải có Zod schema trong `packages/shared` (giống `QrAutoCancelledPayloadSchema`), KHÔNG lộ dữ liệu nội bộ (nhân sự, doanh thu, thông tin thu ngân) ra room của khách.
 e) Đánh PASS chỉ khi đã thấy tận mắt trên trình duyệt và có số đo độ trễ.

══════════════════════════════════════════════
6. NGOÀI PHẠM VI (không làm)
══════════════════════════════════════════════
- Hiển thị VietQR trên điện thoại khách.
- Thông báo "Món Mang về đã sẵn sàng, mời nhận" (cần trạng thái hoàn thành món mới).
- Đồng bộ giỏ hàng chưa gửi giữa các máy cùng bàn.
- Polling định kỳ thay cho socket.

══════════════════════════════════════════════
7. KẾT THÚC
══════════════════════════════════════════════
- Hết RT-30 → chạy lại smoke test RT-01, RT-03, RT-05, RT-09, RT-13, RT-17, RT-21, RT-24 để bắt hồi quy do hotfix.
- Viết `docs/qa/qr-realtime-final-report.md`: danh sách hotfix (file:line), bảng độ trễ đo được theo từng RT, kết quả DoD.
- Cuối báo cáo: CHECKLIST ngắn (≤ 10 bước) để người dùng tự quét bằng điện thoại thật trên cùng Wi-Fi (bàn + Mang về, khoá màn hình rồi mở lại, 2 máy cùng bàn).

══════════════════════════════════════════════
8. DEFINITION OF DONE (chạy SAU lần sửa code cuối cùng, tất cả exit code 0)
══════════════════════════════════════════════
 1. `pnpm -r lint`
 2. `pnpm -r typecheck`
 3. `pnpm --filter @fnb/web-app build`
 4. `pnpm --filter @fnb/api-server exec tsc -p tsconfig.json`
 5. `pnpm -r --workspace-concurrency=1 test` (0 fail, 0 skip — ghi chính xác số file/test từng package)
 + Không có `// TODO` / `// placeholder` trong mã nguồn; sổ `docs/qa/qr-realtime-ledger.md` không còn dòng TODO / BLOCKED.
