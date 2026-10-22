const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { testConnection, runQuery } = require('./config/neo4j');
const errorHandler = require('./middlewares/errorHandler');

const authRoutes = require('./routes/authRoutes');
const projectRoutes = require('./routes/projectRoutes');
const nodeRoutes = require('./routes/nodeRoutes');
const linkRoutes = require('./routes/linkRoutes');
const chapterRoutes = require('./routes/chapterRoutes');
const graphRoutes = require('./routes/graphRoutes');
const seedRoutes = require('./routes/seedRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Trang giới thiệu API tổng quan
app.get('/', (req, res) => {
  res.json({
    message: 'Story Creation App - Neo4j Backend API đang hoạt động!',
    version: '1.0.0',
    endpoints: {
      health: 'GET /api/health',
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        guest: 'POST /api/auth/guest',
        me: 'GET /api/auth/me',
      },
      seed: {
        populateData: 'POST /api/seed',
        clearData: 'DELETE /api/seed/clear',
      },
      projects: {
        getAll: 'GET /api/projects',
        getOne: 'GET /api/projects/:id',
        create: 'POST /api/projects',
        update: 'PUT /api/projects/:id',
        delete: 'DELETE /api/projects/:id',
        getGraph: 'GET /api/projects/:projectId/graph',
        getNodes: 'GET /api/projects/:projectId/nodes',
        createNode: 'POST /api/projects/:projectId/nodes',
        getLinks: 'GET /api/projects/:projectId/links',
        getChapters: 'GET /api/projects/:projectId/chapters',
      },
      nodes: {
        getOne: 'GET /api/nodes/:id',
        update: 'PUT /api/nodes/:id',
        delete: 'DELETE /api/nodes/:id',
      },
      links: {
        create: 'POST /api/links',
        getOne: 'GET /api/links/:id',
        update: 'PUT /api/links/:id',
        delete: 'DELETE /api/links/:id',
      },
      chapters: {
        getOne: 'GET /api/chapters/:id',
        update: 'PUT /api/chapters/:id',
        delete: 'DELETE /api/chapters/:id',
      },
      graph: {
        shortestPath: 'GET /api/graph/shortest-path?source=:nodeA&target=:nodeB',
        neighborhood: 'GET /api/graph/nodes/:id/neighborhood?depth=1',
      },
    },
  });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  let neo4jStatus = 'disconnected';

  try {
    const result = await runQuery('RETURN "healthy" AS status', {}, 'READ');
    if (result && result.length) {
      neo4jStatus = 'connected';
    }
  } catch (error) {
    console.error('[Health Check] Kiểm tra kết nối Neo4j thất bại:', error);
  }

  const isConnected = neo4jStatus === 'connected';
  const httpStatus = isConnected ? 200 : 503;

  res.status(httpStatus).json({
    status: isConnected ? 'ok' : 'unhealthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    neo4j: {
      status: neo4jStatus,
    },
  });
});

// Đăng ký các Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/nodes', nodeRoutes);
app.use('/api/links', linkRoutes);
app.use('/api/chapters', chapterRoutes);
app.use('/api/graph', graphRoutes);
app.use('/api/seed', seedRoutes);

// Middleware xử lý 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Không tìm thấy đường dẫn: ${req.method} ${req.originalUrl}`,
  });
});

// Middleware xử lý lỗi tập trung
app.use(errorHandler);

// Khởi chạy server và kiểm tra kết nối Neo4j
app.listen(PORT, async () => {
  console.log(`====================================================`);
  console.log(`🚀 Backend Server đang chạy tại: http://localhost:${PORT}`);
  console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`====================================================`);

  // Kiểm tra kết nối tới Neo4j
  await testConnection();
});