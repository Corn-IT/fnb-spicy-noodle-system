# Story 08: Khởi tạo `apps/web-app`, Core Layout (Resizable Sidebar, Navbar `Ctrl+K`, Profile) & Component `BaseTable` 60fps

> **Story ID:** `STORY-08`  
> **Tên file:** `docs/stories/story-08-frontend-shell-basetable-and-navbar.md`  
> **Phase thực thi:** Phase 5 (Frontend Shell, Core UI & Module 9)  
> **Agent phụ trách:** Antigravity  
> **Phụ thuộc (Dependencies):** `story-01`, `story-03`, `story-07`  
> **Quy tắc bất biến áp dụng:** Hard Invariant 1 (Cô lập Module `src/features/*`), Hard Invariant 8 (RBAC Route Guard & Lọc `Ctrl+K` theo quyền), Hard Invariant 9 (Giữ nguyên `ui_preferences` khi Đăng xuất, xoá sạch `queryClient.clear()`)  
> **Tài liệu tham chiếu:** `.agents/rules/00-architecture-and-monorepo.md` (§2), `.agents/rules/04-frontend-ux-table-and-print.md` (§1, §2, §3), `docs/bmad/01-PRD-Master.md` (§3.10), `docs/bmad/03-Edge-Cases-And-Invariants.md` (`EC-UI-01`, `EC-UI-02`)

---

## 1. MỤC TIÊU (OBJECTIVES)

Khởi tạo hoàn chỉnh ứng dụng Frontend `@fnb/web-app` (`apps/web-app/`) theo kiến trúc `alan2207/bulletproof-react` (React 18 + Vite 5 + TanStack Query v5 + TanStack Table v8 + Zustand + TailwindCSS + Shadcn/UI) và xây dựng toàn bộ khung giao diện nền tảng dùng chung (Core Shell & Module 9):
1. **Hệ thống Xác thực, API Client & Zustand `ui_preferences` Store:** Tự động đính kèm Bearer AccessToken, tự động refresh token khi gặp mã `401`, hiển thị cảnh báo khi gặp mã `403` (tuyệt đối không đá văng user ra màn hình login khi nhận `403` — Hard Invariant 8), và thực thi đúng quy trình Đăng xuất bảo toàn `ui_preferences` (Hard Invariant 9 & `EC-UI-01`).
2. **Khung Giao diện Chính (App Shell):** Sidebar bên trái cho phép nắm kéo chuột thay đổi độ rộng mượt mà (`200px` – `360px` hoặc thu gọn Icon-only), chỉ hiển thị các menu mà user có quyền `view = true`. Thanh Navbar góc phải bố trí đúng thứ tự: `[Search / Command Palette Ctrl+K lọc theo RBAC]` → `[Nút chuyển Theme Sáng/Tối]` → `[Avatar + Tên người dùng Dropdown]`.
3. **Component `BaseTable` Dùng chung (`TanStack Table v8`):** Hỗ trợ kéo giãn độ rộng mọi cột đạt **60 FPS** bằng CSS Variables + `requestAnimationFrame` (không re-render React state trên từng pixel), tự động `debounce(500ms)` lưu độ rộng cột vào `localStorage` (`'fnb-ui-preferences'`) và đồng bộ ngầm lên `PATCH /api/v1/profile/ui-prefs`.
4. **Trang Đăng nhập (`/login`) & Trang Hồ sơ Tài khoản (`/profile` — Module 9):** Hiển thị dữ liệu JOIN `employees` + `users`, badge `Chức vụ` và `Chuyên môn` ở trạng thái `readonly`, cho phép sửa thông tin cá nhân/ngân hàng/avatar và đồng bộ về bảng `employees`.

---

## 2. DANH SÁCH FILE CHECKLIST (FILE MANIFEST & CHECKLIST)

### 2.1. Cấu hình & Providers (`apps/web-app/src/`)
- [x] `apps/web-app/vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `src/index.css` (chứa biến màu Light/Dark theme và `@media print` chuẩn 80mm).
- [x] `apps/web-app/src/config/env.ts` — Validate `import.meta.env.VITE_API_BASE_URL` và `VITE_SOCKET_URL`.
- [x] `apps/web-app/src/lib/api-client.ts` — Fetch/Axios wrapper tích hợp interceptor xử lý `401` (gọi `/api/v1/auth/refresh`) vs `403` (hiển thị toast lỗi thiếu quyền, giữ nguyên phiên đăng nhập).
- [x] `apps/web-app/src/lib/socket-client.ts` — Quản lý kết nối Socket.io tới namespace `/pos` hỗ trợ cả chế độ Staff (`auth.token`) và chế độ QR Guest (`auth.qrToken`, `auth.orderId`).
- [x] `apps/web-app/src/stores/auth.store.ts` — Quản lý `accessToken` và thông tin `user` hiện tại.
- [x] `apps/web-app/src/stores/ui-preferences.store.ts` — Zustand store persist vào `localStorage` với key `'fnb-ui-preferences'` (`theme: 'light' | 'dark'`, `sidebarWidth: number`, `sidebarCollapsed: boolean`, `columnWidths: Record<string, Record<string, number>>`).
- [x] `apps/web-app/src/providers/app-provider.tsx`, `query-provider.tsx`, `socket-provider.tsx`, `theme-provider.tsx`.

### 2.2. Shadcn/UI & Shared Components (`apps/web-app/src/components/`)
- [x] `apps/web-app/src/components/ui/` — Các primitive chuẩn từ Shadcn/UI: `button.tsx`, `input.tsx`, `dialog.tsx`, `sheet.tsx` (Drawer mở từ bên phải), `command.tsx` (Command Palette `Ctrl+K`), `dropdown-menu.tsx`, `popover.tsx`, `select.tsx`, `badge.tsx`, `checkbox.tsx`, `tabs.tsx`, `toast.tsx`.
- [x] `apps/web-app/src/components/base-table/base-table.tsx` — Component bảng dữ liệu chuẩn toàn hệ thống xây dựng trên `@tanstack/react-table` v8 (`columnResizeMode: 'onChange'`, CSS Variables sizing, server-side pagination, footer summary row, loading skeleton, empty state).
- [x] `apps/web-app/src/components/base-table/use-column-resize-sync.ts` — Hook debounce 500ms lưu `columnWidths` vào `uiPreferencesStore` và gọi `PATCH /api/v1/profile/ui-prefs`.
- [x] `apps/web-app/src/components/layout/app-shell.tsx` — Layout tổng gồm `ResizableSidebar` + `TopNavbar` + `<Outlet />`.
- [x] `apps/web-app/src/components/layout/resizable-sidebar.tsx` — Sidebar bên trái kéo giãn chuột (`onMouseDown` + `requestAnimationFrame`), ẩn các mục không có quyền `permissions[module]?.view`.
- [x] `apps/web-app/src/components/layout/top-navbar.tsx` — Góc phải đúng thứ tự: `[Search Button (Ctrl+K)]` → `[Theme Toggle]` → `[User Avatar + Name Dropdown (Hồ sơ tài khoản, Đăng xuất)]`.
- [x] `apps/web-app/src/components/layout/command-palette.tsx` — Popup tìm kiếm nhanh màn hình (`Ctrl+K` / `Cmd+K`), **BẮT BUỘC** lọc danh sách theo RBAC (`EC-UI-02`).
- [x] `apps/web-app/src/components/layout/rbac-route-guard.tsx` — Chặn truy cập trực tiếp qua URL nếu thiếu quyền, hiển thị màn hình `403 Không đủ quyền truy cập`.

### 2.3. Feature Profile & Auth (`apps/web-app/src/features/profile/`)
- [x] `apps/web-app/src/features/profile/api/auth.api.ts` & `profile.api.ts`
- [x] `apps/web-app/src/features/profile/components/login-page.tsx` — Màn hình đăng nhập quầy POS/Admin.
- [x] `apps/web-app/src/features/profile/components/profile-page.tsx` — Trang Hồ sơ tài khoản (Badge `Chức vụ` & `Chuyên môn` readonly; form sửa SĐT, Địa chỉ, Ngân hàng, Avatar Crop & Resize).
- [x] `apps/web-app/src/features/profile/index.ts` — Sole public barrel export (Hard Invariant 1).
- [x] `apps/web-app/src/router.tsx` & `apps/web-app/src/App.tsx` — Cấu hình React Router v6 lazy routes.
- [x] `apps/web-app/src/components/__tests__/shell-and-basetable.test.tsx` — Vitest + React Testing Library tests cho Logout Invariant 9, Command Palette RBAC filtering (`EC-UI-02`), và BaseTable column resize persistence.

---

## 3. CHI TIẾT KỸ THUẬT & NGHIỆP VỤ (TECHNICAL SPECIFICATIONS)

### 3.1. Hành vi Đăng xuất Bất biến (Hard Invariant 9 & `EC-UI-01`)
Khi người dùng bấm **"Đăng xuất"** từ Avatar Dropdown trên Navbar, hàm `handleLogout()` **MUST** thực thi đúng thứ tự:
```typescript
export async function executeCleanLogout(queryClient: QueryClient) {
  // 1. Xoá toàn bộ cache dữ liệu nghiệp vụ API trong bộ nhớ (chống rò rỉ dữ liệu ca trước)
  queryClient.clear();
  // 2. Xoá token và thông tin định danh khỏi authStore
  useAuthStore.getState().clearAuth();
  // 3. Gọi API xoá refreshToken cookie
  await apiClient.post('/api/v1/auth/logout').catch(() => {});
  // 4. HARD INVARIANT 9: TUYỆT ĐỐI KHÔNG xoá key 'fnb-ui-preferences' trong localStorage
  // và KHÔNG reset useUiPreferencesStore (theme, sidebarWidth, columnWidths phải giữ nguyên!)
}
```

### 3.2. Kéo giãn Cột `BaseTable` 60 FPS (`.agents/rules/04` §3)
- Tính toán kích thước cột thành các biến CSS `--header-${header.id}-size` và `--col-${cell.column.id}-size` gắn trực tiếp lên phần tử `<table>` thông qua `useMemo` / `requestAnimationFrame`.
- Trong lúc người dùng đang kéo chuột (`table.getState().columnSizingInfo.isResizingColumn`), các ô `<td>` đọc độ rộng từ biến CSS mà không kích hoạt re-render toàn bộ cây component dữ liệu.
- Ngay khi thả chuột, hook `useColumnResizeSync` đợi `500ms` (debounce), cập nhật `uiPreferencesStore.setTableColumnWidths(tableId, columnSizing)` (tự lưu xuống `localStorage`) và gửi `PATCH /api/v1/profile/ui-prefs`.

---

## 4. TIÊU CHÍ NGHIỆM THU (ACCEPTANCE CRITERIA)

- [x] **AC-08.1 (Logout Preserves UI Preferences — Invariant 9 & `EC-UI-01`):** Thay đổi theme sang Dark, kéo rộng Sidebar lên `280px`, kéo rộng cột bảng `invoices` lên `220px`, sau đó bấm **Đăng xuất** → `queryClient` cache trống rỗng, token bị xoá, nhưng `localStorage.getItem('fnb-ui-preferences')` vẫn giữ nguyên `theme: 'dark'`, `sidebarWidth: 280`, và `columnWidths`.
- [x] **AC-08.2 (Command Palette RBAC Filtering — `EC-UI-02`):** Đăng nhập bằng tài khoản `cashier01` (không có quyền `rbac:view` và `employees:view`), nhấn `Ctrl + K` gõ `"Phân quyền"` hoặc `"Nhân viên"` → hoàn toàn không hiển thị các màn hình bị cấm.
- [x] **AC-08.3 (Navbar Right-Corner Order):** Góc phải Navbar hiển thị đúng thứ tự từ trái sang phải: `[Search Ctrl+K]` → `[Theme Toggle]` → `[Avatar + Tên người dùng Dropdown]`.
- [x] **AC-08.4 (Profile Page Readonly Badges & 1-1 Sync):** Trang Hồ sơ cá nhân hiển thị `Chức vụ` và `Chuyên môn` dạng Badge readonly; sửa Số điện thoại, Địa chỉ, Tài khoản ngân hàng lưu thành công và cập nhật vào bảng `employees`.
- [x] **AC-08.5 (Feature Isolation Invariant 1):** Kiểm tra toàn bộ imports trong `apps/web-app/src/` tuân thủ `@/features/<feature>` qua barrel `index.ts`, `pnpm -r typecheck` và `pnpm -r test` pass 100%.
