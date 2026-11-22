export const SystemErrorCodeValues = [
  '400',
  '401',
  '403',
  '404',
  '405',
  '408',
  '409',
  '413',
  '415',
  '422',
  '429',
  '500',
  '502',
  '503',
  '504',
  'NETWORK_ERROR',
  'CHUNK_LOAD_ERROR',
  'RUNTIME_CRASH',
] as const;

export type SystemErrorCodeKey = (typeof SystemErrorCodeValues)[number];

export type SystemErrorSeverity = 'warning' | 'danger' | 'info';

export interface HttpErrorCatalogEntry {
  readonly key: SystemErrorCodeKey;
  readonly httpStatus: number | null;
  readonly statusLabel: string;
  readonly messageKey: `error.http.${SystemErrorCodeKey}`;
  readonly severity: SystemErrorSeverity;
  readonly defaultTitle: string;
  readonly defaultDescription: string;
  readonly recoveryHint: string;
  readonly guestTitle: string;
  readonly guestDescription: string;
  readonly guestRecoveryHint: string;
}

export const HTTP_ERROR_CATALOG: readonly HttpErrorCatalogEntry[] = [
  {
    key: '400',
    httpStatus: 400,
    statusLabel: '400 Bad Request',
    messageKey: 'error.http.400',
    severity: 'warning',
    defaultTitle: 'Yêu cầu không hợp lệ (400)',
    defaultDescription: 'Tham số hoặc dữ liệu gửi lên không đúng cấu trúc hệ thống mong đợi.',
    recoveryHint: 'Kiểm tra lại thao tác vừa thực hiện, tải lại trang hoặc quay về màn hình trước.',
    guestTitle: 'Yêu cầu đặt món chưa hợp lệ',
    guestDescription: 'Thông tin món hoặc lựa chọn đi kèm chưa khớp với thực đơn hiện tại.',
    guestRecoveryHint: 'Vui lòng tải lại thực đơn và chọn lại món cần gọi.',
  },
  {
    key: '401',
    httpStatus: 401,
    statusLabel: '401 Unauthorized',
    messageKey: 'error.http.401',
    severity: 'warning',
    defaultTitle: 'Chưa đăng nhập hoặc phiên đã hết hạn (401)',
    defaultDescription:
      'Tài khoản chưa được xác thực, phiên làm việc đã hết hạn hoặc bị thu hồi từ quản trị viên.',
    recoveryHint:
      'Vui lòng đăng nhập lại; hệ thống sẽ đưa bạn quay về đúng màn hình vừa thao tác.',
    guestTitle: 'Phiên quét mã QR đã hết hiệu lực',
    guestDescription: 'Mã bàn hoặc phiên gọi món không còn hợp lệ tại thời điểm hiện tại.',
    guestRecoveryHint: 'Quét lại mã QR dán trên bàn hoặc gọi nhân viên hỗ trợ.',
  },
  {
    key: '403',
    httpStatus: 403,
    statusLabel: '403 Forbidden',
    messageKey: 'error.http.403',
    severity: 'danger',
    defaultTitle: '403 — Không đủ quyền truy cập',
    defaultDescription:
      'Tài khoản hiện tại không được phân quyền xem màn hình hoặc thực hiện thao tác này.',
    recoveryHint:
      'Phiên đăng nhập của bạn vẫn được giữ nguyên. Hãy quay lại màn hình được cấp quyền hoặc liên hệ Quản lý.',
    guestTitle: 'Truy cập bị giới hạn ngoài phạm vi quán',
    guestDescription: 'Chức năng gọi món yêu cầu kết nối đúng Wi-Fi hoặc vị trí tại quán.',
    guestRecoveryHint: 'Kết nối Wi-Fi của quán / bật định vị và thử tải lại.',
  },
  {
    key: '404',
    httpStatus: 404,
    statusLabel: '404 Not Found',
    messageKey: 'error.http.404',
    severity: 'info',
    defaultTitle: 'Không tìm thấy trang hoặc dữ liệu (404)',
    defaultDescription:
      'Đường dẫn bạn truy cập không tồn tại, hoặc dữ liệu (bàn, đơn hàng, món ăn, nhân sự) đã bị xoá.',
    recoveryHint: 'Kiểm tra lại đường dẫn URL hoặc bấm nút quay về trang chính của bạn.',
    guestTitle: 'Mã QR bàn không hợp lệ hoặc đã được cấp lại',
    guestDescription: 'Bàn đã đổi mã QR bảo mật mới hoặc liên kết quét bàn không còn tồn tại.',
    guestRecoveryHint: 'Vui lòng quét lại mã QR mới đặt trên bàn hoặc gọi nhân viên hỗ trợ.',
  },
  {
    key: '405',
    httpStatus: 405,
    statusLabel: '405 Method Not Allowed',
    messageKey: 'error.http.405',
    severity: 'warning',
    defaultTitle: 'Thao tác không được phép trên đường dẫn này (405)',
    defaultDescription:
      'Trình duyệt vừa gửi phương thức HTTP không khớp với API (thường do bộ nhớ đệm giao diện cũ).',
    recoveryHint: 'Tải lại trang để đồng bộ phiên bản mới nhất rồi thử lại.',
    guestTitle: 'Phiên thực đơn cần được làm mới',
    guestDescription: 'Trình duyệt vừa gửi yêu cầu không còn tương thích với máy chủ.',
    guestRecoveryHint: 'Bấm "Tải lại thực đơn" để cập nhật trang.',
  },
  {
    key: '408',
    httpStatus: 408,
    statusLabel: '408 Request Timeout',
    messageKey: 'error.http.408',
    severity: 'warning',
    defaultTitle: 'Hết thời gian chờ phản hồi từ máy chủ (408)',
    defaultDescription:
      'Kết nối mạng yếu hoặc máy chủ đang bận khiến yêu cầu không kịp hoàn tất trong 15 giây.',
    recoveryHint: 'Kiểm tra lại kết nối Wi-Fi/mạng nội bộ rồi bấm "Thử tải lại".',
    guestTitle: 'Kết nối mạng hơi chậm',
    guestDescription: 'Thực đơn mất quá nhiều thời gian tải vì sóng mạng yếu.',
    guestRecoveryHint: 'Vui lòng thử bấm tải lại sau vài giây hoặc kiểm tra Wi-Fi.',
  },
  {
    key: '409',
    httpStatus: 409,
    statusLabel: '409 Conflict',
    messageKey: 'error.http.409',
    severity: 'warning',
    defaultTitle: 'Xung đột trạng thái dữ liệu (409)',
    defaultDescription:
      'Dữ liệu vừa được người khác thay đổi ngay trước lúc bạn bấm lưu (ví dụ bàn đã gộp/thanh toán, ca đã kết sổ hoặc mã QR vừa cập nhật).',
    recoveryHint: 'Bấm tải lại để lấy dữ liệu mới nhất rồi kiểm tra lại trước khi thao tác.',
    guestTitle: 'Trạng thái bàn vừa được nhân viên cập nhật',
    guestDescription: 'Thu ngân vừa chuyển bàn, gộp bàn hoặc thanh toán cho phiên gọi món này.',
    guestRecoveryHint: 'Tải lại thực đơn để đồng bộ trạng thái bàn mới nhất.',
  },
  {
    key: '413',
    httpStatus: 413,
    statusLabel: '413 Payload Too Large',
    messageKey: 'error.http.413',
    severity: 'warning',
    defaultTitle: 'Tệp hoặc dữ liệu tải lên quá lớn (413)',
    defaultDescription:
      'Dung lượng ảnh hoặc dữ liệu gửi lên vượt quá giới hạn an toàn mà máy chủ cho phép.',
    recoveryHint: 'Hãy nén ảnh nhỏ hơn (khuyến nghị dưới 2MB) hoặc rút gọn dữ liệu rồi thử lại.',
    guestTitle: 'Dữ liệu gửi lên quá lớn',
    guestDescription: 'Đơn gọi món vượt quá dung lượng cho phép.',
    guestRecoveryHint: 'Vui lòng rút gọn ghi chú món và thử gửi lại.',
  },
  {
    key: '415',
    httpStatus: 415,
    statusLabel: '415 Unsupported Media Type',
    messageKey: 'error.http.415',
    severity: 'warning',
    defaultTitle: 'Định dạng tệp hoặc dữ liệu không được hỗ trợ (415)',
    defaultDescription:
      'Máy chủ không chấp nhận loại tệp gửi lên (ví dụ tệp ảnh SVG hoặc định dạng ngoài danh sách cho phép).',
    recoveryHint: 'Sử dụng ảnh PNG, JPEG hoặc WebP hợp lệ và thử tải lại.',
    guestTitle: 'Định dạng dữ liệu không hợp lệ',
    guestDescription: 'Thiết bị vừa gửi dữ liệu không đúng định dạng thực đơn.',
    guestRecoveryHint: 'Bấm tải lại trang và thử lại.',
  },
  {
    key: '422',
    httpStatus: 422,
    statusLabel: '422 Unprocessable Entity',
    messageKey: 'error.http.422',
    severity: 'warning',
    defaultTitle: 'Dữ liệu nhập chưa đúng quy tắc nghiệp vụ (422)',
    defaultDescription:
      'Một hoặc nhiều trường thông tin không đạt điều kiện kiểm tra (thiếu ô bắt buộc, số tiền/giờ không hợp lệ hoặc sai định dạng).',
    recoveryHint: 'Kiểm tra danh sách lỗi chi tiết bên dưới và chỉnh sửa lại thông tin.',
    guestTitle: 'Thông tin món chọn chưa đầy đủ',
    guestDescription: 'Vui lòng chọn đủ các tuỳ chọn bắt buộc (như cấp độ cay) trước khi gửi đơn.',
    guestRecoveryHint: 'Kiểm tra lại các món trong giỏ hàng và gửi lại.',
  },
  {
    key: '429',
    httpStatus: 429,
    statusLabel: '429 Too Many Requests',
    messageKey: 'error.http.429',
    severity: 'warning',
    defaultTitle: 'Thao tác quá nhanh — Tạm giới hạn tần suất (429)',
    defaultDescription:
      'Thiết bị vừa gửi quá nhiều yêu cầu liên tiếp nên lớp bảo vệ tự động tạm khoá trong ít giây để chống quá tải.',
    recoveryHint: 'Vui lòng chờ bộ đếm kết thúc (vài giây) rồi bấm "Thử lại".',
    guestTitle: 'Bạn vừa gửi yêu cầu quá nhanh',
    guestDescription: 'Để tránh gửi trùng nhiều đơn bếp, hệ thống tạm giới hạn trong vài giây.',
    guestRecoveryHint: 'Vui lòng đợi khoảng 5–10 giây rồi bấm tải lại.',
  },
  {
    key: '500',
    httpStatus: 500,
    statusLabel: '500 Internal Server Error',
    messageKey: 'error.http.500',
    severity: 'danger',
    defaultTitle: 'Lỗi xử lý nội bộ trên máy chủ (500)',
    defaultDescription:
      'Máy chủ vừa gặp sự cố bất ngờ khi xử lý yêu cầu hoặc truy vấn cơ sở dữ liệu.',
    recoveryHint:
      'Bấm "Thử tải lại". Nếu lỗi vẫn lặp lại, hãy sao chép Mã tra cứu (Request ID) ở Chi tiết kỹ thuật và báo cho bộ phận kỹ thuật.',
    guestTitle: 'Hệ thống đang gặp sự cố tạm thời',
    guestDescription: 'Máy chủ chưa xử lý được yêu cầu đặt món lúc này.',
    guestRecoveryHint: 'Vui lòng thử tải lại sau giây lát hoặc gọi nhân viên tại quầy giúp đỡ.',
  },
  {
    key: '502',
    httpStatus: 502,
    statusLabel: '502 Bad Gateway',
    messageKey: 'error.http.502',
    severity: 'danger',
    defaultTitle: 'Không kết nối được tới dịch vụ xử lý API (502)',
    defaultDescription:
      'Cổng trung gian (Proxy/Caddy) chưa nhận được phản hồi từ API Server (có thể backend vừa khởi động lại hoặc bị dừng).',
    recoveryHint: 'Đợi khoảng 5–10 giây cho API Server chạy lại hoàn toàn rồi bấm "Thử tải lại".',
    guestTitle: 'Máy chủ quán đang khởi động lại',
    guestDescription: 'Hệ thống thực đơn vừa tạm ngắt kết nối ngắn để bảo trì.',
    guestRecoveryHint: 'Vui lòng đợi 5–10 giây rồi bấm "Tải lại thực đơn".',
  },
  {
    key: '503',
    httpStatus: 503,
    statusLabel: '503 Service Unavailable',
    messageKey: 'error.http.503',
    severity: 'danger',
    defaultTitle: 'Máy chủ đang bảo trì hoặc quá tải tạm thời (503)',
    defaultDescription:
      'Dịch vụ chưa sẵn sàng phục vụ yêu cầu mới trong chốc lát do đang cập nhật hoặc quá tải kết nối.',
    recoveryHint: 'Chờ ít giây rồi bấm "Thử tải lại"; phiên đăng nhập của bạn vẫn được bảo toàn.',
    guestTitle: 'Thực đơn đang tạm bảo trì trong giây lát',
    guestDescription: 'Hệ thống đang cập nhật hoặc lượng khách truy cập cùng lúc cao.',
    guestRecoveryHint: 'Vui lòng đợi giây lát rồi thử lại hoặc gọi nhân viên hỗ trợ.',
  },
  {
    key: '504',
    httpStatus: 504,
    statusLabel: '504 Gateway Timeout',
    messageKey: 'error.http.504',
    severity: 'danger',
    defaultTitle: 'Cổng kết nối quá thời gian phản hồi (504)',
    defaultDescription:
      'Máy chủ trung gian không nhận được câu trả lời kịp thời từ máy chủ xử lý hoặc cơ sở dữ liệu.',
    recoveryHint: 'Kiểm tra kết nối máy chủ rồi bấm "Thử tải lại".',
    guestTitle: 'Kết nối máy chủ bị trễ',
    guestDescription: 'Thực đơn mất quá lâu để phản hồi từ máy chủ quán.',
    guestRecoveryHint: 'Bấm "Tải lại thực đơn" hoặc gọi nhân viên nếu tình trạng kéo dài.',
  },
  {
    key: 'NETWORK_ERROR',
    httpStatus: 0,
    statusLabel: 'Mất kết nối mạng',
    messageKey: 'error.http.NETWORK_ERROR',
    severity: 'warning',
    defaultTitle: 'Mất kết nối mạng hoặc không tới được máy chủ',
    defaultDescription:
      'Thiết bị hiện không có kết nối Wi-Fi/Internet hoặc máy chủ nội bộ chưa bật.',
    recoveryHint:
      'Kiểm tra lại dây mạng / Wi-Fi trên thiết bị. Dữ liệu đang mở vẫn được giữ nguyên; bấm Thử lại khi có mạng.',
    guestTitle: 'Thiết bị đang mất kết nối mạng',
    guestDescription: 'Điện thoại hiện không kết nối được tới máy chủ thực đơn của quán.',
    guestRecoveryHint: 'Vui lòng kiểm tra Wi-Fi/4G rồi bấm "Tải lại thực đơn".',
  },
  {
    key: 'CHUNK_LOAD_ERROR',
    httpStatus: null,
    statusLabel: 'Cập nhật phiên bản',
    messageKey: 'error.http.CHUNK_LOAD_ERROR',
    severity: 'info',
    defaultTitle: 'Ứng dụng vừa được cập nhật phiên bản mới',
    defaultDescription:
      'Trình duyệt đang giữ chỉ mục tệp cũ trong bộ nhớ đệm nên không thể tải mô-đun giao diện vừa mở.',
    recoveryHint: 'Bấm "Tải lại trang" để nạp phiên bản giao diện mới nhất từ máy chủ.',
    guestTitle: 'Thực đơn vừa có bản cập nhật mới',
    guestDescription: 'Vui lòng làm mới trang để tải giao diện thực đơn mới nhất.',
    guestRecoveryHint: 'Bấm "Tải lại thực đơn" để tiếp tục.',
  },
  {
    key: 'RUNTIME_CRASH',
    httpStatus: null,
    statusLabel: 'Lỗi hiển thị',
    messageKey: 'error.http.RUNTIME_CRASH',
    severity: 'danger',
    defaultTitle: 'Giao diện gặp sự cố hiển thị đột xuất',
    defaultDescription:
      'Một thành phần trên màn hình vừa gặp lỗi xử lý bất ngờ phía trình duyệt nên đã được khoanh vùng an toàn.',
    recoveryHint:
      'Bấm "Thử tải lại" hoặc quay về trang chính. Nếu tiếp tục lỗi, hãy copy thông tin ở Chi tiết kỹ thuật.',
    guestTitle: 'Trang thực đơn vừa gặp trục trặc nhỏ',
    guestDescription: 'Trình duyệt tạm thời không hiển thị được phần nội dung này.',
    guestRecoveryHint: 'Bấm "Tải lại thực đơn" hoặc quét lại mã QR để mở lại.',
  },
] as const;

export const HTTP_ERROR_CATALOG_BY_KEY: ReadonlyMap<SystemErrorCodeKey, HttpErrorCatalogEntry> =
  new Map(HTTP_ERROR_CATALOG.map((entry) => [entry.key, entry]));

export function isChunkLoadErrorMessage(rawMessage: string): boolean {
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed|ChunkLoadError|Unable to preload CSS/i.test(
    rawMessage,
  );
}

export function resolveHttpErrorKey(input: {
  statusCode?: number | null;
  code?: string | null;
  isChunkError?: boolean;
  isRuntimeError?: boolean;
}): SystemErrorCodeKey {
  if (input.isChunkError) return 'CHUNK_LOAD_ERROR';
  if (input.code === 'NETWORK_ERROR' || input.statusCode === 0) {
    return 'NETWORK_ERROR';
  }
  if (input.code === 'RATE_LIMIT_EXCEEDED') return '429';
  if (input.code === 'SECURITY_BOT_BLOCKED') return '403';

  if (typeof input.statusCode === 'number') {
    const asKey = String(input.statusCode) as SystemErrorCodeKey;
    if (HTTP_ERROR_CATALOG_BY_KEY.has(asKey)) {
      return asKey;
    }
    if (input.statusCode >= 500) return '500';
    if (input.statusCode >= 400) return '400';
  }

  return input.isRuntimeError ? 'RUNTIME_CRASH' : '500';
}

export function resolveHttpErrorDefinition(input: {
  statusCode?: number | null;
  code?: string | null;
  isChunkError?: boolean;
  isRuntimeError?: boolean;
}): HttpErrorCatalogEntry {
  const key = resolveHttpErrorKey(input);
  return HTTP_ERROR_CATALOG_BY_KEY.get(key)!;
}
