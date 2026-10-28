import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  getProjectChapters,
  INITIAL_PROJECTS,
  StoryChapter,
  StoryNode,
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

  const [isLoading, setIsLoading] = useState(true);

  // Create Chapter Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newChapterNumber, setNewChapterNumber] = useState('');
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [newChapterDesc, setNewChapterDesc] = useState('');
  const [isSubmittingChapter, setIsSubmittingChapter] = useState(false);

  // Assign Event Modal State
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [targetChapter, setTargetChapter] = useState<StoryChapter | null>(null);

  const loadData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const proj = await projectStore.getProject(projectId);
      setCurrentProject(proj);
    } catch (err) {
      console.warn('Lỗi tải chương & sự kiện:', err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const chapters: StoryChapter[] = useMemo(() => {
    return getProjectChapters(currentProject);
  }, [currentProject]);

  // CRITICAL RULE: Chỉ node nào có type === 'event' mới được gán vào trong chương!
  const eventOnlyNodes: StoryNode[] = useMemo(() => {
    return (currentProject.nodes || []).filter((n) => n.type === 'event');
  }, [currentProject.nodes]);

  const handleOpenCreateModal = () => {
    const nextNum = chapters.length + 1;
    setNewChapterNumber(String(nextNum));
    setNewChapterTitle('');
    setNewChapterDesc('');
    setCreateModalOpen(true);
  };

  const handleSaveChapter = async () => {
    if (!newChapterTitle.trim()) {
      if (Platform.OS === 'web') {
        window.alert('Vui lòng nhập tên chương');
      } else {
        Alert.alert('Thiếu thông tin', 'Vui lòng nhập tên chương');
      }
      return;
    }

    setIsSubmittingChapter(true);
    try {
      const num = parseInt(newChapterNumber.trim(), 10) || chapters.length + 1;
      await projectStore.createChapter(projectId, {
        chapterNumber: num,
        title: newChapterTitle.trim(),
        desc: newChapterDesc.trim(),
        events: [],
      });
      await loadData();
      setCreateModalOpen(false);
    } catch (err: any) {
      console.warn('Lỗi tạo chương:', err);
      const msg = err?.message || 'Không thể tạo chương';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Lỗi', msg);
      }
    } finally {
      setIsSubmittingChapter(false);
    }
  };

  const handleOpenAssignModal = (chapter: StoryChapter) => {
    setTargetChapter(chapter);
    setAssignModalOpen(true);
  };

  const handleAssignEvent = async (eventNode: StoryNode) => {
    if (!targetChapter) return;
    try {
      await projectStore.assignEventToChapter(projectId, targetChapter.id, eventNode);
      await loadData();
      setAssignModalOpen(false);
    } catch (err: any) {
      console.warn('Lỗi gán sự kiện vào chương:', err);
      const msg = err?.message || 'Không thể gán sự kiện vào chương';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Lỗi', msg);
      }
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.headerBar}>
        <View style={styles.headerLeft}>
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

        <Pressable
          style={({ pressed }) => [
            styles.addChapterBtn,
            pressed && styles.addChapterBtnPressed,
          ]}
          onPress={handleOpenCreateModal}>
          <Text style={styles.addChapterBtnText}>+ Tạo chương</Text>
        </Pressable>
      </View>

      {/* Chapters & Events List */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {isLoading && chapters.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 48 }}>
            <ActivityIndicator size="large" color="#d4a373" />
          </View>
        )}

        {chapters.length === 0 && !isLoading && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📖</Text>
            <Text style={styles.emptyTitle}>Chưa có chương nào</Text>
            <Text style={styles.emptyDesc}>
              Dự án này chưa có chương nào được tạo. Hãy nhấn nút "+ Tạo chương" để bắt đầu chia mạch truyện.
            </Text>
            <Pressable style={styles.createFirstBtn} onPress={handleOpenCreateModal}>
              <Text style={styles.createFirstBtnText}>+ Tạo chương đầu tiên</Text>
            </Pressable>
          </View>
        )}

        {chapters.map((chapter, index) => {
          const isLast = index === chapters.length - 1;

          // Tìm các sự kiện thuộc về chương này (theo chapter.title, chapter.id, hoặc trong chapter.events)
          const matchedEvents = eventOnlyNodes.filter((evt) => {
            const chTitle = chapter.title.toLowerCase();
            const chNum = `chương ${chapter.chapterNumber}`;
            const evtChapter = (evt.chapter || '').toLowerCase();
            return (
              evtChapter === chTitle ||
              evtChapter === chNum ||
              (chapter.events && chapter.events.some((e) => e.id === evt.id))
            );
          });

          // Hợp nhất cả sự kiện từ chapter.events nếu chưa có trong node
          const displayEvents: Array<{ id: string; title: string; desc?: string }> = [
            ...matchedEvents.map((m) => ({ id: m.id, title: m.name, desc: m.desc })),
          ];
          for (const ev of chapter.events || []) {
            if (!displayEvents.some((d) => d.id === ev.id)) {
              displayEvents.push(ev);
            }
          }

          return (
            <View key={chapter.id} style={styles.chapterItem}>
              {/* Chapter Meta */}
              <View style={styles.chapterMetaRow}>
                <Text style={styles.chapterMeta}>
                  CHƯƠNG {chapter.chapterNumber} · {displayEvents.length} SỰ KIỆN
                </Text>
              </View>

              {/* Chapter Title */}
              <Text style={styles.chapterTitle}>{chapter.title}</Text>

              {/* Chapter Description */}
              {Boolean(chapter.desc) && (
                <Text style={styles.chapterDesc}>{chapter.desc}</Text>
              )}

              {/* Events in Chapter */}
              {displayEvents.length > 0 ? (
                <View style={styles.eventsBlock}>
                  {displayEvents.map((evt) => (
                    <View key={evt.id} style={styles.eventRow}>
                      <View style={styles.eventDot} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.eventTitle}>{evt.title}</Text>
                        {Boolean(evt.desc) && (
                          <Text style={styles.eventDesc}>{evt.desc}</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.noEventsText}>Chưa có sự kiện nào trong chương này.</Text>
              )}

              {/* Action buttons */}
              <View style={styles.chapterActionsRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.assignEventBtn,
                    pressed && styles.assignEventBtnPressed,
                  ]}
                  onPress={() => handleOpenAssignModal(chapter)}>
                  <Text style={styles.assignEventBtnText}>+ Gán sự kiện vào chương</Text>
                </Pressable>

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
                    Xem đồ thị →
                  </Text>
                </Pressable>
              </View>

              {/* Divider between chapters */}
              {!isLast && <View style={styles.chapterDivider} />}
            </View>
          );
        })}
      </ScrollView>

      {/* Modal 1: Tạo Chương Mới */}
      <Modal visible={createModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeading}>Tạo chương mới</Text>
              <Pressable onPress={() => setCreateModalOpen(false)} hitSlop={10}>
                <Text style={styles.closeModalText}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalInputLabel}>Số thứ tự chương</Text>
              <TextInput
                style={styles.modalInput}
                value={newChapterNumber}
                onChangeText={setNewChapterNumber}
                keyboardType="numeric"
                placeholder="Ví dụ: 1, 2, 3..."
                placeholderTextColor="#665f52"
              />
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalInputLabel}>Tên chương *</Text>
              <TextInput
                style={styles.modalInput}
                value={newChapterTitle}
                onChangeText={setNewChapterTitle}
                placeholder="Ví dụ: Tiêu Gia Phế Vật / Hẹn Ước Ba Năm..."
                placeholderTextColor="#665f52"
              />
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalInputLabel}>Tóm tắt nội dung chương</Text>
              <TextInput
                style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
                value={newChapterDesc}
                onChangeText={setNewChapterDesc}
                multiline
                placeholder="Mô tả bối cảnh hoặc diễn biến chính của chương này..."
                placeholderTextColor="#665f52"
              />
            </View>

            <View style={styles.modalFooter}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setCreateModalOpen(false)}>
                <Text style={styles.cancelBtnText}>Hủy</Text>
              </Pressable>
              <Pressable
                style={[styles.saveBtn, isSubmittingChapter && { opacity: 0.6 }]}
                disabled={isSubmittingChapter}
                onPress={handleSaveChapter}>
                <Text style={styles.saveBtnText}>
                  {isSubmittingChapter ? 'Đang lưu...' : 'Lưu chương'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 2: Gán Sự Kiện Vào Chương (Chỉ Node Sự Kiện) */}
      <Modal visible={assignModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalHeading}>Gán sự kiện vào chương</Text>
                <Text style={styles.modalSubheading}>
                  {targetChapter ? `Chương ${targetChapter.chapterNumber}: ${targetChapter.title}` : ''}
                </Text>
              </View>
              <Pressable onPress={() => setAssignModalOpen(false)} hitSlop={10}>
                <Text style={styles.closeModalText}>✕</Text>
              </Pressable>
            </View>

            <Text style={styles.eventNoticeText}>
              ⚡ Lưu ý: Chỉ các thực thể có phân loại là <Text style={{ color: '#e5a93c', fontWeight: 'bold' }}>SỰ KIỆN</Text> mới được phép gán vào chương.
            </Text>

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {eventOnlyNodes.length === 0 ? (
                <View style={styles.noEventsBox}>
                  <Text style={styles.noEventsNotice}>
                    Dự án hiện chưa có node Sự kiện nào.
                  </Text>
                  <Text style={styles.noEventsSub}>
                    Hãy vào danh sách Thực thể và tạo node phân loại "Sự kiện" trước.
                  </Text>
                </View>
              ) : (
                eventOnlyNodes.map((evt) => {
                  const isAlreadyIn = targetChapter?.events?.some((e) => e.id === evt.id) ||
                    evt.chapter === targetChapter?.title;

                  return (
                    <Pressable
                      key={evt.id}
                      style={[
                        styles.assignEventCard,
                        isAlreadyIn && styles.assignEventCardActive,
                      ]}
                      onPress={() => handleAssignEvent(evt)}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.assignEventName}>
                          {evt.name} {isAlreadyIn ? '✓' : ''}
                        </Text>
                        {Boolean(evt.desc) && (
                          <Text numberOfLines={2} style={styles.assignEventDesc}>
                            {evt.desc}
                          </Text>
                        )}
                        <Text style={styles.assignEventMeta}>
                          {evt.time ? `Thời gian: ${evt.time} · ` : ''}
                          {evt.location ? `Nơi diễn ra: ${evt.location}` : 'Chưa có địa điểm'}
                        </Text>
                      </View>

                      <View style={[styles.assignBadge, isAlreadyIn && styles.assignBadgeActive]}>
                        <Text style={[styles.assignBadgeText, isAlreadyIn && styles.assignBadgeTextActive]}>
                          {isAlreadyIn ? 'Đã gán' : 'Gán vào'}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setAssignModalOpen(false)}>
                <Text style={styles.cancelBtnText}>Đóng</Text>
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
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
  addChapterBtn: {
    backgroundColor: '#e5a93c',
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addChapterBtnPressed: {
    backgroundColor: '#c89332',
  },
  addChapterBtnText: {
    color: '#120f0d',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: AppFonts.sans,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 50,
    maxWidth: 540,
    width: '100%',
    alignSelf: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 50,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 40,
  },
  emptyTitle: {
    color: '#f0e6d6',
    fontSize: 18,
    fontWeight: 'bold',
  },
  emptyDesc: {
    color: '#8c7d6b',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  createFirstBtn: {
    marginTop: 10,
    backgroundColor: '#e5a93c',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 6,
  },
  createFirstBtnText: {
    color: '#120f0d',
    fontWeight: 'bold',
    fontSize: 13,
  },
  chapterItem: {
    marginBottom: 6,
  },
  chapterMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  chapterMeta: {
    fontSize: 11,
    letterSpacing: 1.5,
    color: '#5b8ec2',
    fontWeight: '700',
    fontFamily: AppFonts.sans,
    textTransform: 'uppercase',
  },
  chapterTitle: {
    fontFamily: AppFonts.serif,
    fontSize: 24,
    color: '#f5eee6',
    fontWeight: '600',
    marginBottom: 8,
  },
  chapterDesc: {
    fontSize: 13.5,
    lineHeight: 20,
    color: '#8f887b',
    fontFamily: AppFonts.sans,
    marginBottom: 14,
  },
  eventsBlock: {
    borderLeftWidth: 2,
    borderLeftColor: '#c89332',
    paddingLeft: 14,
    marginVertical: 8,
    gap: 10,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  eventDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e5a93c',
    marginTop: 6,
  },
  eventTitle: {
    fontFamily: AppFonts.serif,
    fontSize: 15,
    color: '#ded5c7',
    fontWeight: '600',
    marginBottom: 2,
  },
  eventDesc: {
    fontSize: 12.5,
    lineHeight: 18,
    color: '#8f887b',
    fontFamily: AppFonts.sans,
  },
  noEventsText: {
    fontSize: 12,
    color: '#665f52',
    fontStyle: 'italic',
    marginVertical: 6,
  },
  chapterActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  assignEventBtn: {
    borderWidth: 1,
    borderColor: '#4d3f32',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1b1713',
  },
  assignEventBtnPressed: {
    backgroundColor: '#26201a',
  },
  assignEventBtnText: {
    color: '#e5a93c',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: AppFonts.sans,
  },
  viewGraphBtn: {
    borderWidth: 1,
    borderColor: '#e5a93c50',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'transparent',
  },
  viewGraphBtnPressed: {
    backgroundColor: 'rgba(229, 169, 60, 0.12)',
  },
  viewGraphBtnText: {
    color: '#e5a93c',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: AppFonts.sans,
  },
  chapterDivider: {
    height: 1,
    backgroundColor: '#201d18',
    marginVertical: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#1b1713',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4d3f32',
    padding: 18,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#2b231c',
    paddingBottom: 10,
  },
  modalHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: '#e5a93c',
  },
  modalSubheading: {
    fontSize: 12,
    color: '#8c7d6b',
    marginTop: 2,
  },
  closeModalText: {
    color: '#8c7d6b',
    fontSize: 16,
    fontWeight: 'bold',
  },
  eventNoticeText: {
    fontSize: 12,
    color: '#8c7d6b',
    lineHeight: 18,
    backgroundColor: '#231d17',
    padding: 8,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#e5a93c',
  },
  modalInputGroup: {
    gap: 4,
  },
  modalInputLabel: {
    color: '#a89885',
    fontSize: 12,
    fontWeight: '600',
  },
  modalInput: {
    backgroundColor: '#26201a',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3d3328',
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 13,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  cancelBtnText: {
    color: '#8c7d6b',
    fontSize: 13,
  },
  saveBtn: {
    backgroundColor: '#e5a93c',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  saveBtnText: {
    color: '#120f0d',
    fontWeight: 'bold',
    fontSize: 13,
  },
  noEventsBox: {
    paddingVertical: 20,
    alignItems: 'center',
    gap: 6,
  },
  noEventsNotice: {
    color: '#d95a38',
    fontSize: 13,
    fontWeight: '600',
  },
  noEventsSub: {
    color: '#8c7d6b',
    fontSize: 12,
    textAlign: 'center',
  },
  assignEventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 6,
    backgroundColor: '#231d17',
    borderWidth: 1,
    borderColor: '#33291f',
    marginBottom: 8,
    gap: 10,
  },
  assignEventCardActive: {
    borderColor: '#e5a93c',
    backgroundColor: '#e5a93c12',
  },
  assignEventName: {
    color: '#f0e6d6',
    fontSize: 13,
    fontWeight: '600',
  },
  assignEventDesc: {
    color: '#8c7d6b',
    fontSize: 11,
  },
  assignEventMeta: {
    color: '#5b8ec2',
    fontSize: 10.5,
    marginTop: 2,
  },
  assignBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#2e251d',
    borderWidth: 1,
    borderColor: '#4d3f32',
  },
  assignBadgeActive: {
    backgroundColor: '#e5a93c',
    borderColor: '#e5a93c',
  },
  assignBadgeText: {
    color: '#e5a93c',
    fontSize: 11,
    fontWeight: '700',
  },
  assignBadgeTextActive: {
    color: '#120f0d',
  },
});
