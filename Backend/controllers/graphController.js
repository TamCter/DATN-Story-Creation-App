const { runQuery } = require('../config/neo4j');

/**
 * Lấy toàn bộ đồ thị (Nodes + Links) của một dự án để hiển thị lên Canvas
 */
async function getProjectGraph(req, res, next) {
  const { projectId } = req.params;

  try {
    // 1. Lấy thông tin dự án
    const projectQuery = `MATCH (p:Project { id: $projectId }) RETURN p`;
    const projectRecords = await runQuery(projectQuery, { projectId }, 'READ');
    if (!projectRecords.length) {
      return res.status(404).json({ success: false, message: `Không tìm thấy dự án với ID: ${projectId}` });
    }

    // 2. Lấy toàn bộ nodes của dự án
    const nodesQuery = `
      MATCH (n:StoryNode)-[:BELONGS_TO]->(p:Project { id: $projectId })
      RETURN n
    `;
    const nodeRecords = await runQuery(nodesQuery, { projectId }, 'READ');
    const nodes = nodeRecords.map((r) => r.n);

    // 2.5 Tự động liên kết các node có quan hệ thuộc tính (Binh khí, Nơi sinh, Nguồn gốc, Nơi diễn ra...) nếu chưa có link
    try {
      const syncCypher = `
        MATCH (p:Project { id: $projectId })
        // Nhân vật -> Binh khí (Item)
        OPTIONAL MATCH (c:StoryNode { type: 'character' })-[:BELONGS_TO]->(p), (item:StoryNode { type: 'item' })-[:BELONGS_TO]->(p)
        WHERE (c.weapon = item.name OR c.weapon = item.id) AND c.weapon IS NOT NULL AND c.weapon <> ''
        FOREACH (_ IN CASE WHEN c IS NOT NULL AND item IS NOT NULL THEN [1] ELSE [] END |
          MERGE (c)-[r1:RELATES_TO { category: 'EQUIPPED' }]->(item)
          ON CREATE SET r1.id = 'link-' + c.id + '-' + item.id + '-weapon', r1.label = 'Binh khí', r1.type = 'solid', r1.tone = 'possession', r1.createdAt = timestamp()
        )
        // Nhân vật -> Nơi sinh (Location)
        WITH p
        OPTIONAL MATCH (c:StoryNode { type: 'character' })-[:BELONGS_TO]->(p), (loc:StoryNode { type: 'location' })-[:BELONGS_TO]->(p)
        WHERE (c.birthplace = loc.name OR c.birthplace = loc.id) AND c.birthplace IS NOT NULL AND c.birthplace <> ''
        FOREACH (_ IN CASE WHEN c IS NOT NULL AND loc IS NOT NULL THEN [1] ELSE [] END |
          MERGE (c)-[r2:RELATES_TO { category: 'BIRTHPLACE' }]->(loc)
          ON CREATE SET r2.id = 'link-' + c.id + '-' + loc.id + '-birthplace', r2.label = 'Nơi sinh', r2.type = 'dashed', r2.tone = 'location', r2.createdAt = timestamp()
        )
        // Nhân vật -> Môn phái (Faction)
        WITH p
        OPTIONAL MATCH (c:StoryNode { type: 'character' })-[:BELONGS_TO]->(p), (fac:StoryNode { type: 'faction' })-[:BELONGS_TO]->(p)
        WHERE (c.sect = fac.name OR c.sect = fac.id) AND c.sect IS NOT NULL AND c.sect <> ''
        FOREACH (_ IN CASE WHEN c IS NOT NULL AND fac IS NOT NULL THEN [1] ELSE [] END |
          MERGE (c)-[r3:RELATES_TO { category: 'MEMBER_OF' }]->(fac)
          ON CREATE SET r3.id = 'link-' + c.id + '-' + fac.id + '-sect', r3.label = 'Môn phái', r3.type = 'solid', r3.tone = 'sect', r3.createdAt = timestamp()
        )
        // Vật phẩm -> Nguồn gốc (Location)
        WITH p
        OPTIONAL MATCH (item:StoryNode { type: 'item' })-[:BELONGS_TO]->(p), (loc:StoryNode { type: 'location' })-[:BELONGS_TO]->(p)
        WHERE (item.origin = loc.name OR item.origin = loc.id) AND item.origin IS NOT NULL AND item.origin <> ''
        FOREACH (_ IN CASE WHEN item IS NOT NULL AND loc IS NOT NULL THEN [1] ELSE [] END |
          MERGE (item)-[r4:RELATES_TO { category: 'ORIGIN' }]->(loc)
          ON CREATE SET r4.id = 'link-' + item.id + '-' + loc.id + '-origin', r4.label = 'Nguồn gốc', r4.type = 'dashed', r4.tone = 'location', r4.createdAt = timestamp()
        )
        // Sự kiện -> Nơi diễn ra (Location)
        WITH p
        OPTIONAL MATCH (ev:StoryNode { type: 'event' })-[:BELONGS_TO]->(p), (loc:StoryNode { type: 'location' })-[:BELONGS_TO]->(p)
        WHERE (ev.location = loc.name OR ev.location = loc.id) AND ev.location IS NOT NULL AND ev.location <> ''
        FOREACH (_ IN CASE WHEN ev IS NOT NULL AND loc IS NOT NULL THEN [1] ELSE [] END |
          MERGE (ev)-[r5:RELATES_TO { category: 'EVENT_LOCATION' }]->(loc)
          ON CREATE SET r5.id = 'link-' + ev.id + '-' + loc.id + '-location', r5.label = 'Nơi diễn ra', r5.type = 'solid', r5.tone = 'event', r5.createdAt = timestamp()
        )
        RETURN count(p) AS synced
      `;
      await runQuery(syncCypher, { projectId });
    } catch (e) {
      console.warn('[getProjectGraph] Lỗi auto-heal links:', e.message);
    }

    // 3. Lấy toàn bộ links giữa các nodes trong dự án
    const linksQuery = `
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
             r.tone AS tone
    `;
    const linkRecords = await runQuery(linksQuery, { projectId }, 'READ');

    // 3.5 Lấy chapters của dự án
    const chaptersQuery = `
      MATCH (c:Chapter)-[:BELONGS_TO]->(p:Project { id: $projectId })
      RETURN c
      ORDER BY c.chapterNumber ASC, c.createdAt ASC
    `;
    const chapterRecords = await runQuery(chaptersQuery, { projectId }, 'READ');
    const chapters = chapterRecords.map((r) => {
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

    // 4. Thống kê theo node type
    const stats = {
      totalNodes: nodes.length,
      totalLinks: linkRecords.length,
      totalChapters: chapters.length,
      characters: nodes.filter((n) => n.type === 'character').length,
      items: nodes.filter((n) => n.type === 'item').length,
      factions: nodes.filter((n) => n.type === 'faction').length,
      events: nodes.filter((n) => n.type === 'event').length,
      locations: nodes.filter((n) => n.type === 'location').length,
    };

    return res.json({
      success: true,
      data: {
        project: projectRecords[0].p,
        nodes,
        links: linkRecords,
        chapters,
        stats,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Tìm đường đi ngắn nhất (Shortest Path) giữa 2 nhân vật / thực thể trong cốt truyện
 */
async function getShortestPath(req, res, next) {
  const { source, target } = req.query;

  if (!source || !target) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng truyền param query ?source=...&target=...',
    });
  }

  if (source === target) {
    return res.status(400).json({
      success: false,
      message: 'Node nguồn (source) và node đích (target) không được trùng nhau',
    });
  }

  try {
    const query = `
      MATCH (s:StoryNode { id: $source })
      MATCH (t:StoryNode { id: $target })
      MATCH p = shortestPath((s)-[:RELATES_TO*..10]-(t))
      RETURN [n IN nodes(p) | n] AS pathNodes,
             [r IN relationships(p) | {
               id: r.id,
               label: r.label,
               type: r.type,
               category: r.category,
               source: startNode(r).id,
               target: endNode(r).id
             }] AS pathLinks,
             length(p) AS length
    `;

    const records = await runQuery(query, { source, target }, 'READ');
    if (!records.length) {
      return res.json({
        success: true,
        message: 'Không tìm thấy liên kết giữa hai thực thể này',
        data: null,
      });
    }

    const { pathNodes, pathLinks, length } = records[0];
    return res.json({
      success: true,
      data: {
        length,
        nodes: pathNodes,
        links: pathLinks,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Lấy vùng lân cận (Neighborhood / Subgraph) của một Node theo bán kính bước nhảy (depth = 1 hoặc 2)
 */
async function getNodeNeighborhood(req, res, next) {
  const { id } = req.params;
  const rawDepth = parseInt(req.query.depth, 10);
  const depth = Number.isInteger(rawDepth) ? Math.min(Math.max(rawDepth, 1), 3) : 1;

  try {
    const query = `
      MATCH (center:StoryNode { id: $id })
      OPTIONAL MATCH path = (center)-[:RELATES_TO*1..${depth}]-(neighbor:StoryNode)
      WITH center, collect(path) AS paths
      UNWIND (CASE WHEN size(paths) = 0 THEN [null] ELSE paths END) AS p
      RETURN center,
             collect(DISTINCT CASE WHEN p IS NOT NULL THEN endNode(p) END) AS neighbors,
             collect(DISTINCT CASE WHEN p IS NOT NULL THEN relationships(p) END) AS rels
    `;

    const records = await runQuery(query, { id }, 'READ');
    if (!records.length || !records[0] || !records[0].center) {
      return res.status(404).json({ success: false, message: `Không tìm thấy node với ID: ${id}` });
    }

    return res.json({ success: true, data: records[0] });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getProjectGraph,
  getShortestPath,
  getNodeNeighborhood,
};
