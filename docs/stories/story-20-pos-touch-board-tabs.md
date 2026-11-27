# Story 20: Màn POS cảm ứng — phiên bản ban đầu với 3 tab sơ đồ bàn

> **Story ID:** `STORY-20`
> **Trạng thái:** Đã triển khai (Completed)
> **Tên file:** `docs/stories/story-20-pos-touch-board-tabs.md`
> **Phạm vi:** Chỉ frontend, chỉ màn `/pos/touch` (`apps/web-app/src/features/pos-counter/touch/`). **Không** sửa backend, `packages/shared`, `/pos` thường hay luồng đặt món.
> **Người thực hiện:** Agent Codex.
> **Quy tắc bắt buộc:** Đọc `AGENTS.md` và `.agents/rules/04-frontend-ux-table-and-print.md`, `05-testing-strategy.md`, `07-deployment-and-git.md` trước khi code. Hard Invariant 1 (cô lập module): toàn bộ code mới nằm trong `features/pos-counter/touch/`.

> **Cập nhật hiện trạng (2026-11-27):** Story này ghi lại phạm vi ban đầu gồm `Tất cả / Phòng bàn / Mang về`. POS Touch hiện có thêm tab `Lưu tạm`. Thẻ `Giỏ chưa gán bàn` xuất hiện đúng một lần trong Tất cả, Mang về và Lưu tạm; ở Lưu tạm thẻ nằm trước danh sách giỏ đã lưu. Thẻ này không xuất hiện ở Phòng bàn. Các yêu cầu bên dưới mô tả lịch sử triển khai Story 20; trạng thái hiện tại được chuẩn hoá trong `.agents/rules/04-frontend-ux-table-and-print.md` và hướng dẫn sử dụng.

---

## 1. BỐI CẢNH

Màn sơ đồ bàn cảm ứng (`/pos/touch`, component `PosTouchPage`) hiện hiển thị **trên cùng một trang cuộn**:

- khu **Phòng bàn** (lưới thẻ bàn) ở trên;
- khu **Mang về** (ô "+ Đơn mang về mới" và các thẻ "Mang về #NN") ngay bên dưới;
- thanh trên cùng có nút **"Mang về (n)"** để cuộn xuống khu Mang về, và nút **"+ Mang về mới"**.

Chủ quán muốn quay lại kiểu **tab** như trước, nhưng có thêm tab **"Tất cả"**. Trong tab "Tất cả", **ô "+ Đơn mang về mới" và các đơn mang về đang phục vụ đứng đầu tiên, trước Bàn 01**, để thu ngân thấy ngay đơn mang về mà không phải cuộn.

## 2. HÀNH VI MONG MUỐN

### 2.1. Ba tab trên thanh trên cùng

| Tab | Nội dung lưới (theo đúng thứ tự) | Mặc định |
|---|---|---|
| **Tất cả** | 1. Ô "+ Đơn mang về mới" (chỉ khi có quyền tạo đơn) → 2. Các thẻ đơn mang về đang phục vụ → 3. Các thẻ bàn (Bàn 01, 02, …) | ✅ Tab được chọn khi mở màn |
| **Phòng bàn** | Chỉ các thẻ bàn | |
| **Mang về** | Ô "+ Đơn mang về mới" (nếu có quyền) → các thẻ đơn mang về | |

- Nhãn tab có số đếm: `Tất cả`, `Phòng bàn`, `Mang về (n)` với `n = takeaways.length`.
- Tab "Tất cả" dùng **một lưới liền mạch** (không tiêu đề khu, không tách 2 lưới) để đơn mang về nằm cùng hàng/cột với bàn, đúng "trước Bàn 01".
- Tab "Phòng bàn" và "Mang về" **không cần** tiêu đề khu ("PHÒNG BÀN", "MANG VỀ") nữa vì tên tab đã nói rõ. Có thể giữ nếu thấy cần, nhưng không bắt buộc.
- Thứ tự thẻ mang về: tăng dần theo `takeawayNumber` (#01, #02, …); đơn không có số thì xếp sau, theo `createdAt` tăng dần. Thẻ bàn giữ thứ tự API trả về (như hiện tại).
- Tab đang chọn **giữ nguyên** khi thu ngân mở 1 bàn / đơn rồi bấm "← Sơ đồ bàn" quay lại (state nằm ở `PosTouchPage`, không nằm trong component bị unmount). Không cần lưu qua lần tải lại trang (reload về "Tất cả").

### 2.2. Thanh trên cùng sau khi đổi

Thứ tự từ trái sang phải:

1. **3 tab** (nút lớn, cao ≥ 48px, kiểu "segmented" giống tab cũ đã từng có: nền `bg-muted`, tab đang chọn `bg-primary text-primary-foreground`).
2. Dòng tóm tắt `Trống x/y bàn` (giữ `data-testid="touch-table-summary"`, co giãn + `truncate`).
3. Công tắc **"Bàn có hoá đơn"** — **ẩn khi đang ở tab "Mang về"** (không có tác dụng ở đó).
4. Nút **"+ Mang về mới"** (`touch-header-new-takeaway`) — **giữ nguyên** (vẫn hữu ích ở tab "Phòng bàn").
5. Loa, đồng hồ, menu ⋮ — giữ nguyên.

**Bỏ** nút "Mang về (n)" cuộn xuống (`touch-jump-takeaway`), hàm `scrollToTakeaways` và hằng `TAKEAWAY_SECTION_ID` — tab "Mang về" thay thế chức năng này.

**Chống tràn ở màn hẹp (bắt buộc):** ở bề ngang 960px thanh trên cùng phải vừa, không cuộn ngang. Gợi ý: dưới `min-[1100px]` thu chữ công tắc thành "Có HĐ" (giữ `aria-label="Bàn có hoá đơn"`), tab "Phòng bàn" hiển thị "Bàn"; dòng tóm tắt được phép bị cắt (`truncate`).

### 2.3. Công tắc "Bàn có hoá đơn"

- Tab **Tất cả**: chỉ lọc **thẻ bàn** (ẩn bàn trống); ô "+ Đơn mang về mới" và thẻ mang về **vẫn hiện**.
- Tab **Phòng bàn**: lọc thẻ bàn như hiện tại.
- Tab **Mang về**: công tắc bị ẩn; trạng thái bật/tắt vẫn giữ để khi quay lại tab khác vẫn đúng.

### 2.4. Trạng thái rỗng

- "Phòng bàn" khi lọc mà không còn bàn: giữ câu hiện có `Chưa có bàn nào đang có hoá đơn` / `Chưa cấu hình bàn nào`.
- "Mang về" khi không có quyền tạo và không có đơn: `Chưa có đơn mang về nào đang phục vụ`.
- "Tất cả" khi lọc bật và không có bàn có hoá đơn: vẫn hiện các ô mang về; nếu cả hai đều rỗng thì hiện `Chưa có bàn nào đang có hoá đơn`.

### 2.5. Những thứ KHÔNG được đổi

- Kích thước thẻ (`min-h-36`), màu theo trạng thái, huy hiệu QR / Gọi thêm / Quá giờ, thời gian ngồi.
- Bố cục số cột theo máy (`touch-layout.ts`, `useGridColumns('tables', columns)`, menu ⋮ → "Bố cục hiển thị"): **cả 3 tab dùng chung một số cột** theo lựa chọn `tableColumns`.
- Thẻ mang về hiển thị "MANG VỀ" (dòng nhỏ) + "#NN" (tên chính) như hiện tại.
- Mọi luồng khi chạm thẻ: `actions.selectTable`, `actions.selectTakeawayOrder`, `actions.startNewTakeaway`.

## 3. THIẾT KẾ KỸ THUẬT

### 3.1. Kiểu dữ liệu tab

Trong `touch/touch-table-board.tsx`:

```ts
export type TouchBoardTab = 'all' | 'tables' | 'takeaway';
```

### 3.2. `TouchTableBoard` (file `touch/touch-table-board.tsx`)

- Thêm prop bắt buộc `tab: TouchBoardTab`.
- Bỏ `TAKEAWAY_SECTION_ID`, `SectionHeading` (nếu không còn dùng) và việc render 2 section cố định.
- Tách phần dựng từng thẻ thành các hàm/thành phần nhỏ để tái dùng giữa các tab:
  - `renderNewTakeawayTile()` → ô "+ Đơn mang về mới" (giữ `data-testid="touch-new-takeaway"`), chỉ khi `canCreateOrder`.
  - `renderTakeawayCard(order)` → `TouchBoardCard` như hiện tại (`touch-takeaway-card-{orderId}`).
  - `renderTableCard(table)` → `TouchBoardCard` như hiện tại (`touch-table-card-{tableId}`).
- Sắp xếp mang về bằng một hàm thuần có export để test: `sortTakeawaysForBoard(takeaways)`.
- Danh sách phần tử của lưới theo tab:
  - `all`: `[newTile?, ...sortedTakeaways.map(card), ...visibleTables.map(card)]`
  - `tables`: `visibleTables.map(card)`
  - `takeaway`: `[newTile?, ...sortedTakeaways.map(card)]`
- **Một lưới duy nhất** cho mọi tab, giữ nguyên các thuộc tính đang được test dùng:
  - `ref={grid.ref}`, `style={grid.style}`, `data-testid="touch-table-grid"`, `data-columns={grid.columns}`.
- Phần tử bao ngoài (root của board): `data-testid="touch-table-board"` **ở mọi tab** (nhiều test hiện có dùng testid này làm tín hiệu "đang ở sơ đồ bàn") + thêm `data-tab={tab}`.
- Giữ dòng thông báo khi số cột bị tự giảm (`touch-board-columns-clamped`).
- Lưu ý `useGridColumns` đo bề rộng bằng `ResizeObserver` gắn vào `grid.ref` trong `useLayoutEffect([])`: lưới **phải luôn được render** (kể cả khi rỗng) để phép đo không mất khi đổi tab. Đừng render lưới có điều kiện.

### 3.3. `PosTouchPage` (file `touch/pos-touch-page.tsx`)

- `const [boardTab, setBoardTab] = React.useState<TouchBoardTab>('all');`
- Header: thêm cụm tab (`role="tablist"`, mỗi nút `role="tab"`, `aria-selected`, `aria-controls="touch-table-board"`), testid:
  - `touch-tab-all`, `touch-tab-tables`, `touch-tab-takeaway`.
- Bỏ nút `touch-jump-takeaway`, hàm `scrollToTakeaways`, import `TAKEAWAY_SECTION_ID`.
- Ẩn công tắc `touch-only-occupied` khi `boardTab === 'takeaway'`.
- Truyền `tab={boardTab}` cho `TouchTableBoard`.
- Không đổi gì ở màn đặt món (`TouchOrderScreen`) hay menu ⋮.

### 3.4. Gợi ý giao diện nút tab

Tái dùng đúng kiểu nút tab cũ (đã có trong lịch sử git, commit `fd3c378`, component `BoardTabButton` trong `pos-touch-page.tsx`): `flex h-12 items-center gap-2 rounded-lg px-4 text-base font-bold`, icon `LayoutGrid` (Tất cả), `Utensils` (Phòng bàn), `ShoppingBag` (Mang về).

## 4. KẾ HOẠCH THỰC HIỆN (theo thứ tự)

1. `git switch develop && git pull` rồi tạo nhánh `feat/pos-touch-board-tabs`.
2. Sửa `touch-table-board.tsx` theo §3.2 (thêm `TouchBoardTab`, `sortTakeawaysForBoard`, 1 lưới, testid như mô tả).
3. Sửa `pos-touch-page.tsx` theo §3.3 (tab state, header, bỏ nút cuộn).
4. Cập nhật test hiện có (§5.1) và viết test mới (§5.2, §5.3).
5. Chạy kiểm tra bắt buộc (§6), kiểm tra giao diện thật (§7).
6. Commit theo Conventional Commits, ví dụ: `feat(pos): restore All/Tables/Takeaway tabs on touch board`. Kết thúc commit message bằng dòng Co-Authored-By nếu quy trình của agent yêu cầu.
7. Push nhánh; việc gộp vào `develop`/`main` do chủ dự án quyết định.

## 5. KIỂM THỬ

### 5.1. Test hiện có phải cập nhật

| File | Test | Cần đổi |
|---|---|---|
| `apps/web-app/src/features/pos-counter/touch/__tests__/pos-touch-page.test.tsx` | `shows takeaway orders on the same screen below the tables and starts one from the header` | Viết lại theo tab: ở tab "Tất cả" thẻ mang về đứng **trước** thẻ bàn trong cùng lưới; bỏ phần `touch-jump-takeaway`. Đổi tên test cho đúng hành vi mới. |
| cùng file | Các test dùng `touch-table-board` làm tín hiệu quay về sơ đồ | Giữ nguyên — testid vẫn tồn tại ở mọi tab. Chạy lại để chắc chắn pass. |
| `apps/web-app/e2e/pos-touch.spec.ts` | `POS cảm ứng — sơ đồ bàn và mang về trên cùng một màn` → `shows big table cards, then the takeaway section below with a jump button` | Viết lại thành test tab (xem §5.3). Bỏ kiểm tra `touch-takeaway-board` nằm dưới và `touch-jump-takeaway`. |
| cùng file | `creates a TAKEAWAY order with tableId null from the takeaway tab` | Giữ dùng `touch-header-new-takeaway`; thêm biến thể chạm ô `touch-new-takeaway` từ tab "Mang về". |
| cùng file | Các test bố cục số cột dùng `touch-table-grid` | Giữ nguyên; đảm bảo vẫn pass ở tab "Tất cả" (mặc định). |

Tìm nhanh mọi chỗ cần soát: `grep -rn "touch-jump-takeaway\|touch-takeaway-board\|TAKEAWAY_SECTION_ID\|touch-tab-" apps/web-app/src apps/web-app/e2e`.

### 5.2. Unit / component test mới (Vitest + Testing Library)

Đặt trong `touch/__tests__/` — tái dùng harness của `pos-touch-page.test.tsx` (MockSocket, mock `apiClient.get`, `renderTouchPage()`).

1. **Mặc định là tab "Tất cả"**: `touch-tab-all` có `aria-selected="true"`; `touch-table-board` có `data-tab="all"`.
2. **Thứ tự trong tab "Tất cả"**: với 2 đơn mang về (#02 tạo trước, #01 tạo sau) và bàn 1, 7 → thứ tự `data-testid` các con trực tiếp của `touch-table-grid` là `touch-new-takeaway`, `touch-takeaway-card-<#01>`, `touch-takeaway-card-<#02>`, `touch-table-card-1`, `touch-table-card-7`.
3. **Không có quyền tạo đơn** (`pos.create: false`): tab "Tất cả" không có `touch-new-takeaway`, phần tử đầu tiên là thẻ mang về (hoặc Bàn 01 nếu không có đơn mang về).
4. **Tab "Phòng bàn"**: chỉ có `touch-table-card-*`, không có `touch-new-takeaway` hay `touch-takeaway-card-*`.
5. **Tab "Mang về"**: chỉ có `touch-new-takeaway` và `touch-takeaway-card-*`; công tắc `touch-only-occupied` **không** có trong DOM; nhãn tab là `Mang về (2)`.
6. **Công tắc "Bàn có hoá đơn" ở tab "Tất cả"**: bật → Bàn 01 (trống) biến mất, thẻ mang về và ô "+ mới" vẫn còn.
7. **Giữ tab khi quay lại**: chọn tab "Mang về" → chạm 1 thẻ mang về → `touch-back-to-tables` → vẫn ở tab "Mang về".
8. **`sortTakeawaysForBoard`** (test thuần trong file riêng `touch-board-tabs.test.ts`): sắp theo `takeawayNumber` tăng dần, đơn `takeawayNumber = null` xếp cuối theo `createdAt`, không làm đổi mảng đầu vào (immutable).

Sau khi viết, **tự kiểm chứng test có giá trị**: tạm đảo thứ tự (đặt bàn trước mang về) trong code → test #2 phải FAIL; khôi phục lại → PASS.

### 5.3. E2E (Playwright, `apps/web-app/e2e/pos-touch.spec.ts`)

Dùng fixture `setupMockApi` (đã có `/store-messages`), `test.use({ viewport, hasTouch: true })`, thao tác bằng `tap()`.

1. **1280×720 — thứ tự tab "Tất cả"**: phần tử đầu tiên của `touch-table-grid` là `touch-new-takeaway`; nếu fixture có đơn mang về thì thẻ mang về đứng trước `touch-table-card-1` (so `boundingBox` theo thứ tự đọc: cùng hàng thì `x` nhỏ hơn, khác hàng thì `y` nhỏ hơn). Ghi đè `**/api/v1/pos/tables` trong test để có 1–2 đơn mang về.
2. **Chuyển tab**: tap `touch-tab-tables` → không còn `touch-new-takeaway`; tap `touch-tab-takeaway` → không còn `touch-table-card-1`, công tắc `touch-only-occupied` không hiển thị.
3. **Tạo mang về từ tab "Mang về"**: tap `touch-tab-takeaway` → tap `touch-new-takeaway` → tiêu đề màn đặt món chứa "Mang về".
4. **Không tràn thanh trên cùng** ở 960×540, 1024×600, 1280×720, 1920×1080: `header.scrollWidth <= header.clientWidth + 1` và `document.documentElement.scrollWidth <= innerWidth + 1`; nút `touch-kiosk-menu-btn` nằm trong viewport.
5. **Bố cục số cột vẫn đúng**: test hiện có `auto: 6 tables and 4 dishes per row at 1280×720` và `picking 4 tables / 3 dishes…` vẫn pass (đếm cột dựa trên `touch-table-card-*`).

Chạy e2e cần dev server. Nếu cổng 5173 bận, chạy server riêng ở cổng khác rồi đặt `E2E_BASE_URL` (ví dụ `E2E_BASE_URL=http://127.0.0.1:5181 npx playwright test e2e/pos-touch.spec.ts --project=chromium-desktop`).

## 6. KIỂM TRA BẮT BUỘC TRƯỚC KHI BÁO HOÀN THÀNH

```bash
pnpm -r typecheck
pnpm -r lint
pnpm -r test
cd apps/web-app && npx playwright test --reporter=line
```

Tất cả phải xanh. Lưu ý: `eslint` của dự án **không** có plugin `react-hooks` — đừng thêm comment `eslint-disable react-hooks/...` (sẽ báo lỗi "Definition for rule … was not found").

## 7. KIỂM TRA GIAO DIỆN THẬT

1. Chụp ảnh (Playwright `page.screenshot`) 3 tab ở 1280×720 và 960×540, có ít nhất 2 đơn mang về.
2. Xác nhận bằng mắt: ở tab "Tất cả", hàng đầu tiên bắt đầu bằng "+ Đơn mang về mới", tiếp theo là "MANG VỀ #01", "#02", rồi mới tới "Bàn 01".
3. Nếu có backend + database local (`apps/api-server`, cổng 3000; tài khoản seed `thungan` trong `apps/api-server/prisma/seed-data.ts`): tạo 1 đơn mang về thật, kiểm tra nó hiện ở đầu tab "Tất cả" và trong tab "Mang về". **Dọn dẹp bằng cách huỷ (VOID) đơn thử**, không thanh toán, để không làm sai doanh thu/tiền két của database dev. Không đụng tới đơn không phải do mình tạo.
4. Lưu ý: lần chạm đầu tiên trên `/pos/touch` sẽ bật toàn màn hình (`requestFullscreen`). Trong Playwright, nếu cần `setViewportSize` sau đó thì gọi `document.exitFullscreen()` trước.

## 8. TIÊU CHÍ HOÀN THÀNH (DEFINITION OF DONE)

- [ ] Thanh trên cùng có 3 tab "Tất cả / Phòng bàn / Mang về (n)", mặc định "Tất cả".
- [ ] Tab "Tất cả": "+ Đơn mang về mới" (nếu có quyền) → đơn mang về (#01, #02…) → Bàn 01… trong **một lưới**.
- [ ] Tab "Phòng bàn" chỉ có bàn; tab "Mang về" chỉ có mang về, công tắc "Bàn có hoá đơn" ẩn.
- [ ] Tab giữ nguyên khi đi vào đơn rồi quay lại.
- [ ] Đã bỏ nút "Mang về (n)" cuộn xuống và mã cuộn liên quan.
- [ ] Bố cục số cột, kích thước thẻ, huy hiệu, màu sắc không đổi.
- [ ] Không tràn thanh trên cùng ở 960 → 1920px.
- [ ] Test cũ đã cập nhật, test mới (§5.2, §5.3) đã viết và **đã kiểm chứng FAIL khi đảo thứ tự**.
- [ ] `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test`, toàn bộ Playwright đều xanh.
- [ ] Ảnh chụp 3 tab ở 1280×720 và 960×540 đính kèm báo cáo.
