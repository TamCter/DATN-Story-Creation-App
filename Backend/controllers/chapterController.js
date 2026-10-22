const crypto = require('crypto');
const { runQuery } = require('../config/neo4j');

/**
 * Lấy danh sách các Chapter của một Project
 */
async function getChaptersByProject(req, res, next) {
  const { projectId } = req.params;

  try {
    const query = `
      MATCH (c:Chapter)-[:BELONGS_TO]->(p:Project { id: $projectId })
      RETURN c
      ORDER BY c.chapterNumber ASC, c.createdAt ASC
    `;

    const records = await runQuery(query, { projectId }, 'READ');
    const chapters = records.map((r) => {
      const chapter = r.c;
      if (typeof chapter.events === 'string') {
        try {
          chapter.events = JSON.parse(chapter.events);
        } catch {
          chapter.events = [];
        }
      }
      return chapter;
    });

    return res.json({
      success: true,
      count: chapters.length,
      projectId,
      data: chapters,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Lấy chi tiết 1 Chapter
 */
async function getChapterById(req, res, next) {
  const { id } = req.params;

  try {
    const query = `
      MATCH (c:Chapter { id: $id })
      OPTIONAL MATCH (c)-[:BELONGS_TO]->(p:Project)
      RETURN c, p.id AS projectId, p.title AS projectTitle
    `;

    const records = await runQuery(query, { id }, 'READ');
    if (!records.length || !records[0].c) {
      return res.status(404).json({ success: false, message: `Không tìm thấy chapter với ID: ${id}` });
    }

    const row = records[0];
    const chapter = row.c;
    if (typeof chapter.events === 'string') {
      try {
        chapter.events = JSON.parse(chapter.events);
      } catch {
        chapter.events = [];
      }
    }

    return res.json({
      success: true,
      data: {
        ...chapter,
        projectId: row.projectId,
        projectTitle: row.projectTitle,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Tạo mới một Chapter trong Project
 */
async function createChapter(req, res, next) {
  const { projectId } = req.params;
  const {
    id,
    chapterNumber,
    code,
    title,
    shortTitle,
    watermark,
    desc = '',
    events = [],
  } = req.body || {};

  if (!title) {
    return res.status(400).json({ success: false, message: 'Tiêu đề chương (title) là bắt buộc' });
  }

  let num = 1;
  if (chapterNumber !== undefined && chapterNumber !== null) {
    if (typeof chapterNumber === 'string' && chapterNumber.trim() === '') {
      return res.status(400).json({ success: false, message: 'Số thứ tự chương (chapterNumber) không hợp lệ' });
    }
    const parsed = Number(chapterNumber);
    if (!Number.isFinite(parsed)) {
      return res.status(400).json({ success: false, message: 'Số thứ tự chương (chapterNumber) không hợp lệ' });
    }
    num = parsed;
  }

  const chapterId = id || `c-${num}-${crypto.randomUUID().slice(0, 6)}`;
  const chapterCode = code || `C${num}`;
  const eventsJson = Array.isArray(events) ? JSON.stringify(events) : JSON.stringify([]);

  try {
    const userId = req.user?.id;
    const projCheckQuery = `
      MATCH (p:Project { id: $projectId })
      OPTIONAL MATCH (owner:User)-[:OWNS]->(p)
      RETURN p, owner.id AS ownerId
    `;
    const projRecords = await runQuery(projCheckQuery, { projectId }, 'READ');
    if (!projRecords.length) {
      return res.status(404).json({ success: false, message: `Không tìm thấy dự án với ID: ${projectId}` });
    }
    if (projRecords[0].ownerId && projRecords[0].ownerId !== userId) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền thêm chương vào dự án này' });
    }

    const createQuery = `
      MATCH (p:Project { id: $projectId })
      CREATE (c:Chapter {
        id: $id,
        chapterNumber: $chapterNumber,
        code: $code,
        title: $title,
        shortTitle: $shortTitle,
        watermark: $watermark,
        desc: $desc,
        events: $events,
        createdAt: timestamp(),
        updatedAt: timestamp()
      })
      CREATE (c)-[:BELONGS_TO]->(p)
      RETURN c
    `;

    const records = await runQuery(createQuery, {
      projectId,
      id: chapterId,
      chapterNumber: num,
      code: chapterCode,
      title,
      shortTitle: shortTitle || `${chapterCode} ${title}`,
      watermark: watermark || title.toUpperCase(),
      desc,
      events: eventsJson,
    });

    const resultChapter = records[0].c;
    resultChapter.events = Array.isArray(events) ? events : [];

    return res.status(201).json({
      success: true,
      message: 'Tạo Chapter thành công',
      data: resultChapter,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Cập nhật thông tin Chapter
 */
async function updateChapter(req, res, next) {
  const { id } = req.params;
  const { chapterNumber, code, title, shortTitle, watermark, desc, events } = req.body || {};

  let parsedChapterNumber = null;
  if (chapterNumber !== undefined) {
    parsedChapterNumber = Number(chapterNumber);
    if (!Number.isFinite(parsedChapterNumber)) {
      return res.status(400).json({ success: false, message: 'Số thứ tự chương (chapterNumber) không hợp lệ' });
    }
  }

  try {
    const query = `
      MATCH (c:Chapter { id: $id })
      SET c.chapterNumber = COALESCE($chapterNumber, c.chapterNumber),
          c.code = COALESCE($code, c.code),
          c.title = COALESCE($title, c.title),
          c.shortTitle = COALESCE($shortTitle, c.shortTitle),
          c.watermark = COALESCE($watermark, c.watermark),
          c.desc = COALESCE($desc, c.desc),
          c.events = CASE WHEN $events IS NOT NULL THEN $events ELSE c.events END,
          c.updatedAt = timestamp()
      RETURN c
    `;

    const records = await runQuery(query, {
      id,
      chapterNumber: parsedChapterNumber,
      code: code ?? null,
      title: title ?? null,
      shortTitle: shortTitle ?? null,
      watermark: watermark ?? null,
      desc: desc ?? null,
      events: events !== undefined ? JSON.stringify(events) : null,
    });

    if (!records.length || !records[0].c) {
      return res.status(404).json({ success: false, message: `Không tìm thấy chapter với ID: ${id}` });
    }

    const updated = records[0].c;
    if (typeof updated.events === 'string') {
      try {
        updated.events = JSON.parse(updated.events);
      } catch {
        updated.events = [];
      }
    }

    return res.json({
      success: true,
      message: 'Cập nhật Chapter thành công',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Xóa một Chapter
 */
async function deleteChapter(req, res, next) {
  const { id } = req.params;

  try {
    const query = `
      MATCH (c:Chapter { id: $id })
      DETACH DELETE c
      RETURN count(c) AS deleted
    `;

    const records = await runQuery(query, { id });
    if (!records[0] || records[0].deleted === 0) {
      return res.status(404).json({ success: false, message: `Không tìm thấy chapter với ID: ${id}` });
    }

    return res.json({
      success: true,
      message: `Đã xóa thành công chapter ${id}`,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getChaptersByProject,
  getChapterById,
  createChapter,
  updateChapter,
  deleteChapter,
};
