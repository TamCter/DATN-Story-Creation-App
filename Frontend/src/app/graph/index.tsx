import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Platform,
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
  Path,
  Polygon,
  Rect,
  Text as SvgText,
} from 'react-native-svg';

import {
  getProjectChapters,
  INITIAL_PROJECTS,
  NODE_TYPE_CONFIG,
  StoryChapter,
  StoryLink,
  StoryNode,
  StoryProject,
} from '@/constants/story-data';
import { AppFonts, ThemeColors } from '@/constants/theme';
import { projectStore } from '@/services/project-store';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Precomputed static SVG path for the dot grid (replaces 646 separate Circle elements)
const DOT_GRID_PATH = (() => {
  let path = '';
  for (let col = 0; col < 19; col++) {
    for (let row = 0; row < 34; row++) {
      const cx = col * 20 + 10;
      const cy = row * 20 + 10;
      path += `M${cx - 0.8},${cy}a0.8,0.8 0 1,0 1.6,0a0.8,0.8 0 1,0 -1.6,0 `;
    }
  }
  return path;
})();

export default function GraphScreen() {
  const params = useLocalSearchParams();
  const projectId = (params.projectId as string) || 'project-1';

  const [currentProject, setCurrentProject] = useState<StoryProject>(() => {
    // Chỉ nạp dữ liệu mẫu nếu ID thực sự khớp chính xác với dự án mẫu, không fallback sai lệch
    const match = INITIAL_PROJECTS.find((p) => p.id === projectId);
    return (
      match || {
        id: projectId,
        title: 'Đang tải dự án...',
        genre: '',
        number: '№ 01',
        nodeCount: 0,
        linkCount: 0,
        updatedAt: 'Vừa xong',
        nodes: [],
        links: [],
      }
    );
  });

  const [isLoading, setIsLoading] = useState(true);
  const [nodes, setNodes] = useState<StoryNode[]>(currentProject.nodes || []);
  const [links, setLinks] = useState<StoryLink[]>(currentProject.links || []);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Tải dự án từ projectStore (kết nối Backend Neo4j hoặc Cache cục bộ)
  useEffect(() => {
    let isMounted = true;
    async function loadProjectData() {
      setIsLoading(true);
      try {
        const proj = await projectStore.getProject(projectId);
        if (isMounted) {
          setCurrentProject(proj);
          setNodes(proj.nodes || []);
          setLinks(proj.links || []);
          setSelectedNodeId(null);
        }
      } catch (err) {
        console.warn('Lỗi tải dữ liệu đồ thị:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    void loadProjectData();
    return () => {
      isMounted = false;
    };
  }, [projectId]);

  const chapters = useMemo(() => {
    return getProjectChapters(currentProject);
  }, [currentProject]);

  const [activeChapterId, setActiveChapterId] = useState<string>(
    (params.chapterId as string) || (chapters[0]?.id ?? 'c1')
  );

  useEffect(() => {
    if (params.chapterId && typeof params.chapterId === 'string') {
      setActiveChapterId(params.chapterId);
    }
  }, [params.chapterId]);

  const activeChapter = useMemo(() => {
    return chapters.find((c) => c.id === activeChapterId) || chapters[0];
  }, [chapters, activeChapterId]);

  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [nodeModalOpen, setNodeModalOpen] = useState<boolean>(false);
  const [detailModalOpen, setDetailModalOpen] = useState<boolean>(false);
  const [isEditingNode, setIsEditingNode] = useState<boolean>(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form States (Đầy đủ và phân hóa theo từng loại Node)
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<StoryNode['type']>('character');
  const [formRole, setFormRole] = useState('CHÍNH DIỆN');
  const [formSubType, setFormSubType] = useState('');
  const [formStatus, setFormStatus] = useState('Còn sống');
  const [formDesc, setFormDesc] = useState('');

  // Nhân vật (Character)
  const [formDob, setFormDob] = useState('');
  const [formGender, setFormGender] = useState('Nam');
  const [formWeapon, setFormWeapon] = useState('');
  const [formSect, setFormSect] = useState('');
  const [formPersonality, setFormPersonality] = useState('');

  // Vật phẩm (Item)
  const [formRarity, setFormRarity] = useState('Quý hiếm');
  const [formOrigin, setFormOrigin] = useState('');
  const [formElement, setFormElement] = useState('');
  const [formPower, setFormPower] = useState('');
  const [formHolder, setFormHolder] = useState('');

  // Địa điểm (Location)
  const [formRegion, setFormRegion] = useState('');
  const [formTerrain, setFormTerrain] = useState('');
  const [formDangerLevel, setFormDangerLevel] = useState('An toàn');
  const [formRuler, setFormRuler] = useState('');

  // Phe phái (Faction)
  const [formLeader, setFormLeader] = useState('');
  const [formHeadquarters, setFormHeadquarters] = useState('');
  const [formMotto, setFormMotto] = useState('');
  const [formAlignment, setFormAlignment] = useState<string>('CHÍNH PHÁI');

  // Sự kiện (Event)
  const [formTime, setFormTime] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formImpact, setFormImpact] = useState('');

  const selectedNode = useMemo(() => {
    return nodes.find((n) => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  // Xác định các liên kết xung quanh node được chọn
  const connectedLinks = useMemo(() => {
    if (!selectedNodeId) return [];
    return links.filter(
      (link) => link.source === selectedNodeId || link.target === selectedNodeId
    );
  }, [links, selectedNodeId]);

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

  // Mở modal tạo Node mới
  const handleOpenAddModal = (defaultType: StoryNode['type'] = 'character') => {
    setIsEditingNode(false);
    setEditingNodeId(null);
    setFormId('');
    setFormName('');
    setFormType(defaultType);
    setFormRole(
      defaultType === 'character'
        ? 'CHÍNH DIỆN'
        : defaultType === 'item'
        ? 'BẢO VẬT'
        : defaultType === 'location'
        ? 'ĐỊA DANH'
        : defaultType === 'faction'
        ? 'CHÍNH PHÁI'
        : 'BIẾN CỐ'
    );
    setFormSubType('');
    setFormStatus(
      defaultType === 'character'
        ? 'Còn sống'
        : defaultType === 'item'
        ? 'Nguyên vẹn'
        : defaultType === 'location'
        ? 'Hoạt động'
        : defaultType === 'faction'
        ? 'Hưng thịnh'
        : 'Đã diễn ra'
    );
    setFormDesc('');
    setFormDob('');
    setFormGender('Nam');
    setFormWeapon('');
    setFormSect('');
    setFormPersonality('');
    setFormRarity('Quý hiếm');
    setFormOrigin('');
    setFormElement('');
    setFormPower('');
    setFormHolder('');
    setFormRegion('');
    setFormTerrain('');
    setFormDangerLevel('An toàn');
    setFormRuler('');
    setFormLeader('');
    setFormHeadquarters('');
    setFormMotto('');
    setFormAlignment('CHÍNH PHÁI');
    setFormTime('');
    setFormLocation('');
    setFormImpact('');
    setNodeModalOpen(true);
  };

  // Mở modal chỉnh sửa Node
  const handleOpenEditModal = (node: StoryNode) => {
    setIsEditingNode(true);
    setEditingNodeId(node.id);
    setFormId(node.id);
    setFormName(node.name || '');
    setFormType(node.type || 'character');
    setFormRole(node.role || '');
    setFormSubType(node.subType || '');
    setFormStatus(node.status || '');
    setFormDesc(node.desc || '');
    setFormDob(node.dob || '');
    setFormGender(node.gender || 'Nam');
    setFormWeapon(node.weapon || '');
    setFormSect(node.sect || '');
    setFormPersonality(node.personality || '');
    setFormRarity(node.rarity || 'Quý hiếm');
    setFormOrigin(node.origin || '');
    setFormElement(node.element || '');
    setFormPower(node.power || '');
    setFormHolder(node.holderOrLocation || '');
    setFormRegion(node.region || '');
    setFormTerrain(node.terrain || '');
    setFormDangerLevel(node.dangerLevel || 'An toàn');
    setFormRuler(node.ruler || '');
    setFormLeader(node.leader || '');
    setFormHeadquarters(node.headquarters || '');
    setFormMotto(node.motto || '');
    setFormAlignment(node.alignment || 'CHÍNH PHÁI');
    setFormTime(node.time || '');
    setFormLocation(node.location || '');
    setFormImpact(node.impact || '');
    setDetailModalOpen(false);
    setNodeModalOpen(true);
  };

  // Lưu node (Tạo mới hoặc Cập nhật)
  const handleSaveNode = async () => {
    if (!formName.trim()) {
      if (Platform.OS === 'web') {
        window.alert('Vui lòng nhập tên cho thực thể / node');
      } else {
        Alert.alert('Thiếu thông tin', 'Vui lòng nhập tên cho thực thể / node');
      }
      return;
    }

    setIsSubmitting(true);
    const payload: Partial<StoryNode> = {
      name: formName.trim(),
      type: formType,
      role: formRole.trim(),
      subType: formSubType.trim(),
      status: formStatus.trim(),
      desc: formDesc.trim(),
    };

    if (formId.trim()) {
      payload.id = formId.trim();
    }

    if (formType === 'character') {
      if (formDob.trim()) payload.dob = formDob.trim();
      if (formGender.trim()) payload.gender = formGender.trim();
      if (formWeapon.trim()) payload.weapon = formWeapon.trim();
      if (formSect.trim()) payload.sect = formSect.trim();
      if (formPersonality.trim()) payload.personality = formPersonality.trim();
    } else if (formType === 'item') {
      if (formRarity.trim()) payload.rarity = formRarity.trim();
      if (formOrigin.trim()) payload.origin = formOrigin.trim();
      if (formElement.trim()) payload.element = formElement.trim();
      if (formPower.trim()) payload.power = formPower.trim();
      if (formHolder.trim()) payload.holderOrLocation = formHolder.trim();
    } else if (formType === 'location') {
      if (formRegion.trim()) payload.region = formRegion.trim();
      if (formTerrain.trim()) payload.terrain = formTerrain.trim();
      if (formDangerLevel.trim()) payload.dangerLevel = formDangerLevel.trim();
      if (formRuler.trim()) payload.ruler = formRuler.trim();
    } else if (formType === 'faction') {
      if (formLeader.trim()) payload.leader = formLeader.trim();
      if (formHeadquarters.trim()) payload.headquarters = formHeadquarters.trim();
      if (formMotto.trim()) payload.motto = formMotto.trim();
      if (formAlignment.trim()) payload.alignment = formAlignment.trim();
    } else if (formType === 'event') {
      if (formTime.trim()) payload.time = formTime.trim();
      if (formLocation.trim()) payload.location = formLocation.trim();
      if (formImpact.trim()) payload.impact = formImpact.trim();
    }

    try {
      if (isEditingNode && editingNodeId) {
        const updated = await projectStore.updateNode(currentProject.id, editingNodeId, payload);
        setNodes((prev) => prev.map((n) => (n.id === editingNodeId ? { ...n, ...updated } : n)));
        setSelectedNodeId(updated.id);
      } else {
        const created = await projectStore.createNode(currentProject.id, payload);
        setNodes((prev) => [...prev, created]);
        setSelectedNodeId(created.id);
      }
      setNodeModalOpen(false);
    } catch (err: any) {
      const msg = err.message || 'Không thể lưu node';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Lỗi', msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Xóa node đã chọn
  const handleDeleteNode = (node: StoryNode) => {
    const doDelete = async () => {
      try {
        await projectStore.deleteNode(currentProject.id, node.id);
        setNodes((prev) => prev.filter((n) => n.id !== node.id));
        setLinks((prev) => prev.filter((l) => l.source !== node.id && l.target !== node.id));
        setSelectedNodeId(null);
        setDetailModalOpen(false);
      } catch (err: any) {
        const msg = err.message || 'Không thể xóa node';
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert('Lỗi', msg);
        }
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Bạn có chắc muốn xóa node "${node.name}" và toàn bộ liên kết liên quan?`)) {
        void doDelete();
      }
    } else {
      Alert.alert(
        'Xác nhận xóa',
        `Bạn có chắc muốn xóa node "${node.name}" và toàn bộ liên kết liên quan?`,
        [
          { text: 'Hủy', style: 'cancel' },
          { text: 'Xóa vĩnh viễn', style: 'destructive', onPress: () => void doDelete() },
        ]
      );
    }
  };

  // Render Node Icon based on Type
  const renderNodeShape = (node: StoryNode, isSelected: boolean) => {
    const isConnected = connectedNodeIds.has(node.id);
    const opacity = selectedNodeId && !isConnected ? 0.25 : 1;
    const color = NODE_TYPE_CONFIG[node.type]?.color || '#e5a93c';

    if (node.type === 'character') {
      return (
        <G opacity={opacity}>
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
        <Pressable style={styles.menuBtn} onPress={() => setDrawerOpen(true)}>
          <View style={styles.menuIconBar} />
          <View style={[styles.menuIconBar, { width: 14 }]} />
          <View style={styles.menuIconBar} />
        </Pressable>

        <View style={styles.topBarTitleCenter}>
          <Text style={styles.topBarTitle} numberOfLines={1}>
            {currentProject.title}
          </Text>
          <Text style={styles.topBarSub}>
            {filteredNodes.length} THỰC THỂ · {links.length} LIÊN KẾT
          </Text>
        </View>

        <Pressable style={styles.addNodeBtn} onPress={() => handleOpenAddModal('character')}>
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
            const itemColor = NODE_TYPE_CONFIG[item.type]?.color || '#e5a93c';
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
                onPress={() => setActiveFilter(isActive ? null : item.type)}>
                <Text style={[styles.filterChipSymbol, { color: itemColor }]}>
                  {item.symbol}
                </Text>
                <Text style={[styles.filterChipText, isActive && { color: itemColor }]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Canvas Area */}
      <View style={styles.canvasContainer}>
        {/* Floating Title / Watermark */}
        <View style={styles.floatingTopLeft}>
          <Text style={styles.watermarkText}>{currentProject.title}</Text>
          <Text style={styles.panHintText}>BẢN ĐỒ THỰC THỂ ĐỒ THỊ</Text>
        </View>

        {/* Zoom Controls */}
        <View style={styles.zoomControls}>
          <Pressable style={styles.zoomBtn} onPress={handleZoomIn}>
            <Text style={styles.zoomBtnText}>+</Text>
          </Pressable>
          <View style={styles.zoomDivider} />
          <Pressable style={styles.zoomBtn} onPress={handleZoomOut}>
            <Text style={styles.zoomBtnText}>−</Text>
          </Pressable>
        </View>

        {/* SVG Drawing Canvas */}
        <View style={styles.svgWrapper}>
          <Svg
            width={SCREEN_WIDTH}
            height={SCREEN_HEIGHT * 0.72}
            viewBox={`0 0 ${SCREEN_WIDTH / zoomLevel} ${(SCREEN_HEIGHT * 0.72) / zoomLevel}`}>
            {/* Background Dot Grid */}
            <Path d={DOT_GRID_PATH} fill="#26221b" />

            {/* Render Links */}
            {links.map((link) => {
              const src = nodes.find((n) => n.id === link.source);
              const tgt = nodes.find((n) => n.id === link.target);
              if (!src || !tgt) return null;

              const isHighlighted =
                selectedNodeId === link.source || selectedNodeId === link.target;
              const isDimmed = selectedNodeId && !isHighlighted;

              const strokeColor = isHighlighted
                ? '#f0b84c'
                : 'rgba(229, 169, 60, 0.38)';
              const strokeW = isHighlighted ? 1.6 : 1.2;
              const strokeDash = '3,3';

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
                <G key={node.id} onPress={() => handleSelectNode(node.id)}>
                  <Circle cx={node.x} cy={node.y} r={32} fill="transparent" />
                  {renderNodeShape(node, isSelected)}
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

          {/* Khi dự án chưa có node nào: Hiển thị thông báo sạch đẹp thay vì hiển thị node dự án khác */}
          {!isLoading && nodes.length === 0 && (
            <View style={styles.emptyCanvasContainer}>
              <View style={styles.emptySymbolBox}>
                <Text style={styles.emptyCanvasIcon}>◈</Text>
              </View>
              <Text style={styles.emptyCanvasTitle}>Dự án chưa có thực thể nào</Text>
              <Text style={styles.emptyCanvasDesc}>
                Đây là dự án mới của bạn. Hãy bắt đầu xây dựng thế giới câu chuyện bằng cách thêm nhân vật, bảo vật hoặc địa điểm đầu tiên!
              </Text>
              <Pressable
                style={styles.emptyCanvasBtn}
                onPress={() => handleOpenAddModal('character')}>
                <Text style={styles.emptyCanvasBtnText}>+ Thêm nhân vật đầu tiên</Text>
              </Pressable>
            </View>
          )}

          {isLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#e5a93c" />
              <Text style={styles.loadingText}>Đang tải đồ thị...</Text>
            </View>
          )}
        </View>

        {/* Selected Node Bottom Card */}
        {selectedNode && (
          <View style={styles.nodeDetailCard}>
            <View style={styles.nodeDetailHeader}>
              <View style={styles.nodeDetailBadgeRow}>
                <Text
                  style={[
                    styles.nodeDetailBadgeDot,
                    { color: NODE_TYPE_CONFIG[selectedNode.type]?.color || '#e5a93c' },
                  ]}>
                  {NODE_TYPE_CONFIG[selectedNode.type]?.symbol || '●'}
                </Text>
                <Text style={styles.nodeDetailBadge}>
                  {NODE_TYPE_CONFIG[selectedNode.type]?.badgeText || 'THỰC THỂ'} ·{' '}
                  {selectedNode.role || 'CHƯA ĐẶT'}
                </Text>
                {selectedNode.status ? (
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusBadgeText}>{selectedNode.status}</Text>
                  </View>
                ) : null}
              </View>

              <Pressable style={styles.closeCardBtn} onPress={handleCloseDetail}>
                <Text style={styles.closeCardText}>✕</Text>
              </Pressable>
            </View>

            <Text style={styles.nodeDetailTitle}>{selectedNode.name}</Text>
            {selectedNode.desc ? (
              <Text style={styles.nodeDetailDesc} numberOfLines={2}>
                {selectedNode.desc}
              </Text>
            ) : null}

            {/* Type-specific preview tags */}
            <View style={styles.previewTagsRow}>
              {selectedNode.dob ? (
                <Text style={styles.previewTag}>📅 {selectedNode.dob}</Text>
              ) : null}
              {selectedNode.weapon ? (
                <Text style={styles.previewTag}>⚔️ {selectedNode.weapon}</Text>
              ) : null}
              {selectedNode.sect ? (
                <Text style={styles.previewTag}>🏛️ {selectedNode.sect}</Text>
              ) : null}
              {selectedNode.rarity ? (
                <Text style={styles.previewTag}>💎 {selectedNode.rarity}</Text>
              ) : null}
              {selectedNode.region ? (
                <Text style={styles.previewTag}>📍 {selectedNode.region}</Text>
              ) : null}
              {selectedNode.leader ? (
                <Text style={styles.previewTag}>👑 {selectedNode.leader}</Text>
              ) : null}
              {selectedNode.time ? (
                <Text style={styles.previewTag}>⏳ {selectedNode.time}</Text>
              ) : null}
            </View>

            <View style={styles.cardActionsRow}>
              <Pressable
                style={styles.viewDetailLink}
                onPress={() => setDetailModalOpen(true)}>
                <Text style={styles.viewDetailText}>Xem chi tiết →</Text>
              </Pressable>

              <View style={styles.cardActionBtns}>
                <Pressable
                  style={styles.editActionBtn}
                  onPress={() => handleOpenEditModal(selectedNode)}>
                  <Text style={styles.editActionText}>✏️ Sửa</Text>
                </Pressable>
                <Pressable
                  style={styles.deleteActionBtn}
                  onPress={() => handleDeleteNode(selectedNode)}>
                  <Text style={styles.deleteActionText}>🗑️ Xóa</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Left Drawer / Sidebar Menu */}
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
              <View style={styles.drawerHeader}>
                <Text style={styles.drawerHeaderSub}>DỰ ÁN</Text>
                <Text style={styles.drawerProjectTitle}>{currentProject.title}</Text>
                <Text style={styles.drawerProjectGenre}>{currentProject.genre}</Text>
              </View>

              <View style={styles.drawerDivider} />

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
                    title: 'Chi tiết chương',
                    sub: 'Dòng thời gian & sự kiện',
                    badge: `${chapters.length}`,
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
                    badge: `${nodes.filter((n) => n.type === 'location').length}`,
                    onPress: () => {
                      setDrawerOpen(false);
                      router.push({
                        pathname: '/graph/locations' as any,
                        params: { projectId: currentProject.id },
                      });
                    },
                  },
                  {
                    num: '05',
                    title: 'Nhân vật',
                    badge: `${nodes.filter((n) => n.type === 'character').length}`,
                    onPress: () => {
                      setDrawerOpen(false);
                      router.push({
                        pathname: '/graph/characters' as any,
                        params: { projectId: currentProject.id },
                      });
                    },
                  },
                  {
                    num: '06',
                    title: 'Phe phái',
                    badge: `${nodes.filter((n) => n.type === 'faction').length}`,
                    onPress: () => {
                      setDrawerOpen(false);
                      router.push({
                        pathname: '/graph/factions' as any,
                        params: { projectId: currentProject.id },
                      });
                    },
                  },
                  {
                    num: '07',
                    title: 'Vật phẩm',
                    badge: `${nodes.filter((n) => n.type === 'item').length}`,
                    onPress: () => {
                      setDrawerOpen(false);
                      router.push({
                        pathname: '/graph/items' as any,
                        params: { projectId: currentProject.id },
                      });
                    },
                  },
                  {
                    num: '08',
                    title: 'Mối liên kết',
                    sub: 'Tất cả cạnh',
                    badge: `${links.length}`,
                    onPress: () => {
                      setDrawerOpen(false);
                      router.push({
                        pathname: '/graph/links' as any,
                        params: { projectId: currentProject.id },
                      });
                    },
                  },
                ].map((item) => (
                  <Pressable
                    key={item.num}
                    style={[styles.drawerMenuItem, item.active && styles.drawerMenuItemActive]}
                    onPress={() => {
                      if (item.onPress) item.onPress();
                      else setDrawerOpen(false);
                    }}>
                    <Text style={[styles.menuNum, item.active && styles.menuNumActive]}>
                      {item.num}
                    </Text>
                    <View style={styles.menuTitleBox}>
                      <Text style={[styles.menuTitle, item.active && styles.menuTitleActive]}>
                        {item.title}
                      </Text>
                      {item.sub && <Text style={styles.menuSub}>{item.sub}</Text>}
                    </View>
                    {item.badge && <Text style={styles.menuBadgeText}>{item.badge}</Text>}
                  </Pressable>
                ))}
              </View>

              <View style={styles.drawerDivider} />

              <Pressable
                style={styles.drawerBackBtn}
                onPress={() => {
                  setDrawerOpen(false);
                  router.push('/projects' as any);
                }}>
                <Text style={styles.drawerBackText}>〈 Về danh sách dự án</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Dynamic Add / Edit Node Modal */}
      <Modal visible={nodeModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardLarge}>
            <View style={styles.modalTitleRow}>
              <Text style={styles.modalTitle}>
                {isEditingNode ? 'Chỉnh sửa thực thể' : 'Thêm thực thể vào bản đồ'}
              </Text>
              <Pressable onPress={() => setNodeModalOpen(false)} hitSlop={10}>
                <Text style={styles.closeCardText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView
              style={{ maxHeight: SCREEN_HEIGHT * 0.7 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 14 }}>
              {/* Type Selector */}
              <View style={styles.modalInputGroup}>
                <Text style={styles.modalInputLabel}>Loại phân loại thực thể</Text>
                <View style={styles.typeSelectorRow}>
                  {(
                    [
                      'character',
                      'item',
                      'location',
                      'faction',
                      'event',
                    ] as const
                  ).map((t) => (
                    <Pressable
                      key={t}
                      style={[
                        styles.typeOptionChip,
                        formType === t && {
                          borderColor: NODE_TYPE_CONFIG[t]?.color || '#e5a93c',
                          backgroundColor: `${NODE_TYPE_CONFIG[t]?.color || '#e5a93c'}20`,
                        },
                      ]}
                      onPress={() => {
                        setFormType(t);
                        if (!isEditingNode) {
                          setFormStatus(
                            t === 'character'
                              ? 'Còn sống'
                              : t === 'item'
                              ? 'Nguyên vẹn'
                              : t === 'location'
                              ? 'Hoạt động'
                              : t === 'faction'
                              ? 'Hưng thịnh'
                              : 'Đã diễn ra'
                          );
                        }
                      }}>
                      <Text
                        style={{
                          color: NODE_TYPE_CONFIG[t]?.color || '#e5a93c',
                          fontSize: 12,
                          fontWeight: '600',
                        }}>
                        {NODE_TYPE_CONFIG[t]?.symbol} {NODE_TYPE_CONFIG[t]?.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* ID & Name in Row */}
              <View style={styles.formRow}>
                <View style={[styles.modalInputGroup, { flex: 1 }]}>
                  <Text style={styles.modalInputLabel}>Mã ID (tùy chọn)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={formId}
                    onChangeText={setFormId}
                    placeholder="Để trống tự động sinh"
                    placeholderTextColor="#665f52"
                    editable={!isEditingNode}
                  />
                </View>

                <View style={[styles.modalInputGroup, { flex: 1.5 }]}>
                  <Text style={styles.modalInputLabel}>Tên thực thể *</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={formName}
                    onChangeText={setFormName}
                    placeholder={
                      formType === 'character'
                        ? 'Ví dụ: Lăng Tiêu'
                        : formType === 'item'
                        ? 'Ví dụ: Kiếm Hoàng Hôn'
                        : formType === 'location'
                        ? 'Ví dụ: Hàn Nguyệt Thành'
                        : formType === 'faction'
                        ? 'Ví dụ: Thiên Hạ Minh'
                        : 'Ví dụ: Đêm Hỏa Thiêu'
                    }
                    placeholderTextColor="#665f52"
                  />
                </View>
              </View>

              {/* Role & SubType */}
              <View style={styles.formRow}>
                <View style={[styles.modalInputGroup, { flex: 1 }]}>
                  <Text style={styles.modalInputLabel}>Vai trò / Nhãn</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={formRole}
                    onChangeText={setFormRole}
                    placeholder="Ví dụ: NHÂN VẬT CHÍNH"
                    placeholderTextColor="#665f52"
                  />
                </View>

                <View style={[styles.modalInputGroup, { flex: 1 }]}>
                  <Text style={styles.modalInputLabel}>Phân loại phụ</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={formSubType}
                    onChangeText={setFormSubType}
                    placeholder="Ví dụ: KIẾM KHÁCH"
                    placeholderTextColor="#665f52"
                  />
                </View>
              </View>

              {/* Status */}
              <View style={styles.modalInputGroup}>
                <Text style={styles.modalInputLabel}>Trạng thái hiện tại</Text>
                <TextInput
                  style={styles.modalInput}
                  value={formStatus}
                  onChangeText={setFormStatus}
                  placeholder={
                    formType === 'character'
                      ? 'Còn sống / Bị truy sát / Ẩn cư...'
                      : formType === 'item'
                      ? 'Đang sở hữu / Thất lạc / Phong ấn...'
                      : formType === 'location'
                      ? 'Hoạt động / Bị chiếm đóng / Hoang tàn...'
                      : 'Hoạt động'
                  }
                  placeholderTextColor="#665f52"
                />
              </View>

              {/* ============ DYNAMIC FIELDS FOR CHARACTER ============ */}
              {formType === 'character' && (
                <View style={styles.dynamicSectionBox}>
                  <Text style={styles.dynamicSectionHeader}>THÔNG TIN NHÂN VẬT</Text>
                  <View style={styles.formRow}>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Ngày sinh / Tuổi (DOB)</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={formDob}
                        onChangeText={setFormDob}
                        placeholder="Ví dụ: 24 tuổi / 15-08-1042"
                        placeholderTextColor="#665f52"
                      />
                    </View>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Giới tính</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={formGender}
                        onChangeText={setFormGender}
                        placeholder="Nam / Nữ / Khác"
                        placeholderTextColor="#665f52"
                      />
                    </View>
                  </View>

                  <View style={styles.formRow}>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Binh khí / Vũ khí</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={formWeapon}
                        onChangeText={setFormWeapon}
                        placeholder="Ví dụ: Huyền Thiết Kiếm"
                        placeholderTextColor="#665f52"
                      />
                    </View>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Môn phái / Thế lực</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={formSect}
                        onChangeText={setFormSect}
                        placeholder="Ví dụ: Bạch Liên Cốc"
                        placeholderTextColor="#665f52"
                      />
                    </View>
                  </View>

                  <View style={styles.modalInputGroup}>
                    <Text style={styles.modalInputLabel}>Tính cách</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={formPersonality}
                      onChangeText={setFormPersonality}
                      placeholder="Ví dụ: Trầm mặc, kiên định, không tin lời ước hẹn"
                      placeholderTextColor="#665f52"
                    />
                  </View>
                </View>
              )}

              {/* ============ DYNAMIC FIELDS FOR ITEM ============ */}
              {formType === 'item' && (
                <View style={styles.dynamicSectionBox}>
                  <Text style={[styles.dynamicSectionHeader, { color: '#42b883' }]}>
                    THÔNG TIN BẢO VẬT / VẬT PHẨM
                  </Text>
                  <View style={styles.formRow}>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Độ hiếm</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={formRarity}
                        onChangeText={setFormRarity}
                        placeholder="Ví dụ: Thần binh thượng cổ · Chí tôn"
                        placeholderTextColor="#665f52"
                      />
                    </View>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Thuộc tính / Nguyên tố</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={formElement}
                        onChangeText={setFormElement}
                        placeholder="Ví dụ: Sát khí · Băng tuyết"
                        placeholderTextColor="#665f52"
                      />
                    </View>
                  </View>

                  <View style={styles.modalInputGroup}>
                    <Text style={styles.modalInputLabel}>Nguồn gốc / Xuất xứ</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={formOrigin}
                      onChangeText={setFormOrigin}
                      placeholder="Ví dụ: Rèn từ Thiên Ngoại Thần Thiết"
                      placeholderTextColor="#665f52"
                    />
                  </View>

                  <View style={styles.formRow}>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Uy lực / Công năng</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={formPower}
                        onChangeText={setFormPower}
                        placeholder="Ví dụ: Chém sắt như bùn"
                        placeholderTextColor="#665f52"
                      />
                    </View>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Người giữ / Nơi cất giấu</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={formHolder}
                        onChangeText={setFormHolder}
                        placeholder="Ví dụ: Lăng Tiêu đang nắm giữ"
                        placeholderTextColor="#665f52"
                      />
                    </View>
                  </View>
                </View>
              )}

              {/* ============ DYNAMIC FIELDS FOR LOCATION ============ */}
              {formType === 'location' && (
                <View style={styles.dynamicSectionBox}>
                  <Text style={[styles.dynamicSectionHeader, { color: '#9f70cf' }]}>
                    THÔNG TIN ĐỊA DANH / ĐỊA ĐIỂM
                  </Text>
                  <View style={styles.formRow}>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Khu vực / Phương hướng</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={formRegion}
                        onChangeText={setFormRegion}
                        placeholder="Ví dụ: Phương Bắc / Trung Nguyên"
                        placeholderTextColor="#665f52"
                      />
                    </View>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Mức độ nguy hiểm</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={formDangerLevel}
                        onChangeText={setFormDangerLevel}
                        placeholder="An toàn / Hiểm địa / Cấm địa tử vong"
                        placeholderTextColor="#665f52"
                      />
                    </View>
                  </View>

                  <View style={styles.formRow}>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Địa thế / Khí hậu</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={formTerrain}
                        onChangeText={setFormTerrain}
                        placeholder="Ví dụ: Núi đá tuyết phủ hiểm trở"
                        placeholderTextColor="#665f52"
                      />
                    </View>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Thế lực cai quản</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={formRuler}
                        onChangeText={setFormRuler}
                        placeholder="Ví dụ: Thiên Hạ Minh"
                        placeholderTextColor="#665f52"
                      />
                    </View>
                  </View>
                </View>
              )}

              {/* ============ DYNAMIC FIELDS FOR FACTION ============ */}
              {formType === 'faction' && (
                <View style={styles.dynamicSectionBox}>
                  <Text style={[styles.dynamicSectionHeader, { color: '#d95a38' }]}>
                    THÔNG TIN PHE PHÁI / MÔN PHÁI
                  </Text>
                  <View style={styles.formRow}>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Minh chủ / Thủ lĩnh</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={formLeader}
                        onChangeText={setFormLeader}
                        placeholder="Ví dụ: Triệu Vô Cực"
                        placeholderTextColor="#665f52"
                      />
                    </View>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Lập trường</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={formAlignment}
                        onChangeText={setFormAlignment}
                        placeholder="CHÍNH PHÁI / TRUNG LẬP / TÀ PHÁI"
                        placeholderTextColor="#665f52"
                      />
                    </View>
                  </View>

                  <View style={styles.modalInputGroup}>
                    <Text style={styles.modalInputLabel}>Tổng đàn / Căn cứ địa</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={formHeadquarters}
                      onChangeText={setFormHeadquarters}
                      placeholder="Ví dụ: Hàn Nguyệt Thành · Tổng đàn"
                      placeholderTextColor="#665f52"
                    />
                  </View>

                  <View style={styles.modalInputGroup}>
                    <Text style={styles.modalInputLabel}>Tôn chỉ / Khẩu hiệu</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={formMotto}
                      onChangeText={setFormMotto}
                      placeholder="Ví dụ: Quy tụ võ lâm, trừ gian diệt bạo"
                      placeholderTextColor="#665f52"
                    />
                  </View>
                </View>
              )}

              {/* ============ DYNAMIC FIELDS FOR EVENT ============ */}
              {formType === 'event' && (
                <View style={styles.dynamicSectionBox}>
                  <Text style={[styles.dynamicSectionHeader, { color: '#5b8ec2' }]}>
                    THÔNG TIN BIẾN CỐ / SỰ KIỆN
                  </Text>
                  <View style={styles.formRow}>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Thời điểm / Chương</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={formTime}
                        onChangeText={setFormTime}
                        placeholder="Ví dụ: Chương 1 / Đêm trăng tròn"
                        placeholderTextColor="#665f52"
                      />
                    </View>
                    <View style={[styles.modalInputGroup, { flex: 1 }]}>
                      <Text style={styles.modalInputLabel}>Nơi diễn ra</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={formLocation}
                        onChangeText={setFormLocation}
                        placeholder="Ví dụ: Ngoại ô Hàn Nguyệt Thành"
                        placeholderTextColor="#665f52"
                      />
                    </View>
                  </View>

                  <View style={styles.modalInputGroup}>
                    <Text style={styles.modalInputLabel}>Mức độ ảnh hưởng</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={formImpact}
                      onChangeText={setFormImpact}
                      placeholder="Ví dụ: Diệt môn, biến chuyển cục diện võ lâm"
                      placeholderTextColor="#665f52"
                    />
                  </View>
                </View>
              )}

              {/* Description */}
              <View style={styles.modalInputGroup}>
                <Text style={styles.modalInputLabel}>Mô tả chi tiết</Text>
                <TextInput
                  style={[styles.modalInput, { height: 75, textAlignVertical: 'top' }]}
                  value={formDesc}
                  onChangeText={setFormDesc}
                  placeholder="Ghi chú bối cảnh, lai lịch, cốt truyện liên quan..."
                  placeholderTextColor="#665f52"
                  multiline
                />
              </View>
            </ScrollView>

            <View style={styles.modalActionRow}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setNodeModalOpen(false)}
                disabled={isSubmitting}>
                <Text style={styles.modalCancelText}>Hủy</Text>
              </Pressable>
              <Pressable
                style={[styles.modalConfirmBtn, isSubmitting && { opacity: 0.6 }]}
                onPress={handleSaveNode}
                disabled={isSubmitting}>
                <Text style={styles.modalConfirmText}>
                  {isSubmitting
                    ? 'Đang lưu...'
                    : isEditingNode
                    ? 'Lưu thay đổi'
                    : 'Thêm Node'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Node Full Details Modal */}
      {selectedNode && (
        <Modal visible={detailModalOpen} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCardLarge}>
              <View style={styles.nodeDetailHeader}>
                <View style={styles.nodeDetailBadgeRow}>
                  <Text
                    style={[
                      styles.nodeDetailBadgeDot,
                      { color: NODE_TYPE_CONFIG[selectedNode.type]?.color || '#e5a93c' },
                    ]}>
                    {NODE_TYPE_CONFIG[selectedNode.type]?.symbol || '●'}
                  </Text>
                  <Text style={styles.nodeDetailBadge}>
                    {NODE_TYPE_CONFIG[selectedNode.type]?.badgeText || 'THỰC THỂ'} ·{' '}
                    {selectedNode.role || 'CHƯA ĐẶT'}
                  </Text>
                  {selectedNode.status ? (
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusBadgeText}>{selectedNode.status}</Text>
                    </View>
                  ) : null}
                </View>

                <Pressable
                  style={styles.closeCardBtn}
                  onPress={() => setDetailModalOpen(false)}>
                  <Text style={styles.closeCardText}>✕</Text>
                </Pressable>
              </View>

              <Text style={styles.nodeDetailTitle}>{selectedNode.name}</Text>
              {selectedNode.desc ? (
                <Text style={styles.nodeDetailDesc}>{selectedNode.desc}</Text>
              ) : null}

              <ScrollView
                style={{ maxHeight: SCREEN_HEIGHT * 0.45 }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ gap: 10 }}>
                {/* Thuộc tính riêng biệt theo phân loại */}
                <View style={styles.detailsGridBox}>
                  <Text style={styles.detailsGridTitle}>THUỘC TÍNH CHI TIẾT</Text>
                  <View style={styles.detailRowItem}>
                    <Text style={styles.detailItemKey}>Mã định danh (ID):</Text>
                    <Text style={styles.detailItemValMono}>{selectedNode.id}</Text>
                  </View>
                  {selectedNode.subType ? (
                    <View style={styles.detailRowItem}>
                      <Text style={styles.detailItemKey}>Phân loại phụ:</Text>
                      <Text style={styles.detailItemVal}>{selectedNode.subType}</Text>
                    </View>
                  ) : null}
                  {selectedNode.status ? (
                    <View style={styles.detailRowItem}>
                      <Text style={styles.detailItemKey}>Trạng thái:</Text>
                      <Text style={[styles.detailItemVal, { color: '#e5a93c' }]}>
                        {selectedNode.status}
                      </Text>
                    </View>
                  ) : null}

                  {selectedNode.type === 'character' && (
                    <>
                      {selectedNode.dob ? (
                        <View style={styles.detailRowItem}>
                          <Text style={styles.detailItemKey}>Ngày sinh / Tuổi (DOB):</Text>
                          <Text style={styles.detailItemVal}>{selectedNode.dob}</Text>
                        </View>
                      ) : null}
                      {selectedNode.gender ? (
                        <View style={styles.detailRowItem}>
                          <Text style={styles.detailItemKey}>Giới tính:</Text>
                          <Text style={styles.detailItemVal}>{selectedNode.gender}</Text>
                        </View>
                      ) : null}
                      {selectedNode.weapon ? (
                        <View style={styles.detailRowItem}>
                          <Text style={styles.detailItemKey}>Binh khí:</Text>
                          <Text style={styles.detailItemVal}>{selectedNode.weapon}</Text>
                        </View>
                      ) : null}
                      {selectedNode.sect ? (
                        <View style={styles.detailRowItem}>
                          <Text style={styles.detailItemKey}>Môn phái:</Text>
                          <Text style={styles.detailItemVal}>{selectedNode.sect}</Text>
                        </View>
                      ) : null}
                      {selectedNode.personality ? (
                        <View style={styles.detailRowItem}>
                          <Text style={styles.detailItemKey}>Tính cách:</Text>
                          <Text style={styles.detailItemVal}>{selectedNode.personality}</Text>
                        </View>
                      ) : null}
                    </>
                  )}

                  {selectedNode.type === 'item' && (
                    <>
                      {selectedNode.rarity ? (
                        <View style={styles.detailRowItem}>
                          <Text style={styles.detailItemKey}>Độ hiếm:</Text>
                          <Text style={[styles.detailItemVal, { color: '#42b883' }]}>
                            {selectedNode.rarity}
                          </Text>
                        </View>
                      ) : null}
                      {selectedNode.origin ? (
                        <View style={styles.detailRowItem}>
                          <Text style={styles.detailItemKey}>Nguồn gốc:</Text>
                          <Text style={styles.detailItemVal}>{selectedNode.origin}</Text>
                        </View>
                      ) : null}
                      {selectedNode.element ? (
                        <View style={styles.detailRowItem}>
                          <Text style={styles.detailItemKey}>Nguyên tố:</Text>
                          <Text style={styles.detailItemVal}>{selectedNode.element}</Text>
                        </View>
                      ) : null}
                      {selectedNode.power ? (
                        <View style={styles.detailRowItem}>
                          <Text style={styles.detailItemKey}>Uy lực:</Text>
                          <Text style={styles.detailItemVal}>{selectedNode.power}</Text>
                        </View>
                      ) : null}
                      {selectedNode.holderOrLocation ? (
                        <View style={styles.detailRowItem}>
                          <Text style={styles.detailItemKey}>Người nắm giữ:</Text>
                          <Text style={styles.detailItemVal}>{selectedNode.holderOrLocation}</Text>
                        </View>
                      ) : null}
                    </>
                  )}

                  {selectedNode.type === 'location' && (
                    <>
                      {selectedNode.region ? (
                        <View style={styles.detailRowItem}>
                          <Text style={styles.detailItemKey}>Khu vực:</Text>
                          <Text style={styles.detailItemVal}>{selectedNode.region}</Text>
                        </View>
                      ) : null}
                      {selectedNode.terrain ? (
                        <View style={styles.detailRowItem}>
                          <Text style={styles.detailItemKey}>Địa thế:</Text>
                          <Text style={styles.detailItemVal}>{selectedNode.terrain}</Text>
                        </View>
                      ) : null}
                      {selectedNode.dangerLevel ? (
                        <View style={styles.detailRowItem}>
                          <Text style={styles.detailItemKey}>Nguy hiểm:</Text>
                          <Text style={styles.detailItemVal}>{selectedNode.dangerLevel}</Text>
                        </View>
                      ) : null}
                      {selectedNode.ruler ? (
                        <View style={styles.detailRowItem}>
                          <Text style={styles.detailItemKey}>Cai quản:</Text>
                          <Text style={styles.detailItemVal}>{selectedNode.ruler}</Text>
                        </View>
                      ) : null}
                    </>
                  )}

                  {selectedNode.type === 'faction' && (
                    <>
                      {selectedNode.leader ? (
                        <View style={styles.detailRowItem}>
                          <Text style={styles.detailItemKey}>Thủ lĩnh:</Text>
                          <Text style={styles.detailItemVal}>{selectedNode.leader}</Text>
                        </View>
                      ) : null}
                      {selectedNode.headquarters ? (
                        <View style={styles.detailRowItem}>
                          <Text style={styles.detailItemKey}>Tổng đàn:</Text>
                          <Text style={styles.detailItemVal}>{selectedNode.headquarters}</Text>
                        </View>
                      ) : null}
                      {selectedNode.motto ? (
                        <View style={styles.detailRowItem}>
                          <Text style={styles.detailItemKey}>Tôn chỉ:</Text>
                          <Text style={styles.detailItemVal}>{selectedNode.motto}</Text>
                        </View>
                      ) : null}
                      {selectedNode.alignment ? (
                        <View style={styles.detailRowItem}>
                          <Text style={styles.detailItemKey}>Lập trường:</Text>
                          <Text style={styles.detailItemVal}>{selectedNode.alignment}</Text>
                        </View>
                      ) : null}
                    </>
                  )}

                  {selectedNode.type === 'event' && (
                    <>
                      {selectedNode.time ? (
                        <View style={styles.detailRowItem}>
                          <Text style={styles.detailItemKey}>Thời điểm:</Text>
                          <Text style={styles.detailItemVal}>{selectedNode.time}</Text>
                        </View>
                      ) : null}
                      {selectedNode.location ? (
                        <View style={styles.detailRowItem}>
                          <Text style={styles.detailItemKey}>Địa điểm:</Text>
                          <Text style={styles.detailItemVal}>{selectedNode.location}</Text>
                        </View>
                      ) : null}
                      {selectedNode.impact ? (
                        <View style={styles.detailRowItem}>
                          <Text style={styles.detailItemKey}>Ảnh hưởng:</Text>
                          <Text style={styles.detailItemVal}>{selectedNode.impact}</Text>
                        </View>
                      ) : null}
                    </>
                  )}
                </View>

                {/* Connected Links */}
                <View style={styles.nodeRelationsBox}>
                  <Text style={styles.nodeRelationsHeader}>
                    Các mối liên kết đồ thị ({connectedLinks.length}):
                  </Text>
                  {connectedLinks.map((link) => {
                    const otherId =
                      link.source === selectedNode.id ? link.target : link.source;
                    const otherNode = nodes.find((n) => n.id === otherId);
                    return (
                      <View key={link.id} style={styles.relationRow}>
                        <Text style={styles.relationLabel}>{link.label || 'liên hệ'} ➜</Text>
                        <Text style={styles.relationTargetName}>
                          {otherNode?.name || otherId}
                        </Text>
                      </View>
                    );
                  })}
                  {connectedLinks.length === 0 && (
                    <Text style={{ color: '#6e6758', fontSize: 12, fontStyle: 'italic' }}>
                      Chưa có liên kết với thực thể nào
                    </Text>
                  )}
                </View>
              </ScrollView>

              {/* Bottom Actions */}
              <View style={styles.detailModalFooter}>
                <Pressable
                  style={styles.modalEditBtn}
                  onPress={() => handleOpenEditModal(selectedNode)}>
                  <Text style={styles.modalEditText}>✏️ Sửa thông tin</Text>
                </Pressable>

                <Pressable
                  style={styles.modalDeleteBtn}
                  onPress={() => handleDeleteNode(selectedNode)}>
                  <Text style={styles.modalDeleteText}>🗑️ Xóa</Text>
                </Pressable>

                <Pressable
                  style={styles.modalConfirmBtn}
                  onPress={() => setDetailModalOpen(false)}>
                  <Text style={styles.modalConfirmText}>Đóng</Text>
                </Pressable>
              </View>
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
    borderColor: '#2d271e',
    borderRadius: 4,
    backgroundColor: '#14120e',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  menuIconBar: {
    width: 16,
    height: 2,
    backgroundColor: '#ded5c7',
    borderRadius: 1,
  },
  topBarTitleCenter: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 8,
  },
  topBarTitle: {
    color: '#ded5c7',
    fontFamily: AppFonts.serif,
    fontSize: 17,
    fontWeight: '600',
  },
  topBarSub: {
    color: '#8f887b',
    fontSize: 10.5,
    letterSpacing: 1.5,
    fontFamily: AppFonts.sans,
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  addNodeBtn: {
    width: 38,
    height: 38,
    borderRadius: 4,
    backgroundColor: '#d19839',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addNodeBtnText: {
    color: '#0e0d0b',
    fontSize: 24,
    fontWeight: '400',
    lineHeight: 26,
  },
  filterBar: {
    paddingVertical: 8,
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
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#29251e',
    backgroundColor: '#13110d',
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
    left: 18,
    zIndex: 10,
  },
  watermarkText: {
    fontSize: 11.5,
    letterSpacing: 2.5,
    color: '#6e6350',
    fontFamily: AppFonts.sans,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  panHintText: {
    fontSize: 10,
    letterSpacing: 2,
    color: '#6e6758',
    fontFamily: AppFonts.mono,
  },
  zoomControls: {
    position: 'absolute',
    top: 12,
    right: 16,
    zIndex: 10,
    width: 36,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#2d271e',
    backgroundColor: '#14120e',
    overflow: 'hidden',
  },
  zoomBtn: {
    width: 34,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomDivider: {
    height: 1,
    backgroundColor: '#242019',
  },
  zoomBtnText: {
    color: '#ded5c7',
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '400',
  },
  svgWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCanvasContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    maxWidth: 420,
  },
  emptySymbolBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(229,169,60,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(229,169,60,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyCanvasIcon: {
    fontSize: 26,
    color: '#e5a93c',
  },
  emptyCanvasTitle: {
    fontSize: 18,
    fontFamily: AppFonts.serif,
    fontWeight: '700',
    color: '#ded5c7',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyCanvasDesc: {
    fontSize: 13,
    color: '#8f887b',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  emptyCanvasBtn: {
    backgroundColor: '#e5a93c',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
  },
  emptyCanvasBtnText: {
    color: '#12100d',
    fontWeight: '700',
    fontSize: 13.5,
  },
  loadingOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#8f887b',
    fontSize: 13,
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
    flexWrap: 'wrap',
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
  statusBadge: {
    backgroundColor: 'rgba(229,169,60,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(229,169,60,0.3)',
  },
  statusBadgeText: {
    fontSize: 10,
    color: '#e5a93c',
    fontWeight: '600',
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
    marginBottom: 4,
  },
  nodeDetailDesc: {
    fontSize: 13,
    lineHeight: 18,
    color: '#9e9587',
    fontFamily: AppFonts.sans,
    marginBottom: 8,
  },
  previewTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  previewTag: {
    fontSize: 11,
    color: '#b0a696',
    backgroundColor: '#201d17',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  cardActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  viewDetailLink: {
    paddingVertical: 4,
  },
  viewDetailText: {
    color: '#db9d33',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: AppFonts.sans,
  },
  cardActionBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  editActionBtn: {
    backgroundColor: '#231f18',
    borderWidth: 1,
    borderColor: '#3a3427',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
  },
  editActionText: {
    color: '#e5a93c',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteActionBtn: {
    backgroundColor: '#241414',
    borderWidth: 1,
    borderColor: '#4d2020',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
  },
  deleteActionText: {
    color: '#e05252',
    fontSize: 12,
    fontWeight: '600',
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
    paddingHorizontal: 16,
  },
  modalCardLarge: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: '#191713',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#383226',
    padding: 20,
    gap: 14,
  },
  modalTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    color: '#e5a93c',
    fontFamily: AppFonts.serif,
    fontWeight: '700',
  },
  modalInputGroup: {
    gap: 5,
  },
  modalInputLabel: {
    fontSize: 12,
    color: '#a39a8c',
    fontWeight: '600',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#2d281f',
    backgroundColor: '#12110e',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#f5eee6',
    fontSize: 13.5,
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
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
  dynamicSectionBox: {
    backgroundColor: '#13110e',
    borderWidth: 1,
    borderColor: '#29251e',
    borderRadius: 8,
    padding: 12,
    gap: 10,
  },
  dynamicSectionHeader: {
    fontSize: 11,
    letterSpacing: 1.5,
    color: '#e5a93c',
    fontWeight: '700',
    fontFamily: AppFonts.mono,
    marginBottom: 2,
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 4,
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
  detailsGridBox: {
    backgroundColor: '#13110e',
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#26221a',
    gap: 6,
  },
  detailsGridTitle: {
    fontSize: 11,
    letterSpacing: 1.5,
    color: '#e5a93c',
    fontWeight: '700',
    fontFamily: AppFonts.mono,
    marginBottom: 4,
  },
  detailRowItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1813',
  },
  detailItemKey: {
    fontSize: 12,
    color: '#8f887b',
    flex: 1,
  },
  detailItemVal: {
    fontSize: 12.5,
    color: '#ded5c7',
    fontWeight: '500',
    flex: 1.4,
    textAlign: 'right',
  },
  detailItemValMono: {
    fontSize: 11.5,
    color: '#a39a8c',
    fontFamily: AppFonts.mono,
    flex: 1.4,
    textAlign: 'right',
  },
  nodeRelationsBox: {
    backgroundColor: '#12100e',
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#26221a',
    gap: 6,
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
  detailModalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#242019',
    paddingTop: 12,
  },
  modalEditBtn: {
    backgroundColor: '#231f18',
    borderWidth: 1,
    borderColor: '#3a3427',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  modalEditText: {
    color: '#e5a93c',
    fontSize: 13,
    fontWeight: '600',
  },
  modalDeleteBtn: {
    backgroundColor: '#241414',
    borderWidth: 1,
    borderColor: '#4d2020',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  modalDeleteText: {
    color: '#e05252',
    fontSize: 13,
    fontWeight: '600',
  },
});
