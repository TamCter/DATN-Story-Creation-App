const crypto = require('crypto');
const { runQuery } = require('../config/neo4j');

/**
 * Lấy tất cả quan hệ (links) trong một Project
 */
async function getLinksByProject(req, res, next) {
  const { projectId } = req.params;

  try {
    const query = `
      MATCH (p:Project { id: $projectId })
      MATCH (s:StoryNode)-[:BELONGS_TO]->(p)
      MATCH (t:StoryNode)-[:BELONGS_TO]->(p)
      MATCH (s)-[r:RELATES_TO]->(t)
      RETURN r.id AS id,
             s.id AS source,
             t.id AS target,
             r.label AS label,
             COALESCE(r.type, 'solid') AS type,
             r.category AS category,
             r.contextNote AS contextNote,
             r.tone AS tone,
             s.name AS sourceName,
             t.name AS targetName
    `;

    const records = await runQuery(query, { projectId }, 'READ');
    return res.json({
      success: true,
      count: records.length,
      projectId,
      data: records,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Lấy thông tin chi tiết một Link theo ID
 */
async function getLinkById(req, res, next) {
  const { id } = req.params;

  try {
    const query = `
      MATCH (s:StoryNode)-[r:RELATES_TO { id: $id }]->(t:StoryNode)
      RETURN r.id AS id,
             s.id AS source,
             t.id AS target,
             r.label AS label,
             COALESCE(r.type, 'solid') AS type,
             r.category AS category,
             r.contextNote AS contextNote,
             r.tone AS tone,
             s.name AS sourceName,
             t.name AS targetName
    `;

    const records = await runQuery(query, { id }, 'READ');
    if (!records.length) {
      return res.status(404).json({ success: false, message: `Không tìm thấy quan hệ với ID: ${id}` });
    }

    return res.json({ success: true, data: records[0] });
  } catch (error) {
    next(error);
  }
}

/**
 * Tạo một mối quan hệ (Link) mới giữa hai StoryNode
 */
async function createLink(req, res, next) {
  const {
    id,
    source,
    target,
    label = '',
    type = 'solid',
    category = '',
    contextNote = '',
    tone = 'loyalty',
  } = req.body;

  if (!source || !target) {
    return res.status(400).json({
      success: false,
      message: 'Node nguồn (source) và node đích (target) là bắt buộc',
    });
  }

  if (source === target) {
    return res.status(400).json({
      success: false,
      message: 'Không thể tạo mối quan hệ tự liên kết đến chính nó',
    });
  }

  const linkId = id || `l-${crypto.randomUUID().slice(0, 8)}`;

  try {
    const query = `
      MATCH (s:StoryNode { id: $source })
      MATCH (t:StoryNode { id: $target })
      MERGE (s)-[r:RELATES_TO { id: $id }]->(t)
      ON CREATE SET
        r.label = $label,
        r.type = $type,
        r.category = $category,
        r.contextNote = $contextNote,
        r.tone = $tone,
        r.createdAt = timestamp()
      ON MATCH SET
        r.label = $label,
        r.type = $type,
        r.category = $category,
        r.contextNote = $contextNote,
        r.tone = $tone,
        r.updatedAt = timestamp()
      RETURN r.id AS id,
             s.id AS source,
             t.id AS target,
             r.label AS label,
             r.type AS type,
             r.category AS category,
             r.contextNote AS contextNote,
             r.tone AS tone,
             s.name AS sourceName,
             t.name AS targetName
    `;

    const records = await runQuery(query, {
      id: linkId,
      source,
      target,
      label,
      type: type || 'solid',
      category: category || '',
      contextNote: contextNote || '',
      tone: tone || 'loyalty',
    });

    if (!records.length) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy node nguồn hoặc node đích tương ứng trong cơ sở dữ liệu',
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Tạo mối liên kết thành công',
      data: records[0],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Cập nhật thông tin của một Link
 */
async function updateLink(req, res, next) {
  const { id } = req.params;
  const { label, type, category, contextNote, tone } = req.body;

  try {
    const query = `
      MATCH (s:StoryNode)-[r:RELATES_TO { id: $id }]->(t:StoryNode)
      SET r.label = COALESCE($label, r.label),
          r.type = COALESCE($type, r.type),
          r.category = COALESCE($category, r.category),
          r.contextNote = COALESCE($contextNote, r.contextNote),
          r.tone = COALESCE($tone, r.tone),
          r.updatedAt = timestamp()
      RETURN r.id AS id,
             s.id AS source,
             t.id AS target,
             r.label AS label,
             r.type AS type,
             r.category AS category,
             r.contextNote AS contextNote,
             r.tone AS tone,
             s.name AS sourceName,
             t.name AS targetName
    `;

    const records = await runQuery(query, {
      id,
      label: label ?? null,
      type: type ?? null,
      category: category ?? null,
      contextNote: contextNote ?? null,
      tone: tone ?? null,
    });

    if (!records.length) {
      return res.status(404).json({ success: false, message: `Không tìm thấy quan hệ với ID: ${id}` });
    }

    return res.json({
      success: true,
      message: 'Cập nhật quan hệ thành công',
      data: records[0],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Xóa một mối quan hệ (Link)
 */
async function deleteLink(req, res, next) {
  const { id } = req.params;

  try {
    const query = `
      MATCH ()-[r:RELATES_TO { id: $id }]->()
      DELETE r
      RETURN count(r) AS deleted
    `;

    const records = await runQuery(query, { id });
    if (!records[0] || records[0].deleted === 0) {
      return res.status(404).json({ success: false, message: `Không tìm thấy quan hệ với ID: ${id}` });
    }

    return res.json({
      success: true,
      message: `Đã xóa thành công liên kết ${id}`,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getLinksByProject,
  getLinkById,
  createLink,
  updateLink,
  deleteLink,
};
