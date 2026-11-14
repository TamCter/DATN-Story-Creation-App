const { GoogleGenAI } = require('@google/genai');

const AIMLAPI_URL = 'https://api.aimlapi.com/v1/chat/completions';
const AI_PROVIDER_TIMEOUT_MS = 150000;
const MAX_NODE_GENERATION_ATTEMPTS = 3;
const MAX_CHAT_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 4000;
const NODE_TYPES = ['character', 'item', 'location', 'faction', 'event'];
const REQUIRED_NODE_FIELDS = {
  character: ['name', 'type', 'role', 'desc', 'gender', 'dob', 'birthplace', 'weapon', 'sect', 'personality', 'status'],
  item: ['name', 'type', 'desc', 'rarity', 'origin', 'element', 'holderOrLocation'],
  location: ['name', 'type', 'desc', 'region', 'climate', 'terrain', 'dangerLevel', 'ruler'],
  faction: ['name', 'type', 'desc', 'subType', 'alignment', 'status', 'leader', 'headquarters', 'motto'],
  event: ['name', 'type', 'desc', 'chapter', 'time', 'location', 'status', 'impact'],
};

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
  const nodeTopicPattern = /(?<![\p{L}\p{N}])(?:node|nodes|thực thể|nhân vật|vật phẩm|địa điểm|phe phái|sự kiện|character|item|location|faction|event)(?![\p{L}\p{N}])/iu;
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

  const countPattern = /(?<![\p{L}\p{N}])(?:\d+|một|hai|ba)\s*(?:node|nodes|thực thể|nhân vật|vật phẩm|địa điểm|phe phái|sự kiện)(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])(?:node|nodes|thực thể)\s*(?:x|:)?\s*(\d+|một|hai|ba)(?![\p{L}\p{N}])/iu;
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

    const rawCharacters = Array.isArray(event.charactersInvolved)
      ? event.charactersInvolved
      : typeof event.charactersInvolved === 'string'
        ? event.charactersInvolved.split(/[,;\n]+/)
        : [];
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
              `Tạo đủ ít nhất ${requestedCount} node theo yêu cầu ban đầu; điền mọi trường bắt buộc bằng giá trị cụ thể, ` +
              'không để trống hoặc ghi "không rõ". Trả lời bằng một JSON hợp lệ duy nhất với action "create_node" ' +
              'cho một node hoặc "create_nodes" cho nhiều node, tối đa 3 node.',
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
      projectTitle = 'Vị diện kỳ ảo',
      userIdea = '',
      chapters = [],
      nodes = [],
      writingStyle = 'Kiếm hiệp / Tiên hiệp / Huyền huyễn',
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

    // Tổng hợp các node nhân vật, địa điểm, môn phái, vật phẩm hiện có
    const characterNodes = nodes.filter(
      (node) => node && node.type === 'character' && typeof node.name === 'string'
    );
    const characters = characterNodes
      .slice(0, 30)
      .map((node) =>
        [
          node.name,
          node.role && `vai trò: ${node.role}`,
          node.sect && `môn phái: ${node.sect}`,
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
- Môn phái / Phe phái: ${factions.join(', ') || 'Chưa có'}
- Bảo vật / Thần binh: ${items.join(', ') || 'Chưa có'}

Nhiệm vụ của bạn:
1. Tạo thông tin cho CHƯƠNG TIẾP THEO (Chương ${nextChapterNumber}).
2. Tạo 2 đến 4 SỰ KIỆN CHÍNH (events) diễn ra theo trình tự thời gian trong chương này. Sự kiện cần gắn kết chặt chẽ với các nhân vật và địa điểm hiện có (hoặc giới thiệu mới nếu phù hợp với mạch truyện).

QUY TẮC NHÂN VẬT TRONG TỪNG SỰ KIỆN (BẮT BUỘC):
- Mỗi sự kiện phải có trường "charactersInvolved" là một mảng tên nhân vật, không được bỏ trống trường hoặc trả về null.
- Ghi đủ tất cả nhân vật có hành động, đối thoại, xuất hiện hoặc liên quan trực tiếp đến diễn biến sự kiện.
- Ưu tiên nhân vật đã có trong danh sách ở trên và dùng chính xác tên của họ; đối chiếu vai trò/mô tả để chọn đúng người, không gán nhân vật không liên quan.
- Nếu tên nhân vật hiện có xuất hiện trong tên hoặc mô tả sự kiện, bắt buộc đưa nhân vật đó vào "charactersInvolved".
- Chỉ dùng mảng rỗng khi sự kiện thực sự không có nhân vật liên quan; nếu truyện đã có nhân vật thì mỗi sự kiện chính thông thường phải có ít nhất một nhân vật.
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

    if (!parsedData || !parsedData.chapter || !Array.isArray(parsedData.events)) {
      return res.status(500).json({
        success: false,
        message: 'AI không tạo được cấu trúc chương và sự kiện hợp lệ. Vui lòng thử lại.',
        raw: aiRes.text,
      });
    }

    const events = normalizeEventCharacters(parsedData.events, characterNodes);

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
      projectTitle = 'Vị diện kỳ ảo',
      chapter = {},
      events = [],
      relatedNodes = [],
      writingStyle = 'Tiểu thuyết Kiếm Hiệp / Tiên Hiệp hào sảng, kịch tính, giàu chất thơ',
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
        return detail;
      })
      .join('\n\n');

    // Liệt kê chi tiết các thực thể liên quan (nhân vật, võ công, vũ khí, tông môn, địa điểm)
    const nodesDetail = relatedNodes
      .map((n) => {
        let detail = `- [${(n.type || 'thực thể').toUpperCase()}] ${n.name}: ${n.desc || ''}`;
        if (n.role) detail += ` | Vai trò: ${n.role}`;
        if (n.sect) detail += ` | Môn phái: ${n.sect}`;
        if (n.weapon) detail += ` | Binh khí: ${n.weapon}`;
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

CÁC THỰC THỂ (NHÂN VẬT, ĐỊA ĐIỂM, PHÁI, VẬT PHẨM) XUẤT HIỆN TRONG CHƯƠNG:
${nodesDetail || 'Nhân vật theo sự kiện.'}

${customPrompt ? `Yêu cầu thêm từ tác giả: "${customPrompt}"` : ''}

YÊU CẦU NGHỆ THUẬT KHI VIẾT CÂU CHUYỆN:
1. Viết một chương truyện HOÀN CHỈNH, liền mạch, cuốn hút (độ dài khoảng 1200 - 2500 từ).
2. Khắc họa sống động tâm lý nhân vật, lời thoại sắc sảo, tự nhiên, mang khẩu khí giang hồ / tu tiên.
3. Miêu tả cảnh quan, không khí, các chiêu thức võ công hoặc pháp bảo một cách hoa mỹ, kịch tính.
4. Lồng ghép khéo léo và tự nhiên TOÀN BỘ các sự kiện đã nêu ở trên theo đúng trình tự thời gian.
5. Đoạn kết chương đọng lại dư âm hoặc nút thắt bất ngờ để độc giả hồi hộp đón đọc chương sau.
6. Trình bày văn bản rõ ràng, chia đoạn hợp lý. KHÔNG chèn lời mở đầu hay kết thúc của AI (ví dụ: "Dưới đây là...", "Hy vọng bạn thích..."), CHỈ trả về đúng nội dung câu chuyện của chương.`;

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

module.exports = {
  chatWithAI,
  extractCreateNodeResponse,
  generateChapterAndEvents,
  generateChapterStory,
  normalizeEventCharacters,
};
