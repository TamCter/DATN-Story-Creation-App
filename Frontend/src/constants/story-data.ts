export interface StoryNode {
  id: string;
  name: string;
  type: 'character' | 'item' | 'faction' | 'event' | 'location';
  role: string;
  desc: string;
  x: number;
  y: number;
  subType?: string;
}

export interface StoryLink {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: 'solid' | 'dashed';
}

export interface StoryProject {
  id: string;
  number: string;
  title: string;
  genre: string;
  nodeCount: number;
  linkCount: number;
  updatedAt: string;
  nodes: StoryNode[];
  links: StoryLink[];
}

export const NODE_TYPE_CONFIG = {
  character: {
    label: 'Nhân vật',
    color: '#e5a93c',
    glowColor: 'rgba(229, 169, 60, 0.3)',
    symbol: '●',
    badgeText: 'NHÂN VẬT',
  },
  item: {
    label: 'Vật phẩm',
    color: '#42b883',
    glowColor: 'rgba(66, 184, 131, 0.3)',
    symbol: '◆',
    badgeText: 'VẬT PHẨM',
  },
  faction: {
    label: 'Phe phái',
    color: '#d95a38',
    glowColor: 'rgba(217, 90, 56, 0.3)',
    symbol: '⬡',
    badgeText: 'PHE PHÁI',
  },
  event: {
    label: 'Sự kiện',
    color: '#5b8ec2',
    glowColor: 'rgba(91, 142, 194, 0.3)',
    symbol: '■',
    badgeText: 'SỰ KIỆN',
  },
  location: {
    label: 'Địa điểm',
    color: '#9f70cf',
    glowColor: 'rgba(159, 112, 207, 0.3)',
    symbol: '▲',
    badgeText: 'ĐỊA ĐIỂM',
  },
} as const;

export const INITIAL_PROJECTS: StoryProject[] = [
  {
    id: 'project-1',
    number: '№ 01',
    title: 'Hoàng Hôn Kiếm Vương',
    genre: 'Kiếm hiệp · Huyền huyễn',
    nodeCount: 10,
    linkCount: 12,
    updatedAt: '2 giờ trước',
    nodes: [
      {
        id: 'lang-tieu',
        name: 'Lăng Tiêu',
        type: 'character',
        role: 'CHÍNH DIỆN',
        subType: 'KIẾM KHÁCH',
        desc: 'Kiếm khách phiêu bạt, người nắm giữ bí mật về Kiếm Hoàng Hôn.',
        x: 185,
        y: 355,
      },
      {
        id: 'trieu-vo-cuc',
        name: 'Triệu Vô Cực',
        type: 'character',
        role: 'PHẢN DIỆN',
        subType: 'MINH CHỦ',
        desc: 'Minh chủ Thiên Hạ Minh, người từng là huynh đệ kết nghĩa của Lăng Tiêu.',
        x: 295,
        y: 195,
      },
      {
        id: 'moc-lan',
        name: 'Mộc Lan',
        type: 'character',
        role: 'ĐỒNG MINH',
        subType: 'Y SƯ',
        desc: 'Truyền nhân của Bạch Liên Cốc, y thuật cao minh và tinh thông thảo dược.',
        x: 100,
        y: 215,
      },
      {
        id: 'bach-lien-coc',
        name: 'Bạch Liên Cốc',
        type: 'faction',
        role: 'TRUNG LẬP',
        subType: 'ẨN THẾ MÔN PHÁI',
        desc: 'Môn phái y dược độc lập giữa chốn võ lâm hỗn loạn.',
        x: 75,
        y: 375,
      },
      {
        id: 'thien-ha-minh',
        name: 'Thiên Hạ Minh',
        type: 'faction',
        role: 'ĐỐI ĐỊCH',
        subType: 'ĐỆ NHẤT THẾ LỰC',
        desc: 'Minh chủ thống lĩnh 72 lộ hào kiệt Trung Nguyên xưng bá giang hồ.',
        x: 305,
        y: 335,
      },
      {
        id: 'dem-hoa-thieu',
        name: 'Đêm Hỏa Thiêu Sơn Trang',
        type: 'event',
        role: 'BIẾN CỐ LỊCH SỬ',
        subType: 'THẢM KỊCH',
        desc: 'Bi kịch thảm sát mở ra mối huyết hải thâm thù 10 năm trước.',
        x: 140,
        y: 495,
      },
      {
        id: 'hoi-the-nguyet-ha',
        name: 'Hội Thề Nguyệt Hạ',
        type: 'event',
        role: 'QUÁ KHỨ',
        subType: 'KẾT NGHĨA',
        desc: 'Lời thề kết nghĩa giữa Lăng Tiêu và Triệu Vô Cực dưới trăng rằm.',
        x: 230,
        y: 595,
      },
      {
        id: 'kiem-hoang-hon',
        name: 'Kiếm Hoàng Hôn',
        type: 'item',
        role: 'THẦN BINH CỔ ĐẠI',
        subType: 'BẢO VẬT',
        desc: 'Thanh kiếm táng tích hoàng hôn vạn năm, ẩn chứa kiếm ý vô thượng.',
        x: 275,
        y: 470,
      },
      {
        id: 'han-nguyet-thanh',
        name: 'Hàn Nguyệt Thành',
        type: 'location',
        role: 'BIÊN ẢI',
        subType: 'THÀNH CỔ',
        desc: 'Tòa thành cổ tuyết phủ quanh năm, nơi lưu đày các kiếm khách lưu vong.',
        x: 115,
        y: 630,
      },
      {
        id: 'vuc-vong-hon',
        name: 'Vực Vọng Hồn',
        type: 'location',
        role: 'HIỂM ĐỊA',
        subType: 'CẤM ĐỊA TỬ VONG',
        desc: 'Hẻm vực sâu vạn trượng ngăn cách Trung Nguyên và Man Tộc.',
        x: 330,
        y: 590,
      },
    ],
    links: [
      { id: 'l1', source: 'lang-tieu', target: 'trieu-vo-cuc', label: 'huynh đệ cũ', type: 'solid' },
      { id: 'l2', source: 'lang-tieu', target: 'trieu-vo-cuc', label: 'chủ mưu', type: 'solid' },
      { id: 'l3', source: 'trieu-vo-cuc', target: 'thien-ha-minh', label: 'lãnh đạo', type: 'solid' },
      { id: 'l4', source: 'lang-tieu', target: 'dem-hoa-thieu', type: 'solid' },
      { id: 'l5', source: 'lang-tieu', target: 'moc-lan', type: 'dashed' },
      { id: 'l6', source: 'lang-tieu', target: 'bach-lien-coc', type: 'dashed' },
      { id: 'l7', source: 'moc-lan', target: 'trieu-vo-cuc', type: 'dashed' },
      { id: 'l8', source: 'bach-lien-coc', target: 'lang-tieu', type: 'dashed' },
      { id: 'l9', source: 'thien-ha-minh', target: 'kiem-hoang-hon', type: 'dashed' },
      { id: 'l10', source: 'lang-tieu', target: 'kiem-hoang-hon', type: 'dashed' },
      { id: 'l11', source: 'dem-hoa-thieu', target: 'han-nguyet-thanh', type: 'dashed' },
      { id: 'l12', source: 'kiem-hoang-hon', target: 'hoi-the-nguyet-ha', type: 'dashed' },
      { id: 'l13', source: 'kiem-hoang-hon', target: 'vuc-vong-hon', type: 'dashed' },
    ],
  },
  {
    id: 'project-2',
    number: '№ 02',
    title: 'Thư Viện Của Những Con Sóng',
    genre: 'Viễn tưởng · Tâm lý',
    nodeCount: 3,
    linkCount: 2,
    updatedAt: 'Hôm qua',
    nodes: [
      {
        id: 's1',
        name: 'Trạm Vũ Trụ Hải Nguyệt',
        type: 'location',
        role: 'TRUNG TÂM',
        desc: 'Trạm nghiên cứu trôi dạt trên bề mặt đại dương sao Mộc.',
        x: 100,
        y: 250,
      },
      {
        id: 's2',
        name: 'Tiến Sĩ An',
        type: 'character',
        role: 'CHÍNH DIỆN',
        desc: 'Nhà hải dương học không gian đơn độc ghi chép ký ức sóng.',
        x: 190,
        y: 180,
      },
      {
        id: 's3',
        name: 'Cuốn Nhật Ký Thủy Tinh',
        type: 'item',
        role: 'BẢO VẬT',
        desc: 'Vật thể chứa tín hiệu sóng âm từ nền văn minh đã mất.',
        x: 270,
        y: 240,
      },
    ],
    links: [
      { id: 'sl1', source: 's2', target: 's1', label: 'cư trú' },
      { id: 'sl2', source: 's2', target: 's3', label: 'giải mã' },
    ],
  },
  {
    id: 'project-3',
    number: '№ 03',
    title: 'Mười Hai Mùa Mưa',
    genre: 'Tình cảm · Đời thường',
    nodeCount: 1,
    linkCount: 0,
    updatedAt: '3 tuần trước',
    nodes: [
      {
        id: 'm1',
        name: 'Quán Cà Phê Mưa Phùn',
        type: 'location',
        role: 'ĐỊA ĐIỂM',
        desc: 'Nơi hai người vô tình gặp lại sau 12 năm chia cách.',
        x: 190,
        y: 240,
      },
    ],
    links: [],
  },
];
