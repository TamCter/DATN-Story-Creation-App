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
  getProjectChapters,
  INITIAL_PROJECTS,
  StoryChapter,
  StoryProject,
} from '@/constants/story-data';
import { AppFonts, ThemeColors } from '@/constants/theme';
import { projectStore } from '@/services/project-store';

export default function ChapterDetailScreen() {
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
        console.warn('Lỗi tải chương & sự kiện:', err);
      }
    }
    void load();
    return () => {
      isMounted = false;
    };
  }, [projectId]);

  const chapters: StoryChapter[] = React.useMemo(() => {
    return getProjectChapters(currentProject);
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
        <Text style={styles.headerTitle}>Chi tiết chương</Text>
      </View>

      {/* Chapters & Events List */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {chapters.map((chapter, index) => {
          const isLast = index === chapters.length - 1;
          return (
            <View key={chapter.id} style={styles.chapterItem}>
              {/* Chapter Meta */}
              <Text style={styles.chapterMeta}>
                CHƯƠNG {chapter.chapterNumber} · {chapter.events.length} SỰ KIỆN
              </Text>

              {/* Chapter Title */}
              <Text style={styles.chapterTitle}>{chapter.title}</Text>

              {/* Chapter Description */}
              <Text style={styles.chapterDesc}>{chapter.desc}</Text>

              {/* Events in Chapter */}
              {chapter.events.length > 0 && (
                <View style={styles.eventsBlock}>
                  {chapter.events.map((evt) => (
                    <View key={evt.id} style={styles.eventRow}>
                      <Text style={styles.eventTitle}>{evt.title}</Text>
                      <Text style={styles.eventDesc}>{evt.desc}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* View Graph for this Chapter Button */}
              <Pressable
                style={({ pressed }) => [
                  styles.viewGraphBtn,
                  pressed && styles.viewGraphBtnPressed,
                ]}
                onPress={() => {
                  router.push({
                    pathname: '/graph' as any,
                    params: {
                      projectId: currentProject.id,
                      chapterId: chapter.id,
                    },
                  });
                }}>
                <Text style={styles.viewGraphBtnText}>
                  Xem đồ thị chương này →
                </Text>
              </Pressable>

              {/* Divider between chapters */}
              {!isLast && <View style={styles.chapterDivider} />}
            </View>
          );
        })}
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
    fontSize: 22,
    color: '#f3c76f',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 50,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  chapterItem: {
    marginBottom: 6,
  },
  chapterMeta: {
    fontSize: 11,
    letterSpacing: 1.5,
    color: '#5b8ec2',
    fontWeight: '700',
    fontFamily: AppFonts.sans,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  chapterTitle: {
    fontFamily: AppFonts.serif,
    fontSize: 26,
    color: '#f5eee6',
    fontWeight: '500',
    marginBottom: 8,
  },
  chapterDesc: {
    fontSize: 13.5,
    lineHeight: 20,
    color: '#8f887b',
    fontFamily: AppFonts.sans,
    marginBottom: 16,
  },
  eventsBlock: {
    borderLeftWidth: 1.5,
    borderLeftColor: '#c89332',
    paddingLeft: 14,
    marginVertical: 4,
  },
  eventRow: {
    marginBottom: 14,
  },
  eventTitle: {
    fontFamily: AppFonts.serif,
    fontSize: 16,
    color: '#ded5c7',
    fontWeight: '500',
    marginBottom: 4,
  },
  eventDesc: {
    fontSize: 13,
    lineHeight: 19,
    color: '#8f887b',
    fontFamily: AppFonts.sans,
  },
  viewGraphBtn: {
    borderWidth: 1,
    borderColor: '#e5a93c',
    borderRadius: 2,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: 'transparent',
  },
  viewGraphBtnPressed: {
    backgroundColor: 'rgba(229, 169, 60, 0.12)',
  },
  viewGraphBtnText: {
    color: '#e5a93c',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: AppFonts.sans,
  },
  chapterDivider: {
    height: 1,
    backgroundColor: '#201d18',
    marginVertical: 24,
  },
});
