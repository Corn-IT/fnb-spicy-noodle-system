# Báo Cáo Kiểm Thử Toàn Diện — Hệ Thống POS Mì Cay (`fnb-spicy-noodle-system`)

> **Nhánh kiểm thử:** `qa/comprehensive-audit`
> **Ngày hoàn tất nghiệm thu:** 2026-11-28
> **Môi trường kiểm thử thật:** PostgreSQL 16 (`.env` `fnb_pos`, 20 Prisma models / 20 SQL migrations) + NestJS 11 Production Build (`:3000`) + Vite 8 Production Preview Proxy (`:4173`) + Mock TCP Printer `:9100`
> **Tổng quan kết quả:** **100% PASS** trên mọi tầng kiểm tra tự động (TypeScript, ESLint, Vite/TSC Build, Vitest Coverage Lock, Playwright Chromium + WebKit Mobile/Tablet/Desktop, Real-Stack API/DB/Socket/TCP `:9100`, Ego Browser Live Smoke QA). Không có `test.skip` che lỗi, không nới lỏng assertions.

---

## 1. Tóm Tắt Theo Tầng Kiểm Tra (Verification Layers)

| Tầng kiểm tra | Phạm vi | Kết quả | Ghi chú |
|---|---|---|---|
| **Static TypeScript** | `@fnb/shared`, `@fnb/api-server`, `@fnb/web-app` | `PASS` | Chạy `pnpm -r typecheck` không lỗi |
| **ESLint Rules** | Toàn bộ monorepo (bao gồm kiểm tra ranh giới module) | `PASS` | Chạy `pnpm -r lint` 0 lỗi |
| **Production Build** | `tsc -p tsconfig.build.json`, `prisma generate && tsc`, `vite build` | `PASS` | Chạy `pnpm -r build` sạch |
| **Unit & Integration Tests + Coverage Lock** | `@fnb/shared` (10 files), `@fnb/api-server` (53 files), `@fnb/web-app` (97 files) — tổng `160` files / `1,068` tests | `PASS` | Ratchet thresholds khóa trong `vitest.config.ts` / `vite.config.ts`: Shared `90/90/90/90`, API `88/75/90/90`, Web `80/72/75/81` |
| **Graphify Knowledge Graph** | Toàn repo (`611` code + `49` project docs qua `.graphifyignore`, `--mode deep --directed --wiki --svg`) | `PASS` | `4,911` nodes, `17,534` edges, `190` communities, `200` wiki articles, `graph.html`/`graph.svg`/`callflow.html`, giảm `202.1x` tokens/query |
| **E2E WebKit Matrix (`M / T / D`)** | `webkit-mobile`, `webkit-tablet`, `webkit-desktop` | `PASS` | `responsive-matrix.spec.ts` `24/24` PASS + `103/103` PASS (`7` skip hợp lệ theo thiết bị/màn hình) |
| **E2E Chromium Full Regression** | 15 spec files (`all-routes-responsive-visual` 17 viewports, `responsive-matrix` 4 scales × 2 themes, `pos-touch`, `pos-drafts`, `takeaway-*`, `thermal-raster-qr`, ...) | `PASS` | `105/105` PASS (`2` skip hợp lệ: phone-only test trên desktop & `@real` tách riêng) |
| **Real-Stack Production Build E2E** | `store-settings-global-real.spec.ts` (`@real`, `E2E_REAL_ISOLATED=1`) | `PASS` | `1/1` PASS: Staff + Guest QR đồng bộ real Socket `/pos`, optimistic concurrency `409`, offline recovery, RBAC `403` |
| **Real API / DB / Socket / Mock TCP `:9100`** | Flow A–D end-to-end, `SELECT ... FOR UPDATE` race, Cashflow Blind Mode, Invoice Void sync, HR & Payroll, LAN ESC/POS `:9100` | `PASS` | 7/7 nhóm kịch bản PASS, ghi nhận `17` Socket events & exact binary ESC/POS kick bytes trên `127.0.0.1:9100` |
| **Live Production Exploratory QA (`ego-browser`)** | 16/16 routes Desktop `1366×768` + `/pos` & `/q/:token` Mobile `390×844` + `@media print` 80mm + Logout Invariant 9 | `PASS` | `overflowX: false` 100%, 0 ErrorBoundary, `@media print` `80mm` verified, `fnb-ui-preferences` bảo toàn sau logout |

---

## 2. Ma Trận Độ Phủ Mã Nguồn & Ngưỡng Khóa (Coverage Lock)

| Package | Ngưỡng khóa (Stmts / Branch / Funcs / Lines) | Mốc đạt được sau cùng (Post-All-Edits) | Config file |
|---|---:|---|---|
| `@fnb/shared` | `90 / 90 / 90 / 90` | `96.80% / 90.20% / 94.79% / 97.27%` (`10` files, `91` tests) | [vitest.config.ts](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/packages/shared/vitest.config.ts) |
| `@fnb/api-server` | `88 / 75 / 90 / 90` | `90.07% / 75.00% / 91.87% / 92.63%` (`53` files, `489` tests) | [vitest.config.ts](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/apps/api-server/vitest.config.ts) |
| `@fnb/web-app` | `80 / 72 / 75 / 81` | `80.25% / 72.09% / 75.49% / 82.01%` (`97` files, `488` tests) | [vite.config.ts](file:///Volumes/SAMSUNG_SSD/FnB/fnb-spicy-noodle-system/apps/web-app/vite.config.ts) |

*(Tổng cộng `160` test files, `1,068/1,068` tests PASS, `0` failures, `0` skips sau toàn bộ chỉnh sửa code & docs Chặng 1.)*

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
