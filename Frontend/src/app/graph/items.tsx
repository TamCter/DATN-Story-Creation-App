import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
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

import {
  INITIAL_PROJECTS,
  ITEM_RARITY_OPTIONS,
  NODE_TYPE_CONFIG,
  StoryNode,
  StoryProject,
} from '@/constants/story-data';
import { AppFonts, ThemeColors } from '@/constants/theme';
import { projectStore } from '@/services/project-store';
import { GraphSidebar } from '@/components/graph/GraphSidebar';

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
    rarity: 'TÀI LIỆU MẬT',
    origin: 'Thu thập trong quá trình điều tra vụ việc cũ',
    element: 'Bằng chứng · Ghi chép',
    fragments: [
      {
        id: 'frag-1',
        name: 'Phần 1 · Bản ghi gốc',
        status: 'possessed',
        holderOrLocation: 'Lăng Tiêu đang lưu giữ',
        holderType: 'character',
        lore: 'Bản ghi duy nhất còn lại sau vụ cháy tại điền trang.',
      },
      {
        id: 'frag-2',
        name: 'Phần 2 · Bản sao lưu',
        status: 'revealed',
        holderOrLocation: 'Được phát hiện tại cuộc gặp ở Nguyệt Hạ',
        holderType: 'event',
        lore: 'Bản sao hé lộ thông tin về những người liên quan.',
      },
      {
        id: 'frag-3',
        name: 'Phần 3 · Tài liệu gốc',
        status: 'lost',
        holderOrLocation: 'Thất lạc tại Bến Sông Bắc Nguyệt',
        holderType: 'location',
        lore: 'Tài liệu được cho là đã bị vứt bỏ tại khu vực ven sông.',
      },
      {
        id: 'frag-4',
        name: 'Phần 4 · Ghi chú nhân chứng',
        status: 'unknown',
        holderOrLocation: 'Chưa xác định địa điểm lưu trữ',
        holderType: 'unknown',
        lore: 'Chưa từng được xác minh độc lập.',
      },
      {
        id: 'frag-5',
        name: 'Phần 5 · Bản đối chiếu',
        status: 'unknown',
        holderOrLocation: 'Bí mật cất giấu',
        holderType: 'unknown',
        lore: 'Chỉ được nhắc đến trong một bản ghi chưa đầy đủ.',
      },
      {
        id: 'frag-6',
        name: 'Phần 6 · Biên bản phỏng vấn',
        status: 'unknown',
        holderOrLocation: 'Chưa rõ tung tích',
        holderType: 'unknown',
        lore: 'Ghi lại lời khai của một nhân chứng quan trọng.',
      },
      {
        id: 'frag-7',
        name: 'Phần 7 · Kết luận điều tra',
        status: 'unknown',
        holderOrLocation: 'Mảnh vỡ then chốt cuối cùng',
        holderType: 'unknown',
        lore: 'Có thể làm sáng tỏ toàn bộ vụ việc.',
      },
    ],
    traits: [
      '📄 Ghi lại các tình tiết quan trọng của vụ việc',
      '🔎 Có thể đối chiếu với lời khai của nhân chứng',
      '🧩 Tập hợp đầy đủ các phần sẽ giúp làm rõ diễn biến',
    ],
    associatedNodes: [
      { name: 'Lăng Tiêu', type: 'character', role: 'Đang lưu giữ hồ sơ' },
      { name: 'Triệu Vô Cực', type: 'character', role: 'Tìm cách kiểm soát thông tin' },
      { name: 'Cuộc Gặp Tại Nguyệt Hạ', type: 'event', role: 'Nơi bản sao được phát hiện' },
      { name: 'Bến Sông Bắc Nguyệt', type: 'location', role: 'Nơi tài liệu thất lạc' },
    ],
  },
};

/** Lấy độ hiếm của vật phẩm (khớp với `ITEM_RARITY_OPTIONS`, mặc định 'Quý hiếm'). */
function getItemRarity(item: StoryNode): string {
  const raw = (item.rarity || '').trim();
  if (raw) {
    const matched = ITEM_RARITY_OPTIONS.find(
      (opt) => opt.value.toLocaleLowerCase('vi') === raw.toLocaleLowerCase('vi')
    );
    return matched ? matched.value : raw;
  }
  const roleMatch = ITEM_RARITY_OPTIONS.find(
    (opt) => opt.value.toLocaleLowerCase('vi') === (item.role || '').trim().toLocaleLowerCase('vi')
  );
  if (roleMatch) return roleMatch.value;
  return 'Quý hiếm';
}

export default function ItemsScreen() {
  const params = useLocalSearchParams();
  const projectId = (params.projectId as string) || 'project-1';
  const [sidebarVisible, setSidebarVisible] = useState(false);

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

  const [items, setItems] = useState<StoryNode[]>(() =>
    currentProject.nodes.filter((n) => n.type === 'item')
  );

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const proj = await projectStore.getProject(projectId);
        if (isMounted) {
          setCurrentProject(proj);
          setItems(proj.nodes.filter((n) => n.type === 'item'));
        }
      } catch (err) {
        console.warn('Lỗi tải vật phẩm:', err);
      }
    }
    void load();
    return () => {
      isMounted = false;
    };
  }, [projectId]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<string>('kiem-hoang-hon');

  // Add Item Modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemRarity, setNewItemRarity] = useState('Quý hiếm');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [isCreatingItem, setIsCreatingItem] = useState(false);

  // Danh sách bộ lọc theo Độ hiếm (ITEM_RARITY_OPTIONS + các độ hiếm khác có trong dữ liệu)
  const rarityFilters = useMemo(() => {
    const counts = new Map<string, number>();
    const configuredKeys = new Set<string>();
    for (const opt of ITEM_RARITY_OPTIONS) {
      counts.set(opt.value, 0);
      configuredKeys.add(opt.value);
    }
    for (const item of items) {
      const rarity = getItemRarity(item);
      counts.set(rarity, (counts.get(rarity) || 0) + 1);
    }
    const baseFilters = ITEM_RARITY_OPTIONS.map((opt) => ({
      id: `rarity:${opt.value}`,
      value: opt.value as string | null,
      label: `${opt.icon} ${opt.label}`,
      count: counts.get(opt.value) || 0,
    }));
    const extraFilters: Array<{ id: string; value: string | null; label: string; count: number }> = [];
    for (const [rarity, count] of counts.entries()) {
      if (!configuredKeys.has(rarity) && count > 0) {
        extraFilters.push({ id: `rarity:${rarity}`, value: rarity, label: rarity, count });
      }
    }
    return [...baseFilters, ...extraFilters];
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const q = searchQuery.trim().toLowerCase();
      const rarity = getItemRarity(item);
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.desc.toLowerCase().includes(q) ||
        rarity.toLowerCase().includes(q) ||
        (item.role && item.role.toLowerCase().includes(q));
      if (!matchesSearch) return false;

      if (selectedFilter === null) return true;
      return rarity === selectedFilter;
    });
  }, [items, searchQuery, selectedFilter]);

  const handleAddItem = async () => {
    if (!newItemName.trim()) return;
    const rarityVal = newItemRarity.trim() || 'Quý hiếm';
    const newItem: Omit<StoryNode, 'id'> = {
      name: newItemName.trim(),
      type: 'item',
      role: rarityVal,
      subType: '',
      rarity: rarityVal,
      status: 'Nguyên vẹn',
      desc: newItemDesc.trim() || 'Vật phẩm có vai trò trong diễn biến câu chuyện.',
      x: 220,
      y: 420,
    };

    setIsCreatingItem(true);
    try {
      const createdItem = await projectStore.createNode(projectId, newItem);
      setItems((prev) => [...prev, createdItem]);
      setCurrentProject((prev) => ({
        ...prev,
        nodes: [...prev.nodes.filter((node) => node.id !== createdItem.id), createdItem],
      }));
      setAddModalOpen(false);
      setNewItemName('');
      setNewItemRarity('Quý hiếm');
      setNewItemDesc('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể tạo vật phẩm.';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Lỗi', message);
    } finally {
      setIsCreatingItem(false);
    }
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
            onPress={() => setSidebarVisible(true)}>
            <Text style={styles.backBtnIcon}>☰</Text>
          </Pressable>
          <View>
            <Text style={styles.headerTitle}>Vật phẩm</Text>
            <Text style={styles.headerSubtitle}>
              {currentProject.title} · {items.length} VẬT PHẨM
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
        {/* Search Bar */}
        <View style={styles.searchBarContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm vật phẩm, tài liệu, đạo cụ..."
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

        {/* Rarity Filters: Lọc theo độ hiếm vật phẩm */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}>
          {[
            { id: 'filter-all', value: null as string | null, label: 'Tất cả', count: items.length },
            ...rarityFilters,
          ].map((item) => {
            const isSelected = selectedFilter === item.value;
            return (
              <Pressable
                key={item.id}
                style={[
                  styles.filterChip,
                  isSelected && styles.filterChipSelected,
                ]}
                onPress={() => setSelectedFilter(item.value)}>
                <Text
                  style={[
                    styles.filterChipText,
                    isSelected && styles.filterChipTextSelected,
                  ]}>
                  {item.label} ({item.count})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Items List */}
        <View style={styles.cardsContainer}>
          {filteredItems.map((item) => {
            const extra = ITEM_EXTRAS[item.id] || {
              rarity: 'VẬT PHẨM',
              origin: 'Chưa xác định',
              element: 'Chưa xác định',
              fragments: [],
              traits: ['Mang theo ký ức lịch sử'],
              associatedNodes: [],
            };
            const itemLinks = currentProject.links.filter(
              (link) => link.source === item.id || link.target === item.id
            );
            const itemAssociations = itemLinks.map((link) => {
              const targetId = link.source === item.id ? link.target : link.source;
              return {
                id: link.id,
                name: currentProject.nodes.find((node) => node.id === targetId)?.name || 'Thực thể',
                role: link.label || link.category || 'Liên hệ',
              };
            });

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
                      <Text style={styles.itemName} numberOfLines={2}>
                        {item.name}
                      </Text>
                      <Text style={styles.itemRarity} numberOfLines={1}>
                        {getItemRarity(item).toUpperCase()}
                      </Text>
                    </View>
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
                                CẤU TRÚC CÁC PHẦN CỦA HỒ SƠ
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
                              ĐẶC ĐIỂM NỔI BẬT
                            </Text>
                            {extra.traits.map((trait, tIdx) => (
                              <View key={tIdx} style={styles.traitRow}>
                                <Text style={styles.traitText}>{trait}</Text>
                              </View>
                            ))}
                          </View>
                        )}

                        {/* Associated Story Links */}
                        {itemAssociations.length > 0 && (
                          <View style={styles.associatedBox}>
                            <Text style={styles.associatedTitle}>
                              MỐI LIÊN KẾT ({itemAssociations.length})
                            </Text>
                            <View style={styles.associatedChipsWrap}>
                              {itemAssociations.map((assoc) => (
                                <View key={assoc.id} style={styles.assocChip}>
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
                                  entityId: item.id,
                                },
                              });
                            }}>
                            <Text style={styles.actionOutlineBtnText}>
                              Xem {itemLinks.length} mối liên kết →
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
                                  focusNodeId: item.id,
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
              <Modal
                visible={addModalOpen}
                transparent
                animationType="slide"
                onRequestClose={() => {
                  if (!isCreatingItem) setAddModalOpen(false);
                }}>
                <KeyboardAvoidingView
                  behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                  keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
                  style={styles.modalOverlay}>
                  <View style={styles.modalCard}>
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>Thêm vật phẩm</Text>
                      <Pressable
                        hitSlop={12}
                        onPress={() => setAddModalOpen(false)}
                        disabled={isCreatingItem}>
                        <Text style={styles.modalCloseText}>✕</Text>
                      </Pressable>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>TÊN VẬT PHẨM</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="Ví dụ: hồ sơ, thiết bị, vật kỷ niệm..."
                        placeholderTextColor="#665f52"
                        value={newItemName}
                        onChangeText={setNewItemName}
                        editable={!isCreatingItem}
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>ĐỘ HIẾM</Text>
                      <View style={styles.filterRow}>
                        {ITEM_RARITY_OPTIONS.map((opt) => {
                          const isActive = newItemRarity === opt.value;
                          return (
                            <Pressable
                              key={opt.value}
                              style={[
                                styles.filterChip,
                                isActive && styles.filterChipSelected,
                              ]}
                              onPress={() => setNewItemRarity(opt.value)}
                              disabled={isCreatingItem}>
                              <Text
                                style={[
                                  styles.filterChipText,
                                  isActive && styles.filterChipTextSelected,
                                ]}>
                                {opt.icon} {opt.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>MÔ TẢ & NGUỒN GỐC</Text>
                      <TextInput
                        style={[styles.textInput, { height: 75, textAlignVertical: 'top' }]}
                        placeholder="Ghi chú về nguồn gốc, đặc điểm và vai trò trong câu chuyện..."
                        placeholderTextColor="#665f52"
                        multiline
                        value={newItemDesc}
                        onChangeText={setNewItemDesc}
                        editable={!isCreatingItem}
                      />
                    </View>

                    <View style={styles.modalActionRow}>
                      <Pressable
                        style={styles.modalCancelBtn}
                        onPress={() => setAddModalOpen(false)}
                        disabled={isCreatingItem}>
                        <Text style={styles.modalCancelText}>Hủy</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.modalSubmitBtn, isCreatingItem && { opacity: 0.6 }]}
                        onPress={handleAddItem}
                        disabled={isCreatingItem}>
                        <Text style={styles.modalSubmitText}>
                          {isCreatingItem ? 'Đang thêm...' : 'Thêm vật phẩm'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </KeyboardAvoidingView>
              </Modal>
              <GraphSidebar
                visible={sidebarVisible}
                project={currentProject}
                activeSection="items"
                onClose={() => setSidebarVisible(false)}
              />
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
            minWidth: 0,
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
