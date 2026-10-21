const crypto = require('crypto');
const { runQuery } = require('../config/neo4j');

/**
 * Lấy danh sách tất cả Project kèm số lượng node, link, chapter
 */
async function getAllProjects(req, res, next) {
  try {
    const query = `
      MATCH (p:Project)
      OPTIONAL MATCH (n:StoryNode)-[:BELONGS_TO]->(p)
      WITH p, count(DISTINCT n) AS nodeCount
      OPTIONAL MATCH (c:Chapter)-[:BELONGS_TO]->(p)
      WITH p, nodeCount, count(DISTINCT c) AS chapterCount
      OPTIONAL MATCH (n1:StoryNode)-[:BELONGS_TO]->(p)
      OPTIONAL MATCH (n1)-[r:RELATES_TO]->(n2:StoryNode)
      WITH p, nodeCount, chapterCount, count(DISTINCT r) AS linkCount
      RETURN p,
             nodeCount,
             linkCount,
             chapterCount
      ORDER BY p.createdAt DESC
    `;

    const records = await runQuery(query, {}, 'READ');
    const projects = records.map((row) => ({
      ...row.p,
      nodeCount: row.nodeCount || 0,
      linkCount: row.linkCount || 0,
      chapterCount: row.chapterCount || 0,
    }));

    return res.json({ success: true, count: projects.length, data: projects });
  } catch (error) {
    next(error);
  }
}

/**
 * Lấy thông tin chi tiết một Project theo ID
 */
async function getProjectById(req, res, next) {
  const { id } = req.params;
  try {
    const query = `
      MATCH (p:Project { id: $id })
      OPTIONAL MATCH (n:StoryNode)-[:BELONGS_TO]->(p)
      WITH p, count(DISTINCT n) AS nodeCount
      OPTIONAL MATCH (c:Chapter)-[:BELONGS_TO]->(p)
      WITH p, nodeCount, count(DISTINCT c) AS chapterCount
      OPTIONAL MATCH (n1:StoryNode)-[:BELONGS_TO]->(p)
      OPTIONAL MATCH (n1)-[r:RELATES_TO]->(n2:StoryNode)
      WITH p, nodeCount, chapterCount, count(DISTINCT r) AS linkCount
      RETURN p,
             nodeCount,
             linkCount,
             chapterCount
    `;

    const records = await runQuery(query, { id }, 'READ');
    if (!records.length || !records[0].p) {
      return res.status(404).json({ success: false, message: `Không tìm thấy dự án với ID: ${id}` });
    }

    const row = records[0];
    const project = {
      ...row.p,
      nodeCount: row.nodeCount || 0,
      linkCount: row.linkCount || 0,
      chapterCount: row.chapterCount || 0,
    };

    return res.json({ success: true, data: project });
  } catch (error) {
    next(error);
  }
}

/**
 * Tạo một Project mới
 */
async function createProject(req, res, next) {
  const { id, title, genre, number, desc } = req.body || {};

  if (!title) {
    return res.status(400).json({ success: false, message: 'Tiêu đề dự án (title) là bắt buộc' });
  }

  const projectId = id || `project-${crypto.randomUUID().slice(0, 8)}`;
  const now = Date.now();

  try {
    const query = `
      CREATE (p:Project {
        id: $id,
        title: $title,
        genre: $genre,
        number: $number,
        desc: $desc,
        createdAt: $createdAt,
        updatedAt: $updatedAt
      })
      RETURN p
    `;

    const records = await runQuery(query, {
      id: projectId,
      title: title || 'Dự án chưa đặt tên',
      genre: genre || 'Chưa phân loại',
      number: number || '№ 01',
      desc: desc || '',
      createdAt: now,
      updatedAt: now,
    });

    return res.status(201).json({
      success: true,
      message: 'Tạo dự án thành công',
      data: records[0].p,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Cập nhật thông tin Project
 */
async function updateProject(req, res, next) {
  const { id } = req.params;
  const { title, genre, number, desc } = req.body || {};

  try {
    const query = `
      MATCH (p:Project { id: $id })
      SET p.title = COALESCE($title, p.title),
          p.genre = COALESCE($genre, p.genre),
          p.number = COALESCE($number, p.number),
          p.desc = COALESCE($desc, p.desc),
          p.updatedAt = $updatedAt
      RETURN p
    `;

    const records = await runQuery(query, {
      id,
      title: title ?? null,
      genre: genre ?? null,
      number: number ?? null,
      desc: desc ?? null,
      updatedAt: Date.now(),
    });

    if (!records.length || !records[0].p) {
      return res.status(404).json({ success: false, message: `Không tìm thấy dự án với ID: ${id}` });
    }

    return res.json({
      success: true,
      message: 'Cập nhật dự án thành công',
      data: records[0].p,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Xóa một Project và toàn bộ StoryNode, Chapter liên quan
 */
async function deleteProject(req, res, next) {
  const { id } = req.params;
  try {
    const query = `
      MATCH (p:Project { id: $id })
      OPTIONAL MATCH (n:StoryNode)-[:BELONGS_TO]->(p)
      OPTIONAL MATCH (c:Chapter)-[:BELONGS_TO]->(p)
      DETACH DELETE n, c, p
      RETURN count(p) AS deleted
    `;

    const records = await runQuery(query, { id });
    if (!records[0] || records[0].deleted === 0) {
      return res.status(404).json({ success: false, message: `Không tìm thấy dự án với ID: ${id}` });
    }

    return res.json({
      success: true,
      message: `Đã xóa thành công dự án ${id} và toàn bộ dữ liệu đồ thị liên kết`,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
};
