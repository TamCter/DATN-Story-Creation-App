import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  INITIAL_PROJECTS,
  StoryLocationItem,
  StoryProject,
} from '@/constants/story-data';
import { AppFonts, ThemeColors } from '@/constants/theme';
import { projectStore } from '@/services/project-store';

export default function LocationsScreen() {
  const params = useLocalSearchParams();
  const projectId = (params.projectId as string) || 'project-1';

  const [currentProject, setCurrentProject] = React.useState<StoryProject>(() => {
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

  React.useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const proj = await projectStore.getProject(projectId);
        if (isMounted) setCurrentProject(proj);
      } catch (err) {
        console.warn('Lỗi tải địa điểm:', err);
      }
    }
    void load();
    return () => {
      isMounted = false;
    };
  }, [projectId]);

  const locations: StoryLocationItem[] = React.useMemo(() => {
    return (
      currentProject.locations ||
      currentProject.nodes
        .filter((n) => n.type === 'location')
        .map((n) => ({
          id: n.id,
          name: n.name,
          region: n.region || n.role || 'Chưa xác định',
          desc: n.desc,
        }))
    );
  }, [currentProject]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.headerBar}>
        <Pressable
          hitSlop={12}
          style={({ pressed }) => [
            styles.backBtn,
            pressed && styles.backBtnPressed,
          ]}
          onPress={() => router.back()}>
          <Text style={styles.backBtnIcon}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Địa điểm</Text>
      </View>

      {/* Locations List */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {locations.map((loc) => (
          <View key={loc.id} style={styles.locationItem}>
            <View style={styles.locRow}>
              <View style={styles.locNameWrap}>
                <Text style={styles.locSymbol}>▲</Text>
                <Text style={styles.locName}>{loc.name}</Text>
              </View>
              <Text style={styles.regionBadge}>{loc.region}</Text>
            </View>

            <Text style={styles.locDesc}>{loc.desc}</Text>
          </View>
        ))}

        {locations.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 48, gap: 8 }}>
            <Text style={{ fontSize: 28, color: '#3d372b' }}>▲</Text>
            <Text style={{ color: '#ded5c7', fontFamily: AppFonts.serif, fontSize: 16, fontWeight: '600' }}>
              Chưa có địa điểm nào
            </Text>
            <Text style={{ color: '#736a5c', fontSize: 12.5, textAlign: 'center' }}>
              Dự án này chưa có địa điểm được tạo. Hãy quay lại bản đồ đồ thị để thêm địa danh đầu tiên.
            </Text>
          </View>
        )}
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1c1a15',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#2d271e',
    backgroundColor: '#15130f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPressed: {
    backgroundColor: '#201d16',
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
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 40,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  locationItem: {
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#1c1a15',
  },
  locRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  locNameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  locSymbol: {
    color: '#9f70cf',
    fontSize: 13,
  },
  locName: {
    fontFamily: AppFonts.serif,
    fontSize: 17.5,
    color: '#f5eee6',
    fontWeight: '500',
  },
  regionBadge: {
    fontSize: 10.5,
    letterSpacing: 1.5,
    color: '#8f887b',
    fontWeight: '700',
    fontFamily: AppFonts.sans,
    textTransform: 'uppercase',
  },
  locDesc: {
    fontSize: 13.5,
    lineHeight: 20,
    color: '#8f887b',
    fontFamily: AppFonts.sans,
    paddingLeft: 23,
  },
});
