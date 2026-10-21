import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
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
  StoryNode,
} from '@/constants/story-data';
import { AppFonts, ThemeColors } from '@/constants/theme';

interface FragmentItem {
  id: string;
  name: string;
  status: 'possessed' | 'revealed' | 'lost' | 'unknown';
  holderOrLocation: string;
  holderType: 'character' | 'location' | 'event' | 'unknown';
  lore: string;
}

interface ItemExtendedData {
  rarity: string;
  origin: string;
  element: string;
  fragments?: FragmentItem[];
  traits: string[];
  associatedNodes: Array<{ name: string; type: string; role: string }>;
}

const ITEM_EXTRAS: Record<string, ItemExtendedData> = {
  'kiem-hoang-hon': {
    rarity: 'THẦN BINH THƯỢNG CỔ · CHÍ TÔN',
    origin: 'Rèn từ Thiên Ngoại Thần Thiết vào thời thượng cổ',
    element: 'Sát Khí · Oán Niệm Ký Ức',
    fragments: [
      {
        id: 'frag-1',
        name: 'Mảnh 1 · Chuôi Kiếm',
        status: 'possessed',
        holderOrLocation: 'Lăng Tiêu đang nắm giữ',
        holderType: 'character',
        lore: 'Kỷ vật duy nhất còn lại sau Đêm Hỏa Thiêu Sơn Trang.',
      },
      {
        id: 'frag-2',
        name: 'Mảnh 2 · Thân Kiếm Trên',
        status: 'revealed',
        holderOrLocation: 'Xuất hiện tại Hội Thề Nguyệt Hạ',
        holderType: 'event',
        lore: 'Mảnh kiếm kích động lòng tham của toàn thể võ lâm.',
      },
      {
        id: 'frag-3',
        name: 'Mảnh 3 · Mũi Kiếm',
        status: 'lost',
        holderOrLocation: 'Rơi xuống Vực Vọng Hồn',
        holderType: 'location',
        lore: 'Thất lạc dưới vực sâu vạn trượng, sát khí ngút trời.',
      },
      {
        id: 'frag-4',
        name: 'Mảnh 4 · Tàn Phiến',
        status: 'unknown',
        holderOrLocation: 'Lưu lạc biên ải phương Bắc',
        holderType: 'unknown',
        lore: 'Chưa từng lộ diện trước mắt thế nhân.',
      },
      {
        id: 'frag-5',
        name: 'Mảnh 5 · Hàn Nhận',
        status: 'unknown',
        holderOrLocation: 'Bí mật cất giấu',
        holderType: 'unknown',
        lore: 'Chỉ nghe đồn đại trong bí tịch tàn khuyết.',
      },
      {
        id: 'frag-6',
        name: 'Mảnh 6 · Huyết Đoạn',
        status: 'unknown',
        holderOrLocation: 'Chưa rõ tung tích',
        holderType: 'unknown',
        lore: 'Ký ức của kiếm khách đệ nhất thiên hạ từng ngã xuống.',
      },
      {
        id: 'frag-7',
        name: 'Mảnh 7 · Tâm Kiếm',
        status: 'unknown',
        holderOrLocation: 'Mảnh vỡ then chốt cuối cùng',
        holderType: 'unknown',
        lore: 'Nắm giữ linh hồn chân chính của Kiếm Hoàng Hôn.',
      },
    ],
    traits: [
      '🩸 Nhớ ký ức của chủ nhân đã chết bởi kiếm',
      '⚡ Phát tín hiệu cộng hưởng khi các mảnh ở gần',
      '⚔ Hợp nhất 7 mảnh sẽ mở ra bí tịch kiếm đạo tuyệt đỉnh',
    ],
    associatedNodes: [
      { name: 'Lăng Tiêu', type: 'character', role: 'Sở hữu chuôi kiếm' },
      { name: 'Triệu Vô Cực', type: 'character', role: 'Dã tâm đoạt trọn bộ' },
      { name: 'Hội Thề Nguyệt Hạ', type: 'event', role: 'Nơi mảnh 2 lộ diện' },
      { name: 'Vực Vọng Hồn', type: 'location', role: 'Nơi mảnh 3 rơi rụng' },
    ],
  },
};

export default function ItemsScreen() {
  const params = useLocalSearchParams();
  const projectId = (params.projectId as string) || 'project-1';

  const currentProject = useMemo(() => {
    return (
      INITIAL_PROJECTS.find((p) => p.id === projectId) || INITIAL_PROJECTS[0]
    );
  }, [projectId]);

  const initialItems = useMemo(() => {
    return currentProject.nodes.filter((n) => n.type === 'item');
  }, [currentProject]);

  const [items, setItems] = useState<StoryNode[]>(initialItems);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'weapon' | 'fragment' | 'scroll'>('all');
  const [expandedItemId, setExpandedItemId] = useState<string>('kiem-hoang-hon');

  // Add Item Modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemRole, setNewItemRole] = useState('THẦN BINH');
  const [newItemDesc, setNewItemDesc] = useState('');

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.desc.toLowerCase().includes(q) ||
        (item.role && item.role.toLowerCase().includes(q));
      if (!matchesSearch) return false;

      if (selectedFilter === 'all') return true;
      if (selectedFilter === 'weapon') {
        const extra = ITEM_EXTRAS[item.id];
        return extra && extra.fragments && extra.fragments.length === 0;
      }
      if (selectedFilter === 'fragment') {
        const extra = ITEM_EXTRAS[item.id];
        return extra && extra.fragments && extra.fragments.length > 0;
      }
      if (selectedFilter === 'scroll') {
        return item.subType?.toLowerCase().includes('bí kíp') || item.subType?.toLowerCase().includes('phổ') || false;
      }
      return true;
    });
  }, [items, searchQuery, selectedFilter]);

  const handleAddItem = () => {
    if (!newItemName.trim()) return;
    const newId = `item-${Date.now()}`;
    const newItem: StoryNode = {
      id: newId,
      name: newItemName.trim(),
      type: 'item',
      role: newItemRole.trim() || 'BẢO VẬT',
      subType: 'BẢO KHÍ GIANG HỒ',
      desc: newItemDesc.trim() || 'Cổ vật võ lâm mang theo bí mật chưa có lời giải.',
      x: 220,
      y: 420,
    };

    setItems((prev) => [...prev, newItem]);
    setAddModalOpen(false);
    setNewItemName('');
    setNewItemRole('THẦN BINH');
    setNewItemDesc('');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header Bar */}
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
            <Text style={styles.headerTitle}>Vật phẩm</Text>
            <Text style={styles.headerSubtitle}>
              {currentProject.title} · {items.length} BẢO VẬT
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
        {/* World Artifacts Summary Banner */}
        <View style={styles.statsBanner}>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: '#42b883' }]}>
              {items.length}
            </Text>
            <Text style={styles.statLabel}>BẢO VẬT CHÍ TÔN</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: '#e5a93c' }]}>7</Text>
            <Text style={styles.statLabel}>MẢNH KIẾM VỠ</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: '#5b8ec2' }]}>3 / 7</Text>
            <Text style={styles.statLabel}>ĐÃ LỘ DIỆN</Text>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBarContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm kiếm kiếm phổ, thần binh, mảnh vỡ..."
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

        {/* Category Filters */}
        <View style={styles.filterRow}>
          {[
            { id: 'all', label: `Tất cả (${items.length})` },
            { id: 'fragment', label: `Có mảnh vỡ (${items.filter((i) => (ITEM_EXTRAS[i.id]?.fragments?.length ?? 0) > 0).length})` },
          ].map((item) => {
            const isSelected = selectedFilter === item.id;
            return (
              <Pressable
                key={item.id}
                style={[
                  styles.filterChip,
                  isSelected && styles.filterChipSelected,
                ]}
                onPress={() => setSelectedFilter(item.id as any)}>
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

        {/* Items List */}
        <View style={styles.cardsContainer}>
          {filteredItems.map((item) => {
            const extra = ITEM_EXTRAS[item.id] || {
              rarity: 'BẢO KHÍ GIANG HỒ',
              origin: 'Vũ khí lưu lạc',
              element: 'Bí ẩn',
              fragments: [],
              traits: ['Mang theo ký ức lịch sử'],
              associatedNodes: [],
            };

            const isExpanded = expandedItemId === item.id;

            return (
              <View key={item.id} style={styles.itemCard}>
                {/* Glow Accent Header */}
                <View style={styles.cardHeader}>
                  <View style={styles.emblemAndTitle}>
                    <View style={styles.emblemGemFrame}>
                      <Text style={styles.emblemDiamond}>◆</Text>
                    </View>
                    <View style={styles.titleArea}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemRarity}>
                        {extra.rarity || item.role}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.fragmentCountBadge}>
                    <Text style={styles.fragmentBadgeText}>{item.role}</Text>
                  </View>
                </View>

                {/* Ancient Inscription Quote Box */}
                <View style={styles.loreBlock}>
                  <Text style={styles.loreQuoteMark}>“</Text>
                  <Text style={styles.loreText}>{item.desc}</Text>
                </View>

                {/* 7-Fragment Visual Matrix Tracker */}
                {extra.fragments && extra.fragments.length > 0 && (
                  <View style={styles.fragmentMatrixBox}>
                    <View style={styles.matrixHeader}>
                      <Text style={styles.matrixTitle}>
                        BẢN ĐỒ 7 MẢNH VỠ KIẾM HOÀNG HÔN
                      </Text>
                      <Text style={styles.matrixProgressText}>
                        3/7 ĐÃ XUẤT HIỆN
                      </Text>
                    </View>

                    {/* Progress Bar */}
                    <View style={styles.progressBarTrack}>
                      <View style={[styles.progressBarFill, { width: '43%' }]} />
                    </View>

                    {/* Fragments List Grid */}
                    <View style={styles.fragmentsList}>
                      {extra.fragments.map((frag, fIdx) => {
                        const isPossessed = frag.status === 'possessed';
                        const isRevealed = frag.status === 'revealed';
                        const isLost = frag.status === 'lost';
                        const statusColor = isPossessed
                          ? '#e5a93c'
                          : isRevealed
                          ? '#5b8ec2'
                          : isLost
                          ? '#9f70cf'
                          : '#5e574a';

                        const statusBadge = isPossessed
                          ? 'ĐANG NẮM GIỮ'
                          : isRevealed
                          ? 'LỘ DIỆN'
                          : isLost
                          ? 'THẤT LẠC'
                          : 'ẨN TÍCH';

                        return (
                          <View
                            key={frag.id}
                            style={[
                              styles.fragmentRow,
                              (isPossessed || isRevealed) && styles.fragmentRowActive,
                            ]}>
                            <View style={styles.fragLeft}>
                              <Text
                                style={[
                                  styles.fragDot,
                                  { color: statusColor },
                                ]}>
                                {isPossessed ? '🗡' : isRevealed ? '✦' : isLost ? '▲' : '✧'}
                              </Text>
                              <View>
                                <Text style={styles.fragName}>{frag.name}</Text>
                                <Text style={styles.fragLocation}>
                                  {frag.holderOrLocation}
                                </Text>
                              </View>
                            </View>

                            <View
                              style={[
                                styles.fragStatusBadge,
                                {
                                  borderColor: statusColor,
                                  backgroundColor: `${statusColor}15`,
                                },
                              ]}>
                              <Text
                                style={[
                                  styles.fragStatusText,
                                  { color: statusColor },
                                ]}>
                                {statusBadge}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Supernatural Traits */}
                {extra.traits && extra.traits.length > 0 && (
                  <View style={styles.traitsSection}>
                    <Text style={styles.traitsSectionTitle}>
                      ĐẶC TÍNH THẦN THOẠI
                    </Text>
                    {extra.traits.map((trait, tIdx) => (
                      <View key={tIdx} style={styles.traitRow}>
                        <Text style={styles.traitText}>{trait}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Associated Story Links */}
                {extra.associatedNodes && extra.associatedNodes.length > 0 && (
                  <View style={styles.associatedBox}>
                    <Text style={styles.associatedTitle}>
                      MỐI LIÊN KẾT GIANG HỒ ({extra.associatedNodes.length})
                    </Text>
                    <View style={styles.associatedChipsWrap}>
                      {extra.associatedNodes.map((assoc, aIdx) => (
                        <View key={aIdx} style={styles.assocChip}>
                          <Text style={styles.assocName}>
                            {assoc.name}
                          </Text>
                          <Text style={styles.assocRole}>
                            · {assoc.role}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Card Action Row */}
                <View style={styles.cardActionsRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.actionOutlineBtn,
                      pressed && styles.actionOutlineBtnPressed,
                    ]}
                    onPress={() => {
                      router.push({
                        pathname: '/graph/links' as any,
                        params: {
                          projectId: currentProject.id,
                          query: item.name,
                        },
                      });
                    }}>
                    <Text style={styles.actionOutlineBtnText}>
                      Xem {extra.associatedNodes.length} mối liên kết →
                    </Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.actionPrimaryBtn,
                      pressed && styles.actionPrimaryBtnPressed,
                    ]}
                    onPress={() => {
                      router.push({
                        pathname: '/graph' as any,
                        params: {
                          projectId: currentProject.id,
                        },
                      });
                    }}>
                    <Text style={styles.actionPrimaryBtnText}>
                      Định vị trên đồ thị
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })}

          {filteredItems.length === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>◆</Text>
              <Text style={styles.emptyTitle}>Không tìm thấy vật phẩm nào</Text>
              <Text style={styles.emptyDesc}>
                Thử thay đổi từ khóa tìm kiếm.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Add Item Modal */}
      <Modal visible={addModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Thêm bảo vật / Thần binh</Text>
              <Pressable
                hitSlop={12}
                onPress={() => setAddModalOpen(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>TÊN VẬT PHẨM / THẦN KHÍ</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ví dụ: Đồ Long Đao, Cửu Âm Chân Kinh..."
                placeholderTextColor="#665f52"
                value={newItemName}
                onChangeText={setNewItemName}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>PHÂN LOẠI / PHẨM GIAI</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ví dụ: THẦN BINH THƯỢNG CỔ, BẢO VẬT, 7 MẢNH..."
                placeholderTextColor="#665f52"
                value={newItemRole}
                onChangeText={setNewItemRole}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>TRUYỀN THUYẾT & NGUỒN GỐC</Text>
              <TextInput
                style={[styles.textInput, { height: 75, textAlignVertical: 'top' }]}
                placeholder="Ghi chú về lai lịch, uy lực và nơi cất giấu bảo vật..."
                placeholderTextColor="#665f52"
                multiline
                value={newItemDesc}
                onChangeText={setNewItemDesc}
              />
            </View>

            <View style={styles.modalActionRow}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setAddModalOpen(false)}>
                <Text style={styles.modalCancelText}>Hủy</Text>
              </Pressable>
              <Pressable
                style={styles.modalSubmitBtn}
                onPress={handleAddItem}>
                <Text style={styles.modalSubmitText}>Thêm vật phẩm</Text>
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
    borderColor: '#42b883',
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
    borderColor: 'rgba(66, 184, 131, 0.4)',
    backgroundColor: 'rgba(66, 184, 131, 0.1)',
  },
  addHeaderBtnPressed: {
    backgroundColor: 'rgba(66, 184, 131, 0.22)',
  },
  addHeaderBtnPlus: {
    color: '#42b883',
    fontSize: 16,
    fontWeight: '700',
    marginTop: -1,
  },
  addHeaderBtnText: {
    color: '#42b883',
    fontSize: 12.5,
    fontWeight: '600',
    fontFamily: AppFonts.sans,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 48,
    maxWidth: 580,
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
    paddingHorizontal: 13,
    borderRadius: 20,
    backgroundColor: '#15130f',
    borderWidth: 1,
    borderColor: '#26221a',
  },
  filterChipSelected: {
    backgroundColor: 'rgba(66, 184, 131, 0.12)',
    borderColor: '#42b883',
  },
  filterChipText: {
    fontSize: 12,
    color: '#8f887b',
    fontWeight: '500',
    fontFamily: AppFonts.sans,
  },
  filterChipTextSelected: {
    color: '#42b883',
    fontWeight: '600',
  },
  cardsContainer: {
    gap: 18,
  },
  itemCard: {
    backgroundColor: '#14120e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#242019',
    borderTopWidth: 3,
    borderTopColor: '#42b883',
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  emblemAndTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  emblemGemFrame: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#42b883',
    backgroundColor: 'rgba(66, 184, 131, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emblemDiamond: {
    color: '#42b883',
    fontSize: 22,
    fontWeight: '700',
  },
  titleArea: {
    flex: 1,
  },
  itemName: {
    fontFamily: AppFonts.serif,
    fontSize: 20,
    color: '#f5eee6',
    fontWeight: '700',
  },
  itemRarity: {
    fontSize: 10.5,
    letterSpacing: 1.5,
    color: '#42b883',
    fontFamily: AppFonts.mono,
    marginTop: 2,
  },
  fragmentCountBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(66, 184, 131, 0.5)',
    backgroundColor: 'rgba(66, 184, 131, 0.12)',
  },
  fragmentBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#42b883',
    letterSpacing: 1.2,
    fontFamily: AppFonts.mono,
  },
  loreBlock: {
    flexDirection: 'row',
    backgroundColor: '#11100d',
    borderLeftWidth: 2,
    borderLeftColor: '#42b883',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 4,
    marginVertical: 10,
    gap: 6,
  },
  loreQuoteMark: {
    fontSize: 20,
    lineHeight: 20,
    color: '#42b883',
    fontFamily: AppFonts.serif,
    opacity: 0.6,
  },
  loreText: {
    flex: 1,
    fontSize: 13.5,
    lineHeight: 20,
    fontStyle: 'italic',
    color: '#c2b9aa',
    fontFamily: AppFonts.serif,
  },
  fragmentMatrixBox: {
    backgroundColor: '#100f0c',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#242019',
    padding: 14,
    marginVertical: 10,
    gap: 10,
  },
  matrixHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  matrixTitle: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: '#8f887b',
    fontFamily: AppFonts.mono,
  },
  matrixProgressText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#e5a93c',
    fontFamily: AppFonts.mono,
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: '#1f1c16',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#42b883',
    borderRadius: 2,
  },
  fragmentsList: {
    gap: 8,
    marginTop: 4,
  },
  fragmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#14120e',
    borderWidth: 1,
    borderColor: '#1e1b15',
  },
  fragmentRowActive: {
    borderColor: 'rgba(66, 184, 131, 0.25)',
    backgroundColor: '#161410',
  },
  fragLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  fragDot: {
    fontSize: 14,
    width: 18,
    textAlign: 'center',
  },
  fragName: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#ded5c7',
    fontFamily: AppFonts.sans,
  },
  fragLocation: {
    fontSize: 11,
    color: '#7a7263',
    fontFamily: AppFonts.sans,
  },
  fragStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 1,
  },
  fragStatusText: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: AppFonts.mono,
  },
  traitsSection: {
    gap: 6,
    marginVertical: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: '#1d1a14',
  },
  traitsSectionTitle: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: '#8f887b',
    fontFamily: AppFonts.mono,
    marginBottom: 4,
  },
  traitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  traitText: {
    fontSize: 12.5,
    color: '#b5ab99',
    fontFamily: AppFonts.sans,
    lineHeight: 18,
  },
  associatedBox: {
    marginTop: 8,
    marginBottom: 12,
  },
  associatedTitle: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: '#8f887b',
    fontFamily: AppFonts.mono,
    marginBottom: 8,
  },
  associatedChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  assocChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#191712',
    borderWidth: 1,
    borderColor: '#29251e',
  },
  assocName: {
    fontSize: 11.5,
    color: '#ded5c7',
    fontWeight: '600',
  },
  assocRole: {
    fontSize: 11,
    color: '#7a7263',
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: '#1d1a14',
  },
  actionOutlineBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2f2a20',
    backgroundColor: '#12100d',
  },
  actionOutlineBtnPressed: {
    borderColor: '#42b883',
  },
  actionOutlineBtnText: {
    fontSize: 12,
    color: '#a89d8b',
    fontWeight: '500',
  },
  actionPrimaryBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: 'rgba(66, 184, 131, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(66, 184, 131, 0.4)',
  },
  actionPrimaryBtnPressed: {
    backgroundColor: 'rgba(66, 184, 131, 0.3)',
  },
  actionPrimaryBtnText: {
    fontSize: 12,
    color: '#42b883',
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
    maxWidth: 440,
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
    color: '#42b883',
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
    backgroundColor: '#42b883',
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
