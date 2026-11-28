const { GoogleGenAI } = require('@google/genai');
const { runQuery } = require('../config/neo4j');

const AIMLAPI_URL = 'https://api.aimlapi.com/v1/chat/completions';
const AI_PROVIDER_TIMEOUT_MS = 150000;
const MAX_NODE_GENERATION_ATTEMPTS = 3;
const MAX_NODES_PER_CHAT_TURN = 3;
const MAX_CHAT_MESSAGES = 40;
const MAX_STORED_CHAT_MESSAGES = 100;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_DRAFT_MESSAGE_LENGTH = 20000;
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
  'members',
  'seniorMembers',
  'subFactions',
  'headquarters',
  'location',
  'chapter',
  'charactersInvolved',
  'characters',
  'itemsInvolved',
  'factionsInvolved',
  'cause',
];
const PLACEHOLDER_VALUE_PATTERN = /^(unknown|not known|n\/a|none|null|undefined|không rõ|chưa rõ|không xác định|chưa xác định|không có|trống)$/i;

const {
  parseDateParts,
  formatDateDDMMYYYY,
  getTodayDDMMYYYY,
  addDaysDDMMYYYY,
  calculateAgeFromDob,
} = require('../utils/dateUtils');

const WEB_WRITING_SYSTEM_PROMPT = `Bạn là biên tập viên văn học và trợ lý đồng sáng tác truyện tiếng Việt, đồng hành trực tiếp cùng tác giả trong lúc viết tay.

NHIỆM VỤ CHÍNH:
1. Viết tiếp & mở rộng cảnh: Khi tác giả nhờ viết tiếp, hãy bắt đúng ngôi kể, thì, nhịp điệu, giọng văn và không khí cảm xúc của đoạn bản thảo hiện tại. Ưu tiên miêu tả sống động qua hành động, giác quan và nội tâm ("tả thay vì kể"), tránh sáo rỗng hoặc tóm tắt khô khan.
2. Biên tập & chau chuốt văn phong: Khi tác giả nhờ sửa hoặc viết lại câu/đoạn, giữ nguyên ý đồ và chi tiết cốt lõi nhưng làm câu văn mượt mà, giàu hình ảnh, tiết tấu tự nhiên hơn.
3. Đối thoại & tâm lý nhân vật: Xây dựng lời thoại có cá tính riêng, phản ánh đúng tính cách, vai trò, mối quan hệ và tình trạng hiện tại của nhân vật trong hồ sơ thế giới truyện.
4. Gỡ bí & phát triển cốt truyện: Khi tác giả hỏi ý tưởng, hãy đề xuất 2-3 hướng đi cụ thể, giàu xung đột và hợp logic (tình tiết mới, bước ngoặt, cách chuyển cảnh, gieo chi tiết ẩn) bám sát thế giới và mạch chương đang viết.
5. Giữ tính nhất quán thế giới truyện: Luôn đối chiếu hồ sơ nhân vật, tổ chức, địa điểm, vật phẩm và sự kiện đã có của dự án. Không tự ý viết sai trạng thái nhân vật (VD: nhân vật đã chết), sai vai trò/phe phái hay sai chi tiết đã thiết lập.

QUY TẮC TRÌNH BÀY:
- Trả lời bằng tiếng Việt tự nhiên, văn bản thuần (KHÔNG dùng ký tự markdown như **in đậm**, *in nghiêng*, ### tiêu đề, dấu backtick hay khung code).
- Nếu tác giả yêu cầu viết tiếp hoặc viết lại một đoạn truyện, hãy trả thẳng đoạn văn hoàn chỉnh để tác giả có thể chèn ngay vào bản thảo, không rào đón mở đầu hay bình luận thừa ở cuối.
- TUYỆT ĐỐI KHÔNG xuất JSON, KHÔNG tạo cấu trúc create_node/create_link, và KHÔNG nhắc đến thuật ngữ kỹ thuật như node, đồ thị hay cơ sở dữ liệu.
- Tôn trọng quyền làm chủ sáng tác của tác giả: hỗ trợ đúng trọng tâm yêu cầu, không tự ý viết lan man sang kết cục của cả chương nếu tác giả không yêu cầu.`;

const WEB_OUTLINE_STORY_PROMPT = `Bạn là kiến trúc sư cốt truyện (Story Architect) chuyên xây dựng dàn ý tổng thể và hệ thống logic cho tiểu thuyết tiếng Việt.

NHIỆM VỤ:
Dựa trên ý tưởng của tác giả, tên dự án và hồ sơ thế giới hiện có (nếu có), hãy xây dựng hoặc hoàn thiện 5 phần khung cốt lõi của toàn bộ câu chuyện:
1. worldSetting: Bối cảnh thế giới (thời đại, không gian, quy luật xã hội/phép thuật/công nghệ, bầu không khí chủ đạo).
2. writingStyle: Văn phong & giọng kể (ngôi kể, thì, nhịp điệu, sắc thái cảm xúc, đặc trưng ngôn từ).
3. storyFramework: Khung cốt truyện chính (cấu trúc 3 hồi hoặc các chặng lớn: mở đầu, xung đột trung tâm, leo thang, cao trào, hướng kết cục).
4. storyLogic: Hệ thống logic & quy tắc bất biến (nguyên nhân - kết quả, giới hạn sức mạnh/quyền lực, mốc thời gian cốt lõi không được mâu thuẫn).
5. characterOverview: Tổng quan tuyến nhân vật chính (nhân vật trung tâm, đối trọng, động cơ cốt lõi và cung phát triển tâm lý).

QUY TẮC ĐẦU RA (BẮT BUỘC):
- CHỈ trả về duy nhất một đối tượng JSON hợp lệ, KHÔNG bọc trong \`\`\`json, KHÔNG thêm lời giải thích ngoài JSON.
- Đúng 5 khóa chuỗi: "worldSetting", "writingStyle", "storyFramework", "storyLogic", "characterOverview".
- Viết bằng tiếng Việt tự nhiên, súc tích, rõ ý, giàu tính gợi mở cho tác giả phát triển thành nhiều chương.`;

const WEB_OUTLINE_CHAPTER_PROMPT = `Bạn là biên kịch và trợ lý lập dàn ý chi tiết theo từng cảnh (Scene Outliner) cho tiểu thuyết tiếng Việt.

NHIỆM VỤ:
Dựa trên Dàn ý tổng thể của truyện, danh sách chương hiện có, hồ sơ thế giới và yêu cầu cụ thể của tác giả cho chương này, hãy lập khung dàn ý chương và chia thành các cảnh (scenes) mạch lạc theo trình tự kể chuyện (mở cảnh → phát triển xung đột → cao trào/điểm nhấn → chuyển/kết chương).

QUY TẮC ĐẦU RA (BẮT BUỘC):
- CHỈ trả về duy nhất một đối tượng JSON hợp lệ, KHÔNG bọc trong \`\`\`json, KHÔNG thêm lời dẫn hay bình luận ngoài JSON.
- Cấu trúc JSON chính xác:
{
  "title": "Tên chương gợi ý (ngắn gọn, giàu gợi hình)",
  "setting": "Bối cảnh chương (thời điểm, địa điểm, không khí)",
  "style": "Văn phong và nhịp điệu riêng của chương này",
  "characters": "Các nhân vật xuất hiện cùng vai trò/tâm trạng ngắn gọn",
  "logicNotes": "Mục tiêu chương, chi tiết gieo mầm (foreshadowing) và móc nối sang chương sau",
  "scenes": [
    { "title": "Cảnh 1: <Tiêu đề ngắn>", "summary": "Diễn biến chi tiết, hành động, đối thoại trọng tâm và kết quả của cảnh 1" },
    { "title": "Cảnh 2: <Tiêu đề ngắn>", "summary": "Diễn biến chi tiết của cảnh 2" }
  ]
}
- Tạo từ 3 đến 5 cảnh rõ ràng, logic, bám sát hồ sơ thế giới đã có (không làm sai trạng thái nhân vật hay quy tắc thế giới).`;

const WEB_DRAFT_WRITE_PROMPT = `Bạn là tiểu thuyết gia tiếng Việt chuyên chuyển thể dàn ý và danh sách từng cảnh thành bản nháp văn xuôi hoàn chỉnh (Version 1).

NHIỆM VỤ:
- Bám sát 100% Dàn ý tổng thể, Dàn ý chương và trình tự từng cảnh (scenes) mà tác giả đã lập.
- Chuyển cảnh mượt mà, giữ đúng ngôi kể, văn phong chủ đạo, bối cảnh, tính cách nhân vật và các móc nối logic.
- Ưu tiên kỹ thuật "tả thay vì kể" (show, don't tell): miêu tả hành động, ánh mắt, không gian, giác quan và lời thoại có cá tính thay vì tóm tắt khô cứng.
- Không làm sai lệch bất kỳ thông tin nào trong hồ sơ thế giới truyện (trạng thái sống/chết, phe phái, địa điểm, vật phẩm).

QUY TẮC TRÌNH BÀY:
- CHỈ trả thẳng nội dung văn xuôi hoàn chỉnh của chương truyện (văn bản thuần tiếng Việt).
- TUYỆT ĐỐI KHÔNG thêm tiêu đề markdown (###, **), KHÔNG viết lời mở đầu/kết thúc như "Dưới đây là bản nháp...", và KHÔNG xuất JSON.`;

const WEB_DRAFT_REWRITE_PROMPT = `Bạn là biên tập viên văn học cao cấp chuyên sửa và viết lại bản nháp chương truyện thành phiên bản nâng cấp (Version 2, 3...) theo góp ý cụ thể của tác giả.

NHIỆM VỤ:
- Đọc kỹ Bản nháp hiện tại, Dàn ý chương và Góp ý chỉnh sửa từ tác giả.
- Tập trung viết lại sâu, tự nhiên và thuyết phục đúng những đoạn/yếu tố tác giả chưa hài lòng.
- Giữ nguyên tinh thần, chi tiết quan trọng và những đoạn tác giả không yêu cầu đổi, đảm bảo sự liền mạch về nhịp văn, giọng kể và logic giữa phần giữ lại và phần viết mới.
- Không phá vỡ tính nhất quán của hồ sơ thế giới và dàn ý chương.

QUY TẮC TRÌNH BÀY:
- CHỈ trả thẳng toàn văn bản thảo phiên bản mới hoàn chỉnh (văn bản thuần tiếng Việt) để tác giả đọc và lưu ngay.
- TUYỆT ĐỐI KHÔNG dùng ký tự markdown (###, **, *), KHÔNG liệt kê giải thích "Tôi đã sửa những chỗ sau...", và KHÔNG xuất JSON.`;

const WEB_MODES_MAP = {
  web_writing: WEB_WRITING_SYSTEM_PROMPT,
  web_outline_story: WEB_OUTLINE_STORY_PROMPT,
  web_outline_chapter: WEB_OUTLINE_CHAPTER_PROMPT,
  web_draft_write: WEB_DRAFT_WRITE_PROMPT,
  web_draft_rewrite: WEB_DRAFT_REWRITE_PROMPT,
};

const SYSTEM_PROMPT = `Bạn là trợ lý AI hỗ trợ phát triển câu chuyện và xây dựng hồ sơ nhân vật, bối cảnh, tổ chức, vật phẩm và sự kiện.
Nhiệm vụ của bạn là giúp người dùng tạo các thực thể (node) trong đồ thị câu chuyện.

Có 5 loại node:
1. character (Nhân vật): name, type="character", role (NHÂN VẬT CHÍNH/ĐỐI LẬP/TRUNG LẬP), desc, gender (Nam/Nữ/Khác), dob (Ngày/Tháng/Năm sinh định dạng DD/MM/YYYY, VD: 15/08/1998), age (số tuổi), birthplace, weapon, sect, personality, status (Còn sống/Đã chết/Hồi sinh), statusEvent
2. item (Vật phẩm): name, type="item", desc, rarity (Phổ thông/Hiếm/Quý hiếm/Rất hiếm/Độc bản/Đặc biệt), origin, element, holderOrLocation
3. location (Địa điểm): name, type="location", desc, region, climate, terrain, dangerLevel (An toàn/Bình thường/Nguy hiểm/Khu vực hạn chế), ruler
4. faction (Tổ chức / Nhóm): name, type="faction", desc, subType (Đồng minh/Đối lập/Trung lập), alignment (ĐỒNG MINH/ĐỐI LẬP/TRUNG LẬP), status (Đang hoạt động/Tạm ngừng), leader, seniorMembers (danh sách tên thành viên cấp cao phân tách bằng dấu phẩy), members (danh sách tên thành viên phân tách bằng dấu phẩy), subFactions (danh sách tên các tổ chức trực thuộc / dưới trướng phân tách bằng dấu phẩy), headquarters, motto, statusEvent
5. event (Sự kiện): name, type="event", desc, chapter, time (Ngày/Tháng/Năm định dạng DD/MM/YYYY, VD: 15/08/2024), location, status (Đã diễn ra/Đang diễn ra/Chưa diễn ra), eventType (Chiến đấu/Đối thoại / Đàm phán/Tiết lộ bí mật/Du hành/Biến cố / Hy sinh/Giao dịch / Vật phẩm/Hồi tưởng/Khác), importance (Nút thắt chính/Bước ngoặt/Gieo mầm/Sự kiện phụ), arcName, sequenceOrder, cause, conflict, outcome, consequences, impact, charactersInvolved, characterRoles, itemsInvolved, factionsInvolved

QUY TẮC THỜI GIAN, TUỔI & NĂM SINH (BẮT BUỘC):
- TẤT CẢ ngày tháng năm (dob của nhân vật, time của sự kiện) BẮT BUỘC dùng định dạng DD/MM/YYYY (VD: 25/11/2026).
- Khi tạo nhân vật: nếu người dùng cung cấp năm sinh/ngày sinh (dob) mà không nêu tuổi (age), hãy tính tuổi theo năm hiện tại (hoặc để trống để hệ thống tự tính).
- BẮT LỖI TUỔI & NĂM: Nếu người dùng nhập cả năm sinh và tuổi nhưng không khớp nhau theo năm hiện tại (hoặc mốc năm của truyện), hoặc nhập ngày/năm sự kiện mâu thuẫn với năm sinh nhân vật tham gia (chưa ra đời) hay mâu thuẫn với niên biểu sự kiện đã có, hãy CHỈ RÕ MÂU THUẪN và gợi ý chỉnh lại trong lời trả lời!

QUY TẮC THỐNG NHẤT TẠO QUAN HỆ ĐỒ THỊ & GIỚI HẠN CHỨC NĂNG CỦA ỨNG DỤNG (BẮT BUỘC):
AI CHỈ ĐƯỢC PHÉP thực hiện đúng các chức năng và quan hệ có thật trên giao diện ứng dụng — TUYỆT ĐỐI KHÔNG tự bịa tính năng, trường dữ liệu, hoặc kiểu liên kết không tồn tại trên app (ví dụ: không hứa tự sửa/xóa trực tiếp node cũ trong DB, không gắn 2 trụ sở cho cùng 1 tổ chức, không nối trực tiếp Sự kiện với Vật phẩm/Tổ chức tách rời khỏi nhân vật tham gia).
Hệ thống tự động sinh cạnh quan hệ trên đồ thị Neo4j theo đúng quy tắc số lượng (1-1 vs 1-N) của ứng dụng:
- Nhân vật (character):
  + Nơi sinh (character.birthplace -> BIRTHPLACE): tối đa 1 địa điểm.
  + Vật phẩm sở hữu (character.weapon -> EQUIPPED): có thể nhiều vật phẩm (phân tách bằng dấu phẩy).
  + Tổ chức & vai trò của nhân vật: được quản lý từ phía node Tổ chức (leader, seniorMembers, members), KHÔNG gán tổ chức tùy tiện từ phía nhân vật; để character.sect = "" nếu đã gán từ node Tổ chức.
  + Biến cố trạng thái (character.statusEvent -> STATUS_EVENT): tối đa 1 sự kiện và CHỈ điền khi status là "Đã chết" hoặc "Hồi sinh".
- Vật phẩm (item):
  + Người nắm giữ (item.holderOrLocation -> OWNS): tối đa 1 nhân vật.
  + Nguồn gốc (item.origin -> ORIGIN): tối đa 1 địa điểm.
- Địa điểm (location):
  + Thế lực cai quản (location.ruler -> RULER_OF): tối đa 1 tổ chức. LƯU Ý QUAN TRỌNG: nếu một tổ chức trong danh sách đã có sẵn trụ sở/địa điểm gắn với nó, KHÔNG tự ý tạo thêm địa điểm mới rồi nối làm trụ sở thứ 2 hay gán trùng địa điểm cho tổ chức đó, trừ khi người dùng nêu rõ muốn tạo địa điểm khác thuộc phạm vi quản lý.
- Tổ chức (faction):
  + Thủ lĩnh (faction.leader -> LEADER_OF): tối đa 1 nhân vật (nếu tổ chức đã có thủ lĩnh thì không tạo/gán thêm thủ lĩnh thứ 2).
  + Trụ sở (faction.headquarters -> HEADQUARTERS): tối đa 1 địa điểm (nếu tổ chức đã có trụ sở thì KHÔNG tạo địa điểm mới làm trụ sở thứ 2 hay nối thêm cạnh trụ sở).
  + Thành viên cấp cao (faction.seniorMembers -> SENIOR_MEMBER_OF), Thành viên (faction.members -> MEMBER_OF), Tổ chức trực thuộc (faction.subFactions -> SUB_FACTION_OF, chiều liên kết từ tổ chức con làm source tới tổ chức cha làm target với nhãn "Trực thuộc"): có thể nhiều thực thể (phân tách bằng dấu phẩy). Khi tạo tổ chức hoặc nối quan hệ giữa các tổ chức có sẵn, dùng SUB_FACTION_OF (source = tổ chức con, target = tổ chức cha).
  + Biến cố trạng thái (faction.statusEvent -> STATUS_EVENT): tối đa 1 sự kiện và CHỈ điền khi status là "Tạm ngừng" hoặc "Suy tàn".
- Sự kiện (event):
  + Địa điểm diễn ra (event.location -> EVENT_LOCATION): tối đa 1 địa điểm.
  + Nguyên nhân (event.cause -> CAUSED_BY): tối đa 1 sự kiện trước đó.
  + Nhân vật tham gia (event.charactersInvolved -> PARTICIPATED_IN): có thể nhiều nhân vật.
  + Vật phẩm & Tổ chức trong sự kiện (NỐI QUA NHÂN VẬT THAM GIA): KHÔNG nối trực tiếp tách rời từ Sự kiện sang Vật phẩm/Tổ chức; đồ thị sẽ tự hiển thị chuỗi Vật phẩm <--Sở hữu-- Nhân vật --Tham gia--> Sự kiện và Tổ chức <--Tổ chức/Lãnh đạo-- Nhân vật --Tham gia--> Sự kiện.
    * Trong event.itemsInvolved, CHỈ điền chính xác tên những vật phẩm mà nhân vật tham gia thực sự mang theo / sử dụng trong sự kiện đó.
    * Trong event.factionsInvolved, CHỈ điền chính xác tên những tổ chức mà nhân vật tham gia đại diện / liên quan trong sự kiện đó.

Nguyên tắc điền trường liên kết (RẤT QUAN TRỌNG ĐỂ KHÔNG SINH THÊM NODE ẨN):
- Chỉ được phép điền tên node ĐÃ CÓ SẴN trong danh sách thực thể hiện tại của dự án, HOẶC tên một node nằm TRONG CHÍNH DANH SÁCH "nodes" mà bạn đang tạo ở lượt trả lời này.
- TUYỆT ĐỐI KHÔNG tự bịa tên thực thể ngoài danh sách vào các trường liên kết (birthplace, weapon, sect, origin, holderOrLocation, ruler, leader, headquarters, location, charactersInvolved, itemsInvolved, factionsInvolved, statusEvent), vì làm vậy sẽ khiến hệ thống tự sinh thêm node thừa ngoài danh sách. Nếu thực thể liên quan chưa có và bạn không tạo nó trong mảng "nodes", hãy để chuỗi rỗng "".
- TUYỆT ĐỐI KHÔNG điền các chữ giữ chỗ như "không rõ", "chưa rõ", "không xác định", "không có", "trống", "n/a".
- TUYỆT ĐỐI KHÔNG tạo 2 node trùng nhau (cùng type và cùng name) trong cùng một câu trả lời, và KHÔNG tạo lại node đã có sẵn trong danh sách thực thể hiện có của dự án.

PHẠM VI TẠO NODE & GỢI Ý THEO ĐÚNG LOẠI NODE CHÍNH (BẮT BUỘC):
Khi người dùng yêu cầu tạo 1 thực thể chính, bạn CHỈ được phép tạo kèm (trong giới hạn tối đa 3 node) và gợi ý prompt tiếp theo xoay quanh ĐÚNG các thực thể có quan hệ trực tiếp với loại node đó, tuyệt đối không lan man sang thực thể không liên quan:
- Nếu tạo Nhân vật (character): chỉ xoay quanh Nơi sinh (location), Hội / Tổ chức (faction), và N vật phẩm mang theo / sở hữu (item) (cùng sự kiện trạng thái nếu nhân vật đã chết/hồi sinh).
  + Cách chia lượt chuẩn khi tạo Nhân vật: lượt 1 tạo tối đa 3 node gồm Nhân vật + Nơi sinh (location) + Hội/Tổ chức (faction); trong lời giới thiệu hãy mô tả rõ các vật phẩm nhân vật đó sở hữu (nếu có), và đặt dòng gợi ý prompt tiếp theo để người dùng tạo tiếp các vật phẩm đó gắn với nhân vật vừa tạo (VD: 💡 Gợi ý prompt tiếp theo: "Tạo 2 vật phẩm thuộc sở hữu của <Tên nhân vật>: <Tên vật phẩm 1> và <Tên vật phẩm 2>").
  + Lưu ý: trường character.weapon chỉ điền nếu vật phẩm đó ĐÃ CÓ trong đồ thị hoặc nằm trong 3 node của lượt này; nếu vật phẩm sẽ tạo ở lượt sau thì để character.weapon = "" ở lượt 1, và ở lượt sau khi tạo vật phẩm sẽ điền item.holderOrLocation = "<Tên nhân vật>" để tự nối quan hệ Sở hữu (OWNS).
- Nếu tạo Vật phẩm (item): chỉ xoay quanh Người sở hữu (character) và Địa điểm nguồn gốc (location).
- Nếu tạo Địa điểm (location): chỉ xoay quanh Thế lực / Tổ chức cai quản (faction).
- Nếu tạo Tổ chức / Hội (faction): chỉ xoay quanh Thủ lĩnh / Người đại diện (character) và Trụ sở / Căn cứ (location).
- Nếu tạo Sự kiện (event): chỉ xoay quanh Địa điểm diễn ra (location), Nhân vật tham gia (character), Vật phẩm liên quan (item), Tổ chức liên quan (faction) hoặc Sự kiện nguyên nhân trước đó (event). Nếu sự kiện có nhiều hơn 3 thực thể liên quan chưa có, tạo 3 node quan trọng nhất trước rồi gợi ý prompt tạo tiếp các thực thể còn thiếu ở lượt sau.

Khi người dùng mô tả một thực thể hoặc hỏi về việc tạo node, hãy:
- Chat thân thiện, ngắn gọn, đi thẳng vào nội dung; viết VĂN BẢN THUẦN (plain text), TUYỆT ĐỐI KHÔNG dùng ký tự markdown như **in đậm**, *in nghiêng*, ### tiêu đề, hay dấu backtick.
- KHÔNG viết các câu dẫn kỹ thuật thừa như "Dưới đây là các node mình tạo:", "Dưới đây là JSON:", "Đây là dữ liệu node:".
- Mỗi lượt trả lời chỉ tạo TỐI ĐA 3 node trong cùng một JSON (nếu người dùng yêu cầu hơn 3 node, hãy tạo 3 node quan trọng nhất trước).
- GỢI Ý PROMPT KHI CÒN THIẾU NODE: Nếu người dùng yêu cầu nhiều hơn 3 node, HOẶC còn thiếu thực thể liên quan trực tiếp đúng theo PHẠM VI ở trên (VD: nhân vật đã tạo cùng nơi sinh và hội nhưng còn thiếu 1–3 vật phẩm nhân vật đó sở hữu), hãy thêm ở cuối phần giới thiệu (ngoài JSON) một dòng đúng định dạng:
  💡 Gợi ý prompt tiếp theo: "<1 câu prompt ngắn gọn, cụ thể xoay quanh đúng các thực thể liên quan còn thiếu>"
- Trước khi tạo, luôn đối chiếu kỹ danh sách "Các thực thể đã có trong đồ thị" bên dưới để tránh tạo trùng tên và tận dụng đúng tên thực thể sẵn có cho các trường quan hệ.
- Mỗi node phải có đầy đủ các trường thông tin cơ bản theo loại:
  character: name, type, role, desc, gender, dob, birthplace, weapon, sect, personality, status
  item: name, type, desc, rarity, origin, element, holderOrLocation
  location: name, type, desc, region, climate, terrain, dangerLevel, ruler
  faction: name, type, desc, subType, alignment, status, leader, headquarters, motto
  event: name, type, desc, chapter, time, timelineType, duration, location, status, eventType, importance, arcName, sequenceOrder, cause, conflict, outcome, consequences, impact, charactersInvolved, characterRoles, itemsInvolved, factionsInvolved
- Mọi trường phải là chuỗi vô hướng (danh sách nhiều tên như charactersInvolved, itemsInvolved, factionsInvolved viết thành chuỗi phân tách bằng dấu phẩy, không dùng object/array). Nếu tạo một node, trả về đúng một JSON thuần (không bọc trong \`\`\`json):
  {"action":"create_node","node":{...}}
- Nếu tạo từ 2 đến 3 node, trả về đúng một JSON thuần (không bọc trong \`\`\`json):
  {"action":"create_nodes","nodes":[{...node 1...},{...node 2...}]}
- NỐI / TẠO QUAN HỆ GIỮA CÁC NODE ĐÃ CÓ SẴN TRONG ĐỒ THỊ:
  Khi người dùng muốn nối hoặc tạo mối quan hệ giữa 2 thực thể ĐÃ TỒN TẠI trong danh sách "Các thực thể đã có trong đồ thị" (KHÔNG tạo lại node), trả về đúng một JSON thuần:
  + Tạo 1 quan hệ:
    {"action":"create_link","link":{"sourceName":"<Tên chính xác node nguồn đã có>","targetName":"<Tên chính xác node đích đã có>","label":"<Nhãn ngắn gọn, VD: Sở hữu / Đồng minh / Thù địch / Tham gia / Thuộc tổ chức / Diễn ra tại>","category":"<OWNS|ALLY|HOSTILE|PARTICIPATED_IN|MEMBER_OF|EVENT_LOCATION|RELATED>","tone":"<loyalty|hostile|possession|sect|event|location>","type":"<solid|dashed>","contextNote":"<Ghi chú ngữ cảnh ngắn gọn>"}}
  + Tạo nhiều quan hệ (tối đa 5 quan hệ):
    {"action":"create_links","links":[{...link 1...},{...link 2...}]}
  + BẮT BUỘC dùng chính xác tên của 2 node đã có trong đồ thị cho sourceName và targetName; không tự tạo node mới khi người dùng chỉ yêu cầu nối quan hệ giữa 2 node có sẵn.
- Đặt JSON sau phần giới thiệu; không đặt thêm JSON nào khác trong câu trả lời.
- Nếu chỉ đang trò chuyện/hỏi ý kiến thì không cần trả về JSON
- Trả lời bằng tiếng Việt`;

/**
 * Làm sạch văn bản hiển thị trong AI Chat: bỏ code fence rỗng, câu dẫn JSON thừa và ký tự markdown.
 */
function sanitizeAIChatDisplayText(rawText) {
  if (typeof rawText !== 'string') return '';

  let cleaned = rawText
    // Xóa mọi khối code fence rỗng hoặc fence json còn sót lại sau khi đã cắt JSON
    .replace(/```(?:json)?\s*```/gi, '')
    .replace(/```(?:json)?\s*$/gim, '')
    .replace(/^\s*```(?:json)?\s*$/gim, '');

  // Xóa các câu dẫn kỹ thuật thừa như "Dưới đây là các node mình tạo:", "Đây là JSON:"
  cleaned = cleaned.replace(
    /^\s*(?:dưới đây|sau đây|đây)\s+là\s+[^\n]*(?:node|thực thể|json|dữ liệu|cấu trúc)[^\n]*:?\s*$/gim,
    ''
  );
  cleaned = cleaned.replace(/^\s*(?:json|dữ liệu json)\s*:?\s*$/gim, '');

  // Bóc ký tự markdown in đậm / in nghiêng / heading / inline code
  cleaned = cleaned
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/^\s*\*\s+/gm, '- ')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1$2')
    .replace(/\*\*/g, '');

  return cleaned
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

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

            if (Array.isArray(rawNodes) && rawNodes.length > 0) {
              const DEFAULT_STATUS_BY_TYPE = {
                character: 'Còn sống',
                item: 'Nguyên vẹn',
                location: 'Hoạt động',
                faction: 'Đang hoạt động',
                event: 'Đã diễn ra',
              };
              const sanitizeNode = (node) => {
                if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
                const copy = {};
                for (const [key, value] of Object.entries(node)) {
                  if (key === 'x' || key === 'y') {
                    if (typeof value === 'number' && Number.isFinite(value)) {
                      copy[key] = value;
                    }
                    continue;
                  }
                  if (key === 'autoCreatedStub') {
                    if (typeof value === 'boolean') copy[key] = value;
                    continue;
                  }
                  if (value === null || value === undefined) {
                    copy[key] = '';
                  } else if (Array.isArray(value)) {
                    copy[key] = value
                      .map((item) => String(item ?? '').trim())
                      .filter((item) => item && !PLACEHOLDER_VALUE_PATTERN.test(item))
                      .join(', ');
                  } else if (typeof value === 'number' && Number.isFinite(value)) {
                    copy[key] = String(value);
                  } else if (typeof value === 'boolean') {
                    copy[key] = String(value);
                  } else if (typeof value === 'string') {
                    const trimmed = value.trim();
                    copy[key] = PLACEHOLDER_VALUE_PATTERN.test(trimmed) ? '' : trimmed;
                  }
                }

                copy.type = String(copy.type || '').trim().toLowerCase();
                for (const relField of RELATIONAL_NODE_FIELDS) {
                  if (relField in copy) {
                    const trimmed = String(copy[relField] || '').trim();
                    copy[relField] = PLACEHOLDER_VALUE_PATTERN.test(trimmed) ? '' : trimmed;
                  }
                }
                if (copy.dob) copy.dob = formatDateDDMMYYYY(copy.dob);
                if (copy.time) copy.time = formatDateDDMMYYYY(copy.time);
                if (copy.type === 'character' && !copy.age && copy.dob) {
                  copy.age = calculateAgeFromDob(copy.dob);
                }
                if (NODE_TYPES.includes(copy.type) && !copy.status) {
                  copy.status = DEFAULT_STATUS_BY_TYPE[copy.type] || 'Hoạt động';
                }
                if (copy.type === 'character' && !copy.role) {
                  copy.role = 'NHÂN VẬT CHÍNH';
                }
                return copy;
              };

              const sanitizedNodes = rawNodes.map(sanitizeNode);
              const isCompleteNode = (node) =>
                Boolean(
                  node &&
                  typeof node === 'object' &&
                  !Array.isArray(node) &&
                  NODE_TYPES.includes(node.type) &&
                  typeof node.name === 'string' &&
                  node.name.trim() !== '' &&
                  !PLACEHOLDER_VALUE_PATTERN.test(node.name.trim()) &&
                  typeof node.desc === 'string' &&
                  node.desc.trim() !== ''
                );

              const validNodes = sanitizedNodes.filter(isCompleteNode);
              if (validNodes.length > 0) {
                // Khử trùng lặp nếu AI trả về 2 node giống nhau (cùng type + name)
                const seenKeys = new Set();
                const uniqueNodes = [];
                for (const node of validNodes) {
                  const key = `${node.type}::${node.name.trim().toLocaleLowerCase('vi')}`;
                  if (seenKeys.has(key)) continue;
                  seenKeys.add(key);
                  uniqueNodes.push(node);
                }
                if (uniqueNodes.length > 0) {
                  const boundedNodes = uniqueNodes.slice(0, MAX_NODES_PER_CHAT_TURN);
                  return {
                    nodeData: boundedNodes[0],
                    nodeDataList: boundedNodes,
                    truncatedCount: Math.max(0, uniqueNodes.length - boundedNodes.length),
                    start,
                    end: end + 1,
                  };
                }
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
 * Extracts and validates link creation JSON (create_link / create_links) between existing nodes.
 */
function extractCreateLinkResponse(responseText, existingNodes = []) {
  const validNodes = Array.isArray(existingNodes)
    ? existingNodes.filter((n) => n && n.id && n.name)
    : [];
  if (validNodes.length < 2) return null;

  const nodeById = new Map();
  const nodesByNameLower = new Map();
  for (const n of validNodes) {
    nodeById.set(String(n.id), n);
    const nameKey = String(n.name).trim().toLocaleLowerCase('vi');
    if (!nodesByNameLower.has(nameKey)) {
      nodesByNameLower.set(nameKey, []);
    }
    nodesByNameLower.get(nameKey).push(n);
  }

  const resolveNode = (idOrName) => {
    if (typeof idOrName !== 'string') return null;
    const trimmed = idOrName.trim();
    if (!trimmed) return null;
    const byId = nodeById.get(trimmed);
    if (byId) return byId;
    const byNameMatches = nodesByNameLower.get(trimmed.toLocaleLowerCase('vi')) || [];
    // Chỉ phân giải theo tên khi tên khớp duy nhất 1 node; nếu trùng tên thì bắt buộc dùng ID
    return byNameMatches.length === 1 ? byNameMatches[0] : null;
  };

  const VALID_TONES = new Set(['loyalty', 'hostile', 'possession', 'sect', 'event', 'location']);

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
            const rawLinks = parsed.action === 'create_link'
              ? [parsed.link]
              : parsed.action === 'create_links'
                ? parsed.links
                : null;

            if (Array.isArray(rawLinks) && rawLinks.length > 0) {
              const hasRealValue = (val) => {
                const t = String(val ?? '').trim();
                return Boolean(t) && !PLACEHOLDER_VALUE_PATTERN.test(t);
              };
              const seenKeys = new Set();
              const reservedHqFactions = new Set();
              const reservedLeaderFactions = new Set();
              const reservedRulerLocations = new Set();
              const reservedBirthplaceChars = new Set();
              const reservedOriginItems = new Set();
              const resolvedLinks = [];
              let rejectedCount = 0;

              for (const rawLink of rawLinks.slice(0, 5)) {
                if (!rawLink || typeof rawLink !== 'object' || Array.isArray(rawLink)) continue;
                const srcNode = resolveNode(rawLink.source || rawLink.sourceName);
                const tgtNode = resolveNode(rawLink.target || rawLink.targetName);
                if (!srcNode || !tgtNode || String(srcNode.id) === String(tgtNode.id)) continue;

                const label = typeof rawLink.label === 'string' && rawLink.label.trim()
                  ? rawLink.label.trim()
                  : 'Liên kết';
                const rawTone = typeof rawLink.tone === 'string' ? rawLink.tone.trim().toLowerCase() : '';
                const categoryUpper = typeof rawLink.category === 'string'
                  ? rawLink.category.trim().toUpperCase()
                  : 'RELATED';

                // Chặn các kiểu liên kết không tồn tại trên app hoặc vi phạm ràng buộc 1-1 của node hiện có
                if (categoryUpper === 'INVOLVES_ITEM' || categoryUpper === 'INVOLVES_FACTION') {
                  rejectedCount += 1;
                  continue;
                }
                let hqFacId = null;
                if (categoryUpper === 'HEADQUARTERS') {
                  const facNode = srcNode.type === 'faction' ? srcNode : tgtNode.type === 'faction' ? tgtNode : null;
                  if (facNode) {
                    hqFacId = String(facNode.id);
                    if (hasRealValue(facNode.headquarters) || reservedHqFactions.has(hqFacId)) {
                      rejectedCount += 1;
                      continue;
                    }
                  }
                }
                let leaderFacId = null;
                if (categoryUpper === 'LEADER_OF') {
                  const facNode = tgtNode.type === 'faction' ? tgtNode : srcNode.type === 'faction' ? srcNode : null;
                  if (facNode) {
                    leaderFacId = String(facNode.id);
                    if (hasRealValue(facNode.leader) || reservedLeaderFactions.has(leaderFacId)) {
                      rejectedCount += 1;
                      continue;
                    }
                  }
                }
                let rulerLocId = null;
                if (categoryUpper === 'RULER_OF') {
                  const locNode = tgtNode.type === 'location' ? tgtNode : srcNode.type === 'location' ? srcNode : null;
                  if (locNode) {
                    rulerLocId = String(locNode.id);
                    if (hasRealValue(locNode.ruler) || reservedRulerLocations.has(rulerLocId)) {
                      rejectedCount += 1;
                      continue;
                    }
                  }
                }
                let bpCharId = null;
                if (categoryUpper === 'BIRTHPLACE' && srcNode.type === 'character') {
                  bpCharId = String(srcNode.id);
                  if (hasRealValue(srcNode.birthplace) || reservedBirthplaceChars.has(bpCharId)) {
                    rejectedCount += 1;
                    continue;
                  }
                }
                let originItemId = null;
                if (categoryUpper === 'ORIGIN' && srcNode.type === 'item') {
                  originItemId = String(srcNode.id);
                  if (hasRealValue(srcNode.origin) || reservedOriginItems.has(originItemId)) {
                    rejectedCount += 1;
                    continue;
                  }
                }

                const dedupKey = `${srcNode.id}::${tgtNode.id}::${label.toLocaleLowerCase('vi')}`;
                if (seenKeys.has(dedupKey)) continue;
                seenKeys.add(dedupKey);

                if (hqFacId) reservedHqFactions.add(hqFacId);
                if (leaderFacId) reservedLeaderFactions.add(leaderFacId);
                if (rulerLocId) reservedRulerLocations.add(rulerLocId);
                if (bpCharId) reservedBirthplaceChars.add(bpCharId);
                if (originItemId) reservedOriginItems.add(originItemId);

                resolvedLinks.push({
                  source: String(srcNode.id),
                  target: String(tgtNode.id),
                  sourceName: String(srcNode.name),
                  targetName: String(tgtNode.name),
                  label,
                  category: categoryUpper || 'RELATED',
                  tone: VALID_TONES.has(rawTone) ? rawTone : 'loyalty',
                  type: rawLink.type === 'dashed' ? 'dashed' : 'solid',
                  contextNote: typeof rawLink.contextNote === 'string' ? rawLink.contextNote.trim() : '',
                });
              }

              if (resolvedLinks.length > 0 || rejectedCount > 0) {
                return { linkDataList: resolvedLinks, rejectedCount, start, end: end + 1 };
              }
            }
          } catch {
            // Ignore braces that are not a valid link JSON payload.
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
  const linkIntentPattern = /(?<![\p{L}\p{N}])(?:quan hệ|mối quan hệ|liên kết|nối|kết nối|link|relation)(?![\p{L}\p{N}])/iu;
  const linkCreationPhrasePattern = /(?<![\p{L}\p{N}])(?:tạo|thêm|generate|create|add)\s+(?:(?:một|1|các|những|thêm)\s+)?(?:quan hệ|mối quan hệ|liên kết|kết nối|link|relation)(?![\p{L}\p{N}])/giu;
  const creationIntentPattern = /(?<![\p{L}\p{N}])(?:tạo|thêm|generate|create|add)(?![\p{L}\p{N}])/iu;
  const nodeTopicPattern = /(?<![\p{L}\p{N}])(?:node|nodes|thực thể|nhân vật|vật phẩm|địa điểm|tổ chức(?!\s+(?:một|các|những|buổi|sự kiện|hoạt động|cuộc họp|chương trình|lễ))|nhóm|phe phái|sự kiện|character|item|location|faction|event)(?![\p{L}\p{N}])/iu;
  const latestUserIndex = messages.map((message) => message.role === 'user').lastIndexOf(true);
  const latestUserMessage = latestUserIndex >= 0 ? messages[latestUserIndex].content || '' : '';
  const strippedForNodeIntent = latestUserMessage.replace(linkCreationPhrasePattern, ' ');
  const latestUserIntent =
    creationIntentPattern.test(strippedForNodeIntent) &&
    nodeTopicPattern.test(strippedForNodeIntent);

  // Chỉ thoát sớm khi người dùng chỉ yêu cầu nối/tạo quan hệ giữa node có sẵn mà không yêu cầu tạo node mới
  if (linkIntentPattern.test(latestUserMessage) && !latestUserIntent) {
    return { wantsNodes: false, requestedCount: 1 };
  }

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

  const wantsNodes = latestUserIntent || hasPendingCreationIntent;
  if (!wantsNodes) return { wantsNodes: false, requestedCount: 1 };

  const countPattern = /(?<![\p{L}\p{N}])(?:\d+|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)\s*(?:node|nodes|thực thể|nhân vật|vật phẩm|địa điểm|tổ chức|nhóm|phe phái|sự kiện)(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])(?:node|nodes|thực thể)\s*(?:x|:)?\s*(\d+|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)(?![\p{L}\p{N}])/iu;
  const requestMessage = latestUserIntent ? latestUserMessage : (pendingUserMessage?.content || '');
  const countMatch = requestMessage.match(countPattern);
  const countToken = (countMatch?.[0] || '').match(/(\d+|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)/iu)?.[1] || '1';
  const wordToNumber = {
    một: 1,
    hai: 2,
    ba: 3,
    bốn: 4,
    năm: 5,
    sáu: 6,
    bảy: 7,
    tám: 8,
    chín: 9,
    mười: 10,
  };
  const requestedCount = Math.max(1, Number(countToken) || wordToNumber[countToken.toLowerCase()] || 1);
  return {
    wantsNodes,
    requestedCount: Math.min(MAX_NODES_PER_CHAT_TURN, requestedCount),
    rawRequestedCount: requestedCount,
  };
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
    const { messages = [], projectContext = {}, mode = 'default' } = req.body;
    const webModePrompt = WEB_MODES_MAP[mode] || null;
    const isWebWritingMode = Boolean(webModePrompt);
    const isStructuredWebOutline =
      mode === 'web_outline_story' || mode === 'web_outline_chapter';
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, message: 'Thiếu danh sách tin nhắn' });
    }

    const isDraftMode = mode === 'web_draft_write' || mode === 'web_draft_rewrite';
    const isLongWebMode = isDraftMode || isStructuredWebOutline;
    const effectiveMaxMsgLen = isLongWebMode ? MAX_DRAFT_MESSAGE_LENGTH : MAX_MESSAGE_LENGTH;
    const rawUserMessages = messages.filter((message) => message?.role !== 'system').slice(-MAX_CHAT_MESSAGES);
    if (isLongWebMode) {
      const oversized = rawUserMessages.find(
        (m) => m && typeof m.content === 'string' && m.content.length > effectiveMaxMsgLen
      );
      if (oversized) {
        return res.status(400).json({
          success: false,
          message: `Nội dung gửi AI (${oversized.content.length} ký tự) vượt giới hạn ${effectiveMaxMsgLen} ký tự. Vui lòng rút gọn trước khi gửi.`,
        });
      }
    }
    const normalizedMessages = rawUserMessages.map((message) => {
      if (!message || typeof message.content !== 'string') {
        throw new Error('Mỗi tin nhắn phải có nội dung văn bản hợp lệ.');
      }
      return {
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.content.slice(0, effectiveMaxMsgLen),
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

    let contextText = webModePrompt || SYSTEM_PROMPT;
    if (projectContext.projectTitle) {
      contextText += `\n\nDự án hiện tại: "${projectContext.projectTitle}"`;
    }
    if (isWebWritingMode && (projectContext.chapterTitle || projectContext.chapterNumber)) {
      const chLabel = projectContext.chapterTitle
        ? `${projectContext.chapterTitle}${projectContext.chapterNumber ? ` (Chương ${projectContext.chapterNumber})` : ''}`
        : `Chương ${projectContext.chapterNumber}`;
      contextText += `\nChương đang viết: ${chLabel}`;
      if (typeof projectContext.chapterDesc === 'string' && projectContext.chapterDesc.trim()) {
        contextText += `\nGhi chú / Tóm tắt chương: ${projectContext.chapterDesc.trim().slice(0, 800)}`;
      }
    }

    // Lấy danh sách thực thể THỰC TẾ của đúng projectId từ Neo4j (nếu dự án tồn tại trên DB)
    // kết hợp giữ lại các node pending của client chưa đồng bộ lên server theo ID
    const clientNodes = Array.isArray(projectContext.nodes)
      ? projectContext.nodes.filter((n) => n && n.type && n.name)
      : [];
    let effectiveNodes = clientNodes;
    const reqProjectId =
      typeof projectContext.projectId === 'string' ? projectContext.projectId.trim() : '';
    const reqUserId = req.user?.id;
    if (reqProjectId && reqUserId) {
      try {
        const dbProjectCheck = await runQuery(
          `
          MATCH (u:User { id: $userId })-[:OWNS]->(p:Project { id: $projectId })
          OPTIONAL MATCH (n:StoryNode)-[:BELONGS_TO]->(p)
          RETURN p.id AS projectId, collect(n) AS nodes
          `,
          { userId: reqUserId, projectId: reqProjectId },
          'READ'
        );
        if (dbProjectCheck.length > 0 && dbProjectCheck[0]?.projectId) {
          const dbNodes = Array.isArray(dbProjectCheck[0].nodes)
            ? dbProjectCheck[0].nodes.filter((n) => n && n.type && n.name)
            : [];
          const dbNodeIds = new Set(dbNodes.map((n) => String(n.id)));
          const pendingClientNodes = clientNodes.filter(
            (n) => n.syncStatus === 'pending' && n.id && !dbNodeIds.has(String(n.id))
          );
          effectiveNodes = [...dbNodes, ...pendingClientNodes];
        }
      } catch (dbErr) {
        console.warn('[AI Chat] Không thể đọc danh sách node thực tế từ Neo4j, dùng fallback client:', dbErr.message);
      }
    }

    const existingProjectNodeKeys = new Set(
      effectiveNodes
        .filter((n) => n && n.type && n.name)
        .map((n) => `${String(n.type).toLowerCase()}::${String(n.name).trim().toLocaleLowerCase('vi')}`)
    );

    if (effectiveNodes.length > 0) {
      const MAX_CHAT_CTX_NODES = 120;
      const cleanMetaVal = (val) => {
        const t = String(val ?? '').trim();
        return t && !PLACEHOLDER_VALUE_PATTERN.test(t) ? t : '';
      };
      if (isWebWritingMode) {
        const typeLabelMap = {
          character: 'Nhân vật',
          faction: 'Tổ chức',
          location: 'Địa điểm',
          item: 'Vật phẩm',
          event: 'Sự kiện',
        };
        const worldNotes = effectiveNodes
          .slice(0, 80)
          .map((n) => {
            const parts = [];
            const role = cleanMetaVal(n.role);
            const status = cleanMetaVal(n.status);
            const personality = cleanMetaVal(n.personality);
            const desc = cleanMetaVal(n.desc);
            if (role) parts.push(`vai trò: ${role}`);
            if (status) parts.push(`trạng thái: ${status}`);
            if (personality) parts.push(`tính cách: ${personality}`);
            if (desc) parts.push(desc.slice(0, 180));
            return `- ${n.name} (${typeLabelMap[n.type] || n.type})${parts.length ? `: ${parts.join('; ')}` : ''}`;
          })
          .join('\n');
        contextText += `\n\nHồ sơ thế giới truyện hiện có (tham chiếu để giữ đúng tính nhất quán khi viết):\n${worldNotes}`;
      } else {
        const nodesSummary = effectiveNodes
          .slice(0, MAX_CHAT_CTX_NODES)
          .map((n) => {
            const extras = [];
            if (n.type === 'faction') {
              const hq = cleanMetaVal(n.headquarters);
              const leader = cleanMetaVal(n.leader);
              if (hq) extras.push(`đã có trụ sở: ${hq}`);
              if (leader) extras.push(`đã có thủ lĩnh: ${leader}`);
            } else if (n.type === 'location') {
              const ruler = cleanMetaVal(n.ruler);
              if (ruler) extras.push(`đang do ${ruler} cai quản`);
            } else if (n.type === 'item') {
              const holder = cleanMetaVal(n.holderOrLocation);
              const origin = cleanMetaVal(n.origin);
              if (holder) extras.push(`đang do ${holder} nắm giữ`);
              if (origin) extras.push(`nguồn gốc: ${origin}`);
            } else if (n.type === 'character') {
              const bp = cleanMetaVal(n.birthplace);
              if (bp) extras.push(`nơi sinh: ${bp}`);
            } else if (n.type === 'event') {
              const loc = cleanMetaVal(n.location);
              const time = cleanMetaVal(n.time);
              if (loc) extras.push(`địa điểm: ${loc}`);
              if (time) extras.push(`ngày: ${time}`);
            }
            const extraStr = extras.length > 0 ? ` — ${extras.join('; ')}` : '';
            return `- ${n.name} (${n.type})${n.id ? ` [id: ${n.id}]` : ''}${extraStr}`;
          })
          .join('\n');
        contextText += `\n\nCác thực thể đã có trong đồ thị hiện tại (CHỈ các thực thể liệt kê dưới đây mới tồn tại trong dự án này; KHÔNG tạo trùng tên các thực thể này; KHÔNG gán trùng các quan hệ 1-1 đã có sẵn như trụ sở/thủ lĩnh/người giữ/cai quản; khi nối quan hệ nếu nhiều node trùng tên hãy điền đúng [id] vào source/target): \n${nodesSummary}`;
        if (effectiveNodes.length > MAX_CHAT_CTX_NODES) {
          contextText += `\n... và ${effectiveNodes.length - MAX_CHAT_CTX_NODES} thực thể khác`;
        }
      }
    } else if (!isWebWritingMode) {
      contextText +=
        '\n\nCác thực thể đã có trong đồ thị hiện tại: (TRỐNG — hiện có 0 thực thể. Dự án này chưa có bất kỳ nhân vật, địa điểm, vật phẩm, tổ chức hay sự kiện nào. Mọi thực thể người dùng yêu cầu đều là THỰC THỂ MỚI; TUYỆT ĐỐI KHÔNG được nói là đã tồn tại trong đồ thị.)';
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

    if (isWebWritingMode) {
      const generated = await generateAIResponse({
        provider,
        apiKey,
        contextText,
        messages: normalizedMessages,
      });
      return res.status(200).json({
        success: true,
        data: {
          message: isStructuredWebOutline
            ? String(generated.text || '').trim()
            : sanitizeAIChatDisplayText(generated.text),
          nodeData: null,
          nodeDataList: [],
          linkDataList: [],
          suggestedPrompt: null,
          raw: generated.text,
          model: generated.model,
        },
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
    const { wantsNodes, requestedCount, rawRequestedCount = requestedCount } =
      getNodeCreationRequest(normalizedMessages);
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

      // Lọc bỏ các node đã tồn tại trong đồ thị hiện tại để không tạo trùng
      if (nodeResponse && existingProjectNodeKeys.size > 0) {
        const filteredNewNodes = nodeResponse.nodeDataList.filter((n) => {
          const key = `${String(n.type).toLowerCase()}::${String(n.name).trim().toLocaleLowerCase('vi')}`;
          return !existingProjectNodeKeys.has(key);
        });
        if (filteredNewNodes.length > 0) {
          nodeResponse = {
            ...nodeResponse,
            nodeData: filteredNewNodes[0],
            nodeDataList: filteredNewNodes,
          };
        } else {
          nodeResponse = null;
        }
      }

      const generatedCount = nodeResponse?.nodeDataList.length || 0;
      if (!wantsNodes || (nodeResponse && generatedCount >= requestedCount)) {
        break;
      }

      if (attempt < MAX_NODE_GENERATION_ATTEMPTS) {
        const issue = !nodeResponse
          ? 'Câu trả lời trước chưa có JSON node hợp lệ, thiếu trường bắt buộc, hoặc tạo trùng với node đã có trong đồ thị.'
          : `Bạn mới tạo ${generatedCount}/${requestedCount} node mới không trùng lặp theo yêu cầu.`;

        console.warn(`[AI Controller] ${issue} Tự yêu cầu hoàn thiện lượt ${attempt + 1}/${MAX_NODE_GENERATION_ATTEMPTS}.`);
        attemptMessages = [
          ...attemptMessages,
          { role: 'assistant', content: responseText },
          {
            role: 'user',
            content:
              `${issue} Hãy tiếp tục ngay, không hỏi người dùng và không bỏ node nào. ` +
              `Tạo đủ ít nhất ${requestedCount} node MỚI hoàn toàn khác nhau và KHÔNG trùng tên với các thực thể đã có trong đồ thị (tối đa ${MAX_NODES_PER_CHAT_TURN} node trong lượt này); điền đầy đủ các trường cơ bản. ` +
              'Với các trường quan hệ (birthplace, weapon, sect, origin, holderOrLocation, ruler, leader, headquarters, location, charactersInvolved, itemsInvolved, factionsInvolved), ' +
              'CHỈ điền tên node đã có trong đồ thị hoặc node nằm trong chính mảng nodes này, tuyệt đối không bịa thêm tên ngoài danh sách (nếu không có hãy để chuỗi rỗng ""). ' +
              `Trả lời bằng một JSON hợp lệ duy nhất với action "create_node" cho một node hoặc "create_nodes" cho 2 đến ${MAX_NODES_PER_CHAT_TURN} node.`,
          },
        ];
      }
    }

    const generatedCount = nodeResponse?.nodeDataList.length || 0;
    if (wantsNodes && generatedCount === 0) {
      if (attemptedNodeCreation) {
        return res.status(502).json({
          success: false,
          message: `AI chưa tạo đủ ${requestedCount} node hợp lệ sau ${MAX_NODE_GENERATION_ATTEMPTS} lượt. Vui lòng thử lại hoặc bổ sung mô tả cụ thể hơn.`,
        });
      }
      nodeResponse = null;
    }

    cleanMessage = sanitizeAIChatDisplayText(responseText);
    let suggestedPrompt = null;
    let linkDataList = [];
    if (nodeResponse) {
      nodeData = nodeResponse.nodeData;
      nodeDataList = nodeResponse.nodeDataList;
      const beforeJson = responseText
        .slice(0, nodeResponse.start)
        .replace(/```(?:json)?\s*$/i, '')
        .trim();
      const afterJson = responseText
        .slice(nodeResponse.end)
        .replace(/^\s*```/i, '')
        .trim();
      cleanMessage = sanitizeAIChatDisplayText(
        [beforeJson, afterJson].filter(Boolean).join('\n\n')
      );

      if (!cleanMessage) {
        cleanMessage = `✨ Tôi đã thiết lập xong ${nodeDataList.length > 1 ? `${nodeDataList.length} thực thể` : `thực thể "${nodeData.name}"`}. Bạn có thể xem trước và thêm vào đồ thị bên dưới!`;
      }

      // Trích xuất gợi ý prompt tiếp theo nếu AI có đề xuất
      const promptMatch = cleanMessage.match(
        /Gợi ý prompt tiếp theo\s*:\s*["“]?([^"”\n]+)["”]?/i
      );
      if (promptMatch && promptMatch[1]?.trim()) {
        suggestedPrompt = sanitizeAIChatDisplayText(promptMatch[1].trim());
      }

      // Nếu chưa đủ số node yêu cầu (do giới hạn mỗi lượt hoặc kết quả một phần), báo rõ số lượng và gợi ý prompt tiếp theo
      const remainingToCreate = Math.max(
        rawRequestedCount - nodeDataList.length,
        nodeResponse.truncatedCount || 0
      );
      const exceededTurnCap =
        rawRequestedCount > MAX_NODES_PER_CHAT_TURN || (nodeResponse.truncatedCount || 0) > 0;
      if (remainingToCreate > 0 && !suggestedPrompt) {
        const createdNames = nodeDataList.map((n) => n.name).filter(Boolean).join(', ');
        const nextBatchCount = Math.min(MAX_NODES_PER_CHAT_TURN, remainingToCreate);
        suggestedPrompt = `Tạo tiếp ${nextBatchCount} node còn lại liên kết với ${createdNames || 'các thực thể vừa tạo'}`;
        if (exceededTurnCap) {
          cleanMessage += `\n\n💡 Mỗi lượt chỉ tạo tối đa ${MAX_NODES_PER_CHAT_TURN} node (đã tạo ${nodeDataList.length}/${rawRequestedCount}, còn thiếu ${remainingToCreate} node). Gợi ý prompt tiếp theo: "${suggestedPrompt}"`;
        } else {
          cleanMessage += `\n\n💡 Hiện mới tạo được ${nodeDataList.length}/${requestedCount} node hợp lệ (còn thiếu ${remainingToCreate} node). Gợi ý prompt tiếp theo: "${suggestedPrompt}"`;
        }
      }
    } else {
      const linkResponse = extractCreateLinkResponse(responseText, effectiveNodes);
      if (linkResponse) {
        linkDataList = linkResponse.linkDataList;
        const beforeJson = responseText
          .slice(0, linkResponse.start)
          .replace(/```(?:json)?\s*$/i, '')
          .trim();
        const afterJson = responseText
          .slice(linkResponse.end)
          .replace(/^\s*```/i, '')
          .trim();
        cleanMessage = sanitizeAIChatDisplayText(
          [beforeJson, afterJson].filter(Boolean).join('\n\n')
        );
        if (linkDataList.length > 0) {
          if (!cleanMessage) {
            cleanMessage = `🔗 Tôi đã thiết lập ${linkDataList.length > 1 ? `${linkDataList.length} mối quan hệ` : `mối quan hệ "${linkDataList[0].label}"`}. Bạn có thể xem trước và lưu vào đồ thị bên dưới!`;
          }
        } else if (linkResponse.rejectedCount > 0) {
          const unsupportedNote =
            '⚠️ Mối quan hệ AI đề xuất không được ứng dụng hỗ trợ hoặc vi phạm ràng buộc 1-1 hiện có (ví dụ: tổ chức đã có trụ sở/thủ lĩnh, hoặc nối trực tiếp sự kiện với vật phẩm/tổ chức).';
          cleanMessage = cleanMessage
            ? `${cleanMessage}\n\n${unsupportedNote}`
            : unsupportedNote;
        }
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        message: cleanMessage,
        nodeData,
        nodeDataList,
        linkDataList,
        suggestedPrompt,
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
      .slice(0, 12)
      .map((n) => n.name);
    // Tính toán mốc ngày mặc định (DD/MM/YYYY):
    // Nếu các chương/sự kiện trước đã có ngày hợp lệ -> lấy ngày tiếp theo (+1 ngày) sau mốc gần nhất.
    // Nếu chưa có mốc nào -> lấy ngày hiện tại làm mốc.
    const parsedPrevEventDates = nodes
      .filter((n) => n && n.type === 'event' && n.time)
      .map((n) => parseDateParts(n.time))
      .filter(Boolean)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    const latestPrevEventDate =
      parsedPrevEventDates.length > 0
        ? parsedPrevEventDates[parsedPrevEventDates.length - 1]
        : null;
    const defaultEventDate = latestPrevEventDate
      ? addDaysDDMMYYYY(latestPrevEventDate, 1)
      : getTodayDDMMYYYY();
    const defaultDateReason = latestPrevEventDate
      ? `ngày tiếp theo sau sự kiện gần nhất (${latestPrevEventDate.formatted}) của chương trước`
      : `ngày hiện tại (${defaultEventDate})`;

    const previousEvents = nodes
      .filter((n) => n.type === 'event' && n.name)
      .slice(-10)
      .map((n) => `${n.name}${n.time ? ` [${formatDateDDMMYYYY(n.time)}]` : ''}${n.arcName ? ` [Arc: ${n.arcName}]` : ''}`);

    const contextPrompt = `Bạn là trợ lý AI sáng tạo cốt truyện tài hoa cho tiểu thuyết thể loại: ${writingStyle}.
Dự án tiểu thuyết: "${projectTitle}".
${chaptersSummary ? `Các chương gần nhất:\n${chaptersSummary}\n` : ''}
Các thực thể hiện có trong truyện:
- Nhân vật: ${characters.join(', ') || 'Chưa có'}
- Địa điểm: ${locations.join(', ') || 'Chưa có'}
- Tổ chức / Nhóm: ${factions.join(', ') || 'Chưa có'}
- Vật phẩm: ${items.join(', ') || 'Chưa có'}
- Sự kiện trước đó: ${previousEvents.join(', ') || 'Chưa có'}
- Mốc thời gian mặc định cho Chương ${nextChapterNumber}: ${defaultEventDate} (${defaultDateReason})

Nhiệm vụ của bạn:
1. Tạo thông tin cho CHƯƠNG TIẾP THEO (Chương ${nextChapterNumber}).
2. Tạo 2 đến 4 SỰ KIỆN CHÍNH (events) diễn ra theo trình tự thời gian trong chương này. Sự kiện cần gắn kết chặt chẽ với các nhân vật, địa điểm, vật phẩm, tổ chức hiện có (hoặc giới thiệu mới nếu phù hợp với mạch truyện).

QUY TẮC THỐNG NHẤT QUAN HỆ & ĐIỀN ĐẦY ĐỦ CHI TIẾT SỰ KIỆN (BẮT BUỘC):
- MỖI sự kiện BẮT BUỘC phải điền ĐẦY ĐỦ và CỤ THỂ (KHÔNG ĐƯỢC ĐỂ TRỐNG) tất cả các trường: "name", "desc", "eventType", "importance", "arcName", "sequenceOrder", "location", "time", "cause", "conflict", "outcome", "consequences", "impact", "charactersInvolved", "characterRoles".
- "charactersInvolved": mảng tên tất cả nhân vật tham gia trực tiếp; ưu tiên dùng chính xác tên nhân vật hiện có ở trên. Nếu tên nhân vật xuất hiện trong tên/mô tả sự kiện thì bắt buộc đưa vào mảng này.
- "characterRoles": ghi ngắn gọn vai trò từng nhân vật tham gia (VD: "Lăng Tiêu: Chủ động điều tra; Mộc Lan: Hỗ trợ").
- "location": tên địa điểm cụ thể (ưu tiên địa điểm đã có ở trên) để nối quan hệ Diễn ra tại (EVENT_LOCATION).
- "itemsInvolved": mảng tên chính xác các vật phẩm mà nhân vật tham gia thực sự mang theo / sử dụng trong sự kiện đó (ưu tiên vật phẩm nhân vật đó đang sở hữu ở danh sách trên, [] nếu không dùng vật phẩm nào; đồ thị sẽ nối chuỗi Vật phẩm <--Sở hữu-- Nhân vật --Tham gia--> Sự kiện).
- "factionsInvolved": mảng tên chính xác các tổ chức/phe phái mà nhân vật tham gia đại diện / liên quan trong sự kiện đó (ưu tiên tổ chức ở danh sách trên, [] nếu không có; đồ thị sẽ nối chuỗi Tổ chức <--Tổ chức-- Nhân vật --Tham gia--> Sự kiện).
- "cause": nguyên nhân trực tiếp dẫn đến sự kiện (nếu bắt nguồn từ một sự kiện trước đó ở trên, ghi chính xác tên sự kiện đó để nối quan hệ CAUSED_BY).
- "conflict": xung đột/vấn đề chính diễn ra trong sự kiện.
- "outcome": kết quả trực tiếp ngay khi sự kiện kết thúc.
- "consequences": hệ quả cụ thể (thay đổi trạng thái nhân vật, vật phẩm, quan hệ phe phái...).
- "impact": tác động lâu dài tới mạch truyện các chương sau.
- "eventType": chọn 1 trong: "Chiến đấu", "Đối thoại / Đàm phán", "Tiết lộ bí mật", "Du hành", "Biến cố / Hy sinh", "Giao dịch / Vật phẩm", "Hồi tưởng", "Khác".
- "importance": chọn 1 trong: "Nút thắt chính", "Bước ngoặt", "Gieo mầm", "Sự kiện phụ".
- "time": Ngày/Tháng/Năm diễn ra sự kiện theo đúng định dạng DD/MM/YYYY (VD: "${defaultEventDate}"). QUY TẮC BẮT BUỘC: Nếu ý tưởng của tác giả KHÔNG đề cập ngày/tháng/năm cụ thể, hãy dùng "${defaultEventDate}" (${defaultDateReason}) làm mốc cho sự kiện đầu tiên và các sự kiện tiếp theo cùng ngày hoặc nối tiếp theo định dạng DD/MM/YYYY. Nếu tác giả có gợi ý thời điểm cụ thể, hãy dùng đúng thời điểm đó theo định dạng DD/MM/YYYY.
- "characterStatusChanges": mảng ghi nhận khi sự kiện thực sự làm nhân vật chuyển sang "Đã chết" hoặc "Hồi sinh" trong diễn biến hiện tại (dùng [] nếu không có). Nhân vật thay đổi trạng thái phải có trong "charactersInvolved".
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
      "eventType": "<Chiến đấu / Đối thoại / Đàm phán / Tiết lộ bí mật / Du hành / Biến cố / Hy sinh / Giao dịch / Vật phẩm / Hồi tưởng / Khác>",
      "importance": "<Nút thắt chính / Bước ngoặt / Gieo mầm / Sự kiện phụ>",
      "arcName": "<Tên cung truyện / Arc hoặc chuỗi rỗng>",
      "sequenceOrder": "<Số thứ tự 1, 2, 3...>",
      "location": "<Tên địa điểm nơi diễn ra>",
      "time": "<Ngày/Tháng/Năm diễn ra định dạng DD/MM/YYYY, VD: ${defaultEventDate}>",
      "cause": "<Nguyên nhân hoặc tên sự kiện dẫn tới sự kiện này>",
      "conflict": "<Xung đột chính trong sự kiện>",
      "outcome": "<Kết quả trực tiếp của sự kiện>",
      "consequences": "<Hệ quả cụ thể / thay đổi trạng thái nhân vật, vật phẩm, phe phái>",
      "impact": "<Tác động lâu dài tới cốt truyện>",
      "charactersInvolved": ["<Tên chính xác nhân vật tham gia>"],
      "characterRoles": "<Vai trò ngắn gọn từng nhân vật, VD: A: Chủ động; B: Chứng kiến>",
      "itemsInvolved": ["<Tên vật phẩm xuất hiện/chuyển giao nếu có>"],
      "factionsInvolved": ["<Tên tổ chức/phe phái liên quan nếu có>"],
      "characterStatusChanges": [
        {
          "characterName": "<Tên nhân vật có trạng thái thay đổi>",
          "status": "Đã chết",
          "statusEvent": "<Tên sự kiện này>"
        }
      ]
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

    const cleanEventScalar = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val).trim();
      return PLACEHOLDER_VALUE_PATTERN.test(str) ? '' : str;
    };
    const cleanEventList = (val) => {
      const arr = Array.isArray(val)
        ? val
        : typeof val === 'string' && val.trim()
          ? val.split(/[,;\n]+/)
          : [];
      return Array.from(
        new Set(
          arr
            .map((item) => String(item).trim())
            .filter((item) => item && !PLACEHOLDER_VALUE_PATTERN.test(item))
        )
      );
    };

    const itemNodes = nodes.filter(
      (n) => n && n.type === 'item' && typeof n.name === 'string' && n.name.trim()
    );
    const factionNodes = nodes.filter(
      (n) => n && n.type === 'faction' && typeof n.name === 'string' && n.name.trim()
    );

    const hasWholeEntityMention = (text, entityName) => {
      if (!text || !entityName) return false;
      const escaped = entityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(
        `(^|[^\\p{L}\\p{N}\\p{M}])${escaped}(?=$|[^\\p{L}\\p{N}\\p{M}])`,
        'iu'
      );
      return pattern.test(text);
    };

    const events = normalizeEventCharacters(parsedData.events, characterNodes).map((event, idx) => {
      const cleanLocation = cleanEventScalar(event.location);
      const cleanCharacters = cleanEventList(event.charactersInvolved);
      // Chỉ giữ danh sách vật phẩm / tổ chức được AI xác định tường minh cho sự kiện
      // (không tự động thêm chỉ vì tên xuất hiện trong mô tả)
      const matchedItems = cleanEventList(event.itemsInvolved);
      const matchedFactions = cleanEventList(event.factionsInvolved);
      const parsedEventDate = parseDateParts(cleanEventScalar(event.time));

      return {
        ...event,
        eventType: cleanEventScalar(event.eventType) || 'Khác',
        importance: cleanEventScalar(event.importance) || (idx === 0 ? 'Bước ngoặt' : 'Nút thắt chính'),
        arcName: cleanEventScalar(event.arcName) || `Chương ${nextChapterNumber}`,
        sequenceOrder: cleanEventScalar(event.sequenceOrder) || String(idx + 1),
        time: parsedEventDate ? parsedEventDate.formatted : defaultEventDate,
        timelineType: '',
        duration: '',
        cause: cleanEventScalar(event.cause),
        conflict: cleanEventScalar(event.conflict),
        outcome: cleanEventScalar(event.outcome),
        consequences: cleanEventScalar(event.consequences),
        characterRoles: cleanEventScalar(event.characterRoles),
        itemsInvolved: matchedItems,
        factionsInvolved: matchedFactions,
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
        let detail = `[Sự kiện ${ev.sequenceOrder || idx + 1}]: ${ev.name || ev.title || 'Sự kiện'}\n- Diễn biến: ${ev.desc || 'Chưa có mô tả'}`;
        if (ev.eventType) detail += `\n- Phân loại: ${ev.eventType}`;
        if (ev.importance) detail += `\n- Mức độ quan trọng: ${ev.importance}`;
        if (ev.arcName) detail += `\n- Cung truyện (Arc): ${ev.arcName}`;
        if (ev.location) detail += `\n- Địa điểm: ${ev.location}`;
        if (ev.time) detail += `\n- Thời điểm: ${ev.time}`;
        if (ev.timelineType) detail += `\n- Dòng thời gian: ${ev.timelineType}`;
        if (ev.duration) detail += `\n- Thời lượng: ${ev.duration}`;
        if (ev.cause) detail += `\n- Nguyên nhân: ${ev.cause}`;
        if (ev.conflict) detail += `\n- Xung đột chính: ${ev.conflict}`;
        if (ev.outcome) detail += `\n- Kết quả trực tiếp: ${ev.outcome}`;
        if (ev.consequences) detail += `\n- Hệ quả cụ thể: ${ev.consequences}`;
        if (ev.impact) detail += `\n- Tác động lâu dài: ${ev.impact}`;
        if (Array.isArray(ev.charactersInvolved) && ev.charactersInvolved.length > 0) {
          detail += `\n- Nhân vật tham gia: ${ev.charactersInvolved.join(', ')}`;
        }
        if (ev.characterRoles) detail += `\n- Vai trò nhân vật: ${ev.characterRoles}`;
        if (Array.isArray(ev.itemsInvolved) && ev.itemsInvolved.length > 0) {
          detail += `\n- Vật phẩm liên quan: ${ev.itemsInvolved.join(', ')}`;
        }
        if (Array.isArray(ev.factionsInvolved) && ev.factionsInvolved.length > 0) {
          detail += `\n- Tổ chức liên quan: ${ev.factionsInvolved.join(', ')}`;
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
        linkDataList: Array.isArray(m.linkDataList) ? m.linkDataList : [],
        linksAdded: Boolean(m.linksAdded),
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

    const itemById = new Map(allItems.map((it) => [String(it.id), it]));
    const eventById = new Map(allEvents.map((ev) => [String(ev.id), ev]));

    const itemByNameLower = new Map(
      allItems.map((it) => [String(it.name || '').trim().toLowerCase(), it])
    );

    const parseListFieldValues = (raw) => {
      if (Array.isArray(raw)) return raw;
      const str = String(raw || '').trim();
      if (!str) return [];
      try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Fallback to delimiter split
      }
      return str.split(/[,;\n]+/);
    };

    const getCharOwnedItems = (charNode) => {
      const charId = String(charNode.id || '').trim();
      const charNameLower = String(charNode.name || '').trim().toLowerCase();
      const seen = new Set();
      const owned = [];
      const addItem = (raw) => {
        const t = String(raw || '').trim();
        if (!t || /^(none|null|n\/a|unknown|không có|chưa rõ|không rõ|trống)$/i.test(t)) return;
        const matched = itemById.get(t) || itemByNameLower.get(t.toLowerCase());
        const displayName = matched ? String(matched.name || '').trim() : t;
        const key = displayName.toLowerCase();
        if (displayName && !seen.has(key)) {
          seen.add(key);
          owned.push(displayName);
        }
      };
      parseListFieldValues(charNode.weapon).forEach(addItem);
      allItems.forEach((it) => {
        const holder = String(it.holderOrLocation || '').trim();
        if (holder && (holder.toLowerCase() === charNameLower || holder === charId)) {
          addItem(it.name);
        }
      });
      safeLinks.forEach((l) => {
        const cat = String(l.category || '').toUpperCase();
        if ((cat === 'OWNS' || cat === 'EQUIPPED') && String(l.source) === charId) {
          const it = itemById.get(String(l.target));
          if (it) addItem(it.name);
        }
      });
      return owned;
    };

    const compareEventsDeterministically = (a, b) => {
      const pa = parseDateParts(a.time);
      const pb = parseDateParts(b.time);
      if (pa && pb && pa.sortKey !== pb.sortKey) {
        return pa.sortKey.localeCompare(pb.sortKey);
      }
      if (pa && !pb) return -1;
      if (!pa && pb) return 1;
      const seqA = Number(a.sequenceOrder);
      const seqB = Number(b.sequenceOrder);
      const hasSeqA = Number.isFinite(seqA) && String(a.sequenceOrder || '').trim() !== '';
      const hasSeqB = Number.isFinite(seqB) && String(b.sequenceOrder || '').trim() !== '';
      if (hasSeqA && hasSeqB && seqA !== seqB) return seqA - seqB;
      if (hasSeqA && !hasSeqB) return -1;
      if (!hasSeqA && hasSeqB) return 1;
      return String(a.name || '').localeCompare(String(b.name || ''), 'vi');
    };

    const getCharEventsSummary = (charNode) => {
      const charId = String(charNode.id || '').trim();
      const charNameLower = String(charNode.name || '').trim().toLowerCase();
      const evMap = new Map();
      allEvents.forEach((ev) => {
        const parts = parseListFieldValues(ev.charactersInvolved || ev.characters);
        if (
          parts.some((p) => {
            const t = String(p || '').trim();
            return t.toLowerCase() === charNameLower || t === charId;
          })
        ) {
          evMap.set(ev.id, ev);
        }
      });
      safeLinks.forEach((l) => {
        if (String(l.category || '').toUpperCase() !== 'PARTICIPATED_IN') return;
        const src = String(l.source);
        const tgt = String(l.target);
        if (src === charId && eventById.has(tgt)) evMap.set(tgt, eventById.get(tgt));
        if (tgt === charId && eventById.has(src)) evMap.set(src, eventById.get(src));
      });
      return Array.from(evMap.values())
        .sort(compareEventsDeterministically)
        .slice(0, 10)
        .map((ev) => `${ev.name}${ev.time ? ` (${formatDateDDMMYYYY(ev.time)})` : ''}`);
    };

    const todayStr = getTodayDDMMYYYY();
    const currentYear = new Date().getFullYear();

    const characterLines = allCharacters
      .slice(0, MAX_CTX_CHARACTERS)
      .map((n) => {
        const ownedItems = getCharOwnedItems(n);
        const charEvents = getCharEventsSummary(n);
        const formattedDob = formatDateDDMMYYYY(n.dob);
        const resolvedAge = n.age || calculateAgeFromDob(formattedDob);
        return [
          n.name,
          n.status && `trạng thái=${n.status}`,
          n.statusEvent && `biến cố trạng thái=${n.statusEvent}`,
          n.role && `vai trò=${n.role}`,
          n.gender && `giới tính=${n.gender}`,
          formattedDob && `ngày sinh=${formattedDob}`,
          resolvedAge && `tuổi=${resolvedAge}`,
          n.birthplace && `nơi sinh=${n.birthplace}`,
          ownedItems.length > 0 && `vật phẩm sở hữu=[${ownedItems.join(', ')}]`,
          n.sect && `tổ chức=${n.sect}`,
          charEvents.length > 0 && `sự kiện đã tham gia=[${charEvents.join('; ')}]`,
          n.personality && `tính cách=${String(n.personality).slice(0, 120)}`,
          n.desc && `mô tả=${String(n.desc).slice(0, 160)}`,
        ]
          .filter(Boolean)
          .join(' | ');
      });

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
          n.power && `uy lực=${String(n.power).slice(0, 100)}`,
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
          n.statusEvent && `biến cố trạng thái=${n.statusEvent}`,
          n.leader && `thủ lĩnh=${n.leader}`,
          n.seniorMembers && `thành viên cấp cao=${n.seniorMembers}`,
          n.members && `thành viên=${n.members}`,
          n.subFactions && `tổ chức trực thuộc=${n.subFactions}`,
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
          n.sequenceOrder && `thứ tự=#${n.sequenceOrder}`,
          n.eventType && `loại=${n.eventType}`,
          n.importance && `mức độ=${n.importance}`,
          n.arcName && `arc=${n.arcName}`,
          n.time && `ngày/tháng/năm=${formatDateDDMMYYYY(n.time)}`,
          n.location && `địa điểm=${n.location}`,
          n.cause && `nguyên nhân=${String(n.cause).slice(0, 120)}`,
          n.conflict && `xung đột=${String(n.conflict).slice(0, 120)}`,
          (n.charactersInvolved || n.characters) &&
          `nhân vật=${String(n.charactersInvolved || n.characters).slice(0, 140)}`,
          n.characterRoles && `vai trò nhân vật=${String(n.characterRoles).slice(0, 120)}`,
          n.itemsInvolved && `vật phẩm=${String(n.itemsInvolved).slice(0, 120)}`,
          n.factionsInvolved && `tổ chức=${String(n.factionsInvolved).slice(0, 120)}`,
          n.outcome && `kết quả=${String(n.outcome).slice(0, 120)}`,
          n.consequences && `hệ quả=${String(n.consequences).slice(0, 120)}`,
          n.impact && `tác động=${String(n.impact).slice(0, 120)}`,
          n.desc && `mô tả=${String(n.desc).slice(0, 140)}`,
        ]
          .filter(Boolean)
          .join(' | ')
      );

    const chronologicalTimelineLines = [...allEvents]
      .filter((ev) => ev.time || ev.chapter)
      .sort(compareEventsDeterministically)
      .slice(-MAX_CTX_EVENTS)
      .map(
        (ev) =>
          `- [${formatDateDDMMYYYY(ev.time) || 'Chưa rõ ngày'}] ${ev.name}${ev.chapter ? ` (${ev.chapter})` : ''}${ev.location ? ` @ ${ev.location}` : ''}${ev.cause ? ` | nguyên nhân: ${ev.cause}` : ''}${ev.charactersInvolved || ev.characters ? ` | nhân vật: ${ev.charactersInvolved || ev.characters}` : ''}`
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
Ngày hiện tại của hệ thống: ${todayStr} (năm ${currentYear}). Tất cả ngày/tháng/năm đều dùng định dạng DD/MM/YYYY.
Nhiệm vụ của bạn là đọc kỹ VĂN BẢN CHƯƠNG MỚI do tác giả tự viết, đối chiếu chặt chẽ với BẢN ĐỒ THỰC THỂ, NIÊN BIỂU SỰ KIỆN & LỊCH SỬ CÁC CHƯƠNG TRƯỚC của dự án để thực hiện 3 việc:

1. BẮT LỖI TÍNH NHẤT QUÁN & LOGIC (issues):
Hãy rà soát toàn diện các nhóm lỗi sau (chỉ báo lỗi thực sự có căn cứ từ dữ liệu đồ thị hoặc mâu thuẫn nội tại trong chương, KHÔNG bịa đặt):
- "Lỗi thời gian & Niên biểu": RÀ SOÁT ĐẶC BIỆT KỸ các mốc ngày/tháng/năm (DD/MM/YYYY) giữa các sự kiện:
  + Viết nhầm ngày/tháng/năm trong chương so với niên biểu các sự kiện đã có (VD: chương sau hoặc sự kiện diễn ra sau nhưng ghi ngày/tháng/năm SỚM HƠN sự kiện trước mà không phải hồi tưởng).
  + Mâu thuẫn nhân quả theo thời gian: nhắc tới kết quả/hệ quả của sự kiện A (hoặc sự kiện nối cause từ A) nhưng mốc thời gian lại trước ngày diễn ra sự kiện A.
  + Sai khoảng thời gian chênh lệch (VD: văn bản nói "3 ngày sau sự kiện X" nhưng ngày/tháng/năm thực tế chênh lệch khác hẳn hoặc đi ngược thời gian).
  + Mâu thuẫn ngày sinh (dob) / tuổi (age) / năm sự kiện:
    * Khi có đủ ngày/tháng/năm sinh (dob) và ngày/tháng/năm sự kiện (hoặc ngày hiện tại ${todayStr}), tính tuổi chính xác theo việc đã qua sinh nhật trong năm đó hay chưa; nếu chỉ có năm sinh hoặc năm sự kiện thì coi phép tính tuổi là xấp xỉ (±1 tuổi) và chỉ bắt lỗi khi lệch rõ rệt ngoài phạm vi xấp xỉ.
    * Nhân vật chưa ra đời vào ngày/năm diễn ra sự kiện, hoặc chênh lệch tuổi giữa hai nhân vật trái ngược với năm sinh đã lưu.
    * Văn bản nêu cả năm sinh và tuổi của cùng một nhân vật nhưng tự mâu thuẫn với nhau.
  + Nhân vật xuất hiện cùng một ngày/tháng/năm ở hai địa điểm xa nhau không có giải thích di chuyển.
  + Nhầm trình tự thời gian giữa các sự kiện ngay trong cùng một chương.
- "Nhân vật đã chết": Nhân vật đang có trạng thái "Đã chết" (hoặc đã tử nạn ở sự kiện statusEvent vào ngày X) nhưng lại xuất hiện hành động/đối thoại trực tiếp ở thời điểm sau ngày X (trừ khi văn bản nêu rõ là hồi tưởng trước ngày chết, linh hồn hoặc sự kiện hồi sinh).
- "Vật phẩm & Sở hữu": Đối chiếu danh sách ĐA VẬT PHẨM mỗi nhân vật đang sở hữu (weapon, item.holderOrLocation, liên kết OWNS/EQUIPPED) và itemsInvolved: bắt lỗi nhân vật sử dụng vật phẩm thuộc sở hữu của người khác mà chưa có sự kiện chuyển giao; dùng vật phẩm đã bị phá hủy/thất lạc/hư hại trong hệ quả (consequences) sự kiện trước; sai độ hiếm, nguyên tố, nguồn gốc hoặc uy lực (power).
- "Nhân quả & Hệ quả sự kiện": Đối chiếu chặt chẽ cause, conflict, outcome, consequences, impact và characterRoles của các sự kiện trước: bắt lỗi chương mới mô tả trạng thái nhân vật/vật phẩm/địa điểm/phe phái trái ngược với kết quả/hệ quả đã chốt ở sự kiện trước (VD: bị thương nặng, mất vũ khí, phá hủy công trình nhưng chương sau bình thường không giải thích), hoặc sai vai trò đã thiết lập.
- "Tổ chức & Phe phái": Tổ chức đã "Suy tàn" / "Tạm ngừng" (theo status và statusEvent) nhưng vẫn hoạt động bình thường; nhân vật thuộc tổ chức/phe "Đối lập" bỗng hành xử như đồng minh không lý do; nhầm thủ lĩnh (leader), trụ sở (headquarters), tôn chỉ (motto) hoặc factionsInvolved.
- "Mâu thuẫn địa điểm": Nhân vật đã từng đến địa điểm đó (trong sự kiện đã tham gia, nơi sinh, trụ sở hoặc liên kết) nhưng văn bản lại viết là "lần đầu đặt chân đến", "chưa từng nghe qua" hoặc không nhận ra nơi đó.
- "Đặc điểm nhân vật": Sai giới tính, sai vai trò, tính cách/năng lực trái ngược hoàn toàn với hồ sơ đã thiết lập.
- "Mâu thuẫn quan hệ": Cách xưng hô hoặc thái độ thù địch/thân thiết mâu thuẫn với các mối liên kết hiện có trên đồ thị.
- "Bối cảnh & Địa lý": Mô tả khí hậu, địa hình, mức độ nguy hiểm, vùng miền, thế lực cai quản (ruler) trái ngược với thiết lập của địa điểm.
- "Mâu thuẫn nội tại": Mâu thuẫn tự thân ngay trong văn bản chương (đổi tên nhân vật, buổi sáng đột ngột thành đêm khuya không chuyển cảnh, chi tiết trước đá chi tiết sau).

Phân loại mức độ severity:
- "error": Lỗi logic/nhất quán nghiêm trọng (VD: sai ngày/tháng/năm đảo ngược niên biểu sự kiện, sai tuổi/năm sinh, người đã chết xuất hiện sau ngày tử nạn, sai sự thật đã khẳng định, dùng vật phẩm đã bị phá hủy).
- "warning": Cảnh báo mâu thuẫn nhẹ hoặc cần giải thích thêm (VD: vật phẩm đổi chủ đột ngột, khoảng cách thời gian đáng ngờ, nhân vật hành xử khác thường).
- "info": Gợi ý làm rõ/bổ sung để mạch truyện chặt chẽ hơn (VD: nên ghi rõ ngày/tháng/năm DD/MM/YYYY để đồng bộ niên biểu).

2. ĐỀ XUẤT CÁC NODE MỚI CẦN TẠO (suggestedNodes) & QUY TẮC THỐNG NHẤT QUAN HỆ:
- Trích xuất các thực thể MỚI xuất hiện rõ ràng trong chương thuộc 4 loại: "character", "item", "location", "faction" mà CHƯA CÓ trong danh sách thực thể hiện có ở dưới (so khớp không phân biệt hoa/thường).
- KHÔNG tạo lại node đã tồn tại.
- Điền đầy đủ các trường thông tin suy ra được từ văn bản để hệ thống tự động tạo đúng các cạnh quan hệ đồ thị:
  + Nhân vật có ngày/năm sinh -> điền dob theo định dạng DD/MM/YYYY; có tuổi -> điền số tuổi vào age (nếu có dob mà văn bản không nêu tuổi, để trống hoặc tính theo năm hiện tại ${currentYear}).
  + Nhân vật sở hữu/dùng vật phẩm -> điền tên vật phẩm (nhiều vật phẩm phân tách bằng dấu phẩy) vào character.weapon và/hoặc tên nhân vật vào item.holderOrLocation.
  + Nhân vật thuộc tổ chức / lãnh đạo tổ chức -> character.sect và faction.leader.
  + Nhân vật sinh tại địa điểm -> character.birthplace.
  + Vật phẩm có nguồn gốc từ địa điểm -> item.origin.
  + Tổ chức có trụ sở / cai quản địa điểm -> faction.headquarters và location.ruler.
- Các trường liên kết CHỈ điền tên cụ thể (khớp chính xác tên node đã có nếu tồn tại) hoặc chuỗi rỗng "", TUYỆT ĐỐI KHÔNG dùng chữ giữ chỗ như "không rõ", "chưa xác định", "n/a".

3. TRÍCH XUẤT SỰ KIỆN CỦA CHƯƠNG (suggestedEvents) & THAY ĐỔI TRẠNG THÁI (characterStatusChanges):
- Rút ra 1 đến 5 SỰ KIỆN CHÍNH theo đúng trình tự thời gian diễn ra trong chương này để gắn vào Chi tiết chương.
- Mỗi sự kiện phải có đầy đủ các trường chi tiết sau (để lưu thông tin phong phú & tự nối quan hệ đồ thị):
  + Cơ bản & Mạch truyện: "name", "desc", "eventType" (Chiến đấu / Đối thoại / Đàm phán / Tiết lộ bí mật / Du hành / Biến cố / Hy sinh / Giao dịch / Vật phẩm / Hồi tưởng / Khác), "importance" (Nút thắt chính / Bước ngoặt / Gieo mầm / Sự kiện phụ), "arcName", "sequenceOrder" ("1", "2",...).
  + Thời gian & Địa điểm: "time" (Ngày/Tháng/Năm diễn ra sự kiện định dạng DD/MM/YYYY, VD: "${todayStr}", hoặc chuỗi rỗng "" nếu văn bản không đề cập), "location" (tên địa điểm cụ thể để nối EVENT_LOCATION hoặc "").
  + Nhân quả & Mâu thuẫn: "cause" (nguyên nhân hoặc tên chính xác sự kiện trước để nối CAUSED_BY), "conflict", "outcome", "consequences", "impact".
  + Thực thể liên quan: "charactersInvolved" (mảng tên nhân vật tham gia để nối PARTICIPATED_IN), "characterRoles" (vai trò ngắn từng nhân vật), "itemsInvolved" (chỉ liệt kê tên các vật phẩm nhân vật tham gia thực sự mang theo/sử dụng trong sự kiện để hiển thị chuỗi Vật phẩm <--Sở hữu-- Nhân vật --Tham gia--> Sự kiện), "factionsInvolved" (chỉ liệt kê tên các tổ chức liên quan qua nhân vật tham gia để hiển thị chuỗi Tổ chức <--Tổ chức-- Nhân vật --Tham gia--> Sự kiện).
- "characterStatusChanges": CHỈ ghi nhận khi diễn biến hiện tại trong chương thực sự làm nhân vật chuyển sang "Đã chết" hoặc "Hồi sinh" (không ghi vì hồi tưởng hay tin đồn).

DỮ LIỆU ĐỒ THỊ HIỆN TẠI CỦA DỰ ÁN:
[Các chương trước]
${chapterLines.join('\n') || '(Chưa có chương nào)'}

[Niên biểu các sự kiện đã có (sắp xếp theo ngày/tháng/năm)]
${chronologicalTimelineLines.join('\n') || '(Chưa có mốc thời gian nào)'}

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
      "category": "Lỗi thời gian & Niên biểu",
      "title": "<Tiêu đề ngắn gọn của lỗi>",
      "quote": "<Trích dẫn CHÍNH XÁC nguyên văn câu/đoạn ngắn chứa lỗi từ chương gốc để hệ thống có thể thay thế 1-1>",
      "explanation": "<Giải thích rõ vì sao lỗi khi đối chiếu với đồ thị & niên biểu hiện có>",
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
      "age": "",
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
      "eventType": "<Chiến đấu / Đối thoại / Đàm phán / Tiết lộ bí mật / Du hành / Biến cố / Hy sinh / Giao dịch / Vật phẩm / Hồi tưởng / Khác>",
      "importance": "<Nút thắt chính / Bước ngoặt / Gieo mầm / Sự kiện phụ>",
      "arcName": "<Tên cung truyện / Arc hoặc chuỗi rỗng>",
      "sequenceOrder": "<Số thứ tự 1, 2, 3...>",
      "location": "<Tên địa điểm hoặc chuỗi rỗng>",
      "time": "<Ngày/Tháng/Năm diễn ra định dạng DD/MM/YYYY, VD: ${todayStr}>",
      "cause": "<Nguyên nhân hoặc tên sự kiện dẫn tới>",
      "conflict": "<Xung đột chính>",
      "outcome": "<Kết quả trực tiếp>",
      "consequences": "<Hệ quả cụ thể / thay đổi trạng thái>",
      "impact": "<Tác động lâu dài của sự kiện>",
      "charactersInvolved": ["<Tên nhân vật tham gia>"],
      "characterRoles": "<Vai trò nhân vật trong sự kiện>",
      "itemsInvolved": ["<Tên vật phẩm liên quan nếu có>"],
      "factionsInvolved": ["<Tên tổ chức liên quan nếu có>"]
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
          dob: formatDateDDMMYYYY(cleanField(n.dob)),
          age: cleanField(n.age) || calculateAgeFromDob(formatDateDDMMYYYY(cleanField(n.dob))),
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
    const cleanListField = (val) => {
      const arr = Array.isArray(val)
        ? val
        : typeof val === 'string' && val.trim()
          ? val.split(/[,;\n]+/)
          : [];
      return Array.from(
        new Set(
          arr
            .map((item) => cleanField(item))
            .filter(Boolean)
        )
      );
    };

    const rawSuggestedEvents = (
      Array.isArray(parsed.suggestedEvents) ? parsed.suggestedEvents : []
    )
      .filter((ev) => ev && typeof ev === 'object' && String(ev.name || '').trim())
      .map((ev, idx) => ({
        name: String(ev.name).trim(),
        desc: cleanField(ev.desc),
        eventType: cleanField(ev.eventType),
        importance: cleanField(ev.importance),
        arcName: cleanField(ev.arcName),
        sequenceOrder: cleanField(ev.sequenceOrder) || String(idx + 1),
        location: cleanField(ev.location),
        time: formatDateDDMMYYYY(cleanField(ev.time)),
        timelineType: '',
        duration: '',
        cause: cleanField(ev.cause),
        conflict: cleanField(ev.conflict),
        outcome: cleanField(ev.outcome),
        consequences: cleanField(ev.consequences),
        impact: cleanField(ev.impact),
        characterRoles: cleanField(ev.characterRoles),
        itemsInvolved: cleanListField(ev.itemsInvolved),
        factionsInvolved: cleanListField(ev.factionsInvolved),
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
      eventType: ev.eventType || '',
      importance: ev.importance || '',
      arcName: ev.arcName || '',
      sequenceOrder: ev.sequenceOrder || '',
      location: ev.location || '',
      time: formatDateDDMMYYYY(ev.time || ''),
      timelineType: '',
      duration: '',
      cause: ev.cause || '',
      conflict: ev.conflict || '',
      outcome: ev.outcome || '',
      consequences: ev.consequences || '',
      impact: ev.impact || '',
      characterRoles: ev.characterRoles || '',
      itemsInvolved: Array.isArray(ev.itemsInvolved) ? ev.itemsInvolved : [],
      factionsInvolved: Array.isArray(ev.factionsInvolved) ? ev.factionsInvolved : [],
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
