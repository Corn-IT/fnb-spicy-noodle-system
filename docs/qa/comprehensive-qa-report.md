# Báo Cáo Kiểm Thử Toàn Diện — Hệ Thống POS Mì Cay (`fnb-spicy-noodle-system`)

> **Nhánh kiểm thử:** `qa/comprehensive-audit` (Chặng 1 merged `main` `7a84efd`) & `refactor/coverage-and-modularity` (Chặng 2 Wave A–D)
> **Ngày hoàn tất nghiệm thu:** 2026-11-28 (Cập nhật hậu Chặng 2 Modularity & Sweet Spot Coverage Lock)
> **Môi trường kiểm thử thật:** PostgreSQL 16 (`.env` `fnb_pos`, 20 Prisma models / 20 SQL migrations) + NestJS 11 Production Build (`:3000`) + Vite 8 Production Preview Proxy (`:4173`) + Mock TCP Printer `:9100`
> **Tổng quan kết quả:** **100% PASS** trên mọi tầng kiểm tra tự động (TypeScript, ESLint, Vite/TSC Build, AST Cycle Scan `0` cycles, Vitest Sweet Spot Coverage Lock, Playwright Chromium + WebKit Mobile/Tablet/Desktop, Real-Stack API/DB/Socket/TCP `:9100`, Ego Browser Live Smoke QA). Không có `test.skip` che lỗi, không nới lỏng assertions.

---

## 1. Tóm Tắt Theo Tầng Kiểm Tra (Verification Layers — Stage 2 Wave D Final)

| Tầng kiểm tra | Phạm vi | Kết quả | Ghi chú |
|---|---|---|---|
| **Static TypeScript** | `@fnb/shared`, `@fnb/api-server`, `@fnb/web-app` | `PASS` | Chạy `pnpm -r typecheck` 0 lỗi |
| **ESLint Rules & Boundary** | Toàn bộ monorepo | `PASS` | Chạy `pnpm -r lint` 0 lỗi; `0` cross-feature imports trong `src/features/*` |
| **Production Build & AST Cycle Scan** | `tsc -p tsconfig.build.json`, `prisma generate && tsc`, `vite build` | `PASS` | `pnpm -r build` sạch (`0` circular chunk warnings); AST cycle scan `shared` (`41`), `api-server` (`164`), `web-app` (`367`) files → **`0` file-level cycles** |
| **Unit & Integration Tests + Coverage Lock** | `@fnb/shared` (10 files), `@fnb/api-server` (53 files), `@fnb/web-app` (103 files) — tổng `166` files / `1,138` tests | `PASS` | Sweet Spot thresholds khóa trong `vitest.config.ts` / `vite.config.ts`: Shared `95/92/95/95`, API `90/80/90/92`, Web `85/76/80/85` |
| **Graphify Knowledge Graph** | Toàn repo (`--mode deep --directed --wiki --svg`, theo `.graphifyignore`) | `PASS` | Phục vụ tra cứu kiến trúc & kiểm chứng `0` file-level import cycles sau khi đồng bộ commit `HEAD` cuối |
| **E2E Cross-Browser Suite (`e2e:mock`)** | `chromium-desktop`, `webkit-mobile`, `webkit-tablet`, `webkit-desktop` (15 mock specs) | `PASS` | **`232/232` PASS** (`8` skip hợp lệ theo thiết bị/zoom: phone-only/desktop-only viewport guards, `0` fail) |
| **Real-Stack Production Build E2E** | `store-settings-global-real.spec.ts` (`@real`, `E2E_REAL_ISOLATED=1`) trên `vite preview :4173` | `PASS` | `1/1` PASS: Staff + Guest QR đồng bộ real Socket `/pos`, optimistic concurrency `409`, offline recovery, RBAC `403` |
| **Real API / DB / Socket / Mock TCP `:9100`** | Flow A–D end-to-end, `SELECT ... FOR UPDATE` (`[201, 409]`), Cashflow Blind Mode, Invoice Void sync, LAN ESC/POS `:9100` (`ESC p`) | `PASS` | **`6/6`** nhóm kịch bản PASS, xác minh bytes `0x1b 0x70` trên TCP `:9100` & chặn `403` với `adminview` |
| **Live Production Exploratory QA (`ego-browser`)** | 16/16 routes Desktop `1366×768` + `/pos`, `/pos/touch` & `/q/ban01-63pq` Mobile `390×844` + `@media print` 80mm + Logout Invariant 9 | `PASS` | `overflowX: false` 100%, `0` ErrorBoundary, `@media print` `80mm` + Noto Sans verified, `fnb-ui-preferences` bảo toàn nguyên vẹn sau logout |

---

## 2. Ma Trận Độ Phủ Mã Nguồn & Ngưỡng Khóa (Sweet Spot Coverage Lock)

| Package | Ngưỡng khóa (Stmts / Branch / Funcs / Lines) | Mốc đạt được sau cùng (Post-Stage-2) | Config file |
|---|---:|---|---|
| `@fnb/shared` | `95 / 92 / 95 / 95` | `98.61% / 93.00% / 95.83% / 98.96%` (`10` files, `94` tests) | [vitest.config.ts](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/packages/shared/vitest.config.ts) |
| `@fnb/api-server` | `90 / 80 / 90 / 92` | `93.44% / 80.46% / 95.08% / 95.81%` (`53` files, `516` tests) | [vitest.config.ts](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/apps/api-server/vitest.config.ts) |
| `@fnb/web-app` | `85 / 76 / 80 / 85` | `85.79% / 76.12% / 82.14% / 87.66%` (`103` files, `528` tests) | [vite.config.ts](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/apps/web-app/vite.config.ts) |

*(Tổng cộng `166` test files, `1,138/1,138` tests PASS, `0` failures, `0` skips sau toàn bộ chỉnh sửa Chặng 1 + Chặng 2 Wave A–D.)*

### 2.1 Kết Quả Tái Cấu Trúc Modularity & Tối Ưu Bundle (Stage 2 Waves B–C)

| Tệp / Hạng mục | Trước Chặng 2 | Sau Chặng 2 | Ghi chú kiến trúc |
|---|---:|---:|---|
| `pos.service.ts` | `3,152` dòng | `748` dòng (`-76.3%`) | Facade + 5 helpers một chiều (`pos-shared`, `pos-drafts`, `pos-tables`, `pos-qr`, `pos-billing`) |
| `dashboard.service.ts` | `1,644` dòng | `412` dòng (`-74.9%`) | Facade + `dashboard-daily-sales.helper.ts`, `dashboard-builders.helper.ts` |
| `iam.service.ts` | `1,527` dòng | `161` dòng (`-89.5%`) | Facade + `iam-shared`, `iam-session`, `iam-users`, `iam-profile` |
| `qr-order-page.tsx` | `1,900` dòng | `497` dòng (`-73.8%`) | Tách hook filter/security, lock/header/menu/cart/placed sheets & hợp nhất `AddonServingModeToggle` |
| `use-pos-workspace.ts` | `1,439` dòng | `368` dòng (`-74.4%`) | Tách `use-pos-drafts`, `use-pos-order-items`, `use-pos-billing-actions` & helpers QR/label |
| `product-form-drawer.tsx` | `1,360` dòng | `304` dòng (`-77.6%`) | Tách `product-modifier-presets.ts`, `product-basic-and-combo-sections.tsx`, `product-modifier-groups-section.tsx` |
| `apps/web-app/vite.config.ts` | Chung vendor UI vào chunk `dialog` (`218K`) | Tách `vendor-radix` (`117K`), `vendor-tanstack` (`79K`), `vendor-icons` (`43K`) | Chunk `dialog-*.js` giảm từ `218K → 144K` (`-34%`), `base-table-*.js` `58K → 13K`, `0` circular warnings |

---

## 3. Danh Mục Lỗi Thực Tế Đã Phát Hiện & Tự Động Vá (Auto-Fixed Defect Registry)

| ID | Wave / Phase | Phân hệ | Nguyên nhân gốc rễ (Root Cause) | Bản vá & Test hồi quy |
|---|---|---|---|---|
| **W1-01** | Wave 1 | `IamService` Audit Diff | Thiếu nhóm `discounts`/`paymentQr`/`payroll` & dùng snake_case khi sinh label diff RBAC | [iam.service.ts](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/apps/api-server/src/modules/iam/iam.service.ts) + `iam-service-extra.spec.ts` |
| **W1-02** | Wave 1 | `SocketProvider` Single-Session | Chỉ theo dõi `userId` nên không reconnect sang `sid` mới sau khi đổi mật khẩu | [socket-provider.tsx](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/apps/web-app/src/providers/socket-provider.tsx), [api-client.ts](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/apps/web-app/src/lib/api-client.ts) + `socket-provider-recovery.test.tsx` |
| **W1-03** | Wave 1 | `CreateUserDialog` RBAC | Thiếu prop `onToggleModule` khiến nút bật/tắt cả module không chạy khi tạo tài khoản | [create-user-dialog.tsx](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/apps/web-app/src/features/rbac/components/create-user-dialog.tsx) + `rbac.test.tsx` |
| **W1-04** | Wave 1 | Cash Drawer RBAC (`ESC p`) | `StoreSettingsPage` hiện nút test két cho user `settings.view` & `printLanEscPos` chưa chặn `0x1b 0x70` | [store-settings-page.tsx](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/apps/web-app/src/features/store-settings/components/store-settings-page.tsx), [pos.controller.ts](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/apps/api-server/src/modules/pos/pos.controller.ts) + `thermal-lan-print.spec.ts` |
| **W2-01** | Wave 2 | `MdmService` → Public Menu Cache | Sửa `MENU_CATEGORY`/`KITCHEN_STATION` ở MDM chưa xóa `publicMenuCatalogCache` ở `MenuService` & thiếu invalidation `['menu-products']` | [menu.service.ts](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/apps/api-server/src/modules/menu/menu.service.ts), [master-data.api.ts](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/apps/web-app/src/features/master-data/api/master-data.api.ts) + `menu.service.spec.ts` |
| **W2-02** | Wave 2 | `MenuService.updateProduct` | Partial toggle trạng thái sản phẩm `COMBO` báo 400 nếu không gửi lại `comboItems` | [menu.service.ts](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/apps/api-server/src/modules/menu/menu.service.ts) + `menu.service.spec.ts` |
| **W2-03** | Wave 2 | `MasterDataPage` Dynamic `BEP_*` | Select trạm bếp của `MENU_CATEGORY` chỉ có 4 trạm cứng, thiếu trạm mở rộng `BEP_*` | [master-data-page.tsx](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/apps/web-app/src/features/master-data/components/master-data-page.tsx) + `master-data.test.tsx` |
| **W4-01** | Wave 4 | `InvoicesService.voidInvoice` | Huỷ hoá đơn đã thuộc phiên kết ca trước không tính lại `cash_drawer_settlements` | [invoices.service.ts](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/apps/api-server/src/modules/pos/invoices.service.ts) (`recalculateSettledCashflowsForTimestamp`) + `invoices.service.spec.ts` |
| **W4-02** | Wave 4 | `payment-qr.api` & Form Hint | Gõ sai response `{ deletedId }` thành `{ deleted, id }` & helper text ghi `>` thay vì D6 `>=` | [payment-qr.api.ts](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/apps/web-app/src/features/payment-qr/api/payment-qr.api.ts), [payment-qr-form-drawer.tsx](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/apps/web-app/src/features/payment-qr/components/payment-qr-form-drawer.tsx) |
| **W5-01** | Wave 5 | `CashflowService.compensate` | Bù ca `SURPLUS` (trừ tiền két) lại cộng `compDecimal` khi ghi `metadata.changes` | [cashflow.service.ts](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/apps/api-server/src/modules/cashflow/cashflow.service.ts) (`newActualCash`) + `cashflow.service.spec.ts` |
| **W5-02** | Wave 5 | `InventoryPage.isSameDayRecord` | Frontend kiểm tra `importDate === today` lệch với backend kiểm tra `createdAt` | [inventory-page.tsx](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/apps/web-app/src/features/inventory/components/inventory-page.tsx) + `inventory.test.tsx` |
| **P7-02** | Phase 7 | `MobileAudioActivationBanner` | Lớp `fixed` che khuất nút tương tác phía dưới trên iOS WebKit (140 vi phạm `INTERACTIVE_OCCLUDED`) | [mobile-alert-controls.tsx](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/apps/web-app/src/components/layout/mobile-alert-controls.tsx) (`shrink-0` in-flow) + `mobile-order-alerts.spec.tsx` |
| **P7-03** | Phase 7 | `useMobileOrderAlertLifecycle` | Listener `pointerdown`/`touchend` ẩn banner in-flow giữa lúc chạm làm trượt tọa độ `pointerup` khỏi nút mục tiêu | [use-mobile-order-alerts.ts](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/apps/web-app/src/hooks/use-mobile-order-alerts.ts) (`click`/`keydown` only) + `mobile-order-alerts.spec.tsx` |
| **P7-04** | Phase 7 | `PosUnifiedPage` Responsive | Tab bị cắt hai đầu ở 1024px và `pos-tab-menu` đè vào cột phải khi zoom 150% ở 820px/1024px | [pos-unified-page.tsx](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/apps/web-app/src/features/pos-counter/components/pos-unified-page.tsx) (`clamp()` + `basis-full xl:basis-auto`) + `responsive-matrix.spec.ts` |
| **P7-06** | Phase 7 | `vite.config.ts` Preview Proxy | Thiếu `preview.proxy` cho `/api` và `/socket.io` khi chạy kiểm thử bản build với `vite preview` | [vite.config.ts](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/apps/web-app/vite.config.ts) |
| **P9-01** | Phase 9 | `seed.ts --reset-all` FK Cleanup | `resetAllOperationalAndSeed` chưa xoá `posDraft`, `pushSubscription`, `takeawaySequence` trước `order` gây lỗi `pos_drafts_submitted_order_id_fkey` | [seed.ts](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/apps/api-server/prisma/seed.ts) |

---

## 4. Đồng Bộ 10 Quy Tắc Bất Biến (10 Hard Invariants Status)

Toàn bộ 10 Hard Invariants trong `AGENTS.md` §5 đều được kiểm tra thực thi ở cả lớp Static Scan, Unit/Integration Test, và Live PostgreSQL + API + Socket:
1. **Cô lập Module (`src/features/*`):** Đạt — 0 cross-feature imports; Touch Shell dùng `React.lazy()` qua `router.tsx`.
2. **Đơn Mang về (`TAKEAWAY` vs `DINE_IN`):** Đạt — `table_id = NULL`, `takeaway_number` tự tăng theo `+07:00`, `dining_tables` chỉ chứa 30 bàn vật lý.
3. **Delta Split Đa Trạm Bếp:** Đạt — chỉ lọc `NEW`, phân rã `COMBO` qua `combo_items`, idempotent HTTP 200 `{ tickets: [] }`.
4. **Tách bạch Tạm tính vs Thanh toán:** Đạt — `provisional-bill` giữ `SERVING` + xoay QR; `checkout`/`split-checkout` đóng `PAID` + mở bàn.
5. **Khoá dòng `SELECT ... FOR UPDATE`:** Đạt — khoá `orders -> dining_tables -> discounts` chống AB-BA Deadlock (kiểm chứng conflict race song song trên PostgreSQL).
6. **Công thức Kết ca Dòng tiền:** Đạt — `CASH + SPLIT.cash_amount - CASH_DRAWER`; loại `TRANSFER`, `VOIDED`, `EXTERNAL`; Blind Mode hoạt động cho non-SuperAdmin.
7. **MDM Chuẩn hoá Chuỗi:** Đạt — `MdmService.findOrCreate()` dùng `(category, normalized_name)`; `f_search_norm()` chỉ dùng tìm kiếm mờ.
8. **RBAC `401` vs `403` & `/mdm/lookup`:** Đạt — mọi endpoint chuẩn xác giữa `401` / `403`; `/mdm/lookup` mở cho mọi user đăng nhập.
9. **Giữ `ui_preferences` khi Đăng xuất:** Đạt — `fnb-ui-preferences` giữ nguyên sau logout trong `ego-browser` build thật.
10. **Kiểu Tiền tệ `NUMERIC(12, 2)` / `Decimal`:** Đạt — 0 cột tiền dùng `Float` / `Int`.

---

## 5. `HARDWARE_MANUAL_UAT` — Danh Mục Nghiệm Thu Phần Cứng Thực Tế Tại Quầy

> [!IMPORTANT]
> Môi trường CI/Sandbox đã kiểm chứng đầy đủ giao thức nhị phân (`ESC/POS` bytes qua Mock TCP `:9100`, layout CSS `@media print` 80mm, và Web Audio API / Keep-Alive PCM). Các hạng mục phần cứng vật lý dưới đây cần chạy kiểm chứng thủ công một lần ngay tại quầy quán:

| STT | Thiết bị / Kịch bản phần cứng | Cách kiểm chứng tại quán | Tiêu chí nghiệm thu (`PASS`) |
|---|---|---|---|
| **HW-01** | **Máy POS Android `iMin D3-505` + Cáp USB `iPOS.vn iTP6` (`RawBT`)** | Vào `/pos/touch/printer` (hoặc `/settings` Tab `Phiếu in`) chọn driver `RAWBT`, bấm **In phiếu kiểm tra 80mm** và thử **Tách bếp** 1 đơn có món `COMBO` | Giấy 80mm (`576 dots`) cắt rời tự động từng trạm bếp, chữ tiếng Việt UTF-8 sắc nét, không mất lề |
| **HW-02** | **Máy in LAN `iPOS.vn iTP6` cổng Ethernet TCP `:9100`** | Cấu hình IP LAN tĩnh của máy in (VD `192.168.1.200:9100`), chọn `LAN_ESCPOS`, in thử phiếu kiểm tra và hoá đơn chính thức có VietQR | API trả HTTP `200` trong `< 500ms`; hoá đơn in đủ mã VietQR nét đọc được bằng app ngân hàng |
| **HW-03** | **Két đựng tiền nối cổng `RJ11 24V` của máy in** | Bấm nút test mở két 2 bước tại `/pos/touch/printer`, và chốt 1 đơn `CASH` (`Xác nhận & Không in` + `Xác nhận & In`) | Xung `ESC p` (`0x1b 0x70`) bung ngăn kéo két ngay lập tức khi có quyền hợp lệ; bị chặn `403` nếu user thiếu quyền |
| **HW-04** | **Loa quán & Khả năng đọc giọng nói tiếng Việt trên iOS/Android** | Mở `/pos` trên điện thoại & loa POS, giữ màn hình khoá nhẹ (Lock screen), gửi 1 đơn QR mới từ điện thoại khách | Bấm kích hoạt loa 1 lần không làm nhảy giao diện; tiếng Việt đọc rõ ràng + Web Push hiện đúng khi tắt màn hình |

---

## 6. Graphify Knowledge Graph & Chuyển Giao Agent (`Phase 9`)

- Đã lập chỉ mục toàn bộ hệ thống (`611` code files + `49` project docs, loại trừ tooling/media qua [.graphifyignore](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/.graphifyignore)) bằng `graphify` (`--mode deep --directed --wiki --svg`):
  - **Quy mô đồ thị:** `4,911` nodes, `17,534` directed edges, `190` communities có nhãn tiếng Anh chuẩn domain (`97%` `EXTRACTED`, `3%` `INFERRED`, `0%` `AMBIGUOUS`), `18` hyperedges.
  - **Đầu ra chính:** [GRAPH_REPORT.md](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/graphify-out/GRAPH_REPORT.md), [wiki/index.md](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/graphify-out/wiki/index.md) (`200` bài wiki domain), [graph.json](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/graphify-out/graph.json), `graphify-out/graph.html`, `graphify-out/graph.svg`, và `graphify-out/fnb-spicy-noodle-system-callflow.html` (`18` sections, `16` Mermaid diagrams).
  - **Hiệu quả truy vấn (`graphify benchmark`):** giảm **`202.1x`** lượng token mỗi câu hỏi (`327,400` tokens naive xuống `~1,620` tokens).
  - **Chẩn đoán sức khỏe đồ thị (`diagnose_extraction`):** `0` missing-endpoint edges, `0` unverified code nodes, `4` dangling-endpoint edges (AST literal/dynamic font refs), `2` self-loop edges, `481` collapsed same-endpoint directed edges (NestJS `@Inject`/`@Query` decorator repetition), và **`0` multi-file import cycles** sau khi tách [app-navigation.ts](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/apps/web-app/src/lib/app-navigation.ts) khỏi [command-palette.tsx](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/apps/web-app/src/components/layout/command-palette.tsx).
  - **Hướng dẫn onboarding:** Đã bổ sung `§10. GRAPHIFY KNOWLEDGE GRAPH & AGENT ONBOARDING` vào [AGENTS.md](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/AGENTS.md) và cấu hình [.gitignore](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/.gitignore) giữ `graphify-out/` cục bộ (version hoá [.graphifyignore](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/.graphifyignore) để tái lập đồng nhất).
  - **Đồng bộ Chặng 2 (Wave D):** Sau khi tách 6 file lớn & chốt commit `HEAD` nhánh `refactor/coverage-and-modularity`, chỉ mục `graphify-out/` được tái đồng bộ cục bộ khớp `HEAD` với `0` file-level import cycles.
