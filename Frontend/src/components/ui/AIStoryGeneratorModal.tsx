import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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
import { AppFonts, ThemeColors } from '@/constants/theme';
import { StoryChapter, StoryNode, StoryProject } from '@/constants/story-data';
import { api } from '@/services/api';
import { projectStore } from '@/services/project-store';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface AIStoryGeneratorModalProps {
  visible: boolean;
  onClose: () => void;
  project: StoryProject;
  onSuccess: () => Promise<void> | void;
  initialChapter?: StoryChapter | null; // Nếu mở để viết truyện cho một chương đã có
}

const WRITING_STYLES = [
  'Kiếm hiệp Kim Dung cổ điển, trượng nghĩa hào hiệp',
  'Tiên hiệp tu chân, ngộ đạo, huyền ảo thâm sâu',
  'Huyền huyễn dị giới, nhiệt huyết, combat kịch tính',
  'Cung đình mưu lược, giang hồ bí ẩn, đấu trí',
];

export default function AIStoryGeneratorModal({
  visible,
  onClose,
  project,
  onSuccess,
  initialChapter = null,
}: AIStoryGeneratorModalProps) {
  // Step 1: Input & Draft | Step 2: Events preview | Step 3: Full Story Narrative
  const [step, setStep] = useState<1 | 2 | 3>(initialChapter ? 2 : 1);
  const [userIdea, setUserIdea] = useState('');
  const [writingStyle, setWritingStyle] = useState(WRITING_STYLES[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Dữ liệu chương & sự kiện được AI tạo ra hoặc nhận từ ban đầu
  const [generatedChapter, setGeneratedChapter] = useState<{
    chapterNumber: number;
    title: string;
    desc: string;
  } | null>(() => {
    if (initialChapter) {
      return {
        chapterNumber: initialChapter.chapterNumber,
        title: initialChapter.title,
        desc: initialChapter.desc || '',
      };
    }
    return null;
  });

  const [generatedEvents, setGeneratedEvents] = useState<
    Array<{
      name: string;
      desc: string;
      location?: string;
      time?: string;
      charactersInvolved?: string[];
      impact?: string;
    }>
  >(() => {
    if (initialChapter && initialChapter.events) {
      return initialChapter.events.map((e) => ({
        name: e.title,
        desc: e.desc,
      }));
    }
    return [];
  });

  // Nội dung truyện được sáng tác
  const [storyContent, setStoryContent] = useState<string>('');
  const [wordCount, setWordCount] = useState<number>(0);
  const [copySuccess, setCopySuccess] = useState(false);

  // Reset khi mở lại với initialChapter
  React.useEffect(() => {
    if (visible) {
      if (initialChapter) {
        setStep(2);
        setGeneratedChapter({
          chapterNumber: initialChapter.chapterNumber,
          title: initialChapter.title,
          desc: initialChapter.desc || '',
        });
        const matchedEvts = (project.nodes || [])
          .filter(
            (n) =>
              n.type === 'event' &&
              (n.chapter === initialChapter.title ||
                initialChapter.events?.some((e) => e.id === n.id))
          )
          .map((n) => ({
            name: n.name,
            desc: n.desc,
            location: n.location,
            time: n.time,
            impact: n.impact,
          }));
        setGeneratedEvents(
          matchedEvts.length > 0
            ? matchedEvts
            : (initialChapter.events || []).map((e) => ({
                name: e.title,
                desc: e.desc,
              }))
        );
      } else {
        setStep(1);
        setUserIdea('');
        setGeneratedChapter(null);
        setGeneratedEvents([]);
        setStoryContent('');
      }
      setCopySuccess(false);
    }
  }, [visible, initialChapter, project.nodes]);

  // BƯỚC 1: Gọi AI để phác thảo Chương và các Sự kiện
  const handleGenerateChapterAndEvents = async () => {
    setIsGenerating(true);
    try {
      const res = await api.generateChapterAndEvents({
        projectTitle: project.title,
        userIdea: userIdea.trim(),
        chapters: project.chapters || [],
        nodes: project.nodes || [],
        writingStyle,
      });

      if (res.success && res.data) {
        setGeneratedChapter(res.data.chapter);
        setGeneratedEvents(res.data.events || []);
        setStep(2);
      } else {
        throw new Error(res.message || 'AI không thể tạo cấu trúc chương');
      }
    } catch (err: any) {
      console.error('Lỗi phác thảo chương:', err);
      const msg = err?.message || 'Không thể tạo chương bằng AI. Hãy kiểm tra kết nối.';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Thông báo', msg);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // BƯỚC 2: Gọi AI để sáng tác toàn bộ câu chuyện hoàn chỉnh cho chương
  const handleGenerateStoryNarrative = async () => {
    if (!generatedChapter) return;
    setIsGenerating(true);

    try {
      // Tìm các node liên quan (nhân vật, môn phái, địa điểm)
      const relatedNodes = (project.nodes || []).filter((n) => n.type !== 'event').slice(0, 20);

      const res = await api.generateChapterStory({
        projectTitle: project.title,
        chapter: generatedChapter,
        events: generatedEvents,
        relatedNodes,
        writingStyle,
      });

      if (res.success && res.data) {
        setStoryContent(res.data.storyContent);
        setWordCount(res.data.wordCount);
        setStep(3);
      } else {
        throw new Error(res.message || 'AI không thể sáng tác câu chuyện');
      }
    } catch (err: any) {
      console.error('Lỗi sáng tác câu chuyện:', err);
      const msg = err?.message || 'Không thể viết câu chuyện bằng AI. Hãy thử lại.';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Thông báo', msg);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // BƯỚC 3: Lưu toàn bộ Chương, Sự kiện (Nodes), và Nội dung truyện vào Database & Đồ thị
  const handleSaveAllToProject = async () => {
    if (!generatedChapter) return;
    setIsSaving(true);

    try {
      let targetChapterId = initialChapter?.id;

      // 1. Tạo hoặc cập nhật Chapter
      if (!initialChapter) {
        const createdChapter = await projectStore.createChapter(project.id, {
          chapterNumber: generatedChapter.chapterNumber,
          title: generatedChapter.title,
          desc: generatedChapter.desc,
          content: storyContent,
        });
        targetChapterId = createdChapter.id;
      } else {
        // Cập nhật nội dung câu chuyện cho chương hiện có
        await projectStore.updateChapterStoryContent(project.id, initialChapter.id, storyContent);
      }

      // 2. Tạo các Node loại 'event' trong đồ thị nếu là chương mới tạo từ AI
      if (!initialChapter && generatedEvents.length > 0) {
        // Lấy danh sách nodes hiện có của dự án để kiểm tra
        const currentNodes = project.nodes || [];

        for (const ev of generatedEvents) {
          try {
            // Đảm bảo node Địa điểm (Location) tồn tại
            if (ev.location && ev.location.trim()) {
              const locTrim = ev.location.trim();
              const existingLoc = currentNodes.find(
                (n) => n.type === 'location' && n.name.toLowerCase() === locTrim.toLowerCase()
              );
              if (!existingLoc) {
                try {
                  const createdLoc = await projectStore.createNode(project.id, {
                    name: locTrim,
                    type: 'location',
                    role: 'ĐỊA DANH',
                    region: 'Đông Vực',
                    desc: `Địa danh diễn ra sự kiện ${ev.name}`,
                    status: 'Hoạt động',
                  });
                  if (createdLoc) currentNodes.push(createdLoc);
                } catch (locErr) {
                  console.warn('Lỗi auto-create location:', locErr);
                }
              }
            }

            // Đảm bảo các node Nhân vật (Character) tham gia tồn tại
            if (ev.charactersInvolved && Array.isArray(ev.charactersInvolved)) {
              for (const charName of ev.charactersInvolved) {
                const cTrim = String(charName).trim();
                if (!cTrim) continue;
                const existingChar = currentNodes.find(
                  (n) => n.type === 'character' && n.name.toLowerCase() === cTrim.toLowerCase()
                );
                if (!existingChar) {
                  try {
                    const createdChar = await projectStore.createNode(project.id, {
                      name: cTrim,
                      type: 'character',
                      role: 'TRUNG LẬP',
                      gender: 'Nam',
                      desc: `Nhân vật tham gia sự kiện ${ev.name}`,
                      status: 'Còn sống',
                    });
                    if (createdChar) currentNodes.push(createdChar);
                  } catch (charErr) {
                    console.warn('Lỗi auto-create character:', charErr);
                  }
                }
              }
            }

            const charsStr = Array.isArray(ev.charactersInvolved)
              ? ev.charactersInvolved.join(', ')
              : (ev.charactersInvolved || '');

            const eventNodeData: Partial<StoryNode> = {
              name: ev.name,
              type: 'event',
              desc: ev.desc,
              chapter: generatedChapter.title,
              location: ev.location || '',
              time: ev.time || '',
              impact: ev.impact || '',
              role: 'BIẾN CỐ',
              status: 'Đã diễn ra',
              charactersInvolved: charsStr,
            };

            const createdNode = await projectStore.createNode(project.id, eventNodeData);
            if (createdNode) currentNodes.push(createdNode);
            if (targetChapterId && createdNode) {
              await projectStore.assignEventToChapter(project.id, targetChapterId, createdNode);
            }
          } catch (nodeErr) {
            console.warn('Lỗi tạo node sự kiện từ AI:', nodeErr);
          }
        }
      }

      await onSuccess();
      if (Platform.OS === 'web') {
        window.alert('Đã lưu thành công chương và các sự kiện vào dự án!');
      } else {
        Alert.alert('Thành công', 'Đã lưu chương và các sự kiện vào dự án!');
      }
      onClose();
    } catch (saveErr: any) {
      console.error('Lỗi lưu câu chuyện:', saveErr);
      const msg = saveErr?.message || 'Không thể lưu vào dự án';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Lỗi', msg);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyStory = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(storyContent);
      }
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 3000);
    } catch {
      setCopySuccess(true);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
        style={styles.modalOverlay}>
        <View style={styles.modalCardLarge}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.headerTitleBox}>
              <Text style={styles.headerIcon}>✨</Text>
              <View>
                <Text style={styles.headerTitle}>AI Sáng Tác Câu Chuyện</Text>
                <Text style={styles.headerSubtitle}>
                  Tạo Chương · Thiết Lập Sự Kiện · Viết Toàn Văn
                </Text>
              </View>
            </View>
            <Pressable hitSlop={12} onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {/* Stepper Tabs */}
          <View style={styles.stepperRow}>
            <Pressable
              style={[styles.stepItem, step === 1 && styles.stepItemActive]}
              onPress={() => !initialChapter && setStep(1)}
              disabled={Boolean(initialChapter)}>
              <Text style={[styles.stepNumber, step === 1 && styles.stepNumberActive]}>1</Text>
              <Text style={[styles.stepLabel, step === 1 && styles.stepLabelActive]}>
                Ý tưởng & Chương
              </Text>
            </Pressable>
            <View style={styles.stepLine} />
            <Pressable
              style={[styles.stepItem, step === 2 && styles.stepItemActive]}
              onPress={() => generatedChapter && setStep(2)}>
              <Text style={[styles.stepNumber, step === 2 && styles.stepNumberActive]}>2</Text>
              <Text style={[styles.stepLabel, step === 2 && styles.stepLabelActive]}>
                Sự kiện ({generatedEvents.length})
              </Text>
            </Pressable>
            <View style={styles.stepLine} />
            <Pressable
              style={[styles.stepItem, step === 3 && styles.stepItemActive]}
              onPress={() => storyContent && setStep(3)}>
              <Text style={[styles.stepNumber, step === 3 && styles.stepNumberActive]}>3</Text>
              <Text style={[styles.stepLabel, step === 3 && styles.stepLabelActive]}>
                Câu chuyện
              </Text>
            </Pressable>
          </View>

          {/* Loading Overlay khi AI đang xử lý */}
          {isGenerating && (
            <View style={styles.generatingOverlay}>
              <ActivityIndicator size="large" color="#e5a93c" />
              <Text style={styles.generatingText}>
                {step === 1
                  ? 'AI đang phác thảo chương và thiết lập các sự kiện...'
                  : 'AI đang phân tích các node và sáng tác toàn văn chương truyện...'}
              </Text>
              <Text style={styles.generatingSubtext}>
                Quá trình sáng tác có thể mất khoảng 15 - 30 giây. Vui lòng đợi trong giây lát.
              </Text>
            </View>
          )}

          {/* NỘI DUNG TỪNG BƯỚC */}
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
            {/* BƯỚC 1: Ý TƯỞNG & PHONG CÁCH */}
            {step === 1 && (
              <View style={styles.stepSection}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>DỰ ÁN HIỆN TẠI</Text>
                  <View style={styles.infoBadge}>
                    <Text style={styles.infoBadgeText}>{project.title}</Text>
                    <Text style={styles.infoBadgeSub}>
                      ({project.chapters?.length || 0} chương đã có · {project.nodes?.length || 0} thực thể)
                    </Text>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>PHONG CÁCH VĂN PHONG</Text>
                  <View style={styles.styleOptionsContainer}>
                    {WRITING_STYLES.map((st) => {
                      const isSel = writingStyle === st;
                      return (
                        <Pressable
                          key={st}
                          style={[styles.styleChip, isSel && styles.styleChipSelected]}
                          onPress={() => setWritingStyle(st)}>
                          <Text style={[styles.styleChipText, isSel && styles.styleChipTextSelected]}>
                            {st}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>
                    Ý TƯỞNG / MẠCH TRUYỆN MONG MUỐN CHO CHƯƠNG TIẾP THEO (TÙY CHỌN)
                  </Text>
                  <TextInput
                    style={styles.ideaTextInput}
                    placeholder="Ví dụ: Lăng Tiêu đột phá cảnh giới thì bị kẻ thù truy sát, may mắn được một nữ kiếm khách bí ẩn Bắc Vực giải cứu..."
                    placeholderTextColor="#685f50"
                    multiline
                    value={userIdea}
                    onChangeText={setUserIdea}
                    textAlignVertical="top"
                  />
                  <Text style={styles.inputHint}>
                    💡 Bạn có thể để trống, AI sẽ tự động phân tích các chương và nhân vật hiện có để phát triển tiếp chương tiếp theo một cách hợp lý.
                  </Text>
                </View>

                <Pressable
                  style={styles.primaryActionBtn}
                  onPress={handleGenerateChapterAndEvents}
                  disabled={isGenerating}>
                  <Text style={styles.primaryActionBtnText}>
                    ✨ Bắt đầu phác thảo Chương & Sự kiện →
                  </Text>
                </Pressable>
              </View>
            )}

            {/* BƯỚC 2: XEM TRƯỚC CHƯƠNG & SỰ KIỆN */}
            {step === 2 && generatedChapter && (
              <View style={styles.stepSection}>
                {/* Thông tin chương */}
                <View style={styles.chapterCard}>
                  <View style={styles.chapterCardHeader}>
                    <Text style={styles.chapterBadge}>CHƯƠNG {generatedChapter.chapterNumber}</Text>
                  </View>
                  <Text style={styles.chapterCardTitle}>{generatedChapter.title}</Text>
                  <Text style={styles.chapterCardDesc}>{generatedChapter.desc}</Text>
                </View>

                {/* Danh sách sự kiện do AI thiết lập */}
                <View style={styles.eventsSection}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionHeaderTitle}>
                      CÁC SỰ KIỆN TRONG CHƯƠNG ({generatedEvents.length})
                    </Text>
                    <Text style={styles.sectionHeaderNote}>
                      Sẽ được chuyển thành Node sự kiện trên đồ thị
                    </Text>
                  </View>

                  {generatedEvents.map((ev, idx) => (
                    <View key={idx} style={styles.eventItemCard}>
                      <View style={styles.eventItemIndex}>
                        <Text style={styles.eventIndexText}>{idx + 1}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={styles.eventItemName}>{ev.name}</Text>
                        <Text style={styles.eventItemDesc}>{ev.desc}</Text>
                        <View style={styles.eventMetaRow}>
                          {Boolean(ev.location) && (
                            <Text style={styles.eventMetaTag}>📍 {ev.location}</Text>
                          )}
                          {Boolean(ev.time) && (
                            <Text style={styles.eventMetaTag}>⏱ {ev.time}</Text>
                          )}
                          {Boolean(ev.charactersInvolved?.length) && (
                            <Text style={styles.eventMetaTag}>
                              👤 {ev.charactersInvolved?.join(', ')}
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Nút hành động */}
                <View style={styles.actionButtonGroup}>
                  {!initialChapter && (
                    <Pressable
                      style={styles.secondaryBtn}
                      onPress={() => setStep(1)}
                      disabled={isGenerating}>
                      <Text style={styles.secondaryBtnText}>← Chỉnh sửa ý tưởng</Text>
                    </Pressable>
                  )}

                  <Pressable
                    style={styles.primaryActionBtn}
                    onPress={handleGenerateStoryNarrative}
                    disabled={isGenerating}>
                    <Text style={styles.primaryActionBtnText}>
                      📖 Sáng tác câu chuyện chi tiết từ các Node này →
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* BƯỚC 3: CÂU CHUYỆN HOÀN CHỈNH */}
            {step === 3 && (
              <View style={styles.stepSection}>
                <View style={styles.storyHeaderBar}>
                  <View>
                    <Text style={styles.storyTitle}>{generatedChapter?.title}</Text>
                    <Text style={styles.storyWordCount}>
                      {wordCount.toLocaleString()} từ · Phong cách: {writingStyle.split(',')[0]}
                    </Text>
                  </View>
                  <Pressable
                    style={[styles.copyBtn, copySuccess && styles.copyBtnSuccess]}
                    onPress={handleCopyStory}>
                    <Text style={styles.copyBtnText}>
                      {copySuccess ? '✓ Đã sao chép' : '📋 Sao chép'}
                    </Text>
                  </Pressable>
                </View>

                {/* Khung đọc truyện */}
                <View style={styles.readerPaperContainer}>
                  <ScrollView
                    nestedScrollEnabled
                    style={styles.readerInnerScroll}
                    showsVerticalScrollIndicator={true}>
                    <Text style={styles.storyContentText}>{storyContent}</Text>
                  </ScrollView>
                </View>

                {/* Nút hành động lưu */}
                <View style={styles.actionButtonGroup}>
                  <Pressable
                    style={styles.secondaryBtn}
                    onPress={() => setStep(2)}
                    disabled={isSaving}>
                    <Text style={styles.secondaryBtnText}>← Xem lại sự kiện</Text>
                  </Pressable>

                  <Pressable
                    style={[styles.saveAllBtn, isSaving && { opacity: 0.6 }]}
                    onPress={handleSaveAllToProject}
                    disabled={isSaving}>
                    <Text style={styles.saveAllBtnText}>
                      {isSaving
                        ? 'Đang lưu vào dự án & đồ thị...'
                        : '💾 Lưu vào Dự Án & Đồ Thị'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  modalCardLarge: {
    width: '100%',
    maxWidth: 680,
    height: '92%',
    backgroundColor: '#161410',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(229,169,60,0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 20,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(229,169,60,0.15)',
    backgroundColor: '#1b1814',
  },
  headerTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    fontSize: 22,
    color: '#e5a93c',
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: AppFonts.serif,
    fontWeight: '700',
    color: '#f3c76f',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 10.5,
    fontFamily: AppFonts.mono,
    color: '#8f887b',
    letterSpacing: 0.8,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(229,169,60,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: '#e5a93c',
    fontWeight: '600',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: '#12100d',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(229,169,60,0.1)',
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    opacity: 0.5,
  },
  stepItemActive: {
    opacity: 1,
  },
  stepNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#26221c',
    color: '#8f887b',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 20,
  },
  stepNumberActive: {
    backgroundColor: '#e5a93c',
    color: '#12100d',
  },
  stepLabel: {
    fontSize: 11.5,
    color: '#8f887b',
    fontFamily: AppFonts.sans,
    fontWeight: '600',
  },
  stepLabelActive: {
    color: '#e5a93c',
  },
  stepLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(229,169,60,0.15)',
    marginHorizontal: 8,
  },
  generatingOverlay: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18,16,13,0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(229,169,60,0.2)',
  },
  generatingText: {
    marginTop: 12,
    fontSize: 13.5,
    color: '#f3c76f',
    fontFamily: AppFonts.serif,
    fontWeight: '600',
    textAlign: 'center',
  },
  generatingSubtext: {
    marginTop: 6,
    fontSize: 11,
    color: '#8f887b',
    fontFamily: AppFonts.sans,
    textAlign: 'center',
  },
  modalScroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 18,
    paddingBottom: 28,
  },
  stepSection: {
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 10.5,
    fontFamily: AppFonts.sans,
    fontWeight: '700',
    color: '#c29239',
    letterSpacing: 1.2,
  },
  infoBadge: {
    backgroundColor: '#1f1b15',
    borderWidth: 1,
    borderColor: '#383023',
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoBadgeText: {
    fontSize: 14,
    color: '#ded5c7',
    fontFamily: AppFonts.serif,
    fontWeight: '700',
  },
  infoBadgeSub: {
    fontSize: 11.5,
    color: '#8f887b',
  },
  styleOptionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  styleChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#1f1b15',
    borderWidth: 1,
    borderColor: '#383023',
  },
  styleChipSelected: {
    backgroundColor: 'rgba(229,169,60,0.15)',
    borderColor: '#e5a93c',
  },
  styleChipText: {
    fontSize: 12,
    color: '#a89c8a',
    fontFamily: AppFonts.sans,
  },
  styleChipTextSelected: {
    color: '#e5a93c',
    fontWeight: '700',
  },
  ideaTextInput: {
    backgroundColor: '#1f1b15',
    borderWidth: 1,
    borderColor: '#383023',
    borderRadius: 10,
    padding: 12,
    color: '#ded5c7',
    fontSize: 13.5,
    fontFamily: AppFonts.sans,
    minHeight: 110,
    lineHeight: 20,
  },
  inputHint: {
    fontSize: 11,
    color: '#7a7060',
    lineHeight: 16,
  },
  primaryActionBtn: {
    backgroundColor: '#e5a93c',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryActionBtnText: {
    color: '#12100d',
    fontSize: 13.5,
    fontFamily: AppFonts.sans,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  secondaryBtn: {
    backgroundColor: '#26201a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4d3f32',
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: '#c9bca9',
    fontSize: 13,
    fontFamily: AppFonts.sans,
    fontWeight: '600',
  },
  chapterCard: {
    backgroundColor: '#1f1b15',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(229,169,60,0.3)',
    padding: 16,
    gap: 6,
  },
  chapterCardHeader: {
    flexDirection: 'row',
  },
  chapterBadge: {
    fontSize: 9.5,
    color: '#e5a93c',
    backgroundColor: 'rgba(229,169,60,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    fontFamily: AppFonts.mono,
    fontWeight: '700',
    letterSpacing: 1,
  },
  chapterCardTitle: {
    fontSize: 16,
    color: '#f3c76f',
    fontFamily: AppFonts.serif,
    fontWeight: '700',
  },
  chapterCardDesc: {
    fontSize: 12.5,
    color: '#b0a493',
    lineHeight: 18,
  },
  eventsSection: {
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionHeaderTitle: {
    fontSize: 11,
    fontFamily: AppFonts.sans,
    fontWeight: '700',
    color: '#c29239',
    letterSpacing: 1.2,
  },
  sectionHeaderNote: {
    fontSize: 10,
    color: '#7a7060',
  },
  eventItemCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#1b1814',
    borderWidth: 1,
    borderColor: '#30281e',
    borderRadius: 10,
    padding: 12,
  },
  eventItemIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(229,169,60,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(229,169,60,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventIndexText: {
    fontSize: 11,
    color: '#e5a93c',
    fontWeight: '700',
  },
  eventItemName: {
    fontSize: 13.5,
    color: '#ded5c7',
    fontFamily: AppFonts.serif,
    fontWeight: '700',
  },
  eventItemDesc: {
    fontSize: 12,
    color: '#9e9282',
    lineHeight: 17,
  },
  eventMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  eventMetaTag: {
    fontSize: 10.5,
    color: '#c29239',
    backgroundColor: '#26201a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  actionButtonGroup: {
    gap: 10,
    marginTop: 10,
  },
  storyHeaderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(229,169,60,0.15)',
  },
  storyTitle: {
    fontSize: 16,
    fontFamily: AppFonts.serif,
    fontWeight: '700',
    color: '#f3c76f',
  },
  storyWordCount: {
    fontSize: 11,
    color: '#8f887b',
    fontFamily: AppFonts.mono,
  },
  copyBtn: {
    backgroundColor: '#26201a',
    borderWidth: 1,
    borderColor: '#4d3f32',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  copyBtnSuccess: {
    backgroundColor: 'rgba(52,211,153,0.15)',
    borderColor: '#34d399',
  },
  copyBtnText: {
    fontSize: 11.5,
    color: '#ded5c7',
    fontWeight: '600',
  },
  readerPaperContainer: {
    backgroundColor: '#1b1712',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#383023',
    maxHeight: SCREEN_HEIGHT * 0.45,
    padding: 16,
  },
  readerInnerScroll: {
    flexGrow: 1,
  },
  storyContentText: {
    fontSize: 14.5,
    fontFamily: AppFonts.serif,
    color: '#ded5c7',
    lineHeight: 25,
    letterSpacing: 0.3,
  },
  saveAllBtn: {
    backgroundColor: '#34d399',
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveAllBtnText: {
    color: '#064e3b',
    fontSize: 13.5,
    fontFamily: AppFonts.sans,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

