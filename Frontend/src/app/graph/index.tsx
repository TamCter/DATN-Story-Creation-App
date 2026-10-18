import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, {
  Circle,
  G,
  Line,
  Polygon,
  Rect,
  Text as SvgText,
} from 'react-native-svg';

import {
  INITIAL_PROJECTS,
  NODE_TYPE_CONFIG,
  StoryNode,
} from '@/constants/story-data';
import { AppFonts, ThemeColors } from '@/constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function GraphScreen() {
  const params = useLocalSearchParams();
  const projectId = (params.projectId as string) || 'project-1';

  const currentProject = useMemo(() => {
    return (
      INITIAL_PROJECTS.find((p) => p.id === projectId) || INITIAL_PROJECTS[0]
    );
  }, [projectId]);

  const [nodes, setNodes] = useState<StoryNode[]>(currentProject.nodes);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    'trieu-vo-cuc'
  );
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [addModalOpen, setAddModalOpen] = useState<boolean>(false);
  const [detailModalOpen, setDetailModalOpen] = useState<boolean>(false);

  // New Node Form State
  const [newNodeName, setNewNodeName] = useState('');
  const [newNodeType, setNewNodeType] = useState<StoryNode['type']>('character');
  const [newNodeRole, setNewNodeRole] = useState('CHÍNH DIỆN');
  const [newNodeDesc, setNewNodeDesc] = useState('');

  const selectedNode = useMemo(() => {
    return nodes.find((n) => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  // Determine connected links for selected node
  const connectedLinks = useMemo(() => {
    if (!selectedNodeId) return [];
    return currentProject.links.filter(
      (link) => link.source === selectedNodeId || link.target === selectedNodeId
    );
  }, [currentProject.links, selectedNodeId]);

  const connectedNodeIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    const ids = new Set<string>([selectedNodeId]);
    connectedLinks.forEach((l) => {
      ids.add(l.source);
      ids.add(l.target);
    });
    return ids;
  }, [connectedLinks, selectedNodeId]);

  const filteredNodes = useMemo(() => {
    if (!activeFilter) return nodes;
    return nodes.filter((n) => n.type === activeFilter);
  }, [nodes, activeFilter]);

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 0.15, 1.8));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - 0.15, 0.7));
  };

  const handleSelectNode = (id: string) => {
    setSelectedNodeId(id);
  };

  const handleCloseDetail = () => {
    setSelectedNodeId(null);
  };

  const handleAddNode = () => {
    if (!newNodeName.trim()) return;
    const newNode: StoryNode = {
      id: `node-${Date.now()}`,
      name: newNodeName.trim(),
      type: newNodeType,
      role: newNodeRole,
      desc: newNodeDesc.trim() || 'Chưa có thông tin mô tả chi tiết.',
      x: 180 + (Math.random() * 80 - 40),
      y: 350 + (Math.random() * 80 - 40),
    };
    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
    setAddModalOpen(false);
    setNewNodeName('');
    setNewNodeDesc('');
  };

  // Render Node Icon based on Type
  const renderNodeShape = (node: StoryNode, isSelected: boolean) => {
    const isConnected = connectedNodeIds.has(node.id);
    const opacity = selectedNodeId && !isConnected ? 0.25 : 1;
    const color = NODE_TYPE_CONFIG[node.type].color;

    if (node.type === 'character') {
      return (
        <G opacity={opacity}>
          {/* Selected outer radiating dashed aura */}
          {isSelected && (
            <>
              <Circle
                cx={node.x}
                cy={node.y}
                r={24}
                stroke={color}
                strokeWidth={1.2}
                strokeDasharray="3,3"
                fill="none"
              />
              <Circle
                cx={node.x}
                cy={node.y}
                r={20}
                stroke="rgba(229, 169, 60, 0.2)"
                strokeWidth={6}
                fill="none"
              />
            </>
          )}
          {/* Main concentric rings */}
          <Circle
            cx={node.x}
            cy={node.y}
            r={13}
            stroke={color}
            strokeWidth={2}
            fill="#12100d"
          />
          <Circle cx={node.x} cy={node.y} r={5} fill={color} />
        </G>
      );
    }

    if (node.type === 'faction') {
      // Hexagon shape
      const r = 14;
      const points = [
        `${node.x},${node.y - r}`,
        `${node.x + r * 0.866},${node.y - r * 0.5}`,
        `${node.x + r * 0.866},${node.y + r * 0.5}`,
        `${node.x},${node.y + r}`,
        `${node.x - r * 0.866},${node.y + r * 0.5}`,
        `${node.x - r * 0.866},${node.y - r * 0.5}`,
      ].join(' ');

      const innerPoints = [
        `${node.x},${node.y - r * 0.55}`,
        `${node.x + r * 0.48},${node.y - r * 0.28}`,
        `${node.x + r * 0.48},${node.y + r * 0.28}`,
        `${node.x},${node.y + r * 0.55}`,
        `${node.x - r * 0.48},${node.y + r * 0.28}`,
        `${node.x - r * 0.48},${node.y - r * 0.28}`,
      ].join(' ');

      return (
        <G opacity={opacity}>
          {isSelected && (
            <Polygon
              points={points}
              stroke={color}
              strokeWidth={4}
              strokeOpacity={0.3}
              fill="none"
            />
          )}
          <Polygon
            points={points}
            stroke={color}
            strokeWidth={2}
            fill="#12100d"
          />
          <Polygon points={innerPoints} fill={color} />
        </G>
      );
    }

    if (node.type === 'event') {
      // Double nested square
      const size = 12;
      return (
        <G opacity={opacity}>
          {isSelected && (
            <Rect
              x={node.x - size - 4}
              y={node.y - size - 4}
              width={(size + 4) * 2}
              height={(size + 4) * 2}
              stroke={color}
              strokeWidth={1}
              strokeDasharray="2,2"
              fill="none"
            />
          )}
          <Rect
            x={node.x - size}
            y={node.y - size}
            width={size * 2}
            height={size * 2}
            stroke={color}
            strokeWidth={2}
            fill="#12100d"
          />
          <Rect
            x={node.x - 5}
            y={node.y - 5}
            width={10}
            height={10}
            fill={color}
          />
        </G>
      );
    }

    if (node.type === 'item') {
      // Diamond shape (rotated square)
      const r = 13;
      const points = `${node.x},${node.y - r} ${node.x + r},${node.y} ${node.x},${node.y + r} ${node.x - r},${node.y}`;
      const innerPoints = `${node.x},${node.y - 6} ${node.x + 6},${node.y} ${node.x},${node.y + 6} ${node.x - 6},${node.y}`;
      return (
        <G opacity={opacity}>
          {isSelected && (
            <Polygon
              points={points}
              stroke={color}
              strokeWidth={4}
              strokeOpacity={0.3}
              fill="none"
            />
          )}
          <Polygon
            points={points}
            stroke={color}
            strokeWidth={2}
            fill="#12100d"
          />
          <Polygon points={innerPoints} fill={color} />
        </G>
      );
    }

    // Location (Triangle)
    const r = 14;
    const points = `${node.x},${node.y - r} ${node.x + r * 0.866},${node.y + r * 0.7} ${node.x - r * 0.866},${node.y + r * 0.7}`;
    const innerPoints = `${node.x},${node.y - 5} ${node.x + 5 * 0.866},${node.y + 4} ${node.x - 5 * 0.866},${node.y + 4}`;
    return (
      <G opacity={opacity}>
        {isSelected && (
          <Polygon
            points={points}
            stroke={color}
            strokeWidth={4}
            strokeOpacity={0.3}
            fill="none"
          />
        )}
        <Polygon
          points={points}
          stroke={color}
          strokeWidth={2}
          fill="#12100d"
        />
        <Polygon points={innerPoints} fill={color} />
      </G>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header Bar */}
      <View style={styles.topBar}>
        <Pressable
          style={styles.menuBtn}
          onPress={() => setDrawerOpen(true)}>
          <View style={styles.menuIconBar} />
          <View style={[styles.menuIconBar, { width: 14 }]} />
          <View style={styles.menuIconBar} />
        </Pressable>

        <View style={styles.topBarTitleCenter}>
          <Text style={styles.topBarTitle}>{currentProject.title}</Text>
          <Text style={styles.topBarSub}>
            {nodes.length} NODE · {currentProject.links.length} LIÊN KẾT
          </Text>
        </View>

        <Pressable
          style={styles.addNodeBtn}
          onPress={() => setAddModalOpen(true)}>
          <Text style={styles.addNodeBtnText}>+</Text>
        </Pressable>
      </View>

      {/* Filter Chips Bar */}
      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}>
          {(
            [
              { type: 'character', label: 'Nhân vật', symbol: '●' },
              { type: 'item', label: 'Vật phẩm', symbol: '◆' },
              { type: 'faction', label: 'Phe phái', symbol: '⬡' },
              { type: 'event', label: 'Sự kiện', symbol: '■' },
              { type: 'location', label: 'Địa điểm', symbol: '▲' },
            ] as const
          ).map((item) => {
            const isActive = activeFilter === item.type;
            const itemColor = NODE_TYPE_CONFIG[item.type].color;
            return (
              <Pressable
                key={item.type}
                style={[
                  styles.filterChip,
                  isActive && {
                    borderColor: itemColor,
                    backgroundColor: 'rgba(229,169,60,0.12)',
                  },
                ]}
                onPress={() =>
                  setActiveFilter(isActive ? null : item.type)
                }>
                <Text style={[styles.filterChipSymbol, { color: itemColor }]}>
                  {item.symbol}
                </Text>
                <Text
                  style={[
                    styles.filterChipText,
                    isActive && { color: itemColor },
                  ]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Canvas Area */}
      <View style={styles.canvasContainer}>
        {/* Floating Controls */}
        <View style={styles.floatingTopLeft} pointerEvents="none">
          <Text style={styles.panHintText}>KÉO ĐỂ DI CHUYỂN</Text>
        </View>

        <View style={styles.zoomControls}>
          <Pressable style={styles.zoomBtn} onPress={handleZoomIn}>
            <Text style={styles.zoomBtnText}>+</Text>
          </Pressable>
          <Pressable style={styles.zoomBtn} onPress={handleZoomOut}>
            <Text style={styles.zoomBtnText}>−</Text>
          </Pressable>
        </View>

        {/* Interactive Graph SVG Canvas */}
        <View
          style={[
            styles.svgWrapper,
            {
              transform: [{ scale: zoomLevel }],
            },
          ]}>
          <Svg
            width={SCREEN_WIDTH}
            height={SCREEN_HEIGHT * 0.72}
            viewBox="0 0 380 720">
            {/* Dot Grid Background */}
            <G opacity={0.25}>
              {Array.from({ length: 19 }).map((_, col) =>
                Array.from({ length: 34 }).map((__, row) => (
                  <Circle
                    key={`dot-${col}-${row}`}
                    cx={col * 20 + 10}
                    cy={row * 20 + 10}
                    r={0.8}
                    fill="#e5a93c"
                  />
                ))
              )}
            </G>

            {/* Connecting Links / Edges */}
            {currentProject.links.map((link) => {
              const src = nodes.find((n) => n.id === link.source);
              const tgt = nodes.find((n) => n.id === link.target);
              if (!src || !tgt) return null;

              const isHighlighted =
                selectedNodeId &&
                (link.source === selectedNodeId ||
                  link.target === selectedNodeId);

              const isDimmed =
                selectedNodeId && !isHighlighted;

              const strokeColor = isHighlighted
                ? '#f0b84c'
                : 'rgba(229, 169, 60, 0.28)';
              const strokeW = isHighlighted ? 1.6 : 1;
              const strokeDash =
                link.type === 'dashed' || !isHighlighted ? '4,4' : undefined;

              const midX = (src.x + tgt.x) / 2;
              const midY = (src.y + tgt.y) / 2;

              return (
                <G key={link.id} opacity={isDimmed ? 0.12 : 1}>
                  <Line
                    x1={src.x}
                    y1={src.y}
                    x2={tgt.x}
                    y2={tgt.y}
                    stroke={strokeColor}
                    strokeWidth={strokeW}
                    strokeDasharray={strokeDash}
                  />

                  {/* Relationship Label if Highlighted */}
                  {isHighlighted && link.label && (
                    <SvgText
                      x={midX}
                      y={midY - 4}
                      fill="#e5a93c"
                      fontSize="9.5"
                      fontFamily={AppFonts.serif}
                      fontStyle="italic"
                      textAnchor="middle">
                      {link.label}
                    </SvgText>
                  )}
                </G>
              );
            })}

            {/* Render Nodes */}
            {filteredNodes.map((node) => {
              const isSelected = selectedNodeId === node.id;
              const isConnected = connectedNodeIds.has(node.id);
              const isDimmed = selectedNodeId && !isConnected;

              return (
                <G
                  key={node.id}
                  onPress={() => handleSelectNode(node.id)}>
                  {/* Invisible larger hit target */}
                  <Circle
                    cx={node.x}
                    cy={node.y}
                    r={32}
                    fill="transparent"
                  />

                  {/* Custom Shape */}
                  {renderNodeShape(node, isSelected)}

                  {/* Node Label Below */}
                  <SvgText
                    x={node.x}
                    y={node.y + 24}
                    fill={isSelected ? '#f3c76f' : '#ded5c7'}
                    fontSize="11.5"
                    fontFamily={AppFonts.serif}
                    fontWeight={isSelected ? '700' : '500'}
                    textAnchor="middle"
                    opacity={isDimmed ? 0.25 : 1}>
                    {node.name}
                  </SvgText>
                </G>
              );
            })}
          </Svg>
        </View>

        {/* Selected Node Bottom Card (Image 2) */}
        {selectedNode && (
          <View style={styles.nodeDetailCard}>
            <View style={styles.nodeDetailHeader}>
              <View style={styles.nodeDetailBadgeRow}>
                <Text
                  style={[
                    styles.nodeDetailBadgeDot,
                    { color: NODE_TYPE_CONFIG[selectedNode.type].color },
                  ]}>
                  {NODE_TYPE_CONFIG[selectedNode.type].symbol}
                </Text>
                <Text style={styles.nodeDetailBadge}>
                  {NODE_TYPE_CONFIG[selectedNode.type].badgeText} ·{' '}
                  {selectedNode.role}
                </Text>
              </View>

              <Pressable
                style={styles.closeCardBtn}
                onPress={handleCloseDetail}>
                <Text style={styles.closeCardText}>✕</Text>
              </Pressable>
            </View>

            <Text style={styles.nodeDetailTitle}>{selectedNode.name}</Text>
            <Text style={styles.nodeDetailDesc}>{selectedNode.desc}</Text>

            <Pressable
              style={styles.viewDetailLink}
              onPress={() =>
                router.push({
                  pathname: '/graph/nodes' as any,
                  params: { projectId: currentProject.id },
                })
              }>
              <Text style={styles.viewDetailText}>Xem chi tiết →</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Left Drawer / Sidebar Menu (Image 1) */}
      <Modal visible={drawerOpen} transparent animationType="none">
        <View style={styles.drawerBackdrop}>
          <Pressable
            style={styles.drawerBackdropClickable}
            onPress={() => setDrawerOpen(false)}
          />

          <View style={styles.drawerContainer}>
            <ScrollView
              contentContainerStyle={styles.drawerScroll}
              showsVerticalScrollIndicator={false}>
              {/* Drawer Header */}
              <View style={styles.drawerHeader}>
                <Text style={styles.drawerHeaderSub}>DỰ ÁN</Text>
                <Text style={styles.drawerProjectTitle}>
                  {currentProject.title}
                </Text>
                <Text style={styles.drawerProjectGenre}>
                  {currentProject.genre}
                </Text>
              </View>

              <View style={styles.drawerDivider} />

              {/* Menu Items (01 -> 10) */}
              <View style={styles.menuItemsList}>
                {[
                  {
                    num: '01',
                    title: 'Bản đồ node',
                    sub: 'Màn hình đồ thị',
                    active: true,
                  },
                  {
                    num: '02',
                    title: 'Chi tiết node',
                    sub: 'Danh sách các node',
                    badge: `${nodes.length}`,
                    onPress: () => {
                      setDrawerOpen(false);
                      router.push({
                        pathname: '/graph/nodes' as any,
                        params: { projectId: currentProject.id },
                      });
                    },
                  },
                  {
                    num: '03',
                    title: 'Chi tiết sự kiện',
                    sub: 'Dòng thời gian',
                    badge: '2',
                    onPress: () => {
                      setDrawerOpen(false);
                      router.push({
                        pathname: '/graph/events' as any,
                        params: { projectId: currentProject.id },
                      });
                    },
                  },
                  {
                    num: '04',
                    title: 'Địa điểm',
                    badge: '2',
                    onPress: () => {
                      setDrawerOpen(false);
                      router.push({
                        pathname: '/graph/locations' as any,
                        params: { projectId: currentProject.id },
                      });
                    },
                  },
                  { num: '05', title: 'Nhân vật', badge: '3' },
                  { num: '06', title: 'Phe phái', badge: '2' },
                  { num: '07', title: 'Vật phẩm', badge: '1' },
                  {
                    num: '08',
                    title: 'Mối liên kết',
                    sub: 'Tất cả cạnh',
                    badge: '12',
                  },
                  {
                    num: '09',
                    title: 'AI Writer',
                    sub: 'Viết truyện từ đồ thị',
                  },
                  {
                    num: '10',
                    title: 'AI Checker',
                    sub: 'Soát logic truyện có sẵn',
                  },
                ].map((item) => (
                  <Pressable
                    key={item.num}
                    style={[
                      styles.drawerMenuItem,
                      item.active && styles.drawerMenuItemActive,
                    ]}
                    onPress={() => {
                      if (item.onPress) item.onPress();
                      else setDrawerOpen(false);
                    }}>
                    <Text
                      style={[
                        styles.menuNum,
                        item.active && styles.menuNumActive,
                      ]}>
                      {item.num}
                    </Text>

                    <View style={styles.menuTitleBox}>
                      <Text
                        style={[
                          styles.menuTitle,
                          item.active && styles.menuTitleActive,
                        ]}>
                        {item.title}
                      </Text>
                      {item.sub && (
                        <Text style={styles.menuSub}>{item.sub}</Text>
                      )}
                    </View>

                    {item.badge && (
                      <Text style={styles.menuBadgeText}>{item.badge}</Text>
                    )}
                  </Pressable>
                ))}
              </View>

              <View style={styles.drawerDivider} />

              {/* Back to Project List */}
              <Pressable
                style={styles.drawerBackBtn}
                onPress={() => {
                  setDrawerOpen(false);
                  router.push('/projects' as any);
                }}>
                <Text style={styles.drawerBackText}>
                  〈  Về danh sách dự án
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add Node Modal */}
      <Modal visible={addModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Thêm phần tử vào bản đồ</Text>

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalInputLabel}>Tên phần tử / Node</Text>
              <TextInput
                style={styles.modalInput}
                value={newNodeName}
                onChangeText={setNewNodeName}
                placeholder="Ví dụ: Độc Cô Cầu Bại"
                placeholderTextColor="#665f52"
              />
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalInputLabel}>Loại phân loại</Text>
              <View style={styles.typeSelectorRow}>
                {(
                  [
                    'character',
                    'faction',
                    'item',
                    'event',
                    'location',
                  ] as const
                ).map((t) => (
                  <Pressable
                    key={t}
                    style={[
                      styles.typeOptionChip,
                      newNodeType === t && {
                        borderColor: NODE_TYPE_CONFIG[t].color,
                        backgroundColor: 'rgba(229,169,60,0.15)',
                      },
                    ]}
                    onPress={() => setNewNodeType(t)}>
                    <Text
                      style={{
                        color: NODE_TYPE_CONFIG[t].color,
                        fontSize: 12,
                        fontWeight: '600',
                      }}>
                      {NODE_TYPE_CONFIG[t].symbol} {NODE_TYPE_CONFIG[t].label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalInputLabel}>Vai trò / Nhãn</Text>
              <TextInput
                style={styles.modalInput}
                value={newNodeRole}
                onChangeText={setNewNodeRole}
                placeholder="Ví dụ: KIẾM THẦN ẨN THẾ"
                placeholderTextColor="#665f52"
              />
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalInputLabel}>Mô tả chi tiết</Text>
              <TextInput
                style={[styles.modalInput, { height: 70, textAlignVertical: 'top' }]}
                value={newNodeDesc}
                onChangeText={setNewNodeDesc}
                placeholder="Ghi chú bối cảnh, tính cách hoặc lai lịch..."
                placeholderTextColor="#665f52"
                multiline
              />
            </View>

            <View style={styles.modalActionRow}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setAddModalOpen(false)}>
                <Text style={styles.modalCancelText}>Hủy</Text>
              </Pressable>
              <Pressable
                style={styles.modalConfirmBtn}
                onPress={handleAddNode}>
                <Text style={styles.modalConfirmText}>Thêm Node</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Node Full Details Modal */}
      {selectedNode && (
        <Modal visible={detailModalOpen} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.nodeDetailHeader}>
                <View style={styles.nodeDetailBadgeRow}>
                  <Text
                    style={[
                      styles.nodeDetailBadgeDot,
                      { color: NODE_TYPE_CONFIG[selectedNode.type].color },
                    ]}>
                    {NODE_TYPE_CONFIG[selectedNode.type].symbol}
                  </Text>
                  <Text style={styles.nodeDetailBadge}>
                    {NODE_TYPE_CONFIG[selectedNode.type].badgeText} ·{' '}
                    {selectedNode.role}
                  </Text>
                </View>

                <Pressable
                  style={styles.closeCardBtn}
                  onPress={() => setDetailModalOpen(false)}>
                  <Text style={styles.closeCardText}>✕</Text>
                </Pressable>
              </View>

              <Text style={styles.nodeDetailTitle}>{selectedNode.name}</Text>
              <Text style={styles.nodeDetailDesc}>{selectedNode.desc}</Text>

              <View style={styles.nodeRelationsBox}>
                <Text style={styles.nodeRelationsHeader}>
                  Các mối liên kết ({connectedLinks.length}):
                </Text>
                {connectedLinks.map((link) => {
                  const otherId =
                    link.source === selectedNode.id ? link.target : link.source;
                  const otherNode = nodes.find((n) => n.id === otherId);
                  return (
                    <View key={link.id} style={styles.relationRow}>
                      <Text style={styles.relationLabel}>
                        {link.label || 'liên hệ'} ➜
                      </Text>
                      <Text style={styles.relationTargetName}>
                        {otherNode?.name}
                      </Text>
                    </View>
                  );
                })}
              </View>

              <Pressable
                style={styles.modalConfirmBtn}
                onPress={() => setDetailModalOpen(false)}>
                <Text style={styles.modalConfirmText}>Đóng</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: ThemeColors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#22201a',
  },
  menuBtn: {
    width: 38,
    height: 38,
    borderWidth: 1,
    borderColor: '#363126',
    borderRadius: 6,
    backgroundColor: '#151310',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  menuIconBar: {
    width: 18,
    height: 2,
    backgroundColor: '#ded5c7',
    borderRadius: 1,
  },
  topBarTitleCenter: {
    alignItems: 'center',
  },
  topBarTitle: {
    color: '#ded5c7',
    fontFamily: AppFonts.serif,
    fontSize: 16,
    fontWeight: '700',
  },
  topBarSub: {
    color: '#8c7746',
    fontSize: 10,
    letterSpacing: 1.5,
    fontFamily: AppFonts.mono,
    marginTop: 2,
  },
  addNodeBtn: {
    width: 38,
    height: 38,
    borderRadius: 6,
    backgroundColor: '#db9d33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addNodeBtnText: {
    color: '#15130e',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
  },
  filterBar: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1d1b16',
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#29251e',
    backgroundColor: '#161411',
    gap: 6,
  },
  filterChipSymbol: {
    fontSize: 12,
  },
  filterChipText: {
    fontSize: 12,
    color: '#ded5c7',
    fontFamily: AppFonts.sans,
    fontWeight: '500',
  },
  canvasContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#0c0b09',
  },
  floatingTopLeft: {
    position: 'absolute',
    top: 14,
    left: 16,
    zIndex: 10,
  },
  panHintText: {
    fontSize: 10,
    letterSpacing: 2,
    color: '#6e6758',
    fontFamily: AppFonts.mono,
  },
  zoomControls: {
    position: 'absolute',
    top: 14,
    right: 16,
    zIndex: 10,
    gap: 6,
  },
  zoomBtn: {
    width: 32,
    height: 32,
    backgroundColor: '#151310',
    borderWidth: 1,
    borderColor: '#2f2a20',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtnText: {
    color: '#ded5c7',
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '600',
  },
  svgWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeDetailCard: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: '#161410',
    borderWidth: 1,
    borderColor: '#383226',
    borderLeftWidth: 3,
    borderLeftColor: '#db9d33',
    padding: 16,
    borderRadius: 8,
    zIndex: 20,
  },
  nodeDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  nodeDetailBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nodeDetailBadgeDot: {
    fontSize: 12,
  },
  nodeDetailBadge: {
    fontSize: 10.5,
    letterSpacing: 1.5,
    color: '#b58c42',
    fontWeight: '700',
    fontFamily: AppFonts.mono,
  },
  closeCardBtn: {
    padding: 4,
  },
  closeCardText: {
    color: '#8f887b',
    fontSize: 14,
  },
  nodeDetailTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: ThemeColors.textPrimary,
    fontFamily: AppFonts.serif,
    marginBottom: 8,
  },
  nodeDetailDesc: {
    fontSize: 13.5,
    lineHeight: 20,
    color: '#9e9587',
    fontFamily: AppFonts.sans,
    marginBottom: 12,
  },
  viewDetailLink: {
    alignSelf: 'flex-start',
  },
  viewDetailText: {
    color: '#db9d33',
    fontSize: 13.5,
    fontWeight: '600',
    fontFamily: AppFonts.sans,
  },
  drawerBackdrop: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  drawerBackdropClickable: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  drawerContainer: {
    width: '78%',
    maxWidth: 340,
    height: '100%',
    backgroundColor: '#13110e',
    borderRightWidth: 1,
    borderRightColor: '#6a5323',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 20,
  },
  drawerScroll: {
    paddingHorizontal: 20,
    paddingTop: 36,
    paddingBottom: 40,
  },
  drawerHeader: {
    marginBottom: 16,
  },
  drawerHeaderSub: {
    fontSize: 10.5,
    letterSpacing: 3,
    color: '#a88137',
    fontWeight: '700',
    fontFamily: AppFonts.mono,
    marginBottom: 8,
  },
  drawerProjectTitle: {
    fontSize: 24,
    color: ThemeColors.textPrimary,
    fontFamily: AppFonts.serif,
    fontWeight: '700',
    lineHeight: 30,
  },
  drawerProjectGenre: {
    fontSize: 12.5,
    color: '#7a7263',
    marginTop: 4,
    fontFamily: AppFonts.sans,
  },
  drawerDivider: {
    height: 1,
    backgroundColor: '#26221a',
    marginVertical: 14,
  },
  menuItemsList: {
    gap: 4,
  },
  drawerMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  drawerMenuItemActive: {
    backgroundColor: 'rgba(229,169,60,0.1)',
  },
  menuNum: {
    fontSize: 11,
    fontFamily: AppFonts.mono,
    color: '#6b6455',
    width: 28,
  },
  menuNumActive: {
    color: '#db9d33',
    fontWeight: '700',
  },
  menuTitleBox: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#c2b9aa',
    fontFamily: AppFonts.sans,
  },
  menuTitleActive: {
    color: '#db9d33',
    fontWeight: '700',
  },
  menuSub: {
    fontSize: 11,
    color: '#665f52',
    marginTop: 2,
    fontFamily: AppFonts.sans,
  },
  menuBadgeText: {
    fontSize: 12,
    color: '#8f887b',
    fontFamily: AppFonts.mono,
  },
  drawerBackBtn: {
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  drawerBackText: {
    fontSize: 13.5,
    color: '#a88137',
    fontWeight: '600',
    fontFamily: AppFonts.sans,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#191713',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#383226',
    padding: 22,
    gap: 16,
  },
  modalTitle: {
    fontSize: 19,
    color: '#e5a93c',
    fontFamily: AppFonts.serif,
    fontWeight: '600',
  },
  modalInputGroup: {
    gap: 6,
  },
  modalInputLabel: {
    fontSize: 12.5,
    color: '#8f887b',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#2d281f',
    backgroundColor: '#12110e',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#f5eee6',
    fontSize: 13.5,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeOptionChip: {
    borderWidth: 1,
    borderColor: '#2d281f',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#12110e',
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 6,
  },
  modalCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  modalCancelText: {
    color: '#8f887b',
    fontSize: 13.5,
  },
  modalConfirmBtn: {
    backgroundColor: '#db9d33',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  modalConfirmText: {
    color: '#15130e',
    fontWeight: '700',
    fontSize: 13.5,
  },
  nodeRelationsBox: {
    backgroundColor: '#12100e',
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#26221a',
    gap: 8,
  },
  nodeRelationsHeader: {
    fontSize: 12,
    color: '#a88137',
    fontWeight: '600',
    marginBottom: 4,
  },
  relationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  relationLabel: {
    fontSize: 12,
    color: '#7a7263',
    fontStyle: 'italic',
  },
  relationTargetName: {
    fontSize: 12.5,
    color: '#e5a93c',
    fontWeight: '600',
  },
});
