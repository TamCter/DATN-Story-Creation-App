# Story Creation App - Backend (Node.js & Neo4j)

Hệ thống Backend RESTful API được xây dựng cho ứng dụng **Story Creation App** (Sáng tác cốt truyện theo mô hình đồ thị), sử dụng **Node.js (Express)** và cơ sở dữ liệu đồ thị **Neo4j**.

---

## 📁 Cấu trúc thư mục

```
Backend/
├── config/
│   └── neo4j.js              # Khởi tạo driver Neo4j, helper truy vấn Cypher & chuẩn hóa kiểu dữ liệu
├── controllers/
│   ├── projectController.js  # CRUD dự án cốt truyện
│   ├── nodeController.js     # CRUD các nút (Nhân vật, Vật phẩm, Phe phái, Sự kiện, Địa điểm)
│   ├── linkController.js     # CRUD mối quan hệ giữa các nút (RELATES_TO)
│   ├── graphController.js    # Lấy toàn bộ đồ thị, tìm đường đi ngắn nhất (Shortest Path), lân cận (Neighborhood)
│   ├── chapterController.js  # CRUD các chương truyện và sự kiện trong chương
│   └── seedController.js     # Nạp / Xóa dữ liệu mẫu ban đầu (Hoàng Hôn Kiếm Vương)
├── middlewares/
│   └── errorHandler.js       # Xử lý lỗi tập trung và thông báo thân thiện
├── routes/
│   ├── projectRoutes.js      # /api/projects
│   ├── nodeRoutes.js         # /api/nodes
│   ├── linkRoutes.js         # /api/links
│   ├── chapterRoutes.js      # /api/chapters
│   ├── graphRoutes.js        # /api/graph
│   └── seedRoutes.js         # /api/seed
├── .env.example              # Mẫu cấu hình môi trường
├── .env                      # File cấu hình môi trường thực tế
├── index.js                  # Entrypoint khởi chạy Express Server
└── package.json
```

---

## ⚙️ Hướng dẫn cài đặt & Cấu hình Neo4j

### 1. Cấu hình file `.env`

Sao chép `.env.example` thành `.env` (hoặc chỉnh sửa trực tiếp file `.env`):

```env
PORT=5000

# Trường hợp dùng Neo4j Desktop hoặc Docker trên máy (Local):
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
NEO4J_DATABASE=neo4j

# Trường hợp dùng Neo4j AuraDB (Cloud miễn phí):
# NEO4J_URI=neo4j+s://<dbid>.databases.neo4j.io
# NEO4J_USER=neo4j
# NEO4J_PASSWORD=<mat_khau_auradb>
```

> **Mẹo chạy nhanh Neo4j bằng Docker (nếu chưa cài Neo4j Desktop):**
> ```bash
> docker run --name story-neo4j -p 7474:7474 -p 7687:7687 -d -e NEO4J_AUTH=neo4j/password neo4j:latest
> ```
> Giao diện trực quan **Neo4j Browser** sẽ khả dụng tại: `http://localhost:7474`

---

## 🚀 Khởi chạy Server

```bash
cd Backend

# Chế độ phát triển (tự động reload khi sửa code)
npm start
```

Server sẽ chạy tại: `http://localhost:5000`  
Kiểm tra tình trạng kết nối: `http://localhost:5000/api/health`

---

## 📚 Danh sách API (API Reference)

### 1. Dữ liệu mẫu (Seed Data)
| Method | Endpoint | Mô tả |
|---|---|---|
| `POST` | `/api/seed` | **Nạp dữ liệu mẫu ban đầu** ("Hoàng Hôn Kiếm Vương" gồm 11 nút, 14 liên kết, 3 chương) |
| `DELETE` | `/api/seed/clear` | Xóa sạch toàn bộ dữ liệu trong Neo4j |

---

### 2. Quản lý Dự án (Projects)
| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/api/projects` | Lấy danh sách dự án (kèm số lượng nodes, links, chapters) |
| `GET` | `/api/projects/:id` | Lấy chi tiết một dự án |
| `POST` | `/api/projects` | Tạo mới dự án |
| `PUT` | `/api/projects/:id` | Cập nhật thông tin dự án |
| `DELETE` | `/api/projects/:id` | Xóa dự án (tự động xóa toàn bộ nút và liên kết liên quan) |
| `GET` | `/api/projects/:projectId/graph` | **Lấy toàn bộ đồ thị (Nodes + Links + Thống kê)** để vẽ lên Canvas |

**Body mẫu tạo dự án (`POST /api/projects`):**
```json
{
  "id": "project-1",
  "title": "Hoàng Hôn Kiếm Vương",
  "genre": "Kiếm hiệp · Huyền huyễn",
  "number": "№ 01",
  "desc": "Câu chuyện kiếm hiệp đồ thị về mảnh kiếm Hoàng Hôn..."
}
```

---

### 3. Quản lý Nút (Story Nodes)
Các loại nút hỗ trợ: `character` (Nhân vật), `item` (Vật phẩm), `faction` (Phe phái), `event` (Sự kiện), `location` (Địa điểm).

| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/api/projects/:projectId/nodes` | Lấy danh sách nodes trong dự án (hỗ trợ query `?type=character&search=Lăng`) |
| `POST` | `/api/projects/:projectId/nodes` | Tạo node mới gắn vào dự án |
| `GET` | `/api/nodes/:id` | Chi tiết node kèm các liên kết vào/ra và các nút kết nối lân cận |
| `PUT` | `/api/nodes/:id` | Cập nhật thông tin node (tên, mô tả, tọa độ x, y, vai trò...) |
| `DELETE` | `/api/nodes/:id` | Xóa node và tự động ngắt các liên kết dính tới node đó |

**Body mẫu tạo Node (`POST /api/projects/:projectId/nodes`):**
```json
{
  "id": "lang-tieu",
  "name": "Lăng Tiêu",
  "type": "character",
  "role": "NHÂN VẬT CHÍNH",
  "subType": "KIẾM KHÁCH",
  "desc": "Kiếm sĩ lưu vong mang theo chuôi kiếm Hoàng Hôn.",
  "x": 185,
  "y": 355,
  "weapon": "Chuôi Kiếm Hoàng Hôn",
  "sect": "Tự do",
  "personality": "Trầm mặc, kiên định"
}
```

---

### 4. Quản lý Mối quan hệ (Story Links)
Quan hệ được lưu dưới dạng `(source:StoryNode)-[:RELATES_TO]->(target:StoryNode)`.

| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/api/projects/:projectId/links` | Lấy toàn bộ danh sách liên kết trong dự án |
| `POST` | `/api/links` | Tạo mối liên kết giữa 2 nút |
| `GET` | `/api/links/:id` | Lấy chi tiết liên kết |
| `PUT` | `/api/links/:id` | Cập nhật nhãn, kiểu đường (solid/dashed), ghi chú ngữ cảnh |
| `DELETE` | `/api/links/:id` | Xóa liên kết |

**Body mẫu tạo Link (`POST /api/links`):**
```json
{
  "id": "l1",
  "source": "lang-tieu",
  "target": "moc-lan",
  "label": "tin tưởng",
  "type": "dashed",
  "category": "TƯƠNG TRỢ & TÌNH CẢM",
  "contextNote": "Lăng Tiêu tin tưởng Mộc Lan vì được nàng cứu chữa.",
  "tone": "loyalty"
}
```

---

### 5. Quản lý Chương truyện (Chapters)
| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/api/projects/:projectId/chapters` | Danh sách các chương trong dự án |
| `POST` | `/api/projects/:projectId/chapters` | Tạo mới chương truyện |
| `GET` | `/api/chapters/:id` | Lấy chi tiết chương truyện |
| `PUT` | `/api/chapters/:id` | Cập nhật thông tin chương |
| `DELETE` | `/api/chapters/:id` | Xóa chương truyện |

---

### 6. Truy vấn Đồ thị nâng cao (Graph Queries)
| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/api/graph/shortest-path?source=:idA&target=:idB` | **Tìm đường đi ngắn nhất giữa 2 thực thể** trong đồ thị Neo4j |
| `GET` | `/api/graph/nodes/:id/neighborhood?depth=1` | Lấy các nút và mối quan hệ lân cận trong bán kính bước nhảy (depth 1 hoặc 2) |
