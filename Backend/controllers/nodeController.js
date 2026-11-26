const crypto = require('crypto');
const { runQuery, runWriteTransaction } = require('../config/neo4j');

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
  'age',
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
  'members',
  'seniorMembers',
  'subFactions',
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
  'eventType',
  'importance',
  'arcName',
  'sequenceOrder',
  'cause',
  'conflict',
  'outcome',
  'consequences',
  'itemsInvolved',
  'factionsInvolved',
  'characterRoles',
  'timelineType',
  'duration',
  // Status Event cause
  'statusEvent',
]);

const {
  calculateAgeFromDob,
  formatDateDDMMYYYY,
} = require('../utils/dateUtils');

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
  if (Array.isArray(body.itemsInvolved)) {
    body.itemsInvolved = JSON.stringify(body.itemsInvolved);
  }
  if (Array.isArray(body.factionsInvolved)) {
    body.factionsInvolved = JSON.stringify(body.factionsInvolved);
  }

  // Reject invalid keys or non-scalar / nested values
  for (const [key, value] of Object.entries(body)) {
    if (key !== 'id' && key !== 'autoCreatedStub' && !ALLOWED_NODE_SCALARS.has(key)) {
      return res.status(400).json({ success: false, message: `Trường '${key}' không hợp lệ trên Node` });
    }
    if (value !== null && typeof value === 'object') {
      return res.status(400).json({ success: false, message: `Giá trị của trường '${key}' phải là kiểu dữ liệu vô hướng (scalar), không được lồng object/array` });
    }
  }
  if (body.autoCreatedStub !== undefined && typeof body.autoCreatedStub !== 'boolean') {
    return res.status(400).json({ success: false, message: 'autoCreatedStub phải là giá trị boolean' });
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
    if (nodeProperties.dob) {
      nodeProperties.dob = formatDateDDMMYYYY(nodeProperties.dob);
    }
    if (nodeProperties.time) {
      nodeProperties.time = formatDateDDMMYYYY(nodeProperties.time);
    }
    if (normalizedType === 'character' && !nodeProperties.age && nodeProperties.dob) {
      nodeProperties.age = calculateAgeFromDob(nodeProperties.dob);
    }
    if (body.autoCreatedStub !== undefined) {
      nodeProperties.autoCreatedStub = body.autoCreatedStub;
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
  if (Array.isArray(body.itemsInvolved)) {
    body.itemsInvolved = JSON.stringify(body.itemsInvolved);
  }
  if (Array.isArray(body.factionsInvolved)) {
    body.factionsInvolved = JSON.stringify(body.factionsInvolved);
  }

  for (const [key, value] of Object.entries(body)) {
    if (key !== 'autoCreatedStub' && key !== 'onlyIfStub' && !ALLOWED_NODE_SCALARS.has(key)) {
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

  if (body.onlyIfStub !== undefined && typeof body.onlyIfStub !== 'boolean') {
    return res.status(400).json({ success: false, message: 'onlyIfStub phải là giá trị boolean' });
  }
  const onlyIfStub = body.onlyIfStub === true;

  if (body.autoCreatedStub !== undefined) {
    if (typeof body.autoCreatedStub !== 'boolean') {
      return res.status(400).json({ success: false, message: 'autoCreatedStub phải là giá trị boolean' });
    }
    updates.autoCreatedStub = body.autoCreatedStub;
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
      body.character !== undefined ||
      body.itemsInvolved !== undefined ||
      body.factionsInvolved !== undefined;
    const previousType = checkResult[0].n.type;
    const currentType = body.type?.toLowerCase() || previousType;
    if (updates.dob) {
      updates.dob = formatDateDDMMYYYY(updates.dob);
    }
    if (updates.time) {
      updates.time = formatDateDDMMYYYY(updates.time);
    }
    if (participantFieldsChanged && currentType === 'event') {
      updates._participantSyncRevision = crypto.randomUUID();
    }
    if (
      body.subFactions !== undefined ||
      (body.type !== undefined && currentType !== previousType)
    ) {
      updates._subFactionSyncRevision = crypto.randomUUID();
    }

    if (onlyIfStub) {
      if (newSecondaryLabel) {
        query = `
          MATCH (n:StoryNode { id: $id })
          SET n._stubUpdateLock = coalesce(n._stubUpdateLock, 0) + 1
          WITH n, coalesce(n.autoCreatedStub, false) AS isStillStub
          FOREACH (_ IN CASE WHEN isStillStub THEN [1] ELSE [] END |
            REMOVE n:Character:Item:Faction:Event:Location
            SET n:${newSecondaryLabel}, n += $updates
          )
          REMOVE n._stubUpdateLock
          RETURN n, isStillStub
        `;
      } else {
        query = `
          MATCH (n:StoryNode { id: $id })
          SET n._stubUpdateLock = coalesce(n._stubUpdateLock, 0) + 1
          WITH n, coalesce(n.autoCreatedStub, false) AS isStillStub
          FOREACH (_ IN CASE WHEN isStillStub THEN [1] ELSE [] END |
            SET n += $updates
          )
          REMOVE n._stubUpdateLock
          RETURN n, isStillStub
        `;
      }
    } else if (newSecondaryLabel) {
      query = `
        MATCH (n:StoryNode { id: $id })
        REMOVE n:Character:Item:Faction:Event:Location
        SET n:${newSecondaryLabel}, n += $updates
        RETURN n, true AS isStillStub
      `;
    } else {
      query = `
        MATCH (n:StoryNode { id: $id })
        SET n += $updates
        RETURN n, true AS isStillStub
      `;
    }

    const records = await runQuery(query, { id, updates });
    if (!records.length || !records[0].n) {
      return res.status(404).json({ success: false, message: `Không tìm thấy node với ID: ${id}` });
    }
    if (onlyIfStub && !records[0].isStillStub) {
      return res.status(409).json({
        success: false,
        code: 'NODE_ALREADY_FULL',
        message: 'Node này đã có dữ liệu đầy đủ và không còn là stub tự sinh.',
        data: records[0].n,
      });
    }

    let updatedNode = records[0].n;
    if (
      updatedNode.type === 'character' &&
      !String(updatedNode.age || '').trim() &&
      String(updatedNode.dob || '').trim()
    ) {
      const committedDob = String(updatedNode.dob).trim();
      const computedAge = calculateAgeFromDob(committedDob);
      if (computedAge) {
        const backfillRes = await runQuery(
          `
          MATCH (n:StoryNode { id: $id })
          WHERE coalesce(n.age, '') = '' AND coalesce(n.dob, '') = $committedDob
          SET n.age = $computedAge
          RETURN n
          `,
          { id, committedDob, computedAge }
        );
        if (backfillRes.length && backfillRes[0].n) {
          updatedNode = backfillRes[0].n;
        }
      }
    }
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

    // Xóa node và dọn + đối soát tham chiếu tổ chức trực thuộc trong cùng một write transaction
    // Khóa ghi mọi tổ chức trong dự án (kể cả node đích) theo thứ tự id tăng dần trong một câu lệnh để tránh deadlock
    const cleanupRev = crypto.randomUUID();
    const deletedCount = await runWriteTransaction(async (runTxQuery) => {
      const lockedTarget = await runTxQuery(`
        MATCH (n:StoryNode { id: $id })
        OPTIONAL MATCH (n)-[:BELONGS_TO]->(p:Project)
        WITH n, p
        OPTIONAL MATCH (pf:StoryNode)-[:BELONGS_TO]->(p)
        WHERE pf.type = 'faction'
        WITH n, p, [x IN collect(DISTINCT pf) + [n] WHERE x IS NOT NULL] AS rawLockTargets
        UNWIND rawLockTargets AS lockNode
        WITH DISTINCT n, p, lockNode
        ORDER BY lockNode.id
        SET lockNode._subFactionSyncLock = coalesce(lockNode._subFactionSyncLock, 0) + 1
        WITH n, p, collect({
          id: lockNode.id,
          type: lockNode.type,
          name: lockNode.name,
          subFactions: lockNode.subFactions,
          subType: lockNode.subType,
          alignment: lockNode.alignment
        }) AS lockedNodes
        RETURN n, p.id AS projectId, lockedNodes
      `, { id });
      if (!lockedTarget.length || !lockedTarget[0]?.n) {
        return 0;
      }

      const currentNode = lockedTarget[0].n;
      const currentProjectId = lockedTarget[0].projectId || null;
      const lockedNodes = lockedTarget[0].lockedNodes || [];
      const parentUpdates = [];

      if (currentNode.type === 'faction' && currentProjectId) {
        const deletedNameLower = String(currentNode.name || '').trim().toLowerCase();
        const otherFactions = lockedNodes.filter((f) => f.type === 'faction' && f.id !== id);
        const survivingFactionIds = new Set(otherFactions.map((f) => f.id).filter(Boolean));
        const survivingFactionByNameLower = new Map();
        for (const f of otherFactions) {
          const nameLower = String(f.name || '').trim().toLowerCase();
          if (nameLower && !survivingFactionByNameLower.has(nameLower)) {
            survivingFactionByNameLower.set(nameLower, f.id);
          }
        }
        for (const fac of otherFactions) {
          if (!fac.subFactions) continue;
          const currentSubs = parseParticipantNames(fac.subFactions);
          const filteredSubs = currentSubs.filter((entry) => {
            const t = String(entry || '').trim();
            if (!t) return false;
            if (t === id) return false;
            if (survivingFactionIds.has(t)) return true;
            if (
              deletedNameLower &&
              t.toLowerCase() === deletedNameLower &&
              !survivingFactionByNameLower.has(deletedNameLower)
            ) {
              return false;
            }
            return true;
          });
          if (filteredSubs.length !== currentSubs.length) {
            const facNameLower = String(fac.name || '').trim().toLowerCase();
            const childIdSet = new Set();
            for (const subEntry of filteredSubs) {
              const trimmed = String(subEntry || '').trim();
              if (!trimmed || trimmed === fac.id) continue;
              if (survivingFactionIds.has(trimmed)) {
                childIdSet.add(trimmed);
                continue;
              }
              const cleanedName = cleanRelationalValue(trimmed);
              if (!cleanedName || cleanedName.toLowerCase() === facNameLower) continue;
              const existingByNameId = survivingFactionByNameLower.get(cleanedName.toLowerCase());
              if (existingByNameId && existingByNameId !== fac.id) {
                childIdSet.add(existingByNameId);
                continue;
              }
              const createdSubId = await findOrCreateProjectEntity(
                currentProjectId,
                cleanedName,
                'faction',
                {
                  role: 'TỔ CHỨC',
                  subType: fac.subType || 'Trung lập',
                  alignment: fac.alignment || 'TRUNG LẬP',
                  motto: '',
                  desc: `Tổ chức trực thuộc ${fac.name || ''}`,
                  status: 'Đang hoạt động',
                },
                runTxQuery
              );
              if (createdSubId && createdSubId !== fac.id) {
                childIdSet.add(createdSubId);
                survivingFactionIds.add(createdSubId);
                survivingFactionByNameLower.set(cleanedName.toLowerCase(), createdSubId);
              }
            }
            parentUpdates.push({
              id: fac.id,
              subFactions: filteredSubs.length > 0 ? JSON.stringify(filteredSubs) : '',
              childIds: Array.from(childIdSet),
            });
          }
        }
      }

      for (const upd of parentUpdates) {
        if (upd.childIds.length > 0) {
          await runTxQuery(`
            MATCH (fac:StoryNode { id: $facId })
            SET fac.subFactions = $subFactions,
                fac._subFactionSyncRevision = $cleanupRev,
                fac.updatedAt = timestamp()
            WITH fac
            OPTIONAL MATCH (oldSub:StoryNode)-[oldRel:RELATES_TO { category: 'SUB_FACTION_OF' }]->(fac)
            WHERE NOT (oldSub.id IN $childIds)
              AND (
                oldRel.autoGenerated = true
                OR (
                  oldRel.autoGenerated IS NULL
                  AND oldRel.id = 'link-' + oldSub.id + '-' + fac.id + '-sub-faction'
                )
              )
            DELETE oldRel
            WITH DISTINCT fac
            UNWIND $childIds AS subId
            MATCH (sub:StoryNode { id: subId })
            WHERE sub.type = 'faction'
            MERGE (sub)-[r:RELATES_TO { category: 'SUB_FACTION_OF' }]->(fac)
            ON CREATE SET r.id = 'link-' + sub.id + '-' + fac.id + '-sub-faction',
                          r.label = 'Trực thuộc',
                          r.type = 'solid',
                          r.tone = 'sect',
                          r.autoGenerated = true,
                          r.createdAt = timestamp()
            ON MATCH SET r.label = 'Trực thuộc',
                         r.updatedAt = timestamp()
          `, {
            facId: upd.id,
            subFactions: upd.subFactions,
            cleanupRev,
            childIds: upd.childIds,
          });
        } else {
          await runTxQuery(`
            MATCH (fac:StoryNode { id: $facId })
            SET fac.subFactions = $subFactions,
                fac._subFactionSyncRevision = $cleanupRev,
                fac.updatedAt = timestamp()
            WITH fac
            OPTIONAL MATCH (oldSub:StoryNode)-[oldRel:RELATES_TO { category: 'SUB_FACTION_OF' }]->(fac)
            WHERE oldRel.autoGenerated = true
              OR (
                oldRel.autoGenerated IS NULL
                AND oldRel.id = 'link-' + oldSub.id + '-' + fac.id + '-sub-faction'
              )
            DELETE oldRel
          `, {
            facId: upd.id,
            subFactions: upd.subFactions,
            cleanupRev,
          });
        }
      }

      const deleteRecords = await runTxQuery(`
        MATCH (n:StoryNode { id: $id })
        DETACH DELETE n
        RETURN count(n) AS deleted
      `, { id });

      return deleteRecords[0]?.deleted || 0;
    });

    if (deletedCount === 0) {
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

async function findOrCreateProjectEntity(projectId, name, type, defaults = {}, queryRunner = runQuery) {
  const label = TYPE_LABELS[type];
  if (!label) throw new Error(`Loại thực thể không hỗ trợ: ${type}`);

  const entityId = `node-${type.slice(0, 4)}-${Date.now()}-${crypto.randomUUID().slice(0, 5)}`;
  const properties = {
    id: entityId,
    name,
    type,
    ...defaults,
    autoCreatedStub: true,
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
  const records = await queryRunner(query, { projectId, name, type, properties });
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
      // Vật dụng / Vật phẩm sở hữu -> Item (hỗ trợ nhiều vật phẩm)
      const weaponNames = [];
      const seenWeaponLower = new Set();
      for (const rawWeapon of parseParticipantNames(nodeData.weapon)) {
        const cleanedWeapon = cleanRelationalValue(rawWeapon);
        if (!cleanedWeapon) continue;
        const key = cleanedWeapon.toLowerCase();
        if (!seenWeaponLower.has(key)) {
          seenWeaponLower.add(key);
          weaponNames.push(cleanedWeapon);
        }
      }

      if (weaponNames.length > 0) {
        const weaponItemIds = [];
        for (const weaponName of weaponNames) {
          const itemId = await findOrCreateProjectEntity(projectId, weaponName, 'item', {
            role: 'Quý hiếm',
            rarity: 'Quý hiếm',
            element: 'Kim',
            desc: `Vật phẩm gắn liền với ${nodeName}`,
            status: 'Nguyên vẹn',
          });
          if (itemId) weaponItemIds.push(itemId);
        }
        // Thay thế nguyên tử các cạnh EQUIPPED (xóa cạnh cũ + hợp nhất tất cả cạnh mới trong 1 truy vấn)
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })
          OPTIONAL MATCH (c)-[oldRel:RELATES_TO { category: 'EQUIPPED' }]->(oldItem:StoryNode)
          WHERE NOT (oldItem.id IN $weaponItemIds)
          DELETE oldRel
          WITH DISTINCT c
          UNWIND $weaponItemIds AS itemId
          MATCH (item:StoryNode { id: itemId })
          MERGE (c)-[r:RELATES_TO { category: 'EQUIPPED' }]->(item)
          ON CREATE SET r.id = 'link-' + c.id + '-' + item.id + '-weapon',
                        r.label = 'Sở hữu / Sử dụng',
                        r.type = 'solid',
                        r.tone = 'possession',
                        r.createdAt = timestamp()
          ON MATCH SET r.label = 'Sở hữu / Sử dụng',
                       r.updatedAt = timestamp()
        `, { nodeId, weaponItemIds });
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

      // Tổ chức -> Faction (bảo toàn cả cạnh do c.sect lẫn danh sách faction.members hỗ trợ)
      const facRosterRows = await runQuery(`
        MATCH (fac:StoryNode { type: 'faction' })-[:BELONGS_TO]->(p:Project { id: $projectId })
        WHERE fac.members IS NOT NULL AND trim(fac.members) <> ''
        RETURN fac.id AS id, fac.members AS members
      `, { projectId }, 'READ');
      const charNameLower = nodeName.toLowerCase();
      const rosterBackedFactionIds = [];
      for (const row of facRosterRows) {
        const parsedMembers = parseParticipantNames(row.members)
          .map((m) => cleanRelationalValue(m))
          .filter(Boolean);
        if (parsedMembers.some((m) => m.toLowerCase() === charNameLower || m === nodeId)) {
          rosterBackedFactionIds.push(row.id);
        }
      }

      const sect = cleanRelationalValue(nodeData.sect);
      if (sect) {
        const facId = await findOrCreateProjectEntity(projectId, sect, 'faction', {
          role: 'TỔ CHỨC',
          subType: 'Trung lập',
          alignment: 'TRUNG LẬP',
          motto: '',
          desc: `Tổ chức có thành viên ${nodeName}`,
          status: 'Đang hoạt động',
        });
        const keepFactionIds = Array.from(new Set([...rosterBackedFactionIds, facId].filter(Boolean)));
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'MEMBER_OF' }]->(fac:StoryNode)
          WHERE NOT (fac.id IN $keepFactionIds)
          DELETE r
        `, { nodeId, keepFactionIds });
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })
          MATCH (fac:StoryNode { id: $facId })
          MERGE (c)-[r:RELATES_TO { category: 'MEMBER_OF' }]->(fac)
          ON CREATE SET r.id = 'link-' + c.id + '-' + fac.id + '-sect',
                        r.label = 'Tổ chức',
                        r.type = 'solid',
                        r.tone = 'sect',
                        r.autoGenerated = true,
                        r.createdAt = timestamp()
          ON MATCH SET r.label = 'Tổ chức',
                       r.autoGenerated = coalesce(r.autoGenerated, true),
                       r.updatedAt = timestamp()
        `, { nodeId, facId });
      } else {
        await runQuery(`
          MATCH (c:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'MEMBER_OF' }]->(fac:StoryNode)
          WHERE NOT (fac.id IN $rosterBackedFactionIds)
          DELETE r
        `, { nodeId, rosterBackedFactionIds });
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

    // Nếu node hiện tại trong DB không còn là tổ chức (VD: đổi loại từ faction sang item), dọn sạch cạnh SUB_FACTION_OF hai chiều
    if (nodeType !== 'faction') {
      await runQuery(`
        MATCH (n:StoryNode { id: $nodeId })-[r:RELATES_TO { category: 'SUB_FACTION_OF' }]-(:StoryNode)
        WHERE coalesce(n.type, '') <> 'faction'
        DELETE r
      `, { nodeId });
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

      // Thành viên cấp cao -> Character (nhiều nhân vật)
      const seniorMemberNames = [];
      const seenSeniorLower = new Set();
      for (const rawName of parseParticipantNames(nodeData.seniorMembers)) {
        const cleaned = cleanRelationalValue(rawName);
        if (!cleaned) continue;
        const key = cleaned.toLowerCase();
        if (!seenSeniorLower.has(key)) {
          seenSeniorLower.add(key);
          seniorMemberNames.push(cleaned);
        }
      }
      if (seniorMemberNames.length > 0) {
        const seniorCharIds = [];
        for (const memberName of seniorMemberNames) {
          const charId = await findOrCreateProjectEntity(projectId, memberName, 'character', {
            role: 'TRUNG LẬP',
            gender: 'Nam',
            desc: `Thành viên cấp cao của ${nodeName}`,
            status: 'Còn sống',
          });
          if (charId) seniorCharIds.push(charId);
        }
        await runQuery(`
          MATCH (c:StoryNode)-[r:RELATES_TO { category: 'SENIOR_MEMBER_OF' }]->(fac:StoryNode { id: $nodeId })
          WHERE NOT (c.id IN $seniorCharIds)
          DELETE r
        `, { nodeId, seniorCharIds });
        for (const charId of seniorCharIds) {
          await runQuery(`
            MATCH (fac:StoryNode { id: $nodeId })
            MATCH (c:StoryNode { id: $charId })
            MERGE (c)-[r:RELATES_TO { category: 'SENIOR_MEMBER_OF' }]->(fac)
            ON CREATE SET r.id = 'link-' + c.id + '-' + fac.id + '-senior-member',
                          r.label = 'Thành viên cấp cao',
                          r.type = 'solid',
                          r.tone = 'sect',
                          r.createdAt = timestamp()
            ON MATCH SET r.label = 'Thành viên cấp cao',
                         r.updatedAt = timestamp()
          `, { nodeId, charId });
        }
      } else {
        await runQuery(`
          MATCH (:StoryNode)-[r:RELATES_TO { category: 'SENIOR_MEMBER_OF' }]->(fac:StoryNode { id: $nodeId })
          DELETE r
        `, { nodeId });
      }

      // Thành viên -> Character (nhiều nhân vật)
      const memberNames = [];
      const seenMemberLower = new Set();
      for (const rawName of parseParticipantNames(nodeData.members)) {
        const cleaned = cleanRelationalValue(rawName);
        if (!cleaned) continue;
        const key = cleaned.toLowerCase();
        if (!seenMemberLower.has(key)) {
          seenMemberLower.add(key);
          memberNames.push(cleaned);
        }
      }
      const memberCharIds = [];
      for (const memberName of memberNames) {
        const charId = await findOrCreateProjectEntity(projectId, memberName, 'character', {
          role: 'TRUNG LẬP',
          gender: 'Nam',
          desc: `Thành viên của ${nodeName}`,
          status: 'Còn sống',
        });
        if (charId) memberCharIds.push(charId);
      }
      // Xóa các link MEMBER_OF tự sinh cũ không còn trong members và cũng không còn c.sect trỏ tới tổ chức này (bảo toàn link thủ công)
      await runQuery(`
        MATCH (c:StoryNode)-[r:RELATES_TO { category: 'MEMBER_OF' }]->(fac:StoryNode { id: $nodeId })
        WHERE NOT (c.id IN $memberCharIds)
          AND toLower(coalesce(c.sect, '')) <> toLower(fac.name)
          AND coalesce(c.sect, '') <> fac.id
          AND (
            r.autoGenerated = true
            OR (
              r.autoGenerated IS NULL
              AND (
                r.id = 'link-' + c.id + '-' + fac.id + '-member'
                OR r.id = 'link-' + c.id + '-' + fac.id + '-sect'
              )
            )
          )
        DELETE r
      `, { nodeId, memberCharIds });
      for (const charId of memberCharIds) {
        await runQuery(`
          MATCH (fac:StoryNode { id: $nodeId })
          MATCH (c:StoryNode { id: $charId })
          MERGE (c)-[r:RELATES_TO { category: 'MEMBER_OF' }]->(fac)
          ON CREATE SET r.id = 'link-' + c.id + '-' + fac.id + '-member',
                        r.label = 'Thành viên',
                        r.type = 'solid',
                        r.tone = 'sect',
                        r.autoGenerated = true,
                        r.createdAt = timestamp()
          ON MATCH SET r.label = 'Thành viên',
                       r.autoGenerated = coalesce(r.autoGenerated, true),
                       r.updatedAt = timestamp()
        `, { nodeId, charId });
      }

      // Tổ chức trực thuộc / dưới trướng -> Faction (sub --[SUB_FACTION_OF]--> parent)
      // Khóa toàn bộ tổ chức trong dự án theo thứ tự id trong cùng một write transaction:
      // - Kiểm tra revision đồng bộ dưới write lock trước khi tạo stub hoặc ghi cạnh
      // - Phân giải ID chính xác trước khi lọc placeholder để không loại nhầm ID thật (VD: 'none')
      // - Đảm bảo node con vẫn là faction khi ghi cạnh SUB_FACTION_OF
      const expectedSubFactionRev = nodeData._subFactionSyncRevision || null;
      await runWriteTransaction(async (runTxQuery) => {
        const lockResult = await runTxQuery(`
          MATCH (fac:StoryNode { id: $nodeId })
          MATCH (p:Project { id: $projectId })
          OPTIONAL MATCH (pf:StoryNode)-[:BELONGS_TO]->(p)
          WHERE pf.type = 'faction'
          WITH fac, [x IN collect(DISTINCT pf) + [fac] WHERE x IS NOT NULL] AS rawLockTargets
          UNWIND rawLockTargets AS lockNode
          WITH DISTINCT fac, lockNode
          ORDER BY lockNode.id
          SET lockNode._subFactionSyncLock = coalesce(lockNode._subFactionSyncLock, 0) + 1
          WITH fac, collect({ id: lockNode.id, type: lockNode.type }) AS lockedNodes
          RETURN fac.type = 'faction'
            AND coalesce(fac._subFactionSyncRevision, '') = coalesce($expectedSubFactionRev, '') AS isCurrent,
            lockedNodes
        `, { nodeId, projectId, expectedSubFactionRev });

        if (!lockResult.length || !lockResult[0].isCurrent) {
          return;
        }

        const exactExistingFactionIds = new Set(
          (lockResult[0].lockedNodes || [])
            .filter((n) => n.type === 'faction' && n.id)
            .map((n) => n.id)
        );
        const candidateSubRefs = [];
        const seenRawExact = new Set();
        for (const rawSub of parseParticipantNames(nodeData.subFactions)) {
          const trimmed = String(rawSub ?? '').trim();
          if (!trimmed || trimmed === nodeId) continue;
          if (!seenRawExact.has(trimmed)) {
            seenRawExact.add(trimmed);
            candidateSubRefs.push(trimmed);
          }
        }

        const selfNameLower = nodeName.toLowerCase();
        const resolvedSubIdSet = new Set();
        for (const subRef of candidateSubRefs) {
          if (exactExistingFactionIds.has(subRef)) {
            if (subRef !== nodeId) resolvedSubIdSet.add(subRef);
            continue;
          }
          const cleanedName = cleanRelationalValue(subRef);
          if (!cleanedName || cleanedName.toLowerCase() === selfNameLower) continue;
          const subId = await findOrCreateProjectEntity(
            projectId,
            cleanedName,
            'faction',
            {
              role: 'TỔ CHỨC',
              subType: nodeData.subType || 'Trung lập',
              alignment: nodeData.alignment || 'TRUNG LẬP',
              motto: '',
              desc: `Tổ chức trực thuộc ${nodeName}`,
              status: 'Đang hoạt động',
            },
            runTxQuery
          );
          if (subId && subId !== nodeId) {
            resolvedSubIdSet.add(subId);
          }
        }

        const subFactionIds = Array.from(resolvedSubIdSet);
        if (subFactionIds.length > 0) {
          await runTxQuery(`
            MATCH (fac:StoryNode { id: $nodeId })
            WHERE fac.type = 'faction'
              AND coalesce(fac._subFactionSyncRevision, '') = coalesce($expectedSubFactionRev, '')
            OPTIONAL MATCH (oldSub:StoryNode)-[oldRel:RELATES_TO { category: 'SUB_FACTION_OF' }]->(fac)
            WHERE NOT (oldSub.id IN $subFactionIds)
              AND (
                oldRel.autoGenerated = true
                OR (
                  oldRel.autoGenerated IS NULL
                  AND oldRel.id = 'link-' + oldSub.id + '-' + fac.id + '-sub-faction'
                )
              )
            DELETE oldRel
            WITH DISTINCT fac
            UNWIND $subFactionIds AS subId
            MATCH (sub:StoryNode { id: subId })
            WHERE sub.type = 'faction'
            MERGE (sub)-[r:RELATES_TO { category: 'SUB_FACTION_OF' }]->(fac)
            ON CREATE SET r.id = 'link-' + sub.id + '-' + fac.id + '-sub-faction',
                          r.label = 'Trực thuộc',
                          r.type = 'solid',
                          r.tone = 'sect',
                          r.autoGenerated = true,
                          r.createdAt = timestamp()
            ON MATCH SET r.label = 'Trực thuộc',
                         r.updatedAt = timestamp()
          `, { nodeId, subFactionIds, expectedSubFactionRev });
        } else {
          await runTxQuery(`
            MATCH (fac:StoryNode { id: $nodeId })
            WHERE fac.type = 'faction'
              AND coalesce(fac._subFactionSyncRevision, '') = coalesce($expectedSubFactionRev, '')
            MATCH (oldSub:StoryNode)-[oldRel:RELATES_TO { category: 'SUB_FACTION_OF' }]->(fac)
            WHERE oldRel.autoGenerated = true
              OR (
                oldRel.autoGenerated IS NULL
                AND oldRel.id = 'link-' + oldSub.id + '-' + fac.id + '-sub-faction'
              )
            DELETE oldRel
          `, { nodeId, expectedSubFactionRev });
        }
      });

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
                        r.label = 'Diễn ra tại',
                        r.type = 'solid',
                        r.tone = 'event',
                        r.createdAt = timestamp()
          ON MATCH SET r.label = 'Diễn ra tại',
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

      const charNames = Array.from(new Set(rawChars.map((s) => cleanRelationalValue(s)).filter(Boolean)));
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

      // 5.3 & 5.4 Vật phẩm & Tổ chức liên quan của sự kiện được nối qua Nhân vật tham gia
      // (Z <--Sở hữu-- A --Tham gia--> Y và F <--Tổ chức-- A --Tham gia--> Y),
      // nên dọn sạch các cạnh trực tiếp INVOLVES_ITEM / INVOLVES_FACTION cũ nếu có.
      await runQuery(`
        MATCH (ev:StoryNode { id: $nodeId })-[old:RELATES_TO]->(:StoryNode)
        WHERE old.category IN ['INVOLVES_ITEM', 'INVOLVES_FACTION']
        DELETE old
      `, { nodeId });

      // 5.5 Nhân quả giữa các sự kiện -> Event (CAUSED_BY, chỉ nối nếu khớp tên/ID một Event đã tồn tại)
      const causeText = cleanRelationalValue(nodeData.cause);
      await runQuery(`
        MATCH (ev:StoryNode { id: $nodeId })-[old:RELATES_TO { category: 'CAUSED_BY' }]->(:StoryNode)
        DELETE old
      `, { nodeId });
      if (causeText) {
        await runQuery(`
          MATCH (ev:StoryNode { id: $nodeId })-[:BELONGS_TO]->(p:Project { id: $projectId })
          MATCH (causeEv:StoryNode { type: 'event' })-[:BELONGS_TO]->(p)
          WHERE causeEv.id <> ev.id
            AND (toLower(causeEv.name) = toLower($causeText) OR causeEv.id = $causeText)
          MERGE (ev)-[r:RELATES_TO { category: 'CAUSED_BY' }]->(causeEv)
          ON CREATE SET r.id = 'link-' + ev.id + '-' + causeEv.id + '-cause',
                        r.label = 'Bắt nguồn từ',
                        r.type = 'dashed',
                        r.tone = 'event',
                        r.createdAt = timestamp()
          ON MATCH SET r.label = 'Bắt nguồn từ',
                       r.updatedAt = timestamp()
        `, { nodeId, projectId, causeText });
      }

      // 5.6 Đối soát đảo chiều CAUSED_BY: nối các sự kiện trước đó có cause khớp tên/ID của sự kiện mới tạo này
      // Loại trừ các chuỗi giữ chỗ (placeholder) tương tự cleanRelationalValue
      const placeholderCauses = [
        'unknown',
        'not known',
        'n/a',
        'none',
        'null',
        'undefined',
        'không rõ',
        'chưa rõ',
        'không xác định',
        'chưa xác định',
        'không có',
        'trống',
      ];
      await runQuery(`
        MATCH (otherEv:StoryNode { type: 'event' })-[:BELONGS_TO]->(p:Project { id: $projectId })
        MATCH (otherEv)-[old:RELATES_TO { category: 'CAUSED_BY' }]->(ev:StoryNode { id: $nodeId })
        WHERE (
          toLower(trim(coalesce(otherEv.cause, ''))) IN $placeholderCauses
          OR (
            toLower(trim(coalesce(otherEv.cause, ''))) <> toLower(ev.name)
            AND trim(coalesce(otherEv.cause, '')) <> ev.id
          )
        )
        DELETE old
      `, { nodeId, projectId, placeholderCauses });
      await runQuery(`
        MATCH (otherEv:StoryNode { type: 'event' })-[:BELONGS_TO]->(p:Project { id: $projectId })
        MATCH (ev:StoryNode { id: $nodeId })-[:BELONGS_TO]->(p)
        WHERE otherEv.id <> ev.id
          AND otherEv.cause IS NOT NULL AND trim(otherEv.cause) <> ''
          AND NOT (toLower(trim(otherEv.cause)) IN $placeholderCauses)
          AND (toLower(trim(otherEv.cause)) = toLower(ev.name) OR trim(otherEv.cause) = ev.id)
        MERGE (otherEv)-[r:RELATES_TO { category: 'CAUSED_BY' }]->(ev)
        ON CREATE SET r.id = 'link-' + otherEv.id + '-' + ev.id + '-cause',
                      r.label = 'Bắt nguồn từ',
                      r.type = 'dashed',
                      r.tone = 'event',
                      r.createdAt = timestamp()
        ON MATCH SET r.label = 'Bắt nguồn từ',
                     r.updatedAt = timestamp()
      `, { nodeId, projectId, placeholderCauses });
    }

    // 6. LIÊN KẾT ĐẢO CHIỀU (Reverse auto-link):
    if (nodeType === 'item') {
      const charRows = await runQuery(`
        MATCH (c:StoryNode { type: 'character' })-[:BELONGS_TO]->(p:Project { id: $projectId })
        WHERE c.weapon IS NOT NULL AND trim(c.weapon) <> ''
        RETURN c.id AS id, c.weapon AS weapon
      `, { projectId }, 'READ');
      const itemNameLower = nodeName.toLowerCase();
      const matchingCharIds = [];
      for (const row of Array.isArray(charRows) ? charRows : []) {
        const cId = row.id;
        const cWeapon = row.weapon;
        const parsedWeapons = parseParticipantNames(cWeapon)
          .map((w) => cleanRelationalValue(w))
          .filter(Boolean);
        const matchesItem = parsedWeapons.some(
          (w) => w.toLowerCase() === itemNameLower || w === nodeId
        );
        if (matchesItem) matchingCharIds.push(cId);
      }

      // Xóa các link EQUIPPED cũ thuộc dự án này trỏ tới item này mà c.weapon không còn khớp
      await runQuery(`
        MATCH (c:StoryNode { type: 'character' })-[:BELONGS_TO]->(p:Project { id: $projectId })
        MATCH (c)-[r:RELATES_TO { category: 'EQUIPPED' }]->(item:StoryNode { id: $nodeId })
        WHERE NOT (c.id IN $matchingCharIds)
        DELETE r
      `, { nodeId, projectId, matchingCharIds });

      if (matchingCharIds.length > 0) {
        await runQuery(`
          MATCH (c:StoryNode { type: 'character' })-[:BELONGS_TO]->(p:Project { id: $projectId })
          MATCH (item:StoryNode { id: $nodeId })
          WHERE c.id IN $matchingCharIds
          MERGE (c)-[r:RELATES_TO { category: 'EQUIPPED' }]->(item)
          ON CREATE SET r.id = 'link-' + c.id + '-' + item.id + '-weapon',
                        r.label = 'Sở hữu / Sử dụng',
                        r.type = 'solid',
                        r.tone = 'possession',
                        r.createdAt = timestamp()
          ON MATCH SET r.label = 'Sở hữu / Sử dụng',
                       r.updatedAt = timestamp()
        `, { nodeId, projectId, matchingCharIds });
      }
    } else if (nodeType === 'location') {
      // Xóa các link BIRTHPLACE cũ thuộc dự án này trỏ tới location này mà c.birthplace không còn khớp
      await runQuery(`
        MATCH (c:StoryNode { type: 'character' })-[:BELONGS_TO]->(p:Project { id: $projectId })
        MATCH (c)-[r:RELATES_TO { category: 'BIRTHPLACE' }]->(loc:StoryNode { id: $nodeId })
        WHERE toLower(coalesce(c.birthplace, '')) <> toLower(loc.name)
          AND coalesce(c.birthplace, '') <> loc.id
        DELETE r
      `, { nodeId, projectId });

      await runQuery(`
        MATCH (c:StoryNode { type: 'character' })-[:BELONGS_TO]->(p:Project { id: $projectId })
        MATCH (loc:StoryNode { id: $nodeId })
        WHERE (toLower(c.birthplace) = toLower(loc.name) OR c.birthplace = loc.id)
          AND c.birthplace IS NOT NULL AND c.birthplace <> ''
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
        WHERE toLower(coalesce(item.origin, '')) <> toLower(loc.name)
          AND coalesce(item.origin, '') <> loc.id
        DELETE r
      `, { nodeId, projectId });

      await runQuery(`
        MATCH (item:StoryNode { type: 'item' })-[:BELONGS_TO]->(p:Project { id: $projectId })
        MATCH (loc:StoryNode { id: $nodeId })
        WHERE (toLower(item.origin) = toLower(loc.name) OR item.origin = loc.id)
          AND item.origin IS NOT NULL AND item.origin <> ''
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
