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

/**
 * Tạo mới một StoryNode trong Project
 */
async function createNode(req, res, next) {
  const { projectId } = req.params;
  const {
    id,
    name,
    type = 'character',
    role = '',
    desc = '',
    subType = '',
    x = 100,
    y = 100,
    ...extraProps
  } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, message: 'Tên node (name) là bắt buộc' });
  }

  const validTypes = ['character', 'item', 'faction', 'event', 'location'];
  const normalizedType = validTypes.includes(type.toLowerCase()) ? type.toLowerCase() : 'character';
  const nodeId = id || `${normalizedType}-${crypto.randomUUID().slice(0, 8)}`;
  const secondaryLabel = TYPE_LABELS[normalizedType] || 'Entity';

  try {
    // Kiểm tra xem Project có tồn tại không
    const checkQuery = `MATCH (p:Project { id: $projectId }) RETURN p`;
    const checkResult = await runQuery(checkQuery, { projectId }, 'READ');
    if (!checkResult.length) {
      return res.status(404).json({ success: false, message: `Không tìm thấy project với ID: ${projectId}` });
    }

    const nodeProperties = {
      id: nodeId,
      name,
      type: normalizedType,
      role: role || '',
      desc: desc || '',
      subType: subType || '',
      x: Number(x) || 100,
      y: Number(y) || 100,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...extraProps,
    };

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
  const updates = { ...req.body };
  delete updates.id; // không cho sửa id
  updates.updatedAt = Date.now();

  if (updates.x !== undefined) updates.x = Number(updates.x);
  if (updates.y !== undefined) updates.y = Number(updates.y);

  try {
    const query = `
      MATCH (n:StoryNode { id: $id })
      SET n += $updates
      RETURN n
    `;

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
