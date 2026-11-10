```
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('cashflow', 'update_default_budget') // Tự động trả về 403 nếu thiếu quyền
@Put('default-budget')
async updateDefaultBudget(@Body() dto: UpdateBudgetDto) { ... }
```

- 3. Tự động hoá chuẩn hoá Master Data (Module 3, 5, 7):

- Viết một MdmService.findOrCreate(category, rawInput) dùng chung cho toàn bộ hệ thống. Bất cứ khi nào nhân viên gõ tên nguyên liệu mới ở Module 3 hay chức vụ mới ở Module 5, hàm này tự động cắt khoảng trắng, bỏ dấu tiếng Việt để so sánh chống trùng lặp trước khi lưu.

## 3.4. Tối ưu Khả năng Mở rộng Tương lai (Scalability & Plug-and-Play)

Thiết kế trên cho phép bạn nâng cấp thêm 3 tính năng cao cấp bất cứ lúc nào mà không cần sửa lại cấu trúc Database hay viết lại Backend:

- Mở rộng 1 — Tự động xác nhận khi khách quét VietQR chuyển khoản (Auto Payment Webhook):

- Thực tế: Khi quán đông, thu ngân rất mất thời gian cầm điện thoại kiểm tra xem khách Bàn 7 đã chuyển khoản thành công hay chưa, hoặc bị kẻ gian dùng ảnh chụp màn hình chuyển khoản giả.

- Cách cắm thêm: Đăng ký cổng nhận biến động số dư qua Webhook (như SePay hoặc Casso). Vì trong nội dung mã VietQR động bạn đã nhúng sẵn mã đơn (TT HD202611070039), ngay khi ngân hàng nhận được tiền, Webhook gọi thẳng vào API /api/v1/webhooks/bank-transfer của bạn. Hệ thống tự động đối chiếu số tiền, tự chuyển hoá đơn sang trạng thái PAID (Phương thức: TRANSFER), và phát loa thông báo ngay trên máy tính thu ngân: "Bàn số 7 đã chuyển khoản thành công 185.000 đồng".

- Mở rộng 2 — Nâng cấp lên Màn hình hiển thị bếp (KDS - Kitchen Display System):

- Vì dữ liệu đơn hàng đã được chia sẵn theo 3 khu vực (BEP_NAU, BEP_CHIEN, PHA_CHE) và đã có sẵn Socket.io, bất cứ khi nào bạn muốn bỏ giấy in ở bếp, chỉ cần làm thêm 1 màn hình giao diện /kds/:station mở trên máy tính bảng hoặc tivi treo ở bếp. Khi thu ngân bấm Tách đơn, món ăn hiện thẳng lên màn hình của đúng bếp đó kèm đồng hồ đếm thời gian chế biến.

- Mở rộng 3 — Mở thêm Chi nhánh thứ 2, thứ 3 (Multi-Branch Ready):

- Khi thiết kế các bảng chính (orders, dining_tables, inventory_imports, cash_drawer_settlements, work_schedules), chỉ cần đặt sẵn cột branch_id INT DEFAULT 1. Khi bạn mở quán mì cay thứ 2, toàn bộ hệ thống sẵn sàng quản lý đa chi nhánh ngay lập tức trên cùng một trang quản trị của Admin.

Sơ đồ tương tác dưới đây giúp bạn khám phá trực quan Kiến trúc 4 tầng từ Thiết bị tại quán đến Hạ tầng Cloud/Docker, cho phép bấm vào từng thành phần để xem chi tiết công nghệ sử dụng, độ trễ xử lý, chi phí vận hành và điểm chờ mở rộng:

## 4. Cấu trúc Thư mục Dự án Chuẩn (Monorepo Blueprint)

Để bắt tay vào dựng khung dự án ngay lập tức theo kiến trúc trên, bạn có thể tổ chức cây thư mục theo chuẩn Turborepo gọn gàng như sau:

```
fnb-spicy-noodle-system/
├── apps/
│ ├── web-app/ # React + Vite + TypeScript + Tailwind + Shadcn
│ │ ├── src/
│ │ │ ├── features/
│ │ │ │ ├── qr-order/ # Giao diện khách quét QR tại bàn (Mobile-first)
│ │ │ │ ├── pos-counter/ # Màn hình POS hợp nhất (Tách 3 bếp, Đổi/Gộp bàn, VietQR)
│ │ │ │ ├── invoices/ # Module 2: Lịch sử & tra cứu hoá đơn
│ │ │ │ ├── inventory/ # Module 3: Nhập hàng + Drawer tự lưu MDM
│ │ │ │ ├── cashflow/ # Module 4: Ngân sách, đếm tiền & Kết ca
│ │ │ │ ├── employees/ # Module 5: Quản lý nhân sự
│ │ │ │ ├── schedules/ # Module 6: Bảng lịch làm việc Excel + Unsaved Guard
│ │ │ │ ├── master-data/ # Module 7: Quản trị danh mục MDM
│ │ │ │ └── rbac/ # Module 8: Phân quyền Checkbox + CRUD Drawer
│ │ │ ├── components/
│ │ │ │ ├── base-table/ # Base Table dùng chung (TanStack Table + Column Resize)
│ │ │ │ ├── print-slips/ # Mẫu in nhiệt 80mm (3 phiếu bếp có Logo + Bill QR)
│ │ │ │ └── layout/ # Module 9: Resizable Sidebar + Navbar + Command Search
│ │ │ └── stores/ # Zustand (lưu ui_prefs) + TanStack Query Client
│ │
│ └── api-server/ # NestJS + Prisma + Socket.io (Modular Monolith)
│ ├── prisma/
│ │ ├── schema.prisma # Toàn bộ ERD đã chuẩn hoá
│ │ └── seed.ts # Dữ liệu mồi (Menu mì cay, Bàn, MDM, Super Admin)
│ └── src/
│ ├── common/ # RbacGuard (401/403), NormalizedStringUtil
│ ├── modules/
│ │ ├── pos/ # Xử lý Order, Delta Split 3 bếp, Move/Merge/Swap bàn
│ │ ├── cashflow/ # Thuật toán đối soát Kết ca (Tiền mặt vs QR vs Chi két)
│ │ ├── inventory/ # Nhập hàng liên kết tự động với MdmService
│ │ ├── hr-schedule/ # Nhân viên (tự sinh V.Anh) & Lịch làm việc theo tuần
│ │ ├── mdm/ # Master Data Lookup & CRUD
│ │ └── iam/ # Auth, Users, RBAC Permissions & UI Preferences
│ └── gateways/ # PosSocketGateway (Đẩy đơn QR & Redirect phiên đổi bàn)
│
```


\# Chứa Zod Schemas, Enums (Station, OrderStatus), Types dùng chung # Cấu hình chạy Production (Caddy + API + PostgreSQL + Backup)

User prompt: Mình dự định sẽ dùng các agent để hỗ trợ xây dựng dự án như Codex và Google Antigravity. Với các kiến trúc và công nghệ đó thì mình nên chọn Repo nào từ Github để hỗ trợ? Bao gồm Github Repo trong TOP 100 và ngoài TOP 100. Chủ yếu là để hỗ trợ tối đa và tối ưu từng phần, từ phân tích lại dữ liệu, thiết kế rồi làm chuẩn BMAD sau đó vào kiểm lại các sơ đồ kiến trúc toàn dự án xong mới vào làm BE FE Server v.v.. Mình cần các skills để có thể hỗ trợ từng phần từng phase. Và sau khi đã có skills lẫn thông tin tài liệu giải pháp cả BMAD kèm các sơ đồ thì mình sẽ cần agent lập rules dựa vào những dữ liệu có sẵn đó rồi mới bắt tay vào xây dựng.

Response: Để vận hành bộ đôi Google Antigravity (mạnh về điều phối đa file trên toàn Workspace, kết nối MCP Server, giao diện trực quan và hệ thống .antigravity/rules + skills) kết hợp cùng Codex (mạnh về suy luận thuật toán sâu, kiểm định chặt chẽ State Machine/SQL Transaction và chạy kiểm thử tự hành qua AGENTS.md), bạn không nên nạp cho Agent các đoạn prompt rời rạc. Thay vào đó, hãy trang bị cho chúng một Hệ sinh thái GitHub Repositories (Trong TOP 100 + Ngoài TOP 100) kết hợp với Quy trình 5 Phase chuẩn BMAD để Agent tự thẩm định thiết kế, tự sinh bộ Rules ràng buộc cứng, rồi mới viết code.

## PHẦN 1: PHÂN VAI CHIẾN LƯỢC GIỮA GOOGLE ANTIGRAVITY VÀ CODEX

Trước khi nạp Repo và Skills, bạn cần phân tách rõ nhiệm vụ cho 2 Agent để chúng bổ trợ lẫn nhau mà không giẫm chân lên nhau:

- Google Antigravity (Kiến trúc sư Trưởng & Chuyên gia Full-stack/UI):

- Đóng vai trò Orchestrator chạy luồng BMAD, đọc hiểu toàn bộ tài liệu giải pháp, phân mảnh công việc (Story Sharding) và tự động biên dịch ra thư mục .antigravity/rules/ cùng AGENTS.md.

- Chịu trách nhiệm chính khi dựng khung Monorepo (Turborepo), xây dựng giao diện phức tạp (Màn hình POS Hợp nhất, Base Table kéo giãn cột bằng TanStack Table, Lịch làm việc dạng Excel, Drawer tự lưu MDM) và kết nối WebSocket thời gian thực.

- Codex (Chuyên gia Kiểm định Logic, Database Transaction & Bảo mật RBAC):

- Chịu trách nhiệm Audit (Kiểm toán) Sơ đồ Kiến trúc: Đối chiếu chéo giữa ERD, State Machine, Sequence Diagram và API Spec để tìm các điểm mâu thuẫn trước khi code.

- Viết và viết test (TDD) cho các cụm thuật toán nhạy cảm nhất ở Backend: Giao dịch có khoá dòng (SELECT ... FOR UPDATE) khi Chuyển/Gộp bàn, thuật toán Delta Split tách 3 phiếu bếp, công thức Kết ca đối soát dòng tiền và Middleware phân quyền RBAC (401 vs 403).

## PHẦN 2: DANH MỤC GITHUB REPOSITORIES TINH TUYỂN (TOP 100 & NGOÀI TOP 100)

Để Agent không viết ra những đoạn code tự phát thiếu đồng nhất, bạn cần sử dụng các GitHub Repo dưới đây làm Mẫu tham chiếu kiến trúc (Reference Architectures) và Kho kỹ năng (Skills Repositories).

## 2.1. Nhóm Repo TRONG TOP 100 GitHub (Chuẩn mực Kiến trúc, UI & Bảo mật)

Đây là các kho mã nguồn quy mô lớn giúp định hình khung xương vững chắc cho React + Vite + NestJS + PostgreSQL:

| Tên Repository (Top 100) | Vai trò trong dự án | Cách dùng với Antigravity & Codex |
| --- | --- | --- |
|   | POS Mì cay |   |
|   | Kiến trúc chuẩn cho | Trích xuất cấu trúc thư mục src/features/* vào Rules của Agent. Bắt |
| alan2207/bulletproof-react | Frontend (apps/web- | buộc Agent cô lập hoàn toàn 9 module (pos-counter, qr-order, invoices, |
|   | app) | inventory, cashflow, employees, schedules, master-data, rbac), cấm |
|   |   | import chéo giữa các feature |
|   | Nền tảng | Dùng làm chuẩn UI cho Drawer mở từ bên phải (Module 3 & 8), Pop-up xác |
| shadcn-ui/ui | Component cho | nhận 2 bước khi Thanh toán/Xoá, và thanh tìm kiếm Category góc phải |
|   | Base Table, Drawer | Navbar (cmdk — Ctrl + K) |
|   | & Command |   |
|   | Quy chuẩn Backend | Trích xuất các quy tắc xử lý lỗi tập trung, phân tách Controller |
| goldbergyoni/nodebestpractices | Node.js / NestJS | Service Repository, bảo mật JWT và quản lý biến môi trường đưa |
|   | Production | vào file backend-rules.md |
| TanStack/table & | Động cơ xử lý Base | Lấy mẫu chuẩn tính năng columnSizing (kéo giãn cột lưu vào |
| TanStack/query | Table Resize & Xoá | localStorage/ui_preferences) và cơ chế queryClient.clear() để xoá |
|   | Cache Đăng xuất | sạch bộ nhớ đệm dữ liệu khi bấm Đăng xuất (Module 9) |
|   | Khung Modular | Dùng làm chuẩn thiết kế Custom Decorator (@RequirePermission) cho |
| nestjs/nest & prisma/prisma | Monolith & Database | Module 8 và Interactive Transaction (prisma.$transaction) cho luồng Gộp |
|   | Transaction | bàn và Kết ca |

## 2.2. Nhóm Repo NGOÀI TOP 100 (Vũ khí Chuyên biệt cho BMAD, Agent Skills & POS FnB)

Đây mới là những repo quyết định 80% trí thông minh và tính kỷ luật của Agent trong suốt quá trình từ phân tích thiết kế đến khi hoàn thiện sản phẩm:

## A. Nhóm Điều phối Quy trình & Chuẩn hoá Đặc tả (Phase 1 & Phase 2)


## 1. bmadcode/BMAD-METHOD (Breakthrough Method for Agile AI-Driven Development)

- Tác dụng: Cung cấp bộ khung làm việc theo vai trò chuyên biệt (Analyst PM Architect SM Dev QA).

- Ứng dụng vào dự án: Thay vì đưa cả tài liệu giải pháp dài hàng nghìn dòng cho Agent code một lần (rất dễ làm Agent "quên" các ràng buộc nhỏ như viết tắt tên V.Anh hay mã lỗi 403), quy trình Story Sharding (Phân mảnh Epic) của BMAD sẽ bóc tách 9 Module thành các gói đặc tả nhỏ độc lập (Epic-01-POS-Split.md, Epic-04-Cashflow-Settle.md), mỗi file chứa sẵn đầy đủ ngữ cảnh để Agent code chuẩn 100% ngay từ lần đầu.

- 2. github/spec-kit (Specification-Driven Development Toolkit)

- Tác dụng: Chuẩn hoá tài liệu nghiệp vụ và sơ đồ thành cấu trúc đặc tả có tính ràng buộc chặt chẽ (spec.md, plan.md, tasks.md).

- Ứng dụng vào dự án: Giúp Agent biến các quy tắc nghiệp vụ (như công thức Kết ca tách biệt Tiền mặt và Chuyển khoản QR) thành các điều kiện kiểm chứng tự động (Invariants).

## B. Nhóm Agent Skills & MCP Server (Tăng lực trực tiếp cho Antigravity & Codex)

- 3. obra/superpowers (Core Agentic Engineering Skills)

- Tác dụng: Bộ kỹ năng ép Agent tuân thủ kỷ luật kỹ thuật phần mềm nghiêm ngặt.

- Các Skill quan trọng nhất cần nạp vào dự án:

- brainstorming & writing-plans: Bắt buộc Agent lập kế hoạch từng bước và đối chiếu với sơ đồ ERD/State Machine trước khi chạm vào file code.

- test-driven-development: Bắt buộc Codex viết Unit/Integration Test cho công thức Kết ca, thuật toán tách đơn 3 bếp (NEW PRINTED) và hàm chÑng trùng tên vi¿t t¯t (V.Anh N.V.Anh) tr°Ûc khi vi¿t hàm xí lý.

- systematic-debugging & verification-before-completion: Bắt Agent tự chạy kiểm tra kiểu dữ liệu (tsc --noEmit) và test case trước khi báo cáo hoàn thành.

- 4. upstash/context7 (MCP Server cung cấp Tài liệu Sống cho Agent)

- Tác dụng: Cắm trực tiếp vào Google Antigravity và Codex qua giao thức MCP.

- Ứng dụng vào dự án: Khi Agent viết code Prisma Schema, TanStack Table v8 hay Socket.io v4, Context7 bơm thẳng tài liệu chính thức mới nhất vào ngữ cảnh, triệt tiêu hoàn toàn hiện tượng Agent bịa ra các hàm API cũ đã bị loại bỏ.

- 5. nextlevelbuilder/ui-ux-pro-max-skill (Chuyên gia Thiết kế UI/UX & Bố cục POS/ERP)

- Tác dụng: Cung cấp bộ quy tắc thẩm mỹ, hệ thống lưới (Grid), bảng màu Sáng/Tối (Light/Dark Mode) và bố cục thao tác tốc độ cao.

- Ứng dụng vào dự án: Giúp Antigravity thiết kế Màn hình POS Hợp nhất (Split-View) có các nút bấm lớn, độ tương phản cao cho thu ngân thao tác nhanh; dựng bảng Lịch làm việc kiểu Excel (Module 6) với các nhãn màu (Tags) phân biệt Bếp nấu / Bếp chiên / Pha chế đẹp mắt mà không bị vỡ giao diện khi kéo giãn Sidebar.

## 6. mattpocock/skills (Chuẩn hoá TypeScript & Monorepo Architecture)

- Tác dụng: Bộ kỹ năng thiết kế kiểu dữ liệu TypeScript nâng cao và chia sẻ Zod Schema giữa Frontend và Backend.

- Ứng dụng vào dự án: Đảm bảo gói packages/shared trong Turborepo kiểm soát chặt mọi payload API (như cấu trúc JSON phân quyền RBAC hay mảng table_transfer_logs).

## C. Nhóm Repo Tham chiếu Nghiệp vụ Backend & In nhiệt POS (Phase 4 & Phase 5)

- 7. sairyss/domain-driven-hexagon (Mẫu Kiến trúc Xử lý State Machine trong NestJS)

- Tác dụng: Minh hoạ cách đóng gói các quy tắc nghiệp vụ phức tạp vào Domain Layer trong NestJS.

- Ứng dụng vào dự án: Agent dùng mẫu này để code OrderDomainService quản lý chặt vòng đời đơn hàng (PENDING SERVING PAID / MERGED / VOIDED), £m b£o không mÙt API nào có thÃ chèn thêm món vào ¡n ã óng (PAID) ho·c ã gÙp (MERGED).

- 8. robinfehr/react-thermal-printer (hoặc Klemen1337/node-thermal-printer)

- Tác dụng: Mẫu chuẩn dựng bố cục phiếu in nhiệt khổ 80mm bằng cú pháp Component React hoặc lệnh ESC/POS.

- Ứng dụng vào dự án: Giúp Agent dựng chính xác 3 mẫu phiếu Tách đơn 3 khu vực bếp (có chèn icon/logo Mũ đầu bếp, Khoai tây chiên, Ly nước), Phiếu báo chuyển bàn (Bàn 01 Bàn 07) và Phiếu tạm tính kèm ảnh VietQR động.

## PHẦN 3: QUY TRÌNH 5 PHASE ĐIỀU PHỐI AGENT (TỪ PHÂN TÍCH KIỂM ĐỊNH LẬP RULES THỰC THI)

Để đi đúng lộ trình bạn mong muốn (Phân tích lại dữ liệu Thiết kế chuẩn BMAD Kiểm lại toàn bộ sơ đồ Lập Rules Xây dựng BE/FE/Server), bạn hãy dẫn dắt Antigravity và Codex đi qua đúng 5 Phase tuần tự dưới đây:

## Phase 1: Phân tích lại dữ liệu & Chuẩn hoá Hồ sơ BMAD (BMAD Analyst & PM)

- Mục tiêu: Chuyển hoá toàn bộ Tài liệu Giải pháp (SRS/SAD) của chúng ta thành cấu trúc chuẩn của BMAD-METHOD và github/spec-kit.


- Skills kích hoạt: bmad-analyst, bmad-pm, superpowers:brainstorming.

- Đầu ra bắt buộc Agent phải tạo trong thư mục docs/bmad/:

- 1. 01-PRD-Master.md: Đặc tả toàn bộ 9 Module + Module 0 (Menu/Topping/Bàn), quy tắc Đơn Mang về (MV-#) và Chuyển/Gộp bàn.

- 2. 02-RBAC-And-MDM-Matrix.md: Bảng ma trận quyền hạn chi tiết cho từng màn hình (View, Create, Update, Delete + Sub- permissions như sửa ngân sách mặc định) và danh mục chuẩn hoá chuỗi Master Data.

- 3. 03-Edge-Cases-Catalog.md: Danh sách các tình huống biên bắt buộc phải chặn (ví dụ: Cấm xoá cache ui_preferences khi Đăng xuất; Cảnh báo Unsaved Changes khi rời trang Lịch làm việc; Chặn lỗi gộp đơn Mang về; Tự động điều hướng phiên QR trên điện thoại khách khi đổi từ Bàn 1 sang Bàn 7).

## Phase 2: Kiểm định Chéo Sơ đồ Kiến trúc Toàn dự án (Architecture & Diagram Audit)

- Mục tiêu: Trước khi cho phép tạo Rules hay viết code, bạn dùng Codex / Antigravity ở chế độ Architect để chạy một bước Kiểm toán Chéo (Cross-Verification) giữa các sơ đồ trong docs/architecture/.

- Skills kích hoạt: bmad-architect, superpowers:verification-before-completion.

- 4 bài kiểm tra chéo Agent phải thực hiện và xuất báo cáo 04-Architecture-Audit-Report.md:

- 1. Đối chiếu ERD với PRD: Mọi cột trên các Base Table (Hoá đơn, Nhập hàng, Dòng tiền, Nhân viên, Lịch làm việc, Phân quyền) đã có đủ trường tương ứng trong bảng SQL chưa? Bảng orders đã cho phép table_id nhận giá trị NULL khi order_type = 'TAKEAWAY' chưa?

- 2. Đối chiếu State Machine với Sequence Diagram: Khi thu ngân bấm In tạm tính (có QR chuyển khoản), trạng thái đơn hàng trong Sequence Diagram có bị chuyển nhầm sang PAID không, hay vẫn giữ đúng ở SERVING như State Machine quy định?

- 3. Đối chiếu API Spec với RBAC Matrix: Đã tách biệt API GET /api/v1/mdm/lookup (cho phép mọi nhân viên đã đăng nhập gọi để đổ dữ liệu vào Dropdown Nhập hàng) khỏi quyền quản trị trang Master Data (mdm:write) chưa? Đã trả về đúng mã 403 Forbidden thay vì 401 khi truy cập trái phép chưa?

- 4. Đối chiếu Công thức Kết ca (Module 4) với Hoá đơn (Module 1) & Nhập hàng (Module 3): Truy vấn tính tiền mặt lý thuyết trong két đã lọc đúng payment_method = 'CASH' (loại bỏ tiền chuyển khoản QR) và chỉ trừ các phiếu nhập hàng có payment_source = 'CASH_DRAWER' chưa?

## Phase 3: Biên dịch Hệ thống Rules (Rules Compilation Engine) — Bước Bản lề Quan trọng Nhất

- Mục tiêu: Sau khi hồ sơ BMAD và các sơ đồ ở Phase 1 & 2 đã khớp nhau 100%, bạn chưa cho Agent viết code dự án ngay, mà ra lệnh cho Agent đọc toàn bộ thư mục docs/ cùng các Skills để tự tổng hợp ra bộ Rules ràng buộc cứng.

- Tại sao bước này quyết định thành bại? Bộ nhớ ngữ cảnh (Context Window) của Agent sẽ bị trôi khi code sang file thứ 50. Nhưng các file nằm trong .antigravity/rules/*.md và AGENTS.md luôn được nạp tự động ở đầu mọi phiên làm việc (System Prompt Injection), đóng vai trò như "Hiến pháp của dự án" mà cả Antigravity lẫn Codex không bao giờ được phép vi phạm.

## Phase 4: Phân mảnh Task (BMAD Sharding) & Xây dựng Backend + Database

- Mục tiêu: Chia dự án thành các Story nhỏ (docs/stories/story-1.1-prisma-schema.md, story-1.2-pos-split-kitchen.md...) và dùng Codex + Antigravity triển khai tầng Backend (apps/api-server) và gói dùng chung (packages/shared).

- Skills kích hoạt: mattpocock:typescript-strict, upstash:context7, superpowers:test-driven-development.

- Thứ tự thực thi:

- 1. Khởi tạo packages/shared (Zod Schemas, Enums, DTOs).

- 2. Viết schema.prisma, tạo Migration (kèm Partial Unique Index cho bàn đang mở) và viết seed.ts nạp thực đơn mì cay, bàn, cấp độ cay, MDM.

- 3. Xây dựng IamModule (Auth + RbacGuard trả về 401/403 chuẩn xác + API lưu ui_preferences).

- 4. Xây dựng MdmModule (Hàm normalizeVietnameseString chống trùng lặp dữ liệu khi tự lưu từ Module 3 và Module 5).

- 5. Xây dựng PosModule + PosSocketGateway (Đặt món QR, POS tại quầy, Đơn Mang về MV-#, Tách 3 bếp Delta Split, Chuyển/Gộp/Đổi bàn có khoá dòng FOR UPDATE).

- 6. Xây dựng InventoryModule, CashflowModule (Thuật toán Kết ca chuẩn) và HrScheduleModule (Tự sinh tên tắt V.Anh / N.V.Anh và lưu lịch tuần).

## Phase 5: Xây dựng Frontend POS/Admin & Đóng gói Server Production

- Mục tiêu: Dùng Google Antigravity kết hợp ui-ux-pro-max-skill và kiến trúc bulletproof-react để xây dựng apps/web-app và cấu hình docker-compose.yml.

- Skills kích hoạt: ui-ux-pro-max-skill, upstash:context7, superpowers:verification-before-completion.

- Thứ tự thực thi:

- 1. Dựng Core Layout (Module 9) và Reusable Base Table: Sidebar kéo giãn được, Navbar có nút Dark/Light mode, Pop-up tìm kiếm màn hình (Ctrl + K lọc theo quyền RBAC), và Base Table hỗ trợ kéo giãn cột lưu vào ui_preferences (giữ nguyên khi Đăng xuất, chỉ xoá queryClient cache).

ấ

ế ế


- 2. Dựng Màn hình POS Hợp nhất (Module 1) + Trang Gọi món QR trên điện thoại + Component In nhiệt 80mm (3 phiếu bếp kèm Logo riêng, Phiếu báo chuyển bàn, Phiếu tạm tính có mã VietQR động).

- 3. Dựng các màn hình Quản trị: Hoá đơn (Module 2), Nhập hàng kèm Drawer tự lưu MDM (Module 3), Ngân sách & Kết ca có bảng đếm tiền theo mệnh giá (Module 4), Nhân viên (Module 5), Lịch làm việc dạng Excel có cảnh báo Unsaved Changes (Module 6), Master Data (Module 7) và Drawer Phân quyền CRUD (Module 8).

- 4. Đóng gói Dockerfile, docker-compose.yml (Caddy + NestJS + PostgreSQL 16 + Backup Cronjob).

Sơ đồ tương tác dưới đây mô hình hoá trực quan Quy trình 5 Phase Điều phối Agent (Google Antigravity + Codex), cho phép bạn bấm vào từng Phase để xem các GitHub Repo, Agent Skills được kích hoạt và các tệp đầu ra (Artifacts) tại mỗi chặng:

## PHẦN 4: BẢN THIẾT KẾ CẤU TRÚC RULES & CÂU LỆNH KÍCH HOẠT AGENT

Để hiện thực hoá ý tưởng "Dựa vào Skills + Tài liệu giải pháp + BMAD + Sơ đồ để Agent tự lập Rules trước khi code", bạn hãy tổ chức thư mục điều khiển Agent ngay tại gốc dự án như sau:

## 4.1. Cấu trúc Thư mục Điều phối Agent (.antigravity/, AGENTS.md & docs/)

```
fnb-spicy-noodle-system/
├── AGENTS.md # File luật gốc mà cả Codex CLI và Antigravity tự động đọc đầu tiên
├── .antigravity/
│ ├── rules/ # Các file Rules được Agent biên dịch ra ở Phase 3 (Luôn hiệu lực)
│ │ ├── 00-project-constitution.md # Kiến trúc Turborepo, Modular Monolith, cấm import chéo
│ │ ├── 01-database-and-state-machine.md # Ràng buộc ERD, State Machine (PENDING/SERVING/PAID/MERGED/PRINTED)
│ │ ├── 02-pos-and-cashflow-invariants.md # Luật bất biến: Delta Split 3 bếp, Chuyển/Gộp bàn, Công thức Kết ca
│ │ ├── 03-rbac-and-mdm-normalization.md # Luật 401 vs 403, tách Lookup API, chuẩn hoá chuỗi MDM không dấu
│ │ └── 04-frontend-ux-and-table-rules.md # Luật Base Table resize, giữ ui_prefs khi Logout, Unsaved Guard Lịch
│ └── skills/ # Nơi gắn các bộ Skills (superpowers, ui-ux-pro-max, bmad...)
├── docs/
│ ├── bmad/ # Hồ sơ PRD, RBAC Matrix, Edge Cases chuẩn hoá từ Phase 1
│ ├── architecture/ # Chứa file erd.mmd, state-machine.mmd, sequence.mmd, api-spec.md
│ └── stories/ # Các task nhỏ đã được BMAD Sharding để giao cho Agent code ở Phase 4
├── apps/
│ ├── api-server/ # NestJS + Prisma + Socket.io
│ └── web-app/ # React + Vite + TanStack + Tailwind + Shadcn
└── packages/
└── shared/ # Zod Schemas & TypeScript Interfaces dùng chung
```

## 4.2. Mẫu Nội dung Cốt lõi cần có trong AGENTS.md / .antigravity/rules/ (Sinh ra ở Phase 3)

Khi bạn yêu cầu Agent lập Rules ở Phase 3, bạn cần đảm bảo Agent đưa 10 Quy tắc Bất biến (Hard Invariants) sau vào trong bộ Rules:

\# HIẾN PHÁP KỸ THUẬT & NGHIỆP VỤ DỰ ÁN POS MÌ CAY (MANDATORY AGENT RULES)

```
\## 1. Quy tắc Kiến trúc & Công nghệ (Tech Stack Rules)
- Monorepo sử dụng `Turborepo + pnpm`. Mọi DTO, Enum (`Station`, `OrderStatus`, `KitchenStatus`, `PaymentMethod`) và
- Frontend (`apps/web-app`) tuân thủ chuẩn `bulletproof-react`: Cô lập từng module trong `src/features/*`. Tuyệt đối
- Luôn gọi MCP `context7` để kiểm tra cú pháp mới nhất của `Prisma`, `TanStack Table v8`, `TanStack Query v5` và `Ne
## 2. Quy tắc Bất biến về Nghiệp vụ POS, Tách Bếp & Chuyển Bàn (Module 0 & 1)
- **Đơn Mang về (`TAKEAWAY`):** Trường `table_id` phải là `NULL` và tự động sinh `takeaway_number` (`Mang về #01`, `
- **Tách đơn 3 khu vực bếp (`Delta Split`):** API `POST /pos/orders/:id/split-kitchen` CHỈ lọc các món có `kitchen_s
- **Tách bạch Tạm tính và Thanh toán:** Nút `In tạm tính (Kèm VietQR động)` giữ nguyên trạng thái đơn là `'SERVING'`
- **Chuyển bàn / Gộp bàn (`Bàn 1 -> Bàn 7`):** Phải bọc trong `prisma.$transaction` sử dụng khoá dòng `SELECT ... FO
## 3. Quy tắc Bất biến về Nhập hàng, Dòng tiền Kết ca & Master Data (Module 3, 4, 7)
- **Công thức Kết ca (Module 4):**
`expected_cash_in_drawer = opening_budget + total_cash_sales (chỉ tính đơn PAID bằng CASH) - total_cash_imports (c
Tuyệt đối KHÔNG cộng doanh thu chuyển khoản QR (`TRANSFER`) vào tiền mặt lý thuyết trong két.
- **Tách biệt Tìm kiếm và Thêm mới ở Module 3:** Thanh tìm kiếm trên Base Table chỉ dùng để lọc lịch sử. Cơ chế tìm
## 4. Quy tắc Bất biến về Nhân sự, Lịch làm việc, Phân quyền & UI (Module 5, 6, 8, 9)
- **Liên kết 1-1 Nhân sự & Tài khoản:** Thông tin cá nhân và ngân hàng lưu tại bảng `employees`. Bảng `users` liên k
- **Lịch làm việc Excel (Module 6):** Mỗi ô là `Multi-select Dropdown` hiển thị tên viết tắt (`V.Anh`). Nếu trùng tê
- **Phân quyền RBAC (Module 8):** Đã đăng nhập nhưng thiếu quyền truy cập màn hình/API phải trả về mã **`403 Forbidd
- **Đăng xuất & Lưu trạng thái UI (Module 9):** Khi bấm Đăng xuất, gọi `queryClient.clear()` và xoá sạch Token/Auth
```

## 4.3. Quy trình Thực hành Cụ thể trên Máy của Bạn (Step-by-Step)

- 1. Bước 1 — Chuẩn bị kho tài liệu gốc:

- Tạo thư mục dự án fnb-spicy-noodle-system.

- Lưu Tài liệu Giải pháp và Bản thiết kế ERD + State Machine + REST API + WebSocket mà chúng ta đã hoàn thiện ở các bước trước vào thư mục docs/raw-specs/.

- 2. Bước 2 — Nạp Skills cho Google Antigravity & Codex:


- Cài đặt các bộ Skills từ obra/superpowers, bmadcode/BMAD-METHOD, nextlevelbuilder/ui-ux-pro-max-skill vào thư mục .antigravity/skills/ (hoặc thư mục skills toàn cục của máy) và bật MCP upstash/context7.

- 3. Bước 3 — Chạy Prompt "Kiểm định & Lập Rules" (Phase 1 Phase 3):

- Giao nhiệm vụ đầu tiên cho Agent: "Hãy đọc toàn bộ tài liệu trong docs/raw-specs/, đóng vai BMAD Analyst & Architect để kiểm tra tính nhất quán giữa ERD, State Machine, API Spec và 9 Module nghiệp vụ. Sau khi kiểm định xong, hãy chuẩn hoá tài liệu vào docs/bmad/ và biên dịch ra bộ .antigravity/rules/*.md cùng file AGENTS.md ở thư mục gốc. Chưa viết bất kỳ dòng code ứng dụng nào cho đến khi tôi duyệt bộ Rules."

- 4. Bước 4 — Chạy Prompt "Phân mảnh & Thực thi" (Phase 4 Phase 5):

- Sau khi bạn kiểm tra các file trong .antigravity/rules/ thấy đã đầy đủ 100% ý đồ của mình, lúc này bạn mới cho Agent chạy BMAD Scrum Master để cắt dự án thành từng Story nhỏ và giao cho Codex (viết Backend + Test) cùng Antigravity (viết Frontend + Giao diện POS/Bảng) thực thi tuần tự.

User prompt: Hãy viết bộ câu lệnh (Prompts) chuẩn xác nhất để mình copy-paste vào Google Antigravity và Codex lần lượt cho từng Phase: từ Kiểm định sơ đồ, Lập Rules, Sharding Stories cho tới Code Backend/Frontend.

Response: Để các câu lệnh (Prompts) bên dưới phát huy tối đa sức mạnh khi chạy trên Google Antigravity và Codex, trước tiên bạn hãy tạo thư mục dự án và lưu 2 bản thiết kế chúng ta đã hoàn thiện ở các bước trước vào đúng đường dẫn sau:

```
fnb-spicy-noodle-system/
└── docs/
└── raw-specs/
├── 01-srs-sad-solution.md # Lưu nội dung Tài liệu Giải pháp (SRS & SAD)
└── 02-erd-state-api-socket.md # Lưu nội dung ERD, State Machine, REST API & WebSocket
```

Sau khi đã có 2 file đầu vào này, bạn chỉ cần copy-paste tuần tự từng Prompt dưới đây vào đúng Agent được chỉ định cho từng Phase.

## PHASE 1: Phân tích Dữ liệu & Chuẩn hoá Hồ sơ BMAD

- Agent sử dụng: Google Antigravity (Chế độ BMAD Analyst & PM)

- Mục đích: Đọc tài liệu thô và chuẩn hoá thành bộ đặc tả kỹ thuật không nhập nhằng, làm nguồn dữ liệu gốc cho toàn dự án.

@workspace Hãy đóng vai trò là BMAD Business Analyst và Product Manager (áp dụng phương pháp từ repo bmadcode/BMAD-M

Nhiệm vụ của bạn là đọc toàn bộ tài liệu thiết kế thô trong thư mục `docs/raw-specs/` (`01-srs-sad-solution.md` và `

- 1. Tạo file `docs/bmad/01-PRD-Master.md`:

- \- Đặc tả chi tiết toàn bộ 10 Module (từ Module 0: Thực đơn/Topping/Combo/Bàn QR đến Module 9: Navbar/Hồ sơ/UI Pre

- \- Làm rõ 3 nguồn tạo đơn trên màn hình POS Hợp nhất: (a) Khách quét QR tại bàn (`DINE_IN` + `QR_CODE`), (b) Thu n

- \- Đặc tả luồng Tách đơn 3 khu vực bếp (`BEP_NAU` kèm logo Mũ đầu bếp/Tô mì, `BEP_CHIEN` kèm logo Khoai tây chiên,

- \- Đặc tả tách bạch nút "In tạm tính (Kèm mã VietQR động)" (giữ trạng thái đơn là `SERVING`) và nút "Thanh toán ->

- \- Đặc tả luồng Chuyển bàn (`MOVE`), Gộp bàn (`MERGE`), Hoán đổi bàn (`SWAP`) từ Bàn 1 sang Bàn 7: xử lý in "Phiếu

- 2. Tạo file `docs/bmad/02-RBAC-And-MDM-Matrix.md`:

- \- Lập bảng Ma trận Phân quyền (RBAC Matrix) cho toàn bộ các màn hình: phân biệt quyền truy cập trang (Checkbox Vi

- \- Quy định rõ tài khoản `Super Admin` có toàn quyền và ở trạng thái `readonly` trên giao diện phân quyền.

- \- Quy định tách biệt API tra cứu danh mục dùng chung `GET /api/v1/mdm/lookup` (cho phép mọi tài khoản đã đăng nhậ

- \- Quy định chuẩn hoá dữ liệu Master Data (MDM): tự động `trim()`, chuẩn hoá chữ hoa đầu từ, sinh `normalized_name

- 3. Tạo file `docs/bmad/03-Edge-Cases-And-Invariants.md`:

- \- Ghi rõ công thức toán học bất biến khi bấm "Kết ca" ở Module 4: `Tiền mặt lý thuyết trong két = Ngân sách mặc định đầu ca + Tổng đơn PAID thu bằng TIỀN MẶT (CASH) - Tổng phiếu `Chênh lệch = Tiền thực đếm - Tiền mặt lý thuyết` (Bằng 0: Chuẩn | Lớn hơn 0: Dư | Nhỏ hơn 0: Thiếu). Tuyệt đối

- \- Quy tắc Module 5 & 9: Liên kết 1-1 giữa bảng `employees` và `users`. Lưu thông tin ngân hàng ở `employees` và đ

- \- Quy tắc Module 6 (Lịch làm việc Excel 7 ngày): Ô chọn nhân viên là Multi-select gắn màu theo Chuyên môn; thuật

- \- Quy tắc Module 8 & 9: Trả về đúng mã `403 Forbidden` khi đã đăng nhập nhưng cố tình truy cập link không có quyề

LƯU Ý QUAN TRỌNG: Trong Phase 1 này, bạn CHỈ tạo 3 file tài liệu trong `docs/bmad/`, tuyệt đối chưa viết bất kỳ dòng

## PHASE 2: Kiểm định Chéo Sơ đồ Kiến trúc Toàn dự án (Architecture Audit)

- Agent sử dụng: Codex (hoặc Google Antigravity ở chế độ Architect)

- Mục đích: Bắt Agent đối chiếu chéo giữa ERD, State Machine, Sequence Diagram, API Spec và PRD để phát hiện mọi điểm lệch khớp trước khi lập Rules.

Hãy đóng vai trò là Principal System Architect & QA Auditor (áp dụng skill obra/superpowers:verification-before-comp

Hãy đọc toàn bộ các file trong `docs/bmad/` vừa tạo ở Phase 1 cùng với file `docs/raw-specs/02-erd-state-api-socket.

- 1. Kiểm tra và xuất file `docs/architecture/01-verified-erd.mmd` (kèm giải thích SQL Constraints):

- \- Đối chiếu từng cột hiển thị trên Base Table và Drawer của cả 9 Module trong PRD xem đã có đủ trường tương ứng t

- \- Đảm bảo có đủ 3 ràng buộc vật lý: (a) Check constraint cho `order_type` (`DINE_IN` vs `TAKEAWAY`), (b) Partial


- 2. Kiểm tra và xuất file `docs/architecture/02-verified-state-machines.mmd`:

- \- Biểu đồ trạng thái `Order`: Đảm bảo tách rõ điểm khởi đầu từ QR (`PENDING`) và từ máy POS tại quầy (`SERVING`),

- \- Biểu đồ trạng thái `OrderItem`: Đảm bảo quản lý chặt trạng thái `NEW` -> `PRINTED` -> `CANCELLED` để phục vụ th

- 3. Kiểm tra và xuất file `docs/architecture/03-verified-sequences.mmd`:

- \- Vẽ 4 Sequence Diagrams chi tiết bằng Mermaid cho:

- (1) Luồng Khách quét QR đặt món & Gọi thêm món (kèm xử lý هيجوتلا tự động nếu bàn đã chuyển từ Bàn 1 sang Bàn 7).

- (2) Luồng Thu ngân bấm "Tách đơn" -> Phân rã Combo & lọc món `NEW` -> In nhiệt 80mm tự động cắt rời 3 phiếu có

- (3) Luồng Chuyển bàn (`MOVE`) & Gộp bàn (`MERGE`) sử dụng Database Transaction với khoá dòng `SELECT ... FOR UP

- (4) Luồng Kết ca đối soát dòng tiền giữa `orders` (CASH vs TRANSFER), `inventory_imports` (CASH_DRAWER vs EXTER

- 4. Xuất báo cáo kiểm định tại `docs/architecture/04-audit-report.md`: - Liệt kê các bài kiểm tra tính nhất quán giữa Database <-> Backend API <-> WebSocket Payload <-> Frontend UI Sta

Tuyệt đối chưa viết code ứng dụng ở bước này.

## PHASE 3: Biên dịch Hệ thống Rules Cứng (.antigravity/rules & AGENTS.md)

- Agent sử dụng: Google Antigravity

- Mục đích: Yêu cầu Agent đọc toàn bộ tài liệu BMAD và Sơ đồ kiến trúc đã được kiểm định ở Phase 1 & 2 để tự động sinh ra bộ "Hiến pháp dự án" khoá chặt hành vi của cả Antigravity và Codex.

@workspace Bây giờ toàn bộ tài liệu BMAD trong `docs/bmad/` và sơ đồ kiến trúc trong `docs/architecture/` đã được th

Nhiệm vụ của bạn trong Phase 3 là đóng vai trò Rules Compilation Engine: đọc toàn bộ các tài liệu trong `docs/bmad/`

Hãy tạo đầy đủ 6 file sau đây:

- 1. File `AGENTS.md` (đặt ở thư mục gốc của dự án để cả Codex và Antigravity luôn tự động nạp đầu tiên):

- \- Tóm tắt kiến trúc Monorepo (`Turborepo + pnpm`), cấu trúc 3 nhánh (`apps/api-server`, `apps/web-app`, `packages

- \- Liệt kê các lệnh CLI chuẩn để build, chạy typecheck (`pnpm -r typecheck`), chạy test và kiểm tra migration.

- \- Liệt kê 10 Quy tắc Bất biến (Hard Invariants) về nghiệp vụ POS Mì cay không một Agent nào được phép vi phạm.

- 2. File `.antigravity/rules/00-architecture-and-monorepo.md`:

- \- Quy định chia sẻ 100% Enums, Zod Schemas và DTO Interfaces qua `packages/shared`.

- \- Quy định cấu trúc Modular Monolith cho NestJS (`apps/api-server`) và cấu trúc Feature-based (`bulletproof-react

- \- Bắt buộc sử dụng MCP `context7` để tra cứu tài liệu mới nhất của Prisma, NestJS, TanStack Table v8, TanStack Qu

- 3. File `.antigravity/rules/01-database-and-concurrency.md`:

- \- Quy định kiểu dữ liệu tiền tệ bắt buộc dùng `NUMERIC(12, 2)`, không dùng `FLOAT`.

- \- Mọi thao tác làm thay đổi trạng thái đơn hàng, tách bếp (`split-kitchen`), chuyển/gộp/đổi bàn (`table-action`)

- \- Quy định cơ chế Soft Delete (`is_deleted = true`) cho `employees`, `inventory_imports`, và `is_active = false`

- 4. File `.antigravity/rules/02-pos-kitchen-and-cashflow-logic.md`:

- \- Chi tiết quy tắc Delta Split 3 khu vực bếp (`BEP_NAU`, `BEP_CHIEN`, `PHA_CHE`) kèm mã Logo tương ứng.

- \- Chi tiết quy tắc tách nút `In tạm tính (VietQR động)` và nút `Thanh toán (Chốt đơn PAID)`.

- \- Chi tiết quy tắc xử lý Đơn Mang về (`TAKEAWAY` với `takeaway_number` tự tăng theo ngày) và xử lý Chuyển/Gộp bàn

- \- Chi tiết công thức Kết ca ở Module 4 và quy tắc tự động lưu + chuẩn hoá chuỗi không dấu Master Data ở Module 3,

- 5. File `.antigravity/rules/03-rbac-security-and-hr-schedule.md`:

- \- Quy tắc phân biệt rạch ròi mã lỗi HTTP `401 Unauthorized` (chưa đăng nhập/hết hạn JWT) và `403 Forbidden` (đã đ

- \- Quy tắc mở quyền `GET /api/v1/mdm/lookup` cho mọi tài khoản đã đăng nhập.

- \- Quy tắc tự sinh tên viết tắt nhân viên (`V.Anh` -> `N.V.Anh (#ID)` khi trùng) và cấu trúc lưu lịch làm việc the

- 6. File `.antigravity/rules/04-frontend-ux-table-and-print.md`:

- \- Quy tắc xây dựng Component `BaseTable` dùng chung trên nền `TanStack Table v8`: hỗ trợ kéo giãn cột (`columnRes

- \- Quy tắc Đăng xuất (Module 9): Xoá sạch Auth Token và gọi `queryClient.clear()`, nhưng BẮT BUỘC GIỮ LẠI `ui_pref

- \- Quy tắc `Unsaved Changes Guard` (`beforeunload` + Router Blocker) cho bảng Lịch làm việc Module 6. - Quy tắc CSS `@media print` khổ 80mm với `break-after: page; page-break-after: always;` để máy in nhiệt tự động

Hãy viết nội dung từng file thật chi tiết, rõ ràng, dạng mệnh lệnh kỹ thuật (`MUST`, `NEVER`, `ALWAYS`). Chưa viết c

## PHASE 4A: Phân mảnh Dự án thành Chuỗi Stories (BMAD Story Sharding)

- Agent sử dụng: Google Antigravity (Chế độ BMAD Scrum Master)

- Mục đích: Chia nhỏ dự án thành 12 Stories độc lập theo đúng thứ tự phụ thuộc để khi giao cho Codex và Antigravity code sẽ đạt độ chính xác tuyệt đối, không bị tràn bộ nhớ ngữ cảnh.

@workspace Hãy đóng vai trò là BMAD Scrum Master. Dựa trên bộ Rules trong `.antigravity/rules/`, `AGENTS.md` và hồ s

- \- `story-01-monorepo-and-shared-contracts.md`: Khởi tạo Turborepo, `packages/shared` chứa toàn bộ Enums, Zod Schemas

- \- `story-02-prisma-schema-migrations-and-seed.md`: Thiết lập `apps/api-server`, viết `schema.prisma`, SQL Migration

- \- `story-03-iam-auth-rbac-and-mdm-backend.md`: Xây dựng `IamModule` (JWT Auth, `RbacGuard` trả về chuẩn 401/403, quả

- \- `story-04-menu-tables-and-pos-core-backend.md`: Xây dựng `MenuModule` và `PosModule` (Đặt món từ QR, Đặt món trực

- \- `story-05-pos-delta-split-and-table-transfer-backend.md`: Xây dựng thuật toán `split-kitchen` (Delta Split tách 3

- \- `story-06-inventory-and-cashflow-settlement-backend.md`: Xây dựng `InventoryModule` (Module 3: Nhập hàng tự động đ

- \- `story-07-hr-employees-and-excel-schedule-backend.md`: Xây dựng `HrModule` (Module 5: CRUD Nhân viên đồng bộ 1-1 v


- \- `story-08-frontend-shell-basetable-and-navbar.md`: Khởi tạo `apps/web-app` (React + Vite + Tailwind + Shadcn), xây

- \- `story-09-frontend-qr-mobile-and-unified-pos.md`: Xây dựng giao diện Khách quét QR trên điện thoại (tự nhận sự kiệ

- \- `story-10-frontend-thermal-print-80mm-and-vietqr.md`: Xây dựng hệ thống Component In nhiệt 80mm (`@media print` tự

- \- `story-11-frontend-invoices-inventory-and-cashflow.md`: Xây dựng giao diện Module 2 (Màn hình Hoá đơn + Bộ lọc kép

- \- `story-12-frontend-hr-excel-schedule-mdm-and-rbac.md`: Xây dựng giao diện Module 5 (Quản lý nhân viên), Module 6 (

Trong mỗi file Story, hãy ghi rõ: (1) Mục tiêu, (2) Danh sách các file cần tạo/sửa, (3) Chi tiết logic kỹ thuật tríc

## PHASE 4B: Thực thi Backend, Database & Kiểm thử Tự động (TDD)

- Agent sử dụng: Codex (Mạnh nhất về Backend Logic, SQL Transaction & Viết Test)

- Cách chạy: Bạn dùng câu lệnh mẫu dưới đây để giao cho Codex thực hiện lần lượt từ story-01 đến story-07 (mỗi lần chạy 1 hoặc 2 Story để code đạt chất lượng cao nhất).

Hãy đọc kỹ file `AGENTS.md`, toàn bộ các file luật trong `.antigravity/rules/` và đặc tả chi tiết trong `docs/storie

Áp dụng kỷ luật từ skill `obra/superpowers:test-driven-development`, `mattpocock/skills` và sử dụng MCP `context7`:

- 1. Triển khai đầy đủ mã nguồn thực tế (Production-ready code, tuyệt đối không viết code giả lập `// TODO` hay bỏ trố

- 2. Tuân thủ nghiêm ngặt mọi ràng buộc trong `.antigravity/rules/`:

- \- Dùng `SELECT ... FOR UPDATE` trong `prisma.\$transaction` cho các nghiệp vụ ở `PosService` (Tách đơn 3 bếp, Chuy

- \- Đảm bảo `RbacGuard` trả về đúng mã `401` khi chưa xác thực và `403` khi thiếu quyền trong ma trận CRUD/Sub-perm - Đảm bảo thuật toán rút gọn tên nhân viên (`V.Anh` -> `N.V.Anh (#ID)` khi trùng) và hàm chuẩn hoá chuỗi Master D

- 3. Viết đầy đủ Unit Tests và Integration Tests kiểm chứng cho từng hàm nghiệp vụ:

- \- Test kịch bản gọi thêm món Lượt 2 và bấm "Tách đơn" chỉ in ra các món `NEW` (Delta Split), không in lại món `PR

- \- Test kịch bản chuyển từ Bàn 1 sang Bàn 7 (cả trường hợp Bàn 7 trống `MOVE` và Bàn 7 đang ăn `MERGE`), kiểm tra

- \- Test công thức Kết ca ở Module 4 với dữ liệu hỗn hợp (Đơn tiền mặt + Đơn chuyển khoản QR + Phiếu nhập hàng lấy

- 4. Sau khi viết code xong mỗi Story, tự động chạy lệnh kiểm tra kiểu dữ liệu (`pnpm -r typecheck`) và chạy bộ test (

## PHASE 5: Thực thi Frontend POS/ERP, In nhiệt 80mm & Đóng gói Docker

- Agent sử dụng: Google Antigravity (Kết hợp ui-ux-pro-max-skill + bulletproof-react)

- Cách chạy: Bạn dùng câu lệnh dưới đây để giao cho Antigravity thực thi từ story-08 đến story-12.

@workspace Hãy đọc kỹ `AGENTS.md`, toàn bộ `.antigravity/rules/` (đặc biệt là `04-frontend-ux-table-and-print.md`) v

Hãy kích hoạt `nextlevelbuilder/ui-ux-pro-max-skill`, cấu trúc `alan2207/bulletproof-react` và MCP `context7` để đảm

- 1. Khung Giao diện, Navbar & Base Table Dùng chung (`story-08`):

- \- Sidebar bên trái cho phép nắm kéo chuột để thay đổi độ rộng (Resizable Sidebar).

- \- Góc phải Navbar bố trí đúng thứ tự: Thanh Search nhỏ đại diện (bấm vào hoặc nhấn `Ctrl + K` mở Pop-up tìm kiếm

- \- Trang `Hồ sơ tài khoản` hiển thị thông tin đồng bộ từ bảng `employees` (Chức vụ và Chuyên môn ở trạng thái `rea

- \- Khi bấm `Đăng xuất`: Xoá sạch Token và bộ nhớ đệm dữ liệu (`queryClient.clear()`), nhưng giữ nguyên cấu hình `u

- \- Component `BaseTable` xây dựng trên `TanStack Table v8` hỗ trợ kéo giãn mọi cột mượt mà ở 60fps và tự động lưu

- 2. Màn hình POS Hợp nhất, Quét QR & In nhiệt 80mm (`story-09` & `story-10`):

- \- Giao diện POS chia đôi màn hình: Nửa trái chuyển đổi tức thì giữa [Sơ đồ Bàn + Nút Tạo đơn Mang về `MV-#`] và [ - Cụm nút điều khiển trên Hoá đơn điện tử gồm:

- \+ Nút `[Đổi / Gộp bàn]` cho phép sửa lại số bàn nếu nhân viên bấm nhầm hoặc khách chuyển từ Bàn 1 sang Bàn 7 (t

- \+ Nút `[Tách đơn]` tự động chia các món `Mới gọi` về 3 khu vực bếp và gọi lệnh in nhiệt 80mm.

- \+ Nút `[In tạm tính (QR)]` in phiếu kiểm món kèm ảnh **Mã VietQR động** (nhúng sẵn số tiền và mã đơn) trong khi

- \+ Nút `[Thanh toán]` bật Pop-up xác nhận 2 bước (`Xác nhận` / `Huỷ bỏ`) tránh bấm nhầm -> Khi bấm `Xác nhận` hi

- \- Mẫu in nhiệt 80mm (`@media print` với `page-break-after: always`) phải hiển thị rõ **Logo riêng biệt** trên đầu

- 3. Các Màn hình Quản trị Vận hành (`story-11` & `story-12`):

- \- **Màn hình Hoá đơn (Module 2):** Base Table kèm thanh tìm kiếm có Dropdown bên trái (chọn Thời điểm tạo hiện lị

- \- **Màn hình Nhập hàng (Module 3):** Thanh tìm kiếm trên Base Table dùng để lọc lịch sử theo Ngày/Tháng/Năm (hiện

- \- **Màn hình Ngân sách & Dòng tiền (Module 4):** Hiển thị Ngân sách mặc định đầu ngày (chỉ Admin sửa được), Compo

- \- **Màn hình Quản lý Nhân viên (Module 5):** Base Table kèm bộ lọc Dropdown bên trái thanh tìm kiếm (`Tên nhân vi

- \- **Màn hình Lịch làm việc (Module 6):** Bảng ma trận 7 ngày trong tuần x Khung giờ kiểu Excel, cho phép chọn trự

- \- **Màn hình Master Data (Module 7) & Phân quyền (Module 8):** Hiển thị danh mục theo từng Category; màn hình Phâ

- 4. Sau khi hoàn tất giao diện, hãy kiểm tra kết nối End-to-End giữa `apps/web-app` và `apps/api-server`, chạy `pnpm

## Mẹo Vận hành Thực tế để Tiết kiệm Quota & Đạt Chất lượng Cao nhất

- 1. Cách giao việc giữa 2 công cụ:

- Với Phase 1, Phase 3, Phase 4A và Phase 5: Chạy trực tiếp trên Google Antigravity vì Antigravity quản lý cây thư mục đa file và dựng giao diện React/Tailwind cực nhanh.

- Với Phase 2 (Audit Sơ đồ) và Phase 4B (Code Backend + Transaction + Viết Test): Giao cho Codex vì khả năng suy luận logic toán học, khóa dòng SQL và viết test tự hành của Codex cực kỳ chặt chẽ.

- 2. Chạy từng Story trong Phase 4B và Phase 5:

- Sau khi Phase 4A sinh ra 12 file trong docs/stories/, thay vì bắt Agent code một mạch cả 12 file, bạn chỉ cần gõ ngắn gọn:


"Hãy thực thi hoàn chỉnh docs/stories/story-04-menu-tables-and-pos-core-backend.md theo đúng các quy tắc trong AGENTS.md và chạy test kiểm chứng."

- Cách chia nhỏ từng bước này giúp Agent tập trung 100% trí thông minh vào từng module, không bao giờ viết thiếu trường dữ liệu hay bỏ sót các yêu cầu chi tiết của bạn.
