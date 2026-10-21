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

    // 4. Thống kê theo node type
    const stats = {
      totalNodes: nodes.length,
      totalLinks: linkRecords.length,
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
