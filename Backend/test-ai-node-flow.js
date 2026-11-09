const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { chatWithAI } = require('./controllers/aiController');

const API_BASE_URL = (process.env.TEST_API_URL || 'http://localhost:5000/api').replace(/\/+$/, '');
const AI_TIMEOUT_MS = 180000;
const REQUEST_TIMEOUT_MS = 15000;
const NODE_SCENARIOS = [
  {
    type: 'character',
    name: 'Linh Kiếm Sư AI Test',
    requiredFields: [
      'name', 'type', 'role', 'desc', 'gender', 'dob', 'birthplace',
      'weapon', 'sect', 'personality', 'status',
    ],
    prompt:
      'Tạo ngay nhân vật mới, tên chính xác "Linh Kiếm Sư AI Test": một nữ kiếm khách chính diện xuất thân từ Bắc Vực. Tự sáng tạo mọi thông tin còn thiếu.',
  },
  {
    type: 'item',
    name: 'Băng Tâm Kiếm AI Test',
    requiredFields: [
      'name', 'type', 'desc', 'rarity', 'origin', 'element', 'holderOrLocation',
    ],
    prompt:
      'Tạo ngay vật phẩm mới, tên chính xác "Băng Tâm Kiếm AI Test": một thanh kiếm băng cổ. Tự sáng tạo nguồn gốc, độ hiếm, nguyên tố và chủ nhân/nơi cất giữ.',
  },
  {
    type: 'location',
    name: 'Hàn Uyên Cốc AI Test',
    requiredFields: [
      'name', 'type', 'desc', 'region', 'climate', 'dangerLevel', 'ruler',
    ],
    prompt:
      'Tạo ngay địa điểm mới, tên chính xác "Hàn Uyên Cốc AI Test": một thung lũng băng giá bí ẩn ở Bắc Vực. Tự sáng tạo đầy đủ thông tin.',
  },
];

async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    signal: AbortSignal.timeout(endpoint === '/ai/chat' ? AI_TIMEOUT_MS : REQUEST_TIMEOUT_MS),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `${options.method || 'GET'} ${endpoint} trả HTTP ${response.status}: ${
        body?.message || JSON.stringify(body)
      }`
    );
  }

  return body;
}

function callAI(messages, projectContext) {
  let timeoutId;
  return Promise.race([
    new Promise((resolve, reject) => {
      let completed = false;
      const res = {
        statusCode: 200,
        status(statusCode) {
          this.statusCode = statusCode;
          return this;
        },
        json(body) {
          if (completed) return;
          completed = true;
          if (this.statusCode >= 400 || !body?.success) {
            reject(new Error(body?.message || `AI trả HTTP ${this.statusCode}`));
          } else {
            resolve(body);
          }
        },
      };

      chatWithAI(
        { body: { messages, projectContext } },
        res,
        (error) => {
          if (!completed) {
            completed = true;
            reject(error);
          }
        }
      ).catch((error) => {
        if (!completed) {
          completed = true;
          reject(error);
        }
      });
    }),
    new Promise((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`AI vượt quá ${AI_TIMEOUT_MS / 1000}s`)),
        AI_TIMEOUT_MS
      );
    }),
  ]).finally(() => clearTimeout(timeoutId));
}

async function run() {
  let projectId;
  let authHeaders;
  let testFailed = false;

  try {
    console.log(`[1/5] Kiểm tra Backend: ${API_BASE_URL}`);
    const health = await apiRequest('/health');
    if (health.neo4j?.status !== 'connected') {
      throw new Error(`Neo4j chưa kết nối (trạng thái: ${health.neo4j?.status || 'không rõ'})`);
    }
    console.log('      Backend và Neo4j đang hoạt động.');

    console.log('[2/5] Đăng nhập guest và tạo project tạm...');
    const guest = await apiRequest('/auth/guest', { method: 'POST' });
    const token = guest.data?.token;
    if (!token) throw new Error('Backend không trả guest token.');
    authHeaders = { Authorization: `Bearer ${token}` };

    const project = await apiRequest('/projects', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: `AI node test ${new Date().toISOString()}`,
        genre: 'Kiểm thử',
      }),
    });
    projectId = project.data?.id;
    if (!projectId) throw new Error('Backend không trả project ID.');
    console.log(`      Đã tạo project kiểm thử ${projectId}.`);

    const createdNodes = [];
    for (const [index, scenario] of NODE_SCENARIOS.entries()) {
      console.log(`[3/5] Gemini tạo node ${index + 1}/${NODE_SCENARIOS.length}: ${scenario.type}...`);
      const ai = await callAI(
        [{ role: 'user', content: scenario.prompt }],
        { projectTitle: project.data.title, nodes: createdNodes }
      );
      const nodeData = ai.data?.nodeData;
      if (!nodeData || nodeData.type !== scenario.type) {
        const details = ai.data?.raw || ai.data?.message || 'Không có nội dung trả về';
        throw new Error(
          `Gemini không trả node ${scenario.type} hợp lệ (model: ${ai.data?.model || 'không rõ'}).\n` +
            `Phản hồi: ${String(details).slice(0, 1800)}`
        );
      }

      const missingFields = scenario.requiredFields.filter((field) => {
        const value = nodeData[field];
        return value === undefined || value === null || String(value).trim() === '';
      });
      if (missingFields.length) {
        throw new Error(
          `Node "${nodeData.name}" thiếu trường bắt buộc: ${missingFields.join(', ')}`
        );
      }
      for (const [field, value] of Object.entries(nodeData)) {
        if (value !== null && typeof value === 'object') {
          throw new Error(`Node "${nodeData.name}" có trường ${field} không phải scalar.`);
        }
      }

      console.log(`      Gemini ${ai.data.model}: ${nodeData.name}; đủ ${scenario.requiredFields.length} trường.`);
      const created = await apiRequest(`/projects/${projectId}/nodes`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(nodeData),
      });
      if (!created.success || !created.data?.id) {
        throw new Error(`API không xác nhận tạo node "${nodeData.name}".`);
      }
      createdNodes.push(created.data);
    }

    console.log('[4/5] Đọc lại graph để xác nhận dữ liệu đã lưu...');
    const graph = await apiRequest(`/projects/${projectId}/graph`, { headers: authHeaders });
    const persistedNodes = graph.data?.nodes || [];
    for (const createdNode of createdNodes) {
      const persistedNode = persistedNodes.find((node) => node.id === createdNode.id);
      if (!persistedNode) {
        throw new Error(`Node "${createdNode.name}" không xuất hiện trong graph sau khi lưu.`);
      }
      console.log(`      Đã xác nhận "${persistedNode.name}" (${persistedNode.type}) trong Neo4j.`);
    }

    console.log(`[5/5] Hoàn tất: ${createdNodes.length} node đủ thông tin đã được tạo và xác minh.`);
  } catch (error) {
    testFailed = true;
    console.error(`\nTEST THẤT BẠI: ${error.message}`);
  } finally {
    if (projectId && authHeaders) {
      try {
        await apiRequest(`/projects/${projectId}`, {
          method: 'DELETE',
          headers: authHeaders,
        });
        console.log('Đã xóa project và node kiểm thử.');
      } catch (error) {
        testFailed = true;
        console.error(`Không dọn được project kiểm thử ${projectId}: ${error.message}`);
      }
    }
  }

  if (testFailed) process.exitCode = 1;
}

run();
