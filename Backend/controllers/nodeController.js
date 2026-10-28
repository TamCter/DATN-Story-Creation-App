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

/**
 * Tự động đồng bộ các mối quan hệ (edges) trong Neo4j đồ thị:
 * - Nhân vật gán Binh khí (Item), Nơi sinh (Location), Môn phái (Faction), Sự kiện tử nạn/hồi sinh (Event)
 * - Vật phẩm gán Nguồn gốc (Location), Người giữ (Character)
 * - Phe phái gán Minh chủ (Character), Căn cứ (Location), Biến cố suy tàn (Event)
 * - Sự kiện gán Nơi diễn ra (Location)
 * - Địa điểm gán Thế lực cai quản (Faction)
 */
async function syncNodeRelationships(nodeId, projectId, nodeData) {
  if (!nodeId || !projectId || !nodeData) return;

  try {
    const nodeType = nodeData.type;

    // 1. NHÂN VẬT (Character)
    if (nodeType === 'character') {
      // Binh khí -> Item
      if (nodeData.weapon && String(nodeData.weapon).trim()) {
        const weapon = String(nodeData.weapon).trim();
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'EQUIPPED' }]->(item:StoryNode)
          WHERE item.name <> $weapon AND item.id <> $weapon
          DELETE r
        `, { nodeId, weapon });
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })-[:BELONGS_TO]->(p:Project { id: $projectId })
          MATCH (item:StoryNode { type: 'item' })-[:BELONGS_TO]->(p)
          WHERE item.name = $weapon OR item.id = $weapon
          MERGE (c)-[r:RELATES_TO { category: 'EQUIPPED' }]->(item)
          ON CREATE SET r.id = 'link-' + c.id + '-' + item.id + '-weapon',
                        r.label = 'Binh khí',
                        r.type = 'solid',
                        r.tone = 'possession',
                        r.createdAt = timestamp()
          ON MATCH SET r.label = 'Binh khí',
                       r.updatedAt = timestamp()
        `, { nodeId, projectId, weapon });
      } else {
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'EQUIPPED' }]->(:StoryNode)
          DELETE r
        `, { nodeId });
      }

      // Nơi sinh -> Location
      if (nodeData.birthplace && String(nodeData.birthplace).trim()) {
        const birthplace = String(nodeData.birthplace).trim();
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'BIRTHPLACE' }]->(loc:StoryNode)
          WHERE loc.name <> $birthplace AND loc.id <> $birthplace
          DELETE r
        `, { nodeId, birthplace });
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })-[:BELONGS_TO]->(p:Project { id: $projectId })
          MATCH (loc:StoryNode { type: 'location' })-[:BELONGS_TO]->(p)
          WHERE loc.name = $birthplace OR loc.id = $birthplace
          MERGE (c)-[r:RELATES_TO { category: 'BIRTHPLACE' }]->(loc)
          ON CREATE SET r.id = 'link-' + c.id + '-' + loc.id + '-birthplace',
                        r.label = 'Nơi sinh',
                        r.type = 'dashed',
                        r.tone = 'location',
                        r.createdAt = timestamp()
          ON MATCH SET r.label = 'Nơi sinh',
                       r.updatedAt = timestamp()
        `, { nodeId, projectId, birthplace });
      } else {
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'BIRTHPLACE' }]->(:StoryNode)
          DELETE r
        `, { nodeId });
      }

      // Môn phái -> Faction
      if (nodeData.sect && String(nodeData.sect).trim()) {
        const sect = String(nodeData.sect).trim();
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'MEMBER_OF' }]->(fac:StoryNode)
          WHERE fac.name <> $sect AND fac.id <> $sect
          DELETE r
        `, { nodeId, sect });
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })-[:BELONGS_TO]->(p:Project { id: $projectId })
          MATCH (fac:StoryNode { type: 'faction' })-[:BELONGS_TO]->(p)
          WHERE fac.name = $sect OR fac.id = $sect
          MERGE (c)-[r:RELATES_TO { category: 'MEMBER_OF' }]->(fac)
          ON CREATE SET r.id = 'link-' + c.id + '-' + fac.id + '-sect',
                        r.label = 'Môn phái',
                        r.type = 'solid',
                        r.tone = 'sect',
                        r.createdAt = timestamp()
          ON MATCH SET r.label = 'Môn phái',
                       r.updatedAt = timestamp()
        `, { nodeId, projectId, sect });
      } else {
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'MEMBER_OF' }]->(:StoryNode)
          DELETE r
        `, { nodeId });
      }

      // Biến cố tử nạn / hồi sinh -> Event
      if (nodeData.statusEvent && String(nodeData.statusEvent).trim() && (nodeData.status === 'Đã chết' || nodeData.status === 'Hồi sinh')) {
        const statusEvent = String(nodeData.statusEvent).trim();
        const evLabel = nodeData.status === 'Đã chết' ? 'Tử nạn tại' : 'Hồi sinh tại';
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'STATUS_EVENT' }]->(ev:StoryNode)
          WHERE ev.name <> $statusEvent AND ev.id <> $statusEvent
          DELETE r
        `, { nodeId, statusEvent });
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })-[:BELONGS_TO]->(p:Project { id: $projectId })
          MATCH (ev:StoryNode { type: 'event' })-[:BELONGS_TO]->(p)
          WHERE ev.name = $statusEvent OR ev.id = $statusEvent
          MERGE (c)-[r:RELATES_TO { category: 'STATUS_EVENT' }]->(ev)
          ON CREATE SET r.id = 'link-' + c.id + '-' + ev.id + '-event',
                        r.label = $evLabel,
                        r.type = 'solid',
                        r.tone = 'event',
                        r.createdAt = timestamp()
          ON MATCH SET r.label = $evLabel,
                       r.updatedAt = timestamp()
        `, { nodeId, projectId, statusEvent, evLabel });
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
      if (nodeData.holderOrLocation && String(nodeData.holderOrLocation).trim()) {
        const holder = String(nodeData.holderOrLocation).trim();
        await runQuery(`
          MATCH (c:StoryNode)-[r:RELATES_TO { category: 'OWNS' }]->(item:StoryNode { id: $nodeId })
          WHERE c.name <> $holder AND c.id <> $holder
          DELETE r
        `, { nodeId, holder });
        await runQuery(`
          MATCH (item:StoryNode { id: $nodeId })-[:BELONGS_TO]->(p:Project { id: $projectId })
          MATCH (c:StoryNode { type: 'character' })-[:BELONGS_TO]->(p)
          WHERE c.name = $holder OR c.id = $holder
          MERGE (c)-[r:RELATES_TO { category: 'OWNS' }]->(item)
          ON CREATE SET r.id = 'link-' + c.id + '-' + item.id + '-holder',
                        r.label = 'Sở hữu',
                        r.type = 'solid',
                        r.tone = 'possession',
                        r.createdAt = timestamp()
          ON MATCH SET r.label = 'Sở hữu',
                       r.updatedAt = timestamp()
        `, { nodeId, projectId, holder });
      } else {
        await runQuery(`
          MATCH (:StoryNode)-[r:RELATES_TO { category: 'OWNS' }]->(item:StoryNode { id: $nodeId })
          DELETE r
        `, { nodeId });
      }

      // Nguồn gốc -> Location
      if (nodeData.origin && String(nodeData.origin).trim()) {
        const origin = String(nodeData.origin).trim();
        await runQuery(`
          MATCH (item:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'ORIGIN' }]->(loc:StoryNode)
          WHERE loc.name <> $origin AND loc.id <> $origin
          DELETE r
        `, { nodeId, origin });
        await runQuery(`
          MATCH (item:StoryNode { id: $nodeId })-[:BELONGS_TO]->(p:Project { id: $projectId })
          MATCH (loc:StoryNode { type: 'location' })-[:BELONGS_TO]->(p)
          WHERE loc.name = $origin OR loc.id = $origin
          MERGE (item)-[r:RELATES_TO { category: 'ORIGIN' }]->(loc)
          ON CREATE SET r.id = 'link-' + item.id + '-' + loc.id + '-origin',
                        r.label = 'Nguồn gốc',
                        r.type = 'dashed',
                        r.tone = 'location',
                        r.createdAt = timestamp()
          ON MATCH SET r.label = 'Nguồn gốc',
                       r.updatedAt = timestamp()
        `, { nodeId, projectId, origin });
      } else {
        await runQuery(`
          MATCH (item:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'ORIGIN' }]->(:StoryNode)
          DELETE r
        `, { nodeId });
      }
    }

    // 3. PHE PHÁI (Faction)
    if (nodeType === 'faction') {
      // Minh chủ / Thủ lĩnh -> Character
      if (nodeData.leader && String(nodeData.leader).trim()) {
        const leader = String(nodeData.leader).trim();
        await runQuery(`
          MATCH (c:StoryNode)-[r:RELATES_TO { category: 'LEADER_OF' }]->(fac:StoryNode { id: $nodeId })
          WHERE c.name <> $leader AND c.id <> $leader
          DELETE r
        `, { nodeId, leader });
        await runQuery(`
          MATCH (fac:StoryNode { id: $nodeId })-[:BELONGS_TO]->(p:Project { id: $projectId })
          MATCH (c:StoryNode { type: 'character' })-[:BELONGS_TO]->(p)
          WHERE c.name = $leader OR c.id = $leader
          MERGE (c)-[r:RELATES_TO { category: 'LEADER_OF' }]->(fac)
          ON CREATE SET r.id = 'link-' + c.id + '-' + fac.id + '-leader',
                        r.label = 'Minh chủ / Thủ lĩnh',
                        r.type = 'solid',
                        r.tone = 'loyalty',
                        r.createdAt = timestamp()
          ON MATCH SET r.label = 'Minh chủ / Thủ lĩnh',
                       r.updatedAt = timestamp()
        `, { nodeId, projectId, leader });
      } else {
        await runQuery(`
          MATCH (:StoryNode)-[r:RELATES_TO { category: 'LEADER_OF' }]->(fac:StoryNode { id: $nodeId })
          DELETE r
        `, { nodeId });
      }

      // Căn cứ -> Location
      if (nodeData.headquarters && String(nodeData.headquarters).trim()) {
        const headquarters = String(nodeData.headquarters).trim();
        await runQuery(`
          MATCH (fac:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'HEADQUARTERS' }]->(loc:StoryNode)
          WHERE loc.name <> $headquarters AND loc.id <> $headquarters
          DELETE r
        `, { nodeId, headquarters });
        await runQuery(`
          MATCH (fac:StoryNode { id: $nodeId })-[:BELONGS_TO]->(p:Project { id: $projectId })
          MATCH (loc:StoryNode { type: 'location' })-[:BELONGS_TO]->(p)
          WHERE loc.name = $headquarters OR loc.id = $headquarters
          MERGE (fac)-[r:RELATES_TO { category: 'HEADQUARTERS' }]->(loc)
          ON CREATE SET r.id = 'link-' + fac.id + '-' + loc.id + '-hq',
                        r.label = 'Căn cứ địa',
                        r.type = 'solid',
                        r.tone = 'location',
                        r.createdAt = timestamp()
          ON MATCH SET r.label = 'Căn cứ địa',
                       r.updatedAt = timestamp()
        `, { nodeId, projectId, headquarters });
      } else {
        await runQuery(`
          MATCH (fac:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'HEADQUARTERS' }]->(:StoryNode)
          DELETE r
        `, { nodeId });
      }

      // Biến cố suy tàn -> Event
      if (nodeData.statusEvent && String(nodeData.statusEvent).trim() && nodeData.status === 'Suy tàn') {
        const statusEvent = String(nodeData.statusEvent).trim();
        await runQuery(`
          MATCH (fac:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'STATUS_EVENT' }]->(ev:StoryNode)
          WHERE ev.name <> $statusEvent AND ev.id <> $statusEvent
          DELETE r
        `, { nodeId, statusEvent });
        await runQuery(`
          MATCH (fac:StoryNode { id: $nodeId })-[:BELONGS_TO]->(p:Project { id: $projectId })
          MATCH (ev:StoryNode { type: 'event' })-[:BELONGS_TO]->(p)
          WHERE ev.name = $statusEvent OR ev.id = $statusEvent
          MERGE (fac)-[r:RELATES_TO { category: 'STATUS_EVENT' }]->(ev)
          ON CREATE SET r.id = 'link-' + fac.id + '-' + ev.id + '-event',
                        r.label = 'Suy tàn bởi',
                        r.type = 'solid',
                        r.tone = 'event',
                        r.createdAt = timestamp()
          ON MATCH SET r.label = 'Suy tàn bởi',
                       r.updatedAt = timestamp()
        `, { nodeId, projectId, statusEvent });
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
      if (nodeData.ruler && String(nodeData.ruler).trim()) {
        const ruler = String(nodeData.ruler).trim();
        await runQuery(`
          MATCH (fac:StoryNode)-[r:RELATES_TO { category: 'RULER_OF' }]->(loc:StoryNode { id: $nodeId })
          WHERE fac.name <> $ruler AND fac.id <> $ruler
          DELETE r
        `, { nodeId, ruler });
        await runQuery(`
          MATCH (loc:StoryNode { id: $nodeId })-[:BELONGS_TO]->(p:Project { id: $projectId })
          MATCH (fac:StoryNode { type: 'faction' })-[:BELONGS_TO]->(p)
          WHERE fac.name = $ruler OR fac.id = $ruler
          MERGE (fac)-[r:RELATES_TO { category: 'RULER_OF' }]->(loc)
          ON CREATE SET r.id = 'link-' + fac.id + '-' + loc.id + '-ruler',
                        r.label = 'Cai quản',
                        r.type = 'solid',
                        r.tone = 'sect',
                        r.createdAt = timestamp()
          ON MATCH SET r.label = 'Cai quản',
                       r.updatedAt = timestamp()
        `, { nodeId, projectId, ruler });
      } else {
        await runQuery(`
          MATCH (:StoryNode)-[r:RELATES_TO { category: 'RULER_OF' }]->(loc:StoryNode { id: $nodeId })
          DELETE r
        `, { nodeId });
      }
    }

    // 5. BIẾN CỐ / SỰ KIỆN (Event)
    if (nodeType === 'event') {
      // Nơi diễn ra -> Location
      if (nodeData.location && String(nodeData.location).trim()) {
        const location = String(nodeData.location).trim();
        await runQuery(`
          MATCH (ev:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'EVENT_LOCATION' }]->(loc:StoryNode)
          WHERE loc.name <> $location AND loc.id <> $location
          DELETE r
        `, { nodeId, location });
        await runQuery(`
          MATCH (ev:StoryNode { id: $nodeId })-[:BELONGS_TO]->(p:Project { id: $projectId })
          MATCH (loc:StoryNode { type: 'location' })-[:BELONGS_TO]->(p)
          WHERE loc.name = $location OR loc.id = $location
          MERGE (ev)-[r:RELATES_TO { category: 'EVENT_LOCATION' }]->(loc)
          ON CREATE SET r.id = 'link-' + ev.id + '-' + loc.id + '-location',
                        r.label = 'Nơi diễn ra',
                        r.type = 'solid',
                        r.tone = 'event',
                        r.createdAt = timestamp()
          ON MATCH SET r.label = 'Nơi diễn ra',
                       r.updatedAt = timestamp()
        `, { nodeId, projectId, location });
      } else {
        await runQuery(`
          MATCH (ev:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'EVENT_LOCATION' }]->(:StoryNode)
          DELETE r
        `, { nodeId });
      }
    }

    // 6. LIÊN KẾT ĐẢO CHIỀU (Reverse auto-link):
    if (nodeType === 'item') {
      await runQuery(`
        MATCH (c:StoryNode { type: 'character' })-[:BELONGS_TO]->(p:Project { id: $projectId })
        MATCH (item:StoryNode { id: $nodeId })
        WHERE c.weapon = item.name OR c.weapon = item.id
        MERGE (c)-[r:RELATES_TO { category: 'EQUIPPED' }]->(item)
        ON CREATE SET r.id = 'link-' + c.id + '-' + item.id + '-weapon',
                      r.label = 'Binh khí',
                      r.type = 'solid',
                      r.tone = 'possession',
                      r.createdAt = timestamp()
      `, { nodeId, projectId });
    } else if (nodeType === 'location') {
      await runQuery(`
        MATCH (c:StoryNode { type: 'character' })-[:BELONGS_TO]->(p:Project { id: $projectId })
        MATCH (loc:StoryNode { id: $nodeId })
        WHERE c.birthplace = loc.name OR c.birthplace = loc.id
        MERGE (c)-[r:RELATES_TO { category: 'BIRTHPLACE' }]->(loc)
        ON CREATE SET r.id = 'link-' + c.id + '-' + loc.id + '-birthplace',
                      r.label = 'Nơi sinh',
                      r.type = 'dashed',
                      r.tone = 'location',
                      r.createdAt = timestamp()
      `, { nodeId, projectId });

      await runQuery(`
        MATCH (item:StoryNode { type: 'item' })-[:BELONGS_TO]->(p:Project { id: $projectId })
        MATCH (loc:StoryNode { id: $nodeId })
        WHERE item.origin = loc.name OR item.origin = loc.id
        MERGE (item)-[r:RELATES_TO { category: 'ORIGIN' }]->(loc)
        ON CREATE SET r.id = 'link-' + item.id + '-' + loc.id + '-origin',
                      r.label = 'Nguồn gốc',
                      r.type = 'dashed',
                      r.tone = 'location',
                      r.createdAt = timestamp()
      `, { nodeId, projectId });

      await runQuery(`
        MATCH (ev:StoryNode { type: 'event' })-[:BELONGS_TO]->(p:Project { id: $projectId })
        MATCH (loc:StoryNode { id: $nodeId })
        WHERE ev.location = loc.name OR ev.location = loc.id
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
