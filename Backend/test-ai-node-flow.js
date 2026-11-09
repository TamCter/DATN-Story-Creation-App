const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const API_BASE_URL = (process.env.TEST_API_URL || 'http://localhost:5000/api').replace(/\/+$/, '');
const AI_TIMEOUT_MS = 120000;
const REQUEST_TIMEOUT_MS = 15000;
const NODE_TYPES = new Set(['character', 'item', 'location', 'faction', 'event']);

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

    console.log('[3/5] Gửi yêu cầu tạo node cho AI...');
    const ai = await apiRequest('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content:
              'Tạo ngay một node nhân vật với tên Linh Kiem Thu AI Test, nữ kiếm khách bí ẩn đến từ Bắc Vực. Tự điền thông tin còn thiếu, không hỏi thêm.',
          },
        ],
        projectContext: { projectTitle: project.data.title, nodes: [] },
      }),
    });

    const nodeData = ai.data?.nodeData;
    if (
      !nodeData ||
      typeof nodeData.name !== 'string' ||
      !nodeData.name.trim() ||
      !NODE_TYPES.has(nodeData.type)
    ) {
      const details = ai.data?.raw || ai.data?.message || ai.message || 'Không có nội dung trả về';
      throw new Error(
        `AI không trả nodeData hợp lệ (model: ${ai.data?.model || 'không rõ'}).\n` +
          `Phản hồi: ${String(details).slice(0, 1800)}`
      );
    }
    console.log(`      AI trả node "${nodeData.name}" (${nodeData.type}), model ${ai.data.model || 'không rõ'}.`);

    console.log('[4/5] Lưu node và xác nhận node trong graph...');
    const created = await apiRequest(`/projects/${projectId}/nodes`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(nodeData),
    });
    const createdNode = created.data;
    if (!created.success || !createdNode?.id) {
      throw new Error(`API không xác nhận tạo node: ${JSON.stringify(created)}`);
    }

    const graph = await apiRequest(`/projects/${projectId}/graph`, { headers: authHeaders });
    const persistedNode = graph.data?.nodes?.find((node) => node.id === createdNode.id);
    if (!persistedNode) {
      throw new Error(`Node ${createdNode.id} không xuất hiện trong graph sau khi lưu.`);
    }
    console.log(`      Đã lưu và tìm thấy node "${persistedNode.name}" (${persistedNode.id}).`);

    console.log('[5/5] Hoàn tất: AI tạo node và Backend/Neo4j lưu node thành công.');
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
