const { GoogleGenerativeAI } = require('@google/generative-ai');

const AIMLAPI_URL = 'https://api.aimlapi.com/v1/chat/completions';
const AIMLAPI_TIMEOUT_MS = 150000;
const NODE_TYPES = ['character', 'item', 'location', 'faction', 'event'];

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

function extractCreateNodeResponse(responseText) {
  for (let start = 0; start < responseText.length; start += 1) {
    if (responseText[start] !== '{') continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let end = start; end < responseText.length; end += 1) {
      const character = responseText[end];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === '\\') {
          escaped = true;
        } else if (character === '"') {
          inString = false;
        }
        continue;
      }

      if (character === '"') {
        inString = true;
      } else if (character === '{') {
        depth += 1;
      } else if (character === '}') {
        depth -= 1;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(responseText.slice(start, end + 1));
            if (
              parsed.action === 'create_node' &&
              parsed.node &&
              typeof parsed.node === 'object' &&
              !Array.isArray(parsed.node) &&
              typeof parsed.node.name === 'string' &&
              parsed.node.name.trim() &&
              NODE_TYPES.includes(parsed.node.type)
            ) {
              return { nodeData: parsed.node, start, end: end + 1 };
            }
          } catch {
            // Continue scanning; the response may contain unrelated brace-delimited text.
          }
          break;
        }
      }
    }
  }

  return null;
}

/**
 * Chat với AI để tạo node trong câu chuyện
 * POST /api/ai/chat
 * Body: { messages: [{role, content}], projectContext: {nodes, projectTitle} }
 */
async function chatWithAI(req, res, next) {
  try {
    const { messages = [], projectContext = {} } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, message: 'Thiếu danh sách tin nhắn' });
    }

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

    const provider = (process.env.AI_PROVIDER || (process.env.AIMLAPI_API_KEY ? 'aimlapi' : 'gemini'))
      .trim()
      .toLowerCase();
    let responseText = '';
    let usedModel = '';

    if (provider === 'aimlapi') {
      const apiKey = (process.env.AIMLAPI_API_KEY || '').trim();
      if (!apiKey) {
        return res.status(503).json({
          success: false,
          message: 'Thiếu AIMLAPI_API_KEY. Hãy cấu hình khóa AIMLAPI trong file .env của Backend.',
        });
      }

      usedModel = process.env.AIMLAPI_MODEL || 'google/gemini-3-1-flash-lite';
      const apiMessages = [
        { role: 'system', content: contextText },
        ...messages.map((message) => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.content,
        })),
      ];
      const response = await fetch(AIMLAPI_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: usedModel,
          messages: apiMessages,
          temperature: 0.85,
          max_tokens: 2048,
        }),
        signal: AbortSignal.timeout(AIMLAPI_TIMEOUT_MS),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          result?.error?.message ||
            result?.message ||
            `AIMLAPI trả về HTTP ${response.status}`
        );
      }

      const content = result?.choices?.[0]?.message?.content;
      responseText = typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.map((part) => part?.text || '').join('')
          : '';
      if (!responseText.trim()) {
        throw new Error('AIMLAPI không trả nội dung văn bản trong choices[0].message.content');
      }
    } else if (provider === 'gemini') {
      const apiKey = (process.env.GEMINI_API_KEY || '').trim();
      if (!apiKey) {
        return res.status(503).json({
          success: false,
          message: 'AI chưa được cấu hình. Hãy thêm GEMINI_API_KEY hoặc AIMLAPI_API_KEY vào file .env',
        });
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const preferredModel = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
      const candidateModels = Array.from(
        new Set([preferredModel, 'gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-flash-latest'])
      );
      let lastError = null;

      for (const modelName of candidateModels) {
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: contextText,
          });
          const history = messages.slice(0, -1).map((message) => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }],
          }));
          const chat = model.startChat({
            history,
            generationConfig: {
              temperature: 0.85,
              maxOutputTokens: 4096,
            },
          });
          const result = await chat.sendMessage(messages[messages.length - 1].content);
          responseText = result.response.text();
          usedModel = modelName;
          break;
        } catch (error) {
          lastError = error;
          console.warn(
            `[AI Controller] Model ${modelName} không thành công: ${error.message}. Đang thử model tiếp theo...`
          );
        }
      }

      if (!responseText) {
        throw lastError || new Error('Không thể kết nối đến dịch vụ AI');
      }
    } else {
      return res.status(503).json({
        success: false,
        message: `AI_PROVIDER không hợp lệ: '${provider}'. Hãy chọn 'aimlapi' hoặc 'gemini'.`,
      });
    }

    let nodeData = null;
    let cleanMessage = responseText;
    const nodeResponse = extractCreateNodeResponse(responseText);
    if (nodeResponse) {
      nodeData = nodeResponse.nodeData;
      cleanMessage = [
        responseText.slice(0, nodeResponse.start).trim(),
        responseText.slice(nodeResponse.end).trim(),
      ].filter(Boolean).join('\n\n');
      if (!cleanMessage) {
        cleanMessage = `✨ Tôi đã thiết lập xong thực thể "${nodeData.name}". Bạn có thể xem trước và thêm vào đồ thị bên dưới!`;
      }
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
    console.error('Lỗi khi gọi AI:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Không thể tạo nội dung từ AI. Vui lòng thử lại.',
    });
  }
}

module.exports = {
  chatWithAI,
  extractCreateNodeResponse,
};
