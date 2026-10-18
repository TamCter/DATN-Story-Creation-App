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
  StoryTimelineEvent,
} from '@/constants/story-data';
import { AppFonts, ThemeColors } from '@/constants/theme';

export default function EventsDetailScreen() {
  const params = useLocalSearchParams();
  const projectId = (params.projectId as string) || 'project-1';

  const currentProject = useMemo(() => {
    return (
      INITIAL_PROJECTS.find((p) => p.id === projectId) || INITIAL_PROJECTS[0]
    );
  }, [projectId]);

  const events: StoryTimelineEvent[] = currentProject.events || [
    {
      id: 'event-1',
      chapter: 'CHƯƠNG 1',
      title: 'Đêm Hỏa Thiêu Sơn Trang',
      desc: 'Sơn trang họ Lăng bị thiêu rụi. Chỉ Lãng Tiêu sống sót, tay còn cầm chuôi kiếm gãy.',
      tags: [
        { name: 'Lãng Tiêu', type: 'character', symbol: '●', color: '#e5a93c' },
        { name: 'Triệu Vô Cực', type: 'character', symbol: '●', color: '#e5a93c' },
        { name: 'Hàn Nguyệt Thành', type: 'location', symbol: '▲', color: '#9f70cf' },
      ],
    },
    {
      id: 'event-2',
      chapter: 'CHƯƠNG 7',
      title: 'Hội Thề Nguyệt Hạ',
      desc: 'Buổi họp mặt lớn nhất của võ lâm, nơi mảnh kiếm đầu tiên xuất hiện.',
      tags: [
        { name: 'Kiếm Hoàng Hôn', type: 'item', symbol: '◆', color: '#42b883' },
        { name: 'Thiên Hạ Minh', type: 'faction', symbol: '⬡', color: '#d95a38' },
      ],
    },
  ];

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
        <Text style={styles.headerTitle}>Chi tiết sự kiện</Text>
      </View>

      {/* Events Timeline */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.timelineContainer}>
          {events.map((item, index) => {
            const isLast = index === events.length - 1;
            return (
              <View key={item.id} style={styles.timelineItem}>
                {/* Left Line & Marker */}
                <View style={styles.timelineLeftCol}>
                  <View style={styles.markerSquare} />
                  {!isLast && <View style={styles.connectingLine} />}
                </View>

                {/* Right Content */}
                <View style={[styles.timelineContent, !isLast && styles.contentSpacing]}>
                  <Text style={styles.chapterText}>{item.chapter}</Text>
                  <Text style={styles.eventTitle}>{item.title}</Text>
                  <Text style={styles.eventDesc}>{item.desc}</Text>

                  {/* Tags */}
                  <View style={styles.tagsContainer}>
                    {item.tags.map((tag, tagIdx) => (
                      <View key={tagIdx} style={styles.tagPill}>
                        <Text style={[styles.tagSymbol, { color: tag.color }]}>
                          {tag.symbol}
                        </Text>
                        <Text style={styles.tagName}>{tag.name}</Text>
                      </View>
                    ))}
                  </View>
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
    paddingTop: 24,
    paddingBottom: 40,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  timelineContainer: {
    paddingLeft: 6,
  },
  timelineItem: {
    flexDirection: 'row',
  },
  timelineLeftCol: {
    width: 28,
    alignItems: 'center',
  },
  markerSquare: {
    width: 12,
    height: 12,
    borderWidth: 1.5,
    borderColor: '#5b8ec2',
    backgroundColor: '#0e0d0b',
    marginTop: 4,
    zIndex: 2,
  },
  connectingLine: {
    width: 1,
    flex: 1,
    backgroundColor: '#2a3545',
    marginVertical: 4,
  },
  timelineContent: {
    flex: 1,
    paddingLeft: 10,
  },
  contentSpacing: {
    paddingBottom: 36,
  },
  chapterText: {
    fontSize: 11,
    letterSpacing: 2,
    color: '#5b8ec2',
    fontWeight: '700',
    fontFamily: AppFonts.sans,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  eventTitle: {
    fontFamily: AppFonts.serif,
    fontSize: 18.5,
    color: '#f5eee6',
    fontWeight: '500',
    marginBottom: 8,
  },
  eventDesc: {
    fontSize: 13.5,
    lineHeight: 20,
    color: '#8f887b',
    fontFamily: AppFonts.sans,
    marginBottom: 14,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#15130f',
    borderWidth: 1,
    borderColor: '#2e281f',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
  },
  tagSymbol: {
    fontSize: 10.5,
  },
  tagName: {
    fontSize: 12,
    color: '#f5eee6',
    fontFamily: AppFonts.sans,
    fontWeight: '500',
  },
});
