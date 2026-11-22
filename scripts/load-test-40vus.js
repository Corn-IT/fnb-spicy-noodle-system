import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * Kịch bản Load Test 40 VUs (40 khách quét QR đặt món đồng thời trên 30 bàn)
 * Tương thích 100% với Contract của fnb-spicy-noodle-system:
 * - GET  /api/v1/public/menu?token=<64-hex-qrToken>
 * - POST /api/v1/public/orders/qr  ({ qrToken, items: [{ productId, quantity, modifiers, itemNote }] })
 *
 * Cách chạy:
 *   k6 run -e API_URL=http://localhost:3000/api/v1 scripts/load-test-40vus.js
 */
export const options = {
  stages: [
    { duration: '30s', target: 40 }, // Tăng dần lên 40 khách đặt món cùng lúc
    { duration: '2m', target: 40 },  // Duy trì đỉnh 40 khách thao tác liên tục trong 2 phút
    { duration: '20s', target: 0 },  // Giảm tải về 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<150'], // 95% request phải phản hồi nhanh hơn 150ms
    http_req_failed: ['rate<0.01'],   // Tỷ lệ lỗi ngoài dự kiến phải nhỏ hơn 1%
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000/api/v1';

// Tạo mã qrToken 64 ký tự hex chuẩn với seed (tableIndex từ 1..30)
function buildSeededQrToken(tableIndex) {
  const hexSuffix = tableIndex.toString(16).padStart(2, '0');
  return `${'a'.repeat(62)}${hexSuffix}`;
}

export default function () {
  const tableNumber = (__VU % 30) + 1;
  const qrToken = __ENV.QR_TOKEN || buildSeededQrToken(tableNumber);
  const forwardedIp = `10.20.${Math.floor(__VU / 250)}.${(__VU % 250) + 1}`;
  const commonHeaders = {
    'Content-Type': 'application/json',
    'X-Forwarded-For': forwardedIp,
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  };

  // 1. Khách quét QR tải thực đơn (được phục vụ bởi 30s In-Memory Catalog Cache)
  const menuRes = http.get(`${BASE_URL}/public/menu?token=${qrToken}`, {
    headers: commonHeaders,
  });

  check(menuRes, {
    'Tải menu thành công (200) hoặc Rate Limit hợp lệ (429)': (r) =>
      r.status === 200 || r.status === 429,
  });

  sleep(1);

  // 2. Khách bấm gửi đơn đặt Mì cay + Đồ chiên + Nước uống theo đúng CreateQrOrderSchema
  const payload = JSON.stringify({
    qrToken,
    items: [
      {
        productId: 1,
        quantity: 2,
        modifiers: [],
        itemNote: 'Ít hành, cay cấp 1',
      },
    ],
    note: `Đơn k6 VU #${__VU}`,
  });

  const orderRes = http.post(`${BASE_URL}/public/orders/qr`, payload, {
    headers: commonHeaders,
  });

  check(orderRes, {
    'Đặt đơn thành công (201) hoặc bị chặn Rate Limit hợp lệ (429)': (r) =>
      r.status === 201 || r.status === 429,
  });

  sleep(2);
}
