const { GoogleGenerativeAI } = require('@google/generative-ai');

const AIMLAPI_URL = 'https://api.aimlapi.com/v1/chat/completions';
const AIMLAPI_TIMEOUT_MS = 150000;
const MAX_NODE_GENERATION_ATTEMPTS = 3;
const NODE_TYPES = ['character', 'item', 'location', 'faction', 'event'];
const REQUIRED_NODE_FIELDS = {
  character: [
    'name', 'type', 'role', 'desc', 'gender', 'dob', 'birthplace',
    'weapon', 'sect', 'personality', 'status',
  ],
  item: ['name', 'type', 'desc', 'rarity', 'origin', 'element', 'holderOrLocation'],
  location: ['name', 'type', 'desc', 'region', 'climate', 'terrain', 'dangerLevel', 'ruler'],
  faction: [
    'name', 'type', 'desc', 'subType', 'alignment', 'status',
    'leader', 'headquarters', 'motto',
  ],
  event: ['name', 'type', 'desc', 'chapter', 'time', 'location', 'status', 'impact'],
};

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
- Nếu người dùng yêu cầu tạo nhiều node, hãy tạo tối đa 3 node khác nhau trong cùng một lần trả lời.
- Tự sáng tạo hợp lý mọi thông tin còn thiếu, đặc biệt birthplace, weapon, sect, origin, holderOrLocation, ruler, leader và headquarters. Không để trống, null, "không rõ", "chưa rõ" hoặc "không xác định"; khi chi tiết chưa được nêu, hãy tạo một chi tiết phù hợp với truyện.
- Mỗi node phải có đầy đủ các trường bắt buộc theo loại:
  character: name, type, role, desc, gender, dob, birthplace, weapon, sect, personality, status
  item: name, type, desc, rarity, origin, element, holderOrLocation
  location: name, type, desc, region, climate, terrain, dangerLevel, ruler
  faction: name, type, desc, subType, alignment, status, leader, headquarters, motto
  event: name, type, desc, chapter, time, location, status, impact
- Mọi trường phải là chuỗi vô hướng, không dùng object/array. Nếu tạo một node, trả về đúng một JSON:
  {"action":"create_node","node":{...}}
- Nếu tạo từ 2 đến 3 node, trả về đúng một JSON:
  {"action":"create_nodes","nodes":[{...node 1...},{...node 2...}]}
- Đặt JSON sau phần giới thiệu; không đặt thêm JSON nào khác trong câu trả lời.
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
            const nodes = parsed.action === 'create_node'
              ? [parsed.node]
              : parsed.action === 'create_nodes'
                ? parsed.nodes
                : null;
            if (Array.isArray(nodes) && nodes.length > 0 && nodes.length <= 3) {
              const isCompleteNode = (node) =>
                node &&
                typeof node === 'object' &&
                !Array.isArray(node) &&
                NODE_TYPES.includes(node.type) &&
                REQUIRED_NODE_FIELDS[node.type].every(
                  (field) =>
                    typeof node[field] === 'string' &&
                    node[field].trim() !== '' &&
                    !/^(unknown|not known|n\/a|không rõ|chưa rõ|không xác định)$/i.test(node[field].trim())
                ) &&
                Object.values(node).every(
                  (value) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
                );
              if (nodes.every(isCompleteNode)) {
                return { nodeData: nodes[0], nodeDataList: nodes, start, end: end + 1 };
              }
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

function getNodeCreationRequest(messages) {
  const latestUserIndex = messages.map((message) => message.role !== 'assistant').lastIndexOf(true);
  const latestUserMessage = latestUserIndex >= 0 ? messages[latestUserIndex].content || '' : '';
  const creationIntentPattern = /\b(tạo|thêm|generate|create|add)\b/i;
  const latestAssistantMessage = messages
    .slice(0, latestUserIndex)
    .reverse()
    .find((message) => message.role === 'assistant')?.content || '';
  const hasPendingCreationIntent =
    /\?\s*$/.test(latestAssistantMessage) &&
    messages
      .slice(0, latestUserIndex)
      .some((message) => message.role !== 'assistant' && creationIntentPattern.test(message.content || ''));
  const wantsNodes = creationIntentPattern.test(latestUserMessage) || hasPendingCreationIntent;
  if (!wantsNodes) return { wantsNodes: false, requestedCount: 1 };

  const countPattern =
    /(?:\b(\d+|một|hai|ba)\s*(?:node|nodes|thực thể|nhân vật|vật phẩm|địa điểm|phe phái|sự kiện)\b)|(?:\b(?:node|nodes|thực thể)\s*(?:x|:)?\s*(\d+|một|hai|ba)\b)/i;
  const countMessages = creationIntentPattern.test(latestUserMessage)
    ? [latestUserMessage]
    : messages
      .slice(0, latestUserIndex + 1)
      .filter((message) => message.role !== 'assistant')
      .map((message) => message.content || '');
  const countMatch = countMessages
    .reverse()
    .map((message) => message.match(countPattern))
    .find(Boolean);
  const countToken = countMatch?.[1] || countMatch?.[2];
  const requestedCount = Number(countToken) || { một: 1, hai: 2, ba: 3 }[countToken] || 1;
  return { wantsNodes, requestedCount: Math.min(3, requestedCount) };
}

async function generateAIResponse({ provider, apiKey, contextText, messages }) {
  if (provider === 'aimlapi') {
    const model = process.env.AIMLAPI_MODEL || 'google/gemini-3-1-flash-lite';
    const response = await fetch(AIMLAPI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: contextText },
          ...messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
        temperature: 0.85,
        max_tokens: 8192,
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
    const text = typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((part) => part?.text || '').join('')
        : '';
    if (!text.trim()) {
      throw new Error('AIMLAPI không trả nội dung văn bản trong choices[0].message.content');
    }
    return { text, model };
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
          maxOutputTokens: 8192,
        },
      });
      const result = await chat.sendMessage(messages[messages.length - 1].content);
      return { text: result.response.text(), model: modelName };
    } catch (error) {
      lastError = error;
      console.warn(
        `[AI Controller] Model ${modelName} không thành công: ${error.message}. Đang thử model tiếp theo...`
      );
    }
  }

  throw lastError || new Error('Không thể kết nối đến dịch vụ AI');
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
    const generationAttempt = req.__aiNodeGenerationAttempt || 1;

    if (generationAttempt > 1) {
      const apiKey = (
        process.env[provider === 'aimlapi' ? 'AIMLAPI_API_KEY' : 'GEMINI_API_KEY'] || ''
      ).trim();
      const generated = await generateAIResponse({
        provider,
        apiKey,
        contextText,
        messages,
      });
      responseText = generated.text;
      usedModel = generated.model;
    } else if (provider === 'aimlapi') {
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
              maxOutputTokens: 8192,
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
    let nodeDataList = [];
    let cleanMessage = responseText;
    const nodeResponse = extractCreateNodeResponse(responseText);
    const { wantsNodes, requestedCount } = getNodeCreationRequest(messages);
    const generatedCount = nodeResponse?.nodeDataList.length || 0;
    if (wantsNodes && (!nodeResponse || generatedCount < requestedCount)) {
      if (generationAttempt >= MAX_NODE_GENERATION_ATTEMPTS) {
        return res.status(502).json({
          success: false,
          message:
            `AI chưa tạo đủ ${requestedCount} node hợp lệ sau ${MAX_NODE_GENERATION_ATTEMPTS} lượt. ` +
            'Vui lòng thử lại hoặc bổ sung mô tả cụ thể hơn.',
        });
      }

      const issue = !nodeResponse
        ? 'Câu trả lời trước chưa có JSON node hợp lệ hoặc node thiếu trường bắt buộc.'
        : `Bạn mới tạo ${generatedCount}/${requestedCount} node được yêu cầu.`;
      console.warn(
        `[AI Controller] ${issue} Tự yêu cầu hoàn thiện lượt ${generationAttempt + 1}/${MAX_NODE_GENERATION_ATTEMPTS}.`
      );
      const retryRequest = {
        ...req,
        __aiNodeGenerationAttempt: generationAttempt + 1,
        body: {
          ...req.body,
          messages: [
            ...messages,
            { role: 'assistant', content: responseText },
            {
              role: 'user',
              content:
                `${issue} Hãy tiếp tục ngay, không hỏi người dùng và không bỏ node nào. ` +
                `Tạo đủ ít nhất ${requestedCount} node theo yêu cầu ban đầu; điền mọi trường bắt buộc bằng giá trị cụ thể, ` +
                `không để trống hoặc ghi "không rõ". Trả lời bằng một JSON hợp lệ duy nhất với action "create_node" ` +
                `cho một node hoặc "create_nodes" cho nhiều node, tối đa 3 node.`,
            },
          ],
        },
      };
      return chatWithAI(retryRequest, res, next);
    }

    if (nodeResponse) {
      nodeData = nodeResponse.nodeData;
      nodeDataList = nodeResponse.nodeDataList;
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
        nodeDataList,
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
