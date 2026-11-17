const { runQuery } = require('../config/neo4j');

const SEED_PROJECT = {
  id: 'project-1',
  number: '№ 01',
  title: 'Hồ Sơ Hoàng Hôn',
  genre: 'Trinh thám · Tâm lý',
  desc: 'Câu chuyện về một hồ sơ thất lạc, một vụ việc chưa được làm sáng tỏ và những mối quan hệ bị thử thách.',
};

const SEED_NODES = [
  {
    id: 'lang-tieu',
    name: 'Lăng Tiêu',
    type: 'character',
    role: 'NHÂN VẬT CHÍNH',
    subType: 'PHÓNG VIÊN ĐIỀU TRA',
    desc: 'Phóng viên độc lập đang lần theo dấu vết một vụ việc cũ. Trầm lặng, thận trọng và luôn kiểm chứng thông tin.',
    x: 185,
    y: 355,
    weapon: 'Máy ghi âm và bản ghi gốc',
    sect: 'Phóng viên độc lập',
    status: 'Đang điều tra vụ việc cũ',
    personality: 'Trầm lặng, thận trọng và luôn kiểm chứng thông tin',
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
    weapon: 'Hồ sơ giám định',
    sect: 'Viện Bạch Liên',
    status: 'Đang làm việc tại Viện Bạch Liên',
    personality: 'Điềm tĩnh, khách quan và cẩn trọng',
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
    weapon: 'Điện thoại bảo mật',
    sect: 'Tập đoàn Thiên Hạ',
    status: 'Đang tìm cách kiểm soát thông tin',
    personality: 'Quyết đoán, kín kẽ và có tính toán',
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
];

const SEED_LINKS = [
  { id: 'l1', source: 'lang-tieu', target: 'moc-lan', label: 'tin tưởng', type: 'dashed', category: 'QUAN HỆ CÁ NHÂN', contextNote: 'Lăng Tiêu tin tưởng Mộc Lan sau khi cô cung cấp thông tin về vụ việc.', tone: 'loyalty' },
  { id: 'l2', source: 'lang-tieu', target: 'trieu-vo-cuc', label: 'cộng sự cũ', type: 'solid', category: 'QUAN HỆ CỘNG SỰ', contextNote: 'Từng là cộng sự thân thiết trước khi vụ việc xảy ra.', tone: 'loyalty' },
  { id: 'l3', source: 'lang-tieu', target: 'kiem-hoang-hon', label: 'đang lưu giữ hồ sơ', type: 'solid', category: 'TÀI LIỆU LIÊN QUAN', contextNote: 'Lăng Tiêu đang lưu giữ bản ghi duy nhất còn lại sau vụ cháy.', tone: 'possession' },
  { id: 'l4', source: 'trieu-vo-cuc', target: 'thien-ha-minh', label: 'điều hành', type: 'solid', category: 'VAI TRÒ TỔ CHỨC', contextNote: 'Triệu Vô Cực điều hành Tập đoàn Thiên Hạ.', tone: 'sect' },
  { id: 'l5', source: 'moc-lan', target: 'bach-lien-coc', label: 'làm việc tại', type: 'dashed', category: 'QUAN HỆ CÔNG VIỆC', contextNote: 'Mộc Lan làm việc tại Viện Bạch Liên.', tone: 'sect' },
  { id: 'l6', source: 'lang-tieu', target: 'dem-hoa-thieu', label: 'nhân chứng', type: 'solid', category: 'VỤ VIỆC & NHÂN CHỨNG', contextNote: 'Vụ cháy xảy ra tại điền trang nhà họ Lăng; Lăng Tiêu là nhân chứng sống sót.', tone: 'event' },
  { id: 'l7', source: 'trieu-vo-cuc', target: 'dem-hoa-thieu', label: 'bị nghi liên quan', type: 'solid', category: 'NGHI VẤN', contextNote: 'Triệu Vô Cực bị nghi có liên quan đến vụ cháy và việc hồ sơ thất lạc.', tone: 'hostile' },
  { id: 'l8', source: 'dem-hoa-thieu', target: 'han-nguyet-thanh', label: 'xảy ra gần', type: 'dashed', category: 'ĐỊA ĐIỂM SỰ KIỆN', contextNote: 'Vụ cháy xảy ra tại điền trang ở ngoại ô thành phố.', tone: 'location' },
  { id: 'l9', source: 'kiem-hoang-hon', target: 'vuc-vong-hon', label: 'bị thất lạc tại', type: 'dashed', category: 'ĐỊA ĐIỂM THẤT LẠC', contextNote: 'Một phần hồ sơ được cho là đã bị vứt bỏ tại khu vực ven sông.', tone: 'location' },
  { id: 'l10', source: 'hoi-the-nguyet-ha', target: 'kiem-hoang-hon', label: 'được phát hiện', type: 'dashed', category: 'CUỘC GẶP NHÂN CHỨNG', contextNote: 'Một phần hồ sơ bất ngờ xuất hiện tại cuộc gặp ở Nguyệt Hạ.', tone: 'possession' },
  { id: 'l11', source: 'hoi-the-nguyet-ha', target: 'thien-ha-minh', label: 'được tổ chức bởi', type: 'dashed', category: 'TỔ CHỨC SỰ KIỆN', contextNote: 'Tập đoàn Thiên Hạ đứng ra tổ chức cuộc gặp giữa các nhân chứng.', tone: 'sect' },
  { id: 'l12', source: 'thien-ha-minh', target: 'bach-lien-coc', label: 'gây sức ép', type: 'dashed', category: 'MÂU THUẪN TỔ CHỨC', contextNote: 'Tập đoàn Thiên Hạ gây sức ép lên Viện Bạch Liên.', tone: 'hostile' },
  { id: 'l13', source: 'cuoc-chay-tron', target: 'lang-tieu', label: 'xoay quanh', type: 'dashed', category: 'DIỄN BIẾN CỐT TRUYỆN', contextNote: 'Lăng Tiêu tìm cách rời khỏi thành phố sau khi phát hiện có người theo dõi.', tone: 'event' },
  { id: 'l14', source: 'cuoc-chay-tron', target: 'han-nguyet-thanh', label: 'kết thúc tại', type: 'dashed', category: 'ĐỊA ĐIỂM', contextNote: 'Lăng Tiêu rời khỏi thành phố và tìm đến Thành phố Bắc Nguyệt.', tone: 'location' },
];

const SEED_CHAPTERS = [
  {
    id: 'c1',
    chapterNumber: 1,
    code: 'C1',
    title: 'Dấu Vết Đầu Tiên',
    shortTitle: 'C1 Dấu Vết',
    watermark: 'DẤU VẾT',
    desc: 'Vụ cháy tại điền trang khiến Lăng Tiêu bắt đầu cuộc điều tra riêng.',
    events: [
      { id: 'e1-1', title: 'Vụ Cháy Tại Điền Trang', desc: 'Một vụ cháy xảy ra tại điền trang nhà họ Lăng. Lăng Tiêu là nhân chứng sống sót duy nhất.' },
      { id: 'e1-2', title: 'Cuộc Rời Khỏi Thành Phố', desc: 'Lăng Tiêu tìm cách rời khỏi thành phố sau khi phát hiện có người theo dõi mình.' },
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
      { id: 'e2-1', title: 'Cuộc Gặp Tại Viện Bạch Liên', desc: 'Mộc Lan cung cấp cho Lăng Tiêu thông tin quan trọng về bộ hồ sơ thất lạc.' },
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
      { id: 'e3-1', title: 'Cuộc Gặp Tại Nguyệt Hạ', desc: 'Cuộc gặp giữa các nhân chứng khiến một phần hồ sơ thất lạc bất ngờ xuất hiện.' },
    ],
  },
];

/**
 * Nạp dữ liệu mẫu ban đầu vào Neo4j
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
      message: 'Nạp dữ liệu mẫu (Hồ Sơ Hoàng Hôn) vào Neo4j thành công!',
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
