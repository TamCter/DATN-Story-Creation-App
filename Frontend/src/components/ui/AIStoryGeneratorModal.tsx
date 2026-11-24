import React, { useEffect, useRef, useState } from 'react';
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
import {
  EVENT_IMPORTANCE_OPTIONS,
  EVENT_TIMELINE_OPTIONS,
  EVENT_TYPE_OPTIONS,
  eventBelongsToChapter,
  parseEventParticipants,
  StoryChapter,
  StoryNode,
  StoryProject,
} from '@/constants/story-data';
import { FormSelectField } from '@/components/ui/FormSelectField';
import { api } from '@/services/api';
import { projectStore } from '@/services/project-store';
import * as Clipboard from 'expo-clipboard';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface AIStoryGeneratorModalProps {
  visible: boolean;
  onClose: () => void;
  project: StoryProject;
  onSuccess: () => Promise<void> | void;
  initialChapter?: StoryChapter | null; // Nếu mở để viết truyện cho một chương đã có
}

const WRITING_STYLES = [
  'Trinh thám tâm lý, giàu manh mối và bất ngờ',
  'Chính kịch hiện thực, tập trung vào chiều sâu nhân vật',
  'Kỳ ảo giàu hình ảnh, nhịp truyện kịch tính',
  'Mưu lược và đấu trí, chú trọng xung đột giữa các nhân vật',
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
  const generationSessionRef = useRef(0);
  const draftVersionRef = useRef(0);
  const isGeneratingRef = useRef(false);
  const isSavingRef = useRef(false);
  const saveOperationRef = useRef(0);
  const createdChapterIdRef = useRef<{ draftVersion: number; chapterId: string } | null>(null);
  const savedEventNodeIdsRef = useRef<{
    draftVersion: number;
    ids: Record<number, string>;
  }>({ draftVersion: 0, ids: {} });
  const projectNodesRef = useRef(project.nodes);
  const targetChapterKey = `${project.id}:${initialChapter?.id || 'new'}`;
  const previousTargetChapterKeyRef = useRef(targetChapterKey);

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
      eventType?: string;
      importance?: string;
      arcName?: string;
      sequenceOrder?: string;
      location?: string;
      time?: string;
      timelineType?: string;
      duration?: string;
      cause?: string;
      conflict?: string;
      outcome?: string;
      consequences?: string;
      characterRoles?: string;
      itemsInvolved?: string[];
      factionsInvolved?: string[];
      charactersInvolved?: string[];
      characterStatusChanges?: Array<{
        characterName: string;
        status: 'Đã chết' | 'Hồi sinh';
        statusEvent?: string;
      }>;
      impact?: string;
    }>
  >([]);

  // Nội dung truyện được sáng tác
  const [storyContent, setStoryContent] = useState<string>('');
  const [wordCount, setWordCount] = useState<number>(0);
  const [copySuccess, setCopySuccess] = useState(false);
  const [copyError, setCopyError] = useState(false);

  // Chỉnh sửa các trường metadata không ảnh hưởng cốt truyện của sự kiện ở Bước 2
  const [editingEventIndex, setEditingEventIndex] = useState<number | null>(null);
  const [editingEventDraft, setEditingEventDraft] = useState<{
    name: string;
    eventType: string;
    importance: string;
    arcName: string;
    sequenceOrder: string;
    time: string;
    timelineType: string;
    duration: string;
    characterRoles: string;
  } | null>(null);

  const handleOpenEventEdit = (index: number) => {
    if (isGenerating || isSaving) return;
    const target = generatedEvents[index];
    if (!target) return;
    setEditingEventIndex(index);
    setEditingEventDraft({
      name: target.name || '',
      eventType: target.eventType || '',
      importance: target.importance || '',
      arcName: target.arcName || '',
      sequenceOrder: target.sequenceOrder || String(index + 1),
      time: target.time || '',
      timelineType: target.timelineType || 'Hiện tại',
      duration: target.duration || '',
      characterRoles: target.characterRoles || '',
    });
  };

  const handleSaveEventEdit = () => {
    if (editingEventIndex === null || !editingEventDraft) return;
    const trimmedName = editingEventDraft.name.trim();
    if (!trimmedName) {
      if (Platform.OS === 'web') {
        window.alert('Tên sự kiện không được để trống.');
      } else {
        Alert.alert('Thiếu tên sự kiện', 'Tên sự kiện không được để trống.');
      }
      return;
    }

    const currentTarget = generatedEvents[editingEventIndex];
    if (!currentTarget) {
      setEditingEventIndex(null);
      setEditingEventDraft(null);
      return;
    }

    const nextEventType = editingEventDraft.eventType.trim();
    const nextImportance = editingEventDraft.importance.trim();
    const nextArcName = editingEventDraft.arcName.trim();
    const nextSequenceOrder =
      editingEventDraft.sequenceOrder.trim() || String(editingEventIndex + 1);
    const nextTime = editingEventDraft.time.trim();
    const nextTimelineType = editingEventDraft.timelineType.trim() || 'Hiện tại';
    const nextDuration = editingEventDraft.duration.trim();
    const nextCharacterRoles = editingEventDraft.characterRoles.trim();

    const hasEffectiveChange =
      trimmedName !== (currentTarget.name || '').trim() ||
      nextEventType !== (currentTarget.eventType || '').trim() ||
      nextImportance !== (currentTarget.importance || '').trim() ||
      nextArcName !== (currentTarget.arcName || '').trim() ||
      nextSequenceOrder !== (currentTarget.sequenceOrder || String(editingEventIndex + 1)).trim() ||
      nextTime !== (currentTarget.time || '').trim() ||
      nextTimelineType !== (currentTarget.timelineType || 'Hiện tại').trim() ||
      nextDuration !== (currentTarget.duration || '').trim() ||
      nextCharacterRoles !== (currentTarget.characterRoles || '').trim();

    if (!hasEffectiveChange) {
      setEditingEventIndex(null);
      setEditingEventDraft(null);
      return;
    }

    const oldNameLower = (currentTarget.name || '').trim().toLocaleLowerCase('vi');
    const renamed = oldNameLower !== '' && oldNameLower !== trimmedName.toLocaleLowerCase('vi');

    setGeneratedEvents((prev) =>
      prev.map((ev, idx) => {
        if (idx === editingEventIndex) {
          return {
            ...ev,
            name: trimmedName,
            eventType: nextEventType,
            importance: nextImportance,
            arcName: nextArcName,
            sequenceOrder: nextSequenceOrder,
            time: nextTime,
            timelineType: nextTimelineType,
            duration: nextDuration,
            characterRoles: nextCharacterRoles,
            characterStatusChanges: (ev.characterStatusChanges || []).map((change) => ({
              ...change,
              statusEvent: trimmedName,
            })),
          };
        }
        if (
          renamed &&
          typeof ev.cause === 'string' &&
          ev.cause.trim().toLocaleLowerCase('vi') === oldNameLower
        ) {
          return { ...ev, cause: trimmedName };
        }
        return ev;
      })
    );

    // Đánh dấu nội dung truyện đã cũ và yêu cầu sáng tác lại trước khi lưu
    if (storyContent) {
      setStoryContent('');
      setWordCount(0);
    }

    setEditingEventIndex(null);
    setEditingEventDraft(null);
  };

  useEffect(() => {
    projectNodesRef.current = project.nodes;
  }, [project.nodes]);

  useEffect(() => {
    generationSessionRef.current += 1;
    // Clear the spinner when a pending request belongs to an invalidated modal session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    isGeneratingRef.current = false;
    setIsGenerating(false);
    return () => {
      generationSessionRef.current += 1;
    };
  }, [visible, project.id, initialChapter?.id]);

  useEffect(() => {
    if (previousTargetChapterKeyRef.current === targetChapterKey) return;
    previousTargetChapterKeyRef.current = targetChapterKey;
    draftVersionRef.current += 1;
    saveOperationRef.current += 1;
    isSavingRef.current = false;
    createdChapterIdRef.current = null;
    savedEventNodeIdsRef.current = {
      draftVersion: draftVersionRef.current,
      ids: {},
    };
    setStoryContent('');
    setWordCount(0);
    setIsSaving(false);
  }, [targetChapterKey]);

  // Reset khi mở lại với initialChapter
  useEffect(() => {
    if (visible) {
      if (initialChapter) {
        // Initialize this modal from the selected chapter when it opens or changes.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStep(2);
        setGeneratedChapter({
          chapterNumber: initialChapter.chapterNumber,
          title: initialChapter.title,
          desc: initialChapter.desc || '',
        });
        const matchedEvts = (projectNodesRef.current || [])
          .filter((node) => eventBelongsToChapter(node, initialChapter))
          .map((n, idx) => ({
            name: n.name,
            desc: n.desc,
            eventType: n.eventType || '',
            importance: n.importance || '',
            arcName: n.arcName || '',
            sequenceOrder: n.sequenceOrder || String(idx + 1),
            location: n.location,
            time: n.time,
            timelineType: n.timelineType || 'Hiện tại',
            duration: n.duration || '',
            cause: n.cause || '',
            conflict: n.conflict || '',
            outcome: n.outcome || '',
            consequences: n.consequences || '',
            characterRoles: n.characterRoles || '',
            itemsInvolved: parseEventParticipants(n.itemsInvolved),
            factionsInvolved: parseEventParticipants(n.factionsInvolved),
            charactersInvolved: parseEventParticipants(
              n.charactersInvolved || n.characters
            ),
            impact: n.impact,
          }));
        setGeneratedEvents(matchedEvts);
      } else {
        if (
          !createdChapterIdRef.current ||
          createdChapterIdRef.current.draftVersion !== draftVersionRef.current
        ) {
          setStep(1);
          setUserIdea('');
          setGeneratedChapter(null);
          setGeneratedEvents([]);
          setStoryContent('');
          setWordCount(0);
          savedEventNodeIdsRef.current = {
            draftVersion: draftVersionRef.current,
            ids: {},
          };
        }
      }
      setCopySuccess(false);
      setCopyError(false);
    }
    // The target ID identifies when this snapshot should be applied; node refreshes do not reset the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, project.id, initialChapter?.id]);

  const handleClose = (saveCompleted = false) => {
    if (isSavingRef.current && !saveCompleted) return;
    generationSessionRef.current += 1;
    onClose();
  };

  // BƯỚC 1: Gọi AI để phác thảo Chương và các Sự kiện
  const handleGenerateChapterAndEvents = async () => {
    if (isSavingRef.current || isGeneratingRef.current) return;
    const requestSession = generationSessionRef.current;
    const requestDraftVersion = draftVersionRef.current;
    isGeneratingRef.current = true;
    setIsGenerating(true);
    try {
      const res = await api.generateChapterAndEvents({
        projectTitle: project.title,
        userIdea: userIdea.trim(),
        chapters: project.chapters || [],
        nodes: project.nodes || [],
        writingStyle,
      });

      if (
        requestSession !== generationSessionRef.current ||
        requestDraftVersion !== draftVersionRef.current ||
        isSavingRef.current
      ) return;
      if (res.success && res.data) {
        draftVersionRef.current += 1;
        setGeneratedChapter(res.data.chapter);
        setGeneratedEvents(res.data.events || []);
        setStoryContent('');
        setWordCount(0);
        createdChapterIdRef.current = null;
        savedEventNodeIdsRef.current = {
          draftVersion: draftVersionRef.current,
          ids: {},
        };
        setStep(2);
      } else {
        throw new Error(res.message || 'AI không thể tạo cấu trúc chương');
      }
    } catch (err: any) {
      if (requestSession !== generationSessionRef.current) return;
      console.error('Lỗi phác thảo chương:', err);
      const msg = err?.message || 'Không thể tạo chương bằng AI. Hãy kiểm tra kết nối.';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Thông báo', msg);
      }
    } finally {
      if (requestSession === generationSessionRef.current) {
        isGeneratingRef.current = false;
        setIsGenerating(false);
      }
    }
  };

  // BƯỚC 2: Gọi AI để sáng tác toàn bộ câu chuyện hoàn chỉnh cho chương
  const handleGenerateStoryNarrative = async () => {
    if (!generatedChapter || isSavingRef.current || isGeneratingRef.current) return;
    const requestSession = generationSessionRef.current;
    const requestDraftVersion = draftVersionRef.current;
    isGeneratingRef.current = true;
    setIsGenerating(true);

    try {
      // Tìm các node liên quan (nhân vật, tổ chức, địa điểm)
      const relatedNodes = (project.nodes || []).filter((n) => n.type !== 'event').slice(0, 20);

      const res = await api.generateChapterStory({
        projectTitle: project.title,
        chapter: generatedChapter,
        events: generatedEvents,
        relatedNodes,
        writingStyle,
      });

      if (
        requestSession !== generationSessionRef.current ||
        requestDraftVersion !== draftVersionRef.current ||
        isSavingRef.current
      ) return;
      if (res.success && res.data) {
        setStoryContent(res.data.storyContent);
        setWordCount(res.data.wordCount);
        setStep(3);
      } else {
        throw new Error(res.message || 'AI không thể sáng tác câu chuyện');
      }
    } catch (err: any) {
      if (requestSession !== generationSessionRef.current) return;
      console.error('Lỗi sáng tác câu chuyện:', err);
      const msg = err?.message || 'Không thể viết câu chuyện bằng AI. Hãy thử lại.';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Thông báo', msg);
      }
    } finally {
      if (requestSession === generationSessionRef.current) {
        isGeneratingRef.current = false;
        setIsGenerating(false);
      }
    }
  };

  // BƯỚC 3: Lưu toàn bộ Chương, Sự kiện (Nodes), và Nội dung truyện vào Database & Đồ thị
  const handleSaveAllToProject = async () => {
    if (!generatedChapter || isGeneratingRef.current || isSavingRef.current) return;
    const saveDraftVersion = draftVersionRef.current;
    const saveOperation = ++saveOperationRef.current;
    isSavingRef.current = true;
    setIsSaving(true);
    let targetChapterId =
      initialChapter?.id ||
      (createdChapterIdRef.current?.draftVersion === saveDraftVersion
        ? createdChapterIdRef.current.chapterId
        : null);

    try {
      if (!targetChapterId) {
        const createdChapter = await projectStore.createChapter(project.id, {
          chapterNumber: generatedChapter.chapterNumber,
          title: generatedChapter.title,
          desc: generatedChapter.desc,
          content: storyContent,
        });
        if (draftVersionRef.current !== saveDraftVersion) return;
        targetChapterId = createdChapter.id;
        createdChapterIdRef.current = {
          draftVersion: saveDraftVersion,
          chapterId: targetChapterId,
        };
      } else if (targetChapterId) {
        await projectStore.updateChapterStoryContent(project.id, targetChapterId, storyContent);
      }

      if (!initialChapter && generatedEvents.length > 0) {
        if (!targetChapterId) {
          throw new Error('Không xác định được chương để gán sự kiện.');
        }
        await projectStore.ensureChapterSynced(project.id, targetChapterId);
        if (draftVersionRef.current !== saveDraftVersion) return;
        const currentNodes = [...(await projectStore.getProject(project.id)).nodes];

        for (const [eventIndex, ev] of generatedEvents.entries()) {
          if (draftVersionRef.current !== saveDraftVersion) return;
          try {
            if (ev.location && ev.location.trim()) {
              const locTrim = ev.location.trim();
              let locationNode = currentNodes.find(
                (n) => n.type === 'location' && n.name.toLowerCase() === locTrim.toLowerCase()
              );
              if (!locationNode) {
                locationNode = await projectStore.createNode(project.id, {
                  name: locTrim,
                  type: 'location',
                  role: 'ĐỊA DANH',
                  region: 'Miền Đông',
                  desc: `Địa danh diễn ra sự kiện ${ev.name}`,
                  status: 'Hoạt động',
                });
                currentNodes.push(locationNode);
              }
              if (locationNode.syncStatus === 'pending') {
                const syncedLocation = await projectStore.ensureNodeSynced(
                  project.id,
                  locationNode.id
                );
                const locationIndex = currentNodes.findIndex(
                  (node) => node.id === syncedLocation.id
                );
                if (locationIndex !== -1) currentNodes[locationIndex] = syncedLocation;
              }
            }

            const participants = parseEventParticipants(ev.charactersInvolved);
            const charactersToEnsure = [
              ...new Set([
                ...participants,
                ...(ev.characterStatusChanges || []).map((change) => change.characterName),
              ]),
            ];
            for (const charName of charactersToEnsure) {
              let existingChar = currentNodes.find(
                (node) =>
                  node.type === 'character' &&
                  node.name.toLocaleLowerCase() === charName.toLocaleLowerCase()
              );
              if (!existingChar) {
                existingChar = await projectStore.createNode(project.id, {
                  name: charName,
                  type: 'character',
                  role: 'TRUNG LẬP',
                  gender: 'Nam',
                  desc: `Nhân vật tham gia sự kiện ${ev.name}`,
                  status: 'Còn sống',
                });
                currentNodes.push(existingChar);
              }
              if (existingChar.syncStatus === 'pending') {
                const syncedCharacter = await projectStore.ensureNodeSynced(
                  project.id,
                  existingChar.id
                );
                const characterIndex = currentNodes.findIndex(
                  (node) => node.id === syncedCharacter.id
                );
                if (characterIndex !== -1) currentNodes[characterIndex] = syncedCharacter;
              }
            }

            let eventNode: StoryNode | undefined;
            if (savedEventNodeIdsRef.current.draftVersion !== saveDraftVersion) {
              savedEventNodeIdsRef.current = {
                draftVersion: saveDraftVersion,
                ids: {},
              };
            }
            const eventPayload: Partial<StoryNode> = {
              name: ev.name,
              type: 'event',
              desc: ev.desc,
              chapter: generatedChapter.title,
              location: ev.location || '',
              time: ev.time || '',
              timelineType: ev.timelineType || 'Hiện tại',
              duration: ev.duration || '',
              eventType: ev.eventType || '',
              importance: ev.importance || '',
              arcName: ev.arcName || '',
              sequenceOrder: ev.sequenceOrder || String(eventIndex + 1),
              cause: ev.cause || '',
              conflict: ev.conflict || '',
              outcome: ev.outcome || '',
              consequences: ev.consequences || '',
              characterRoles: ev.characterRoles || '',
              itemsInvolved: JSON.stringify(ev.itemsInvolved || []),
              factionsInvolved: JSON.stringify(ev.factionsInvolved || []),
              impact: ev.impact || '',
              role: 'BIẾN CỐ',
              status: 'Đã diễn ra',
              charactersInvolved: JSON.stringify(participants),
            };
            const savedNodeId = savedEventNodeIdsRef.current.ids[eventIndex];
            if (savedNodeId) {
              eventNode = currentNodes.find((node) => node.id === savedNodeId);
              if (!eventNode) {
                throw new Error('Không tìm thấy node sự kiện đã tạo ở lần lưu trước.');
              }
              eventNode = await projectStore.updateNode(
                project.id,
                eventNode.id,
                eventPayload
              );
              const existingIdx = currentNodes.findIndex((node) => node.id === eventNode!.id);
              if (existingIdx !== -1) currentNodes[existingIdx] = eventNode;
            } else {
              eventNode = await projectStore.createNode(project.id, eventPayload);
              currentNodes.push(eventNode);
              if (draftVersionRef.current !== saveDraftVersion) return;
              savedEventNodeIdsRef.current.ids[eventIndex] = eventNode.id;
            }

            eventNode = await projectStore.ensureNodeSynced(project.id, eventNode.id);
            if (draftVersionRef.current !== saveDraftVersion) return;
            await projectStore.assignEventToChapter(project.id, targetChapterId, eventNode);
            for (const change of ev.characterStatusChanges || []) {
              const character = currentNodes.find(
                (node) =>
                  node.type === 'character' &&
                  node.name.toLocaleLowerCase() === change.characterName.toLocaleLowerCase()
              );
              if (!character) {
                throw new Error(`Không tìm thấy nhân vật "${change.characterName}"`);
              }
              const updatedCharacter = await projectStore.updateNode(
                project.id,
                character.id,
                {
                  status: change.status,
                  statusEvent: eventNode.id,
                },
                { requireBackend: true }
              );
              const characterIndex = currentNodes.findIndex(
                (node) => node.id === updatedCharacter.id
              );
              if (characterIndex !== -1) currentNodes[characterIndex] = updatedCharacter;
            }
          } catch (nodeErr) {
            const detail = nodeErr instanceof Error ? nodeErr.message : String(nodeErr);
            throw new Error(`Không thể lưu sự kiện "${ev.name}": ${detail}`);
          }
        }
      }

      if (draftVersionRef.current !== saveDraftVersion) return;
      await onSuccess();
      if (draftVersionRef.current !== saveDraftVersion) return;
      createdChapterIdRef.current = null;
      savedEventNodeIdsRef.current = {
        draftVersion: saveDraftVersion,
        ids: {},
      };
      if (Platform.OS === 'web') {
        window.alert('Đã lưu thành công chương và các sự kiện vào dự án!');
      } else {
        Alert.alert('Thành công', 'Đã lưu chương và các sự kiện vào dự án!');
      }
      handleClose(true);
    } catch (saveErr: any) {
      if (draftVersionRef.current !== saveDraftVersion) return;
      console.error('Lỗi lưu câu chuyện:', saveErr);
      const errorDetail = saveErr?.message || 'Không thể lưu vào dự án';
      const msg = targetChapterId && !initialChapter
        ? `Chương đã được lưu (mã ${targetChapterId}) nhưng chưa lưu hoàn tất sự kiện. Nội dung xem trước vẫn được giữ; nhấn Lưu lại để tiếp tục mà không tạo chương trùng.\n\n${errorDetail}`
        : errorDetail;
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Lỗi', msg);
      }
    } finally {
      if (saveOperationRef.current === saveOperation) {
        isSavingRef.current = false;
        setIsSaving(false);
      }
    }
  };

  const handleCopyStory = async () => {
    try {
      await Clipboard.setStringAsync(storyContent);
      setCopySuccess(true);
      setCopyError(false);
      setTimeout(() => setCopySuccess(false), 3000);
    } catch {
      setCopySuccess(false);
      setCopyError(true);
      setTimeout(() => setCopyError(false), 3000);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => handleClose()}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
        style={styles.modalOverlay}>
        <View style={styles.modalCardLarge}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.headerTitleBox}>
              <Text style={styles.headerIcon}>✨</Text>
              <View style={styles.headerTextBox}>
                <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
                  AI Sáng Tác Câu Chuyện
                </Text>
                <Text style={styles.headerSubtitle} numberOfLines={1} ellipsizeMode="tail">
                  Tạo Chương · Thiết Lập Sự Kiện · Viết Toàn Văn
                </Text>
              </View>
            </View>
            <Pressable
              hitSlop={12}
              onPress={() => handleClose()}
              disabled={isSaving}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Đóng bảng AI sáng tác câu chuyện">
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {/* Stepper Tabs */}
          <View style={styles.stepperRow}>
            <Pressable
              style={[styles.stepItem, step === 1 && styles.stepItemActive]}
              onPress={() =>
                !initialChapter && !isSaving && !isGenerating && setStep(1)
              }
              disabled={Boolean(initialChapter) || isSaving || isGenerating}>
              <Text style={[styles.stepNumber, step === 1 && styles.stepNumberActive]}>1</Text>
              <Text style={[styles.stepLabel, step === 1 && styles.stepLabelActive]}>
                Ý tưởng & Chương
              </Text>
            </Pressable>
            <View style={styles.stepLine} />
            <Pressable
              style={[styles.stepItem, step === 2 && styles.stepItemActive]}
              onPress={() =>
                generatedChapter && !isSaving && !isGenerating && setStep(2)
              }
              disabled={isSaving || isGenerating}>
              <Text style={[styles.stepNumber, step === 2 && styles.stepNumberActive]}>2</Text>
              <Text style={[styles.stepLabel, step === 2 && styles.stepLabelActive]}>
                Sự kiện ({generatedEvents.length})
              </Text>
            </Pressable>
            <View style={styles.stepLine} />
            <Pressable
              style={[styles.stepItem, step === 3 && styles.stepItemActive]}
              onPress={() =>
                storyContent && !isSaving && !isGenerating && setStep(3)
              }
              disabled={isSaving || isGenerating}>
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
            keyboardShouldPersistTaps="handled"
            pointerEvents={isGenerating || isSaving ? 'none' : 'auto'}>
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
                          disabled={isGenerating || isSaving}
                          style={[
                            styles.styleChip,
                            isSel && styles.styleChipSelected,
                            (isGenerating || isSaving) && { opacity: 0.55 },
                          ]}
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
                    style={[
                      styles.ideaTextInput,
                      (isGenerating || isSaving) && { opacity: 0.55 },
                    ]}
                    placeholder="Ví dụ: nhân vật chính phát hiện một bằng chứng mới và phải quyết định có công bố hay không..."
                    placeholderTextColor="#685f50"
                    multiline
                    editable={!isGenerating && !isSaving}
                    value={userIdea}
                    onChangeText={setUserIdea}
                    textAlignVertical="top"
                  />
                  <Text style={styles.inputHint}>
                    💡 Bạn có thể để trống, AI sẽ tự động phân tích các chương và nhân vật hiện có để phát triển tiếp chương tiếp theo một cách hợp lý.
                  </Text>
                </View>

                <Pressable
                  style={[
                    styles.primaryActionBtn,
                    (isGenerating || isSaving) && { opacity: 0.55 },
                  ]}
                  onPress={handleGenerateChapterAndEvents}
                  disabled={isGenerating || isSaving}>
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
                  </View>

                  {generatedEvents.map((ev, idx) => (
                    <View key={idx} style={styles.eventItemCard}>
                      <View style={styles.eventItemIndex}>
                        <Text style={styles.eventIndexText}>{ev.sequenceOrder || idx + 1}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 4 }}>
                        <View style={styles.eventHeaderRow}>
                          <Text style={[styles.eventItemName, { flex: 1 }]}>{ev.name}</Text>
                          {!initialChapter && (
                            <Pressable
                              style={[
                                styles.eventEditBtn,
                                (isGenerating || isSaving) && { opacity: 0.5 },
                              ]}
                              disabled={isGenerating || isSaving}
                              onPress={() => handleOpenEventEdit(idx)}>
                              <Text style={styles.eventEditBtnText}>✏️ Sửa</Text>
                            </Pressable>
                          )}
                        </View>
                        <Text style={styles.eventItemDesc}>{ev.desc}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Nút hành động */}
                <View style={styles.actionButtonGroup}>
                  {!initialChapter && (
                    <Pressable
                      style={[
                        styles.secondaryBtn,
                        (isGenerating || isSaving) && { opacity: 0.5 },
                      ]}
                      onPress={() => setStep(1)}
                      disabled={isGenerating || isSaving}>
                      <Text style={styles.secondaryBtnText}>← Chỉnh sửa ý tưởng</Text>
                    </Pressable>
                  )}

                  <Pressable
                    style={[
                      styles.primaryActionBtn,
                      (isGenerating || isSaving) && { opacity: 0.5 },
                    ]}
                    onPress={handleGenerateStoryNarrative}
                    disabled={isGenerating || isSaving}>
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
                    style={[
                      styles.copyBtn,
                      copySuccess && styles.copyBtnSuccess,
                      copyError && styles.copyBtnError,
                    ]}
                    onPress={handleCopyStory}>
                    <Text style={styles.copyBtnText}>
                      {copySuccess
                        ? '✓ Đã sao chép'
                        : copyError
                          ? 'Không thể sao chép'
                          : '📋 Sao chép'}
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
                    style={[
                      styles.saveAllBtn,
                      (isSaving || isGenerating) && { opacity: 0.6 },
                    ]}
                    onPress={handleSaveAllToProject}
                    disabled={isSaving || isGenerating}>
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

          {/* Overlay chỉnh sửa metadata sự kiện (chỉ cho sửa các trường không ảnh hưởng cốt truyện) */}
          {editingEventIndex !== null && editingEventDraft && (
            <View style={styles.editOverlay}>
              <View style={styles.editCard}>
                <View style={styles.editHeader}>
                  <Text style={styles.editTitle}>Chỉnh sửa thông tin sự kiện</Text>
                  <Pressable
                    onPress={() => {
                      setEditingEventIndex(null);
                      setEditingEventDraft(null);
                    }}
                    style={styles.closeBtn}>
                    <Text style={styles.closeBtnText}>✕</Text>
                  </Pressable>
                </View>

                <Text style={styles.editHint}>
                  Chỉ chỉnh sửa các thông tin phân loại & thời gian để không làm lệch cốt truyện và thực thể đã phác thảo.
                </Text>

                <ScrollView
                  style={{ maxHeight: SCREEN_HEIGHT * 0.52 }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled">
                  <Text style={styles.editFieldLabel}>Tên sự kiện *</Text>
                  <TextInput
                    style={styles.editInput}
                    value={editingEventDraft.name}
                    onChangeText={(v) =>
                      setEditingEventDraft({ ...editingEventDraft, name: v })
                    }
                    placeholder="Tên sự kiện..."
                    placeholderTextColor="#685f50"
                  />

                  <Text style={styles.editFieldLabel}>Phân loại sự kiện</Text>
                  <FormSelectField
                    value={editingEventDraft.eventType}
                    onChange={(v) =>
                      setEditingEventDraft({ ...editingEventDraft, eventType: v })
                    }
                    options={EVENT_TYPE_OPTIONS}
                    allowCustom
                    placeholder="-- Chọn loại sự kiện --"
                  />

                  <Text style={styles.editFieldLabel}>Mức độ quan trọng</Text>
                  <FormSelectField
                    value={editingEventDraft.importance}
                    onChange={(v) =>
                      setEditingEventDraft({ ...editingEventDraft, importance: v })
                    }
                    options={EVENT_IMPORTANCE_OPTIONS}
                    placeholder="-- Chọn mức độ --"
                  />

                  <View style={styles.editRow}>
                    <View style={{ flex: 2 }}>
                      <Text style={styles.editFieldLabel}>Cung truyện (Arc)</Text>
                      <TextInput
                        style={styles.editInput}
                        value={editingEventDraft.arcName}
                        onChangeText={(v) =>
                          setEditingEventDraft({ ...editingEventDraft, arcName: v })
                        }
                        placeholder="VD: Arc Học viện..."
                        placeholderTextColor="#685f50"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.editFieldLabel}>Thứ tự</Text>
                      <TextInput
                        style={styles.editInput}
                        value={editingEventDraft.sequenceOrder}
                        onChangeText={(v) =>
                          setEditingEventDraft({ ...editingEventDraft, sequenceOrder: v })
                        }
                        placeholder="1, 2..."
                        placeholderTextColor="#685f50"
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  <View style={styles.editRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.editFieldLabel}>Thời điểm</Text>
                      <TextInput
                        style={styles.editInput}
                        value={editingEventDraft.time}
                        onChangeText={(v) =>
                          setEditingEventDraft({ ...editingEventDraft, time: v })
                        }
                        placeholder="VD: Đêm khuya"
                        placeholderTextColor="#685f50"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.editFieldLabel}>Thời lượng</Text>
                      <TextInput
                        style={styles.editInput}
                        value={editingEventDraft.duration}
                        onChangeText={(v) =>
                          setEditingEventDraft({ ...editingEventDraft, duration: v })
                        }
                        placeholder="VD: 30 phút"
                        placeholderTextColor="#685f50"
                      />
                    </View>
                  </View>

                  <Text style={styles.editFieldLabel}>Dòng thời gian</Text>
                  <FormSelectField
                    value={editingEventDraft.timelineType}
                    onChange={(v) =>
                      setEditingEventDraft({ ...editingEventDraft, timelineType: v })
                    }
                    options={EVENT_TIMELINE_OPTIONS}
                    placeholder="Hiện tại"
                  />

                  <Text style={styles.editFieldLabel}>Vai trò nhân vật (ghi chú)</Text>
                  <TextInput
                    style={styles.editInput}
                    value={editingEventDraft.characterRoles}
                    onChangeText={(v) =>
                      setEditingEventDraft({ ...editingEventDraft, characterRoles: v })
                    }
                    placeholder="VD: A: Chủ động; B: Hỗ trợ"
                    placeholderTextColor="#685f50"
                  />
                </ScrollView>

                <View style={styles.editActions}>
                  <Pressable
                    style={[styles.secondaryBtn, { flex: 1 }]}
                    onPress={() => {
                      setEditingEventIndex(null);
                      setEditingEventDraft(null);
                    }}>
                    <Text style={styles.secondaryBtnText}>Hủy</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.primaryActionBtn, { flex: 1 }]}
                    onPress={handleSaveEventEdit}>
                    <Text style={styles.primaryActionBtnText}>Lưu chỉnh sửa</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
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
    flex: 1,
    minWidth: 0,
  },
  headerTextBox: {
    flex: 1,
    minWidth: 0,
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
    width: 36,
    height: 36,
    borderRadius: 16,
    backgroundColor: 'rgba(229,169,60,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginLeft: 8,
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
  copyBtnError: {
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderColor: '#f87171',
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
  eventHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  eventEditBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(229, 169, 60, 0.4)',
    backgroundColor: 'rgba(229, 169, 60, 0.12)',
  },
  eventEditBtnText: {
    color: '#e5a93c',
    fontSize: 12,
    fontFamily: AppFonts.sans,
    fontWeight: '600',
  },
  editOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 50,
  },
  editCard: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: '#1a1712',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3f3627',
    padding: 18,
  },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  editTitle: {
    color: '#f5eee6',
    fontSize: 17,
    fontFamily: AppFonts.serif,
    fontWeight: '700',
  },
  editHint: {
    color: '#9a9080',
    fontSize: 12,
    fontFamily: AppFonts.sans,
    lineHeight: 17,
    marginBottom: 12,
  },
  editFieldLabel: {
    color: '#c8b48c',
    fontSize: 12,
    fontFamily: AppFonts.sans,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 5,
  },
  editInput: {
    backgroundColor: '#12100d',
    borderWidth: 1,
    borderColor: '#383226',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#f5eee6',
    fontSize: 13.5,
    fontFamily: AppFonts.sans,
  },
  editRow: {
    flexDirection: 'row',
    gap: 10,
  },
  editActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
});

