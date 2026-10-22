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

export interface StoryTag {
  name: string;
  type: StoryNode['type'];
  symbol: string;
  color: string;
}

export interface StoryTimelineEvent {
  id: string;
  chapter: string;
  title: string;
  desc: string;
  tags: StoryTag[];
}

export interface ChapterEvent {
  id: string;
  title: string;
  desc: string;
}

export interface StoryChapter {
  id: string;
  chapterNumber: number;
  code: string;
  title: string;
  shortTitle: string;
  watermark: string;
  desc: string;
  events: ChapterEvent[];
  nodes: StoryNode[];
  links: StoryLink[];
}

export interface StoryLocationItem {
  id: string;
  name: string;
  region: string;
  desc: string;
}

export interface StoryProject {
  id: string;
  userId?: string;
  desc?: string;
  number: string;
  title: string;
  genre: string;
  nodeCount: number;
  linkCount: number;
  updatedAt: string;
  nodes: StoryNode[];
  links: StoryLink[];
  events?: StoryTimelineEvent[];
  locations?: StoryLocationItem[];
  chapters?: StoryChapter[];
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
    nodeCount: 11,
    linkCount: 14,
    updatedAt: 'Vừa xong',
    nodes: [
      {
        id: 'lang-tieu',
        name: 'Lăng Tiêu',
        type: 'character',
        role: 'NHÂN VẬT CHÍNH',
        subType: 'KIẾM KHÁCH',
        desc: 'Kiếm sĩ lưu vong, mang trong mình mảnh vỡ của thanh Hoàng Hôn. Trầm lặng, không tin lời thề.',
        x: 185,
        y: 355,
      },
      {
        id: 'moc-lan',
        name: 'Mộc Lan',
        type: 'character',
        role: 'ĐỒNG HÀNH',
        subType: 'Y SƯ',
        desc: 'Y sư của Bạch Liên Cốc, giữ bí mật về cái chết của sư phụ Lăng Tiêu.',
        x: 100,
        y: 215,
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
        id: 'kiem-hoang-hon',
        name: 'Kiếm Hoàng Hôn',
        type: 'item',
        role: '7 MẢNH',
        subType: 'BẢO VẬT',
        desc: 'Thanh kiếm vỡ làm bảy mảnh. Mỗi mảnh nhớ một chủ nhân đã chết bởi nó.',
        x: 275,
        y: 470,
      },
      {
        id: 'thien-ha-minh',
        name: 'Thiên Hạ Minh',
        type: 'faction',
        role: 'CHÍNH PHÁI',
        subType: 'ĐỆ NHẤT THẾ LỰC',
        desc: 'Liên minh võ lâm do Triệu Vô Cực đứng đầu, bề ngoài chính nghĩa.',
        x: 305,
        y: 335,
      },
      {
        id: 'bach-lien-coc',
        name: 'Bạch Liên Cốc',
        type: 'faction',
        role: 'TRUNG LẬP',
        subType: 'ẨN THẾ MÔN PHÁI',
        desc: 'Môn phái y thuật ẩn cư, trung lập, đang bị Thiên Hạ Minh dò xét.',
        x: 75,
        y: 375,
      },
      {
        id: 'dem-hoa-thieu',
        name: 'Đêm Hỏa Thiêu Sơn Trang',
        type: 'event',
        role: 'CHƯƠNG 1',
        subType: 'THẢM KỊCH',
        desc: 'Sơn trang họ Lăng bị thiêu rụi. Chỉ Lăng Tiêu sống sót, tay còn cầm chuôi kiếm gãy.',
        x: 140,
        y: 495,
      },
      {
        id: 'cuoc-chay-tron',
        name: 'Cuộc Chạy Trốn Trong Mưa',
        type: 'event',
        role: 'CHƯƠNG 1',
        subType: 'SINH TỒN',
        desc: 'Lăng Tiêu băng qua rừng trong mưa, bị truy sát đến tận biên giới phía Bắc.',
        x: 48,
        y: 460,
      },
      {
        id: 'hoi-the-nguyet-ha',
        name: 'Hội Thề Nguyệt Hạ',
        type: 'event',
        role: 'CHƯƠNG 3',
        subType: 'KẾT NGHĨA',
        desc: 'Buổi họp mặt lớn nhất của võ lâm, nơi mảnh kiếm đầu tiên xuất hiện.',
        x: 230,
        y: 595,
      },
      {
        id: 'han-nguyet-thanh',
        name: 'Hàn Nguyệt Thành',
        type: 'location',
        role: 'PHƯƠNG BẮC',
        subType: 'THÀNH CỔ',
        desc: 'Thành cảng lạnh giá ở biên giới phía Bắc, nơi giao thương và gián điệp trà trộn.',
        x: 115,
        y: 630,
      },
      {
        id: 'vuc-vong-hon',
        name: 'Vực Vọng Hồn',
        type: 'location',
        role: 'HIỂM ĐỊA',
        subType: 'CẤM ĐỊA TỬ VONG',
        desc: 'Vách đá nơi bảy mảnh kiếm được cho là đã rơi xuống.',
        x: 330,
        y: 590,
      },
    ],
    events: [
      {
        id: 'event-1',
        chapter: 'CHƯƠNG 1',
        title: 'Đêm Hỏa Thiêu Sơn Trang',
        desc: 'Sơn trang họ Lăng bị thiêu rụi. Chỉ Lăng Tiêu sống sót, tay còn cầm chuôi kiếm gãy.',
        tags: [
          { name: 'Lăng Tiêu', type: 'character', symbol: '●', color: '#e5a93c' },
          { name: 'Triệu Vô Cực', type: 'character', symbol: '●', color: '#e5a93c' },
          { name: 'Hàn Nguyệt Thành', type: 'location', symbol: '▲', color: '#9f70cf' },
        ],
      },
      {
        id: 'event-2',
        chapter: 'CHƯƠNG 3',
        title: 'Hội Thề Nguyệt Hạ',
        desc: 'Buổi họp mặt lớn nhất của võ lâm, nơi mảnh kiếm đầu tiên xuất hiện.',
        tags: [
          { name: 'Kiếm Hoàng Hôn', type: 'item', symbol: '◆', color: '#42b883' },
          { name: 'Thiên Hạ Minh', type: 'faction', symbol: '⬡', color: '#d95a38' },
        ],
      },
    ],
    locations: [
      {
        id: 'loc-1',
        name: 'Hàn Nguyệt Thành',
        region: 'PHƯƠNG BẮC',
        desc: 'Thành cảng lạnh giá ở biên giới phía Bắc, nơi giao thương và gián điệp trà trộn.',
      },
      {
        id: 'loc-2',
        name: 'Vực Vọng Hồn',
        region: 'HIỂM ĐỊA',
        desc: 'Vách đá nơi bảy mảnh kiếm được cho là đã rơi xuống.',
      },
    ],
    links: [
      { id: 'l1', source: 'lang-tieu', target: 'moc-lan', label: 'tin tưởng', type: 'dashed' },
      { id: 'l2', source: 'lang-tieu', target: 'trieu-vo-cuc', label: 'huynh đệ cũ', type: 'solid' },
      { id: 'l3', source: 'lang-tieu', target: 'kiem-hoang-hon', label: 'sở hữu mảnh', type: 'solid' },
      { id: 'l4', source: 'trieu-vo-cuc', target: 'thien-ha-minh', label: 'lãnh đạo', type: 'solid' },
      { id: 'l5', source: 'moc-lan', target: 'bach-lien-coc', label: 'thuộc về', type: 'dashed' },
      { id: 'l6', source: 'lang-tieu', target: 'dem-hoa-thieu', label: 'sống sót', type: 'solid' },
      { id: 'l7', source: 'trieu-vo-cuc', target: 'dem-hoa-thieu', label: 'chủ mưu', type: 'solid' },
      { id: 'l8', source: 'dem-hoa-thieu', target: 'han-nguyet-thanh', label: 'diễn ra gần', type: 'dashed' },
      { id: 'l9', source: 'kiem-hoang-hon', target: 'vuc-vong-hon', label: 'thất lạc tại', type: 'dashed' },
      { id: 'l10', source: 'hoi-the-nguyet-ha', target: 'kiem-hoang-hon', label: 'lộ diện', type: 'dashed' },
      { id: 'l11', source: 'hoi-the-nguyet-ha', target: 'thien-ha-minh', label: 'tổ chức bởi', type: 'dashed' },
      { id: 'l12', source: 'thien-ha-minh', target: 'bach-lien-coc', label: 'dò xét', type: 'dashed' },
      { id: 'l13', source: 'cuoc-chay-tron', target: 'lang-tieu', label: 'xoay quanh', type: 'dashed' },
      { id: 'l14', source: 'cuoc-chay-tron', target: 'han-nguyet-thanh', label: 'kết thúc ở', type: 'dashed' },
    ],
    chapters: [
      {
        id: 'c1',
        chapterNumber: 1,
        code: 'C1',
        title: 'Tro Tàn',
        shortTitle: 'C1 Tro Tàn',
        watermark: 'TRO TÀN',
        desc: 'Sơn trang họ Lăng cháy rụi; Lăng Tiêu bắt đầu cuộc lưu vong.',
        events: [
          {
            id: 'e1-1',
            title: 'Đêm Hỏa Thiêu Sơn Trang',
            desc: 'Sơn trang họ Lăng bị thiêu rụi. Chỉ Lăng Tiêu sống sót, tay còn cầm chuôi kiếm gãy.',
          },
          {
            id: 'e1-2',
            title: 'Cuộc Chạy Trốn Trong Mưa',
            desc: 'Lăng Tiêu băng qua rừng trong mưa, bị truy sát đến tận biên giới phía Bắc.',
          },
        ],
        nodes: [
          {
            id: 'trieu-vo-cuc',
            name: 'Triệu Vô Cực',
            type: 'character',
            role: 'PHẢN DIỆN',
            subType: 'MINH CHỦ',
            desc: 'Minh chủ Thiên Hạ Minh, người từng là huynh đệ kết nghĩa của Lăng Tiêu.',
            x: 295,
            y: 205,
          },
          {
            id: 'lang-tieu',
            name: 'Lăng Tiêu',
            type: 'character',
            role: 'NHÂN VẬT CHÍNH',
            subType: 'KIẾM KHÁCH',
            desc: 'Kiếm sĩ lưu vong, mang trong mình mảnh vỡ của thanh Hoàng Hôn. Trầm lặng, không tin lời thề.',
            x: 190,
            y: 335,
          },
          {
            id: 'dem-hoa-thieu',
            name: 'Đêm Hỏa Thiêu Sơn Trang',
            type: 'event',
            role: 'CHƯƠNG 1',
            subType: 'THẢM KỊCH',
            desc: 'Sơn trang họ Lăng bị thiêu rụi. Chỉ Lăng Tiêu sống sót, tay còn cầm chuôi kiếm gãy.',
            x: 145,
            y: 445,
          },
          {
            id: 'cuoc-chay-tron',
            name: 'Cuộc Chạy Trốn Trong Mưa',
            type: 'event',
            role: 'CHƯƠNG 1',
            subType: 'SINH TỒN',
            desc: 'Lăng Tiêu băng qua rừng trong mưa, bị truy sát đến tận biên giới phía Bắc.',
            x: 48,
            y: 460,
          },
          {
            id: 'han-nguyet-thanh',
            name: 'Hàn Nguyệt Thành',
            type: 'location',
            role: 'PHƯƠNG BẮC',
            subType: 'THÀNH CỔ',
            desc: 'Thành cảng lạnh giá ở biên giới phía Bắc, nơi giao thương và gián điệp trà trộn.',
            x: 110,
            y: 565,
          },
        ],
        links: [
          { id: 'c1-l1', source: 'lang-tieu', target: 'trieu-vo-cuc', label: 'huynh đệ cũ', type: 'dashed' },
          { id: 'c1-l2', source: 'trieu-vo-cuc', target: 'cuoc-chay-tron', label: 'truy sát', type: 'dashed' },
          { id: 'c1-l3', source: 'lang-tieu', target: 'dem-hoa-thieu', label: 'sống sót', type: 'dashed' },
          { id: 'c1-l4', source: 'lang-tieu', target: 'cuoc-chay-tron', label: 'đào tẩu', type: 'dashed' },
          { id: 'c1-l5', source: 'dem-hoa-thieu', target: 'han-nguyet-thanh', label: 'hướng chạy', type: 'dashed' },
          { id: 'c1-l6', source: 'cuoc-chay-tron', target: 'han-nguyet-thanh', label: 'đích đến', type: 'dashed' },
        ],
      },
      {
        id: 'c2',
        chapterNumber: 2,
        code: 'C2',
        title: 'Bạch Liên Ẩn Cư',
        shortTitle: 'C2 Bạch Liên Ẩn Cư',
        watermark: 'BẠCH LIÊN ẨN CƯ',
        desc: 'Lăng Tiêu được Mộc Lan cứu chữa và biết Thiên Hạ Minh đang dò xét.',
        events: [
          {
            id: 'e2-1',
            title: 'Lần Gặp Ở Bạch Liên Cốc',
            desc: 'Mộc Lan băng bó vết thương cho Lăng Tiêu và lần đầu thấy mảnh kiếm.',
          },
        ],
        nodes: [
          {
            id: 'moc-lan',
            name: 'Mộc Lan',
            type: 'character',
            role: 'ĐỒNG HÀNH',
            subType: 'Y SƯ',
            desc: 'Y sư của Bạch Liên Cốc, giữ bí mật về cái chết của sư phụ Lăng Tiêu.',
            x: 115,
            y: 225,
          },
          {
            id: 'lang-tieu',
            name: 'Lăng Tiêu',
            type: 'character',
            role: 'NHÂN VẬT CHÍNH',
            subType: 'KIẾM KHÁCH',
            desc: 'Kiếm sĩ lưu vong, mang trong mình mảnh vỡ của thanh Hoàng Hôn.',
            x: 255,
            y: 245,
          },
          {
            id: 'lan-gap-bach-lien',
            name: 'Lần Gặp Ở Bạch Liên Cốc',
            type: 'event',
            role: 'CHƯƠNG 2',
            subType: 'CỨU CHỮA',
            desc: 'Mộc Lan băng bó vết thương cho Lăng Tiêu và lần đầu thấy mảnh kiếm.',
            x: 185,
            y: 350,
          },
          {
            id: 'bach-lien-coc',
            name: 'Bạch Liên Cốc',
            type: 'faction',
            role: 'TRUNG LẬP',
            subType: 'ẨN THẾ MÔN PHÁI',
            desc: 'Môn phái y thuật ẩn cư, trung lập, đang bị Thiên Hạ Minh dò xét.',
            x: 95,
            y: 470,
          },
          {
            id: 'thien-ha-minh',
            name: 'Thiên Hạ Minh',
            type: 'faction',
            role: 'CHÍNH PHÁI',
            subType: 'ĐỆ NHẤT THẾ LỰC',
            desc: 'Liên minh võ lâm do Triệu Vô Cực đứng đầu, bí mật cho người theo dõi Bạch Liên Cốc.',
            x: 275,
            y: 470,
          },
        ],
        links: [
          { id: 'c2-l1', source: 'lang-tieu', target: 'moc-lan', label: 'cứu mạng', type: 'dashed' },
          { id: 'c2-l2', source: 'moc-lan', target: 'lan-gap-bach-lien', label: 'chữa trị', type: 'dashed' },
          { id: 'c2-l3', source: 'lang-tieu', target: 'lan-gap-bach-lien', label: 'gặp gỡ', type: 'dashed' },
          { id: 'c2-l4', source: 'moc-lan', target: 'bach-lien-coc', label: 'môn đồ', type: 'dashed' },
          { id: 'c2-l5', source: 'thien-ha-minh', target: 'bach-lien-coc', label: 'dò xét', type: 'dashed' },
        ],
      },
      {
        id: 'c3',
        chapterNumber: 3,
        code: 'C3',
        title: 'Nguyệt Hạ',
        shortTitle: 'C3 Nguyệt Hạ',
        watermark: 'NGUYỆT HẠ',
        desc: 'Hội Thề lộ ra mảnh kiếm đầu tiên và buộc hai huynh đệ tương tàn.',
        events: [
          {
            id: 'e3-1',
            title: 'Hội Thề Nguyệt Hạ',
            desc: 'Buổi họp mặt lớn nhất của võ lâm, nơi mảnh kiếm đầu tiên xuất hiện.',
          },
          {
            id: 'e3-2',
            title: 'Huynh Đệ Tương Tàn',
            desc: 'Triệu Vô Cực trở mặt vì bí mật của thanh kiếm, Lăng Tiêu trọng thương phá vây.',
          },
        ],
        nodes: [
          {
            id: 'lang-tieu',
            name: 'Lăng Tiêu',
            type: 'character',
            role: 'NHÂN VẬT CHÍNH',
            subType: 'KIẾM KHÁCH',
            desc: 'Kiếm sĩ lưu vong, mang trong mình mảnh vỡ của thanh Hoàng Hôn.',
            x: 120,
            y: 240,
          },
          {
            id: 'trieu-vo-cuc',
            name: 'Triệu Vô Cực',
            type: 'character',
            role: 'PHẢN DIỆN',
            subType: 'MINH CHỦ',
            desc: 'Minh chủ Thiên Hạ Minh, lộ rõ dã tâm chiếm đoạt trọn bộ kiếm.',
            x: 275,
            y: 220,
          },
          {
            id: 'kiem-hoang-hon',
            name: 'Kiếm Hoàng Hôn',
            type: 'item',
            role: '7 MẢNH',
            subType: 'BẢO VẬT',
            desc: 'Mảnh kiếm đầu tiên xuất hiện dưới ánh trăng rằm.',
            x: 195,
            y: 360,
          },
          {
            id: 'hoi-the-nguyet-ha',
            name: 'Hội Thề Nguyệt Hạ',
            type: 'event',
            role: 'CHƯƠNG 3',
            subType: 'KẾT NGHĨA',
            desc: 'Buổi họp mặt lớn nhất của võ lâm, nơi mảnh kiếm đầu tiên xuất hiện.',
            x: 90,
            y: 480,
          },
          {
            id: 'huynh-de-tuong-tan',
            name: 'Huynh Đệ Tương Tàn',
            type: 'event',
            role: 'CHƯƠNG 3',
            subType: 'BIẾN CỐ',
            desc: 'Triệu Vô Cực trở mặt vì bí mật của thanh kiếm, Lăng Tiêu trọng thương phá vây.',
            x: 290,
            y: 470,
          },
          {
            id: 'vuc-vong-hon',
            name: 'Vực Vọng Hồn',
            type: 'location',
            role: 'HIỂM ĐỊA',
            subType: 'CẤM ĐỊA TỬ VONG',
            desc: 'Vách đá nơi bảy mảnh kiếm được cho là đã rơi xuống.',
            x: 190,
            y: 580,
          },
        ],
        links: [
          { id: 'c3-l1', source: 'lang-tieu', target: 'trieu-vo-cuc', label: 'đoạn tuyệt', type: 'dashed' },
          { id: 'c3-l2', source: 'lang-tieu', target: 'kiem-hoang-hon', label: 'bảo vệ', type: 'dashed' },
          { id: 'c3-l3', source: 'trieu-vo-cuc', target: 'kiem-hoang-hon', label: 'chiếm đoạt', type: 'dashed' },
          { id: 'c3-l4', source: 'kiem-hoang-hon', target: 'hoi-the-nguyet-ha', label: 'xuất hiện', type: 'dashed' },
          { id: 'c3-l5', source: 'trieu-vo-cuc', target: 'huynh-de-tuong-tan', label: 'phản bội', type: 'dashed' },
          { id: 'c3-l6', source: 'lang-tieu', target: 'huynh-de-tuong-tan', label: 'phá vây', type: 'dashed' },
          { id: 'c3-l7', source: 'huynh-de-tuong-tan', target: 'vuc-vong-hon', label: 'rơi xuống', type: 'dashed' },
        ],
      },
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

export function getProjectChapters(project: StoryProject): StoryChapter[] {
  if (project.chapters && project.chapters.length > 0) {
    return project.chapters;
  }
  return [
    {
      id: 'c1',
      chapterNumber: 1,
      code: 'C1',
      title: project.title,
      shortTitle: 'C1 ' + project.title,
      watermark: project.title.toUpperCase(),
      desc: project.genre,
      events: (project.events || []).map((e) => ({
        id: e.id,
        title: e.title,
        desc: e.desc,
      })),
      nodes: project.nodes,
      links: project.links,
    },
  ];
}

