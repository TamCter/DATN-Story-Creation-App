const assert = require('assert');

process.env.AI_PROVIDER = 'aimlapi';
process.env.AIMLAPI_API_KEY = 'test-key-not-for-network';
process.env.AIMLAPI_MODEL = 'google/gemini-3-1-flash-lite';

const expectedNode = {
  name: 'Linh Kiem Thu AI Test',
  type: 'character',
  desc: 'Một kiếm khách bí ẩn.',
};
const aiText = `Đã tạo nhân vật.\n\`\`\`json\n${JSON.stringify({
  action: 'create_node',
  node: expectedNode,
})}\n\`\`\``;
let capturedRequest;

global.fetch = async (url, options) => {
  capturedRequest = { url, options };
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { role: 'assistant', content: aiText } }],
    }),
  };
};

const { chatWithAI, extractCreateNodeResponse } = require('./controllers/aiController');

async function run() {
  const trailingJsonText =
    `Đã tạo xong.\n${JSON.stringify({ action: 'create_node', node: expectedNode })}` +
    `\nGhi chú thêm: {"sample": true}`;
  const extracted = extractCreateNodeResponse(trailingJsonText);
  assert.deepStrictEqual(extracted?.nodeData, expectedNode);
  assert.strictEqual(
    trailingJsonText.slice(extracted.start, extracted.end),
    JSON.stringify({ action: 'create_node', node: expectedNode })
  );

  const bracesInString = JSON.stringify({
    action: 'create_node',
    node: { ...expectedNode, desc: 'Mô tả có dấu ngoặc } và chuỗi "quoted".' },
  });
  assert.strictEqual(
    extractCreateNodeResponse(bracesInString)?.nodeData.desc,
    'Mô tả có dấu ngoặc } và chuỗi "quoted".'
  );

  let responseBody;
  let responseStatus;
  const req = {
    body: {
      messages: [
        { role: 'user', content: 'Tạo nhân vật' },
        { role: 'assistant', content: 'Bạn muốn tên gì?' },
        { role: 'user', content: 'Linh Kiem Thu AI Test, tự bổ sung chi tiết.' },
      ],
      projectContext: {
        projectTitle: 'AIMLAPI mock test',
        nodes: [{ name: 'Nhân vật có sẵn', type: 'character' }],
      },
    },
  };
  const res = {
    status(status) {
      responseStatus = status;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    },
  };

  await chatWithAI(req, res, (error) => {
    throw error;
  });

  assert.strictEqual(responseStatus, 200);
  assert.strictEqual(responseBody.success, true);
  assert.deepStrictEqual(responseBody.data.nodeData, expectedNode);
  assert.strictEqual(responseBody.data.model, process.env.AIMLAPI_MODEL);
  assert.match(capturedRequest.url, /^https:\/\/api\.aimlapi\.com\/v1\/chat\/completions$/);
  assert.strictEqual(capturedRequest.options.headers.Authorization, 'Bearer test-key-not-for-network');

  const payload = JSON.parse(capturedRequest.options.body);
  assert.strictEqual(payload.model, process.env.AIMLAPI_MODEL);
  assert.strictEqual(payload.messages[0].role, 'system');
  assert.match(payload.messages[0].content, /AIMLAPI mock test/);
  assert.strictEqual(payload.messages[1].role, 'user');
  assert.strictEqual(payload.messages[2].role, 'assistant');
  assert.strictEqual(payload.messages[3].content, 'Linh Kiem Thu AI Test, tự bổ sung chi tiết.');
  assert.match(responseBody.data.message, /Đã tạo nhân vật/);
  assert.doesNotMatch(responseBody.data.message, /create_node/);

  console.log('AI tests passed: AIMLAPI request and robust create-node JSON extraction are valid.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
