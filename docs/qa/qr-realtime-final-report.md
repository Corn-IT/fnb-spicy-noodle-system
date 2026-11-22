# Báo Cáo Kiểm Thử E2E Realtime — Giao Diện Khách Hàng QR (`RT-01` → `RT-30`)

- **Phạm vi:** Hệ thống POS Mì Cay — kiểm thử E2E hai chiều POS ↔ Giao diện Khách hàng QR (`/qr/:token`, cả chế độ **Tại bàn** và **Mang về**) qua 6 phiên trình duyệt cô lập (`thungan`, `superadmin`, `qr_guest_A`, `qr_guest_B`, `qr_guest_C`, `qr_guest_T`).
- **Sổ độ phủ nguồn sự thật:** [qr-realtime-ledger.md](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/docs/qa/qr-realtime-ledger.md) — **30/30 hạng mục đạt `PASS` / `FAIL→FIXED`** (`16 PASS`, `14 FAIL→FIXED`, `0 TODO`, `0 BLOCKED`).
- **Smoke regression sau lần sửa code cuối cùng:** Đã kiểm chứng lại luồng `PENDING` tức thì, `approve`, `MOVE`, `Takeaway`, `PAID`, `Gọi đơn mới` trên trình duyệt thật; `41/41` file (`222/222` tests) Frontend + `42/42` file (`381/381` tests) Backend + `6/6` file (`58/58` tests) Shared đều PASS (`0` fail, `0` skip).

---

## 1. Tổng Hợp Hotfix Đã Thực Hiện (`file:line`)

| Hạng mục | Nguyên nhân gốc | Vị trí sửa (`file:line`) | Kiểm chứng |
|----------|----------------|--------------------------|------------|
| **Thông báo Tức thời vs Bền & Tách sự kiện POS→QR** (`RT-02`→`RT-10`) | Trước đó mọi thông báo lưu vào `localStorage`/`sessionStorage`, không tự tắt và thiếu sự kiện huỷ/giảm món, áp/gỡ giảm giá, in tạm tính | - [order.schema.ts](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/packages/shared/src/schemas/order.schema.ts#L181-L194)<br>- [menu.schema.ts](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/packages/shared/src/schemas/menu.schema.ts#L158-L159)<br>- [message-catalog.ts](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/packages/shared/src/constants/message-catalog.ts#L278-L341)<br>- [pos-socket.gateway.ts](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/apps/api-server/src/gateways/pos-socket.gateway.ts#L181-L226)<br>- [pos.service.ts](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/apps/api-server/src/modules/pos/pos.service.ts#L388), [#L1044](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/apps/api-server/src/modules/pos/pos.service.ts#L1044), [#L1279](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/apps/api-server/src/modules/pos/pos.service.ts#L1279), [#L1381](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/apps/api-server/src/modules/pos/pos.service.ts#L1381), [#L1440](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/apps/api-server/src/modules/pos/pos.service.ts#L1440), [#L1552](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/apps/api-server/src/modules/pos/pos.service.ts#L1552)<br>- [qr-order-page.tsx](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/apps/web-app/src/features/qr-order/components/qr-order-page.tsx#L980-L1092) | Vitest (`qr-order-messages.test.tsx`), `pos.service.spec.ts`, Live A/B `5.60s–6.05s` auto-dismiss, nút `✕` `44×44px`, F5 không replay, `0` VietQR trên điện thoại khách |
| **Chuyển / Gộp / Đổi bàn (`MOVE`/`MERGE`/`SWAP`) không nháy nhãn & đúng 2 phía** (`RT-13`, `RT-14`, `RT-15`) | (1) Stale snapshot refetch sau `MOVE` làm nháy lại nhãn bàn cũ & flash banner `PENDING` cho đơn `SERVING`; (2) `SWAP` không giữ được đơn cũ qua `getPublicMenu` khi bàn vật lý có đơn mới; (3) Chuỗi mẫu lặp chữ `"Bàn Bàn 01"` | - [table-transfer.service.ts](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/apps/api-server/src/modules/pos/table-transfer.service.ts#L218-L302)<br>- [menu.service.ts](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/apps/api-server/src/modules/menu/menu.service.ts#L233), [#L259](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/apps/api-server/src/modules/menu/menu.service.ts#L259)<br>- [message-catalog.ts](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/packages/shared/src/constants/message-catalog.ts#L326)<br>- [use-qr-session-socket.ts](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/apps/web-app/src/features/qr-order/hooks/use-qr-session-socket.ts#L296-L375) | `table-transfer.spec.ts` (`13/13`), `menu.service.spec.ts` (`11/11`), `message-catalog.spec.ts` (`7/7`), Live A/B/C `0` flicker (`721–1978ms`) |
| **Cấu hình bảo mật QR (`/settings` Wi-Fi / GPS) phát realtime** (`RT-20`) | `PUT /pos/qr-security-config` chưa emit `STORE_SETTINGS_UPDATED`, và QR listener chỉ invalidate settings chứ chưa refetch `/public/menu` | - [pos.controller.ts](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/apps/api-server/src/modules/pos/pos.controller.ts#L131-L146)<br>- [use-qr-session-socket.ts](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/apps/web-app/src/features/qr-order/hooks/use-qr-session-socket.ts#L810-L813) | `pos.controller.spec.ts`, Vitest Test #9, Live bật/tắt Wi-Fi Lock (`181–225ms`) & GPS Lock (`151–178ms`) |
| **Đồng bộ khi quay lại foreground (`visibilitychange`), chống ping-pong cache & giữ tương thích `PENDING` 0ms** (`RT-25`, DoD) | (1) `syncTableSnapshot` bỏ sót `DINE_IN` đã `PAID`/`VOIDED` khi tab ngủ; (2) Đổi key query sang `['public-menu', token, orderId]` gây vòng lặp ping-pong & gọi thừa `GET` trong `pos-counter.test.tsx`; (3) `qr-order-page` ẩn banner `PENDING` khi `activeOrder` chưa refetch xong | - [use-qr-session-socket.ts](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/apps/web-app/src/features/qr-order/hooks/use-qr-session-socket.ts#L171-L215), [#L275-L295](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/apps/web-app/src/features/qr-order/hooks/use-qr-session-socket.ts#L275-L295), [#L380-L409](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/apps/web-app/src/features/qr-order/hooks/use-qr-session-socket.ts#L380-L409)<br>- [qr-order.api.ts](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/apps/web-app/src/features/qr-order/api/qr-order.api.ts#L24-L104)<br>- [qr-order-page.tsx](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/apps/web-app/src/features/qr-order/components/qr-order-page.tsx#L193-L211), [#L1079-L1080](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/apps/web-app/src/features/qr-order/components/qr-order-page.tsx#L1079-L1080)<br>- [qr-order-messages.test.tsx](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/apps/web-app/src/features/qr-order/__tests__/qr-order-messages.test.tsx#L1314-L1413) | Vitest `qr-order-messages.test.tsx` (`10/10`, Test #10 `72ms`) + `pos-counter.test.tsx` (`13/13`), Live Dark `375×667` & F5 đều sạch |
| **Lỗi kiểu `TS2367` trong `SWAP` redirect** (DoD `#2`) | Biểu thức `targetOrder.status === 'PENDING'` thừa vì `targetOrder.status` đã narrow còn `'SERVING'` | - [table-transfer.service.ts](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/apps/api-server/src/modules/pos/table-transfer.service.ts#L222) | `pnpm -r typecheck` (`exit code 0`) |

---

## 2. Bảng Độ Trễ Realtime Đo Được (`RT-01` → `RT-30`)

| Mã | Sự kiện / Kịch bản | Độ trễ đo thực tế (ms / thời lượng) | Kết quả |
|----|---------------------|-------------------------------------|---------|
| `RT-01` | Khách A gửi đơn đầu → máy B đồng bộ `PENDING` | `1925ms` (A click → B DOM) / `631ms` sau API | `PASS` |
| `RT-02` | Khách B gọi thêm lượt #2 → máy A nhận & tự tắt | `722ms` (notice), `1606ms` (dữ liệu), tắt `~5.89s` | `FAIL→FIXED` |
| `RT-03` | POS duyệt đơn QR → thông báo tức thời, giữ `SERVING` | `912ms` (A), `918ms` (B), tắt `~6.00s` | `FAIL→FIXED` |
| `RT-04` | POS từ chối đơn QR → banner `VOIDED` + giữ giỏ A | `999ms` (A), `994ms` (B) | `FAIL→FIXED` |
| `RT-05` | POS tách bếp (Lượt 1 & 2) → `"Bếp đang chế biến"`, chống trùng | `882–942ms` (A/B), tắt `5.73–5.81s` | `FAIL→FIXED` |
| `RT-06` | POS huỷ / giảm số lượng món | `< 1000ms` (A/B), tắt `5.76–5.88s` | `FAIL→FIXED` |
| `RT-07` | POS áp / gỡ giảm giá (`GIAM10`) & chi tiết sheet | `1031ms` (áp), `895ms` (gỡ), tắt `5.60–5.74s` | `FAIL→FIXED` |
| `RT-08` | POS in tạm tính → báo tổng (0 VietQR trên ĐT khách) | `991ms` (A), `1061ms` (B), tắt `5.84–5.91s` | `FAIL→FIXED` |
| `RT-09` | POS thanh toán `CASH` / `TRANSFER` / `SPLIT` → `PAID` bền | `207–1058ms` (A/B) | `FAIL→FIXED` |
| `RT-10` | POS huỷ đơn (`cancelOrder`) → `VOIDED` bền + giữ giỏ | `993ms` (A), `978ms` (B) | `FAIL→FIXED` |
| `RT-11` | Tự huỷ quá hạn cron (`NEW` & `ADDON`, cấu hình 2p test) | `~124s` (`NEW`), `~129s` (`ADDON`) đúng ngưỡng | `PASS` |
| `RT-12` | Đồng thời `checkout` vs `cancel` (`+11ms`) | `321ms` (A), `1047ms` (B) — lock `PAID` nhất quán | `PASS` |
| `RT-13` | `MOVE` bàn `Bàn 01` → `Bàn 02` (`0` flicker) | `721–748ms` (A/B/C), tắt `6.14–6.17s` | `FAIL→FIXED` |
| `RT-14` | `MERGE` bàn → 2 phía nhận đúng thông báo & tổng đơn | `1062ms` (C đích), `1964–1978ms` (A/B nguồn) | `FAIL→FIXED` |
| `RT-15` | `SWAP` bàn → 2 nhóm khách giữ đúng đơn ở bàn mới | `735–769ms` (A/B/C), tắt `6.32–6.36s` | `FAIL→FIXED` |
| `RT-16` | Xoay QR token bàn → khoá tức thì `qr-rotated-lock-screen` | `82ms` (A, B) | `PASS` |
| `RT-17` | Tắt món ở `/menu` → đánh dấu `Hết món` & khoá gửi giỏ | `272–303ms` (notice), `550–663ms` (menu & giỏ) | `PASS` |
| `RT-18` | Đổi giá / tên món → badge `Giá mới`, đơn tạo theo giá mới | `464–1737ms` (A/B), tắt `5.42–5.85s` | `PASS` |
| `RT-19` | Bật lại món → mở khoá giỏ tự động | `319–333ms` (notice), `764–822ms` (mở giỏ) | `PASS` |
| `RT-20` | `/settings` thương hiệu, thông báo, Wi-Fi Lock & GPS Lock | `1730–1876ms` (`/settings`), `151–225ms` (Wi-Fi/GPS) | `FAIL→FIXED` |
| `RT-21` | Gửi đơn Mang về → thẻ `#01` & chống XSS ghi chú | `~1800ms` (card + banner `PENDING`) | `PASS` |
| `RT-22` | POS duyệt / tách bếp / sửa món / giảm giá / tạm tính / thanh toán Mang về | `623ms` (duyệt), `1074ms` (bếp), `1655ms` (tạm tính), `1152ms` (`PAID`) | `PASS` |
| `RT-23` | `Gọi đơn mới` sau `PAID`/`VOIDED` Mang về | `1578ms` (`VOIDED` trước reset) | `PASS` |
| `RT-24` | Offline 70s → online lại tự đồng bộ, ẩn chỉ báo kết nối | Online `→ 0ms` khớp `Bếp đã nhận`, `0` stale notice | `PASS` |
| `RT-25` | Chạy nền → foreground (`visibilitychange`, Dark `375×667`) | `72ms` (Vitest Test #10) / `< 1000ms` (Live) | `FAIL→FIXED` |
| `RT-26` | Mạng chậm `Slow 3G` (disabled khi gửi, đồng bộ không crash) | `785ms` (duyệt), `1169ms` (bếp), `9633ms` (HTTP submit) | `PASS` |
| `RT-27` | Dừng `api-server` `37.7s` rồi khởi động lại → reconnect & sync | `~3000ms` sau `Nest started` (`21:59:26`→`21:59:29`) | `PASS` |
| `RT-28` | 2 tab cùng máy khách → không nhân đôi, `BroadcastChannel` đồng bộ reset | `< 800ms`, tắt `5.84–6.34s` | `PASS` |
| `RT-29` | UI, A11y (`44×44px`, `aria-label`, `role="status"`, `aria-live`), WCAG AA & Modifier Sheet | `scrollW === innerW` (`375`/`390`); Light `13.02–14.44:1`; Dark `13.20–14.17:1` | `PASS` |
| `RT-30` | Stress 5 sự kiện trong `1595ms` → giới hạn ≤ 2 thẻ, console sạch | `619–620ms` đầu burst; tự dọn sạch sau `10.39–11.68s`; `0` React error/warn | `PASS` |

---

## 3. Kết Quả Definition of Done (Chạy SAU Lần Sửa Code Cuối Cùng)

| Bước DoD | Lệnh kiểm tra | Kết quả | Exit Code |
|----------|---------------|---------|-----------|
| 1 | `pnpm -r lint` | `shared`, `api-server`, `web-app` sạch (`0 errors`) | `0` |
| 2 | `pnpm -r typecheck` | `shared`, `api-server` (`tsconfig` + `tsconfig.spec`), `web-app` đạt | `0` |
| 3 | `pnpm --filter @fnb/web-app build` | Production build `2553 modules`, `4.75s` | `0` |
| 4 | `pnpm --filter @fnb/api-server exec tsc -p tsconfig.json` | Biên dịch server đạt | `0` |
| 5 | `pnpm -r --workspace-concurrency=1 test` | `@fnb/shared`: **6 files / 58 tests passed**<br>`@fnb/api-server`: **42 files / 381 tests passed**<br>`@fnb/web-app`: **41 files / 222 tests passed**<br>**Tổng: 89 files / 661 tests passed (0 fail, 0 skip)** | `0` |
| 6 | Rà soát `// TODO`, `// placeholder` & Sổ độ phủ | `0` match TODO/placeholder; `qr-realtime-ledger.md` còn `0` dòng `TODO`/`BLOCKED` | `0` |

---

## 4. Checklist Tự Kiểm Tra Trên Điện Thoại Thật Cùng Wi-Fi (8 Bước)

1. Mở POS trên máy tính và kết nối 2 điện thoại (A, B) cùng mạng Wi-Fi quán.
2. **Tại bàn — Điện thoại A & B:** Quét cùng QR `Bàn 01`; trên A chọn món và bấm **Gửi đặt món**, xác nhận cả A và B đều hiện banner `"Đã gửi đơn, vui lòng chờ thu ngân xác nhận"` trong ≤ 2 giây mà không cần tải lại trang.
3. **Thao tác POS → A & B:** Trên POS bấm **Duyệt đơn QR → Tách bếp → Áp giảm giá → In tạm tính**, kiểm tra thông báo tức thời trên A & B tự tắt sau ~6 giây, chạm nút `✕` tắt ngay được, và **không** hiển thị VietQR trên điện thoại khách.
4. **F5 sau thông báo tức thời:** Bấm tải lại trang trên điện thoại A ngay sau khi thông báo tức thời biến mất, xác nhận thông báo cũ không hiện lại nhưng danh sách món & giảm giá vẫn khớp.
5. **Thanh toán & Phiên mới:** Trên POS bấm **Thanh toán** bàn đó, kiểm tra A & B giữ cố định banner **Đã thanh toán** cho tới khi bấm **Gọi đơn mới** hoặc F5.
6. **Khoá màn hình rồi mở lại:** Với một đơn khác đang mở trên điện thoại A, khoá màn hình điện thoại 20 giây; trong lúc khoá hãy **Thanh toán** đơn đó ở POS, sau đó mở khoá lại — xác nhận trang tự đồng bộ về trạng thái đã kết thúc/bàn trống và không phát lại thông báo cũ.
7. **QR Mang về:** Dùng điện thoại A quét QR Mang về, nhập ghi chú, gửi đơn và kiểm tra thẻ số thứ tự (`Mang về #...`) + tiến trình bếp tự cập nhật khi POS duyệt và tách bếp.
8. **Chuyển/Gộp bàn (`MOVE`):** Khi một bàn khác có đơn, chuyển bàn trên POS và kiểm tra nhãn bàn ở góc trên cùng điện thoại tự đổi sang bàn mới không bị nháy lại bàn cũ.
