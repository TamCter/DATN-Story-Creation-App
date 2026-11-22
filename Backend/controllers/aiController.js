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

function normalizeEventCharacters(
  events,
  characterNodes,
  { includeDescriptionMatches = true } = {}
) {
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

    if (!includeDescriptionMatches) {
      return { ...event, charactersInvolved: involvedNames };
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

let chatSessionConstraintPromise = null;

async function ensureChatSessionConstraint() {
  if (!chatSessionConstraintPromise) {
    chatSessionConstraintPromise = (async () => {
      // Kiểm tra trước xem constraint đã tồn tại chưa để tránh chạy dọn dẹp lặp lại giữa nhiều tiến trình
      const existingConstraints = await runQuery(
        `
        SHOW CONSTRAINTS
        YIELD name
        WHERE name = 'ai_chat_session_key_unique'
        RETURN name
        `,
        {},
        'READ'
      ).catch(() => []);
      if (existingConstraints.length > 0) {
        return;
      }

      // Khóa chéo tiến trình trên Neo4j trong quá trình chuẩn hóa và tạo constraint
      await runQuery(
        `
        MERGE (lock:SchemaLock { name: 'ai_chat_session_constraint' })
        SET lock.lockedAt = timestamp()
        WITH lock
        OPTIONAL MATCH (chat:AIChatSession)
        WHERE chat.sessionKey IS NULL AND chat.userId IS NOT NULL AND chat.projectId IS NOT NULL
        SET chat.sessionKey = chat.userId + '::' + chat.projectId
        WITH lock
        OPTIONAL MATCH (dupChat:AIChatSession)
        WHERE dupChat.sessionKey IS NOT NULL
        WITH lock, dupChat.sessionKey AS key, dupChat
        ORDER BY coalesce(dupChat.revision, 0) DESC,
                 coalesce(dupChat.updatedAt, 0) DESC,
                 coalesce(dupChat.createdAt, 0) ASC,
                 elementId(dupChat) ASC
        WITH lock, key, collect(dupChat) AS sessions
        WHERE size(sessions) > 1
        FOREACH (dup IN tail(sessions) | DETACH DELETE dup)
        `
      );
      // Tạo ràng buộc duy nhất theo sessionKey (tương thích cả Neo4j Community và Enterprise)
      await runQuery(
        `
        CREATE CONSTRAINT ai_chat_session_key_unique IF NOT EXISTS
        FOR (chat:AIChatSession) REQUIRE chat.sessionKey IS UNIQUE
        `
      );
    })().catch((err) => {
      chatSessionConstraintPromise = null;
      throw err;
    });
  }
  return chatSessionConstraintPromise;
}

function isNeo4jUniqueConstraintError(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '');
  return (
    code === 'Neo.ClientError.Schema.ConstraintValidationFailed' ||
    msg.includes('ConstraintValidationFailed') ||
    msg.includes('already exists with label')
  );
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

  const sessionKey = `${userId}::${projectId}`;

  try {
    const records = await runQuery(
      `
      MATCH (chat:AIChatSession)
      WHERE chat.sessionKey = $sessionKey
         OR (chat.userId = $userId AND chat.projectId = $projectId)
      RETURN chat.messagesJson AS messagesJson,
             chat.updatedAt AS updatedAt,
             coalesce(chat.revision, 0) AS revision,
             chat.deletedAt AS deletedAt,
             chat.lastWriteId AS lastWriteId,
             chat.lastClearId AS lastClearId
      ORDER BY coalesce(chat.revision, 0) DESC,
               coalesce(chat.updatedAt, 0) DESC,
               coalesce(chat.createdAt, 0) ASC,
               elementId(chat) ASC
      LIMIT 1
      `,
      { sessionKey, userId, projectId },
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
        lastWriteId: records[0]?.lastWriteId || null,
        lastClearId: records[0]?.lastClearId || null,
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
  const { messages = [], expectedRevision, writeId } = req.body || {};

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
  const normalizedWriteId =
    typeof writeId === 'string' && writeId.trim().length > 0 ? writeId.trim().slice(0, 128) : null;

  const sessionKey = `${userId}::${projectId}`;

  try {
    await ensureChatSessionConstraint();

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

    const runSaveQuery = () =>
      runQuery(
        `
        MERGE (chat:AIChatSession { sessionKey: $sessionKey })
        ON CREATE SET chat.userId = $userId,
                      chat.projectId = $projectId,
                      chat.createdAt = timestamp(),
                      chat.revision = 0
        SET chat._revisionLock = coalesce(chat._revisionLock, 0) + 1
        WITH chat, coalesce(chat.revision, 0) AS currentRevision
        WITH chat, currentRevision,
             coalesce($writeId IS NOT NULL AND chat.lastWriteId = $writeId, false) AS isReplay,
             ($expectedRevision IS NULL OR currentRevision = $expectedRevision) AS matchesExpected
        WITH chat, currentRevision, isReplay, matchesExpected, (isReplay OR matchesExpected) AS canWrite
        FOREACH (_ IN CASE WHEN matchesExpected AND NOT isReplay THEN [1] ELSE [] END |
          SET chat.messagesJson = $messagesJson,
              chat.updatedAt = timestamp(),
              chat.deletedAt = null,
              chat.revision = currentRevision + 1,
              chat.lastWriteId = $writeId,
              chat.lastClearId = null,
              chat.lastClearRevision = null
        )
        REMOVE chat._revisionLock
        WITH chat, canWrite, isReplay
        OPTIONAL MATCH (u:User { id: $userId })
        FOREACH (_ IN CASE WHEN canWrite AND NOT isReplay AND u IS NOT NULL THEN [1] ELSE [] END |
          MERGE (u)-[:HAS_AI_CHAT]->(chat)
        )
        WITH chat, canWrite, isReplay
        OPTIONAL MATCH (p:Project { id: $projectId })
        FOREACH (_ IN CASE WHEN canWrite AND NOT isReplay AND p IS NOT NULL THEN [1] ELSE [] END |
          MERGE (chat)-[:FOR_PROJECT]->(p)
        )
        RETURN canWrite, isReplay, chat.updatedAt AS updatedAt, chat.revision AS revision
        `,
        {
          sessionKey,
          userId,
          projectId,
          messagesJson,
          expectedRevision: parsedExpectedRevision,
          writeId: normalizedWriteId,
        }
      );

    let saved;
    try {
      saved = await runSaveQuery();
    } catch (saveErr) {
      if (isNeo4jUniqueConstraintError(saveErr)) {
        // Hai lần lưu đầu tiên chạy đồng thời đụng ràng buộc duy nhất -> thử lại 1 lần để kiểm tra expectedRevision
        try {
          saved = await runSaveQuery();
        } catch (retryErr) {
          if (isNeo4jUniqueConstraintError(retryErr)) {
            return res.status(409).json({
              success: false,
              code: 'REVISION_CONFLICT',
              message: 'Lịch sử trò chuyện trên máy chủ đã thay đổi. Vui lòng đồng bộ trước khi lưu.',
              data: { projectId, userId },
            });
          }
          throw retryErr;
        }
      } else {
        throw saveErr;
      }
    }

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
        replayed: Boolean(saved[0]?.isReplay),
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

  const rawClearId = req.body?.clearId ?? req.query?.clearId;
  const normalizedClearId =
    typeof rawClearId === 'string' && rawClearId.trim().length > 0
      ? rawClearId.trim().slice(0, 128)
      : null;
  const rawExpectedRevision = req.body?.expectedRevision ?? req.query?.expectedRevision;
  const hasExpectedRevision =
    rawExpectedRevision !== undefined && rawExpectedRevision !== null && rawExpectedRevision !== '';
  const parsedExpectedRevision = hasExpectedRevision ? Number(rawExpectedRevision) : null;
  if (
    hasExpectedRevision &&
    (!Number.isInteger(parsedExpectedRevision) || parsedExpectedRevision < 0)
  ) {
    return res.status(400).json({ success: false, message: 'Phiên bản expectedRevision không hợp lệ' });
  }

  const sessionKey = `${userId}::${projectId}`;

  try {
    await ensureChatSessionConstraint();

    const runClearQuery = () =>
      runQuery(
        `
        MERGE (chat:AIChatSession { sessionKey: $sessionKey })
        ON CREATE SET chat.userId = $userId,
                      chat.projectId = $projectId,
                      chat.createdAt = timestamp(),
                      chat.revision = 0
        SET chat._revisionLock = coalesce(chat._revisionLock, 0) + 1
        WITH chat, coalesce(chat.revision, 0) AS currentRevision
        WITH chat, currentRevision,
             coalesce(
               $clearId IS NOT NULL
                 AND chat.lastClearId = $clearId
                 AND chat.deletedAt IS NOT NULL
                 AND chat.lastClearRevision = currentRevision,
               false
             ) AS isReplay,
             ($expectedRevision IS NULL OR currentRevision = $expectedRevision) AS matchesExpected
        WITH chat, currentRevision, isReplay, matchesExpected, (isReplay OR matchesExpected) AS canClear
        FOREACH (_ IN CASE WHEN matchesExpected AND NOT isReplay THEN [1] ELSE [] END |
          SET chat.messagesJson = '[]',
              chat.updatedAt = timestamp(),
              chat.deletedAt = timestamp(),
              chat.revision = currentRevision + 1,
              chat.lastClearId = $clearId,
              chat.lastClearRevision = currentRevision + 1,
              chat.lastWriteId = null
        )
        REMOVE chat._revisionLock
        RETURN canClear, isReplay, chat.revision AS revision, chat.deletedAt AS deletedAt
        `,
        {
          sessionKey,
          userId,
          projectId,
          clearId: normalizedClearId,
          expectedRevision: parsedExpectedRevision,
        }
      );

    let cleared;
    try {
      cleared = await runClearQuery();
    } catch (clearErr) {
      if (isNeo4jUniqueConstraintError(clearErr)) {
        cleared = await runClearQuery();
      } else {
        throw clearErr;
      }
    }

    if (!cleared.length || !cleared[0].canClear) {
      return res.status(409).json({
        success: false,
        code: 'REVISION_CONFLICT',
        message: 'Lịch sử trò chuyện trên máy chủ đã có cập nhật mới hơn.',
        data: {
          projectId,
          userId,
          revision: Number(cleared[0]?.revision) || 0,
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        projectId,
        userId,
        revision: Number(cleared[0]?.revision) || 1,
        deletedAt: cleared[0]?.deletedAt || Date.now(),
        replayed: Boolean(cleared[0]?.isReplay),
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

/**
 * Phân tích văn bản một chương do tác giả tự viết:
 * - Bắt lỗi tính nhất quán (nhân vật đã chết, mâu thuẫn địa điểm/lần đầu đặt chân, vật phẩm, tổ chức, thời gian, đặc điểm, quan hệ...)
 * - Trích xuất & đề xuất các node mới (character, item, location, faction) và các sự kiện của chương (event)
 * - Đề xuất cập nhật trạng thái nhân vật nếu có (Đã chết / Hồi sinh)
 * POST /api/ai/analyze-chapter
 */
async function analyzeChapterText(req, res, next) {
  try {
    const {
      projectTitle = 'Dự án truyện',
      chapterNumber,
      chapterTitle = '',
      chapterText = '',
      nodes = [],
      links = [],
      chapters = [],
    } = req.body || {};

    const MAX_CHAPTER_ANALYSIS_CHARS = 40000;
    const cleanText = typeof chapterText === 'string' ? chapterText.trim() : '';
    if (cleanText.length < 20) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập nội dung chương tối thiểu 20 ký tự để AI phân tích.',
      });
    }
    if (cleanText.length > MAX_CHAPTER_ANALYSIS_CHARS) {
      return res.status(400).json({
        success: false,
        message: `Nội dung chương dài ${cleanText.length.toLocaleString('vi-VN')} ký tự, vượt giới hạn tối đa ${MAX_CHAPTER_ANALYSIS_CHARS.toLocaleString('vi-VN')} ký tự. Vui lòng rút gọn hoặc chia nhỏ chương trước khi phân tích.`,
      });
    }

    const provider = (
      process.env.AI_PROVIDER || (process.env.AIMLAPI_API_KEY ? 'aimlapi' : 'gemini')
    )
      .trim()
      .toLowerCase();
    const apiKey = (
      process.env[provider === 'aimlapi' ? 'AIMLAPI_API_KEY' : 'GEMINI_API_KEY'] || ''
    ).trim();
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        message:
          'AI chưa được cấu hình. Vui lòng thêm GEMINI_API_KEY hoặc AIMLAPI_API_KEY vào file .env của Backend.',
      });
    }

    const safeNodes = Array.isArray(nodes) ? nodes.filter((n) => n && typeof n === 'object') : [];
    const safeLinks = Array.isArray(links) ? links.filter((l) => l && typeof l === 'object') : [];
    const safeChapters = Array.isArray(chapters)
      ? chapters.filter((c) => c && typeof c === 'object')
      : [];

    const resolvedChapterNumber =
      Number.isInteger(Number(chapterNumber)) && Number(chapterNumber) > 0
        ? Number(chapterNumber)
        : safeChapters.length > 0
          ? Math.max(...safeChapters.map((c) => Number(c.chapterNumber) || 0)) + 1
          : 1;

    const nodeNameById = new Map();
    for (const n of safeNodes) {
      if (n.id && n.name) {
        nodeNameById.set(String(n.id), String(n.name));
      }
    }

    const allCharacters = safeNodes.filter((n) => n.type === 'character' && n.name);
    const allLocations = safeNodes.filter((n) => n.type === 'location' && n.name);
    const allItems = safeNodes.filter((n) => n.type === 'item' && n.name);
    const allFactions = safeNodes.filter((n) => n.type === 'faction' && n.name);
    const allEvents = safeNodes.filter((n) => n.type === 'event' && n.name);
    const eligibleChapters = safeChapters
      .filter((c) => {
        const num = Number(c.chapterNumber);
        return Number.isFinite(num) && num < resolvedChapterNumber;
      })
      .sort((a, b) => (Number(a.chapterNumber) || 0) - (Number(b.chapterNumber) || 0));

    const MAX_CTX_CHARACTERS = 50;
    const MAX_CTX_LOCATIONS = 35;
    const MAX_CTX_ITEMS = 35;
    const MAX_CTX_FACTIONS = 25;
    const MAX_CTX_EVENTS = 40;
    const MAX_CTX_CHAPTERS = 15;
    const MAX_CTX_LINKS = 80;

    const contextOmissions = {
      omittedCharacters: Math.max(0, allCharacters.length - MAX_CTX_CHARACTERS),
      omittedLocations: Math.max(0, allLocations.length - MAX_CTX_LOCATIONS),
      omittedItems: Math.max(0, allItems.length - MAX_CTX_ITEMS),
      omittedFactions: Math.max(0, allFactions.length - MAX_CTX_FACTIONS),
      omittedEvents: Math.max(0, allEvents.length - MAX_CTX_EVENTS),
      omittedChapters: Math.max(0, eligibleChapters.length - MAX_CTX_CHAPTERS),
      omittedLinks: Math.max(0, safeLinks.length - MAX_CTX_LINKS),
      totalOmitted: 0,
    };
    contextOmissions.totalOmitted =
      contextOmissions.omittedCharacters +
      contextOmissions.omittedLocations +
      contextOmissions.omittedItems +
      contextOmissions.omittedFactions +
      contextOmissions.omittedEvents +
      contextOmissions.omittedChapters +
      contextOmissions.omittedLinks;

    const characterLines = allCharacters
      .slice(0, MAX_CTX_CHARACTERS)
      .map((n) =>
        [
          n.name,
          n.status && `trạng thái=${n.status}`,
          n.statusEvent && `biến cố trạng thái=${n.statusEvent}`,
          n.role && `vai trò=${n.role}`,
          n.gender && `giới tính=${n.gender}`,
          n.dob && `ngày sinh/tuổi=${n.dob}`,
          n.birthplace && `nơi sinh=${n.birthplace}`,
          n.weapon && `vật dụng/vũ khí=${n.weapon}`,
          n.sect && `tổ chức=${n.sect}`,
          n.personality && `tính cách=${String(n.personality).slice(0, 120)}`,
          n.desc && `mô tả=${String(n.desc).slice(0, 160)}`,
        ]
          .filter(Boolean)
          .join(' | ')
      );

    const locationLines = allLocations
      .slice(0, MAX_CTX_LOCATIONS)
      .map((n) =>
        [
          n.name,
          n.region && `vùng=${n.region}`,
          n.climate && `khí hậu=${n.climate}`,
          n.terrain && `địa hình=${n.terrain}`,
          n.dangerLevel && `nguy hiểm=${n.dangerLevel}`,
          n.ruler && `cai quản=${n.ruler}`,
          n.status && `trạng thái=${n.status}`,
          n.desc && `mô tả=${String(n.desc).slice(0, 140)}`,
        ]
          .filter(Boolean)
          .join(' | ')
      );

    const itemLines = allItems
      .slice(0, MAX_CTX_ITEMS)
      .map((n) =>
        [
          n.name,
          n.rarity && `độ hiếm=${n.rarity}`,
          n.status && `trạng thái=${n.status}`,
          n.holderOrLocation && `người giữ/vị trí=${n.holderOrLocation}`,
          n.origin && `nguồn gốc=${n.origin}`,
          n.element && `nguyên tố=${n.element}`,
          n.desc && `mô tả=${String(n.desc).slice(0, 140)}`,
        ]
          .filter(Boolean)
          .join(' | ')
      );

    const factionLines = allFactions
      .slice(0, MAX_CTX_FACTIONS)
      .map((n) =>
        [
          n.name,
          n.subType && `loại=${n.subType}`,
          n.alignment && `phe=${n.alignment}`,
          n.status && `trạng thái=${n.status}`,
          n.leader && `thủ lĩnh=${n.leader}`,
          n.headquarters && `trụ sở=${n.headquarters}`,
          n.motto && `tôn chỉ=${n.motto}`,
          n.desc && `mô tả=${String(n.desc).slice(0, 140)}`,
        ]
          .filter(Boolean)
          .join(' | ')
      );

    const eventLines = allEvents
      .slice(-MAX_CTX_EVENTS)
      .map((n) =>
        [
          n.name,
          n.chapter && `chương=${n.chapter}`,
          n.time && `thời gian=${n.time}`,
          n.location && `địa điểm=${n.location}`,
          (n.charactersInvolved || n.characters) &&
            `nhân vật=${String(n.charactersInvolved || n.characters).slice(0, 140)}`,
          n.impact && `tác động=${String(n.impact).slice(0, 120)}`,
          n.desc && `mô tả=${String(n.desc).slice(0, 140)}`,
        ]
          .filter(Boolean)
          .join(' | ')
      );

    const chapterLines = eligibleChapters
      .slice(-MAX_CTX_CHAPTERS)
      .map(
        (c) =>
          `- Chương ${c.chapterNumber}: ${c.title || 'Chưa đặt tên'} — ${String(c.desc || '').slice(0, 220)}`
      );

    const linkLines = safeLinks
      .slice(0, MAX_CTX_LINKS)
      .map((l) => {
        const src = nodeNameById.get(String(l.source)) || String(l.source);
        const tgt = nodeNameById.get(String(l.target)) || String(l.target);
        return `${src} --[${l.label || l.category || 'LIÊN_KẾT'}]--> ${tgt}`;
      });

    const boundedChapterText = cleanText;

    const contextPrompt = `Bạn là biên tập viên văn học & chuyên gia kiểm tra tính nhất quán (Continuity Editor) xuất sắc cho tiểu thuyết "${projectTitle}".
Nhiệm vụ của bạn là đọc kỹ VĂN BẢN CHƯƠNG MỚI do tác giả tự viết, đối chiếu chặt chẽ với BẢN ĐỒ THỰC THỂ & LỊCH SỬ CÁC CHƯƠNG TRƯỚC của dự án để thực hiện 3 việc:

1. BẮT LỖI TÍNH NHẤT QUÁN & LOGIC (issues):
Hãy rà soát toàn diện các nhóm lỗi sau (chỉ báo lỗi thực sự có căn cứ từ dữ liệu đồ thị hoặc mâu thuẫn nội tại trong chương, KHÔNG bịa đặt):
- "Nhân vật đã chết": Nhân vật đang có trạng thái "Đã chết" nhưng lại xuất hiện hành động/đối thoại trực tiếp trong hiện tại (trừ khi văn bản nêu rõ là hồi tưởng, linh hồn hoặc sự kiện hồi sinh).
- "Mâu thuẫn địa điểm": Nhân vật đã từng đến địa điểm đó (trong sự kiện trước, nơi sinh, trụ sở hoặc liên kết) nhưng văn bản lại viết là "lần đầu đặt chân đến", "chưa từng nghe qua" hoặc không nhận ra nơi đó.
- "Vật phẩm & Sở hữu": Vật phẩm đang thuộc về nhân vật khác, đã bị phá hủy/thất lạc, hoặc có thuộc tính/nguyên tố khác nhưng nhân vật lại dùng trái ngược không giải thích.
- "Tổ chức & Phe phái": Tổ chức đã "Suy tàn" / "Tạm ngừng" nhưng vẫn hoạt động bình thường; nhân vật thuộc phe "Đối lập" bỗng hành xử như đồng minh không có lý do; nhầm thủ lĩnh/trụ sở.
- "Dòng thời gian": Thứ tự sự kiện, thời gian trôi qua, ngày sinh/độ tuổi mâu thuẫn với các chương trước hoặc mâu thuẫn ngay trong chương.
- "Đặc điểm nhân vật": Sai giới tính, sai vai trò, tính cách/năng lực trái ngược hoàn toàn với hồ sơ đã thiết lập.
- "Mâu thuẫn quan hệ": Cách xưng hô hoặc thái độ thù địch/thân thiết mâu thuẫn với các mối liên kết hiện có trên đồ thị.
- "Bối cảnh & Địa lý": Mô tả khí hậu, địa hình, mức độ nguy hiểm, vùng miền trái ngược với thiết lập của địa điểm.
- "Mâu thuẫn nội tại": Mâu thuẫn tự thân ngay trong văn bản chương (đổi tên nhân vật, buổi sáng đột ngột thành đêm khuya không chuyển cảnh, chi tiết trước đá chi tiết sau).

Phân loại mức độ severity:
- "error": Lỗi logic/nhất quán nghiêm trọng (VD: người đã chết xuất hiện, sai sự thật đã khẳng định).
- "warning": Cảnh báo mâu thuẫn nhẹ hoặc cần giải thích thêm (VD: vật phẩm đổi chủ đột ngột, nhân vật hành xử khác thường).
- "info": Gợi ý làm rõ/bổ sung để mạch truyện chặt chẽ hơn.

2. ĐỀ XUẤT CÁC NODE MỚI CẦN TẠO (suggestedNodes):
- Trích xuất các thực thể MỚI xuất hiện rõ ràng trong chương thuộc 4 loại: "character", "item", "location", "faction" mà CHƯA CÓ trong danh sách thực thể hiện có ở dưới (so khớp không phân biệt hoa/thường).
- KHÔNG tạo lại node đã tồn tại.
- Điền đầy đủ các trường thông tin suy ra được từ văn bản; các trường liên kết (birthplace, weapon, sect, origin, holderOrLocation, ruler, leader, headquarters) CHỈ điền tên cụ thể hoặc chuỗi rỗng "", TUYỆT ĐỐI KHÔNG dùng chữ giữ chỗ như "không rõ", "chưa xác định", "n/a".

3. TRÍCH XUẤT SỰ KIỆN CỦA CHƯƠNG (suggestedEvents) & THAY ĐỔI TRẠNG THÁI (characterStatusChanges):
- Rút ra 1 đến 5 SỰ KIỆN CHÍNH theo đúng trình tự thời gian diễn ra trong chương này để gắn vào Chi tiết chương.
- Mỗi sự kiện phải có: "name", "desc", "location" (tên địa điểm cụ thể hoặc ""), "time" (ví dụ: "Đầu chương", "Đêm khuya"...), "impact", và "charactersInvolved" (mảng tên chính xác các nhân vật tham gia trực tiếp, ưu tiên khớp tên nhân vật đã có trong đồ thị).
- "characterStatusChanges": CHỈ ghi nhận khi diễn biến hiện tại trong chương thực sự làm nhân vật chuyển sang "Đã chết" hoặc "Hồi sinh" (không ghi vì hồi tưởng hay tin đồn).

DỮ LIỆU ĐỒ THỊ HIỆN TẠI CỦA DỰ ÁN:
[Các chương trước]
${chapterLines.join('\n') || '(Chưa có chương nào)'}

[Nhân vật hiện có]
${characterLines.map((l) => `- ${l}`).join('\n') || '(Chưa có)'}

[Địa điểm hiện có]
${locationLines.map((l) => `- ${l}`).join('\n') || '(Chưa có)'}

[Vật phẩm hiện có]
${itemLines.map((l) => `- ${l}`).join('\n') || '(Chưa có)'}

[Tổ chức / Môn phái hiện có]
${factionLines.map((l) => `- ${l}`).join('\n') || '(Chưa có)'}

[Sự kiện đã diễn ra]
${eventLines.map((l) => `- ${l}`).join('\n') || '(Chưa có)'}

[Các mối liên kết hiện có]
${linkLines.map((l) => `- ${l}`).join('\n') || '(Chưa có)'}

BẮT BUỘC trả về JSON thuần túy (không thêm lời giải thích ngoài khối JSON), đúng cấu trúc sau:
\`\`\`json
{
  "summary": "<Tóm tắt 2-3 câu nội dung chính của chương này>",
  "issues": [
    {
      "severity": "error",
      "category": "Nhân vật đã chết",
      "title": "<Tiêu đề ngắn gọn của lỗi>",
      "quote": "<Trích dẫn CHÍNH XÁC nguyên văn câu/đoạn ngắn chứa lỗi từ chương gốc để hệ thống có thể thay thế 1-1>",
      "explanation": "<Giải thích rõ vì sao lỗi khi đối chiếu với đồ thị hiện có>",
      "suggestion": "<Gợi ý hướng xử lý ngắn gọn cho tác giả>",
      "suggestedRewrite": "<Đoạn văn đã được viết lại hoàn chỉnh, tự nhiên theo đúng văn phong chương để thay thế trực tiếp cho phần quote ở trên>",
      "relatedEntities": ["<Tên thực thể liên quan>"]
    }
  ],
  "suggestedNodes": [
    {
      "type": "character",
      "name": "<Tên thực thể mới>",
      "role": "<Vai trò / Độ hiếm / Loại>",
      "desc": "<Mô tả dựa trên chương>",
      "status": "<Còn sống / Nguyên vẹn / Hoạt động / Đang hoạt động>",
      "gender": "",
      "dob": "",
      "birthplace": "",
      "weapon": "",
      "sect": "",
      "personality": "",
      "rarity": "",
      "origin": "",
      "element": "",
      "holderOrLocation": "",
      "region": "",
      "climate": "",
      "terrain": "",
      "dangerLevel": "",
      "ruler": "",
      "subType": "",
      "alignment": "",
      "leader": "",
      "headquarters": "",
      "motto": ""
    }
  ],
  "suggestedEvents": [
    {
      "name": "<Tên sự kiện>",
      "desc": "<Mô tả diễn biến sự kiện>",
      "location": "<Tên địa điểm hoặc chuỗi rỗng>",
      "time": "<Thời điểm diễn ra>",
      "impact": "<Tác động của sự kiện>",
      "charactersInvolved": ["<Tên nhân vật tham gia>"]
    }
  ],
  "characterStatusChanges": [
    {
      "characterName": "<Tên chính xác nhân vật>",
      "status": "Đã chết",
      "statusEvent": "<Tên sự kiện gây ra thay đổi>",
      "reason": "<Lý do ngắn gọn theo văn bản chương>"
    }
  ]
}
\`\`\``;

    const userPrompt = `Hãy kiểm tra tính nhất quán và trích xuất node/sự kiện cho Chương ${resolvedChapterNumber}${chapterTitle ? `: "${chapterTitle}"` : ''} dưới đây:\n\n${boundedChapterText}`;

    const aiRes = await generateAIResponse({
      provider,
      apiKey,
      contextText: contextPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    let parsed = null;
    try {
      const fenced = aiRes.text.match(/```json\s*([\s\S]*?)```/i);
      const rawJson = fenced ? fenced[1] : (aiRes.text.match(/\{[\s\S]*\}/) || [])[0];
      if (rawJson) {
        parsed = JSON.parse(rawJson);
      }
    } catch (parseErr) {
      console.warn('[AI Controller] Lỗi parse JSON analyzeChapterText:', parseErr.message);
    }

    const isValidAnalysisEnvelope =
      parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Array.isArray(parsed.issues) &&
      Array.isArray(parsed.suggestedNodes) &&
      Array.isArray(parsed.suggestedEvents);

    if (!isValidAnalysisEnvelope) {
      return res.status(502).json({
        success: false,
        message: 'AI trả về định dạng phân tích không đầy đủ hoặc không hợp lệ. Vui lòng thử lại.',
      });
    }

    const cleanField = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val).trim();
      return PLACEHOLDER_VALUE_PATTERN.test(str) ? '' : str;
    };

    const existingNodeKeys = new Set(
      safeNodes
        .filter((n) => n.type && n.name)
        .map((n) => `${String(n.type).toLowerCase()}::${String(n.name).trim().toLocaleLowerCase('vi')}`)
    );

    const issues = (Array.isArray(parsed.issues) ? parsed.issues : [])
      .filter((item) => item && typeof item === 'object' && (item.title || item.explanation))
      .map((item, idx) => ({
        id: `issue-${Date.now()}-${idx}`,
        severity:
          item.severity === 'error' || item.severity === 'warning' || item.severity === 'info'
            ? item.severity
            : 'warning',
        category: String(item.category || 'Tính nhất quán').trim(),
        title: String(item.title || 'Phát hiện điểm chưa nhất quán').trim(),
        quote: String(item.quote || '').trim(),
        explanation: String(item.explanation || '').trim(),
        suggestion: String(item.suggestion || '').trim(),
        suggestedRewrite: String(item.suggestedRewrite || '').trim(),
        relatedEntities: Array.isArray(item.relatedEntities)
          ? item.relatedEntities.map((e) => String(e).trim()).filter(Boolean)
          : [],
      }));

    const seenSuggestedKeys = new Set();
    const validEntityTypes = new Set(['character', 'item', 'location', 'faction']);
    const suggestedNodes = (Array.isArray(parsed.suggestedNodes) ? parsed.suggestedNodes : [])
      .filter((n) => n && typeof n === 'object' && validEntityTypes.has(String(n.type || '').toLowerCase()))
      .map((n) => {
        const type = String(n.type).toLowerCase();
        const name = String(n.name || '').trim();
        return {
          type,
          name,
          role: cleanField(n.role),
          desc: cleanField(n.desc),
          status:
            cleanField(n.status) ||
            (type === 'character'
              ? 'Còn sống'
              : type === 'item'
                ? 'Nguyên vẹn'
                : type === 'faction'
                  ? 'Đang hoạt động'
                  : 'Hoạt động'),
          gender: cleanField(n.gender),
          dob: cleanField(n.dob),
          birthplace: cleanField(n.birthplace),
          weapon: cleanField(n.weapon),
          sect: cleanField(n.sect),
          personality: cleanField(n.personality),
          rarity: cleanField(n.rarity),
          origin: cleanField(n.origin),
          element: cleanField(n.element),
          holderOrLocation: cleanField(n.holderOrLocation),
          region: cleanField(n.region),
          climate: cleanField(n.climate),
          terrain: cleanField(n.terrain),
          dangerLevel: cleanField(n.dangerLevel),
          ruler: cleanField(n.ruler),
          subType: cleanField(n.subType),
          alignment: cleanField(n.alignment),
          leader: cleanField(n.leader),
          headquarters: cleanField(n.headquarters),
          motto: cleanField(n.motto),
        };
      })
      .filter((n) => {
        if (!n.name) return false;
        const key = `${n.type}::${n.name.toLocaleLowerCase('vi')}`;
        if (existingNodeKeys.has(key) || seenSuggestedKeys.has(key)) return false;
        seenSuggestedKeys.add(key);
        return true;
      });

    const allKnownCharacters = [
      ...safeNodes.filter((n) => n.type === 'character' && n.name),
      ...suggestedNodes.filter((n) => n.type === 'character'),
    ];
    const rawSuggestedEvents = (
      Array.isArray(parsed.suggestedEvents) ? parsed.suggestedEvents : []
    )
      .filter((ev) => ev && typeof ev === 'object' && String(ev.name || '').trim())
      .map((ev) => ({
        name: String(ev.name).trim(),
        desc: cleanField(ev.desc),
        location: cleanField(ev.location),
        time: cleanField(ev.time),
        impact: cleanField(ev.impact),
        charactersInvolved: Array.isArray(ev.charactersInvolved)
          ? ev.charactersInvolved.map((c) => String(c).trim()).filter(Boolean)
          : typeof ev.charactersInvolved === 'string'
            ? ev.charactersInvolved
            : [],
      }));

    // Chỉ chuẩn hóa nhân vật được liệt kê tường minh, không tự thêm từ mô tả sự kiện
    const normalizedEvents = normalizeEventCharacters(rawSuggestedEvents, allKnownCharacters, {
      includeDescriptionMatches: false,
    }).map((ev) => ({
      name: ev.name,
      desc: ev.desc || '',
      location: ev.location || '',
      time: ev.time || '',
      impact: ev.impact || '',
      charactersInvolved: Array.isArray(ev.charactersInvolved) ? ev.charactersInvolved : [],
    }));

    const characterStatusChanges = (
      Array.isArray(parsed.characterStatusChanges) ? parsed.characterStatusChanges : []
    )
      .filter(
        (sc) =>
          sc &&
          typeof sc === 'object' &&
          String(sc.characterName || '').trim() &&
          (sc.status === 'Đã chết' || sc.status === 'Hồi sinh')
      )
      .map((sc) => ({
        characterName: String(sc.characterName).trim(),
        status: sc.status,
        statusEvent: cleanField(sc.statusEvent),
        reason: cleanField(sc.reason),
      }));

    return res.status(200).json({
      success: true,
      data: {
        chapterNumber: resolvedChapterNumber,
        summary: String(parsed.summary || '').trim(),
        issues,
        suggestedNodes,
        suggestedEvents: normalizedEvents,
        characterStatusChanges,
        contextOmissions,
        model: aiRes.model,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  analyzeChapterText,
  chatWithAI,
  clearChatHistory,
  extractCreateNodeResponse,
  generateChapterAndEvents,
  generateChapterStory,
  getChatHistory,
  normalizeEventCharacters,
  saveChatHistory,
};
