const { GoogleGenerativeAI } = require('@google/generative-ai');

// System prompt mô tả cấu trúc node trong app
const SYSTEM_PROMPT = `Bạn là trợ lý AI sáng tạo chuyên hỗ trợ viết truyện
Nhiệm vụ của bạn là giúp người dùng tạo các thực thể (node) trong đồ thị câu chuyện.

Có 5 loại node:
1. character (Nhân vật): name, type="character", role (CHÍNH DIỆN/PHẢN DIỆN/TRUNG LẬP), desc, gender (Nam/Nữ/Khác), dob, birthplace, weapon, sect, personality, status (Còn sống/Đã chết/Hồi sinh), statusEvent
2. item (Vật phẩm): name, type="item", desc, rarity (Phổ thông/Hiếm/Quý hiếm/Thần khí/Truyền thuyết), origin, element, holderOrLocation
3. location (Địa điểm): name, type="location", desc, region (Đông Vực/Tây Vực/Nam Vực/Bắc Vực/Trung Nguyên), climate, dangerLevel (Tuyệt đối an toàn/An toàn/Nguy hiểm/Cực kỳ nguy hiểm), ruler
4. faction (Phe phái): name, type="faction", desc, subType (Chính phái/Tà phái), alignment (CHÍNH PHÁI/TÀ PHÁI), status (Hưng thịnh/Suy tàn), leader, headquarters, motto, statusEvent
5. event (Sự kiện): name, type="event", desc, chapter, location, status (Đã diễn ra/Đang diễn ra/Chưa diễn ra)

Khi người dùng mô tả một thực thể hoặc hỏi về việc tạo node, hãy:
- Chat thân thiện, hỏi thêm thông tin nếu cần
- Nếu người dùng yêu cầu tạo/thêm node, hãy tự suy luận hợp lý các thông tin còn thiếu và tạo ngay, không hỏi thêm.
- Khi người dùng yêu cầu tạo node hoặc đã đủ thông tin, trả về lời giới thiệu ngắn gọn kèm một JSON hợp lệ với định dạng CHÍNH XÁC:
  {"action":"create_node","node":{...các trường phù hợp với loại node...}}
- Các trường của node phải là giá trị vô hướng; luôn có name và type hợp lệ (character, item, location, faction, event).
- Nếu chỉ đang trò chuyện/hỏi ý kiến thì không cần trả về JSON
- Trả lời bằng tiếng Việt`;

/**
 * Chat với AI để tạo node trong câu chuyện
 * POST /api/ai/chat
 * Body: { messages: [{role, content}], projectContext: {nodes, projectTitle} }
 */
async function chatWithAI(req, res, next) {
  try {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        message: 'AI chưa được cấu hình. Vui lòng thêm GEMINI_API_KEY vào file .env',
      });
    }

    const { messages = [], projectContext = {} } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, message: 'Thiếu danh sách tin nhắn' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // Xây dựng context về dự án hiện tại để AI biết các thực thể đang có
    let contextText = SYSTEM_PROMPT;
    if (projectContext.projectTitle) {
      contextText += `\n\nDự án hiện tại: "${projectContext.projectTitle}"`;
    }
    if (projectContext.nodes && projectContext.nodes.length > 0) {
      const nodesSummary = projectContext.nodes
        .slice(0, 20) // Giới hạn để tránh vượt token
        .map((n) => `- ${n.name} (${n.type})`)
        .join('\n');
      contextText += `\n\nCác thực thể đã có trong đồ thị: \n${nodesSummary} `;
      if (projectContext.nodes.length > 20) {
        contextText += `\n... và ${projectContext.nodes.length - 20} thực thể khác`;
      }
    }

    // Chuyển đổi lịch sử chat sang định dạng Gemini
    const history = messages.slice(0, -1).map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const lastMessage = messages[messages.length - 1];

    // Ưu tiên model đã kiểm tra hoạt động; vẫn cho phép cấu hình model riêng.
    const preferredModel = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
    const candidateModels = Array.from(
      new Set([preferredModel, 'gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-flash-latest'])
    );

    let lastError = null;
    let responseText = '';
    let usedModel = '';

    for (const m of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({
          model: m,
          systemInstruction: contextText,
        });

        const chat = model.startChat({
          history,
          generationConfig: {
            temperature: 0.85,
            maxOutputTokens: 1024,
          },
        });

        const result = await chat.sendMessage(lastMessage.content);
        responseText = result.response.text();
        usedModel = m;
        break;
      } catch (err) {
        lastError = err;
        console.warn(`[AI Controller] Thử nghiệm model ${m} không thành công: ${err.message}. Đang thử model tiếp theo...`);
      }
    }

    if (!responseText) {
      throw lastError || new Error('Không thể kết nối đến dịch vụ AI');
    }

    // Kiểm tra xem response có chứa JSON tạo node không
    let nodeData = null;
    let cleanMessage = responseText;

    try {
      // Tìm JSON block trong response
      const jsonMatch = responseText.match(/\{[\s\S]*"action"\s*:\s*"create_node"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (
          parsed.action === 'create_node' &&
          parsed.node &&
          typeof parsed.node === 'object' &&
          !Array.isArray(parsed.node) &&
          typeof parsed.node.name === 'string' &&
          parsed.node.name.trim() &&
          ['character', 'item', 'location', 'faction', 'event'].includes(parsed.node.type)
        ) {
          nodeData = parsed.node;
          cleanMessage = [
            responseText.slice(0, jsonMatch.index).trim(),
            responseText.slice(jsonMatch.index + jsonMatch[0].length).trim(),
          ].filter(Boolean).join('\n\n');
          if (!cleanMessage) {
            cleanMessage = `✨ Tôi đã thiết lập xong thực thể "${nodeData.name}". Bạn có thể xem trước và thêm vào đồ thị bên dưới!`;
          }
        }
      }
    } catch (parseErr) {
      console.warn('Lỗi parse JSON từ AI response:', parseErr.message);
    }

    return res.status(200).json({
      success: true,
      data: {
        message: cleanMessage,
        nodeData,
        raw: responseText,
        model: usedModel,
      },
    });
  } catch (error) {
    console.error('Lỗi khi gọi Gemini AI:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Không thể tạo nội dung từ AI. Vui lòng thử lại.',
    });
  }
}

module.exports = {
  chatWithAI,
};
