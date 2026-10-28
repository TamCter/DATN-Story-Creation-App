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
  StoryNode,
  StoryProject,
} from '@/constants/story-data';
import { AppFonts, ThemeColors } from '@/constants/theme';
import { projectStore } from '@/services/project-store';

interface CharacterExtra {
  title: string;
  weapon: string;
  sect: string;
  status: string;
  personality: string;
  connections: Array<{ name: string; relation: string; color: string }>;
}

const CHAR_EXTRAS: Record<string, CharacterExtra> = {
  'lang-tieu': {
    title: 'Đoạn Kiếm Khách · Hậu duệ Sơn Trang',
    weapon: 'Chuôi Kiếm Hoàng Hôn (Mảnh 1)',
    sect: 'Tự do / Lưu vong',
    status: 'Bị Thiên Hạ Minh truy sát khắp thiên hạ',
    personality: 'Trầm mặc, kiên định, không tin lời ước hẹn',
    connections: [
      { name: 'Mộc Lan', relation: 'Tin tưởng', color: '#e5a93c' },
      { name: 'Triệu Vô Cực', relation: 'Huynh đệ cũ / Thù sâu', color: '#e05252' },
      { name: 'Kiếm Hoàng Hôn', relation: 'Sở hữu mảnh 1', color: '#42b883' },
    ],
  },
  'moc-lan': {
    title: 'Bạch Liên Y Sư · Dược Thiện Truyền Nhân',
    weapon: 'Bạch Liên Châm & Dược Thảo',
    sect: 'Bạch Liên Cốc',
    status: 'Ẩn cư tại U Cốc sương mờ',
    personality: 'Thanh thuần, từ tâm nhưng ẩn chứa bí mật sư môn',
    connections: [
      { name: 'Lăng Tiêu', relation: 'Cứu chữa & che chở', color: '#e5a93c' },
      { name: 'Bạch Liên Cốc', relation: 'Môn đồ chân truyền', color: '#42b883' },
      { name: 'Thiên Hạ Minh', relation: 'Bị bí mật dò xét', color: '#d95a38' },
    ],
  },
  'trieu-vo-cuc': {
    title: 'Thiên Hạ Minh Chủ · Hùng Bá Võ Lâm',
    weapon: 'Huyền Thiết Trảm Ma Kiếm',
    sect: 'Thiên Hạ Minh',
    status: 'Quy tụ chính đạo, mưu đồ đoạt 7 mảnh kiếm',
    personality: 'Thâm trầm, quyết đoán, dã tâm nuốt chửng võ lâm',
    connections: [
      { name: 'Thiên Hạ Minh', relation: 'Thủ lĩnh tối cao', color: '#d95a38' },
      { name: 'Đêm Hỏa Thiêu', relation: 'Chủ mưu diệt môn', color: '#e05252' },
      { name: 'Kiếm Hoàng Hôn', relation: 'Truy lùng đoạt kiếm', color: '#42b883' },
    ],
  },
};

const MAIN_ROLES = new Set(['NHÂN VẬT CHÍNH', 'CHÍNH DIỆN']);

export default function CharactersScreen() {
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

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const proj = await projectStore.getProject(projectId);
        if (isMounted) setCurrentProject(proj);
      } catch (err) {
        console.warn('Lỗi tải nhân vật:', err);
      }
    }
    void load();
    return () => {
      isMounted = false;
    };
  }, [projectId]);

  const characters = useMemo(() => {
    return currentProject.nodes.filter((n) => n.type === 'character');
  }, [currentProject]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');

  const filteredCharacters = useMemo(() => {
    return characters.filter((c) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.desc.toLowerCase().includes(q) ||
        c.role.toLowerCase().includes(q);

      if (!matchesSearch) return false;
      if (selectedRole === 'main' && !MAIN_ROLES.has(c.role)) return false;
      if (selectedRole === 'ally' && c.role !== 'ĐỒNG HÀNH') return false;
      if (selectedRole === 'villain' && c.role !== 'PHẢN DIỆN') return false;

      return true;
    });
  }, [characters, searchQuery, selectedRole]);

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
            <Text style={styles.headerTitle}>Nhân vật</Text>
            <Text style={styles.headerSubtitle}>
              {currentProject.title} · {characters.length} ANH HÙNG HÀO KIỆT
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* World Characters Banner */}
        <View style={styles.statsBanner}>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: '#e5a93c' }]}>
              {characters.length}
            </Text>
            <Text style={styles.statLabel}>NHÂN VẬT</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: '#e5a93c' }]}>
              {characters.filter((c) => MAIN_ROLES.has(c.role)).length}
            </Text>
            <Text style={styles.statLabel}>CHÍNH DIỆN</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: '#e05252' }]}>
              {characters.filter((c) => c.role === 'PHẢN DIỆN').length}
            </Text>
            <Text style={styles.statLabel}>PHẢN DIỆN</Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchBarContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm kiếm kiếm khách, y sư, minh chủ..."
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

        {/* Filter chips */}
        <View style={styles.filterRow}>
          {[
            { id: 'all', label: `Tất cả (${characters.length})` },
            { id: 'main', label: 'Chính diện' },
            { id: 'ally', label: 'Đồng hành' },
            { id: 'villain', label: 'Phản diện' },
          ].map((item) => {
            const isSelected = selectedRole === item.id;
            return (
              <Pressable
                key={item.id}
                style={[
                  styles.filterChip,
                  isSelected && styles.filterChipSelected,
                ]}
                onPress={() => setSelectedRole(item.id)}>
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

        {/* Characters List */}
        <View style={styles.cardsContainer}>
          {filteredCharacters.map((char) => {
            const extra = CHAR_EXTRAS[char.id] || {
              title: char.subType || 'Cao thủ võ lâm',
              weapon: 'Vũ khí giang hồ',
              sect: 'Tự do',
              status: 'Hành tẩu giang hồ',
              personality: 'Kiên định',
              connections: [],
            };

            const isVillain = char.role === 'PHẢN DIỆN';
            const isMain = char.role === 'NHÂN VẬT CHÍNH';
            const accentColor = isMain ? '#e5a93c' : isVillain ? '#e05252' : '#42b883';

            return (
              <View
                key={char.id}
                style={[
                  styles.charCard,
                  { borderTopColor: accentColor },
                ]}>
                {/* Header */}
                <View style={styles.cardHeader}>
                  <View style={styles.emblemAndTitle}>
                    <View
                      style={[
                        styles.avatarCircle,
                        { borderColor: accentColor, backgroundColor: `${accentColor}15` },
                      ]}>
                      <Text style={[styles.avatarSymbol, { color: accentColor }]}>
                        ●
                      </Text>
                    </View>
                    <View style={styles.titleArea}>
                      <Text style={styles.charName}>{char.name}</Text>
                      <Text style={[styles.charTitleSub, { color: accentColor }]}>
                        {extra.title}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.roleBadge,
                      {
                        borderColor: accentColor,
                        backgroundColor: `${accentColor}18`,
                      },
                    ]}>
                    <Text style={[styles.roleBadgeText, { color: accentColor }]}>
                      {char.role}
                    </Text>
                  </View>
                </View>

                {/* Lore quote */}
                <View style={styles.loreBlock}>
                  <Text style={styles.loreText}>“{char.desc}”</Text>
                </View>

                {/* Character Profile Meta */}
                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>🗡 Binh khí:</Text>
                    <Text style={styles.metaValueHighlight}>{char.weapon || extra.weapon}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>🏛 Môn phái:</Text>
                    <Text style={styles.metaValue}>{char.sect || extra.sect}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>⚡ Trạng thái:</Text>
                    <Text style={styles.metaValue}>{char.status || extra.status}</Text>
                  </View>
                </View>

                {(char.dob || char.birthplace) && (
                  <View style={[styles.metaRow, { marginTop: 6 }]}>
                    {char.dob ? (
                      <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>📅 Ngày sinh:</Text>
                        <Text style={styles.metaValue}>{char.dob}</Text>
                      </View>
                    ) : null}
                    {char.birthplace ? (
                      <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>📍 Nơi sinh:</Text>
                        <Text style={styles.metaValueHighlight}>{char.birthplace}</Text>
                      </View>
                    ) : null}
                  </View>
                )}

                {/* Relationship Chips */}
                {extra.connections && extra.connections.length > 0 && (
                  <View style={styles.connBox}>
                    <Text style={styles.connTitle}>QUAN HỆ THEN CHỐT</Text>
                    <View style={styles.connWrap}>
                      {extra.connections.map((c, cIdx) => (
                        <View key={cIdx} style={styles.connChip}>
                          <Text style={[styles.connRel, { color: c.color }]}>
                            {c.relation} ➜
                          </Text>
                          <Text style={styles.connTarget}>{c.name}</Text>
                        </View>
                      ))}
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
                        params: { projectId: currentProject.id, query: char.name },
                      });
                    }}>
                    <Text style={styles.actionOutlineBtnText}>
                      Xem các mối liên kết →
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
                      Xem trên đồ thị
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
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
  scrollContent: {
    paddingHorizontal: 18,
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
    gap: 16,
  },
  charCard: {
    backgroundColor: '#14120e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#242019',
    borderTopWidth: 3,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  emblemAndTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSymbol: {
    fontSize: 18,
  },
  titleArea: {
    flex: 1,
  },
  charName: {
    fontFamily: AppFonts.serif,
    fontSize: 19,
    color: '#f5eee6',
    fontWeight: '700',
  },
  charTitleSub: {
    fontSize: 11,
    letterSpacing: 1.2,
    fontFamily: AppFonts.mono,
    marginTop: 2,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    fontFamily: AppFonts.mono,
  },
  loreBlock: {
    borderLeftWidth: 2,
    borderLeftColor: '#3a3428',
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
    gap: 5,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#1d1a14',
    marginVertical: 6,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  connBox: {
    marginTop: 8,
    marginBottom: 8,
  },
  connTitle: {
    fontSize: 9.5,
    letterSpacing: 2,
    color: '#8f887b',
    fontFamily: AppFonts.mono,
    marginBottom: 6,
  },
  connWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  connChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#1b1813',
    borderWidth: 1,
    borderColor: '#29251e',
  },
  connRel: {
    fontSize: 11,
    fontWeight: '600',
  },
  connTarget: {
    fontSize: 11,
    color: '#ded5c7',
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
});
