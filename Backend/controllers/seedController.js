const { runQuery } = require('../config/neo4j');

const SEED_PROJECT = {
  id: 'project-1',
  number: '№ 01',
  title: 'Hoàng Hôn Kiếm Vương',
  genre: 'Kiếm hiệp · Huyền huyễn',
  desc: 'Một câu chuyện kiếm hiệp đồ thị về mảnh vỡ thanh kiếm Hoàng Hôn, ân oán giữa các môn phái và cuộc đối đầu định mệnh giữa huynh đệ đồng môn.',
};

const SEED_NODES = [
  {
    id: 'lang-tieu',
    name: 'Lăng Tiêu',
    type: 'character',
    role: 'NHÂN VẬT CHÍNH',
    subType: 'KIẾM KHÁCH',
    desc: 'Kiếm sĩ lưu vong, mang trong mình mảnh vỡ của thanh Hoàng Hôn. Trầm lặng, không tin lời thề.',
    x: 185,
    y: 355,
    weapon: 'Chuôi Kiếm Hoàng Hôn (Mảnh 1)',
    sect: 'Tự do / Lưu vong',
    status: 'Bị Thiên Hạ Minh truy sát khắp thiên hạ',
    personality: 'Trầm mặc, kiên định, không tin lời ước hẹn',
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
    weapon: 'Bạch Liên Châm & Dược Thảo',
    sect: 'Bạch Liên Cốc',
    status: 'Ẩn cư tại U Cốc sương mờ',
    personality: 'Thanh thuần, từ tâm nhưng ẩn chứa bí mật sư môn',
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
    weapon: 'Huyền Thiết Trảm Ma Kiếm',
    sect: 'Thiên Hạ Minh',
    status: 'Quy tụ chính đạo, mưu đồ đoạt 7 mảnh kiếm',
    personality: 'Thâm trầm, quyết đoán, dã tâm nuốt chửng võ lâm',
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
];

const SEED_LINKS = [
  { id: 'l1', source: 'lang-tieu', target: 'moc-lan', label: 'tin tưởng', type: 'dashed', category: 'TƯƠNG TRỢ & TÌNH CẢM', contextNote: 'Lăng Tiêu tin tưởng Mộc Lan vì được nàng cứu chữa vết thương trí mạng.', tone: 'loyalty' },
  { id: 'l2', source: 'lang-tieu', target: 'trieu-vo-cuc', label: 'huynh đệ cũ', type: 'solid', category: 'ÂN OÁN HUYNH ĐỆ', contextNote: 'Từng là huynh đệ kết nghĩa sinh tử trước khi thảm kịch xảy ra.', tone: 'loyalty' },
  { id: 'l3', source: 'lang-tieu', target: 'kiem-hoang-hon', label: 'sở hữu mảnh', type: 'solid', category: 'BẢO VẬT CHÍ TÔN', contextNote: 'Lăng Tiêu giữ chuôi kiếm – mảnh vỡ duy nhất còn lưu lại sau đêm tàn sát.', tone: 'possession' },
  { id: 'l4', source: 'trieu-vo-cuc', target: 'thien-ha-minh', label: 'lãnh đạo', type: 'solid', category: 'QUYỀN LỰC VÕ LÂM', contextNote: 'Triệu Vô Cực là minh chủ tối cao thống lĩnh toàn bộ liên minh.', tone: 'sect' },
  { id: 'l5', source: 'moc-lan', target: 'bach-lien-coc', label: 'thuộc về', type: 'dashed', category: 'MÔN PHÁI TRUYỀN THỪA', contextNote: 'Mộc Lan là đệ tử y thuật chân truyền của cốc chủ Bạch Liên Cốc.', tone: 'sect' },
  { id: 'l6', source: 'lang-tieu', target: 'dem-hoa-thieu', label: 'sống sót', type: 'solid', category: 'BIẾN CỐ & SỐNG CÒN', contextNote: 'Cả sơn trang bị diệt môn, chỉ có Lăng Tiêu may mắn trốn thoát trong biển lửa.', tone: 'event' },
  { id: 'l7', source: 'trieu-vo-cuc', target: 'dem-hoa-thieu', label: 'chủ mưu', type: 'solid', category: 'ÂM MƯU PHẢN BỘI', contextNote: 'Triệu Vô Cực đứng sau thảm án nhằm diệt trừ đối thủ và đoạt bảo kiếm.', tone: 'hostile' },
  { id: 'l8', source: 'dem-hoa-thieu', target: 'han-nguyet-thanh', label: 'diễn ra gần', type: 'dashed', category: 'ĐỊA DANH BIẾN CỐ', contextNote: 'Thảm kịch hỏa thiêu diễn ra tại sơn trang nằm ngay ngoại ô thành.', tone: 'location' },
  { id: 'l9', source: 'kiem-hoang-hon', target: 'vuc-vong-hon', label: 'thất lạc tại', type: 'dashed', category: 'THẤT LẠC HIỂM ĐỊA', contextNote: 'Mảnh mũi kiếm rơi xuống đáy vực sâu ngút ngàn, sát khí phủ kín.', tone: 'location' },
  { id: 'l10', source: 'hoi-the-nguyet-ha', target: 'kiem-hoang-hon', label: 'lộ diện', type: 'dashed', category: 'ĐẠI HỘI VÕ LÂM', contextNote: 'Mảnh thân kiếm thứ hai bất ngờ xuất hiện giữa lúc liên minh tụ hội.', tone: 'possession' },
  { id: 'l11', source: 'hoi-the-nguyet-ha', target: 'thien-ha-minh', label: 'tổ chức bởi', type: 'dashed', category: 'THẾ LỰC TỔ CHỨC', contextNote: 'Thiên Hạ Minh đứng ra đăng cai đại hội nhằm thâu tóm các thế lực.', tone: 'sect' },
  { id: 'l12', source: 'thien-ha-minh', target: 'bach-lien-coc', label: 'dò xét', type: 'dashed', category: 'ÁP LỰC THẾ LỰC', contextNote: 'Thiên Hạ Minh nghi ngờ Bạch Liên Cốc đang che giấu Lăng Tiêu.', tone: 'hostile' },
  { id: 'l13', source: 'cuoc-chay-tron', target: 'lang-tieu', label: 'xoay quanh', type: 'dashed', category: 'TRUY SÁT SINH TỬ', contextNote: 'Cuộc tẩu thoát đẫm máu mở ra hành trình lưu vong của Lăng Tiêu.', tone: 'event' },
  { id: 'l14', source: 'cuoc-chay-tron', target: 'han-nguyet-thanh', label: 'kết thúc ở', type: 'dashed', category: 'ĐIỂM DỪNG CHÂN', contextNote: 'Lăng Tiêu trốn thoát thành công và tạm lánh tại biên giới phía Bắc.', tone: 'location' },
];

const SEED_CHAPTERS = [
  {
    id: 'c1',
    chapterNumber: 1,
    code: 'C1',
    title: 'Tro Tàn',
    shortTitle: 'C1 Tro Tàn',
    watermark: 'TRO TÀN',
    desc: 'Sơn trang họ Lăng cháy rụi; Lăng Tiêu bắt đầu cuộc lưu vong.',
    events: [
      { id: 'e1-1', title: 'Đêm Hỏa Thiêu Sơn Trang', desc: 'Sơn trang họ Lăng bị thiêu rụi. Chỉ Lăng Tiêu sống sót, tay còn cầm chuôi kiếm gãy.' },
      { id: 'e1-2', title: 'Cuộc Chạy Trốn Trong Mưa', desc: 'Lăng Tiêu băng qua rừng trong mưa, bị truy sát đến tận biên giới phía Bắc.' },
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
      { id: 'e2-1', title: 'Lần Gặp Ở Bạch Liên Cốc', desc: 'Mộc Lan băng bó vết thương cho Lăng Tiêu và lần đầu thấy mảnh kiếm.' },
    ],
  },
  {
    id: 'c3',
    chapterNumber: 3,
    code: 'C3',
    title: 'Mảnh Kiếm Đầu Tiên',
    shortTitle: 'C3 Mảnh Kiếm Đầu Tiên',
    watermark: 'MẢNH KIẾM ĐẦU TIÊN',
    desc: 'Hội Thề Nguyệt Hạ diễn ra; mảnh kiếm thứ nhất lộ diện.',
    events: [
      { id: 'e3-1', title: 'Hội Thề Nguyệt Hạ', desc: 'Buổi họp mặt lớn nhất của võ lâm, nơi mảnh kiếm đầu tiên xuất hiện.' },
    ],
  },
];

/**
 * Nạp dữ liệu mẫu ban đầu (Hoàng Hôn Kiếm Vương) vào Neo4j
 */
async function seedDatabase(req, res, next) {
  if (process.env.ENABLE_SEED_ROUTES !== 'true') {
    return res.status(403).json({
      success: false,
      message: 'Các endpoint nạp dữ liệu mẫu (Seed routes) đang bị vô hiệu hóa. Thiết lập ENABLE_SEED_ROUTES=true trong file .env để kích hoạt.',
    });
  }

  try {
    // 1. Tạo hoặc cập nhật Project
    const projectCypher = `
      MERGE (p:Project { id: $id })
      SET p.title = $title,
          p.genre = $genre,
          p.number = $number,
          p.desc = $desc,
          p.updatedAt = timestamp(),
          p.createdAt = COALESCE(p.createdAt, timestamp())
      RETURN p
    `;
    await runQuery(projectCypher, SEED_PROJECT);

    // 2. Tạo các StoryNode và gắn nhãn tương ứng
    for (const node of SEED_NODES) {
      const typeLabel = node.type.charAt(0).toUpperCase() + node.type.slice(1);
      const nodeCypher = `
        MATCH (p:Project { id: $projectId })
        MERGE (n:StoryNode { id: $nodeProps.id })
        SET n:${typeLabel},
            n += $nodeProps,
            n.updatedAt = timestamp(),
            n.createdAt = COALESCE(n.createdAt, timestamp())
        MERGE (n)-[:BELONGS_TO]->(p)
      `;
      await runQuery(nodeCypher, {
        projectId: SEED_PROJECT.id,
        nodeProps: node,
      });
    }

    // 3. Tạo các Links (Relationships)
    for (const link of SEED_LINKS) {
      const linkCypher = `
        MATCH (s:StoryNode { id: $source })
        MATCH (t:StoryNode { id: $target })
        MERGE (s)-[r:RELATES_TO { id: $id }]->(t)
        SET r.label = $label,
            r.type = $type,
            r.category = $category,
            r.contextNote = $contextNote,
            r.tone = $tone,
            r.updatedAt = timestamp(),
            r.createdAt = COALESCE(r.createdAt, timestamp())
      `;
      await runQuery(linkCypher, link);
    }

    // 4. Tạo các Chapter
    for (const chap of SEED_CHAPTERS) {
      const chapterCypher = `
        MATCH (p:Project { id: $projectId })
        MERGE (c:Chapter { id: $id })
        SET c.chapterNumber = $chapterNumber,
            c.code = $code,
            c.title = $title,
            c.shortTitle = $shortTitle,
            c.watermark = $watermark,
            c.desc = $desc,
            c.events = $events,
            c.updatedAt = timestamp(),
            c.createdAt = COALESCE(c.createdAt, timestamp())
        MERGE (c)-[:BELONGS_TO]->(p)
      `;
      await runQuery(chapterCypher, {
        projectId: SEED_PROJECT.id,
        id: chap.id,
        chapterNumber: chap.chapterNumber,
        code: chap.code,
        title: chap.title,
        shortTitle: chap.shortTitle,
        watermark: chap.watermark,
        desc: chap.desc,
        events: JSON.stringify(chap.events),
      });
    }

    return res.json({
      success: true,
      message: 'Nạp dữ liệu mẫu ban đầu (Hoàng Hôn Kiếm Vương) vào Neo4j thành công!',
      seeded: {
        project: SEED_PROJECT.title,
        nodes: SEED_NODES.length,
        links: SEED_LINKS.length,
        chapters: SEED_CHAPTERS.length,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Xóa sạch toàn bộ dữ liệu mẫu trong cơ sở dữ liệu
 */
async function clearDatabase(req, res, next) {
  if (process.env.ENABLE_SEED_ROUTES !== 'true') {
    return res.status(403).json({
      success: false,
      message: 'Chức năng xóa dữ liệu bị vô hiệu hóa',
    });
  }

  try {
    const query = `
      MATCH (n)
      WHERE n:Project OR n:StoryNode OR n:Chapter
      DETACH DELETE n
    `;
    await runQuery(query);

    return res.json({
      success: true,
      message: 'Đã xóa toàn bộ dữ liệu (StoryNode, Chapter, Project) trong Neo4j.',
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  seedDatabase,
  clearDatabase,
};
