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
    id: 'pos_split_kitchen',
    topic: 'pos',
    title: 'Gửi bếp Delta Split & Phân rã COMBO (Invariant 3)',
    keywords: ['tach bep', 'gui bep', 'combo', 'phan ra', 'bep nau', 'bep chien', 'pha che', 'in lai bep', 'printed'],
    content:
      '• Nút "Gửi bếp" (POST /pos/orders/:id/split-kitchen) CHỈ lọc các món có kitchen_status = NEW.\n' +
      '• Món thuộc trạm COMBO tự động được phân rã qua bảng combo_items về đúng trạm vật lý (BEP_NAU, BEP_CHIEN, PHA_CHE) — không bao giờ in chữ "COMBO" xuống bếp.\n' +
      '• Sau khi tạo phiếu 80mm, món chuyển sang PRINTED; bấm lại lần 2 trả về rỗng (idempotent). Muốn in lại phiếu đã in phải dùng nút "In lại phiếu bếp".',
  },
  {
    id: 'pos_takeaway_tables',
    topic: 'pos',
    title: 'Đơn Mang về & Bàn vật lý (Invariant 2 & 5)',
    keywords: ['mang ve', 'takeaway', 'chuyen ban', 'gop ban', 'doi ban', 'ban trong', 'ban ao'],
    content:
      '• Đơn MANG VỀ luôn có table_id = NULL và số takeaway_number tự tăng từ #1 mỗi ngày theo giờ VN (+07:00); bảng dining_tables chỉ chứa bàn vật lý.\n' +
      '• Mọi thao tác Chuyển bàn (MOVE), Gộp bàn (MERGE), Đổi chỗ (SWAP) đều chạy trong transaction với khóa dòng SELECT ... FOR UPDATE.',
  },
  {
    id: 'pos_provisional_checkout',
    topic: 'pos',
    title: 'Tạm tính kèm VietQR vs Thanh toán 2 bước (Invariant 4)',
    keywords: ['tam tinh', 'thanh toan', 'vietqr', 'xoay vong', 'split', 'tien mat', 'chuyen khoan'],
    content:
      '• "In tạm tính" giữ nguyên đơn ở trạng thái SERVING và bàn OCCUPIED, có thể đính kèm mã VietQR động.\n' +
      '• "Thanh toán → Xác nhận" chuyển đơn sang PAID, cộng doanh thu vào tài khoản QR đã dùng và giải phóng bàn về AVAILABLE.',
  },
  {
    id: 'cashflow_settlement',
    topic: 'cashflow',
    title: 'Công thức Kết ca & Tiền két (Invariant 6)',
    keywords: ['ket ca', 'chot ca', 'ket tien', 'expected_cash', 'tien le', 'dau ca', 'chenh lech', 'nhap kho'],
    content:
      '• expected_cash = Tiền đầu ca + Thu tiền mặt (đơn CASH + phần cash_amount của đơn SPLIT có status=PAID) − Phiếu nhập kho nguồn KÉT TIỀN MẶT (CASH_DRAWER, is_deleted=FALSE).\n' +
      '• Tiền chuyển khoản QR và phần transfer_amount KHÔNG cộng vào két tiền mặt; phiếu nhập EXTERNAL KHÔNG trừ vào két; đơn VOIDED không tính.',
  },
  {
    id: 'printer_hardware',
    topic: 'printer',
    title: 'Máy in nhiệt 80mm, RawBT, iMin D3-505 & LAN :9100',
    keywords: ['may in', 'rawbt', 'imin', '80mm', 'in nhiet', 'lan', '9100', 'in bill', 'khong in'],
    content:
      '• Hỗ trợ 3 chế độ: (1) In trình duyệt / Chrome Mobile, (2) Android iMin / RawBT Print Service (gửi chuẩn ESC/POS 80mm qua bridge), (3) Máy in mạng LAN TCP/9100 trực tiếp từ server.\n' +
      '• Cỡ chữ & phông chữ từng loại phiếu (Tạm tính, Hóa đơn, Bếp, Hủy bếp, Chuyển bàn) chỉnh độc lập tại trang Cài đặt (/settings).',
  },
  {
    id: 'rbac_single_session',
    topic: 'rbac',
    title: 'Phân quyền 14 nhóm RBAC & Single-Session 401/403 (Invariant 8 & 9)',
    keywords: ['rbac', 'phan quyen', 'single session', '401', '403', 'dang xuat', 'bi vang', 'bi da', 'giao dien'],
    content:
      '• Mỗi tài khoản chỉ duy trì 1 phiên đăng nhập hiệu lực trên hệ thống (đăng nhập nơi khác hoặc admin thu hồi sẽ nhận mã 401 AUTH_SESSION_REVOKED và đá ra màn hình Login).\n' +
      '• Thiếu quyền thao tác trả về 403 RBAC_PERMISSION_DENIED (vẫn giữ phiên đăng nhập).\n' +
      '• Khi Đăng xuất: cache & token bị xóa nhưng tùy chọn giao diện cá nhân (ui_preferences: theme, tỷ lệ hiển thị, sắp xếp menu) được giữ lại (Invariant 9).',
  },
  {
    id: 'qr_geofence_and_rotation',
    topic: 'qr',
    title: 'Khách quét mã QR tại bàn & Xoay vòng hạn mức VietQR',
    keywords: ['qr', 'quang ma', 'wifi', 'geofencing', 'vi tri', 'han muc', 'ngay', 'thang', 'xoay vong'],
    content:
      '• Có thể bật kiểm tra Wi-Fi quán hoặc Geofencing GPS khi khách quét QR đặt món để chống đặt đơn giả từ xa.\n' +
      '• Nhiều tài khoản ngân hàng VietQR được ưu tiên theo priority và tự xoay vòng sang tài khoản tiếp theo khi gần chạm/đầy hạn mức ngày, tháng hoặc năm.',
  },
];

@Injectable()
export class SystemKbService {
  searchDocs(query: string, topic?: string | null, limit = 2): KnowledgeSection[] {
    const normQuery = stripVietnamese(query);
    const normTopic = topic ? stripVietnamese(topic) : '';
    const tokens = normQuery.split(/\s+/).filter((t) => t.length >= 2);

    const scored = SYSTEM_KB_SECTIONS.map((sec) => {
      let score = 0;
      if (normTopic && sec.topic === normTopic) score += 5;
      const hay = stripVietnamese(`${sec.title} ${sec.keywords.join(' ')} ${sec.content}`);
      for (const kw of sec.keywords) {
        if (normQuery.includes(kw)) score += kw.includes(' ') ? 6 : 3;
      }
      for (const tok of tokens) {
        if (hay.includes(tok)) score += 1;
      }
      return { sec, score };
    })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    const picked = (scored.length > 0 ? scored.map((s) => s.sec) : [SYSTEM_KB_SECTIONS[0]!, SYSTEM_KB_SECTIONS[3]!]);
    return picked.slice(0, Math.max(1, limit));
  }
}
