const assert = require('assert');

process.env.AI_PROVIDER = 'aimlapi';
process.env.AIMLAPI_API_KEY = 'test-key-not-for-network';

const {
  generateChapterAndEvents,
  normalizeEventCharacters,
} = require('./controllers/aiController');

const characters = [
  {
    name: 'Lăng Tiêu',
    type: 'character',
    role: 'CHÍNH DIỆN',
    desc: 'Kiếm khách lưu lạc.',
  },
  {
    name: 'Mộc Lan',
    type: 'character',
    role: 'TRUNG LẬP',
    desc: 'Y sư tại Bạch Liên Cốc.',
  },
  {
    name: 'Lăng',
    type: 'character',
    desc: 'Nhân vật có tên gần giống.',
  },
];

async function run() {
  const normalized = normalizeEventCharacters(
    [
      {
        name: 'Cuộc gặp trong mưa',
        desc: 'Lăng Tiêu được Mộc Lan cứu chữa.',
      },
      {
        name: 'Cuộc truy đuổi',
        desc: 'Lăng Tiêu đối đầu kẻ truy sát.',
        charactersInvolved: 'Mộc Lan; Mộc Lan',
      },
    ],
    characters
  );

  assert.deepStrictEqual(normalized[0].charactersInvolved, ['Lăng Tiêu', 'Mộc Lan']);
  assert.deepStrictEqual(normalized[1].charactersInvolved, ['Mộc Lan', 'Lăng Tiêu']);

  const aiResponse = JSON.stringify({
    chapter: { chapterNumber: 1, title: 'Chương 1', desc: 'Một chương mới.' },
    events: [
      {
        name: 'Cuộc gặp trong mưa',
        desc: 'Lăng Tiêu được Mộc Lan cứu chữa tại Bạch Liên Cốc.',
      },
    ],
  });
  let capturedPrompt = '';
  global.fetch = async (_url, options) => {
    capturedPrompt = JSON.parse(options.body).messages[0].content;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: aiResponse } }],
      }),
    };
  };

  let responseStatus;
  let responseBody;
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

  await generateChapterAndEvents(
    {
      body: {
        projectTitle: 'Kiếm Khách',
        nodes: characters,
      },
    },
    res,
    (error) => {
      throw error;
    }
  );

  assert.strictEqual(responseStatus, 200);
  assert.deepStrictEqual(
    responseBody.data.events[0].charactersInvolved,
    ['Lăng Tiêu', 'Mộc Lan']
  );
  assert.match(capturedPrompt, /QUY TẮC NHÂN VẬT TRONG TỪNG SỰ KIỆN/);
  assert.match(capturedPrompt, /Lăng Tiêu/);

  console.log('AI event character tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
