export interface StoryNode {
  id: string;
  name: string;
  type: 'character' | 'item' | 'faction' | 'event' | 'location';
  role: string;
  desc: string;
  x: number;
  y: number;
  subType?: string;
  status?: string;
  // Character fields
  dob?: string;
  age?: string;
  birthplace?: string;
  gender?: string;
  weapon?: string;
  sect?: string;
  personality?: string;
  // Item fields
  rarity?: string;
  origin?: string;
  element?: string;
  power?: string;
  holderOrLocation?: string;
  // Location fields
  region?: string;
  climate?: string;
  terrain?: string;
  dangerLevel?: string;
  ruler?: string;
  // Faction fields
  leader?: string;
  headquarters?: string;
  motto?: string;
  alignment?: string;
  influence?: string;
  // Event fields
  time?: string;
  location?: string;
  chapter?: string;
  impact?: string;
  charactersInvolved?: string;
  characters?: string;
  eventType?: string;
  importance?: string;
  arcName?: string;
  sequenceOrder?: string;
  cause?: string;
  conflict?: string;
  outcome?: string;
  consequences?: string;
  itemsInvolved?: string;
  factionsInvolved?: string;
  characterRoles?: string;
  timelineType?: string;
  duration?: string;
  statusEvent?: string;
  autoCreatedStub?: boolean;
  syncStatus?: 'synced' | 'pending';
  createdAt?: number;
  updatedAt?: number;
}

export function parseEventParticipants(value?: string | string[]): string[] {
  let names: string[] = [];
  if (Array.isArray(value)) {
    names = value;
  } else if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      names = Array.isArray(parsed) ? parsed : value.split(/[,;\n]+/);
    } catch {
      names = value.split(/[,;\n]+/);
    }
  }
  return [...new Set(names.map((name) => String(name).trim()).filter(Boolean))];
}

const OWNED_ITEM_PLACEHOLDER_PATTERN =
  /^(unknown|not known|n\/a|none|null|undefined|không rõ|chưa rõ|không xác định|chưa xác định|không có|trống)$/i;

export function getCharacterOwnedItems(
  character: Pick<StoryNode, 'id' | 'name' | 'weapon'>,
  allNodes: StoryNode[] = [],
  allLinks: StoryLink[] = []
): string[] {
  const charId = (character.id || '').trim();
  const charNameLower = (character.name || '').trim().toLowerCase();
  const itemNodes = allNodes.filter((n) => n.type === 'item');
  const itemById = new Map<string, StoryNode>();
  const itemByNameLower = new Map<string, StoryNode>();
  itemNodes.forEach((item) => {
    itemById.set(item.id, item);
    itemByNameLower.set((item.name || '').trim().toLowerCase(), item);
  });

  const seenLower = new Set<string>();
  const result: string[] = [];
  const addItemName = (raw?: string) => {
    const trimmed = String(raw || '').trim();
    if (!trimmed || OWNED_ITEM_PLACEHOLDER_PATTERN.test(trimmed)) return;
    const matchedNode = itemById.get(trimmed) || itemByNameLower.get(trimmed.toLowerCase());
    const displayName = matchedNode ? matchedNode.name.trim() : trimmed;
    const key = displayName.toLowerCase();
    if (!seenLower.has(key)) {
      seenLower.add(key);
      result.push(displayName);
    }
  };

  parseEventParticipants(character.weapon).forEach(addItemName);

  itemNodes.forEach((item) => {
    const holder = (item.holderOrLocation || '').trim();
    if (!holder) return;
    if ((charNameLower && holder.toLowerCase() === charNameLower) || (charId && holder === charId)) {
      addItemName(item.name);
    }
  });

  allLinks.forEach((link) => {
    const category = (link.category || '').toUpperCase();
    if (category !== 'OWNS' && category !== 'EQUIPPED') return;
    const sourceId = typeof link.source === 'string' ? link.source : (link.source as any)?.id;
    const targetId = typeof link.target === 'string' ? link.target : (link.target as any)?.id;
    if (charId && sourceId === charId && targetId) {
      const targetItem = itemById.get(targetId);
      if (targetItem) {
        addItemName(targetItem.name);
      }
    }
  });

  return result;
}

export function formatDateDDMMYYYY(value?: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^(\d{1,4})[-/](\d{1,2})[-/](\d{1,4})$/);
  if (!match) return trimmed;
  const p1 = parseInt(match[1], 10);
  const p2 = parseInt(match[2], 10);
  const p3 = parseInt(match[3], 10);
  if (match[1].length === 4 || p1 > 31) {
    return `${String(p3).padStart(2, '0')}/${String(p2).padStart(2, '0')}/${String(p1).padStart(4, '0')}`;
  }
  return `${String(p1).padStart(2, '0')}/${String(p2).padStart(2, '0')}/${String(p3).padStart(4, '0')}`;
}

export function getDateSortKey(value?: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^(\d{1,4})[-/](\d{1,2})[-/](\d{1,4})$/);
  if (!match) return trimmed;
  const p1 = parseInt(match[1], 10);
  const p2 = parseInt(match[2], 10);
  const p3 = parseInt(match[3], 10);
  if (match[1].length === 4 || p1 > 31) {
    return `${String(p1).padStart(4, '0')}-${String(p2).padStart(2, '0')}-${String(p3).padStart(2, '0')}`;
  }
  return `${String(p3).padStart(4, '0')}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
}

export function calculateAgeFromDob(dob?: string, referenceDate: Date = new Date()): string {
  const trimmed = String(dob || '').trim();
  if (!trimmed) return '';
  const currentYear = referenceDate.getFullYear();
  const currentMonth = referenceDate.getMonth() + 1;
  const currentDay = referenceDate.getDate();

  const fullMatch = trimmed.match(/^(\d{1,4})[-/](\d{1,2})[-/](\d{1,4})$/);
  if (fullMatch) {
    const p1 = parseInt(fullMatch[1], 10);
    const p2 = parseInt(fullMatch[2], 10);
    const p3 = parseInt(fullMatch[3], 10);
    let year: number;
    let month: number;
    let day: number;
    if (fullMatch[1].length === 4 || p1 > 31) {
      year = p1;
      month = p2;
      day = p3;
    } else {
      day = p1;
      month = p2;
      year = p3;
    }
    if (!Number.isFinite(year) || year <= 0) return '';
    let age = currentYear - year;
    if (currentMonth < month || (currentMonth === month && currentDay < day)) {
      age -= 1;
    }
    return String(Math.max(0, age));
  }

  const yearMatch = trimmed.match(/\b(\d{3,4})\b/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    if (Number.isFinite(year) && year > 0 && year <= currentYear) {
      return String(Math.max(0, currentYear - year));
    }
  }
  return '';
}

export interface StoryLink {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: 'solid' | 'dashed';
  category?: string;
  contextNote?: string;
  tone?: 'loyalty' | 'hostile' | 'possession' | 'sect' | 'event' | 'location';
  autoGenerated?: boolean;
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
  content?: string;
  syncStatus?: 'synced' | 'pending';
  events: ChapterEvent[];
  nodes: StoryNode[];
  links: StoryLink[];
  edges?: StoryLink[];
}

export function eventBelongsToChapter(
  node: Pick<StoryNode, 'id' | 'type' | 'chapter'>,
  chapter: Pick<StoryChapter, 'id' | 'chapterNumber' | 'title' | 'events'>
): boolean {
  if (node.type !== 'event') return false;

  const chapterMembership = node.chapter?.trim().toLocaleLowerCase();
  const chapterLabels = new Set([
    chapter.id,
    chapter.title,
    `Chương ${chapter.chapterNumber}`,
  ].map((label) => label.trim().toLocaleLowerCase()));

  if (chapterMembership) {
    return chapterLabels.has(chapterMembership);
  }

  return false;
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
  edges?: StoryLink[];
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
    label: 'Tổ chức',
    color: '#d95a38',
    glowColor: 'rgba(217, 90, 56, 0.3)',
    symbol: '⬡',
    badgeText: 'TỔ CHỨC',
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

export const CHARACTER_PROFESSIONS = [
  'Phóng viên / Nhà báo',
  'Bác sĩ / Chuyên gia y tế',
  'Điều tra viên / Chuyên viên phân tích',
  'Luật sư / Cố vấn pháp lý',
  'Quản lý / Lãnh đạo',
  'Nhà nghiên cứu / Học giả',
  'Nghệ sĩ / Người sáng tạo',
  'Kỹ sư / Chuyên gia kỹ thuật',
  'Doanh nhân / Nhà đầu tư',
  'Nhân viên an ninh / Bảo vệ',
  'Chính trị gia / Công chức',
  'Nhà hoạt động / Tình nguyện viên',
  'Người sáng lập / Trưởng nhóm',
  'Tư vấn viên / Chuyên gia',
] as const;

export function generateUniqueNodeId(type: StoryNode['type'] | string, existingNodes: StoryNode[] = []): string {
  const prefix = (type ? type.slice(0, 4) : 'node').toLowerCase();
  const existingSet = new Set(existingNodes.map((n) => (n.id || '').toLowerCase()));
  for (let i = 0; i < 100; i++) {
    const timePart = Date.now().toString(36).slice(-4);
    const randPart = Math.random().toString(36).slice(2, 6);
    const candidate = `${prefix}-${timePart}-${randPart}`;
    if (!existingSet.has(candidate)) {
      return candidate;
    }
  }
  return `${prefix}-${Date.now().toString(36)}`;
}

export const INITIAL_PROJECTS: StoryProject[] = [
  {
    id: 'project-1',
    number: '№ 01',
    title: 'Hồ Sơ Hoàng Hôn',
    genre: 'Trinh thám · Tâm lý',
    nodeCount: 11,
    linkCount: 14,
    updatedAt: 'Vừa xong',
    nodes: [
      {
        id: 'lang-tieu',
        name: 'Lăng Tiêu',
        type: 'character',
        role: 'NHÂN VẬT CHÍNH',
        subType: 'PHÓNG VIÊN ĐIỀU TRA',
        desc: 'Phóng viên độc lập đang lần theo dấu vết một vụ việc cũ. Trầm lặng, thận trọng và luôn kiểm chứng thông tin.',
        x: 185,
        y: 355,
      },
      {
        id: 'moc-lan',
        name: 'Mộc Lan',
        type: 'character',
        role: 'ĐỒNG HÀNH',
        subType: 'BÁC SĨ PHÁP Y',
        desc: 'Bác sĩ pháp y tại Viện Bạch Liên, nắm giữ thông tin quan trọng về vụ việc đã khép lại.',
        x: 100,
        y: 215,
      },
      {
        id: 'trieu-vo-cuc',
        name: 'Triệu Vô Cực',
        type: 'character',
        role: 'PHẢN DIỆN',
        subType: 'GIÁM ĐỐC',
        desc: 'Lãnh đạo Tập đoàn Thiên Hạ, từng là cộng sự thân thiết của Lăng Tiêu.',
        x: 295,
        y: 195,
      },
      {
        id: 'kiem-hoang-hon',
        name: 'Hồ Sơ Hoàng Hôn',
        type: 'item',
        role: 'TÀI LIỆU MẬT',
        subType: 'HỒ SƠ',
        desc: 'Bộ hồ sơ bị thất lạc gồm nhiều phần, chứa bằng chứng về một vụ việc chưa được làm sáng tỏ.',
        x: 275,
        y: 470,
      },
      {
        id: 'thien-ha-minh',
        name: 'Tập đoàn Thiên Hạ',
        type: 'faction',
        role: 'ĐỐI LẬP',
        subType: 'DOANH NGHIỆP',
        desc: 'Tập đoàn lớn do Triệu Vô Cực điều hành, có liên quan đến những thông tin bị che giấu.',
        x: 305,
        y: 335,
      },
      {
        id: 'bach-lien-coc',
        name: 'Viện Bạch Liên',
        type: 'faction',
        role: 'TRUNG LẬP',
        subType: 'CƠ SỞ Y TẾ',
        desc: 'Cơ sở y tế nơi Mộc Lan làm việc, đang bị Tập đoàn Thiên Hạ gây sức ép.',
        x: 75,
        y: 375,
      },
      {
        id: 'dem-hoa-thieu',
        name: 'Vụ Cháy Tại Điền Trang',
        type: 'event',
        role: 'CHƯƠNG 1',
        subType: 'VỤ VIỆC',
        desc: 'Một vụ cháy xảy ra tại điền trang nhà họ Lăng. Lăng Tiêu là nhân chứng sống sót duy nhất.',
        x: 140,
        y: 495,
      },
      {
        id: 'cuoc-chay-tron',
        name: 'Cuộc Rời Khỏi Thành Phố',
        type: 'event',
        role: 'CHƯƠNG 1',
        subType: 'TRUY ĐUỔI',
        desc: 'Lăng Tiêu tìm cách rời khỏi thành phố sau khi phát hiện có người theo dõi mình.',
        x: 48,
        y: 460,
      },
      {
        id: 'hoi-the-nguyet-ha',
        name: 'Cuộc Gặp Tại Nguyệt Hạ',
        type: 'event',
        role: 'CHƯƠNG 3',
        subType: 'CUỘC GẶP',
        desc: 'Cuộc gặp giữa các nhân chứng khiến một phần hồ sơ thất lạc bất ngờ xuất hiện.',
        x: 230,
        y: 595,
      },
      {
        id: 'han-nguyet-thanh',
        name: 'Thành phố Bắc Nguyệt',
        type: 'location',
        role: 'ĐỊA ĐIỂM',
        subType: 'THÀNH PHỐ',
        desc: 'Thành phố ven biển nơi các nhân chứng từng sinh sống và làm việc.',
        x: 115,
        y: 630,
      },
      {
        id: 'vuc-vong-hon',
        name: 'Bến Sông Bắc Nguyệt',
        type: 'location',
        role: 'ĐỊA ĐIỂM',
        subType: 'KHU VỰC VEN SÔNG',
        desc: 'Khu vực ven sông nơi một phần bằng chứng được cho là đã bị vứt bỏ.',
        x: 330,
        y: 590,
      },
    ],
    events: [
      {
        id: 'event-1',
        chapter: 'CHƯƠNG 1',
        title: 'Vụ Cháy Tại Điền Trang',
        desc: 'Một vụ cháy xảy ra tại điền trang nhà họ Lăng. Lăng Tiêu là nhân chứng sống sót duy nhất.',
        tags: [
          { name: 'Lăng Tiêu', type: 'character', symbol: '●', color: '#e5a93c' },
          { name: 'Triệu Vô Cực', type: 'character', symbol: '●', color: '#e5a93c' },
          { name: 'Thành phố Bắc Nguyệt', type: 'location', symbol: '▲', color: '#9f70cf' },
        ],
      },
      {
        id: 'event-2',
        chapter: 'CHƯƠNG 3',
        title: 'Cuộc Gặp Tại Nguyệt Hạ',
        desc: 'Cuộc gặp giữa các nhân chứng khiến một phần hồ sơ thất lạc bất ngờ xuất hiện.',
        tags: [
          { name: 'Hồ Sơ Hoàng Hôn', type: 'item', symbol: '◆', color: '#42b883' },
          { name: 'Tập đoàn Thiên Hạ', type: 'faction', symbol: '⬡', color: '#d95a38' },
        ],
      },
    ],
    locations: [
      {
        id: 'loc-1',
        name: 'Thành phố Bắc Nguyệt',
        region: 'VEN BIỂN',
        desc: 'Thành phố ven biển nơi các nhân chứng từng sinh sống và làm việc.',
      },
      {
        id: 'loc-2',
        name: 'Bến Sông Bắc Nguyệt',
        region: 'VEN SÔNG',
        desc: 'Khu vực ven sông nơi một phần bằng chứng được cho là đã bị vứt bỏ.',
      },
    ],
    links: [
      { id: 'l1', source: 'lang-tieu', target: 'moc-lan', label: 'tin tưởng', type: 'dashed' },
      { id: 'l2', source: 'lang-tieu', target: 'trieu-vo-cuc', label: 'cộng sự cũ', type: 'solid' },
      { id: 'l3', source: 'lang-tieu', target: 'kiem-hoang-hon', label: 'đang lưu giữ hồ sơ', type: 'solid' },
      { id: 'l4', source: 'trieu-vo-cuc', target: 'thien-ha-minh', label: 'lãnh đạo', type: 'solid' },
      { id: 'l5', source: 'moc-lan', target: 'bach-lien-coc', label: 'làm việc tại', type: 'dashed' },
      { id: 'l6', source: 'lang-tieu', target: 'dem-hoa-thieu', label: 'sống sót', type: 'solid' },
      { id: 'l7', source: 'trieu-vo-cuc', target: 'dem-hoa-thieu', label: 'chủ mưu', type: 'solid' },
      { id: 'l8', source: 'dem-hoa-thieu', target: 'han-nguyet-thanh', label: 'diễn ra gần', type: 'dashed' },
      { id: 'l9', source: 'kiem-hoang-hon', target: 'vuc-vong-hon', label: 'bị thất lạc tại', type: 'dashed' },
      { id: 'l10', source: 'hoi-the-nguyet-ha', target: 'kiem-hoang-hon', label: 'được phát hiện', type: 'dashed' },
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
        title: 'Dấu Vết Đầu Tiên',
        shortTitle: 'C1 Dấu Vết',
        watermark: 'DẤU VẾT',
        desc: 'Vụ cháy tại điền trang khiến Lăng Tiêu bắt đầu cuộc điều tra riêng.',
        events: [
          {
            id: 'e1-1',
            title: 'Vụ Cháy Tại Điền Trang',
            desc: 'Một vụ cháy xảy ra tại điền trang nhà họ Lăng. Lăng Tiêu là nhân chứng sống sót duy nhất.',
          },
          {
            id: 'e1-2',
            title: 'Cuộc Rời Khỏi Thành Phố',
            desc: 'Lăng Tiêu tìm cách rời khỏi thành phố sau khi phát hiện có người theo dõi mình.',
          },
        ],
        nodes: [
          {
            id: 'trieu-vo-cuc',
            name: 'Triệu Vô Cực',
            type: 'character',
            role: 'PHẢN DIỆN',
            subType: 'GIÁM ĐỐC',
            desc: 'Lãnh đạo Tập đoàn Thiên Hạ, từng là cộng sự thân thiết của Lăng Tiêu.',
            x: 295,
            y: 205,
          },
          {
            id: 'lang-tieu',
            name: 'Lăng Tiêu',
            type: 'character',
            role: 'NHÂN VẬT CHÍNH',
            subType: 'PHÓNG VIÊN ĐIỀU TRA',
            desc: 'Phóng viên độc lập đang lần theo dấu vết một vụ việc cũ. Trầm lặng, thận trọng và luôn kiểm chứng thông tin.',
            x: 190,
            y: 335,
          },
          {
            id: 'dem-hoa-thieu',
            name: 'Vụ Cháy Tại Điền Trang',
            type: 'event',
            role: 'CHƯƠNG 1',
            subType: 'VỤ VIỆC',
            desc: 'Một vụ cháy xảy ra tại điền trang nhà họ Lăng. Lăng Tiêu là nhân chứng sống sót duy nhất.',
            x: 145,
            y: 445,
          },
          {
            id: 'cuoc-chay-tron',
            name: 'Cuộc Rời Khỏi Thành Phố',
            type: 'event',
            role: 'CHƯƠNG 1',
            subType: 'TRUY ĐUỔI',
            desc: 'Lăng Tiêu tìm cách rời khỏi thành phố sau khi phát hiện có người theo dõi mình.',
            x: 48,
            y: 460,
          },
          {
            id: 'han-nguyet-thanh',
            name: 'Thành phố Bắc Nguyệt',
            type: 'location',
            role: 'ĐỊA ĐIỂM',
            subType: 'THÀNH PHỐ',
            desc: 'Thành phố ven biển nơi các nhân chứng từng sinh sống và làm việc.',
            x: 110,
            y: 565,
          },
        ],
        links: [
          { id: 'c1-l1', source: 'lang-tieu', target: 'trieu-vo-cuc', label: 'cộng sự cũ', type: 'dashed' },
          { id: 'c1-l2', source: 'trieu-vo-cuc', target: 'cuoc-chay-tron', label: 'cho người theo dõi', type: 'dashed' },
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
        title: 'Nhân Chứng Mới',
        shortTitle: 'C2 Nhân Chứng',
        watermark: 'NHÂN CHỨNG',
        desc: 'Lăng Tiêu gặp Mộc Lan và biết Tập đoàn Thiên Hạ đang gây sức ép lên Viện Bạch Liên.',
        events: [
          {
            id: 'e2-1',
            title: 'Cuộc Gặp Tại Viện Bạch Liên',
            desc: 'Mộc Lan cung cấp cho Lăng Tiêu thông tin quan trọng về bộ hồ sơ thất lạc.',
          },
        ],
        nodes: [
          {
            id: 'moc-lan',
            name: 'Mộc Lan',
            type: 'character',
            role: 'ĐỒNG HÀNH',
            subType: 'BÁC SĨ PHÁP Y',
            desc: 'Bác sĩ pháp y tại Viện Bạch Liên, nắm giữ thông tin quan trọng về vụ việc đã khép lại.',
            x: 115,
            y: 225,
          },
          {
            id: 'lang-tieu',
            name: 'Lăng Tiêu',
            type: 'character',
            role: 'NHÂN VẬT CHÍNH',
            subType: 'PHÓNG VIÊN ĐIỀU TRA',
            desc: 'Phóng viên độc lập đang lần theo dấu vết một vụ việc cũ.',
            x: 255,
            y: 245,
          },
          {
            id: 'lan-gap-bach-lien',
            name: 'Cuộc Gặp Tại Viện Bạch Liên',
            type: 'event',
            role: 'CHƯƠNG 2',
            subType: 'CUỘC GẶP',
            desc: 'Mộc Lan cung cấp cho Lăng Tiêu thông tin quan trọng về bộ hồ sơ thất lạc.',
            x: 185,
            y: 350,
          },
          {
            id: 'bach-lien-coc',
            name: 'Viện Bạch Liên',
            type: 'faction',
            role: 'TRUNG LẬP',
            subType: 'CƠ SỞ Y TẾ',
            desc: 'Cơ sở y tế nơi Mộc Lan làm việc, đang bị Tập đoàn Thiên Hạ gây sức ép.',
            x: 95,
            y: 470,
          },
          {
            id: 'thien-ha-minh',
            name: 'Tập đoàn Thiên Hạ',
            type: 'faction',
            role: 'ĐỐI LẬP',
            subType: 'DOANH NGHIỆP',
            desc: 'Tập đoàn lớn do Triệu Vô Cực điều hành, đang gây sức ép lên Viện Bạch Liên.',
            x: 275,
            y: 470,
          },
        ],
        links: [
          { id: 'c2-l1', source: 'lang-tieu', target: 'moc-lan', label: 'nhận thông tin từ', type: 'dashed' },
          { id: 'c2-l2', source: 'moc-lan', target: 'lan-gap-bach-lien', label: 'tham gia', type: 'dashed' },
          { id: 'c2-l3', source: 'lang-tieu', target: 'lan-gap-bach-lien', label: 'gặp gỡ', type: 'dashed' },
          { id: 'c2-l4', source: 'moc-lan', target: 'bach-lien-coc', label: 'làm việc tại', type: 'dashed' },
          { id: 'c2-l5', source: 'thien-ha-minh', target: 'bach-lien-coc', label: 'dò xét', type: 'dashed' },
        ],
      },
      {
        id: 'c3',
        chapterNumber: 3,
        code: 'C3',
        title: 'Hồ Sơ Bị Lộ',
        shortTitle: 'C3 Hồ Sơ',
        watermark: 'HỒ SƠ',
        desc: 'Cuộc gặp tại Nguyệt Hạ khiến một phần hồ sơ xuất hiện, làm rạn nứt quan hệ giữa hai cộng sự cũ.',
        events: [
          {
            id: 'e3-1',
            title: 'Cuộc Gặp Tại Nguyệt Hạ',
            desc: 'Cuộc gặp giữa các nhân chứng khiến một phần hồ sơ thất lạc bất ngờ xuất hiện.',
          },
          {
            id: 'e3-2',
            title: 'Đối Chất Với Cộng Sự Cũ',
            desc: 'Triệu Vô Cực phủ nhận liên quan đến vụ việc, còn Lăng Tiêu công bố bằng chứng mới.',
          },
        ],
        nodes: [
          {
            id: 'lang-tieu',
            name: 'Lăng Tiêu',
            type: 'character',
            role: 'NHÂN VẬT CHÍNH',
            subType: 'PHÓNG VIÊN ĐIỀU TRA',
            desc: 'Phóng viên độc lập đang lần theo dấu vết một vụ việc cũ.',
            x: 120,
            y: 240,
          },
          {
            id: 'trieu-vo-cuc',
            name: 'Triệu Vô Cực',
            type: 'character',
            role: 'PHẢN DIỆN',
            subType: 'GIÁM ĐỐC',
            desc: 'Lãnh đạo Tập đoàn Thiên Hạ, tìm cách kiểm soát những tài liệu liên quan.',
            x: 275,
            y: 220,
          },
          {
            id: 'kiem-hoang-hon',
            name: 'Hồ Sơ Hoàng Hôn',
            type: 'item',
            role: 'TÀI LIỆU MẬT',
            subType: 'HỒ SƠ',
            desc: 'Một phần hồ sơ bị thất lạc được tìm thấy tại cuộc gặp ở Nguyệt Hạ.',
            x: 195,
            y: 360,
          },
          {
            id: 'hoi-the-nguyet-ha',
            name: 'Cuộc Gặp Tại Nguyệt Hạ',
            type: 'event',
            role: 'CHƯƠNG 3',
            subType: 'CUỘC GẶP',
            desc: 'Cuộc gặp giữa các nhân chứng khiến một phần hồ sơ thất lạc bất ngờ xuất hiện.',
            x: 90,
            y: 480,
          },
          {
            id: 'huynh-de-tuong-tan',
            name: 'Đối Chất Với Cộng Sự Cũ',
            type: 'event',
            role: 'CHƯƠNG 3',
            subType: 'BIẾN CỐ',
            desc: 'Triệu Vô Cực phủ nhận liên quan đến vụ việc, còn Lăng Tiêu công bố bằng chứng mới.',
            x: 290,
            y: 470,
          },
          {
            id: 'vuc-vong-hon',
            name: 'Bến Sông Bắc Nguyệt',
            type: 'location',
            role: 'ĐỊA ĐIỂM',
            subType: 'KHU VỰC VEN SÔNG',
            desc: 'Khu vực ven sông nơi một phần bằng chứng được cho là đã bị vứt bỏ.',
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
        role: 'VẬT PHẨM',
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
  return [];
}

export const CHARACTER_STATUS_OPTIONS = [
  { label: 'Còn sống', value: 'Còn sống', icon: '🟢' },
  { label: 'Đã chết', value: 'Đã chết', icon: '💀' },
  { label: 'Hồi sinh', value: 'Hồi sinh', icon: '✨' },
];

export const FACTION_STATUS_OPTIONS = [
  { label: 'Đang hoạt động', value: 'Đang hoạt động', icon: '🔥' },
  { label: 'Tạm ngừng', value: 'Tạm ngừng', icon: '⏸️' },
];

export const FACTION_CLASSIFICATIONS = [
  { label: 'Đồng minh', value: 'Đồng minh', icon: '⚪' },
  { label: 'Đối lập', value: 'Đối lập', icon: '⚫' },
  { label: 'Trung lập', value: 'Trung lập', icon: '🟡' },
];

export const ITEM_RARITY_OPTIONS = [
  { label: 'Phổ thông', value: 'Phổ thông', icon: '⚪' },
  { label: 'Hiếm', value: 'Hiếm', icon: '🔵' },
  { label: 'Quý hiếm', value: 'Quý hiếm', icon: '🟣' },
  { label: 'Rất hiếm', value: 'Rất hiếm', icon: '🟠' },
  { label: 'Độc bản', value: 'Độc bản', icon: '🌟' },
  { label: 'Đặc biệt', value: 'Đặc biệt', icon: '👑' },
];

export const LOCATION_REGION_OPTIONS = [
  'Miền Đông',
  'Miền Tây',
  'Miền Nam',
  'Miền Bắc',
  'Trung tâm',
  'Ngoài khơi',
  'Vùng biên giới',
  'Khu vực nghiên cứu',
  'Khu vực chưa xác định',
].map((r) => ({ label: r, value: r, icon: '🧭' }));

export const LOCATION_DANGER_OPTIONS = [
  'An toàn',
  'Bình thường',
  'Nguy hiểm',
  'Khu vực hạn chế',
].map((d) => ({ label: d, value: d, icon: '⚠️' }));

export const LOCATION_CLIMATE_OPTIONS = [
  'Ôn hòa',
  'Lạnh và khô',
  'Nóng và khô',
  'Ẩm ướt',
  'Mưa bão',
  'Thay đổi thất thường',
].map((c) => ({ label: c, value: c, icon: '🌤️' }));

export const GENDER_OPTIONS = [
  { label: 'Nam', value: 'Nam', icon: '♂️' },
  { label: 'Nữ', value: 'Nữ', icon: '♀️' },
  { label: 'Khác / Chưa rõ', value: 'Khác', icon: '⚧' },
];

export const EVENT_TYPE_OPTIONS = [
  { label: 'Chiến đấu / Xung đột', value: 'Chiến đấu', icon: '⚔️' },
  { label: 'Đối thoại / Đàm phán', value: 'Đối thoại / Đàm phán', icon: '💬' },
  { label: 'Tiết lộ bí mật / Plot Twist', value: 'Tiết lộ bí mật', icon: '🕵️' },
  { label: 'Du hành / Khám phá', value: 'Du hành', icon: '🧭' },
  { label: 'Biến cố / Hy sinh', value: 'Biến cố / Hy sinh', icon: '💥' },
  { label: 'Giao dịch / Vật phẩm', value: 'Giao dịch / Vật phẩm', icon: '🎁' },
  { label: 'Hồi tưởng', value: 'Hồi tưởng', icon: '🕰️' },
  { label: 'Khác', value: 'Khác', icon: '📌' },
];

export const EVENT_IMPORTANCE_OPTIONS = [
  { label: 'Nút thắt chính (Major)', value: 'Nút thắt chính', icon: '🔥' },
  { label: 'Bước ngoặt (Turning Point)', value: 'Bước ngoặt', icon: '⚡' },
  { label: 'Gieo mầm (Foreshadowing)', value: 'Gieo mầm', icon: '🌱' },
  { label: 'Sự kiện phụ (Minor)', value: 'Sự kiện phụ', icon: '🔹' },
];

export const EVENT_TIMELINE_OPTIONS = [
  { label: 'Hiện tại', value: 'Hiện tại', icon: '⏱️' },
  { label: 'Hồi tưởng (Flashback)', value: 'Hồi tưởng', icon: '⏪' },
  { label: 'Tiên tri / Giấc mơ', value: 'Tiên tri / Giấc mơ', icon: '🔮' },
  { label: 'Lời kể gián tiếp', value: 'Lời kể gián tiếp', icon: '📜' },
];

export const EVENT_STATUS_OPTIONS = [
  { label: 'Đã diễn ra', value: 'Đã diễn ra', icon: '✅' },
  { label: 'Đang diễn ra', value: 'Đang diễn ra', icon: '⏳' },
  { label: 'Chưa diễn ra', value: 'Chưa diễn ra', icon: '📅' },
];


