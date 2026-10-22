const crypto = require('crypto');
const { runQuery } = require('../config/neo4j');

/**
 * Lấy danh sách Project thuộc về User hiện tại (hoặc public nếu chưa đăng nhập)
 */
async function getAllProjects(req, res, next) {
  try {
    // Chỉ sử dụng req.user?.id từ Token xác thực, không dùng query hay body
    const userId = req.user?.id;

    let query;
    let params = {};

    if (userId) {
      // Phân tách dự án: Chỉ lấy các dự án thuộc quyền sở hữu của User này
      query = `
        MATCH (u:User { id: $userId })-[:OWNS]->(p:Project)
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
      params = { userId };
    } else {
      // Nếu chưa có token, chỉ xem các dự án mẫu chung (không bị user nào sở hữu riêng)
      query = `
        MATCH (p:Project)
        WHERE NOT (p)<-[:OWNS]-(:User)
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
    }

    const records = await runQuery(query, params, 'READ');
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
 * Lấy thông tin chi tiết một Project theo ID (kiểm tra quyền sở hữu)
 */
async function getProjectById(req, res, next) {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
    const query = `
      MATCH (p:Project { id: $id })
      OPTIONAL MATCH (owner:User)-[:OWNS]->(p)
      OPTIONAL MATCH (n:StoryNode)-[:BELONGS_TO]->(p)
      WITH p, owner, count(DISTINCT n) AS nodeCount
      OPTIONAL MATCH (c:Chapter)-[:BELONGS_TO]->(p)
      WITH p, owner, nodeCount, count(DISTINCT c) AS chapterCount
      OPTIONAL MATCH (n1:StoryNode)-[:BELONGS_TO]->(p)
      OPTIONAL MATCH (n1)-[r:RELATES_TO]->(n2:StoryNode)
      WITH p, owner, nodeCount, chapterCount, count(DISTINCT r) AS linkCount
      RETURN p,
             owner.id AS ownerId,
             nodeCount,
             linkCount,
             chapterCount
    `;

    const records = await runQuery(query, { id }, 'READ');
    if (!records.length || !records[0].p) {
      return res.status(404).json({ success: false, message: `Không tìm thấy dự án với ID: ${id}` });
    }

    const row = records[0];
    // Nếu dự án có chủ sở hữu và không khớp với user đang gọi, từ chối quyền truy cập
    if (row.ownerId && row.ownerId !== userId) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập dự án này' });
    }

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
 * Tạo một Project mới và gắn quyền sở hữu cho User hiện tại
 */
async function createProject(req, res, next) {
  const { id, title, genre, number, desc } = req.body || {};
  // Chỉ lấy userId từ Token xác thực
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Yêu cầu đăng nhập để tạo dự án.' });
  }

  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ success: false, message: 'Tiêu đề dự án (title) là bắt buộc' });
  }

  // Kiểm tra node User có tồn tại trong Neo4j không
  const userCheck = await runQuery('MATCH (u:User { id: $userId }) RETURN u.id AS id', { userId }, 'READ');
  if (!userCheck.length) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin tác giả trong hệ thống.' });
  }

  const projectId = id || `project-${crypto.randomUUID().slice(0, 8)}`;
  const now = Date.now();

  try {
    const query = `
      MATCH (u:User { id: $userId })
      CREATE (u)-[:OWNS]->(p:Project {
        id: $id,
        title: $title,
        genre: $genre,
        number: $number,
        desc: $desc,
        userId: $userId,
        createdAt: $createdAt,
        updatedAt: $updatedAt
      })
      RETURN p
    `;

    const params = {
      id: projectId,
      userId,
      title: title.trim(),
      genre: genre !== undefined && genre !== null ? String(genre).trim() : 'Chưa phân loại',
      number: number !== undefined && number !== null ? String(number).trim() : '№ 01',
      desc: desc !== undefined && desc !== null ? String(desc).trim() : '',
      createdAt: now,
      updatedAt: now,
    };

    const records = await runQuery(query, params, 'WRITE');

    if (!records.length || !records[0]?.p) {
      return res.status(500).json({ success: false, message: 'Không thể tạo dự án' });
    }

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
 * Cập nhật thông tin Project (yêu cầu quyền sở hữu)
 */
async function updateProject(req, res, next) {
  const { id } = req.params;
  const { title, genre, number, desc } = req.body || {};
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Yêu cầu đăng nhập để cập nhật dự án.' });
  }

  try {
    const query = `
      MATCH (u:User { id: $userId })-[:OWNS]->(p:Project { id: $id })
      SET p.title = coalesce($title, p.title),
          p.genre = coalesce($genre, p.genre),
          p.number = coalesce($number, p.number),
          p.desc = coalesce($desc, p.desc),
          p.updatedAt = $updatedAt
      RETURN p
    `;

    // Truyền rõ ràng null nếu thuộc tính bị bỏ qua để tránh lỗi tham số Neo4j
    const params = {
      id,
      userId,
      title: title !== undefined ? title : null,
      genre: genre !== undefined ? genre : null,
      number: number !== undefined ? number : null,
      desc: desc !== undefined ? desc : null,
      updatedAt: Date.now(),
    };

    const records = await runQuery(query, params, 'WRITE');

    if (!records.length || !records[0]?.p) {
      return res.status(404).json({
        success: false,
        message: `Không tìm thấy dự án hoặc bạn không có quyền cập nhật dự án ID: ${id}`,
      });
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
 * Xóa một Project và toàn bộ StoryNode, Chapter liên quan (yêu cầu quyền sở hữu)
 */
async function deleteProject(req, res, next) {
  const { id } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Yêu cầu đăng nhập để xóa dự án.' });
  }

  try {
    // Chỉ cho phép xóa dự án thuộc quyền sở hữu của user đã đăng nhập
    const query = `
      MATCH (u:User { id: $userId })-[:OWNS]->(p:Project { id: $id })
      OPTIONAL MATCH (n:StoryNode)-[:BELONGS_TO]->(p)
      OPTIONAL MATCH (c:Chapter)-[:BELONGS_TO]->(p)
      DETACH DELETE n, c, p
      RETURN count(p) AS deleted
    `;

    const records = await runQuery(query, { id, userId }, 'WRITE');
    if (!records[0] || records[0].deleted === 0) {
      return res.status(404).json({
        success: false,
        message: `Không tìm thấy dự án hoặc bạn không có quyền xóa dự án ID: ${id}`,
      });
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
