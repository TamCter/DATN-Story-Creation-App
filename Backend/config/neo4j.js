const neo4j = require('neo4j-driver');
require('dotenv').config();

const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
const user = process.env.NEO4J_USER || 'neo4j';
const password = process.env.NEO4J_PASSWORD || 'password';
const database = process.env.NEO4J_DATABASE || 'neo4j';

let driver;

try {
  driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
    maxConnectionPoolSize: 50,
    connectionAcquisitionTimeout: 5000,
  });
} catch (error) {
  console.error('[Neo4j] Lỗi khởi tạo driver:', error.message);
}

/**
 * Chuyển đổi dữ liệu kiểu Neo4j (Integer, Node, Relationship) sang Plain JavaScript Object
 */
function toNative(val) {
  if (val === null || val === undefined) return val;

  // Neo4j Integer
  if (neo4j.isInt(val)) {
    return val.inSafeRange() ? val.toNumber() : val.toString();
  }

  // Neo4j Date/Time types
  if (
    neo4j.isDate(val) ||
    neo4j.isDateTime(val) ||
    neo4j.isTime(val) ||
    neo4j.isLocalDateTime(val) ||
    neo4j.isLocalTime(val) ||
    neo4j.isDuration(val)
  ) {
    return val.toString();
  }

  // Neo4j Node
  if (neo4j.isNode(val)) {
    const rawProps = val.properties || {};
    const plainProps = {};
    for (const [k, v] of Object.entries(rawProps)) {
      plainProps[k] = toNative(v);
    }
    return {
      id: plainProps.id || val.elementId || toNative(val.identity),
      labels: val.labels,
      ...plainProps,
    };
  }

  // Neo4j Relationship
  if (neo4j.isRelationship(val)) {
    const rawProps = val.properties || {};
    const plainProps = {};
    for (const [k, v] of Object.entries(rawProps)) {
      plainProps[k] = toNative(v);
    }
    return {
      id: plainProps.id || val.elementId || toNative(val.identity),
      type: val.type,
      startNodeId: val.startNodeElementId || toNative(val.start),
      endNodeId: val.endNodeElementId || toNative(val.end),
      ...plainProps,
    };
  }

  // Array
  if (Array.isArray(val)) {
    return val.map(toNative);
  }

  // Plain Object
  if (typeof val === 'object') {
    const res = {};
    for (const [key, value] of Object.entries(val)) {
      res[key] = toNative(value);
    }
    return res;
  }

  return val;
}

/**
 * Chạy câu lệnh Cypher an toàn với Session
 * @param {string} cypherQuery
 * @param {object} params
 * @param {'READ' | 'WRITE'} mode
 * @returns {Promise<Array<object>>} Mảng các object đã được format
 */
async function runQuery(cypherQuery, params = {}, mode = 'WRITE') {
  if (!driver) {
    throw new Error('Neo4j Driver chưa được khởi tạo. Vui lòng kiểm tra cấu hình.');
  }

  const session = driver.session({
    database: database || undefined,
    defaultAccessMode: mode === 'READ' ? neo4j.session.READ : neo4j.session.WRITE,
  });

  try {
    const result = await session.run(cypherQuery, params);
    return result.records.map((record) => {
      const keys = record.keys;
      const obj = {};
      keys.forEach((key) => {
        obj[key] = toNative(record.get(key));
      });
      return obj;
    });
  } finally {
    await session.close();
  }
}

/**
 * Kiểm tra kết nối và tạo các ràng buộc/chỉ mục cơ bản (Constraints / Indexes)
 */
async function testConnection() {
  try {
    const result = await runQuery('RETURN "Neo4j Connected Successfully!" AS status', {}, 'READ');
    console.log(`[Neo4j] ✅ Kết nối thành công tới ${uri} (DB: ${database || 'default'})`);

    // Tạo constraint nếu chưa có để tối ưu tốc độ và tính toàn vẹn
    await initConstraints();
    return true;
  } catch (error) {
    console.warn(`[Neo4j] ⚠️  Chưa thể kết nối tới Neo4j tại ${uri}:`);
    console.warn(`         Lý do: ${error.message}`);
    console.warn(`         👉 Hãy đảm bảo Neo4j Desktop hoặc Docker đang chạy và thông tin trong .env là chính xác.`);
    return false;
  }
}

async function initConstraints() {
  const constraints = [
    'CREATE CONSTRAINT project_id_unique IF NOT EXISTS FOR (p:Project) REQUIRE p.id IS UNIQUE',
    'CREATE CONSTRAINT storynode_id_unique IF NOT EXISTS FOR (n:StoryNode) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT chapter_id_unique IF NOT EXISTS FOR (c:Chapter) REQUIRE c.id IS UNIQUE',
    'CREATE CONSTRAINT user_id_unique IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE',
    'CREATE CONSTRAINT user_email_unique IF NOT EXISTS FOR (u:User) REQUIRE u.email IS UNIQUE',
  ];

  for (const q of constraints) {
    await runQuery(q);
  }
}

// Đóng kết nối khi ứng dụng dừng
const closeDriver = async () => {
  if (driver) {
    await driver.close();
    console.log('[Neo4j] Đã đóng kết nối Driver.');
  }
};

process.on('SIGINT', async () => {
  await closeDriver();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeDriver();
  process.exit(0);
});

module.exports = {
  driver,
  neo4j,
  runQuery,
  toNative,
  testConnection,
  closeDriver,
};
