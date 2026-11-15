export interface GenerateGraphHtmlOptions {
  nodes: any[];
  edges?: any[];
  links?: any[];
  selectedNodeId?: string | null;
  activeFilter?: string | null;
  backgroundColor?: string;
}

export function generateGraphHtml(options: GenerateGraphHtmlOptions): string {
  const {
    nodes = [],
    edges = [],
    links = [],
    selectedNodeId = null,
    activeFilter = null,
    backgroundColor = '#12100d',
  } = options;

  // Hỗ trợ cả hai tên gọi edges hoặc links
  const graphEdges = (Array.isArray(edges) && edges.length > 0)
    ? edges
    : (Array.isArray(links) && links.length > 0 ? links : []);

  const serializeInlineScriptValue = (value: unknown) => JSON.stringify(value)
    .replace(/</g, '\\u003C')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/<\/script>/gi, '<\\/script>');

  const serializedNodes = serializeInlineScriptValue(nodes);
  const serializedEdges = serializeInlineScriptValue(graphEdges);
  const serializedSelectedId = serializeInlineScriptValue(selectedNodeId || null);
  const serializedFilter = serializeInlineScriptValue(activeFilter || null);

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=no" />
  <title>Sơ đồ Thực Thể</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
    }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: ${backgroundColor};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Serif", serif, sans-serif;
    }
    #canvasWrapper {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    canvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      touch-action: none;
      display: block;
    }
  </style>
</head>
<body>
  <div id="canvasWrapper">
    <canvas id="graphCanvas"></canvas>
  </div>

  <script>
    (function() {
      // 1. Initial State
      var initialNodes = ${serializedNodes};
      var initialEdges = ${serializedEdges};
      var selectedId = ${serializedSelectedId};
      var currentFilter = ${serializedFilter};

      var canvas = document.getElementById('graphCanvas');
      var ctx = canvas.getContext('2d');
      var dpr = window.devicePixelRatio || 1;

      var width = 0;
      var height = 0;

      // Color & Shape config matching app oriental theme
      var TYPE_CONFIG = {
        character: {
          color: '#e5a93c',
          glow: 'rgba(229, 169, 60, 0.45)',
          name: 'Nhân vật',
          shape: 'circle',
          radius: 20
        },
        item: {
          color: '#42b883',
          glow: 'rgba(66, 184, 131, 0.45)',
          name: 'Vật phẩm',
          shape: 'diamond',
          radius: 19
        },
        faction: {
          color: '#d95a38',
          glow: 'rgba(217, 90, 56, 0.45)',
          name: 'Phe phái',
          shape: 'hexagon',
          radius: 21
        },
        event: {
          color: '#9b59b6',
          glow: 'rgba(155, 89, 182, 0.45)',
          name: 'Sự kiện',
          shape: 'square',
          radius: 19
        },
        location: {
          color: '#2ecc71',
          glow: 'rgba(46, 204, 113, 0.45)',
          name: 'Địa điểm',
          shape: 'triangle',
          radius: 21
        }
      };

      // Camera view state (pan & zoom)
      var camera = {
        x: 0,
        y: 0,
        zoom: 1.0,
        minZoom: 0.4,
        maxZoom: 3.0
      };

      var nodes = [];
      var edges = [];
      var nodeMap = {};
      var isPhysicsActive = true;
      var energy = 1.0;

      // Interaction tracking
      var isDraggingNode = false;
      var isPanning = false;
      var draggedNode = null;
      var hasPointerMoved = false;
      var startPointer = { x: 0, y: 0 };
      var lastPointer = { x: 0, y: 0 };
      var initialPinchDistance = null;
      var initialPinchZoom = 1.0;

      // Communication with React Native
      function sendToApp(payload) {
        var message = JSON.stringify(payload);
        try {
          if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
            window.ReactNativeWebView.postMessage(message);
          } else if (window.parent && window.parent !== window) {
            window.parent.postMessage(message, '*');
          }
        } catch (e) {
          console.error('[WebView] Send error:', e);
        }
      }

      function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
      }

      // Initialize Node positions
      function initNodes(rawNodes) {
        var count = rawNodes.length;
        var cx = width / 2;
        var cy = height / 2;
        var radius = Math.min(width, height) * 0.35;
        var priorNodeMap = Object.assign({}, nodeMap);

        nodes = rawNodes.map(function(n, index) {
          var existingNode = priorNodeMap[String(n.id)];
          var hasValidCoords = typeof n.x === 'number' && typeof n.y === 'number' && (n.x !== 0 || n.y !== 0);
          var angle = (index / (count || 1)) * 2 * Math.PI;
          var initX = hasValidCoords ? n.x : cx + radius * Math.cos(angle);
          var initY = hasValidCoords ? n.y : cy + radius * Math.sin(angle);
          var rebuiltNode = {
            id: String(n.id),
            name: n.name || 'Thực thể',
            type: n.type || 'character',
            role: n.role || '',
            desc: n.desc || '',
            status: n.status || '',
            x: existingNode ? existingNode.x : initX,
            y: existingNode ? existingNode.y : initY,
            vx: existingNode ? (typeof existingNode.vx === 'number' ? existingNode.vx : 0) : 0,
            vy: existingNode ? (typeof existingNode.vy === 'number' ? existingNode.vy : 0) : 0,
            raw: n
          };

          if (draggedNode && String(draggedNode.id) === String(n.id)) {
            draggedNode = rebuiltNode;
          }

          return rebuiltNode;
        });

        nodeMap = {};
        for (var i = 0; i < nodes.length; i++) {
          nodeMap[nodes[i].id] = nodes[i];
        }
      }

      function initEdges(rawEdges) {
        edges = (rawEdges || []).map(function(e) {
          return {
            id: String(e.id || (e.source + '->' + e.target)),
            source: String(e.source),
            target: String(e.target),
            label: e.label || '',
            type: e.type || 'solid'
          };
        });
      }

      // Physics Simulation Step
      function updatePhysics() {
        if (energy < 0.005) {
          isPhysicsActive = false;
          return;
        }

        var count = nodes.length;
        if (count === 0) return;

        // 1. Repulsion between node pairs
        for (var i = 0; i < count; i++) {
          var a = nodes[i];
          for (var j = i + 1; j < count; j++) {
            var b = nodes[j];
            var dx = b.x - a.x;
            var dy = b.y - a.y;
            var distSq = dx * dx + dy * dy || 1;
            var dist = Math.sqrt(distSq);
            var minSpace = 110;

            if (dist < minSpace * 2.8) {
              var force = (minSpace * minSpace) / (distSq * 0.75 + 80);
              var fx = (dx / dist) * force;
              var fy = (dy / dist) * force;
              if (a !== draggedNode) {
                a.vx -= fx;
                a.vy -= fy;
              }
              if (b !== draggedNode) {
                b.vx += fx;
                b.vy += fy;
              }
            }
          }
        }

        // 2. Spring attraction along edges
        for (var k = 0; k < edges.length; k++) {
          var edge = edges[k];
          var srcNode = nodeMap[edge.source];
          var tgtNode = nodeMap[edge.target];
          if (!srcNode || !tgtNode) continue;

          var ex = tgtNode.x - srcNode.x;
          var ey = tgtNode.y - srcNode.y;
          var eDist = Math.sqrt(ex * ex + ey * ey) || 1;
          var targetDist = 130;
          var spring = (eDist - targetDist) * 0.035;
          var sfx = (ex / eDist) * spring;
          var sfy = (ey / eDist) * spring;

          if (srcNode !== draggedNode) {
            srcNode.vx += sfx;
            srcNode.vy += sfy;
          }
          if (tgtNode !== draggedNode) {
            tgtNode.vx -= sfx;
            tgtNode.vy -= sfy;
          }
        }

        // 3. Center gravity & dampening
        var cx = width / 2;
        var cy = height / 2;
        var totalMove = 0;

        for (var m = 0; m < count; m++) {
          var node = nodes[m];
          if (node === draggedNode) continue;

          var gdx = cx - node.x;
          var gdy = cy - node.y;
          node.vx += gdx * 0.002;
          node.vy += gdy * 0.002;

          node.vx *= 0.82;
          node.vy *= 0.82;

          node.x += node.vx;
          node.y += node.vy;

          totalMove += Math.abs(node.vx) + Math.abs(node.vy);
        }

        energy = totalMove / (count || 1);
      }

      function wakePhysics() {
        energy = 0.5;
        isPhysicsActive = true;
      }

      function focusRelation(sourceId, targetId) {
        var source = nodeMap[String(sourceId)];
        var target = nodeMap[String(targetId)];
        if (!source || !target) return;

        var spacing = Math.max(72, Math.min(width * 0.22, 120));
        source.x = width / 2 - spacing;
        source.y = height / 2;
        source.vx = 0;
        source.vy = 0;
        target.x = width / 2 + spacing;
        target.y = height / 2;
        target.vx = 0;
        target.vy = 0;
        selectedId = String(sourceId);
        camera.x = 0;
        camera.y = 0;
        camera.zoom = 1;
        energy = 0;
        isPhysicsActive = false;
      }

      // Convert Screen coordinates to World coordinates
      function screenToWorld(sx, sy) {
        return {
          x: (sx - width / 2) / camera.zoom + width / 2 - camera.x,
          y: (sy - height / 2) / camera.zoom + height / 2 - camera.y
        };
      }

      // Convert World coordinates to Screen coordinates
      function worldToScreen(wx, wy) {
        return {
          x: (wx - width / 2 + camera.x) * camera.zoom + width / 2,
          y: (wy - height / 2 + camera.y) * camera.zoom + height / 2
        };
      }

      // Find node under pointer
      function getNodeAt(screenX, screenY) {
        var world = screenToWorld(screenX, screenY);
        for (var i = nodes.length - 1; i >= 0; i--) {
          var n = nodes[i];
          if (currentFilter && n.type !== currentFilter) continue;
          var cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.character;
          var hitRadius = Math.max(cfg.radius, 28);
          var dist = Math.hypot(world.x - n.x, world.y - n.y);
          if (dist <= hitRadius) {
            return n;
          }
        }
        return null;
      }

      // Drawing Helpers
      function drawShape(type, x, y, radius, color, isSelected) {
        ctx.beginPath();
        if (type === 'circle') {
          ctx.arc(x, y, radius, 0, Math.PI * 2);
        } else if (type === 'diamond') {
          ctx.moveTo(x, y - radius * 1.15);
          ctx.lineTo(x + radius * 1.15, y);
          ctx.lineTo(x, y + radius * 1.15);
          ctx.lineTo(x - radius * 1.15, y);
          ctx.closePath();
        } else if (type === 'hexagon') {
          for (var i = 0; i < 6; i++) {
            var a = (i * Math.PI) / 3 - Math.PI / 6;
            var px = x + radius * 1.15 * Math.cos(a);
            var py = y + radius * 1.15 * Math.sin(a);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
        } else if (type === 'square') {
          var s = radius * 1.8;
          var half = s / 2;
          ctx.rect(x - half, y - half, s, s);
        } else if (type === 'triangle') {
          ctx.moveTo(x, y - radius * 1.25);
          ctx.lineTo(x + radius * 1.15, y + radius * 0.85);
          ctx.lineTo(x - radius * 1.15, y + radius * 0.85);
          ctx.closePath();
        }

        // Fill background
        ctx.fillStyle = '#171410';
        ctx.fill();

        // Stroke border
        ctx.lineWidth = isSelected ? 3.5 : 2;
        ctx.strokeStyle = color;
        ctx.stroke();

        // Inner glowing core
        ctx.beginPath();
        ctx.arc(x, y, isSelected ? 6.5 : 4.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }

      // Main Render Loop
      function render() {
        ctx.clearRect(0, 0, width, height);

        // 1. Draw subtle background dot grid
        var gridSize = 24 * camera.zoom;
        var startX = ((camera.x * camera.zoom + width / 2) % gridSize) - gridSize;
        var startY = ((camera.y * camera.zoom + height / 2) % gridSize) - gridSize;

        ctx.fillStyle = 'rgba(70, 60, 48, 0.4)';
        for (var gx = startX; gx < width + gridSize; gx += gridSize) {
          for (var gy = startY; gy < height + gridSize; gy += gridSize) {
            ctx.fillRect(gx - 0.75, gy - 0.75, 1.5, 1.5);
          }
        }

        // Active node neighbors set
        var connectedSet = new Set();
        if (selectedId) {
          connectedSet.add(selectedId);
          for (var eIdx = 0; eIdx < edges.length; eIdx++) {
            var e = edges[eIdx];
            if (e.source === selectedId) connectedSet.add(e.target);
            if (e.target === selectedId) connectedSet.add(e.source);
          }
        }

        // 2. Render Edges
        for (var i = 0; i < edges.length; i++) {
          var edge = edges[i];
          var src = nodeMap[edge.source];
          var tgt = nodeMap[edge.target];
          if (!src || !tgt) continue;

          // Filter check
          if (currentFilter && (src.type !== currentFilter && tgt.type !== currentFilter)) {
            continue;
          }

          var isEdgeConnected = selectedId && (edge.source === selectedId || edge.target === selectedId);
          var isDimmed = selectedId && !isEdgeConnected;

          var p1 = worldToScreen(src.x, src.y);
          var p2 = worldToScreen(tgt.x, tgt.y);

          ctx.save();
          ctx.globalAlpha = isDimmed ? 0.12 : 1.0;

          // Line stroke
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = isEdgeConnected ? '#f0b84c' : 'rgba(229, 169, 60, 0.35)';
          ctx.lineWidth = isEdgeConnected ? 2.2 : 1.2;

          if (edge.type === 'dashed' || !isEdgeConnected) {
            ctx.setLineDash([4 * camera.zoom, 4 * camera.zoom]);
          } else {
            ctx.setLineDash([]);
          }
          ctx.stroke();
          ctx.setLineDash([]);

          // Arrow at target node
          var angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          var tgtCfg = TYPE_CONFIG[tgt.type] || TYPE_CONFIG.character;
          var tgtRadius = tgtCfg.radius * camera.zoom + 4;
          var arrowX = p2.x - tgtRadius * Math.cos(angle);
          var arrowY = p2.y - tgtRadius * Math.sin(angle);
          var arrowLen = Math.max(6 * camera.zoom, 7);

          ctx.beginPath();
          ctx.moveTo(arrowX, arrowY);
          ctx.lineTo(
            arrowX - arrowLen * Math.cos(angle - Math.PI / 6),
            arrowY - arrowLen * Math.sin(angle - Math.PI / 6)
          );
          ctx.lineTo(
            arrowX - arrowLen * Math.cos(angle + Math.PI / 6),
            arrowY - arrowLen * Math.sin(angle + Math.PI / 6)
          );
          ctx.closePath();
          ctx.fillStyle = isEdgeConnected ? '#f0b84c' : 'rgba(229, 169, 60, 0.6)';
          ctx.fill();

          // Label text on edge midpoint
          if (edge.label && (isEdgeConnected || camera.zoom >= 0.95)) {
            var midX = (p1.x + p2.x) / 2;
            var midY = (p1.y + p2.y) / 2;
            var labelText = edge.label;
            var fontSize = Math.max(9, Math.min(12, 10.5 * camera.zoom));
            ctx.font = 'italic 500 ' + fontSize + 'px "Noto Serif", Georgia, serif';
            var textMetrics = ctx.measureText(labelText);
            var textWidth = textMetrics.width;

            // Background pill for label
            ctx.fillStyle = 'rgba(18, 16, 13, 0.88)';
            ctx.fillRect(midX - textWidth / 2 - 5, midY - fontSize * 0.75, textWidth + 10, fontSize * 1.5);

            ctx.fillStyle = isEdgeConnected ? '#f3c76f' : 'rgba(229, 169, 60, 0.75)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(labelText, midX, midY);
          }

          ctx.restore();
        }

        // 3. Render Nodes
        for (var j = 0; j < nodes.length; j++) {
          var node = nodes[j];
          var cfg = TYPE_CONFIG[node.type] || TYPE_CONFIG.character;
          var isNodeSelected = selectedId === node.id;
          var isNodeDimmed = selectedId && !connectedSet.has(node.id);

          if (currentFilter && node.type !== currentFilter) {
            continue;
          }

          var pos = worldToScreen(node.x, node.y);
          var r = cfg.radius * camera.zoom;

          ctx.save();
          ctx.globalAlpha = isNodeDimmed ? 0.22 : 1.0;

          // Outer selection glow
          if (isNodeSelected) {
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, r + 9 * camera.zoom, 0, Math.PI * 2);
            ctx.fillStyle = cfg.glow;
            ctx.fill();

            // Outer dashed ring
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, r + 6 * camera.zoom, 0, Math.PI * 2);
            ctx.strokeStyle = cfg.color;
            ctx.lineWidth = 1.2;
            ctx.setLineDash([3, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          // Draw main shape
          drawShape(cfg.shape, pos.x, pos.y, r, cfg.color, isNodeSelected);

          // Node Label
          var lblFontSize = Math.max(10, Math.min(14, 11.5 * camera.zoom));
          ctx.font = (isNodeSelected ? 'bold ' : '500 ') + lblFontSize + 'px "Noto Serif", Georgia, serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';

          // Text pill background
          var nameWidth = ctx.measureText(node.name).width;
          var pillY = pos.y + r + 6 * camera.zoom;
          ctx.fillStyle = 'rgba(18, 16, 13, 0.85)';
          ctx.fillRect(pos.x - nameWidth / 2 - 4, pillY - 2, nameWidth + 8, lblFontSize + 4);

          ctx.fillStyle = isNodeSelected ? '#f5d179' : '#e0d8cc';
          ctx.fillText(node.name, pos.x, pillY);

          ctx.restore();
        }

        // 4. Empty State if no nodes exist
        if (nodes.length === 0) {
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#6e6150';
          ctx.font = '28px serif';
          ctx.fillText('◈', width / 2, height / 2 - 20);
          ctx.font = '14px "Noto Serif", serif';
          ctx.fillStyle = '#a89c8a';
          ctx.fillText('Chưa có thực thể nào trong đồ thị', width / 2, height / 2 + 18);
          ctx.restore();
        }
      }

      // Main Animation Frame
      function tick() {
        if (isPhysicsActive) {
          updatePhysics();
        }
        render();
        requestAnimationFrame(tick);
      }

      // Pointer / Touch Gestures
      function getTouchDistance(t1, t2) {
        return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      }

      function handlePointerDown(e) {
        var clientX = e.clientX || (e.touches && e.touches[0].clientX);
        var clientY = e.clientY || (e.touches && e.touches[0].clientY);

        if (e.touches && e.touches.length === 2) {
          initialPinchDistance = getTouchDistance(e.touches[0], e.touches[1]);
          initialPinchZoom = camera.zoom;
          hasPointerMoved = true;
          return;
        }

        hasPointerMoved = false;
        startPointer = { x: clientX, y: clientY };
        lastPointer = { x: clientX, y: clientY };

        var hitNode = getNodeAt(clientX, clientY);
        if (hitNode) {
          isDraggingNode = true;
          draggedNode = hitNode;
          wakePhysics();
        } else {
          isPanning = true;
        }
      }

      function handlePointerMove(e) {
        if (e.touches && e.touches.length === 2) {
          if (initialPinchDistance) {
            var newDist = getTouchDistance(e.touches[0], e.touches[1]);
            var scale = newDist / initialPinchDistance;
            camera.zoom = Math.max(camera.minZoom, Math.min(camera.maxZoom, initialPinchZoom * scale));
          }
          return;
        }

        var clientX = e.clientX || (e.touches && e.touches[0].clientX);
        var clientY = e.clientY || (e.touches && e.touches[0].clientY);

        var dx = clientX - lastPointer.x;
        var dy = clientY - lastPointer.y;
        var totalDist = Math.hypot(clientX - startPointer.x, clientY - startPointer.y);

        if (totalDist > 5) {
          hasPointerMoved = true;
        }

        if (isDraggingNode && draggedNode) {
          var worldPos = screenToWorld(clientX, clientY);
          draggedNode.x = worldPos.x;
          draggedNode.y = worldPos.y;
          draggedNode.vx = 0;
          draggedNode.vy = 0;
          wakePhysics();
        } else if (isPanning) {
          camera.x += dx / camera.zoom;
          camera.y += dy / camera.zoom;
        }

        lastPointer = { x: clientX, y: clientY };
      }

      function handlePointerUp(e) {
        if (e.touches && e.touches.length > 0) return;

        if (!hasPointerMoved) {
          // It was a TAP!
          if (draggedNode) {
            selectedId = draggedNode.id;
            sendToApp({
              type: 'NODE_CLICK',
              nodeId: draggedNode.id,
              node: draggedNode.raw || draggedNode
            });
          } else {
            // Tap on background
            selectedId = null;
            sendToApp({ type: 'CANVAS_CLICK' });
          }
        }

        isDraggingNode = false;
        draggedNode = null;
        isPanning = false;
        initialPinchDistance = null;
      }

      // Wheel Zoom (Web & Mouse)
      canvas.addEventListener('wheel', function(e) {
        e.preventDefault();
        var zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
        camera.zoom = Math.max(camera.minZoom, Math.min(camera.maxZoom, camera.zoom * zoomFactor));
      }, { passive: false });

      // Double Click / Double Tap to reset
      var lastTapTime = 0;
      function handleDoubleTap(e) {
        if (e && e.touches && e.touches.length !== 1) return;

        var now = Date.now();
        if (now - lastTapTime < 300) {
          camera.x = 0;
          camera.y = 0;
          camera.zoom = 1.0;
        }
        lastTapTime = now;
      }

      // Attach event listeners
      canvas.addEventListener('mousedown', handlePointerDown);
      canvas.addEventListener('dblclick', function(e) {
        handleDoubleTap({ clientX: e.clientX, clientY: e.clientY });
      });
      window.addEventListener('mousemove', handlePointerMove);
      window.addEventListener('mouseup', handlePointerUp);

      canvas.addEventListener('touchstart', function(e) {
        handleDoubleTap(e);
        handlePointerDown(e);
      }, { passive: true });
      window.addEventListener('touchmove', handlePointerMove, { passive: true });
      window.addEventListener('touchend', handlePointerUp, { passive: true });

      // Handle incoming messages from React Native / Parent
      function handleIncomingMessage(event) {
        try {
          var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          if (!data || !data.type) return;

          switch (data.type) {
            case 'REQUEST_READY':
              sendToApp({ type: 'READY' });
              break;
            case 'SELECT_NODE':
              selectedId = data.nodeId || null;
              break;
            case 'SET_FILTER':
              currentFilter = data.filter || null;
              break;
            case 'ZOOM_IN':
              camera.zoom = Math.min(camera.maxZoom, camera.zoom * 1.2);
              break;
            case 'ZOOM_OUT':
              camera.zoom = Math.max(camera.minZoom, camera.zoom * 0.83);
              break;
            case 'RESET_VIEW':
              camera.x = 0;
              camera.y = 0;
              camera.zoom = 1.0;
              break;
            case 'FOCUS_RELATION':
              focusRelation(data.sourceId, data.targetId);
              break;
            case 'UPDATE_DATA':
              if (data.nodes) initNodes(data.nodes);
              if (data.edges || data.links) initEdges(data.edges || data.links);
              wakePhysics();
              break;
          }
        } catch (err) {}
      }

      window.addEventListener('message', handleIncomingMessage);
      document.addEventListener('message', handleIncomingMessage);
      sendToApp({ type: 'READY' });

      // Start
      window.addEventListener('resize', resize);
      resize();
      initNodes(initialNodes);
      initEdges(initialEdges);
      wakePhysics();
      requestAnimationFrame(tick);
    })();
  </script>
</body>
</html>`;
}
