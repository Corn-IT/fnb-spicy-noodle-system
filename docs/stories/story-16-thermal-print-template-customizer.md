# Story 16: Tuỳ chỉnh Toàn bộ 5 Mẫu Phiếu in Nhiệt 80mm (`thermal-print-customizer`)

> **Trạng thái:** Chờ duyệt · **Tiền đề:** Thực hiện sau [Story 15](file:///c:/Users/ngomi/OneDrive/Documents/POS%20FnB/docs/stories/story-15-dynamic-theme-colors-and-page-headers.md), kế thừa Story 14 D13 và quy chuẩn in nhiệt 80mm trong `.agents/rules/04-frontend-ux-table-and-print.md`.

---

## 1. Mục tiêu Nghiệp vụ

Hiện tại tab **Phiếu in** trên `/settings` mới chỉ cho sửa thông tin chung (`printName`, `address`, `phone`, `footerNote`, `showLogo`) và xem trước 1 mẫu (`OfficialReceiptSlip`), trong khi các tiêu đề và khối thông tin trên **5 mẫu phiếu in nhiệt 80mm** vẫn đang viết cứng (`PHIẾU TẠM TÍNH`, `HOÁ ĐƠN THANH TOÁN (PAID)`, `GIẢM GIÁ (0%)`, `PHIẾU BÁO HUỶ MÓN`, `⚠️ THÔNG BÁO ĐỔI BÀN ⚠️`, ...). Story 16 hoàn thiện:

1. **Quản lý cấu hình dùng chung + cấu hình riêng cho cả 5 mẫu phiếu in:**
   - **Phiếu tạm tính + VietQR (`provisional`)**
   - **Hoá đơn thanh toán chính thức (`official`)**
   - **Phiếu tách bếp 3 trạm (`kitchen`)**
   - **Phiếu báo huỷ món bếp (`kitchenCancel`)**
   - **Phiếu thông báo đổi bàn cho bếp (`tableTransfer`)**
2. **Xem trước trực tiếp 80mm (Live Preview)** cho từng mẫu trong 5 mẫu với dữ liệu mẫu sát thực tế (gồm cả VietQR SVG mẫu, 3 trạm bếp, báo huỷ, đổi bàn).
3. **Bật/tắt các khối thông tin phụ** trên mỗi mẫu trong khi **khoá cứng** (không cho phép tắt) các khối nghiệp vụ bắt buộc theo Hard Invariants 3 & 4.
4. **Cỡ chữ riêng (`Nhỏ` / `Vừa` / `Lớn`)** cho 2 phiếu dành cho khu vực bếp (`kitchen` và `kitchenCancel`).

**Ngoài phạm vi Story 16:** Đổi khổ giấy khác 80mm (giữ cố định `@page { size: 80mm auto }`, vùng in `72mm` theo rule 04 §7); đổi bố cục in hoặc thay đổi luồng hàng đợi `ThermalPrintProvider`; chỉnh danh mục toast/banner/dialog (thuộc **Story 17**).

---

## 2. Các Quyết định Đã Khoá (D22–D26)

- **D22 — Tách rõ Thông tin Quán dùng chung vs Cấu hình từng mẫu (`printTemplates`):**
  - Trường `receipt` cũ (`{ printName, address, phone, footerNote, showLogo }`) được giữ nguyên làm **thông tin dùng chung** để tương thích 100% với Story 14.
  - Bổ sung trường `printTemplates` với 5 nhánh độc lập (`provisional`, `official`, `kitchen`, `kitchenCancel`, `tableTransfer`).
  - Giá trị mặc định khi chủ quán chưa sửa (`title: ''`, `footerNote: ''`) sẽ render đúng nguyên văn chuỗi đang hiển thị ở Story 10/14 để **không gây sai khác** với ảnh chụp và snapshot hiện có.
  - Ở `provisional` và `official`: nếu `printTemplates.<type>.footerNote` để trống, fallback sang `receipt.footerNote`; nếu cả `receipt.footerNote` cũng trống, `provisional` ẩn dòng lời cảm ơn (giữ nguyên disclaimer pháp lý phía dưới như Story 10) còn `official` hiển thị `'CẢM ƠN QUÝ KHÁCH VÀ HẸN GẶP LẠI!'`.
  - Ở `provisional`, khối `GIẢM GIÁ (0%)` đang viết cứng chuyển thành cờ `blocks.discountLine` với mặc định `false` (ẩn mặc định do POS chưa hỗ trợ giảm giá, chủ quán có thể bật lại nếu muốn). Mọi block khác mặc định `true` để giữ nguyên bố cục hiện tại.

- **D23 — Các khối NGHIÊM CẤM tắt (Không có checkbox/toggle):**
  - **Tất cả phiếu:** Số bàn / Mã mang về, danh sách món + số lượng (hoặc chi tiết món huỷ), tổng tiền phải trả (trên phiếu tính tiền).
  - **Phiếu Tạm tính (`provisional`):** Khối mã QR VietQR (ảnh QR + nội dung chuyển khoản — **Hard Invariant 4**). Cờ `blocks.bankInfo` chỉ bật/tắt 2 dòng chữ `Tên ngân hàng — STK` và `Tên chủ tài khoản` phía trên ảnh QR, **không bao giờ** ẩn ảnh QR hoặc mã `Nội dung CK`.
  - **Phiếu Tách bếp (`kitchen`):** Tên trạm bếp thực (`BẾP NẤU (MÌ CAY)`, `BẾP CHIÊN`, `QUẦY NƯỚC UỐNG` — **NEVER** `COMBO`, **Hard Invariant 3**), tên món + SL + cấp độ cay/topping, banner `GỌI THÊM` / `GHI CHÚ ĐỔI BÀN` / `BẢN SAO - IN LẠI` khi phát sinh.
  - **Phiếu Báo huỷ (`kitchenCancel`):** Tên trạm bếp, bàn, tên món + SL báo huỷ.
  - **Phiếu Đổi bàn (`tableTransfer`):** Bàn cũ `>>> BÀN X <<<` → bàn mới `>>> BÀN Y <<<`, trạm bếp bị ảnh hưởng (`affectedStations`), mã đơn hàng (`orderCode`).

- **D24 — Ánh xạ chi tiết `blocks` trên từng mẫu thực tế:**
  - **`provisional`:**
    - `title` (mặc định `'PHIẾU TẠM TÍNH'`), `footerNote` (mặc định dùng `receipt.footerNote`).
    - `blocks`: `logo` (chỉ render `<img>` logo khi `activeSettings.receipt.showLogo && tpl.blocks.logo` — giữ nguyên tương thích ngược AC-14.11 khi `receipt.showLogo = false`, đồng thời cho phép bật/tắt riêng trên từng mẫu bill khách khi `receipt.showLogo = true`), `address`, `phone`, `orderCode`, `cashier`, `itemModifiers`, `itemNotes`, `discountLine` (default `false`), `bankInfo` (chỉ ẩn/hiện tên ngân hàng + STK + chủ TK phía trên VietQR image).
  - **`official`:**
    - `title` (mặc định `'HOÁ ĐƠN THANH TOÁN (PAID)'`), `footerNote` (mặc định fallback `receipt.footerNote` → `'CẢM ƠN QUÝ KHÁCH VÀ HẸN GẶP LẠI!'`).
    - `blocks`: `logo` (render khi `receipt.showLogo && blocks.logo`), `address`, `phone`, `orderCode`, `cashier`, `paymentBreakdown` (chi tiết Tiền mặt / Chuyển khoản QR bên dưới `TỔNG TIỀN THANH TOÁN`), `itemModifiers`, `itemNotes`.
  - **`kitchen`:**
    - `title` (tiêu đề phụ trên/dưới trạm bếp, mặc định `''` — chỉ render badge tiêu đề nếu chủ quán nhập để không làm thay đổi snapshot Story 10 mặc định), `footerNote` (mặc định `''` — nếu nhập mới render dưới cùng), `fontSize` (`'sm' | 'md' | 'lg'`, mặc định `'md'`).
    - `blocks`: `stationLogo` (`StationLogo` SVG), `orderCode` (`Mã Đơn: ...`), `time` (`Thời gian: ...`), `itemNotes` (ghi chú từng món và `orderNote`).
  - **`kitchenCancel`:**
    - `title` (mặc định `'PHIẾU BÁO HUỶ MÓN'`), `footerNote` (mặc định `'Vui lòng ngưng chế biến món vừa báo huỷ trên!'`), `fontSize` (`'sm' | 'md' | 'lg'`, mặc định `'md'`).
    - `blocks`: `time` (`Thời gian báo huỷ: ...`), `reason` (bật/tắt khung dòng nhắc nhở / lý do `footerNote` ở cuối phiếu).
  - **`tableTransfer`:**
    - `title` (mặc định `'⚠️ THÔNG BÁO ĐỔI BÀN ⚠️'`), `footerNote` (mặc định `'LƯU Ý: Các món đang chế biến của {fromTable} vui lòng bưng qua {toTable}!'` — hỗ trợ placeholder `{fromTable}`, `{toTable}` tự thay bằng tên bàn in hoa).
    - `blocks`: `time` (`Thời gian: ...`), `cashier` (nhân viên thao tác — bổ sung optional `cashierName?: string | null` vào `TableTransferNoticeSlipProps` và truyền từ `pos-unified-page.tsx`).

- **D25 — Quy mô Cỡ chữ Phiếu Bếp (`fontSize: 'sm' | 'md' | 'lg'`) & Khổ 80mm:**
  - `md` giữ nguyên kích thước class mặc định hiện tại (`text-xs` thân phiếu, `text-sm` tên món, `text-base` tiêu đề bàn/trạm).
  - `sm` co nhẹ dễ đọc gọn (`text-[11px]` thân, `text-xs` món, `text-sm` tiêu đề).
  - `lg` tăng độ nổi cho bếp ồn/xa (`text-sm` thân, `text-base` món, `text-lg` tiêu đề), kết hợp `break-words` đảm bảo toàn bộ nội dung gói gọn trong `72mm` vùng in (`80mm` có padding `@media print`), **không** xuất hiện thanh cuộn hay cắt chữ ngang.

- **D26 — Tương thích ngược Metadata:**
  - `mergeStoreSettingsWithDefaults()` ở Story 15 mở rộng thêm deep-merge cho `printTemplates` (từng nhánh và từng flag trong `blocks`) để metadata từ Story 14/15 thiếu `printTemplates` tự điền đầy đủ default an toàn.

---

## 3. Hợp đồng Dữ liệu (`packages/shared/src/schemas/store-settings.schema.ts`)

```ts
export const ThermalFontSizeSchema = z.enum(['sm', 'md', 'lg']);
export type ThermalFontSize = z.infer<typeof ThermalFontSizeSchema>;

export const PrintTemplateKeySchema = z.enum([
  'provisional',
  'official',
  'kitchen',
  'kitchenCancel',
  'tableTransfer',
]);
export type PrintTemplateKey = z.infer<typeof PrintTemplateKeySchema>;

export const PrintTemplatesSchema = z
  .object({
    provisional: z
      .object({
        title: PlainText(60),
        footerNote: PlainText(200),
        blocks: z
          .object({
            logo: z.boolean(),
            address: z.boolean(),
            phone: z.boolean(),
            orderCode: z.boolean(),
            cashier: z.boolean(),
            itemModifiers: z.boolean(),
            itemNotes: z.boolean(),
            discountLine: z.boolean(),
            bankInfo: z.boolean(),
          })
          .strict(),
      })
      .strict(),
    official: z
      .object({
        title: PlainText(60),
        footerNote: PlainText(200),
        blocks: z
          .object({
            logo: z.boolean(),
            address: z.boolean(),
            phone: z.boolean(),
            orderCode: z.boolean(),
            cashier: z.boolean(),
            paymentBreakdown: z.boolean(),
            itemModifiers: z.boolean(),
            itemNotes: z.boolean(),
          })
          .strict(),
      })
      .strict(),
    kitchen: z
      .object({
        title: PlainText(60),
        footerNote: PlainText(200),
        fontSize: ThermalFontSizeSchema,
        blocks: z
          .object({
            stationLogo: z.boolean(),
            orderCode: z.boolean(),
            time: z.boolean(),
            itemNotes: z.boolean(),
          })
          .strict(),
      })
      .strict(),
    kitchenCancel: z
      .object({
        title: PlainText(60),
        footerNote: PlainText(200),
        fontSize: ThermalFontSizeSchema,
        blocks: z
          .object({
            time: z.boolean(),
            reason: z.boolean(),
          })
          .strict(),
      })
      .strict(),
    tableTransfer: z
      .object({
        title: PlainText(60),
        footerNote: PlainText(200),
        blocks: z
          .object({
            time: z.boolean(),
            cashier: z.boolean(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();
```

**Hằng số mặc định xuất từ `@fnb/shared` (`PRINT_TEMPLATE_DEFAULTS`):**
- `provisional.title`: `'PHIẾU TẠM TÍNH'`
- `official.title`: `'HOÁ ĐƠN THANH TOÁN (PAID)'`
- `official.footerNoteFallback`: `'CẢM ƠN QUÝ KHÁCH VÀ HẸN GẶP LẠI!'`
- `kitchenCancel.title`: `'PHIẾU BÁO HUỶ MÓN'`
- `kitchenCancel.footerNote`: `'Vui lòng ngưng chế biến món vừa báo huỷ trên!'`
- `tableTransfer.title`: `'⚠️ THÔNG BÁO ĐỔI BÀN ⚠️'`
- `tableTransfer.footerNote`: `'LƯU Ý: Các món đang chế biến của {fromTable} vui lòng bưng qua {toTable}!'`

---

## 4. Thay đổi Backend (`apps/api-server/src/modules/store-settings/`)

- `StoreSettingsService`: `mergeStoreSettingsWithDefaults()` tự động nâng cấp cấu hình cũ thiếu `printTemplates`; `updateSettings()` validate toàn bộ `PrintTemplatesSchema`, kiểm tra tối ưu và lưu chung vào `SYSTEM_CONFIG / store_settings`, ghi Audit Log `SETTINGS`, phát Socket `store-settings:updated`.
- Không thay đổi route API, không migration DB.

---

## 5. Thay đổi Frontend (`apps/web-app/`)

### 5.1 Nâng cấp 5 Component Phiếu In (`apps/web-app/src/components/print-slips/`)
Mỗi component đọc `const activeSettings = storeSettings ?? contextSettings` qua `useStoreSettings()` và tuân thủ D22–D25:

1. **`provisional-vietqr-slip.tsx`:**
   - Thêm `storeSettings?: PublicStoreSettingsResponse` (đã có) đọc `activeSettings.printTemplates.provisional`.
   - Kiểm soát `title`, `footerNote` (fallback `receipt.footerNote`), các khối `logo`, `address`, `phone`, `orderCode`, `cashier`, `itemModifiers`, `itemNotes`, `discountLine`, `bankInfo`.
   - Ảnh VietQR và `Nội dung CK:` **luôn hiển thị**.
2. **`official-receipt-slip.tsx`:**
   - Đọc `activeSettings.printTemplates.official`.
   - Kiểm soát `title`, `footerNote` (fallback `receipt.footerNote` → `PRINT_TEMPLATE_DEFAULTS.official.footerNoteFallback`), các khối `logo`, `address`, `phone`, `orderCode`, `cashier`, `paymentBreakdown`, `itemModifiers`, `itemNotes`.
3. **`kitchen-split-slip.tsx`:**
   - Thêm prop `storeSettings?: PublicStoreSettingsResponse` (fallback `useStoreSettings()`).
   - Áp class cỡ chữ theo `fontSize` (`sm` / `md` / `lg`) giữ an toàn 72mm (`break-words`).
   - Kiểm soát `stationLogo`, `orderCode`, `time`, `itemNotes`, plus optional `title` / `footerNote` (ẩn mặc định khi trống). Tên trạm (`stationTitle`) và danh sách món + SL + banner Gọi thêm/Đổi bàn/Bản sao **luôn hiển thị**.
4. **`kitchen-cancel-item-slip.tsx`:**
   - Thêm prop `storeSettings?: PublicStoreSettingsResponse` (fallback `useStoreSettings()`).
   - Áp `fontSize` (`sm` / `md` / `lg`). Kiểm soát `title`, `time`, `reason` (`footerNote`). Trạm bếp, bàn, món + SL huỷ **luôn hiển thị**.
5. **`table-transfer-notice-slip.tsx` & `pos-unified-page.tsx`:**
   - Thêm prop `storeSettings?: PublicStoreSettingsResponse` và `cashierName?: string | null`.
   - Tại `pos-unified-page.tsx` nơi gọi `thermalPrinter.printTableTransferNotice(...)`, truyền thêm `cashierName: currentUser?.fullName || currentUser?.username || 'Thu ngân'`.
   - Kiểm soát `title`, `time`, `cashier`, `footerNote` (thay `{fromTable}` / `{toTable}`).

### 5.2 Tab `"Phiếu in"` & Xem trước 5 Mẫu (`apps/web-app/src/features/store-settings/`)
1. **`receipt-preview-panel.tsx`:**
   - Nhận thêm prop `templateKey: PrintTemplateKey`.
   - Dựa trên `templateKey`, render component tương ứng trong khung giả lập giấy nhiệt `80mm` (`max-w-[320px]`):
     - `provisional`: dùng `ProvisionalVietQrSlip` kèm ảnh SVG VietQR offline (`buildVietQrFallbackSvgDataUrl` hoặc `vietQrPayload` data URL để xem trước **không phụ thuộc mạng ngoài**).
     - `official`: dùng `OfficialReceiptSlip` với thanh toán `SPLIT` mẫu (thấy rõ cả tiền mặt + QR khi toggle `paymentBreakdown`).
     - `kitchen`: dùng `KitchenSplitSlip` với 2 phiếu trạm mẫu (`BEP_NAU` + `PHA_CHE`), có modifier cay, topping và ghi chú để thấy rõ tác dụng từng công tắc.
     - `kitchenCancel`: dùng `KitchenCancelItemSlip` mẫu.
     - `tableTransfer`: dùng `TableTransferNoticeSlip` với `fromLabel="Bàn 03"`, `toLabel="Bàn 08"`, `cashierName="Nguyễn Văn A"`.
2. **`store-settings-page.tsx` (Tab `"Phiếu in"`):**
   - **Khối trên:** Thông tin dùng chung (`printName`, `address`, `phone`, `footerNote`, `showLogo`).
   - **Khối dưới:** Bộ chọn 5 mẫu dạng segmented control (`provisional` · `official` · `kitchen` · `kitchenCancel` · `tableTransfer`, cuộn ngang mượt trên mobile).
   - Cột trái: form tuỳ chỉnh mẫu đang chọn (`title`, `footerNote`, chọn cỡ chữ `sm/md/lg` đối với `kitchen` / `kitchenCancel`, danh sách checkbox từng khối kèm ghi chú rõ các khối bắt buộc đã được khoá an toàn). Có nút `"Khôi phục mẫu này về mặc định"`.
   - Cột phải: `<ReceiptPreviewPanel storeSettings={livePreviewSettings} templateKey={selectedTemplate} />`.

---

## 6. Tiêu chí Nghiệm thu

- **AC-16.1:** Cả 5 mẫu phiếu trên tab `"Phiếu in"` đều chọn được, hiển thị xem trước trực tiếp 80mm đúng nội dung và phản ứng tức thì theo mọi thay đổi trong form.
- **AC-16.2:** Tắt `blocks.cashier` ở `official` và lưu → khi thanh toán thực tế ở `/pos` hoặc in lại hoá đơn ở `/invoices`, phần thu ngân không xuất hiện trên bản in `#thermal-print-container`.
- **AC-16.3:** Khi `receipt.showLogo = false`, cả phiếu Tạm tính lẫn Hoá đơn đều không render thẻ `<img>` logo (giữ đúng AC-14.11); khi `receipt.showLogo = true` nhưng tắt `provisional.blocks.logo`, chỉ Hoá đơn còn logo.
- **AC-16.4:** Không tồn tại bất kỳ checkbox/công tắc nào cho ảnh VietQR, tên bàn, món + SL, tổng tiền, trạm bếp `BEP_NAU`/`BEP_CHIEN`/`PHA_CHE` (Invariant 3 & 4).
- **AC-16.5:** Mặc định `provisional.blocks.discountLine = false` (không còn dòng `GIẢM GIÁ (0%)` thừa trừ khi chủ quán chủ động bật).
- **AC-16.6:** Đổi `kitchen.fontSize = 'lg'` và `kitchenCancel.fontSize = 'lg'` → chữ lớn hơn rõ rệt trong DOM & preview mà vẫn gói gọn trong khung `320px` / `80mm`, không tràn ngang.
- **AC-16.7:** Sửa `tableTransfer.footerNote = 'Đưa từ {fromTable} qua {toTable} gấp!'` → bản in thực tế của `TableTransferNoticeSlip` thay đúng `{fromTable}` và `{toTable}` bằng tên bàn in hoa.
- **AC-16.8:** Toàn bộ test hiện có của `thermal-print.test.tsx` (Story 10) tiếp tục pass ở cấu hình mặc định, cộng thêm unit test mới kiểm chứng cấu hình từng mẫu trong 5 mẫu và test backward-compat `printTemplates`.
- **AC-16.9:** `pnpm -r typecheck`, `pnpm -r test`, `pnpm -r lint`, `pnpm -r build` pass 100% và kiểm thử trình duyệt thực tế ở Desktop / Tablet / Mobile (cuộn ngang segmented control 5 mẫu mượt mà, preview không vỡ khung).

---

## 7. Kế hoạch Thực hiện (TDD)

1. **`@fnb/shared`:** Định nghĩa `ThermalFontSizeSchema`, `PrintTemplateKeySchema`, `PrintTemplatesSchema`, `PRINT_TEMPLATE_DEFAULTS`, mở rộng `StoreSettingsSchema`, `DEFAULT_STORE_SETTINGS`, `mergeStoreSettingsWithDefaults` + unit test → `pnpm --filter @fnb/shared test`.
2. **Backend (`api-server`):** Cập nhật test `store-settings.service.spec.ts` cho `printTemplates` & upgrade từ v1/v1.5 → `pnpm --filter api-server test`.
3. **5 Print Slips (`web-app`):** Cập nhật 5 component phiếu in + `pos-unified-page.tsx` truyền `cashierName` cho phiếu đổi bàn + viết/cập nhật `thermal-print.test.tsx`.
4. **UI Tab `"Phiếu in"` (`web-app`):** Nâng cấp `receipt-preview-panel.tsx` (5 chế độ preview) + `store-settings-page.tsx` (thông tin chung + segmented selector 5 mẫu + form riêng) + test trong `store-settings.test.tsx`.
5. **Kiểm chứng tổng thể:** `pnpm -r typecheck && pnpm -r test && pnpm -r lint && pnpm -r build` + kiểm thử trình duyệt thực tế & in nhiệt (automation print check + 3 viewport).
