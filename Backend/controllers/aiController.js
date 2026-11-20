const { GoogleGenAI } = require('@google/genai');
const { runQuery } = require('../config/neo4j');

const AIMLAPI_URL = 'https://api.aimlapi.com/v1/chat/completions';
const AI_PROVIDER_TIMEOUT_MS = 150000;
const MAX_NODE_GENERATION_ATTEMPTS = 3;
const MAX_CHAT_MESSAGES = 40;
const MAX_STORED_CHAT_MESSAGES = 100;
const MAX_MESSAGE_LENGTH = 4000;
const NODE_TYPES = ['character', 'item', 'location', 'faction', 'event'];
const CORE_REQUIRED_NODE_FIELDS = {
  character: ['name', 'type', 'role', 'desc', 'gender', 'dob', 'personality', 'status'],
  item: ['name', 'type', 'desc', 'rarity', 'element'],
  location: ['name', 'type', 'desc', 'region', 'climate', 'terrain', 'dangerLevel'],
  faction: ['name', 'type', 'desc', 'subType', 'alignment', 'status', 'motto'],
  event: ['name', 'type', 'desc', 'time', 'status', 'impact'],
};
const RELATIONAL_NODE_FIELDS = [
  'birthplace',
  'weapon',
  'sect',
  'statusEvent',
  'origin',
  'holderOrLocation',
  'ruler',
  'leader',
  'headquarters',
  'location',
  'chapter',
  'charactersInvolved',
  'characters',
];
const PLACEHOLDER_VALUE_PATTERN = /^(unknown|not known|n\/a|none|null|undefined|không rõ|chưa rõ|không xác định|chưa xác định|không có|trống)$/i;

const SYSTEM_PROMPT = `Bạn là trợ lý AI hỗ trợ phát triển câu chuyện và xây dựng hồ sơ nhân vật, bối cảnh, tổ chức, vật phẩm và sự kiện.
Nhiệm vụ của bạn là giúp người dùng tạo các thực thể (node) trong đồ thị câu chuyện.

Có 5 loại node:
1. character (Nhân vật): name, type="character", role (NHÂN VẬT CHÍNH/ĐỐI LẬP/TRUNG LẬP), desc, gender (Nam/Nữ/Khác), dob, birthplace, weapon, sect, personality, status (Còn sống/Đã chết/Hồi sinh), statusEvent
2. item (Vật phẩm): name, type="item", desc, rarity (Phổ thông/Hiếm/Quý hiếm/Rất hiếm/Độc bản/Đặc biệt), origin, element, holderOrLocation
3. location (Địa điểm): name, type="location", desc, region, climate, terrain, dangerLevel (An toàn/Bình thường/Nguy hiểm/Khu vực hạn chế), ruler
4. faction (Tổ chức / Nhóm): name, type="faction", desc, subType (Đồng minh/Đối lập/Trung lập), alignment (ĐỒNG MINH/ĐỐI LẬP/TRUNG LẬP), status (Đang hoạt động/Tạm ngừng), leader, headquarters, motto, statusEvent
5. event (Sự kiện): name, type="event", desc, chapter, time, location, status (Đã diễn ra/Đang diễn ra/Chưa diễn ra), impact, charactersInvolved

QUY TẮC QUAN TRỌNG VỀ CÁC TRƯỜNG LIÊN KẾT / MỐI QUAN HỆ VỚI NODE KHÁC:
Các trường liên kết gồm: birthplace (Địa điểm), weapon (Vật phẩm), sect (Tổ chức), statusEvent (Sự kiện), origin (Địa điểm), holderOrLocation (Nhân vật), ruler (Tổ chức), leader (Nhân vật), headquarters (Địa điểm), location (Địa điểm).
- Nếu trong bản đồ node hiện tại của dự án ĐÃ CÓ thực thể phù hợp, hãy dùng chính xác tên của node đó.
- Nếu thực thể liên quan CHƯA TỒN TẠI trong bản đồ node của dự án, bạn chỉ chọn 1 trong 2 cách:
  1. TẠO RA NODE MỚI: Đặt tên riêng cụ thể cho thực thể đó (và ưu tiên dùng "create_nodes" để tạo kèm luôn node liên quan đó vào bản đồ, hoặc điền tên cụ thể để hệ thống tự động tạo node mới và nối quan hệ).
  2. BỎ TRỐNG: Để chuỗi rỗng "" cho trường liên kết đó nếu thực thể không có hoặc chưa cần mối quan hệ đó.
- TUYỆT ĐỐI KHÔNG điền các chữ giữ chỗ như "không rõ", "chưa rõ", "không xác định", "không có", "trống", "n/a".

Khi người dùng mô tả một thực thể hoặc hỏi về việc tạo node, hãy:
- Chat thân thiện, hỏi thêm thông tin nếu cần
- Nếu người dùng yêu cầu tạo nhiều node (hoặc tạo 1 node kèm các node liên quan mới), hãy tạo tối đa 3 node trong cùng một lần trả lời.
- Mỗi node phải có đầy đủ các trường thông tin cơ bản theo loại:
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

/**
 * Extracts and validates node creation JSON from a model response.
 */
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
            const rawNodes = parsed.action === 'create_node'
              ? [parsed.node]
              : parsed.action === 'create_nodes'
                ? parsed.nodes
                : null;

            if (Array.isArray(rawNodes) && rawNodes.length > 0 && rawNodes.length <= 3) {
              const sanitizeNode = (node) => {
                if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
                const copy = { ...node };
                for (const relField of RELATIONAL_NODE_FIELDS) {
                  if (copy[relField] === null || copy[relField] === undefined) {
                    copy[relField] = '';
                  } else if (typeof copy[relField] === 'string') {
                    const trimmed = copy[relField].trim();
                    copy[relField] = PLACEHOLDER_VALUE_PATTERN.test(trimmed) ? '' : trimmed;
                  }
                }
                return copy;
              };

              const nodes = rawNodes.map(sanitizeNode);
              const isCompleteNode = (node) =>
                node &&
                typeof node === 'object' &&
                !Array.isArray(node) &&
                NODE_TYPES.includes(node.type) &&
                CORE_REQUIRED_NODE_FIELDS[node.type].every(
                  (field) =>
                    typeof node[field] === 'string' &&
                    node[field].trim() !== '' &&
                    !PLACEHOLDER_VALUE_PATTERN.test(node[field].trim())
                ) &&
                RELATIONAL_NODE_FIELDS.every(
                  (field) => !(field in node) || typeof node[field] === 'string'
                ) &&
                Object.values(node).every(
                  (value) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
                );

              if (nodes.every(isCompleteNode)) {
                return { nodeData: nodes[0], nodeDataList: nodes, start, end: end + 1 };
              }
            }
          } catch {
            // Ignore braces that are not a valid node JSON payload.
          }
          break;
        }
      }
    }
  }

  return null;
}

/**
 * Determines whether the latest user turn explicitly requests story nodes.
 */
function getNodeCreationRequest(messages) {
  const creationIntentPattern = /(?<![\p{L}\p{N}])(?:tạo|thêm|generate|create|add)(?![\p{L}\p{N}])/iu;
  const nodeTopicPattern = /(?<![\p{L}\p{N}])(?:node|nodes|thực thể|nhân vật|vật phẩm|địa điểm|tổ chức(?!\s+(?:một|các|những|buổi|sự kiện|hoạt động|cuộc họp|chương trình|lễ))|nhóm|phe phái|sự kiện|character|item|location|faction|event)(?![\p{L}\p{N}])/iu;
  const latestUserIndex = messages.map((message) => message.role === 'user').lastIndexOf(true);
  const latestUserMessage = latestUserIndex >= 0 ? messages[latestUserIndex].content || '' : '';

  const previousAssistantIndex = (() => {
    for (let index = latestUserIndex - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === 'assistant') {
        return /\?\s*$/.test(messages[index].content || '') ? index : -1;
      }
    }
    return -1;
  })();

  const trailingAssistantMessage = previousAssistantIndex >= 0 ? messages[previousAssistantIndex].content || '' : '';
  const pendingUserMessage = previousAssistantIndex > 0 ? messages[previousAssistantIndex - 1] : null;

  const hasPendingCreationIntent =
    previousAssistantIndex >= 0 &&
    pendingUserMessage &&
    pendingUserMessage.role === 'user' &&
    /\?\s*$/.test(trailingAssistantMessage) &&
    creationIntentPattern.test(pendingUserMessage.content || '') &&
    nodeTopicPattern.test(pendingUserMessage.content || '');

  const latestUserIntent =
    creationIntentPattern.test(latestUserMessage) &&
    nodeTopicPattern.test(latestUserMessage);

  const wantsNodes = latestUserIntent || hasPendingCreationIntent;
  if (!wantsNodes) return { wantsNodes: false, requestedCount: 1 };

  const countPattern = /(?<![\p{L}\p{N}])(?:\d+|một|hai|ba)\s*(?:node|nodes|thực thể|nhân vật|vật phẩm|địa điểm|tổ chức|nhóm|phe phái|sự kiện)(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])(?:node|nodes|thực thể)\s*(?:x|:)?\s*(\d+|một|hai|ba)(?![\p{L}\p{N}])/iu;
  const requestMessage = latestUserIntent ? latestUserMessage : (pendingUserMessage?.content || '');
  const countMatch = requestMessage.match(countPattern);
  const countToken = (countMatch?.[0] || '').match(/(\d+|một|hai|ba)/iu)?.[1] || '1';
  const requestedCount = Number(countToken) || { một: 1, hai: 2, ba: 3 }[countToken.toLowerCase()] || 1;
  return { wantsNodes, requestedCount: Math.min(3, requestedCount) };
}

function normalizeEventCharacters(events, characterNodes) {
  const characters = characterNodes.filter(
    (node) => node && node.type === 'character' && typeof node.name === 'string' && node.name.trim()
  );

  return events.map((event) => {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      return event;
    }

    let rawCharacters = [];
    if (Array.isArray(event.charactersInvolved)) {
      rawCharacters = event.charactersInvolved;
    } else if (typeof event.charactersInvolved === 'string') {
      try {
        const parsed = JSON.parse(event.charactersInvolved);
        rawCharacters = Array.isArray(parsed)
          ? parsed
          : event.charactersInvolved.split(/[,;\n]+/);
      } catch {
        rawCharacters = event.charactersInvolved.split(/[,;\n]+/);
      }
    }
    if (Array.isArray(event.characterStatusChanges)) {
      rawCharacters.push(
        ...event.characterStatusChanges
          .map((change) => change?.characterName)
          .filter((name) => typeof name === 'string')
      );
    }
    const involvedNames = [];
    const involvedKeys = new Set();
    for (const rawName of rawCharacters) {
      if (typeof rawName !== 'string') continue;
      const name = rawName.trim();
      const nameKey = name.toLocaleLowerCase();
      if (name && !involvedKeys.has(nameKey)) {
        involvedNames.push(name);
        involvedKeys.add(nameKey);
      }
    }
    const eventText = [event.name, event.desc, event.impact]
      .filter((value) => typeof value === 'string')
      .join(' ');
    const matchedCharacterRanges = [];

    for (const character of [...characters].sort((a, b) => b.name.length - a.name.length)) {
      const name = character.name.trim();
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const namePattern = new RegExp(
        `(^|[^\\p{L}\\p{N}\\p{M}])${escapedName}(?=$|[^\\p{L}\\p{N}\\p{M}])`,
        'giu'
      );
      const nameKey = name.toLocaleLowerCase();
      const nameRanges = [];
      let match;
      let isMentioned = false;

      while ((match = namePattern.exec(eventText)) !== null) {
        const start = match.index + match[1].length;
        const end = start + name.length;
        if (!matchedCharacterRanges.some((range) => start >= range.start && end <= range.end)) {
          isMentioned = true;
          nameRanges.push({ start, end });
        }
      }

      if (isMentioned && !involvedKeys.has(nameKey)) {
        involvedNames.push(name);
        involvedKeys.add(nameKey);
      }
      matchedCharacterRanges.push(...nameRanges);
    }

    return { ...event, charactersInvolved: involvedNames };
  });
}

/**
 * Calls the selected AI provider and normalizes the response text.
 */
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
      signal: AbortSignal.timeout(AI_PROVIDER_TIMEOUT_MS),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(result?.error?.message || result?.message || `AIMLAPI trả về HTTP ${response.status}`);
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

  const genAI = new GoogleGenAI({ apiKey });
  const preferredModel = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const candidateModels = Array.from(new Set([preferredModel, 'gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-flash-latest']));
  let lastError = null;

  for (const modelName of candidateModels) {
    try {
      const history = messages.slice(0, -1).map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      }));

      const chat = genAI.chats.create({
        model: modelName,
        history,
        config: {
          systemInstruction: contextText,
          temperature: 0.85,
          maxOutputTokens: 8192,
          httpOptions: { timeout: AI_PROVIDER_TIMEOUT_MS },
        },
      });

      const result = await chat.sendMessage({ message: messages[messages.length - 1].content });
      const text = result?.text || result?.candidates?.[0]?.content?.parts?.map((part) => part?.text || '').join('') || '';
      if (!text.trim()) {
        throw new Error('Gemini không trả nội dung văn bản hợp lệ.');
      }
      return { text, model: modelName };
    } catch (error) {
      lastError = error;
      console.warn(`[AI Controller] Model ${modelName} không thành công: ${error.message}. Đang thử model tiếp theo...`);
    }
  }

  throw lastError || new Error('Không thể kết nối đến dịch vụ AI');
}

/**
 * Chat with the configured AI provider and optionally extract/create story nodes.
 */
async function chatWithAI(req, res, next) {
  try {
    const { messages = [], projectContext = {} } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, message: 'Thiếu danh sách tin nhắn' });
    }

    const normalizedMessages = messages
      .filter((message) => message?.role !== 'system')
      .slice(-MAX_CHAT_MESSAGES)
      .map((message) => {
        if (!message || typeof message.content !== 'string') {
          throw new Error('Mỗi tin nhắn phải có nội dung văn bản hợp lệ.');
        }
        return {
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.content.slice(0, MAX_MESSAGE_LENGTH),
        };
      });

    while (normalizedMessages[0]?.role === 'assistant') {
      normalizedMessages.shift();
    }

    if (!normalizedMessages.length || normalizedMessages[normalizedMessages.length - 1].role !== 'user') {
      return res.status(400).json({
        success: false,
        message: 'Tin nhắn cuối cùng phải do người dùng gửi.',
      });
    }

    let contextText = SYSTEM_PROMPT;
    if (projectContext.projectTitle) {
      contextText += `\n\nDự án hiện tại: "${projectContext.projectTitle}"`;
    }
    if (projectContext.nodes && projectContext.nodes.length > 0) {
      const nodesSummary = projectContext.nodes
        .slice(0, 20)
        .map((n) => `- ${n.name} (${n.type})`)
        .join('\n');
      contextText += `\n\nCác thực thể đã có trong đồ thị: \n${nodesSummary}`;
      if (projectContext.nodes.length > 20) {
        contextText += `\n... và ${projectContext.nodes.length - 20} thực thể khác`;
      }
    }

    const provider = (process.env.AI_PROVIDER || (process.env.AIMLAPI_API_KEY ? 'aimlapi' : 'gemini')).trim().toLowerCase();
    const apiKey = (process.env[provider === 'aimlapi' ? 'AIMLAPI_API_KEY' : 'GEMINI_API_KEY'] || '').trim();
    if (!['aimlapi', 'gemini'].includes(provider)) {
      return res.status(503).json({
        success: false,
        message: `AI_PROVIDER không hợp lệ: '${provider}'. Hãy chọn 'aimlapi' hoặc 'gemini'.`,
      });
    }
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        message: provider === 'aimlapi'
          ? 'Thiếu AIMLAPI_API_KEY. Hãy cấu hình khóa AIMLAPI trong file .env của Backend.'
          : 'AI chưa được cấu hình. Hãy thêm GEMINI_API_KEY hoặc AIMLAPI_API_KEY vào file .env',
      });
    }

    let responseText = '';
    let usedModel = '';
    let nodeData = null;
    let nodeDataList = [];
    let nodeResponse = null;
    let attemptedNodeCreation = false;
    let attemptMessages = normalizedMessages;
    let cleanMessage = '';
    const { wantsNodes, requestedCount } = getNodeCreationRequest(normalizedMessages);
    const creationActionPattern = /"action"\s*:\s*"create_nodes?"/i;

    for (let attempt = 1; attempt <= MAX_NODE_GENERATION_ATTEMPTS; attempt += 1) {
      const generated = await generateAIResponse({
        provider,
        apiKey,
        contextText,
        messages: attemptMessages,
      });
      responseText = generated.text;
      usedModel = generated.model;
      nodeResponse = extractCreateNodeResponse(responseText);
      attemptedNodeCreation ||= creationActionPattern.test(responseText);

      const generatedCount = nodeResponse?.nodeDataList.length || 0;
      if (!wantsNodes || (nodeResponse && generatedCount >= requestedCount)) {
        break;
      }

      if (attempt < MAX_NODE_GENERATION_ATTEMPTS) {
        const issue = !nodeResponse
          ? 'Câu trả lời trước chưa có JSON node hợp lệ hoặc node thiếu trường bắt buộc.'
          : `Bạn mới tạo ${generatedCount}/${requestedCount} node được yêu cầu.`;

        console.warn(`[AI Controller] ${issue} Tự yêu cầu hoàn thiện lượt ${attempt + 1}/${MAX_NODE_GENERATION_ATTEMPTS}.`);
        attemptMessages = [
          ...attemptMessages,
          { role: 'assistant', content: responseText },
          {
            role: 'user',
            content:
              `${issue} Hãy tiếp tục ngay, không hỏi người dùng và không bỏ node nào. ` +
              `Tạo đủ ít nhất ${requestedCount} node theo yêu cầu ban đầu; điền đầy đủ các trường cơ bản, ` +
              'còn các trường quan hệ với node khác (birthplace, weapon, sect, origin, holderOrLocation, ruler, leader, headquarters, location) ' +
              'thì chọn đúng tên node đã có, tạo tên node mới cụ thể, hoặc để chuỗi rỗng "" (tuyệt đối không ghi "không rõ"). ' +
              'Trả lời bằng một JSON hợp lệ duy nhất với action "create_node" cho một node hoặc "create_nodes" cho nhiều node, tối đa 3 node.',
          },
        ];
      }
    }

    const generatedCount = nodeResponse?.nodeDataList.length || 0;
    if (wantsNodes && (!nodeResponse || generatedCount < requestedCount)) {
      if (attemptedNodeCreation) {
        return res.status(502).json({
          success: false,
          message: `AI chưa tạo đủ ${requestedCount} node hợp lệ sau ${MAX_NODE_GENERATION_ATTEMPTS} lượt. Vui lòng thử lại hoặc bổ sung mô tả cụ thể hơn.`,
        });
      }
      nodeResponse = null;
    }

    cleanMessage = responseText;
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

/**
 * Tự động tạo Chương mới và các Sự kiện trong chương dựa trên ngữ cảnh truyện
 * POST /api/ai/generate-chapter-events
 * Body: { projectTitle, userIdea, chapters, nodes, writingStyle }
 */
async function generateChapterAndEvents(req, res, next) {
  try {
    const {
      projectTitle = 'Dự án mới',
      userIdea = '',
      chapters = [],
      nodes = [],
      writingStyle = 'Văn phong tự nhiên, phù hợp với thể loại và bối cảnh câu chuyện',
    } = req.body || {};

    const provider = (process.env.AI_PROVIDER || (process.env.AIMLAPI_API_KEY ? 'aimlapi' : 'gemini')).trim().toLowerCase();
    const apiKey = (process.env[provider === 'aimlapi' ? 'AIMLAPI_API_KEY' : 'GEMINI_API_KEY'] || '').trim();
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        message: 'AI chưa được cấu hình. Vui lòng thêm GEMINI_API_KEY hoặc AIMLAPI_API_KEY vào file .env của Backend.',
      });
    }

    // Tính toán số thứ tự chương tiếp theo
    const nextChapterNumber = chapters.length > 0
      ? Math.max(...chapters.map((c) => Number(c.chapterNumber) || 0)) + 1
      : 1;

    // Tổng hợp thông tin các chương trước
    const chaptersSummary = chapters
      .slice(-3)
      .map((c) => `- Chương ${c.chapterNumber}: ${c.title} (${c.desc || 'Chưa có tóm tắt'})`)
      .join('\n');

    // Tổng hợp các node nhân vật, địa điểm, tổ chức và vật phẩm hiện có
    const characterNodes = nodes.filter(
      (node) => node && node.type === 'character' && typeof node.name === 'string'
    );
    const characters = characterNodes
      .slice(0, 30)
      .map((node) =>
        [
          node.name,
          node.status && `trạng thái: ${node.status}`,
          node.role && `vai trò: ${node.role}`,
          node.sect && `tổ chức/nhóm: ${node.sect}`,
          node.desc && `mô tả: ${node.desc.slice(0, 180)}`,
        ]
          .filter(Boolean)
          .join(' | ')
      );
    const locations = nodes
      .filter((n) => n.type === 'location')
      .slice(0, 10)
      .map((n) => `${n.name}${n.region ? ` (${n.region})` : ''}`);
    const factions = nodes
      .filter((n) => n.type === 'faction')
      .slice(0, 8)
      .map((n) => n.name);
    const items = nodes
      .filter((n) => n.type === 'item')
      .slice(0, 8)
      .map((n) => n.name);

    const contextPrompt = `Bạn là trợ lý AI sáng tạo cốt truyện tài hoa cho tiểu thuyết thể loại: ${writingStyle}.
Dự án tiểu thuyết: "${projectTitle}".
${chaptersSummary ? `Các chương gần nhất:\n${chaptersSummary}\n` : ''}
Các thực thể hiện có trong truyện:
- Nhân vật: ${characters.join(', ') || 'Chưa có'}
- Địa điểm: ${locations.join(', ') || 'Chưa có'}
- Tổ chức / Nhóm: ${factions.join(', ') || 'Chưa có'}
- Vật phẩm: ${items.join(', ') || 'Chưa có'}

Nhiệm vụ của bạn:
1. Tạo thông tin cho CHƯƠNG TIẾP THEO (Chương ${nextChapterNumber}).
2. Tạo 2 đến 4 SỰ KIỆN CHÍNH (events) diễn ra theo trình tự thời gian trong chương này. Sự kiện cần gắn kết chặt chẽ với các nhân vật và địa điểm hiện có (hoặc giới thiệu mới nếu phù hợp với mạch truyện).

QUY TẮC NHÂN VẬT TRONG TỪNG SỰ KIỆN (BẮT BUỘC):
- Mỗi sự kiện phải có trường "charactersInvolved" là một mảng tên nhân vật, không được bỏ trống trường hoặc trả về null.
- Ghi đủ tất cả nhân vật có hành động, đối thoại, xuất hiện hoặc liên quan trực tiếp đến diễn biến sự kiện.
- Ưu tiên nhân vật đã có trong danh sách ở trên và dùng chính xác tên của họ; đối chiếu vai trò/mô tả để chọn đúng người, không gán nhân vật không liên quan.
- Nếu tên nhân vật hiện có xuất hiện trong tên hoặc mô tả sự kiện, bắt buộc đưa nhân vật đó vào "charactersInvolved".
- Chỉ dùng mảng rỗng khi sự kiện thực sự không có nhân vật liên quan; nếu truyện đã có nhân vật thì mỗi sự kiện chính thông thường phải có ít nhất một nhân vật.
- Mỗi sự kiện phải có "characterStatusChanges" là một mảng. Chỉ thêm nhân vật vào đây khi sự kiện trong chương làm thay đổi trạng thái thực sự của họ: dùng "Đã chết" khi họ chết thật sự trong diễn biến hiện tại, hoặc "Hồi sinh" khi họ được hồi sinh. Không đánh dấu chết vì tin đồn, giả chết, hồi tưởng, nguy cơ hay cách nói ẩn dụ. Không đưa nhân vật vào nếu trạng thái không đổi; dùng [] khi không có thay đổi.
- Mỗi thay đổi phải có "characterName" (tên chính xác), "status" ("Đã chết" hoặc "Hồi sinh"), và "statusEvent" là tên sự kiện này. Nhân vật có thay đổi trạng thái phải có trong "charactersInvolved". Không tạo thay đổi trái với trạng thái hiện tại nếu mạch truyện không có sự kiện hồi sinh.
${userIdea ? `Ý tưởng định hướng từ tác giả: "${userIdea}"` : 'Tác giả muốn bạn tự do phát triển tiếp nối các diễn biến trước một cách kịch tính, hấp dẫn.'}

BẮT BUỘC trả về định dạng JSON thuần túy (không thêm lời dẫn ngoài JSON), đúng cấu trúc sau:
\`\`\`json
{
  "chapter": {
    "chapterNumber": ${nextChapterNumber},
    "title": "Chương ${nextChapterNumber}: <Tiêu đề chương hấp dẫn, hào hùng>",
    "desc": "<Tóm tắt ngắn gọn diễn biến cốt lõi của chương (2-3 câu)>"
  },
  "events": [
    {
      "name": "<Tên sự kiện ngắn gọn, hành động>",
      "desc": "<Mô tả chi tiết sự kiện diễn ra thế nào>",
      "location": "<Tên địa điểm nơi diễn ra>",
      "time": "<Thời điểm diễn ra, ví dụ: Đầu chương / Ban đêm / Khi trăng tròn>",
      "charactersInvolved": ["<Tên chính xác nhân vật hiện có hoặc nhân vật mới có vai trò trực tiếp>", "<Tên nhân vật khác nếu có>"],
      "characterStatusChanges": [
        {
          "characterName": "<Tên nhân vật có trạng thái thay đổi>",
          "status": "Đã chết",
          "statusEvent": "<Tên sự kiện này>"
        }
      ],
      "impact": "<Tác động hoặc hậu quả sau sự kiện>"
    }
  ]
}
\`\`\``;

    const messages = [
      {
        role: 'user',
        content: `Hãy tạo chương ${nextChapterNumber} và các sự kiện trong chương cho truyện "${projectTitle}".`,
      },
    ];

    const aiRes = await generateAIResponse({
      provider,
      apiKey,
      contextText: contextPrompt,
      messages,
    });

    // Trích xuất JSON từ kết quả
    let parsedData = null;
    try {
      const jsonMatch = aiRes.text.match(/\{[\s\S]*"chapter"[\s\S]*"events"[\s\S]*\}/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
      } else {
        const anyJson = aiRes.text.match(/\{[\s\S]*\}/);
        if (anyJson) {
          parsedData = JSON.parse(anyJson[0]);
        }
      }
    } catch (parseError) {
      console.warn('Lỗi parse JSON chương từ AI:', parseError.message);
    }

    const hasValidChapterTitle =
      typeof parsedData?.chapter?.title === 'string' &&
      parsedData.chapter.title.trim().length > 0;
    const hasValidEvents =
      Array.isArray(parsedData?.events) &&
      parsedData.events.every((event) =>
        event &&
        typeof event === 'object' &&
        !Array.isArray(event) &&
        typeof event.name === 'string' &&
        event.name.trim().length > 0 &&
        typeof event.desc === 'string' &&
        (!('location' in event) || typeof event.location === 'string') &&
        (!('time' in event) || typeof event.time === 'string') &&
        (!('impact' in event) || typeof event.impact === 'string') &&
        Array.isArray(event.characterStatusChanges) &&
        event.characterStatusChanges.every((change) =>
          change &&
          typeof change === 'object' &&
          !Array.isArray(change) &&
          typeof change.characterName === 'string' &&
          change.characterName.trim().length > 0 &&
          ['Đã chết', 'Hồi sinh'].includes(change.status) &&
          (!('statusEvent' in change) || typeof change.statusEvent === 'string')
        ) &&
        (!('charactersInvolved' in event) ||
          typeof event.charactersInvolved === 'string' ||
          (Array.isArray(event.charactersInvolved) &&
            event.charactersInvolved.every((name) => typeof name === 'string')))
      );

    if (!parsedData || !hasValidChapterTitle || !hasValidEvents) {
      return res.status(500).json({
        success: false,
        message: 'AI không tạo được cấu trúc chương và sự kiện hợp lệ. Vui lòng thử lại.',
        raw: aiRes.text,
      });
    }

    const events = normalizeEventCharacters(parsedData.events, characterNodes).map((event) => {
      const rawLoc = typeof event.location === 'string' ? event.location.trim() : '';
      const cleanLocation = PLACEHOLDER_VALUE_PATTERN.test(rawLoc) ? '' : rawLoc;
      const cleanCharacters = Array.isArray(event.charactersInvolved)
        ? event.charactersInvolved
            .map((name) => String(name).trim())
            .filter((name) => name && !PLACEHOLDER_VALUE_PATTERN.test(name))
        : [];
      return {
        ...event,
        location: cleanLocation,
        charactersInvolved: cleanCharacters,
        characterStatusChanges: event.characterStatusChanges.map((change) => ({
          ...change,
          characterName: change.characterName.trim(),
          statusEvent: event.name,
        })),
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        chapter: parsedData.chapter,
        events,
        model: aiRes.model,
      },
    });
  } catch (error) {
    console.error('Lỗi khi tạo chương & sự kiện bằng AI:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Không thể tạo chương bằng AI. Vui lòng thử lại.',
    });
  }
}

/**
 * Lấy toàn bộ các node của chương đó và sáng tác nên câu chuyện hoàn chỉnh cho chương
 * POST /api/ai/generate-chapter-story
 * Body: { projectTitle, chapter, events, relatedNodes, writingStyle, customPrompt }
 */
async function generateChapterStory(req, res, next) {
  try {
    const {
      projectTitle = 'Dự án mới',
      chapter = {},
      events = [],
      relatedNodes = [],
      writingStyle = 'Văn phong tự nhiên, phù hợp với thể loại và bối cảnh câu chuyện',
      customPrompt = '',
    } = req.body || {};

    if (!chapter.title) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin chương truyện' });
    }

    const provider = (process.env.AI_PROVIDER || (process.env.AIMLAPI_API_KEY ? 'aimlapi' : 'gemini')).trim().toLowerCase();
    const apiKey = (process.env[provider === 'aimlapi' ? 'AIMLAPI_API_KEY' : 'GEMINI_API_KEY'] || '').trim();
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        message: 'AI chưa được cấu hình. Vui lòng thêm GEMINI_API_KEY hoặc AIMLAPI_API_KEY vào file .env của Backend.',
      });
    }

    // Liệt kê chi tiết các sự kiện trong chương
    const eventsDetail = events
      .map((ev, idx) => {
        let detail = `[Sự kiện ${idx + 1}]: ${ev.name || ev.title || 'Sự kiện'}\n- Diễn biến: ${ev.desc || 'Chưa có mô tả'}`;
        if (ev.location) detail += `\n- Địa điểm: ${ev.location}`;
        if (ev.time) detail += `\n- Thời gian: ${ev.time}`;
        if (ev.impact) detail += `\n- Kết quả/Tác động: ${ev.impact}`;
        if (Array.isArray(ev.charactersInvolved) && ev.charactersInvolved.length > 0) {
          detail += `\n- Nhân vật tham gia: ${ev.charactersInvolved.join(', ')}`;
        }
        if (Array.isArray(ev.characterStatusChanges) && ev.characterStatusChanges.length > 0) {
          detail += `\n- Thay đổi trạng thái nhân vật: ${ev.characterStatusChanges
            .map((change) => `${change.characterName}: ${change.status}`)
            .join(', ')}`;
        }
        return detail;
      })
      .join('\n\n');

    // Liệt kê chi tiết các thực thể liên quan trong chương
    const nodesDetail = relatedNodes
      .map((n) => {
        let detail = `- [${(n.type || 'thực thể').toUpperCase()}] ${n.name}: ${n.desc || ''}`;
        if (n.status) detail += ` | Trạng thái: ${n.status}`;
        if (n.role) detail += ` | Vai trò: ${n.role}`;
        if (n.sect) detail += ` | Tổ chức/nhóm: ${n.sect}`;
        if (n.weapon) detail += ` | Vật dụng: ${n.weapon}`;
        if (n.personality) detail += ` | Tính cách: ${n.personality}`;
        if (n.region) detail += ` | Khu vực: ${n.region}`;
        return detail;
      })
      .join('\n');

    const contextPrompt = `Bạn là một đại tác giả viết tiểu thuyết hàng đầu chuyên thể loại: ${writingStyle}.
Tác phẩm: "${projectTitle}".

Bạn đang viết nội dung đầy đủ cho:
Tên chương: "${chapter.title}"
Số thứ tự: Chương ${chapter.chapterNumber || 1}
Tóm tắt định hướng: "${chapter.desc || ''}"

CÁC SỰ KIỆN TRONG CHƯƠNG BẮT BUỘC PHẢI DIỄN RA THEO MẠCH TRUYỆN:
${eventsDetail || 'Diễn biến tự nhiên theo tóm tắt chương.'}

CÁC THỰC THỂ (NHÂN VẬT, ĐỊA ĐIỂM, TỔ CHỨC, VẬT PHẨM) XUẤT HIỆN TRONG CHƯƠNG:
${nodesDetail || 'Nhân vật theo sự kiện.'}

${customPrompt ? `Yêu cầu thêm từ tác giả: "${customPrompt}"` : ''}

YÊU CẦU NGHỆ THUẬT KHI VIẾT CÂU CHUYỆN:
1. Viết một chương truyện HOÀN CHỈNH, liền mạch, cuốn hút (độ dài khoảng 1200 - 2500 từ).
2. Khắc họa sống động tâm lý nhân vật, lời thoại tự nhiên và phù hợp với bối cảnh.
3. Miêu tả cảnh quan, không khí và các hành động quan trọng rõ ràng, giàu hình ảnh nhưng nhất quán với thế giới truyện.
4. Lồng ghép khéo léo và tự nhiên TOÀN BỘ các sự kiện đã nêu ở trên theo đúng trình tự thời gian.
5. Đoạn kết chương đọng lại dư âm hoặc nút thắt bất ngờ để độc giả hồi hộp đón đọc chương sau.
6. Trình bày văn bản rõ ràng, chia đoạn hợp lý. KHÔNG chèn lời mở đầu hay kết thúc của AI (ví dụ: "Dưới đây là...", "Hy vọng bạn thích..."), CHỈ trả về đúng nội dung câu chuyện của chương.
7. Nếu sự kiện có thay đổi trạng thái nhân vật, diễn biến trong truyện phải thể hiện đúng thay đổi đó; không tự ý để nhân vật đã chết tiếp tục hành động như còn sống hoặc tự ý thay đổi trạng thái khác với sự kiện.`;

    const messages = [
      {
        role: 'user',
        content: `Hãy viết toàn bộ câu chuyện hoàn chỉnh cho ${chapter.title}. Bắt đầu trực tiếp vào tác phẩm.`,
      },
    ];

    const aiRes = await generateAIResponse({
      provider,
      apiKey,
      contextText: contextPrompt,
      messages,
    });

    const storyContent = aiRes.text.trim();
    const wordCount = storyContent.split(/\s+/).filter(Boolean).length;

    return res.status(200).json({
      success: true,
      data: {
        title: chapter.title,
        chapterNumber: chapter.chapterNumber,
        storyContent,
        wordCount,
        model: aiRes.model,
      },
    });
  } catch (error) {
    console.error('Lỗi khi sáng tác câu chuyện chương bằng AI:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Không thể sáng tác câu chuyện bằng AI. Vui lòng thử lại.',
    });
  }
}

/**
 * Lấy lịch sử trò chuyện AI của tác giả hiện tại cho một dự án cụ thể
 * GET /api/ai/chat-history/:projectId
 */
async function getChatHistory(req, res) {
  const { projectId } = req.params;
  const userId = req.user?.id;
  if (!userId || !projectId) {
    return res.status(400).json({ success: false, message: 'Thiếu thông tin tác giả hoặc dự án' });
  }

  try {
    const records = await runQuery(
      `
      MATCH (chat:AIChatSession { userId: $userId, projectId: $projectId })
      RETURN chat.messagesJson AS messagesJson,
             chat.updatedAt AS updatedAt,
             coalesce(chat.revision, 0) AS revision,
             chat.deletedAt AS deletedAt
      LIMIT 1
      `,
      { userId, projectId },
      'READ'
    );

    let messages = [];
    if (records.length > 0 && records[0].messagesJson) {
      try {
        const parsed = JSON.parse(records[0].messagesJson);
        if (Array.isArray(parsed)) {
          messages = parsed;
        }
      } catch {
        messages = [];
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        projectId,
        userId,
        messages,
        updatedAt: records[0]?.updatedAt || null,
        revision: Number(records[0]?.revision) || 0,
        deletedAt: records[0]?.deletedAt || null,
      },
    });
  } catch (error) {
    console.warn('[AI Controller] Không thể tải lịch sử chat từ Neo4j:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Không thể tải lịch sử trò chuyện AI từ máy chủ.',
    });
  }
}

/**
 * Lưu lịch sử trò chuyện AI của tác giả hiện tại cho một dự án cụ thể
 * PUT /api/ai/chat-history/:projectId
 */
async function saveChatHistory(req, res) {
  const { projectId } = req.params;
  const userId = req.user?.id;
  const { messages = [], expectedRevision } = req.body || {};

  if (!userId || !projectId) {
    return res.status(400).json({ success: false, message: 'Thiếu thông tin tác giả hoặc dự án' });
  }
  if (!Array.isArray(messages)) {
    return res.status(400).json({ success: false, message: 'Danh sách tin nhắn không hợp lệ' });
  }
  const hasExpectedRevision = expectedRevision !== undefined && expectedRevision !== null;
  const parsedExpectedRevision = hasExpectedRevision ? Number(expectedRevision) : null;
  if (
    hasExpectedRevision &&
    (!Number.isInteger(parsedExpectedRevision) || parsedExpectedRevision < 0)
  ) {
    return res.status(400).json({ success: false, message: 'Phiên bản expectedRevision không hợp lệ' });
  }

  try {
    const sanitized = messages
      .filter((m) => m && typeof m === 'object' && typeof m.content === 'string')
      .slice(-MAX_STORED_CHAT_MESSAGES)
      .map((m) => ({
        id: String(m.id || `m-${Date.now()}`),
        role: m.role === 'user' || m.role === 'system' ? m.role : 'assistant',
        content: m.content.slice(0, MAX_MESSAGE_LENGTH),
        nodeData: m.nodeData || null,
        nodeDataList: Array.isArray(m.nodeDataList) ? m.nodeDataList : [],
        timestamp: Number(m.timestamp) || Date.now(),
        canRetry: Boolean(m.canRetry),
      }));

    const messagesJson = JSON.stringify(sanitized);

    const saved = await runQuery(
      `
      MERGE (chat:AIChatSession { userId: $userId, projectId: $projectId })
      ON CREATE SET chat.createdAt = timestamp(), chat.revision = 0
      WITH chat, coalesce(chat.revision, 0) AS currentRevision
      WITH chat, currentRevision,
           ($expectedRevision IS NULL OR currentRevision = $expectedRevision) AS canWrite
      FOREACH (_ IN CASE WHEN canWrite THEN [1] ELSE [] END |
        SET chat.messagesJson = $messagesJson,
            chat.updatedAt = timestamp(),
            chat.deletedAt = null,
            chat.revision = currentRevision + 1
      )
      WITH chat, canWrite
      OPTIONAL MATCH (u:User { id: $userId })
      FOREACH (_ IN CASE WHEN canWrite AND u IS NOT NULL THEN [1] ELSE [] END |
        MERGE (u)-[:HAS_AI_CHAT]->(chat)
      )
      WITH chat, canWrite
      OPTIONAL MATCH (p:Project { id: $projectId })
      FOREACH (_ IN CASE WHEN canWrite AND p IS NOT NULL THEN [1] ELSE [] END |
        MERGE (chat)-[:FOR_PROJECT]->(p)
      )
      RETURN canWrite, chat.updatedAt AS updatedAt, chat.revision AS revision
      `,
      { userId, projectId, messagesJson, expectedRevision: parsedExpectedRevision }
    );

    if (!saved.length || !saved[0].canWrite) {
      return res.status(409).json({
        success: false,
        code: 'REVISION_CONFLICT',
        message: 'Lịch sử trò chuyện trên máy chủ đã thay đổi. Vui lòng đồng bộ trước khi lưu.',
        data: {
          projectId,
          userId,
          revision: Number(saved[0]?.revision) || 0,
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        projectId,
        userId,
        count: sanitized.length,
        updatedAt: saved[0]?.updatedAt || Date.now(),
        revision: Number(saved[0]?.revision) || 1,
      },
    });
  } catch (error) {
    console.error('[AI Controller] Lỗi lưu lịch sử chat:', error);
    return res.status(500).json({
      success: false,
      message: 'Không thể lưu lịch sử trò chuyện AI',
    });
  }
}

/**
 * Xóa lịch sử trò chuyện AI của tác giả cho một dự án
 * DELETE /api/ai/chat-history/:projectId
 */
async function clearChatHistory(req, res) {
  const { projectId } = req.params;
  const userId = req.user?.id;
  if (!userId || !projectId) {
    return res.status(400).json({ success: false, message: 'Thiếu thông tin tác giả hoặc dự án' });
  }

  try {
    const cleared = await runQuery(
      `
      MERGE (chat:AIChatSession { userId: $userId, projectId: $projectId })
      ON CREATE SET chat.createdAt = timestamp(), chat.revision = 0
      SET chat.messagesJson = '[]',
          chat.updatedAt = timestamp(),
          chat.deletedAt = timestamp(),
          chat.revision = coalesce(chat.revision, 0) + 1
      RETURN chat.revision AS revision, chat.deletedAt AS deletedAt
      `,
      { userId, projectId }
    );
    return res.status(200).json({
      success: true,
      data: {
        projectId,
        userId,
        revision: Number(cleared[0]?.revision) || 1,
        deletedAt: cleared[0]?.deletedAt || Date.now(),
      },
    });
  } catch (error) {
    console.error('[AI Controller] Lỗi xóa lịch sử chat:', error);
    return res.status(500).json({
      success: false,
      message: 'Không thể xóa lịch sử trò chuyện AI',
    });
  }
}

module.exports = {
  chatWithAI,
  clearChatHistory,
  extractCreateNodeResponse,
  generateChapterAndEvents,
  generateChapterStory,
  getChatHistory,
  normalizeEventCharacters,
  saveChatHistory,
};
