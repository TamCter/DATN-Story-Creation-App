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
    if (ownerId && req.user?.id && ownerId !== req.user?.id) {
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

    return res.status(201).json({
      success: true,
      message: 'Tạo Node thành công',
      data: records[0].n,
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
      RETURN n, owner.id AS ownerId
    `;
    const checkResult = await runQuery(checkQuery, { id }, 'READ');
    if (!checkResult.length || !checkResult[0]?.n) {
      return res.status(404).json({ success: false, message: `Không tìm thấy node với ID: ${id}` });
    }
    const ownerId = checkResult[0].ownerId;
    if (ownerId && req.user?.id && ownerId !== req.user?.id) {
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

    return res.json({
      success: true,
      message: 'Cập nhật Node thành công',
      data: records[0].n,
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
    if (ownerId && req.user?.id && ownerId !== req.user?.id) {
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

module.exports = {
  getNodesByProject,
  getNodeById,
  createNode,
  updateNode,
  deleteNode,
};
