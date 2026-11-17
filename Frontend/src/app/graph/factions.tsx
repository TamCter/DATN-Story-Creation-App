import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
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
  NODE_TYPE_CONFIG,
  StoryNode,
  StoryProject,
} from '@/constants/story-data';
import { AppFonts, ThemeColors } from '@/constants/theme';
import { projectStore } from '@/services/project-store';

interface FactionExtendedData {
  leader?: string;
  headquarters?: string;
  motto?: string;
  alignment: string;
  relations: Array<{ label: string; target: string; tone: 'neutral' | 'hostile' | 'allied' }>;
}

type FactionAlignment = 'ĐỒNG MINH' | 'TRUNG LẬP' | 'ĐỐI LẬP';

function normalizeFactionAlignment(value?: string): FactionAlignment | null {
  const normalized = value
    ?.trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
  if (!normalized) return null;
  if (normalized.includes('trung lap') || normalized.includes('neutral')) return 'TRUNG LẬP';
  if (normalized.includes('doi lap') || normalized.includes('ta phai') || normalized.includes('antagonist')) {
    return 'ĐỐI LẬP';
  }
  if (
    normalized.includes('dong minh') ||
    normalized.includes('chinh phai') ||
    normalized.includes('protagonist')
  ) {
    return 'ĐỒNG MINH';
  }
  return null;
}

function getFactionAlignment(faction: StoryNode): FactionAlignment | null {
  return (
    normalizeFactionAlignment(faction.alignment) ||
    normalizeFactionAlignment(faction.role) ||
    normalizeFactionAlignment(faction.subType) ||
    normalizeFactionAlignment(FACTION_EXTRAS[faction.id]?.alignment)
  );
}

const FACTION_EXTRAS: Record<string, FactionExtendedData> = {
  'thien-ha-minh': {
    leader: 'Triệu Vô Cực (Giám đốc)',
    headquarters: 'Thành phố Bắc Nguyệt · Trụ sở chính',
    motto: 'Kết nối chuyên gia, bảo vệ uy tín',
    alignment: 'ĐỐI LẬP',
    relations: [
      { label: 'Gây sức ép', target: 'Viện Bạch Liên', tone: 'neutral' },
      { label: 'Tổ chức', target: 'Cuộc Gặp Tại Nguyệt Hạ', tone: 'allied' },
      { label: 'Theo dõi', target: 'Lăng Tiêu', tone: 'hostile' },
    ],
  },
  'bach-lien-coc': {
    leader: 'Mộc Lan (Trưởng bộ phận pháp y)',
    headquarters: 'Thành phố Bắc Nguyệt · Cơ sở chính',
    motto: 'Tôn trọng sự thật, bảo vệ con người',
    alignment: 'TRUNG LẬP',
    relations: [
      { label: 'Chịu sức ép từ', target: 'Tập đoàn Thiên Hạ', tone: 'neutral' },
      { label: 'Cung cấp thông tin cho', target: 'Lăng Tiêu', tone: 'allied' },
      { label: 'Lưu trữ hồ sơ', target: 'Hồ Sơ Hoàng Hôn', tone: 'allied' },
    ],
  },
};

export default function FactionsScreen() {
  const params = useLocalSearchParams();
  const projectId = (params.projectId as string) || 'project-1';

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

  const [factions, setFactions] = useState<StoryNode[]>(() =>
    currentProject.nodes.filter((n) => n.type === 'faction')
  );

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const proj = await projectStore.getProject(projectId);
        if (isMounted) {
          setCurrentProject(proj);
          setFactions(proj.nodes.filter((n) => n.type === 'faction'));
        }
      } catch (err) {
        console.warn('Lỗi tải danh sách tổ chức:', err);
      }
    }
    void load();
    return () => {
      isMounted = false;
    };
  }, [projectId]);
  const [selectedAlignment, setSelectedAlignment] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFactionDetail, setActiveFactionDetail] = useState<StoryNode | null>(null);

  // Add modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newFactionName, setNewFactionName] = useState('');
  const [newFactionAlignment, setNewFactionAlignment] = useState<FactionAlignment>('ĐỒNG MINH');
  const [newFactionLeader, setNewFactionLeader] = useState('');
  const [newFactionDesc, setNewFactionDesc] = useState('');

  const filteredFactions = useMemo(() => {
    return factions.filter((f) => {
      const extra = FACTION_EXTRAS[f.id];
      const matchesAlignment = selectedAlignment === 'all' || getFactionAlignment(f) === selectedAlignment;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        f.name.toLowerCase().includes(q) ||
        f.desc.toLowerCase().includes(q) ||
        (extra?.leader && extra.leader.toLowerCase().includes(q));
      return matchesAlignment && matchesSearch;
    });
  }, [factions, selectedAlignment, searchQuery]);

  const alignmentCounts = useMemo(() => {
    const counts: Record<FactionAlignment, number> = {
      'ĐỒNG MINH': 0,
      'TRUNG LẬP': 0,
      'ĐỐI LẬP': 0,
    };
    factions.forEach((faction) => {
      const alignment = getFactionAlignment(faction);
      if (alignment) counts[alignment] += 1;
    });
    return counts;
  }, [factions]);

  const handleCreateFaction = () => {
    if (!newFactionName.trim()) return;
    const newId = `faction-${Date.now()}`;
    const newFaction: StoryNode = {
      id: newId,
      name: newFactionName.trim(),
      type: 'faction',
      role: newFactionAlignment,
      subType: newFactionAlignment,
      desc: newFactionDesc.trim() || 'Một tổ chức mới trong câu chuyện.',
      x: 200,
      y: 300,
    };

    if (newFactionLeader.trim()) {
      FACTION_EXTRAS[newId] = {
        leader: newFactionLeader.trim(),
        headquarters: 'Chưa xác định',
        motto: 'Chưa có thông tin',
        alignment: newFactionAlignment,
        relations: [],
      };
    }

    setFactions((prev) => [...prev, newFaction]);
    setAddModalOpen(false);
    setNewFactionName('');
    setNewFactionLeader('');
    setNewFactionDesc('');
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
            <Text style={styles.headerTitle}>Tổ chức</Text>
            <Text style={styles.headerSubtitle}>
              {currentProject.title} · {factions.length} TỔ CHỨC
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
            placeholder="Tìm tổ chức, người đại diện, thông tin..."
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

        {/* Alignment Filter Chips */}
        <View style={styles.filterRow}>
          {[
            { id: 'all', label: 'Tất cả', count: factions.length },
            { id: 'ĐỒNG MINH', label: 'Đồng minh', count: alignmentCounts['ĐỒNG MINH'], color: '#e5a93c' },
            { id: 'TRUNG LẬP', label: 'Trung lập', count: alignmentCounts['TRUNG LẬP'], color: '#42b883' },
            { id: 'ĐỐI LẬP', label: 'Đối lập', count: alignmentCounts['ĐỐI LẬP'], color: '#d95a38' },
          ].map((item) => {
            const isSelected = selectedAlignment === item.id;
            return (
              <Pressable
                key={item.id}
                style={[
                  styles.filterChip,
                  isSelected && styles.filterChipSelected,
                  isSelected && item.color ? { borderColor: item.color } : null,
                ]}
                onPress={() => setSelectedAlignment(item.id)}>
                <Text
                  style={[
                    styles.filterChipText,
                    isSelected && styles.filterChipTextSelected,
                    isSelected && item.color ? { color: item.color } : null,
                  ]}>
                  {item.label} ({item.count})
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Faction Cards List */}
        <View style={styles.cardsContainer}>
          {filteredFactions.map((faction) => {
            const extra = FACTION_EXTRAS[faction.id] || {
              leader: 'Chưa cập nhật',
              headquarters: 'Chưa cập nhật',
              relations: [],
            };
            const factionLinks = currentProject.links.filter(
              (link) => link.source === faction.id || link.target === faction.id
            );
            const factionRelations = factionLinks.map((link) => {
              const targetId = link.source === faction.id ? link.target : link.source;
              return {
                id: link.id,
                label: link.label || link.category || 'Liên hệ',
                target: currentProject.nodes.find((node) => node.id === targetId)?.name || 'Thực thể',
                tone: link.tone,
              };
            });

            const alignment = getFactionAlignment(faction);
            const isAllied = alignment === 'ĐỒNG MINH';
            const isNeutral = alignment === 'TRUNG LẬP';
            const accentColor = isAllied
              ? '#d95a38'
              : isNeutral
              ? '#42b883'
              : '#9f70cf';

            return (
              <View
                key={faction.id}
                style={[
                  styles.factionCard,
                  { borderTopColor: accentColor },
                ]}>
                {/* Card Header */}
                <View style={styles.cardHeader}>
                  <View style={styles.emblemAndTitle}>
                    <View
                      style={[
                        styles.emblemBox,
                        { borderColor: accentColor, backgroundColor: 'rgba(217, 90, 56, 0.08)' },
                      ]}>
                      <Text style={[styles.emblemSymbol, { color: accentColor }]}>
                        ⬡
                      </Text>
                    </View>
                    <View style={styles.titleArea}>
                      <Text style={styles.factionName} numberOfLines={2}>
                        {faction.name}
                      </Text>
                      <Text style={styles.factionSubtype} numberOfLines={1}>
                        {faction.subType || faction.role || 'TỔ CHỨC'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Lore Quote Block */}
                <View style={styles.loreBlock}>
                  <Text style={styles.loreText}>“{faction.desc}”</Text>
                </View>

                {/* Meta details list */}
                <View style={styles.metaRow}>
                  {extra.leader && (
                    <View style={styles.metaItem}>
                      <Text style={styles.metaIcon}>👑</Text>
                      <Text style={styles.metaLabel}>Thủ lĩnh:</Text>
                      <Text style={styles.metaValueHighlight}>
                        {extra.leader}
                      </Text>
                    </View>
                  )}

                  {extra.headquarters && (
                    <View style={styles.metaItem}>
                      <Text style={styles.metaIcon}>▲</Text>
                      <Text style={styles.metaLabel}>Trụ sở:</Text>
                      <Text style={styles.metaValue}>{extra.headquarters}</Text>
                    </View>
                  )}

                  {extra.motto && (
                    <View style={styles.metaItem}>
                      <Text style={styles.metaIcon}>📜</Text>
                      <Text style={styles.metaLabel}>Khẩu quyết:</Text>
                      <Text style={styles.metaValueItalic}>{extra.motto}</Text>
                    </View>
                  )}
                </View>

                {/* Tactical Relations in Martial Arts */}
                {factionRelations.length > 0 && (
                  <View style={styles.relationsBox}>
                    <Text style={styles.relationsTitle}>MẠNG LƯỚI QUAN HỆ</Text>
                    <View style={styles.relationTagsWrap}>
                      {factionRelations.map((rel) => {
                        const tagColor =
                          rel.tone === 'hostile'
                            ? '#e05252'
                            : rel.tone === 'loyalty' || rel.tone === 'sect'
                            ? '#42b883'
                            : '#e5a93c';
                        return (
                          <View
                            key={rel.id}
                            style={[
                              styles.relationTag,
                              { borderColor: 'rgba(229,169,60,0.2)' },
                            ]}>
                            <Text style={[styles.relationTagLabel, { color: tagColor }]}>
                              {rel.label}:
                            </Text>
                            <Text style={styles.relationTagTarget}>
                              {rel.target}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Card Actions */}
                <View style={styles.cardActionsRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.actionOutlineBtn,
                      pressed && styles.actionOutlineBtnPressed,
                    ]}
                    onPress={() => {
                      router.push({
                        pathname: '/graph/links' as any,
                        params: { projectId: currentProject.id, entityId: faction.id },
                      });
                    }}>
                    <Text style={styles.actionOutlineBtnText}>
                      Xem liên kết ({factionLinks.length})
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
                          focusNodeId: faction.id,
                        },
                      });
                    }}>
                    <Text style={styles.actionPrimaryBtnText}>
                      Đồ thị thế lực →
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })}

          {filteredFactions.length === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>⬡</Text>
              <Text style={styles.emptyTitle}>Không tìm thấy tổ chức nào</Text>
              <Text style={styles.emptyDesc}>
                Thử đổi từ khóa hoặc bộ lọc.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Add Faction Modal */}
      <Modal visible={addModalOpen} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
          style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Thêm tổ chức</Text>
              <Pressable
                hitSlop={12}
                onPress={() => setAddModalOpen(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>TÊN TỔ CHỨC</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ví dụ: công ty, nhóm nghiên cứu, tổ chức..."
                placeholderTextColor="#665f52"
                value={newFactionName}
                onChangeText={setNewFactionName}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>VAI TRÒ TRONG CÂU CHUYỆN</Text>
              <View style={styles.alignmentSelectorRow}>
                {(['ĐỒNG MINH', 'TRUNG LẬP', 'ĐỐI LẬP'] as const).map(
                  (align) => {
                    const isSelected = newFactionAlignment === align;
                    return (
                      <Pressable
                        key={align}
                        style={[
                          styles.alignmentOption,
                          isSelected && styles.alignmentOptionSelected,
                        ]}
                        onPress={() => setNewFactionAlignment(align)}>
                        <Text
                          style={[
                            styles.alignmentOptionText,
                            isSelected && styles.alignmentOptionTextSelected,
                          ]}>
                          {align === 'ĐỒNG MINH'
                            ? 'Đồng minh'
                            : align === 'ĐỐI LẬP'
                              ? 'Đối lập'
                              : 'Trung lập'}
                        </Text>
                      </Pressable>
                    );
                  }
                )}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>NGƯỜI ĐẠI DIỆN / THỦ LĨNH</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ví dụ: giám đốc, trưởng nhóm, đại diện..."
                placeholderTextColor="#665f52"
                value={newFactionLeader}
                onChangeText={setNewFactionLeader}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>BỐI CẢNH & MỤC TIÊU</Text>
              <TextInput
                style={[styles.textInput, { height: 75, textAlignVertical: 'top' }]}
                placeholder="Mô tả mục tiêu, vai trò và ảnh hưởng của tổ chức..."
                placeholderTextColor="#665f52"
                multiline
                value={newFactionDesc}
                onChangeText={setNewFactionDesc}
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
                onPress={handleCreateFaction}>
                <Text style={styles.modalSubmitText}>Tạo thế lực</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
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
    color: '#ded5c7',
    fontWeight: '600',
  },
  cardsContainer: {
    gap: 18,
  },
  factionCard: {
    backgroundColor: '#14120e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#242019',
    borderTopWidth: 3,
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
  emblemBox: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emblemSymbol: {
    fontSize: 22,
    fontWeight: '700',
  },
  titleArea: {
    flex: 1,
    minWidth: 0,
  },
  factionName: {
    fontFamily: AppFonts.serif,
    fontSize: 19,
    color: '#f5eee6',
    fontWeight: '700',
  },
  factionSubtype: {
    fontSize: 10.5,
    letterSpacing: 1.5,
    color: '#8c7746',
    fontFamily: AppFonts.mono,
    marginTop: 2,
  },
  loreBlock: {
    borderLeftWidth: 2,
    borderLeftColor: '#3d3424',
    paddingLeft: 12,
    marginVertical: 10,
  },
  loreText: {
    fontSize: 13.5,
    lineHeight: 20,
    fontStyle: 'italic',
    color: '#b5ab99',
    fontFamily: AppFonts.serif,
  },
  metaRow: {
    gap: 6,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#1d1a14',
    marginVertical: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaIcon: {
    fontSize: 11,
    width: 16,
    textAlign: 'center',
  },
  metaLabel: {
    fontSize: 12,
    color: '#706757',
    fontFamily: AppFonts.sans,
  },
  metaValueHighlight: {
    fontSize: 12.5,
    color: '#e5a93c',
    fontWeight: '600',
    fontFamily: AppFonts.sans,
  },
  metaValue: {
    fontSize: 12.5,
    color: '#c2b9aa',
    fontFamily: AppFonts.sans,
  },
  metaValueItalic: {
    fontSize: 12,
    color: '#8f887b',
    fontStyle: 'italic',
    fontFamily: AppFonts.sans,
  },
  relationsBox: {
    marginTop: 8,
    marginBottom: 12,
  },
  relationsTitle: {
    fontSize: 9.5,
    letterSpacing: 2,
    color: '#8f887b',
    fontFamily: AppFonts.mono,
    marginBottom: 6,
  },
  relationTagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  relationTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#1b1813',
    borderWidth: 1,
  },
  relationTagLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  relationTagTarget: {
    fontSize: 11,
    color: '#ded5c7',
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 4,
    paddingTop: 8,
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
    borderColor: '#e5a93c',
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
    backgroundColor: 'rgba(229,169,60,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(229,169,60,0.4)',
  },
  actionPrimaryBtnPressed: {
    backgroundColor: 'rgba(229,169,60,0.3)',
  },
  actionPrimaryBtnText: {
    fontSize: 12,
    color: '#e5a93c',
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
  alignmentSelectorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  alignmentOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: '#11100d',
    borderWidth: 1,
    borderColor: '#2c271e',
  },
  alignmentOptionSelected: {
    backgroundColor: 'rgba(229,169,60,0.15)',
    borderColor: '#e5a93c',
  },
  alignmentOptionText: {
    fontSize: 11,
    color: '#8f887b',
    fontWeight: '600',
  },
  alignmentOptionTextSelected: {
    color: '#e5a93c',
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
    color: '#15130e',
    fontWeight: '700',
    fontSize: 13.5,
  },
});
