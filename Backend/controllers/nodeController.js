const crypto = require('crypto');
const { runQuery } = require('../config/neo4j');

// Bản đồ ánh xạ nhãn phụ theo type
const TYPE_LABELS = {
  character: 'Character',
  item: 'Item',
  faction: 'Faction',
  event: 'Event',
  location: 'Location',
};

function parseParticipantNames(value) {
  if (Array.isArray(value)) {
    return value.filter((name) => typeof name === 'string');
  }
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((name) => typeof name === 'string');
    }
  } catch {
    // Legacy participant strings use commas, semicolons, or newlines as separators.
  }

  return value.split(/[,;\n]+/);
}

/**
 * Lấy danh sách Nodes của một Project (có thể lọc theo ?type=character&search=...)
 */
async function getNodesByProject(req, res, next) {
  const { projectId } = req.params;
  const { type, search } = req.query;

  try {
    let whereClauses = ['(n)-[:BELONGS_TO]->(p)'];
    const params = { projectId };

    if (type) {
      whereClauses.push('n.type = $type');
      params.type = type.toLowerCase();
    }

    if (search) {
      whereClauses.push('(toLower(n.name) CONTAINS toLower($search) OR toLower(n.desc) CONTAINS toLower($search) OR toLower(n.role) CONTAINS toLower($search))');
      params.search = search.trim();
    }

    const query = `
      MATCH (p:Project { id: $projectId })
      MATCH (n:StoryNode)
      WHERE ${whereClauses.join(' AND ')}
      RETURN n
      ORDER BY n.name ASC
    `;

    const records = await runQuery(query, params, 'READ');
    const nodes = records.map((r) => r.n);

    return res.json({
      success: true,
      count: nodes.length,
      projectId,
      data: nodes,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Lấy thông tin chi tiết của 1 Node kèm các liên kết xung quanh
 */
async function getNodeById(req, res, next) {
  const { id } = req.params;

  try {
    const query = `
      MATCH (n:StoryNode { id: $id })
      OPTIONAL MATCH (n)-[:BELONGS_TO]->(p:Project)
      OPTIONAL MATCH (n)-[rOut:RELATES_TO]->(target:StoryNode)
      OPTIONAL MATCH (source:StoryNode)-[rIn:RELATES_TO]->(n)
      RETURN n,
             p.id AS projectId,
             p.title AS projectTitle,
             collect(DISTINCT { link: rOut, target: target }) AS outgoing,
             collect(DISTINCT { link: rIn, source: source }) AS incoming
    `;

    const records = await runQuery(query, { id }, 'READ');
    if (!records.length || !records[0].n) {
      return res.status(404).json({ success: false, message: `Không tìm thấy node với ID: ${id}` });
    }

    const row = records[0];
    const outgoing = (row.outgoing || []).filter((item) => item.target && item.target.id);
    const incoming = (row.incoming || []).filter((item) => item.source && item.source.id);

    return res.json({
      success: true,
      data: {
        ...row.n,
        projectId: row.projectId,
        projectTitle: row.projectTitle,
        connections: {
          outgoing,
          incoming,
          total: outgoing.length + incoming.length,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

const ALLOWED_NODE_SCALARS = new Set([
  'name',
  'type',
  'role',
  'desc',
  'subType',
  'x',
  'y',
  'status',
  // Character specific
  'dob',
  'birthplace',
  'gender',
  'weapon',
  'sect',
  'personality',
  // Item specific
  'rarity',
  'origin',
  'element',
  'power',
  'holderOrLocation',
  // Location specific
  'region',
  'climate',
  'terrain',
  'dangerLevel',
  'ruler',
  // Faction specific
  'leader',
  'headquarters',
  'motto',
  'alignment',
  'influence',
  // Event specific
  'time',
  'location',
  'chapter',
  'impact',
  'charactersInvolved',
  'characters',
  // Status Event cause
  'statusEvent',
]);

/**
 * Lấy danh sách Nodes của một Project (có thể lọc theo ?type=character&search=...)
 */
async function getNodesByProject(req, res, next) {
  const { projectId } = req.params;
  const { type, search } = req.query;

  try {
    const whereClauses = [];
    const params = { projectId };

    if (type) {
      whereClauses.push('n.type = $type');
      params.type = type.toLowerCase();
    }

    if (search) {
      whereClauses.push('(toLower(n.name) CONTAINS toLower($search) OR toLower(n.desc) CONTAINS toLower($search) OR toLower(n.role) CONTAINS toLower($search))');
      params.search = search.trim();
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const query = `
      MATCH (n:StoryNode)-[:BELONGS_TO]->(p:Project { id: $projectId })
      ${whereStr}
      RETURN n
      ORDER BY n.name ASC
    `;

    const records = await runQuery(query, params, 'READ');
    const nodes = records.map((r) => r.n);

    return res.json({
      success: true,
      count: nodes.length,
      projectId,
      data: nodes,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Lấy thông tin chi tiết của 1 Node kèm các liên kết xung quanh
 */
async function getNodeById(req, res, next) {
  const { id } = req.params;

  try {
    const query = `
      MATCH (n:StoryNode { id: $id })
      OPTIONAL MATCH (n)-[:BELONGS_TO]->(p:Project)
      OPTIONAL MATCH (n)-[rOut:RELATES_TO]->(target:StoryNode)
      OPTIONAL MATCH (source:StoryNode)-[rIn:RELATES_TO]->(n)
      RETURN n,
             p.id AS projectId,
             p.title AS projectTitle,
             collect(DISTINCT { link: rOut, target: target }) AS outgoing,
             collect(DISTINCT { link: rIn, source: source }) AS incoming
    `;

    const records = await runQuery(query, { id }, 'READ');
    if (!records.length || !records[0].n) {
      return res.status(404).json({ success: false, message: `Không tìm thấy node với ID: ${id}` });
    }

    const row = records[0];
    const outgoing = (row.outgoing || []).filter((item) => item.target && item.target.id);
    const incoming = (row.incoming || []).filter((item) => item.source && item.source.id);

    return res.json({
      success: true,
      data: {
        ...row.n,
        projectId: row.projectId,
        projectTitle: row.projectTitle,
        connections: {
          outgoing,
          incoming,
          total: outgoing.length + incoming.length,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Tạo mới một StoryNode trong Project
 */
async function createNode(req, res, next) {
  const { projectId } = req.params;
  const body = req.body || {};

  // Strip server-managed fields if sent
  delete body.createdAt;
  delete body.updatedAt;

  if (Array.isArray(body.charactersInvolved)) {
    body.charactersInvolved = JSON.stringify(body.charactersInvolved);
  }
  if (Array.isArray(body.characters)) {
    body.characters = JSON.stringify(body.characters);
  }

  // Reject invalid keys or non-scalar / nested values
  for (const [key, value] of Object.entries(body)) {
    if (key !== 'id' && !ALLOWED_NODE_SCALARS.has(key)) {
      return res.status(400).json({ success: false, message: `Trường '${key}' không hợp lệ trên Node` });
    }
    if (value !== null && typeof value === 'object') {
      return res.status(400).json({ success: false, message: `Giá trị của trường '${key}' phải là kiểu dữ liệu vô hướng (scalar), không được lồng object/array` });
    }
  }

  const {
    id,
    name,
    type = 'character',
    role = '',
    desc = '',
    subType = '',
    x = 100,
    y = 100,
    status,
  } = body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Tên node (name) là bắt buộc và phải là chuỗi hợp lệ' });
  }

  if (typeof type !== 'string' || !TYPE_LABELS[type.toLowerCase()]) {
    return res.status(400).json({
      success: false,
      message: `Loại node (type) không hợp lệ. Phải là một trong các giá trị: ${Object.keys(TYPE_LABELS).join(', ')}`,
    });
  }
  const normalizedType = type.toLowerCase();
  const secondaryLabel = TYPE_LABELS[normalizedType];

  const parsedX = Number(x);
  const parsedY = Number(y);
  if (!Number.isFinite(parsedX) || !Number.isFinite(parsedY)) {
    return res.status(400).json({ success: false, message: 'Tọa độ x và y phải là số hợp lệ' });
  }

  const cleanPrefix = normalizedType.slice(0, 4);
  const nodeId = id && typeof id === 'string' && id.trim()
    ? id.trim()
    : `${cleanPrefix}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 4)}`;

  try {
    // Kiểm tra xem Project có tồn tại và kiểm tra quyền sở hữu không
    const checkQuery = `
      MATCH (p:Project { id: $projectId })
      OPTIONAL MATCH (owner:User)-[:OWNS]->(p)
      RETURN p, owner.id AS ownerId
    `;
    const checkResult = await runQuery(checkQuery, { projectId }, 'READ');
    if (!checkResult.length) {
      return res.status(404).json({ success: false, message: `Không tìm thấy project với ID: ${projectId}` });
    }
    const ownerId = checkResult[0].ownerId;
    if (ownerId && ownerId !== req.user?.id) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền chỉnh sửa dự án này' });
    }

    const defaultStatusByType = {
      character: 'Còn sống',
      item: 'Bình thường',
      location: 'Hoạt động',
      faction: 'Hoạt động',
      event: 'Đã diễn ra',
    };

    const nodeProperties = {
      id: nodeId,
      name: name.trim(),
      type: normalizedType,
      role: role ? String(role).trim() : '',
      desc: desc ? String(desc).trim() : '',
      subType: subType ? String(subType).trim() : '',
      x: parsedX,
      y: parsedY,
      status: status !== undefined && status !== null && String(status).trim() !== ''
        ? String(status).trim()
        : (defaultStatusByType[normalizedType] || 'Hoạt động'),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Điền toàn bộ các trường vô hướng đặc trưng theo phân loại thực thể
    for (const field of ALLOWED_NODE_SCALARS) {
      if (['name', 'type', 'role', 'desc', 'subType', 'x', 'y', 'status'].includes(field)) continue;
      if (body[field] !== undefined) {
        nodeProperties[field] = body[field] !== null ? String(body[field]).trim() : '';
      }
    }

    const createQuery = `
      MATCH (p:Project { id: $projectId })
      CREATE (n:StoryNode:${secondaryLabel} $props)
      CREATE (n)-[:BELONGS_TO]->(p)
      RETURN n
    `;

    const records = await runQuery(createQuery, {
      projectId,
      props: nodeProperties,
    });

    const createdNode = records[0].n;
    await syncNodeRelationships(createdNode.id, projectId, createdNode);

    return res.status(201).json({
      success: true,
      message: 'Tạo Node thành công',
      data: createdNode,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Cập nhật thông tin StoryNode (tọa độ x, y, name, role, desc, ...)
 */
async function updateNode(req, res, next) {
  const { id } = req.params;
  const body = req.body || {};

  // Strip immutable fields if sent
  delete body.id;
  delete body.createdAt;
  delete body.updatedAt;

  if (Array.isArray(body.charactersInvolved)) {
    body.charactersInvolved = JSON.stringify(body.charactersInvolved);
  }
  if (Array.isArray(body.characters)) {
    body.characters = JSON.stringify(body.characters);
  }

  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_NODE_SCALARS.has(key)) {
      return res.status(400).json({ success: false, message: `Trường '${key}' không hợp lệ trên Node` });
    }
    if (value !== null && typeof value === 'object') {
      return res.status(400).json({ success: false, message: `Giá trị của trường '${key}' phải là kiểu dữ liệu vô hướng (scalar), không được lồng object/array` });
    }
  }

  const updates = {};
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return res.status(400).json({ success: false, message: 'Tên node (name) không được để trống' });
    }
    updates.name = body.name.trim();
  }

  let newSecondaryLabel = null;
  if (body.type !== undefined) {
    if (typeof body.type !== 'string' || !TYPE_LABELS[body.type.toLowerCase()]) {
      return res.status(400).json({
        success: false,
        message: `Loại node (type) không hợp lệ. Phải là một trong các giá trị: ${Object.keys(TYPE_LABELS).join(', ')}`,
      });
    }
    const normalizedType = body.type.toLowerCase();
    updates.type = normalizedType;
    newSecondaryLabel = TYPE_LABELS[normalizedType];
  }

  if (body.x !== undefined) {
    const parsedX = Number(body.x);
    if (!Number.isFinite(parsedX)) {
      return res.status(400).json({ success: false, message: 'Tọa độ x phải là số hợp lệ' });
    }
    updates.x = parsedX;
  }

  if (body.y !== undefined) {
    const parsedY = Number(body.y);
    if (!Number.isFinite(parsedY)) {
      return res.status(400).json({ success: false, message: 'Tọa độ y phải là số hợp lệ' });
    }
    updates.y = parsedY;
  }

  for (const field of ALLOWED_NODE_SCALARS) {
    if (['name', 'type', 'x', 'y'].includes(field)) continue;
    if (body[field] !== undefined) {
      updates[field] = body[field] !== null ? String(body[field]).trim() : '';
    }
  }
  if (body.charactersInvolved !== undefined && body.characters === undefined) {
    updates.characters = '';
  }

  updates.updatedAt = Date.now();

  try {
    // Kiểm tra quyền sở hữu
    const checkQuery = `
      MATCH (n:StoryNode { id: $id })
      OPTIONAL MATCH (n)-[:BELONGS_TO]->(p:Project)
      OPTIONAL MATCH (owner:User)-[:OWNS]->(p)
      RETURN n, p.id AS projectId, owner.id AS ownerId
    `;
    const checkResult = await runQuery(checkQuery, { id }, 'READ');
    if (!checkResult.length || !checkResult[0]?.n) {
      return res.status(404).json({ success: false, message: `Không tìm thấy node với ID: ${id}` });
    }
    const ownerId = checkResult[0].ownerId;
    if (ownerId && ownerId !== req.user?.id) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền chỉnh sửa node của dự án này' });
    }

    let query;
    const participantFieldsChanged =
      body.charactersInvolved !== undefined ||
      body.characters !== undefined ||
      body.character !== undefined;
    const currentType = body.type?.toLowerCase() || checkResult[0].n.type;
    if (participantFieldsChanged && currentType === 'event') {
      updates._participantSyncRevision = crypto.randomUUID();
    }

    if (newSecondaryLabel) {
      query = `
        MATCH (n:StoryNode { id: $id })
        REMOVE n:Character:Item:Faction:Event:Location
        SET n:${newSecondaryLabel}, n += $updates
        RETURN n
      `;
    } else {
      query = `
        MATCH (n:StoryNode { id: $id })
        SET n += $updates
        RETURN n
      `;
    }

    const records = await runQuery(query, { id, updates });
    if (!records.length || !records[0].n) {
      return res.status(404).json({ success: false, message: `Không tìm thấy node với ID: ${id}` });
    }

    const updatedNode = records[0].n;
    const targetProjectId = checkResult[0].projectId;
    if (targetProjectId) {
      await syncNodeRelationships(id, targetProjectId, updatedNode);
    }

    return res.json({
      success: true,
      message: 'Cập nhật Node thành công',
      data: updatedNode,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Xóa một StoryNode và các liên kết gắn với nó
 */
async function deleteNode(req, res, next) {
  const { id } = req.params;

  try {
    // Kiểm tra quyền sở hữu
    const checkQuery = `
      MATCH (n:StoryNode { id: $id })
      OPTIONAL MATCH (n)-[:BELONGS_TO]->(p:Project)
      OPTIONAL MATCH (owner:User)-[:OWNS]->(p)
      RETURN n, owner.id AS ownerId
    `;
    const checkResult = await runQuery(checkQuery, { id }, 'READ');
    if (!checkResult.length || !checkResult[0]?.n) {
      return res.status(404).json({ success: false, message: `Không tìm thấy node với ID: ${id}` });
    }
    const ownerId = checkResult[0].ownerId;
    if (ownerId && ownerId !== req.user?.id) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa node của dự án này' });
    }

    const query = `
      MATCH (n:StoryNode { id: $id })
      DETACH DELETE n
      RETURN count(n) AS deleted
    `;

    const records = await runQuery(query, { id });
    if (!records[0] || records[0].deleted === 0) {
      return res.status(404).json({ success: false, message: `Không tìm thấy node với ID: ${id}` });
    }

    return res.json({
      success: true,
      message: `Đã xóa thành công node ${id} cùng các liên kết liên quan`,
    });
  } catch (error) {
    next(error);
  }
}

async function findOrCreateProjectEntity(projectId, name, type, defaults = {}) {
  const label = TYPE_LABELS[type];
  if (!label) throw new Error(`Loại thực thể không hỗ trợ: ${type}`);

  const entityId = `node-${type.slice(0, 4)}-${Date.now()}-${crypto.randomUUID().slice(0, 5)}`;
  const properties = {
    id: entityId,
    name,
    type,
    ...defaults,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    x: 100 + Math.random() * 400,
    y: 100 + Math.random() * 400,
  };
  const query = `
    MATCH (p:Project { id: $projectId })
    SET p._entityFindOrCreateLock = coalesce(p._entityFindOrCreateLock, 0) + 1
    WITH p
    OPTIONAL MATCH (existing:StoryNode)-[:BELONGS_TO]->(p)
    WHERE existing.type = $type
      AND (toLower(existing.name) = toLower($name) OR existing.id = $name)
    WITH p, collect(existing) AS matches
    FOREACH (_ IN CASE WHEN size(matches) = 0 THEN [1] ELSE [] END |
      CREATE (created:StoryNode:${label} $properties)
      CREATE (created)-[:BELONGS_TO]->(p)
    )
    REMOVE p._entityFindOrCreateLock
    WITH p
    MATCH (entity:StoryNode)-[:BELONGS_TO]->(p)
    WHERE entity.type = $type
      AND (toLower(entity.name) = toLower($name) OR entity.id = $name)
    RETURN entity.id AS id
    LIMIT 1
  `;
  const records = await runQuery(query, { projectId, name, type, properties });
  if (!records.length || !records[0].id) {
    throw new Error(`Không thể tạo hoặc tìm thấy ${type}: ${name}`);
  }
  return records[0].id;
}

/**
 * Tự động đồng bộ các mối quan hệ (edges) trong Neo4j đồ thị:
 * - Nhân vật gán vật dụng (Item), Nơi sinh (Location), tổ chức (Faction), sự kiện tử nạn/hồi sinh (Event)
 * - Vật phẩm gán Nguồn gốc (Location), Người giữ (Character)
 * - Tổ chức gán người đại diện (Character), trụ sở (Location), sự kiện thay đổi trạng thái (Event)
 * - Sự kiện gán Nơi diễn ra (Location)
 * - Địa điểm gán Thế lực cai quản (Faction)
 */
const PLACEHOLDER_RELATION_PATTERN = /^(unknown|not known|n\/a|none|null|undefined|không rõ|chưa rõ|không xác định|chưa xác định|không có|trống)$/i;

function cleanRelationalValue(val) {
  if (val === null || val === undefined) return '';
  const trimmed = String(val).trim();
  if (!trimmed || PLACEHOLDER_RELATION_PATTERN.test(trimmed)) return '';
  return trimmed;
}

async function syncNodeRelationships(nodeId, projectId, nodeData) {
  if (!nodeId || !projectId || !nodeData) return;

  try {
    const nodeType = nodeData.type;
    const nodeName = String(nodeData.name || 'thực thể').trim();

    // 1. NHÂN VẬT (Character)
    if (nodeType === 'character') {
      // Vật dụng -> Item
      const weapon = cleanRelationalValue(nodeData.weapon);
      if (weapon) {
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'EQUIPPED' }]->(item:StoryNode)
          WHERE item.name <> $weapon AND item.id <> $weapon
          DELETE r
        `, { nodeId, weapon });
        const itemId = await findOrCreateProjectEntity(projectId, weapon, 'item', {
          role: 'Quý hiếm',
          rarity: 'Quý hiếm',
          element: 'Kim',
          desc: `Vật phẩm gắn liền với ${nodeName}`,
          status: 'Nguyên vẹn',
        });
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })
          MATCH (item:StoryNode { id: $itemId })
          MERGE (c)-[r:RELATES_TO { category: 'EQUIPPED' }]->(item)
          ON CREATE SET r.id = 'link-' + c.id + '-' + item.id + '-weapon',
                        r.label = 'Vật dụng',
                        r.type = 'solid',
                        r.tone = 'possession',
                        r.createdAt = timestamp()
          ON MATCH SET r.label = 'Vật dụng',
                       r.updatedAt = timestamp()
        `, { nodeId, itemId });
      } else {
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'EQUIPPED' }]->(:StoryNode)
          DELETE r
        `, { nodeId });
      }

      // Nơi sinh -> Location
      const birthplace = cleanRelationalValue(nodeData.birthplace);
      if (birthplace) {
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'BIRTHPLACE' }]->(loc:StoryNode)
          WHERE loc.name <> $birthplace AND loc.id <> $birthplace
          DELETE r
        `, { nodeId, birthplace });
        const locId = await findOrCreateProjectEntity(projectId, birthplace, 'location', {
          role: 'ĐỊA DANH',
          region: 'Miền Đông',
          dangerLevel: 'An toàn',
          climate: 'Ôn hòa',
          terrain: 'Đồng bằng',
          desc: `Nơi sinh của ${nodeName}`,
          status: 'Hoạt động',
        });
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })
          MATCH (loc:StoryNode { id: $locId })
          MERGE (c)-[r:RELATES_TO { category: 'BIRTHPLACE' }]->(loc)
          ON CREATE SET r.id = 'link-' + c.id + '-' + loc.id + '-birthplace',
                        r.label = 'Nơi sinh',
                        r.type = 'dashed',
                        r.tone = 'location',
                        r.createdAt = timestamp()
          ON MATCH SET r.label = 'Nơi sinh',
                       r.updatedAt = timestamp()
        `, { nodeId, locId });
      } else {
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'BIRTHPLACE' }]->(:StoryNode)
          DELETE r
        `, { nodeId });
      }

      // Tổ chức -> Faction
      const sect = cleanRelationalValue(nodeData.sect);
      if (sect) {
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'MEMBER_OF' }]->(fac:StoryNode)
          WHERE fac.name <> $sect AND fac.id <> $sect
          DELETE r
        `, { nodeId, sect });
        const facId = await findOrCreateProjectEntity(projectId, sect, 'faction', {
          role: 'TỔ CHỨC',
          subType: 'Trung lập',
          alignment: 'TRUNG LẬP',
          motto: '',
          desc: `Tổ chức có thành viên ${nodeName}`,
          status: 'Đang hoạt động',
        });
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })
          MATCH (fac:StoryNode { id: $facId })
          MERGE (c)-[r:RELATES_TO { category: 'MEMBER_OF' }]->(fac)
          ON CREATE SET r.id = 'link-' + c.id + '-' + fac.id + '-sect',
                        r.label = 'Tổ chức',
                        r.type = 'solid',
                        r.tone = 'sect',
                        r.createdAt = timestamp()
          ON MATCH SET r.label = 'Tổ chức',
                       r.updatedAt = timestamp()
        `, { nodeId, facId });
      } else {
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'MEMBER_OF' }]->(:StoryNode)
          DELETE r
        `, { nodeId });
      }

      // Biến cố tử nạn / hồi sinh -> Event
      const statusEvent = cleanRelationalValue(nodeData.statusEvent);
      if (statusEvent && (nodeData.status === 'Đã chết' || nodeData.status === 'Hồi sinh')) {
        const evLabel = nodeData.status === 'Đã chết' ? 'Tử nạn tại' : 'Hồi sinh tại';
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'STATUS_EVENT' }]->(ev:StoryNode)
          WHERE ev.name <> $statusEvent AND ev.id <> $statusEvent
          DELETE r
        `, { nodeId, statusEvent });
        const evId = await findOrCreateProjectEntity(projectId, statusEvent, 'event', {
          role: 'BIẾN CỐ',
          desc: `Sự kiện liên quan đến trạng thái của ${nodeName}`,
          status: 'Đã diễn ra',
        });
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })
          MATCH (ev:StoryNode { id: $evId })
          MERGE (c)-[r:RELATES_TO { category: 'STATUS_EVENT' }]->(ev)
          ON CREATE SET r.id = 'link-' + c.id + '-' + ev.id + '-event',
                        r.label = $evLabel,
                        r.type = 'solid',
                        r.tone = 'event',
                        r.createdAt = timestamp()
          ON MATCH SET r.label = $evLabel,
                       r.updatedAt = timestamp()
        `, { nodeId, evId, evLabel });
      } else {
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'STATUS_EVENT' }]->(:StoryNode)
          DELETE r
        `, { nodeId });
      }
    }

    // 2. VẬT PHẨM (Item)
    if (nodeType === 'item') {
      // Người sở hữu -> Character
      const holder = cleanRelationalValue(nodeData.holderOrLocation);
      if (holder) {
        await runQuery(`
          MATCH (c:StoryNode)-[r:RELATES_TO { category: 'OWNS' }]->(item:StoryNode { id: $nodeId })
          WHERE c.name <> $holder AND c.id <> $holder
          DELETE r
        `, { nodeId, holder });
        const charId = await findOrCreateProjectEntity(projectId, holder, 'character', {
          role: 'TRUNG LẬP',
          gender: 'Nam',
          desc: `Người sở hữu ${nodeName}`,
          status: 'Còn sống',
        });
        await runQuery(`
          MATCH (item:StoryNode { id: $nodeId })
          MATCH (c:StoryNode { id: $charId })
          MERGE (c)-[r:RELATES_TO { category: 'OWNS' }]->(item)
          ON CREATE SET r.id = 'link-' + c.id + '-' + item.id + '-holder',
                        r.label = 'Sở hữu',
                        r.type = 'solid',
                        r.tone = 'possession',
                        r.createdAt = timestamp()
          ON MATCH SET r.label = 'Sở hữu',
                       r.updatedAt = timestamp()
        `, { nodeId, charId });
      } else {
        await runQuery(`
          MATCH (:StoryNode)-[r:RELATES_TO { category: 'OWNS' }]->(item:StoryNode { id: $nodeId })
          DELETE r
        `, { nodeId });
      }

      // Nguồn gốc -> Location
      const origin = cleanRelationalValue(nodeData.origin);
      if (origin) {
        await runQuery(`
          MATCH (item:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'ORIGIN' }]->(loc:StoryNode)
          WHERE loc.name <> $origin AND loc.id <> $origin
          DELETE r
        `, { nodeId, origin });
        const locId = await findOrCreateProjectEntity(projectId, origin, 'location', {
          role: 'ĐỊA DANH',
          region: 'Miền Đông',
          dangerLevel: 'Bình thường',
          climate: 'Ôn hòa',
          terrain: 'Núi rừng',
          desc: `Nguồn gốc xuất xứ của ${nodeName}`,
          status: 'Hoạt động',
        });
        await runQuery(`
          MATCH (item:StoryNode { id: $nodeId })
          MATCH (loc:StoryNode { id: $locId })
          MERGE (item)-[r:RELATES_TO { category: 'ORIGIN' }]->(loc)
          ON CREATE SET r.id = 'link-' + item.id + '-' + loc.id + '-origin',
                        r.label = 'Nguồn gốc',
                        r.type = 'dashed',
                        r.tone = 'location',
                        r.createdAt = timestamp()
          ON MATCH SET r.label = 'Nguồn gốc',
                       r.updatedAt = timestamp()
        `, { nodeId, locId });
      } else {
        await runQuery(`
          MATCH (item:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'ORIGIN' }]->(:StoryNode)
          DELETE r
        `, { nodeId });
      }
    }

    // 3. TỔ CHỨC (Faction)
    if (nodeType === 'faction') {
      // Người đại diện / Thủ lĩnh -> Character
      const leader = cleanRelationalValue(nodeData.leader);
      if (leader) {
        await runQuery(`
          MATCH (c:StoryNode)-[r:RELATES_TO { category: 'LEADER_OF' }]->(fac:StoryNode { id: $nodeId })
          WHERE c.name <> $leader AND c.id <> $leader
          DELETE r
        `, { nodeId, leader });
        const charId = await findOrCreateProjectEntity(projectId, leader, 'character', {
          role: 'TRUNG LẬP',
          gender: 'Nam',
          desc: `Người đại diện / Thủ lĩnh của ${nodeName}`,
          status: 'Còn sống',
        });
        await runQuery(`
          MATCH (fac:StoryNode { id: $nodeId })
          MATCH (c:StoryNode { id: $charId })
          MERGE (c)-[r:RELATES_TO { category: 'LEADER_OF' }]->(fac)
          ON CREATE SET r.id = 'link-' + c.id + '-' + fac.id + '-leader',
                        r.label = 'Người đại diện / Thủ lĩnh',
                        r.type = 'solid',
                        r.tone = 'loyalty',
                        r.createdAt = timestamp()
          ON MATCH SET r.label = 'Người đại diện / Thủ lĩnh',
                       r.updatedAt = timestamp()
        `, { nodeId, charId });
      } else {
        await runQuery(`
          MATCH (:StoryNode)-[r:RELATES_TO { category: 'LEADER_OF' }]->(fac:StoryNode { id: $nodeId })
          DELETE r
        `, { nodeId });
      }

      // Căn cứ -> Location
      const headquarters = cleanRelationalValue(nodeData.headquarters);
      if (headquarters) {
        await runQuery(`
          MATCH (fac:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'HEADQUARTERS' }]->(loc:StoryNode)
          WHERE loc.name <> $headquarters AND loc.id <> $headquarters
          DELETE r
        `, { nodeId, headquarters });
        const locId = await findOrCreateProjectEntity(projectId, headquarters, 'location', {
          role: 'ĐỊA DANH',
          region: 'Miền Đông',
          dangerLevel: 'An toàn',
          climate: 'Ôn hòa',
          terrain: 'Thành thị',
          desc: `Căn cứ địa của ${nodeName}`,
          status: 'Hoạt động',
        });
        await runQuery(`
          MATCH (fac:StoryNode { id: $nodeId })
          MATCH (loc:StoryNode { id: $locId })
          MERGE (fac)-[r:RELATES_TO { category: 'HEADQUARTERS' }]->(loc)
          ON CREATE SET r.id = 'link-' + fac.id + '-' + loc.id + '-hq',
                        r.label = 'Căn cứ địa',
                        r.type = 'solid',
                        r.tone = 'location',
                        r.createdAt = timestamp()
          ON MATCH SET r.label = 'Căn cứ địa',
                       r.updatedAt = timestamp()
        `, { nodeId, locId });
      } else {
        await runQuery(`
          MATCH (fac:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'HEADQUARTERS' }]->(:StoryNode)
          DELETE r
        `, { nodeId });
      }

      // Sự kiện thay đổi trạng thái -> Event
      const facStatusEvent = cleanRelationalValue(nodeData.statusEvent);
      if (
        facStatusEvent &&
        ['Tạm ngừng', 'Suy tàn'].includes(nodeData.status)
      ) {
        await runQuery(`
          MATCH (fac:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'STATUS_EVENT' }]->(ev:StoryNode)
          WHERE ev.name <> $statusEvent AND ev.id <> $statusEvent
          DELETE r
        `, { nodeId, statusEvent: facStatusEvent });
        const evId = await findOrCreateProjectEntity(projectId, facStatusEvent, 'event', {
          role: 'BIẾN CỐ',
          desc: `Sự kiện làm thay đổi trạng thái của ${nodeName}`,
          status: 'Đã diễn ra',
        });
        await runQuery(`
          MATCH (fac:StoryNode { id: $nodeId })
          MATCH (ev:StoryNode { id: $evId })
          MERGE (fac)-[r:RELATES_TO { category: 'STATUS_EVENT' }]->(ev)
          ON CREATE SET r.id = 'link-' + fac.id + '-' + ev.id + '-event',
                        r.label = 'Trạng thái thay đổi do',
                        r.type = 'solid',
                        r.tone = 'event',
                        r.createdAt = timestamp()
          ON MATCH SET r.label = 'Trạng thái thay đổi do',
                       r.updatedAt = timestamp()
        `, { nodeId, evId });
      } else {
        await runQuery(`
          MATCH (fac:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'STATUS_EVENT' }]->(:StoryNode)
          DELETE r
        `, { nodeId });
      }
    }

    // 4. ĐỊA ĐIỂM (Location)
    if (nodeType === 'location') {
      // Thế lực cai quản -> Faction
      const ruler = cleanRelationalValue(nodeData.ruler);
      if (ruler) {
        await runQuery(`
          MATCH (fac:StoryNode)-[r:RELATES_TO { category: 'RULER_OF' }]->(loc:StoryNode { id: $nodeId })
          WHERE fac.name <> $ruler AND fac.id <> $ruler
          DELETE r
        `, { nodeId, ruler });
        const facId = await findOrCreateProjectEntity(projectId, ruler, 'faction', {
          role: 'TỔ CHỨC',
          subType: 'Trung lập',
          alignment: 'TRUNG LẬP',
          desc: `Thế lực cai quản ${nodeName}`,
          status: 'Đang hoạt động',
        });
        await runQuery(`
          MATCH (loc:StoryNode { id: $nodeId })
          MATCH (fac:StoryNode { id: $facId })
          MERGE (fac)-[r:RELATES_TO { category: 'RULER_OF' }]->(loc)
          ON CREATE SET r.id = 'link-' + fac.id + '-' + loc.id + '-ruler',
                        r.label = 'Cai quản',
                        r.type = 'solid',
                        r.tone = 'sect',
                        r.createdAt = timestamp()
          ON MATCH SET r.label = 'Cai quản',
                       r.updatedAt = timestamp()
        `, { nodeId, facId });
      } else {
        await runQuery(`
          MATCH (:StoryNode)-[r:RELATES_TO { category: 'RULER_OF' }]->(loc:StoryNode { id: $nodeId })
          DELETE r
        `, { nodeId });
      }
    }

    // 5. BIẾN CỐ / SỰ KIỆN (Event)
    if (nodeType === 'event') {
      // 5.1 Nơi diễn ra -> Location
      const location = cleanRelationalValue(nodeData.location);
      if (location) {
        // Xóa các link EVENT_LOCATION cũ không còn khớp
        await runQuery(`
          MATCH (ev:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'EVENT_LOCATION' }]->(loc:StoryNode)
          WHERE loc.name <> $location AND loc.id <> $location
          DELETE r
        `, { nodeId, location });

        const locId = await findOrCreateProjectEntity(projectId, location, 'location', {
          role: 'ĐỊA DANH',
          region: 'Miền Đông',
          dangerLevel: 'Bình thường',
          climate: 'Ôn hòa',
          desc: `Địa danh diễn ra sự kiện ${location}`,
          status: 'Hoạt động',
        });

        // Tạo / cập nhật liên kết EVENT_LOCATION
        await runQuery(`
          MATCH (ev:StoryNode { id: $nodeId })
          MATCH (loc:StoryNode { id: $locId })
          MERGE (ev)-[r:RELATES_TO { category: 'EVENT_LOCATION' }]->(loc)
          ON CREATE SET r.id = 'link-' + ev.id + '-' + loc.id + '-location',
                        r.label = 'Nơi diễn ra',
                        r.type = 'solid',
                        r.tone = 'event',
                        r.createdAt = timestamp()
          ON MATCH SET r.label = 'Nơi diễn ra',
                       r.updatedAt = timestamp()
        `, { nodeId, locId });
      } else {
        await runQuery(`
          MATCH (ev:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'EVENT_LOCATION' }]->(:StoryNode)
          DELETE r
        `, { nodeId });
      }

      // 5.2 Nhân vật tham gia -> Character
      const rawChars = [
        ...parseParticipantNames(nodeData.charactersInvolved),
        ...parseParticipantNames(nodeData.characters),
        ...parseParticipantNames(nodeData.character),
      ];

      const charNames = Array.from(new Set(rawChars.map((s) => String(s).trim()).filter(Boolean)));
      const participantIds = [];
      for (const charName of charNames) {
        const charId = await findOrCreateProjectEntity(projectId, charName, 'character', {
          role: 'TRUNG LẬP',
          gender: 'Nam',
          status: 'Còn sống',
          desc: 'Nhân vật tham gia sự kiện',
        });
        participantIds.push(charId);
      }

      await runQuery(`
        MATCH (ev:StoryNode { id: $nodeId })-[:BELONGS_TO]->(:Project { id: $projectId })
        SET ev._participantSyncLock = coalesce(ev._participantSyncLock, 0) + 1
        WITH ev, coalesce(ev._participantSyncRevision, '') = coalesce($revision, '') AS isCurrent
        OPTIONAL MATCH (c:StoryNode)-[old:RELATES_TO { category: 'PARTICIPATED_IN' }]->(ev)
        WHERE isCurrent AND NOT (c.id IN $participantIds)
        OPTIONAL MATCH (c)-[:BELONGS_TO]->(p:Project { id: $projectId })
        WITH ev, isCurrent, collect(CASE WHEN p IS NOT NULL THEN old ELSE null END) AS staleLinks
        FOREACH (staleLink IN staleLinks | DELETE staleLink)
        OPTIONAL MATCH (participant:StoryNode)-[:BELONGS_TO]->(project:Project { id: $projectId })
        WHERE isCurrent AND participant.id IN $participantIds
        WITH ev, isCurrent, collect(participant) AS participants
        FOREACH (participantNode IN participants |
          MERGE (participantNode)-[participantLink:RELATES_TO { category: 'PARTICIPATED_IN' }]->(ev)
          ON CREATE SET participantLink.id = 'link-' + participantNode.id + '-' + ev.id + '-participated',
                        participantLink.label = 'Tham gia',
                        participantLink.type = 'dashed',
                        participantLink.tone = 'event',
                        participantLink.createdAt = timestamp()
          ON MATCH SET participantLink.label = 'Tham gia',
                       participantLink.updatedAt = timestamp()
        )
        REMOVE ev._participantSyncLock
        RETURN isCurrent
      `, {
        nodeId,
        projectId,
        participantIds,
        revision: nodeData._participantSyncRevision || null,
      });
    }

    // 6. LIÊN KẾT ĐẢO CHIỀU (Reverse auto-link):
    if (nodeType === 'item') {
      // Xóa các link EQUIPPED cũ thuộc dự án này trỏ tới item này mà c.weapon không còn khớp
      await runQuery(`
        MATCH (c:StoryNode { type: 'character' })-[:BELONGS_TO]->(p:Project { id: $projectId })
        MATCH (c)-[r:RELATES_TO { category: 'EQUIPPED' }]->(item:StoryNode { id: $nodeId })
        WHERE coalesce(c.weapon, '') <> item.name AND coalesce(c.weapon, '') <> item.id
        DELETE r
      `, { nodeId, projectId });

      await runQuery(`
        MATCH (c:StoryNode { type: 'character' })-[:BELONGS_TO]->(p:Project { id: $projectId })
        MATCH (item:StoryNode { id: $nodeId })
        WHERE (c.weapon = item.name OR c.weapon = item.id) AND c.weapon IS NOT NULL AND c.weapon <> ''
        MERGE (c)-[r:RELATES_TO { category: 'EQUIPPED' }]->(item)
        ON CREATE SET r.id = 'link-' + c.id + '-' + item.id + '-weapon',
                      r.label = 'Vật dụng',
                      r.type = 'solid',
                      r.tone = 'possession',
                      r.createdAt = timestamp()
      `, { nodeId, projectId });
    } else if (nodeType === 'location') {
      // Xóa các link BIRTHPLACE cũ thuộc dự án này trỏ tới location này mà c.birthplace không còn khớp
      await runQuery(`
        MATCH (c:StoryNode { type: 'character' })-[:BELONGS_TO]->(p:Project { id: $projectId })
        MATCH (c)-[r:RELATES_TO { category: 'BIRTHPLACE' }]->(loc:StoryNode { id: $nodeId })
        WHERE coalesce(c.birthplace, '') <> loc.name AND coalesce(c.birthplace, '') <> loc.id
        DELETE r
      `, { nodeId, projectId });

      await runQuery(`
        MATCH (c:StoryNode { type: 'character' })-[:BELONGS_TO]->(p:Project { id: $projectId })
        MATCH (loc:StoryNode { id: $nodeId })
        WHERE (c.birthplace = loc.name OR c.birthplace = loc.id) AND c.birthplace IS NOT NULL AND c.birthplace <> ''
        MERGE (c)-[r:RELATES_TO { category: 'BIRTHPLACE' }]->(loc)
        ON CREATE SET r.id = 'link-' + c.id + '-' + loc.id + '-birthplace',
                      r.label = 'Nơi sinh',
                      r.type = 'dashed',
                      r.tone = 'location',
                      r.createdAt = timestamp()
      `, { nodeId, projectId });

      // Xóa các link ORIGIN cũ thuộc dự án này trỏ tới location này mà item.origin không còn khớp
      await runQuery(`
        MATCH (item:StoryNode { type: 'item' })-[:BELONGS_TO]->(p:Project { id: $projectId })
        MATCH (item)-[r:RELATES_TO { category: 'ORIGIN' }]->(loc:StoryNode { id: $nodeId })
        WHERE coalesce(item.origin, '') <> loc.name AND coalesce(item.origin, '') <> loc.id
        DELETE r
      `, { nodeId, projectId });

      await runQuery(`
        MATCH (item:StoryNode { type: 'item' })-[:BELONGS_TO]->(p:Project { id: $projectId })
        MATCH (loc:StoryNode { id: $nodeId })
        WHERE (item.origin = loc.name OR item.origin = loc.id) AND item.origin IS NOT NULL AND item.origin <> ''
        MERGE (item)-[r:RELATES_TO { category: 'ORIGIN' }]->(loc)
        ON CREATE SET r.id = 'link-' + item.id + '-' + loc.id + '-origin',
                      r.label = 'Nguồn gốc',
                      r.type = 'dashed',
                      r.tone = 'location',
                      r.createdAt = timestamp()
      `, { nodeId, projectId });

      // Xóa các link EVENT_LOCATION cũ thuộc dự án này trỏ tới location này mà ev.location không còn khớp
      await runQuery(`
        MATCH (ev:StoryNode { type: 'event' })-[:BELONGS_TO]->(p:Project { id: $projectId })
        MATCH (ev)-[r:RELATES_TO { category: 'EVENT_LOCATION' }]->(loc:StoryNode { id: $nodeId })
        WHERE toLower(coalesce(ev.location, '')) <> toLower(loc.name)
          AND coalesce(ev.location, '') <> loc.id
        DELETE r
      `, { nodeId, projectId });

      await runQuery(`
        MATCH (ev:StoryNode { type: 'event' })-[:BELONGS_TO]->(p:Project { id: $projectId })
        MATCH (loc:StoryNode { id: $nodeId })
        WHERE (toLower(ev.location) = toLower(loc.name) OR ev.location = loc.id)
          AND ev.location IS NOT NULL AND ev.location <> ''
        MERGE (ev)-[r:RELATES_TO { category: 'EVENT_LOCATION' }]->(loc)
        ON CREATE SET r.id = 'link-' + ev.id + '-' + loc.id + '-location',
                      r.label = 'Nơi diễn ra',
                      r.type = 'solid',
                      r.tone = 'event',
                      r.createdAt = timestamp()
      `, { nodeId, projectId });
    }
  } catch (syncErr) {
    console.warn('[syncNodeRelationships] Lỗi đồng bộ quan hệ tự động:', syncErr.message);
  }
}

module.exports = {
  getNodesByProject,
  getNodeById,
  createNode,
  updateNode,
  deleteNode,
  syncNodeRelationships,
};
