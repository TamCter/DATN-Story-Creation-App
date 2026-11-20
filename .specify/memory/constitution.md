# Story-Create-App Constitution

## Core Principles

### I. Đồ thị Cốt truyện là Nguồn Chân lý Duy nhất (Graph-First Single Source of Truth)
Mọi thực thể trong truyện (`StoryNode` gồm `character`, `item`, `faction`, `event`, `location`),
các chương (`StoryChapter`) và mối liên kết (`StoryLink` / `RELATES_TO`) PHẢI đồng bộ nhất quán
giữa bộ nhớ cục bộ (`projectStore`) và cơ sở dữ liệu đồ thị Neo4j ở Backend. Hệ thống TUYỆT ĐỐI
KHÔNG được tự ý fallback sang dữ liệu của dự án khác khi không tìm thấy dự án hoặc khi mất kết
nối mạng. Khi tạo hoặc cập nhật một sự kiện (`event`), các node địa điểm diễn ra và nhân vật tham
gia PHẢI được tự động liên kết hoặc tự động khởi tạo nếu chưa tồn tại trong dự án.

### II. Cô lập Ngữ cảnh Tài khoản & An toàn Giao dịch (Account Isolation & Transactional Rollback)
Mọi thao tác đọc/ghi dữ liệu trên `projectStore` PHẢI gắn chặt với `AccountContext` (`accountId`,
`version`) của phiên đăng nhập khởi tạo và phải kiểm tra tính hợp lệ trước cũng như sau mỗi lời
gọi bất đồng bộ. Các thao tác biến đổi chương và sự kiện PHẢI được tuần tự hóa qua hàng đợi
(`withSerializedChapterMutations`) và truyền cùng một `AccountContext` xuyên suốt các bước con.
Khi xảy ra lỗi từ Backend trong quá trình cập nhật hoặc xóa chương, hệ thống PHẢI thực hiện
rollback khôi phục toàn bộ trạng thái node/chương về giá trị ban đầu. Dữ liệu mẫu khởi tạo
(`INITIAL_PROJECTS`) PHẢI được sao chép sâu (`cloneSeedProject`) để không làm biến đổi trạng thái
dùng chung giữa các tài khoản.

### III. Thẩm mỹ Cổ phong Tối & Trải nghiệm Mượt mà 60fps (Dark Oriental UI & Smooth UX)
Giao diện người dùng PHẢI duy trì nhất quán phong cách cổ phong/kiếm hiệp nền tối (`#0e0d0b`,
`#12100d`, `#171511`), điểm nhấn vàng kim (`#e5a93c`, `#f3c76f`), viền trầm (`#2b2318`, `#383226`)
và hiển thị hoàn toàn bằng tiếng Việt. Các thành phần điều hướng như thanh bên (`GraphSidebar`)
PHẢI dùng hoạt ảnh trượt mượt (`Animated` với native driver) và không được gây kẹt trạng thái đóng
mở. Các biểu mẫu nhập liệu PHẢI xử lý tránh bàn phím ảo (`KeyboardAvoidingView`) và không để các
nút hành động nổi (FAB) che khuất vùng thao tác của thẻ chi tiết node.

### IV. Tích hợp AI Có Kiểm soát & Chịu lỗi (Resilient & Structured AI Generation)
Mọi tính năng AI (trợ lý tạo thực thể `AIChatPanel`, trình sáng tác chương - sự kiện - truyện
`AIStoryGeneratorModal`) PHẢI chuẩn hóa đầu ra theo cấu trúc JSON hợp lệ trước khi tạo node hoặc
chương trong dự án. Phía Backend (`aiController.js`) PHẢI có cơ chế dự phòng giữa các mô hình AI
(Gemini & provider dự phòng), và phía Frontend PHẢI cung cấp trạng thái tải rõ ràng kèm nút thử
lại (Retry) khi yêu cầu mạng bị hủy hoặc quá thời gian chờ.

### V. An toàn Kiểu dữ liệu & Tương thích Đa nền tảng (Type Safety & Cross-Platform Parity)
Toàn bộ mã nguồn Frontend PHẢI biên dịch thành công qua TypeScript (`tsc --noEmit`) với 0 lỗi và
mã nguồn Backend PHẢI hợp lệ cú pháp Node.js (`node -c`) trước khi hoàn tất bất kỳ tác vụ nào.
Mọi tính năng giao diện PHẢI hoạt động đồng nhất trên cả 3 môi trường của Expo (Android, iOS,
Web), bao gồm việc xử lý hộp thoại xác nhận/thông báo tương thích (`window.alert` / `window.confirm`
trên Web và `Alert.alert` trên thiết bị di động).

## Kiến trúc & Công nghệ (Technology Stack & Constraints)

- **Frontend (`Frontend/`)**: React Native (Expo SDK 58), Expo Router (file-based routing tại
  `Frontend/src/app`), TypeScript, `react-native-webview` (hiển thị đồ thị tương tác),
  `@react-native-async-storage/async-storage` và `expo-secure-store`.
- **Backend (`Backend/`)**: Node.js (>=20.0.0), Express.js, cơ sở dữ liệu đồ thị **Neo4j Aura**
  (`neo4j-driver`), tích hợp AI qua `@google/genai`, xác thực người dùng bằng JWT & `bcryptjs`.
- **Ràng buộc dữ liệu Neo4j**: Các thuộc tính lưu trên `StoryNode` PHẢI nằm trong tập hợp cho phép
  (`ALLOWED_NODE_SCALARS`) và phải được chuẩn hóa về kiểu vô hướng (scalar) trước khi thực thi
  truy vấn Cypher.

## Quy trình Phát triển & Kiểm soát Chất lượng (Development Workflow & Quality Gates)

- **Quy trình Spec-Driven Development với GitHub Spec Kit**:
  1. `/speckit-specify`: Mô tả yêu cầu tính năng để sinh tài liệu đặc tả `specs/<NNN-feature>/spec.md`.
  2. `/speckit-clarify`: Làm rõ các điểm mơ hồ trong đặc tả trước khi thiết kế.
  3. `/speckit-plan`: Lập kế hoạch kỹ thuật và kiến trúc chi tiết (`plan.md`).
  4. `/speckit-tasks`: Tạo danh sách công việc theo thứ tự phụ thuộc (`tasks.md`).
  5. `/speckit-implement`: Thực thi từng bước theo `tasks.md` và đối chiếu với Hiến pháp.
- **Cổng kiểm soát chất lượng (Quality Gates)**:
  - Chạy `node node_modules/typescript/bin/tsc --noEmit` tại thư mục `Frontend/` (bắt buộc 0 lỗi).
  - Kiểm tra cú pháp các file thay đổi tại `Backend/` bằng `node -c <file>`.
  - Kiểm tra bảo toàn dữ liệu đồ thị và cô lập tài khoản trên `projectStore`.

## Governance

Hiến pháp này (`constitution.md`) là tài liệu nguyên tắc cao nhất của dự án `Story-Create-App`.
Mọi bản đặc tả (`spec.md`), kế hoạch (`plan.md`), danh sách tác vụ (`tasks.md`) và mã nguồn triển
khai đều PHẢI tuân thủ các nguyên tắc cốt lõi đã nêu.

Quy trình sửa đổi Hiến pháp:
1. Mọi thay đổi đối với nguyên tắc cốt lõi hoặc quy tắc quản trị PHẢI được ghi nhận qua báo cáo
   Sync Impact Report ở đầu file trước khi rà soát.
2. Phiên bản Hiến pháp (`CONSTITUTION_VERSION`) tuân theo Semantic Versioning:
   - `MAJOR`: Xóa hoặc định nghĩa lại nguyên tắc theo hướng không tương thích ngược.
   - `MINOR`: Bổ sung nguyên tắc mới hoặc mở rộng đáng kể quy định quản trị.
   - `PATCH`: Tinh chỉnh câu chữ, làm rõ nghĩa mà không thay đổi bản chất quy tắc.
3. Cập nhật trường `Last Amended` theo định dạng ISO `YYYY-MM-DD` mỗi khi sửa đổi.

**Version**: 1.0.0 | **Ratified**: 2026-11-18 | **Last Amended**: 2026-11-18
