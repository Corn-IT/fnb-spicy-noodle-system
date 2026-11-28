import { Injectable } from '@nestjs/common';
import { stripVietnamese } from '@fnb/shared';

export interface KnowledgeSection {
  readonly id: string;
  readonly topic: string;
  readonly title: string;
  readonly keywords: readonly string[];
  readonly content: string;
}

const SYSTEM_KB_SECTIONS: readonly KnowledgeSection[] = [
  {
    id: 'system_overview_modules',
    topic: 'overview',
    title: 'Tổng quan 16 Phân hệ POS Ăn Vặt Tran & Phím tắt',
    keywords: [
      'he thong', 'phan he', 'module', 'tinh nang', 'chuc nang', 'duong dan',
      'phim tat', 'ctrl+k', 'ctrl+j', 'command palette', 'sidebar', 'bao nhieu module',
    ],
    content:
      '• Hệ thống gồm 16 phân hệ UI khép kín: Dashboard (/dashboard), POS Desktop (/pos), POS Cảm ứng & Hub (/pos/touch, /pos/touch/hub), QR Khách (/q/:token), Thực đơn (/menu), Mã giảm giá (/discounts), Hóa đơn (/invoices), Nhập kho (/inventory), Kết ca (/cashflow), Mã VietQR (/payment-qr), Nhân sự (/employees), Bảng công (/schedules), Bảng lương (/payroll), Master Data (/master-data), Phân quyền RBAC (/rbac), Cài đặt (/settings) & Hồ sơ (/profile).\n' +
      '• Phím tắt nhanh: Ctrl+K / Cmd+K mở Command Palette chuyển trang theo quyền RBAC; Ctrl+J / Cmd+J bật/tắt khung Trợ lý AI Lona.',
  },
  {
    id: 'pos_menu_modifiers',
    topic: 'menu',
    title: 'Thực đơn 3 tầng, Cấp cay, Size M/L, Đổi món & Báo hết món',
    keywords: [
      'thuc don', 'menu', '3 tang', 'cap cay', 'size m', 'size l', 'auto check', 'auto bat',
      'doi mon chinh', 'substitution', 'topping', 'bao het mon', 'tam het', 'excel', 'import',
    ],
    content:
      '• Thực đơn phân cấp 3 tầng: Khu vực Bếp (BEP_NAU, BEP_CHIEN, PHA_CHE, COMBO, BEP_*) → Danh mục con → Món ăn & nhóm tùy chọn.\n' +
      '• Tùy chọn thông minh: Cấp độ cay 0–7 (bắt buộc chọn 1), Size M/L tự gắn nhãn (M)/(L), Auto-Check đồ ăn kèm (bỏ tích → in "Không ..."), và Logic đổi món chính (bỏ Tôm tự thay bằng Mực).\n' +
      '• Nút "Báo hết món 1 chạm" (/pos/touch/stock-status) khóa món/topping realtime trên cả POS và QR khách; hỗ trợ Import/Export Excel.',
  },
  {
    id: 'pos_split_kitchen',
    topic: 'pos',
    title: 'Gửi bếp Delta Split, Phân rã COMBO & Hủy món (Invariant 3)',
    keywords: [
      'tach bep', 'gui bep', 'tach don', 'combo', 'phan ra', 'bep nau', 'bep chien',
      'pha che', 'in lai bep', 'printed', 'huy mon', 'phieu huy', 'is_takeaway', 'luot goi',
    ],
    content:
      '• Bấm "Tách đơn / Gửi bếp" (POST /pos/orders/:id/split-kitchen) CHỈ lọc các món kitchen_status = NEW và đánh dấu Lượt 1, Lượt 2...\n' +
      '• Món thuộc trạm COMBO tự phân rã qua combo_items về đúng trạm vật lý (BEP_NAU, BEP_CHIEN, PHA_CHE, BEP_*) — không bao giờ in chữ "COMBO" xuống bếp.\n' +
      '• Món đã PRINTED không bao giờ in trùng khi gửi thêm món mới (idempotent). Muốn in lại phải dùng nút "In lại phiếu bếp"; hủy món đã PRINTED tự in Phiếu báo hủy xuống đúng trạm bếp.',
  },
  {
    id: 'pos_takeaway_and_tables',
    topic: 'pos',
    title: 'Đơn Mang về & 4 Thao tác Bàn MOVE/MERGE/SWAP/TO_TAKEAWAY (Invariants 2 & 5)',
    keywords: [
      'mang ve', 'takeaway', 'ban ao', 'chuyen ban', 'gop ban', 'ghep ban',
      'doi ban', 'move', 'merge', 'swap', 'to_takeaway', 'ban trong', 'for update',
    ],
    content:
      '• Đơn Mang về luôn có table_id = NULL và số takeaway_number tự tăng từ #1 mỗi ngày theo giờ VN (+07:00); bảng dining_tables chỉ chứa bàn vật lý.\n' +
      '• Hỗ trợ 4 thao tác: Chuyển bàn (MOVE), Ghép bàn (MERGE), Đổi bàn (SWAP), và Chuyển sang Mang về (TO_TAKEAWAY) trong transaction khóa dòng SELECT ... FOR UPDATE.\n' +
      '• Khi chuyển/ghép đơn Mang về vào bàn, nhãn [MANG VỀ] trên món cũ được tự động gỡ; đơn đã in bếp sẽ phát phiếu báo đổi bàn và chuyển hướng màn hình QR của khách.',
  },
  {
    id: 'pos_touch_and_drafts',
    topic: 'pos',
    title: 'Chế độ POS Cảm ứng iPOS (/pos/touch) & Giỏ lưu tạm dùng chung',
    keywords: [
      'pos cam ung', 'touch pos', 'ipos', 'hub', '4 tab', 'gio tam', 'luu tam',
      'pos_drafts', 'chua gan ban', 'xoa gio tam', 'deletedrafts',
    ],
    content:
      '• POS Cảm ứng (/pos/touch) thiết kế toàn màn hình với 4 tab (Tất cả · Phòng bàn · Mang về · Lưu tạm), thanh đáy 4 nút và Trung tâm Hub (/pos/touch/hub).\n' +
      '• Giỏ Lưu tạm (pos_drafts) đồng bộ giữa các máy POS mà chưa chiếm bàn hay gửi bếp; khi xác nhận tạo đơn hệ thống áp dụng giá hiện hành. Nút xóa giỏ tạm yêu cầu quyền pos.deleteDrafts.',
  },
  {
    id: 'pos_provisional_checkout',
    topic: 'pos',
    title: 'In Tạm tính VietQR vs Thanh toán 2 bước, Tách bill & Giảm giá (Invariant 4)',
    keywords: [
      'tam tinh', 'thanh toan', 'tach thanh toan', 'tach bill', 'split',
      'tien mat', 'chuyen khoan', 'giam gia', 'giam tay', 'manualdiscount', 'voucher', 'khuyen mai',
    ],
    content:
      '• "In tạm tính" giữ nguyên trạng thái SERVING và bàn OCCUPIED, có thể kèm mã VietQR động xoay vòng theo hạn mức.\n' +
      '• "Thanh toán → Xác nhận" (CASH / TRANSFER / SPLIT) chuyển đơn sang PAID, giải phóng bàn về AVAILABLE và bung két RJ11 (nếu có quyền pos:openCashDrawer).\n' +
      '• Hỗ trợ Tách thanh toán (split-checkout một phần món trong bàn) và Giảm giá theo %/số tiền, khung giờ vàng/thứ; Giảm tay cần quyền pos:manualDiscount.',
  },
  {
    id: 'invoices_void_and_pm',
    topic: 'invoices',
    title: 'Quản lý Hóa đơn, Sửa PTTT 2 bước & Hủy đơn VOID (/invoices)',
    keywords: [
      'hoa don', 'invoices', 'in lai hoa don', 'sua pttt', 'duyet pttt',
      'phuong thuc thanh toan', 'huy don', 'huy hoa don', 'void', 'ly do huy',
    ],
    content:
      '• Tại /invoices: lọc theo ngày, trạng thái, PTTT, in lại hóa đơn hoặc xuất Excel.\n' +
      '• Sửa PTTT 2 bước: Thu ngân (invoices:update) gửi yêu cầu chuyển giữa Tiền mặt/Chuyển khoản → Quản lý (invoices:approve) duyệt để tự cập nhật Kết ca và hạn mức QR.\n' +
      '• Hủy hóa đơn đã thu tiền (VOID) yêu cầu quyền invoices:void và lý do >= 10 ký tự; đơn VOIDED bị loại khỏi doanh thu, két tiền và hạn mức QR.',
  },
  {
    id: 'cashflow_settlement',
    topic: 'cashflow',
    title: 'Công thức Kết ca, Blind Mode & Nhập kho CASH_DRAWER vs EXTERNAL (Invariant 6)',
    keywords: [
      'ket ca', 'chot ca', 'ket tien', 'expected_cash', 'blind mode', 'menh gia',
      'bu chenh lech', 'compensate', 'nhap kho', 'cash_drawer', 'external', 'dau ca', 'tien le',
    ],
    content:
      '• Công thức két tiền bất biến: expected_cash = Tiền đầu ca + Thu tiền mặt (đơn CASH + phần mặt của SPLIT ở trạng thái PAID) − Phiếu nhập kho nguồn CASH_DRAWER (is_deleted = FALSE).\n' +
      '• Tiền chuyển khoản QR, đơn VOIDED và phiếu nhập nguồn quỹ ngoài (EXTERNAL) TUYỆT ĐỐI không cộng/trừ vào két tiền mặt.\n' +
      '• Blind Mode: Thu ngân đếm 9 mệnh giá để nhập tiền thực đếm khách quan trước khi xem chênh lệch; hỗ trợ Bù chênh lệch (cashflow:compensate).',
  },
  {
    id: 'qr_geofence_and_rotation',
    topic: 'qr',
    title: 'QR Khách hàng (/q/:token), Bảo mật Wi-Fi/GPS & Xoay vòng hạn mức VietQR',
    keywords: [
      'qr', 'quang ma qr', 'quet qr', 'khong quet duoc', 'loi qr', 'wifi', 'geofencing', 'gps', 'vi tri',
      'han muc', 'xoay vong', 'vietqr', 'web push', 'giong noi', 'tu huy qua han',
    ],
    content:
      '• Khách quét QR bàn/mang về (/q/:token) gọi món realtime qua Socket.io, phát chuông + giọng nói tiếng Việt + Web Push tới thu ngân (có kiểm tra qr-pending-check và tự hủy nếu quá hạn).\n' +
      '• Bảo mật QR (pos:qrSecurity): bật khóa theo IP Wi-Fi quán và/hoặc bán kính GPS trong /settings để chống đặt ảo từ xa.\n' +
      '• Đa tài khoản VietQR (/payment-qr): tự động xoay vòng theo priority sang tài khoản chưa chạm hạn mức Ngày/Tháng/Năm.',
  },
  {
    id: 'printer_hardware',
    topic: 'printer',
    title: 'Máy in nhiệt 80mm, Android iMin RawBT USB, LAN :9100 & Mở két RJ11',
    keywords: [
      'may in', 'rawbt', 'imin', 'd3-505', 'itp6', '80mm', 'in nhiet',
      'lan', '9100', 'in bill', 'khong in', 'rj11', 'ket tien', 'mau phieu',
    ],
    content:
      '• Hỗ trợ 3 chế độ in vật lý tại /settings hoặc /pos/touch/printer: (1) Trình duyệt (--kiosk-printing), (2) Android iMin D3-505 + RawBT qua cáp USB tới máy in iTP6, (3) Máy in mạng LAN TCP/9100.\n' +
      '• Tùy chỉnh độc lập 5 mẫu phiếu 80mm (Tạm tính, Hóa đơn, Bếp, Hủy món, Đổi bàn) và thử nghiệm In kiểm tra / Bung két RJ11 trực tiếp trên POS.',
  },
  {
    id: 'hr_schedule_payroll',
    topic: 'hr',
    title: 'Nhân sự (/employees), Bảng công tuần (/schedules) & Bảng lương (/payroll)',
    keywords: [
      'nhan su', 'nhan vien', 'bang cong', 'lich truc', 'lich lam', 'cham cong',
      'full_shift', 'custom_hours', 'sao chep tuan', 'tinh luong', 'bang luong', 'full_time', 'part_time',
    ],
    content:
      '• Nhân sự (/employees): quản lý hồ sơ, chức vụ, chuyên môn, liên kết tài khoản 1-1 và xuất Excel.\n' +
      '• Bảng công tuần (/schedules): ma trận 7 ngày × ca trực hỗ trợ Đủ ca (FULL_SHIFT) và Giờ lẻ (CUSTOM_HOURS), sao chép lịch từ tuần trước.\n' +
      '• Bảng lương (/payroll): tổng hợp công từ Bảng công theo FULL_TIME / PART_TIME, cho phép chỉnh thưởng/phạt và cấu hình định mức.',
  },
  {
    id: 'mdm_audit_system',
    topic: 'mdm',
    title: 'Master Data 7 danh mục chuẩn hóa (Invariant 7) & Nhật ký Kiểm toán',
    keywords: [
      'mdm', 'master data', 'du lieu goc', 'chuan hoa', 'nguyen lieu', 'nha cung cap',
      'don vi tinh', 'nhat ky', 'audit log', 'lich su thao tac',
    ],
    content:
      '• Master Data (/master-data) chuẩn hóa 7 danh mục (Danh mục món, Trạm bếp, Chức vụ, Chuyên môn, Nguyên liệu, Nhà cung cấp, ĐVT) qua MdmService.findOrCreate(): trim → viết hoa đầu từ → chống trùng không dấu.\n' +
      '• Hệ thống ghi nhận Audit Logs cho 13 module nghiệp vụ, tra cứu nhanh ngay nút Nhật ký trên từng màn hình quản trị.',
  },
  {
    id: 'rbac_single_session',
    topic: 'rbac',
    title: 'Phân quyền 14 phân hệ, Single-Session 401/403 & UI Preferences (Invariants 8 & 9)',
    keywords: [
      'rbac', 'phan quyen', 'single session', '401', '403', 'dang xuat',
      'bi vang', 'bi da', 'thu hoi phien', 'ip', 'ui_preferences',
    ],
    content:
      '• Phân quyền RBAC (/rbac) tách riêng 14 phân hệ chi tiết và cập nhật realtime xuống máy nhân viên ngay lập tức.\n' +
      '• Single-Session: mỗi tài khoản giữ 1 phiên hiệu lực; đăng nhập máy mới hoặc bị admin thu hồi phiên sẽ trả 401 AUTH_SESSION_REVOKED và đá ra Login, còn thiếu quyền trả 403 giữ nguyên phiên.\n' +
      '• Khi Đăng xuất: token và cache nghiệp vụ bị xóa nhưng tùy chọn giao diện (theme, tỷ lệ hiển thị, sắp xếp menu, loa báo QR) vẫn được giữ nguyên.',
  },
  {
    id: 'settings_appearance',
    topic: 'settings',
    title: 'Cài đặt Giao diện, Thương hiệu & Tỷ lệ hiển thị 80%–150% (/settings)',
    keywords: [
      'cai dat', 'settings', 'giao dien', 'theme', 'sang toi', 'dark mode',
      'ty le hien thi', 'display scale', 'phong to', 'logo', 'mau sac', 'menu sidebar',
    ],
    content:
      '• Tại Cài đặt Cửa hàng (/settings): chỉnh tên quán, Logo/Favicon/QR Logo, màu sắc Light/Dark, theme mặc định và tỷ lệ hiển thị 80%–150%.\n' +
      '• Có thể đổi tên, ẩn/hiện hoặc kéo thả thứ tự nhóm menu Sidebar; nhân viên giữ độ rộng cột bảng và công tắc loa báo đơn riêng tại Hồ sơ (/profile).',
  },
  {
    id: 'ai_lona_assistant',
    topic: 'ai',
    title: 'Trợ lý AI Lona (Local 0-token + Gemini Multi-Pool & Cấu hình Bật/Tắt)',
    keywords: [
      'ai lona', 'lona ai', 'tro ly ai', 'bot', 'gemini', 'ai local', '0 token',
      'dong bo telegram', 'dong bo trang thai', 'ctrl+j', 'gioi han luot', 'quota',
    ],
    content:
      '• Trợ lý AI Lona (Ctrl+J) ưu tiên giải đáp trực diện & hỏi đáp hệ thống bằng bộ máy Local 0-token (~10–50ms), chỉ gọi Gemini AI khi gặp câu hỏi phân tích sâu/ngoài mẫu.\n' +
      '• Quản trị viên bật/tắt linh hoạt tại /settings (mục Trợ lý AI Lona): Công tắc tổng, AI Local, AI Gemini và tùy chọn Đồng bộ trạng thái sang Bot Telegram @POS_Lona_bot.\n' +
      '• Dữ liệu trả lời luôn bị khóa chặt theo đúng 14 nhóm quyền RBAC của người đang đăng nhập.',
  },
  {
    id: 'invariants_summary',
    topic: 'architecture',
    title: '10 Quy tắc Bất biến (Hard Invariants) & Kiểu Tiền tệ NUMERIC(12,2)',
    keywords: [
      '10 quy tac', 'invariant', 'hard invariant', 'bat bien', 'kien truc',
      'numeric', 'decimal', 'tien te', 'deadlock',
    ],
    content:
      '• 10 Hard Invariants cốt lõi: (1) Cô lập 16 feature modules, (2) Đơn Mang về table_id = NULL, (3) Delta Split COMBO không gửi chữ COMBO xuống bếp, (4) Tách bạch Tạm tính vs Thanh toán, (5) Giao dịch SELECT ... FOR UPDATE theo thứ tự orders → dining_tables → discounts, (6) Công thức Kết ca không cộng QR/VOIDED, (7) MDM chống trùng không dấu, (8) Single-Session 401 vs 403, (9) Bảo toàn ui_preferences khi logout, (10) Tiền tệ dùng chuẩn NUMERIC(12,2)/Decimal.',
  },
];

const KB_STOP_WORDS = new Set([
  'la', 'gi', 'the', 'nao', 'nhu', 'cach', 'lam', 'sao', 'cho', 'toi', 'minh', 'ban',
  'hoi', 've', 'cua', 'trong', 'co', 'khong', 'duoc', 'nhung', 'cac', 'mot', 'tai', 'vi',
  'de', 'can', 'muon', 'thi', 'roi', 'nay', 'kia', 'do', 'day', 'oi', 'a', 'nhe', 'nha',
  'giup', 'em', 'anh', 'chi', 'sep', 'va', 'hay', 'voi', 'bi', 'bi_gi', 'sao_vay', 'vay',
]);

@Injectable()
export class SystemKbService {
  searchDocs(query: string, topic?: string | null, limit = 2): KnowledgeSection[] {
    const normQuery = stripVietnamese(query);
    const normTopic = topic ? stripVietnamese(topic) : '';
    const tokens = normQuery
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !KB_STOP_WORDS.has(t));
    const paddedQuery = ` ${normQuery} `;

    const scored = SYSTEM_KB_SECTIONS.map((sec) => {
      let score = 0;
      if (normTopic && sec.topic === normTopic) score += 8;
      const hay = stripVietnamese(`${sec.title} ${sec.keywords.join(' ')} ${sec.content}`);
      const normTitle = stripVietnamese(sec.title);
      for (const kw of sec.keywords) {
        const cleanKw = stripVietnamese(kw);
        if (!cleanKw) continue;
        if (paddedQuery.includes(` ${cleanKw} `) || (cleanKw.length >= 4 && normQuery.includes(cleanKw))) {
          score += cleanKw.includes(' ') ? 8 : 4;
        }
      }
      for (const tok of tokens) {
        if (normTitle.includes(tok)) score += 2.5;
        else if (hay.includes(tok)) score += 1;
      }
      return { sec, score };
    })
      .filter((item) => item.score >= 3.5)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, Math.max(1, limit)).map((s) => s.sec);
  }
}
