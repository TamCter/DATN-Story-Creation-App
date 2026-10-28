import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  INITIAL_PROJECTS,
  NODE_TYPE_CONFIG,
  StoryLink,
  StoryNode,
  StoryProject,
} from '@/constants/story-data';
import { AppFonts, ThemeColors } from '@/constants/theme';
import { projectStore } from '@/services/project-store';

interface LinkExtendedMeta {
  category: string;
  contextNote: string;
  tone: 'loyalty' | 'hostile' | 'possession' | 'sect' | 'event' | 'location';
}

const LINK_METAS: Record<string, LinkExtendedMeta> = {
  l1: {
    category: 'TƯƠNG TRỢ & TÌNH CẢM',
    contextNote: 'Lăng Tiêu tin tưởng Mộc Lan vì được nàng cứu chữa vết thương trí mạng.',
    tone: 'loyalty',
  },
  l2: {
    category: 'ÂN OÁN HUYNH ĐỆ',
    contextNote: 'Từng là huynh đệ kết nghĩa sinh tử trước khi thảm kịch xảy ra.',
    tone: 'loyalty',
  },
  l3: {
    category: 'BẢO VẬT CHÍ TÔN',
    contextNote: 'Lăng Tiêu giữ chuôi kiếm – mảnh vỡ duy nhất còn lưu lại sau đêm tàn sát.',
    tone: 'possession',
  },
  l4: {
    category: 'QUYỀN LỰC VÕ LÂM',
    contextNote: 'Triệu Vô Cực là minh chủ tối cao thống lĩnh toàn bộ liên minh.',
    tone: 'sect',
  },
  l5: {
    category: 'MÔN PHÁI TRUYỀN THỪA',
    contextNote: 'Mộc Lan là đệ tử y thuật chân truyền của cốc chủ Bạch Liên Cốc.',
    tone: 'sect',
  },
  l6: {
    category: 'BIẾN CỐ & SỐNG CÒN',
    contextNote: 'Cả sơn trang bị diệt môn, chỉ có Lăng Tiêu may mắn trốn thoát trong biển lửa.',
    tone: 'event',
  },
  l7: {
    category: 'ÂM MƯU PHẢN BỘI',
    contextNote: 'Triệu Vô Cực đứng sau thảm án nhằm diệt trừ đối thủ và đoạt bảo kiếm.',
    tone: 'hostile',
  },
  l8: {
    category: 'ĐỊA DANH BIẾN CỐ',
    contextNote: 'Thảm kịch hỏa thiêu diễn ra tại sơn trang nằm ngay ngoại ô thành.',
    tone: 'location',
  },
  l9: {
    category: 'THẤT LẠC HIỂM ĐỊA',
    contextNote: 'Mảnh mũi kiếm rơi xuống đáy vực sâu ngút ngàn, sát khí phủ kín.',
    tone: 'location',
  },
  l10: {
    category: 'ĐẠI HỘI VÕ LÂM',
    contextNote: 'Mảnh thân kiếm thứ hai bất ngờ xuất hiện giữa lúc liên minh tụ hội.',
    tone: 'possession',
  },
  l11: {
    category: 'THẾ LỰC TỔ CHỨC',
    contextNote: 'Thiên Hạ Minh đứng ra triệu tập toàn bộ các phái nhằm mưu đồ thâu tóm.',
    tone: 'sect',
  },
  l12: {
    category: 'DÒ XÉT & ĐỐI KHÁNG',
    contextNote: 'Thiên Hạ Minh bí mật cài gián điệp theo dõi nhất cử nhất động của Bạch Liên Cốc.',
    tone: 'hostile',
  },
  l13: {
    category: 'CỐT TRUYỆN CHÍNH',
    contextNote: 'Toàn bộ cuộc đào thoát xoay quanh nỗ lực sinh tồn của Lăng Tiêu.',
    tone: 'event',
  },
  l14: {
    category: 'ĐÍCH ĐẾN BƯỚC ĐẦU',
    contextNote: 'Lăng Tiêu kiệt sức vượt qua biên giới tuyết phủ và dừng chân tại Hàn Nguyệt Thành.',
    tone: 'location',
  },
};

export default function LinksScreen() {
  const params = useLocalSearchParams();
  const projectId = (params.projectId as string) || 'project-1';
  const initialQuery = (params.query as string) || '';

  const [currentProject, setCurrentProject] = useState<StoryProject>(() => {
    const match = INITIAL_PROJECTS.find((p) => p.id === projectId);
    return (
      match || {
        id: projectId,
        title: 'Đang tải...',
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

  const [links, setLinks] = useState<StoryLink[]>(currentProject.links || []);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const proj = await projectStore.getProject(projectId);
        if (isMounted) {
          setCurrentProject(proj);
          setLinks(proj.links || []);
        }
      } catch (err) {
        console.warn('Lỗi tải liên kết:', err);
      }
    }
    void load();
    return () => {
      isMounted = false;
    };
  }, [projectId]);

  const nodes = currentProject.nodes;
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedEntityFilter, setSelectedEntityFilter] = useState<string>('all');

  // Add Link Modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [sourceNodeId, setSourceNodeId] = useState(nodes[0]?.id || '');
  const [targetNodeId, setTargetNodeId] = useState(nodes[1]?.id || '');
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkType, setNewLinkType] = useState<'solid' | 'dashed'>('dashed');

  // Node lookup map
  const nodeMap = useMemo(() => {
    const map = new Map<string, StoryNode>();
    nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [nodes]);

  const filteredLinks = useMemo(() => {
    return links.filter((link) => {
      const src = nodeMap.get(link.source);
      const tgt = nodeMap.get(link.target);
      if (!src || !tgt) return false;

      const meta = LINK_METAS[link.id];

      // Entity filter
      if (selectedEntityFilter !== 'all') {
        if (link.source !== selectedEntityFilter && link.target !== selectedEntityFilter) {
          return false;
        }
      }

      // Category filter
      if (selectedCategory !== 'all') {
        if (selectedCategory === 'characters' && (src.type !== 'character' || tgt.type !== 'character')) {
          return false;
        }
        if (selectedCategory === 'items' && (src.type === 'item' || tgt.type === 'item')) {
          // matches item
        } else if (selectedCategory === 'items') {
          return false;
        }
        if (selectedCategory === 'factions' && (src.type === 'faction' || tgt.type === 'faction')) {
          // matches faction
        } else if (selectedCategory === 'factions') {
          return false;
        }
        if (selectedCategory === 'locations' && (src.type === 'location' || tgt.type === 'location' || src.type === 'event' || tgt.type === 'event')) {
          // matches event or location
        } else if (selectedCategory === 'locations') {
          return false;
        }
      }

      // Search query
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;

      return (
        src.name.toLowerCase().includes(q) ||
        tgt.name.toLowerCase().includes(q) ||
        (link.label && link.label.toLowerCase().includes(q)) ||
        (meta && meta.contextNote.toLowerCase().includes(q))
      );
    });
  }, [links, nodeMap, selectedEntityFilter, selectedCategory, searchQuery]);

  const handleCreateLink = async () => {
    if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) return;
    try {
      const created = await projectStore.createLink(projectId, {
        source: sourceNodeId,
        target: targetNodeId,
        label: newLinkLabel.trim() || 'liên hệ',
        type: newLinkType,
      });

      LINK_METAS[created.id] = {
        category: 'MỐI LIÊN HỆ MỚI',
        contextNote: 'Liên kết được thiết lập trực tiếp trong đồ thị cốt truyện.',
        tone: 'loyalty',
      };

      setLinks((prev) => [...prev, created]);
      setAddModalOpen(false);
      setNewLinkLabel('');
    } catch (err: any) {
      console.warn('Lỗi tạo liên kết:', err);
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    try {
      await projectStore.deleteLink(projectId, linkId);
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
    } catch (err: any) {
      console.warn('Lỗi xóa liên kết:', err);
    }
  };

  const getToneColor = (tone?: string) => {
    switch (tone) {
      case 'loyalty':
        return '#e5a93c';
      case 'possession':
        return '#42b883';
      case 'sect':
        return '#d95a38';
      case 'event':
        return '#5b8ec2';
      case 'hostile':
        return '#e05252';
      case 'location':
        return '#9f70cf';
      default:
        return '#e5a93c';
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.headerBar}>
        <View style={styles.headerLeftGroup}>
          <Pressable
            hitSlop={12}
            style={({ pressed }) => [
              styles.backBtn,
              pressed && styles.backBtnPressed,
            ]}
            onPress={() => router.back()}>
            <Text style={styles.backBtnIcon}>‹</Text>
          </Pressable>
          <View>
            <Text style={styles.headerTitle}>Mối liên kết</Text>
            <Text style={styles.headerSubtitle}>
              {currentProject.title} · {links.length} CẠNH NỐI
            </Text>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.addHeaderBtn,
            pressed && styles.addHeaderBtnPressed,
          ]}
          onPress={() => setAddModalOpen(true)}>
          <Text style={styles.addHeaderBtnPlus}>+</Text>
          <Text style={styles.addHeaderBtnText}>Thêm</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* World Graph Summary Banner */}
        <View style={styles.statsBanner}>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: '#e5a93c' }]}>
              {links.length}
            </Text>
            <Text style={styles.statLabel}>LIÊN KẾT</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: '#ded5c7' }]}>
              {nodes.length}
            </Text>
            <Text style={styles.statLabel}>NODE THAM GIA</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: '#42b883' }]}>5</Text>
            <Text style={styles.statLabel}>LOẠI THỰC THỂ</Text>
          </View>
        </View>

        {/* Live Search Bar */}
        <View style={styles.searchBarContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm kiếm nhân vật, bảo vật, kiểu quan hệ..."
            placeholderTextColor="#736a5c"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={10}>
              <Text style={styles.searchClearIcon}>✕</Text>
            </Pressable>
          )}
        </View>

        {/* Category Filter Chips */}
        <View style={styles.filterRow}>
          {[
            { id: 'all', label: `Tất cả (${links.length})` },
            { id: 'characters', label: 'Nhân vật ↔ Nhân vật' },
            { id: 'factions', label: 'Môn phái & Thế lực' },
            { id: 'items', label: 'Bảo vật & Thần khí' },
            { id: 'locations', label: 'Sự kiện & Địa điểm' },
          ].map((item) => {
            const isSelected = selectedCategory === item.id;
            return (
              <Pressable
                key={item.id}
                style={[
                  styles.filterChip,
                  isSelected && styles.filterChipSelected,
                ]}
                onPress={() => setSelectedCategory(item.id)}>
                <Text
                  style={[
                    styles.filterChipText,
                    isSelected && styles.filterChipTextSelected,
                  ]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Links Cards List */}
        <View style={styles.cardsContainer}>
          {filteredLinks.map((link, index) => {
            const src = nodeMap.get(link.source);
            const tgt = nodeMap.get(link.target);
            if (!src || !tgt) return null;

            const srcConfig = NODE_TYPE_CONFIG[src.type];
            const tgtConfig = NODE_TYPE_CONFIG[tgt.type];
            const meta = LINK_METAS[link.id] || {
              category: 'MỐI LIÊN KẾT',
              contextNote: 'Hai thực thể liên quan mật thiết trong cốt truyện.',
              tone: 'loyalty',
            };

            const toneColor = getToneColor(meta.tone);

            return (
              <View key={link.id} style={styles.relationCard}>
                {/* Card Top Category & Type */}
                <View style={styles.cardTopRow}>
                  <Text style={styles.categoryBadgeText}>
                    {meta.category}
                  </Text>
                  <View style={styles.lineTypeBadge}>
                    <Text style={styles.lineTypeText}>
                      {link.type === 'solid' ? 'NÉT LIỀN · TRỰC TIẾP' : 'NÉT ĐỨT · GIÁN TIẾP'}
                    </Text>
                  </View>
                </View>

                {/* Connection Flow Stage (Left Node -> Relation Badge -> Right Node) */}
                <View style={styles.flowStage}>
                  {/* Left Node (Source) */}
                  <Pressable
                    style={styles.nodeEntityBox}
                    onPress={() => {
                      router.push({
                        pathname: '/graph' as any,
                        params: { projectId: currentProject.id },
                      });
                    }}>
                    <View style={styles.entityNameRow}>
                      <Text
                        style={[
                          styles.entitySymbol,
                          { color: srcConfig.color },
                        ]}>
                        {srcConfig.symbol}
                      </Text>
                      <Text style={styles.entityName} numberOfLines={1}>
                        {src.name}
                      </Text>
                    </View>
                    <Text style={styles.entityRole} numberOfLines={1}>
                      {src.role}
                    </Text>
                  </Pressable>

                  {/* Flow Arrow & Relation Pill */}
                  <View style={styles.connectorCenter}>
                    <View
                      style={[
                        styles.relationPill,
                        {
                          borderColor: toneColor,
                          backgroundColor: `${toneColor}18`,
                        },
                      ]}>
                      <Text style={[styles.relationPillText, { color: toneColor }]}>
                        {link.label || 'liên hệ'}
                      </Text>
                    </View>

                    {/* Vector line and arrow */}
                    <View style={styles.arrowLineWrap}>
                      <View
                        style={[
                          styles.arrowLine,
                          link.type === 'dashed' && styles.arrowLineDashed,
                        ]}
                      />
                      <Text style={[styles.arrowHead, { color: toneColor }]}>
                        ▶
                      </Text>
                    </View>
                  </View>

                  {/* Right Node (Target) */}
                  <Pressable
                    style={styles.nodeEntityBox}
                    onPress={() => {
                      router.push({
                        pathname: '/graph' as any,
                        params: { projectId: currentProject.id },
                      });
                    }}>
                    <View style={styles.entityNameRow}>
                      <Text
                        style={[
                          styles.entitySymbol,
                          { color: tgtConfig.color },
                        ]}>
                        {tgtConfig.symbol}
                      </Text>
                      <Text style={styles.entityName} numberOfLines={1}>
                        {tgt.name}
                      </Text>
                    </View>
                    <Text style={styles.entityRole} numberOfLines={1}>
                      {tgt.role}
                    </Text>
                  </Pressable>
                </View>

                {/* Lore Context Story Snippet */}
                {meta.contextNote && (
                  <View style={styles.contextNoteBox}>
                    <Text style={styles.contextNoteText}>
                      {meta.contextNote}
                    </Text>
                  </View>
                )}

                {/* Footer Quick Action */}
                <View style={styles.cardFooter}>
                  <Text style={styles.linkIndexText}>№ {index + 1 < 10 ? `0${index + 1}` : index + 1}</Text>
                  <Pressable
                    style={({ pressed }) => [
                      styles.viewOnGraphLink,
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => {
                      router.push({
                        pathname: '/graph' as any,
                        params: {
                          projectId: currentProject.id,
                        },
                      });
                    }}>
                    <Text style={styles.viewOnGraphText}>
                      Xem trên đồ thị →
                    </Text>
                  </Pressable>

                  <Pressable
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.deleteLinkBtn,
                      pressed && { opacity: 0.6 },
                    ]}
                    onPress={() => handleDeleteLink(link.id)}>
                    <Text style={styles.deleteLinkText}>🗑️ Xóa</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}

          {filteredLinks.length === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🔗</Text>
              <Text style={styles.emptyTitle}>Không tìm thấy mối liên kết</Text>
              <Text style={styles.emptyDesc}>
                Thử chọn nhóm bộ lọc khác hoặc tìm từ khóa khác.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Add Link Modal */}
      <Modal visible={addModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Thiết lập mối liên kết mới</Text>
              <Pressable
                hitSlop={12}
                onPress={() => setAddModalOpen(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            {/* Source Node Select */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>NODE NGUỒN (KHỞI ĐIỂM)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerScroll}>
                {nodes.map((n) => {
                  const isSelected = sourceNodeId === n.id;
                  const cfg = NODE_TYPE_CONFIG[n.type];
                  return (
                    <Pressable
                      key={n.id}
                      style={[
                        styles.nodePickChip,
                        isSelected && { borderColor: cfg.color, backgroundColor: `${cfg.color}18` },
                      ]}
                      onPress={() => setSourceNodeId(n.id)}>
                      <Text style={{ color: cfg.color, fontSize: 12 }}>{cfg.symbol}</Text>
                      <Text style={[styles.nodePickName, isSelected && { color: cfg.color }]}>
                        {n.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Target Node Select */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>NODE ĐÍCH (ĐẾN)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerScroll}>
                {nodes.map((n) => {
                  const isSelected = targetNodeId === n.id;
                  const cfg = NODE_TYPE_CONFIG[n.type];
                  return (
                    <Pressable
                      key={n.id}
                      style={[
                        styles.nodePickChip,
                        isSelected && { borderColor: cfg.color, backgroundColor: `${cfg.color}18` },
                      ]}
                      onPress={() => setTargetNodeId(n.id)}>
                      <Text style={{ color: cfg.color, fontSize: 12 }}>{cfg.symbol}</Text>
                      <Text style={[styles.nodePickName, isSelected && { color: cfg.color }]}>
                        {n.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Relationship Label Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>NHÃN MỐI QUAN HỆ</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ví dụ: kết nghĩa, tương trợ, truy sát, sở hữu..."
                placeholderTextColor="#665f52"
                value={newLinkLabel}
                onChangeText={setNewLinkLabel}
              />
            </View>

            {/* Connection Type */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>KIỂU ĐƯỜNG NỐI</Text>
              <View style={styles.lineTypeSelector}>
                <Pressable
                  style={[
                    styles.lineTypeBtn,
                    newLinkType === 'solid' && styles.lineTypeBtnSelected,
                  ]}
                  onPress={() => setNewLinkType('solid')}>
                  <Text
                    style={[
                      styles.lineTypeBtnText,
                      newLinkType === 'solid' && styles.lineTypeBtnTextSelected,
                    ]}>
                    Nét liền (Trực tiếp)
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.lineTypeBtn,
                    newLinkType === 'dashed' && styles.lineTypeBtnSelected,
                  ]}
                  onPress={() => setNewLinkType('dashed')}>
                  <Text
                    style={[
                      styles.lineTypeBtnText,
                      newLinkType === 'dashed' && styles.lineTypeBtnTextSelected,
                    ]}>
                    Nét đứt (Gián tiếp / Ẩn)
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.modalActionRow}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setAddModalOpen(false)}>
                <Text style={styles.modalCancelText}>Hủy</Text>
              </Pressable>
              <Pressable
                style={styles.modalSubmitBtn}
                onPress={handleCreateLink}>
                <Text style={styles.modalSubmitText}>Tạo liên kết</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: ThemeColors.background,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1c1a15',
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2d271e',
    backgroundColor: '#15130f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPressed: {
    backgroundColor: '#221e17',
    borderColor: '#e5a93c',
  },
  backBtnIcon: {
    color: '#e5a93c',
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '300',
    marginTop: -2,
  },
  headerTitle: {
    fontFamily: AppFonts.serif,
    fontStyle: 'italic',
    fontSize: 21,
    color: '#e5a93c',
    fontWeight: '600',
  },
  headerSubtitle: {
    fontFamily: AppFonts.mono,
    fontSize: 10,
    letterSpacing: 1.5,
    color: '#8f887b',
    marginTop: 2,
  },
  addHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(229,169,60,0.4)',
    backgroundColor: 'rgba(229,169,60,0.1)',
  },
  addHeaderBtnPressed: {
    backgroundColor: 'rgba(229,169,60,0.22)',
  },
  addHeaderBtnPlus: {
    color: '#e5a93c',
    fontSize: 16,
    fontWeight: '700',
    marginTop: -1,
  },
  addHeaderBtnText: {
    color: '#e5a93c',
    fontSize: 12.5,
    fontWeight: '600',
    fontFamily: AppFonts.sans,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 48,
    maxWidth: 620,
    width: '100%',
    alignSelf: 'center',
  },
  statsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#14120e',
    borderWidth: 1,
    borderColor: '#252119',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  statBox: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: AppFonts.mono,
  },
  statLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: '#7a7263',
    fontFamily: AppFonts.mono,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#252119',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#15130f',
    borderWidth: 1,
    borderColor: '#28231b',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  searchIcon: {
    fontSize: 13,
    marginRight: 8,
    opacity: 0.8,
  },
  searchInput: {
    flex: 1,
    color: '#f5eee6',
    fontSize: 13.5,
    fontFamily: AppFonts.sans,
    padding: 0,
  },
  searchClearIcon: {
    color: '#8f887b',
    fontSize: 13,
    paddingHorizontal: 4,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#15130f',
    borderWidth: 1,
    borderColor: '#26221a',
  },
  filterChipSelected: {
    backgroundColor: 'rgba(229,169,60,0.12)',
    borderColor: '#e5a93c',
  },
  filterChipText: {
    fontSize: 12,
    color: '#8f887b',
    fontWeight: '500',
    fontFamily: AppFonts.sans,
  },
  filterChipTextSelected: {
    color: '#e5a93c',
    fontWeight: '600',
  },
  cardsContainer: {
    gap: 14,
  },
  relationCard: {
    backgroundColor: '#14120e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#25211a',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryBadgeText: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: '#8f887b',
    fontWeight: '700',
    fontFamily: AppFonts.mono,
  },
  lineTypeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#1a1813',
    borderWidth: 1,
    borderColor: '#2b261d',
  },
  lineTypeText: {
    fontSize: 9.5,
    color: '#7a7263',
    fontFamily: AppFonts.mono,
  },
  flowStage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 4,
  },
  nodeEntityBox: {
    flex: 1,
    backgroundColor: '#181611',
    borderWidth: 1,
    borderColor: '#2a251e',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  entityNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  entitySymbol: {
    fontSize: 13,
  },
  entityName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f5eee6',
    fontFamily: AppFonts.serif,
    flex: 1,
  },
  entityRole: {
    fontSize: 10,
    letterSpacing: 0.8,
    color: '#8a8274',
    fontFamily: AppFonts.mono,
    marginTop: 2,
  },
  connectorCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 110,
    gap: 4,
  },
  relationPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  relationPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    fontStyle: 'italic',
    fontFamily: AppFonts.serif,
  },
  arrowLineWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
  },
  arrowLine: {
    flex: 1,
    height: 1.5,
    backgroundColor: '#3a3428',
  },
  arrowLineDashed: {
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#4d4536',
    height: 0,
  },
  arrowHead: {
    fontSize: 10,
    marginLeft: 2,
    marginTop: -0.5,
  },
  contextNoteBox: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1d1a14',
  },
  contextNoteText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#9e9587',
    fontStyle: 'italic',
    fontFamily: AppFonts.serif,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1c1913',
  },
  linkIndexText: {
    fontSize: 10,
    color: '#635c4e',
    fontFamily: AppFonts.mono,
  },
  viewOnGraphLink: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewOnGraphText: {
    fontSize: 11.5,
    color: '#e5a93c',
    fontWeight: '600',
    fontFamily: AppFonts.sans,
  },
  deleteLinkBtn: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#261715',
    borderWidth: 1,
    borderColor: '#4d221c',
  },
  deleteLinkText: {
    color: '#e05252',
    fontSize: 11,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 10,
  },
  emptyIcon: {
    fontSize: 32,
    color: '#423c30',
  },
  emptyTitle: {
    fontSize: 16,
    color: '#b5ab99',
    fontWeight: '600',
    fontFamily: AppFonts.serif,
  },
  emptyDesc: {
    fontSize: 13,
    color: '#6e6554',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: '#171511',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#383226',
    padding: 22,
    gap: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    color: '#e5a93c',
    fontFamily: AppFonts.serif,
    fontWeight: '600',
  },
  modalCloseText: {
    color: '#8f887b',
    fontSize: 16,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 10.5,
    letterSpacing: 1.5,
    color: '#8f887b',
    fontFamily: AppFonts.mono,
  },
  pickerScroll: {
    maxHeight: 46,
  },
  nodePickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: '#11100d',
    borderWidth: 1,
    borderColor: '#2b271e',
    marginRight: 8,
  },
  nodePickName: {
    fontSize: 12.5,
    color: '#c2b9aa',
    fontWeight: '500',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#2c271e',
    backgroundColor: '#11100d',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#f5eee6',
    fontSize: 13.5,
    fontFamily: AppFonts.sans,
  },
  lineTypeSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  lineTypeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#11100d',
    borderWidth: 1,
    borderColor: '#2c271e',
  },
  lineTypeBtnSelected: {
    backgroundColor: 'rgba(229,169,60,0.15)',
    borderColor: '#e5a93c',
  },
  lineTypeBtnText: {
    fontSize: 12,
    color: '#8f887b',
    fontWeight: '500',
  },
  lineTypeBtnTextSelected: {
    color: '#e5a93c',
    fontWeight: '600',
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
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
  modalSubmitBtn: {
    backgroundColor: '#e5a93c',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  modalSubmitText: {
    color: '#11100d',
    fontWeight: '700',
    fontSize: 13.5,
  },
});
