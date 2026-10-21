import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
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

export default function NodesDetailScreen() {
  const params = useLocalSearchParams();
  const projectId = (params.projectId as string) || 'project-1';
  const initialType = (params.type as string) || 'all';

  const currentProject = useMemo(() => {
    return (
      INITIAL_PROJECTS.find((p) => p.id === projectId) || INITIAL_PROJECTS[0]
    );
  }, [projectId]);

  const nodes = currentProject.nodes;
  const [selectedType, setSelectedType] = useState<string>(initialType);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredNodes = useMemo(() => {
    return nodes.filter((node) => {
      if (selectedType !== 'all' && node.type !== selectedType) {
        return false;
      }
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        node.name.toLowerCase().includes(q) ||
        node.desc.toLowerCase().includes(q) ||
        node.role.toLowerCase().includes(q)
      );
    });
  }, [nodes, selectedType, searchQuery]);

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
            <Text style={styles.headerTitle}>Chi tiết node</Text>
            <Text style={styles.headerSubtitle}>
              {currentProject.title} · {nodes.length} THỰC THỂ
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Search */}
        <View style={styles.searchBarContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm kiếm node theo tên, vai trò, lai lịch..."
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

        {/* Filter Chips Bar */}
        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {[
              { id: 'all', label: `Tất cả (${nodes.length})`, symbol: '◈' },
              { id: 'character', label: 'Nhân vật', symbol: '●', color: '#e5a93c' },
              { id: 'faction', label: 'Phe phái', symbol: '⬡', color: '#d95a38' },
              { id: 'item', label: 'Vật phẩm', symbol: '◆', color: '#42b883' },
              { id: 'event', label: 'Sự kiện', symbol: '■', color: '#5b8ec2' },
              { id: 'location', label: 'Địa điểm', symbol: '▲', color: '#9f70cf' },
            ].map((f) => {
              const isSelected = selectedType === f.id;
              return (
                <Pressable
                  key={f.id}
                  style={[
                    styles.filterChip,
                    isSelected && styles.filterChipSelected,
                    isSelected && f.color ? { borderColor: f.color } : null,
                  ]}
                  onPress={() => setSelectedType(f.id)}>
                  <Text style={[styles.filterChipSymbol, f.color ? { color: f.color } : { color: '#8f887b' }]}>
                    {f.symbol}
                  </Text>
                  <Text
                    style={[
                      styles.filterChipText,
                      isSelected && styles.filterChipTextSelected,
                      isSelected && f.color ? { color: f.color } : null,
                    ]}>
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Shortcut Banner if on specific category */}
        {selectedType === 'faction' && (
          <Pressable
            style={styles.specialBanner}
            onPress={() =>
              router.push({
                pathname: '/graph/factions' as any,
                params: { projectId: currentProject.id },
              })
            }>
            <View style={{ flex: 1 }}>
              <Text style={styles.specialBannerTitle}>⬡ Xem giao diện Chuyên mục Phe phái</Text>
              <Text style={styles.specialBannerDesc}>Bản đồ thế lực võ lâm, tôn chỉ, chưởng môn & ngoại giao</Text>
            </View>
            <Text style={styles.specialBannerArrow}>→</Text>
          </Pressable>
        )}

        {selectedType === 'item' && (
          <Pressable
            style={[styles.specialBanner, { borderColor: '#42b883', backgroundColor: 'rgba(66, 184, 131, 0.1)' }]}
            onPress={() =>
              router.push({
                pathname: '/graph/items' as any,
                params: { projectId: currentProject.id },
              })
            }>
            <View style={{ flex: 1 }}>
              <Text style={[styles.specialBannerTitle, { color: '#42b883' }]}>◆ Xem giao diện Chuyên mục Vật phẩm</Text>
              <Text style={styles.specialBannerDesc}>Khám phá 7 mảnh vỡ Kiếm Hoàng Hôn & thần binh chí tôn</Text>
            </View>
            <Text style={[styles.specialBannerArrow, { color: '#42b883' }]}>→</Text>
          </Pressable>
        )}

        {/* Nodes List */}
        <View style={styles.cardsContainer}>
          {filteredNodes.map((node) => {
            const config = NODE_TYPE_CONFIG[node.type];
            return (
              <View
                key={node.id}
                style={[styles.nodeCard, { borderTopColor: config.color }]}>
                <View style={styles.nodeHeaderRow}>
                  <View style={styles.nodeLeft}>
                    <View
                      style={[
                        styles.symbolBox,
                        { borderColor: config.color, backgroundColor: `${config.color}15` },
                      ]}>
                      <Text style={[styles.nodeSymbol, { color: config.color }]}>
                        {config.symbol}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.nodeName}>{node.name}</Text>
                      <Text style={styles.nodeTypeSub}>
                        {config.badgeText} {node.subType ? `· ${node.subType}` : ''}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.nodeRoleBadge,
                      { borderColor: `${config.color}60`, backgroundColor: `${config.color}12` },
                    ]}>
                    <Text style={[styles.nodeRoleText, { color: config.color }]}>
                      {node.role}
                    </Text>
                  </View>
                </View>

                <View style={styles.nodeDescBox}>
                  <Text style={styles.nodeDesc}>{node.desc}</Text>
                </View>

                <View style={styles.nodeFooter}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.locateBtn,
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => {
                      router.push({
                        pathname: '/graph' as any,
                        params: { projectId: currentProject.id },
                      });
                    }}>
                    <Text style={styles.locateBtnText}>Xem trên đồ thị →</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}

          {filteredNodes.length === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>◈</Text>
              <Text style={styles.emptyTitle}>Không có node phù hợp</Text>
              <Text style={styles.emptyDesc}>Thử đổi từ khóa hoặc bộ lọc phân loại.</Text>
            </View>
          )}
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
    marginBottom: 14,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  filterChipSymbol: {
    fontSize: 11,
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
  specialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(217, 90, 56, 0.1)',
    borderWidth: 1,
    borderColor: '#d95a38',
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  specialBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#d95a38',
    fontFamily: AppFonts.serif,
  },
  specialBannerDesc: {
    fontSize: 11.5,
    color: '#9e9587',
    marginTop: 2,
  },
  specialBannerArrow: {
    fontSize: 18,
    color: '#d95a38',
    fontWeight: '700',
    marginLeft: 8,
  },
  cardsContainer: {
    gap: 12,
  },
  nodeCard: {
    backgroundColor: '#14120e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#242019',
    borderTopWidth: 2.5,
    padding: 16,
  },
  nodeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  nodeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  symbolBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeSymbol: {
    fontSize: 16,
  },
  nodeName: {
    fontFamily: AppFonts.serif,
    fontSize: 16.5,
    color: '#f5eee6',
    fontWeight: '600',
  },
  nodeTypeSub: {
    fontSize: 10,
    letterSpacing: 1.2,
    color: '#8c7746',
    fontFamily: AppFonts.mono,
    marginTop: 2,
  },
  nodeRoleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  nodeRoleText: {
    fontSize: 9.5,
    letterSpacing: 1.2,
    fontWeight: '700',
    fontFamily: AppFonts.mono,
  },
  nodeDescBox: {
    paddingVertical: 4,
  },
  nodeDesc: {
    fontSize: 13,
    lineHeight: 19,
    color: '#9e9587',
    fontFamily: AppFonts.sans,
  },
  nodeFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1a1813',
  },
  locateBtn: {
    paddingVertical: 4,
  },
  locateBtnText: {
    fontSize: 11.5,
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
  },
});
