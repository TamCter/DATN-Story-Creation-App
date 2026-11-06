const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { chatWithAI } = require('./controllers/aiController');

async function testFull() {
  console.log('=== TEST TẠO THỰC THỂ QUA AI VỚI GEMINI 3.8 / CHUỖI DỰ PHÒNG ===');

  const req = {
    body: {
      messages: [
        {
          role: 'user',
          content: 'Tạo cho tôi một nữ kiếm khách bí ẩn từ Bắc Vực tên là Hàn Băng Nhiên',
        },
      ],
      projectContext: {
        projectTitle: 'Thiên Đạo Vấn Đỉnh',
        nodes: [
          { name: 'Lăng Tiêu', type: 'character' },
          { name: 'Thiên Kiếm Tông', type: 'faction' },
        ],
      },
    },
  };

  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      console.log(`\nHTTP STATUS: ${this.statusCode}`);
      console.log('SUCCESS:', payload.success);
      if (payload.success) {
        console.log('MODEL SỬ DỤNG:', payload.data.model);
        console.log('\n--- LỜI THOẠI TRẢ LỜI CỦA AI ---');
        console.log(payload.data.message);
        console.log('\n--- DỮ LIỆU NODE ĐƯỢC TỰ ĐỘNG TRÍCH XUẤT ---');
        console.log(JSON.stringify(payload.data.nodeData, null, 2));
      } else {
        console.error('LỖI:', payload.message);
      }
    },
  };

  await chatWithAI(req, res, (err) => console.error('Next err:', err));
}

testFull();
