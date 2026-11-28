export type SemanticEntityKey =
  | 'product'
  | 'hour'
  | 'staff'
  | 'table'
  | 'order'
  | 'cashflow'
  | 'inventory'
  | 'qr'
  | 'discount'
  | 'kitchen'
  | 'schedule'
  | 'payroll'
  | 'revenue'
  | 'profit'
  | 'void'
  | 'audit';

export type SemanticMetricKey =
  | 'popularity_high'
  | 'popularity_low'
  | 'revenue_high'
  | 'revenue_low'
  | 'density_high'
  | 'density_low'
  | 'void_action'
  | 'status_active'
  | 'recent_list'
  | 'count_query';

export type SemanticIntentId =
  | 'product_top_revenue'
  | 'product_list_revenue'
  | 'product_slow_popularity'
  | 'product_top_popularity'
  | 'product_list_popularity'
  | 'hour_peak_density'
  | 'hour_quiet_density'
  | 'staff_top_void'
  | 'staff_top_orders'
  | 'order_top_value'
  | 'recent_orders'
  | 'order_count'
  | 'table_live_status'
  | 'period_comparison'
  | 'fast_path_overview'
  | 'fast_path_revenue'
  | 'fast_path_profit'
  | 'fast_path_cashflow'
  | 'fast_path_qr'
  | 'fast_path_kitchen'
  | 'fast_path_inventory'
  | 'fast_path_discounts'
  | 'fast_path_voids'
  | 'fast_path_audit'
  | 'fast_path_schedule'
  | 'fast_path_payroll'
  | 'system_docs';

export interface SemanticIntentSpec {
  readonly version: number;
  readonly description: string;
  readonly botAliases: readonly string[];
  readonly negativeGuards: ReadonlyArray<{
    readonly id: string;
    readonly phrases: readonly string[];
  }>;
  readonly personaRules: ReadonlyArray<{
    readonly mode: 'em_anh_chi' | 'em_anh' | 'em_chi' | 'con_co_chu' | 'minh_ban' | 'em_sep';
    readonly botSelf: string;
    readonly userCall: string;
    readonly cues: readonly string[];
  }>;
  readonly defaultPersona: {
    readonly mode: 'em_anh_chi' | 'em_anh' | 'em_chi' | 'con_co_chu' | 'minh_ban' | 'em_sep';
    readonly botSelf: string;
    readonly userCall: string;
  };
  readonly periodRules: ReadonlyArray<{
    readonly period:
      | 'homnay'
      | 'homqua'
      | 'tuan'
      | 'tuantruoc'
      | 'thang'
      | 'thangtruoc'
      | 'nam'
      | '7ngay'
      | '30ngay';
    readonly label: string;
    readonly phrases: readonly string[];
  }>;
  readonly entities: Readonly<
    Record<
      SemanticEntityKey,
      {
        readonly keywords: readonly string[];
        readonly accentDisambiguation?: {
          readonly requireNoneRaw?: readonly string[];
          readonly disqualifyIfRawOnly?: readonly string[];
        };
      }
    >
  >;
  readonly metrics: Readonly<Record<SemanticMetricKey, readonly string[]>>;
  readonly cardinality: {
    readonly superlativeCues: readonly string[];
    readonly listCues: readonly string[];
  };
  readonly systemDocCues: readonly string[];
  readonly intentDefinitions: ReadonlyArray<{
    readonly id: SemanticIntentId;
    readonly description: string;
    readonly requiredPermission: string;
    readonly commandEquivalent: string | null;
    readonly sortBy?: string;
    readonly mode: string;
  }>;
}

/** Canonical TypeScript mirror of `semantic-intents.json` (verified equal in Vitest). */
export const SEMANTIC_INTENT_SPEC: SemanticIntentSpec = {
  version: 1,
  description:
    'Shared deterministic Vietnamese Semantic Intent Grammar & Persona rules for Web POS (TypeScript) and Bot #2 Telegram (Python).',
  botAliases: [
    'lona',
    'lona ai',
    'lona bot',
    'tro ly',
    'tro ly lona',
    'bot oi',
    'bot a',
    'pos_lona_bot',
  ],
  negativeGuards: [
    { id: 'why_reason', phrases: ['tai sao', 'vi sao', 'nguyen nhan', 'ly do gi', 'do dau'] },
    {
      id: 'deep_analysis',
      phrases: ['phan tich chi tiet', 'phan tich sau', 'xu huong', 'du bao', 'du doan', 'nhan dinh'],
    },
    {
      id: 'advisory',
      phrases: ['de xuat', 'goi y cai thien', 'nen lam gi', 'chien luoc', 'tu van giup', 'giai phap'],
    },
  ],
  personaRules: [
    {
      mode: 'con_co_chu',
      botSelf: 'con',
      userCall: 'cô/chú',
      cues: ['goi con la', 'xung con', 'chu oi', 'co oi', 'bac oi', 'goi bang chu', 'goi bang co'],
    },
    {
      mode: 'em_anh',
      botSelf: 'em',
      userCall: 'anh',
      cues: ['anh hoi', 'anh muon', 'anh xem', 'anh can', 'cho anh', 'giup anh', 'xung anh', 'goi anh la'],
    },
    {
      mode: 'em_chi',
      botSelf: 'em',
      userCall: 'chị',
      cues: ['chi hoi', 'chi muon', 'chi xem', 'chi can', 'cho chi', 'giup chi', 'xung chi', 'goi chi la'],
    },
    {
      mode: 'em_sep',
      botSelf: 'em',
      userCall: 'sếp',
      cues: ['sep oi', 'sep hoi', 'cho sep', 'chu quan oi', 'bao cao sep'],
    },
    {
      mode: 'minh_ban',
      botSelf: 'mình',
      userCall: 'bạn',
      cues: ['minh hoi', 'to hoi', 'cau oi', 'xung ban'],
    },
  ],
  defaultPersona: {
    mode: 'em_anh_chi',
    botSelf: 'em',
    userCall: 'anh/chị',
  },
  periodRules: [
    { period: 'homqua', label: 'Hôm qua', phrases: ['hom qua', 'hqua', 'ngay hom qua'] },
    { period: 'tuantruoc', label: 'Tuần trước', phrases: ['tuan truoc', 'tuan roi'] },
    { period: 'thangtruoc', label: 'Tháng trước', phrases: ['thang truoc', 'thang roi'] },
    { period: '30ngay', label: '30 ngày gần nhất', phrases: ['30 ngay', 'ba muoi ngay', 'thang qua'] },
    { period: '7ngay', label: '7 ngày gần nhất', phrases: ['7 ngay', 'bay ngay', 'tuan qua'] },
    { period: 'tuan', label: 'Tuần này', phrases: ['tuan nay', 'trong tuan', 'ca tuan'] },
    { period: 'thang', label: 'Tháng này', phrases: ['thang nay', 'trong thang', 'ca thang'] },
    { period: 'nam', label: 'Năm nay', phrases: ['nam nay', 'trong nam', 'ca nam'] },
    {
      period: 'homnay',
      label: 'Hôm nay',
      phrases: ['hom nay', 'hnay', 'ngay nay', 'sang nay', 'trua nay', 'chieu nay', 'toi nay', 'ca nay'],
    },
  ],
  entities: {
    product: {
      keywords: [
        'mon an',
        'do an',
        'do uong',
        'thuc uong',
        'mon nuoc',
        'san pham',
        'best seller',
        'bestseller',
        'mi cay',
        'tra sua',
        'tra chanh',
        'top mon',
        'nhung mon',
        'cac mon',
        'may mon',
        'mon nao',
        'mon gi',
        'mon',
      ],
      accentDisambiguation: {
        requireNoneRaw: ['môn học', 'môn thể thao'],
      },
    },
    hour: {
      keywords: [
        'khung gio',
        'gio nao',
        'may gio',
        'thoi diem nao',
        'thoi diem',
        'buoi nao',
        'gio cao diem',
        'gio vang',
        'gio dong',
        'luc nao',
        'gio',
      ],
    },
    staff: {
      keywords: [
        'thu ngan',
        'nhan vien',
        'nhan su',
        'ai la nguoi',
        'ai huy',
        'ai ban',
        'ai tao',
        'ban nao',
        'nguoi nao',
        'nhan vien nao',
      ],
    },
    table: {
      keywords: [
        'ban an',
        'ban so',
        'may ban',
        'ban trong',
        'ban dang',
        'cho ngoi',
        'mang ve',
        'ban nao',
        'cac ban',
        'so ban',
        'phong ban',
      ],
      accentDisambiguation: {
        disqualifyIfRawOnly: [
          'bán chạy',
          'bán nhiều',
          'bán chậm',
          'bán ít',
          'bán được',
          'bán hàng',
        ],
      },
    },
    order: {
      keywords: [
        'hoa don',
        'don hang',
        'don mang ve',
        'don tai ban',
        'don tai quan',
        'bao nhieu don',
        'may don',
        'so don',
        'tong don',
        'tong so don',
        'cac don',
        'nhung don',
        'mot don',
        '1 don',
        '2 don',
        '3 don',
        '5 don',
        '10 don',
        'ma don',
        'don nao',
        'don gan nhat',
        'don moi nhat',
        'order',
        'bill',
        'phieu tinh tien',
      ],
    },
    cashflow: {
      keywords: [
        'ket tien',
        'chot ca',
        'ket ca',
        'tien mat',
        'tien le',
        'dau ca',
        'kiem ket',
        'chenh lech ket',
        'trong ket',
      ],
    },
    inventory: {
      keywords: [
        'nhap kho',
        'nhap hang',
        'nguyen lieu',
        'ton kho',
        'nha cung cap',
        'phieu nhap',
        'chi phi nhap',
        'nhap nguyen lieu',
        'kho hang',
      ],
    },
    qr: {
      keywords: [
        'vietqr',
        'tai khoan nhan',
        'ngan hang',
        'han muc qr',
        'chuyen khoan qr',
        'ma qr',
        'tai khoan ngan hang',
        'qr',
      ],
    },
    discount: {
      keywords: ['khuyen mai', 'ma giam gia', 'giam gia', 'voucher', 'uu dai', 'ma km'],
    },
    kitchen: {
      keywords: ['tram bep', 'bep nau', 'bep chien', 'pha che', 'gui bep', 'tinh hinh bep', 'bep'],
    },
    schedule: {
      keywords: ['lich truc', 'lich lam viec', 'phan ca', 'di lam', 'truc hom nay', 'ca truc', 'lich ca'],
    },
    payroll: {
      keywords: ['bang luong', 'quy luong', 'tien luong', 'chi phi luong', 'luong nhan vien', 'luong thang'],
    },
    revenue: {
      keywords: ['doanh thu', 'tong thu', 'tien ban hang', 'thu duoc bao nhieu', 'ban duoc bao nhieu'],
    },
    profit: {
      keywords: ['loi nhuan', 'lai rong', 'tien lai', 'lai bao nhieu', 'bien loi nhuan', 'lai lo'],
    },
    void: {
      keywords: ['don huy', 'hoa don huy', 'huy don', 'xoa don', 'bi huy', 'void'],
    },
    audit: {
      keywords: ['nhat ky', 'lich su thao tac', 'ai sua', 'ai xoa', 'audit log'],
    },
  },
  metrics: {
    popularity_high: [
      'ban chay',
      'ban nhieu',
      'ban duoc nhieu',
      'ban dat',
      'goi nhieu',
      'duoc goi nhieu',
      'khach goi nhieu',
      'nguoi goi nhieu',
      'dat nhieu',
      'duoc dat nhieu',
      'khach dat nhieu',
      'order nhieu',
      'duoc order nhieu',
      'khach order nhieu',
      'khach chon nhieu',
      'khach an nhieu',
      'khach uong nhieu',
      'khach mua nhieu',
      'mua nhieu',
      'duoc mua nhieu',
      'an nhieu',
      'uong nhieu',
      'ua chuong',
      'yeu thich',
      'pho bien',
      'thinh hanh',
      'dat hang',
      'hut khach',
      'hot nhat',
      'noi bat',
      'best seller',
      'bestseller',
      'chuong nhat',
      'muon an nhat',
    ],
    popularity_low: [
      'ban cham',
      'ban it',
      'ban duoc it',
      'ban e',
      'it goi',
      'duoc goi it',
      'it nguoi goi',
      'it khach goi',
      'it dat',
      'duoc dat it',
      'it nguoi dat',
      'it khach dat',
      'it order',
      'it khach chon',
      'it ai an',
      'it ai uong',
      'it mua',
      'kem nhat',
      'e nhat',
      'cham nhat',
      'yeu nhat',
      'it nhat',
    ],
    revenue_high: [
      'doanh thu cao',
      'mang lai nhieu tien',
      'thu ve nhieu',
      'thu nhieu',
      'tien nhieu',
      'gia tri cao',
      'kiem nhieu',
      'sinh loi cao',
      'tong tien cao',
      'dat nhat',
      'cao nhat',
    ],
    revenue_low: ['doanh thu thap', 'thu it', 'tien it', 'it doanh thu', 'tong tien thap', 'thap nhat'],
    density_high: [
      'dong nhat',
      'dong khach',
      'dat khach nhat',
      'nhieu don',
      'nhieu khach',
      'cao diem',
      'tap nap',
      'ban ron nhat',
      'qua tai',
      'nhon nhip',
      'on ao nhat',
    ],
    density_low: ['vang nhat', 'vang khach', 'it khach nhat', 'it don nhat', 'thap diem', 'e am'],
    void_action: ['huy nhieu', 'void nhieu', 'bi huy nhieu', 'xoa don nhieu', 'huy don nhieu'],
    status_active: [
      'dang phuc vu',
      'dang mo',
      'con trong',
      'bao nhieu ban',
      'co may ban',
      'hien tai',
      'luc nay',
      'tinh hinh',
      'trang thai',
    ],
    recent_list: ['gan nhat', 'moi nhat', 'vua tao', 'vua len', 'vua thanh toan', 'vua roi'],
    count_query: [
      'bao nhieu',
      'co may',
      'may don',
      'may mon',
      'may ban',
      'so luong',
      'tong so',
      'tong cong',
      'tong don',
      'dem',
    ],
  },
  cardinality: {
    superlativeCues: [
      'nhat',
      'top 1',
      'dung dau',
      'quan quan',
      'so 1',
      'so mot',
      'dau bang',
      'nhieu nhat',
      'it nhat',
      'cao nhat',
      'cham nhat',
      'dong nhat',
      'vang nhat',
      'on dinh nhat',
      'tot nhat',
    ],
    listCues: [
      'danh sach',
      'liet ke',
      'top 3',
      'top 5',
      'top 10',
      'top 15',
      'top 20',
      'nhung mon',
      'cac mon',
      'may mon',
      'bang xep hang',
      'xep hang',
      'xem tat ca',
      'chi tiet cac',
    ],
  },
  systemDocCues: [
    'cach dung',
    'huong dan su dung',
    'huong dan',
    'tinh nang nao',
    'he thong co gi',
    'co may phan he',
    'phan he',
    'module nao',
    'may in',
    'rawbt',
    'imin',
    '80mm',
    'in nhiet',
    '10 quy tac',
    'invariant',
    'hard invariant',
    'kien truc he thong',
    'chot ca hoat dong',
    'cong thuc ket ca',
    'rbac la gi',
    'phan quyen nhu the nao',
    'quang ma qr',
    'wifi',
    'geofencing',
    'mdm la gi',
    'chuyen ban nhu the nao',
    'gop ban nhu the nao',
    'tach don nhu the nao',
    'mang ve nhu the nao',
    'quy tac',
    'tach bep',
    'hoat dong the nao',
    'hoat dong nhu the nao',
    'phan ra',
  ],
  intentDefinitions: [
    {
      id: 'product_top_revenue',
      description: 'Single top revenue product (#1)',
      requiredPermission: 'dashboard.view',
      commandEquivalent: 'topmon',
      sortBy: 'revenue',
      mode: 'single',
    },
    {
      id: 'product_list_revenue',
      description: 'Ranked list of products by revenue',
      requiredPermission: 'dashboard.view',
      commandEquivalent: 'topmon',
      sortBy: 'revenue',
      mode: 'list',
    },
    {
      id: 'product_slow_popularity',
      description: 'Slowest-selling / least-ordered product(s)',
      requiredPermission: 'dashboard.view',
      commandEquivalent: 'topmon',
      sortBy: 'slow',
      mode: 'single',
    },
    {
      id: 'product_top_popularity',
      description: 'Single best-selling / most-ordered product (#1)',
      requiredPermission: 'dashboard.view',
      commandEquivalent: 'topmon',
      sortBy: 'quantity',
      mode: 'single',
    },
    {
      id: 'product_list_popularity',
      description: 'Top selling product leaderboard',
      requiredPermission: 'dashboard.view',
      commandEquivalent: 'topmon',
      sortBy: 'quantity',
      mode: 'list',
    },
    {
      id: 'hour_peak_density',
      description: 'Busiest / peak hour in period',
      requiredPermission: 'dashboard.view',
      commandEquivalent: 'tongquan',
      mode: 'single',
    },
    {
      id: 'hour_quiet_density',
      description: 'Quietest hour in period',
      requiredPermission: 'dashboard.view',
      commandEquivalent: 'tongquan',
      mode: 'single',
    },
    {
      id: 'staff_top_void',
      description: 'Staff with highest void count',
      requiredPermission: 'invoices.view',
      commandEquivalent: 'huy',
      mode: 'single',
    },
    {
      id: 'staff_top_orders',
      description: 'Cashier/staff with most orders processed',
      requiredPermission: 'dashboard.view',
      commandEquivalent: 'tongquan',
      mode: 'single',
    },
    {
      id: 'order_top_value',
      description: 'Highest single order bill',
      requiredPermission: 'invoices.view',
      commandEquivalent: 'don',
      mode: 'single',
    },
    {
      id: 'recent_orders',
      description: 'Most recent orders / takeaway feed',
      requiredPermission: 'invoices.view',
      commandEquivalent: 'don',
      mode: 'list',
    },
    {
      id: 'order_count',
      description: 'Count of orders (optionally filtered by TAKEAWAY / DINE_IN) in period',
      requiredPermission: 'invoices.view',
      commandEquivalent: 'don',
      mode: 'count',
    },
    {
      id: 'table_live_status',
      description: 'Current live table occupancy',
      requiredPermission: 'pos.view',
      commandEquivalent: 'ban',
      mode: 'snapshot',
    },
    {
      id: 'period_comparison',
      description: 'Period-over-period comparison (e.g. today vs yesterday)',
      requiredPermission: 'dashboard.view',
      commandEquivalent: 'tongquan',
      mode: 'comparison',
    },
    {
      id: 'fast_path_overview',
      description: 'Store business overview',
      requiredPermission: 'dashboard.view',
      commandEquivalent: 'tongquan',
      mode: 'report',
    },
    {
      id: 'fast_path_revenue',
      description: 'Revenue breakdown',
      requiredPermission: 'dashboard.view',
      commandEquivalent: 'doanhthu',
      mode: 'report',
    },
    {
      id: 'fast_path_profit',
      description: 'Profit & cost margin breakdown',
      requiredPermission: 'dashboard.viewProfit',
      commandEquivalent: 'loinhuan',
      mode: 'report',
    },
    {
      id: 'fast_path_cashflow',
      description: 'Cash drawer & shift settlement',
      requiredPermission: 'cashflow.view',
      commandEquivalent: 'ket',
      mode: 'report',
    },
    {
      id: 'fast_path_qr',
      description: 'VietQR account quotas & active status',
      requiredPermission: 'paymentQr.view',
      commandEquivalent: 'qr',
      mode: 'report',
    },
    {
      id: 'fast_path_kitchen',
      description: 'Kitchen station output breakdown',
      requiredPermission: 'pos.view',
      commandEquivalent: 'bep',
      mode: 'report',
    },
    {
      id: 'fast_path_inventory',
      description: 'Inventory imports & cost breakdown',
      requiredPermission: 'inventory.view',
      commandEquivalent: 'kho',
      mode: 'report',
    },
    {
      id: 'fast_path_discounts',
      description: 'Discounts & voucher usage breakdown',
      requiredPermission: 'discounts.view',
      commandEquivalent: 'khuyenmai',
      mode: 'report',
    },
    {
      id: 'fast_path_voids',
      description: 'Voided invoices summary',
      requiredPermission: 'invoices.view',
      commandEquivalent: 'huy',
      mode: 'report',
    },
    {
      id: 'fast_path_audit',
      description: 'Recent critical audit log entries',
      requiredPermission: 'rbac.superAdmin',
      commandEquivalent: 'audit',
      mode: 'report',
    },
    {
      id: 'fast_path_schedule',
      description: 'Staff schedule for day/week',
      requiredPermission: 'schedules.self_or_view',
      commandEquivalent: 'lich',
      mode: 'report',
    },
    {
      id: 'fast_path_payroll',
      description: 'Payroll summary for month',
      requiredPermission: 'payroll.view',
      commandEquivalent: 'luong',
      mode: 'report',
    },
    {
      id: 'system_docs',
      description: 'POS / System / Hardware / Business rule manual',
      requiredPermission: 'authenticated',
      commandEquivalent: null,
      mode: 'knowledge',
    },
  ],
};
