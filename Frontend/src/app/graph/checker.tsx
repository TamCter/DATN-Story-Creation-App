import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
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

import { GraphSidebar } from '@/components/graph/GraphSidebar';
import {
  getProjectChapters,
  INITIAL_PROJECTS,
  StoryNode,
  StoryProject,
} from '@/constants/story-data';
import { AppFonts } from '@/constants/theme';
import { api } from '@/services/api';
import { projectStore } from '@/services/project-store';

type EntityType = 'character' | 'item' | 'location' | 'faction';

interface EditableIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  category: string;
  title: string;
  quote: string;
  explanation: string;
  suggestion: string;
  relatedEntities: string[];
  resolved: boolean;
}

interface EditableSuggestedNode {
  localId: string;
  selected: boolean;
  type: EntityType;
  name: string;
  role: string;
  desc: string;
  status: string;
  gender: string;
  dob: string;
  birthplace: string;
  weapon: string;
  sect: string;
  personality: string;
  rarity: string;
  origin: string;
  element: string;
  holderOrLocation: string;
  region: string;
  climate: string;
  terrain: string;
  dangerLevel: string;
  ruler: string;
  subType: string;
  alignment: string;
  leader: string;
  headquarters: string;
  motto: string;
}

interface EditableSuggestedEvent {
  localId: string;
  selected: boolean;
  name: string;
  desc: string;
  location: string;
  time: string;
  impact: string;
  charactersText: string;
}

interface EditableStatusChange {
  localId: string;
  selected: boolean;
  characterName: string;
  status: 'Đã chết' | 'Hồi sinh';
  statusEvent: string;
  reason: string;
}

const ENTITY_TYPE_META: Record<EntityType, { label: string; icon: string; color: string }> = {
  character: { label: 'Nhân vật', icon: '👤', color: '#e5a93c' },
  item: { label: 'Vật phẩm', icon: '⚔️', color: '#c48f65' },
  location: { label: 'Địa điểm', icon: '📍', color: '#6ba892' },
  faction: { label: 'Tổ chức', icon: '🏛️', color: '#9f87d4' },
};

const SEVERITY_META = {
  error: {
    label: 'LỖI NGHIÊM TRỌNG',
    icon: '⛔',
    bg: '#2b1614',
    border: '#7a2f28',
    badgeBg: '#5e211b',
    text: '#f5b0a8',
  },
  warning: {
    label: 'CẢNH BÁO',
    icon: '⚠️',
    bg: '#292113',
    border: '#755622',
    badgeBg: '#573e16',
    text: '#f3d28e',
  },
  info: {
    label: 'GỢI Ý',
    icon: '💡',
    bg: '#162129',
    border: '#2d516b',
    badgeBg: '#1e3a4f',
    text: '#9fd0f2',
  },
} as const;

function createEmptySuggestedNode(type: EntityType = 'character'): EditableSuggestedNode {
  return {
    localId: `snode-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    selected: true,
    type,
    name: '',
    role: '',
    desc: '',
    status:
      type === 'character'
        ? 'Còn sống'
        : type === 'item'
          ? 'Nguyên vẹn'
          : type === 'faction'
            ? 'Đang hoạt động'
            : 'Hoạt động',
    gender: '',
    dob: '',
    birthplace: '',
    weapon: '',
    sect: '',
    personality: '',
    rarity: '',
    origin: '',
    element: '',
    holderOrLocation: '',
    region: '',
    climate: '',
    terrain: '',
    dangerLevel: '',
    ruler: '',
    subType: '',
    alignment: '',
    leader: '',
    headquarters: '',
    motto: '',
  };
}

function createEmptySuggestedEvent(): EditableSuggestedEvent {
  return {
    localId: `sevent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    selected: true,
    name: '',
    desc: '',
    location: '',
    time: '',
    impact: '',
    charactersText: '',
  };
}

export default function TextCheckerScreen() {
  const params = useLocalSearchParams<{ projectId?: string }>();
  const projectId = params.projectId || INITIAL_PROJECTS[0].id;

  const [currentProject, setCurrentProject] = useState<StoryProject>(
    INITIAL_PROJECTS.find((p) => p.id === projectId) || INITIAL_PROJECTS[0]
  );
  const [sidebarVisible, setSidebarVisible] = useState(false);

  // Form nhập chương do tác giả tự viết
  const [chapterNumberInput, setChapterNumberInput] = useState('1');
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterText, setChapterText] = useState('');

  // Kết quả phân tích từ AI (có thể chỉnh sửa trước khi lưu)
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [chapterSummary, setChapterSummary] = useState('');
  const [issues, setIssues] = useState<EditableIssue[]>([]);
  const [suggestedNodes, setSuggestedNodes] = useState<EditableSuggestedNode[]>([]);
  const [suggestedEvents, setSuggestedEvents] = useState<EditableSuggestedEvent[]>([]);
  const [statusChanges, setStatusChanges] = useState<EditableStatusChange[]>([]);
  const [activeResultTab, setActiveResultTab] = useState<'issues' | 'nodes' | 'events'>('issues');

  // Modal chỉnh sửa node / event đề xuất
  const [editingNode, setEditingNode] = useState<EditableSuggestedNode | null>(null);
  const [isAddingNewNode, setIsAddingNewNode] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EditableSuggestedEvent | null>(null);
  const [isAddingNewEvent, setIsAddingNewEvent] = useState(false);

  // Lưu vào database
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessInfo, setSaveSuccessInfo] = useState<{
    chapterTitle: string;
    nodesCount: number;
    eventsCount: number;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadProject() {
      try {
        const proj = await projectStore.getProject(projectId);
        if (!isMounted) return;
        setCurrentProject(proj);
        const existingChapters = getProjectChapters(proj);
        const nextNum =
          existingChapters.length > 0
            ? Math.max(...existingChapters.map((c) => Number(c.chapterNumber) || 0)) + 1
            : 1;
        setChapterNumberInput(String(nextNum));
      } catch (err) {
        console.warn('[TextChecker] Lỗi tải dự án:', err);
      }
    }
    void loadProject();
    return () => {
      isMounted = false;
    };
  }, [projectId]);

  const wordCount = useMemo(() => {
    const trimmed = chapterText.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }, [chapterText]);

  const unresolvedErrorCount = useMemo(
    () => issues.filter((i) => i.severity === 'error' && !i.resolved).length,
    [issues]
  );
  const unresolvedWarningCount = useMemo(
    () => issues.filter((i) => i.severity === 'warning' && !i.resolved).length,
    [issues]
  );
  const selectedNodesCount = useMemo(
    () => suggestedNodes.filter((n) => n.selected && n.name.trim()).length,
    [suggestedNodes]
  );
  const selectedEventsCount = useMemo(
    () => suggestedEvents.filter((e) => e.selected && e.name.trim()).length,
    [suggestedEvents]
  );
  const selectedStatusCount = useMemo(
    () => statusChanges.filter((s) => s.selected).length,
    [statusChanges]
  );

  const showNotice = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleAnalyze = async () => {
    const trimmedText = chapterText.trim();
    if (trimmedText.length < 20) {
      showNotice(
        'Nội dung quá ngắn',
        'Vui lòng nhập hoặc dán nội dung chương (tối thiểu 20 ký tự) để AI kiểm tra.'
      );
      return;
    }

    setIsAnalyzing(true);
    setSaveSuccessInfo(null);
    try {
      const latestProject = await projectStore.getProject(projectId);
      setCurrentProject(latestProject);
      const parsedNum = Number.parseInt(chapterNumberInput, 10);
      const existingChapters = getProjectChapters(latestProject);

      const res = await api.analyzeChapterText({
        projectTitle: latestProject.title,
        chapterNumber: Number.isFinite(parsedNum) && parsedNum > 0 ? parsedNum : undefined,
        chapterTitle: chapterTitle.trim(),
        chapterText: trimmedText,
        nodes: latestProject.nodes || [],
        links: latestProject.links || [],
        chapters: existingChapters.map((c) => ({
          chapterNumber: c.chapterNumber,
          title: c.title,
          desc: c.desc,
        })),
      });

      if (!res.success || !res.data) {
        throw new Error(res.message || 'Không thể phân tích văn bản chương.');
      }

      const data = res.data;
      setChapterSummary(data.summary || '');
      if (!chapterTitle.trim()) {
        setChapterTitle(`Chương ${data.chapterNumber}`);
      }

      const mappedIssues: EditableIssue[] = (data.issues || []).map((item) => ({
        ...item,
        resolved: false,
      }));
      setIssues(mappedIssues);

      const mappedNodes: EditableSuggestedNode[] = (data.suggestedNodes || []).map((n, idx) => ({
        ...createEmptySuggestedNode(n.type),
        localId: `snode-${Date.now()}-${idx}`,
        selected: true,
        type: n.type,
        name: n.name || '',
        role: n.role || '',
        desc: n.desc || '',
        status: n.status || createEmptySuggestedNode(n.type).status,
        gender: n.gender || '',
        dob: n.dob || '',
        birthplace: n.birthplace || '',
        weapon: n.weapon || '',
        sect: n.sect || '',
        personality: n.personality || '',
        rarity: n.rarity || '',
        origin: n.origin || '',
        element: n.element || '',
        holderOrLocation: n.holderOrLocation || '',
        region: n.region || '',
        climate: n.climate || '',
        terrain: n.terrain || '',
        dangerLevel: n.dangerLevel || '',
        ruler: n.ruler || '',
        subType: n.subType || '',
        alignment: n.alignment || '',
        leader: n.leader || '',
        headquarters: n.headquarters || '',
        motto: n.motto || '',
      }));
      setSuggestedNodes(mappedNodes);

      const mappedEvents: EditableSuggestedEvent[] = (data.suggestedEvents || []).map((ev, idx) => ({
        localId: `sevent-${Date.now()}-${idx}`,
        selected: true,
        name: ev.name || '',
        desc: ev.desc || '',
        location: ev.location || '',
        time: ev.time || '',
        impact: ev.impact || '',
        charactersText: Array.isArray(ev.charactersInvolved)
          ? ev.charactersInvolved.join(', ')
          : '',
      }));
      setSuggestedEvents(mappedEvents);

      const mappedStatusChanges: EditableStatusChange[] = (data.characterStatusChanges || []).map(
        (sc, idx) => ({
          localId: `sstatus-${Date.now()}-${idx}`,
          selected: true,
          characterName: sc.characterName,
          status: sc.status,
          statusEvent: sc.statusEvent || '',
          reason: sc.reason || '',
        })
      );
      setStatusChanges(mappedStatusChanges);
      setHasAnalyzed(true);

      if (mappedIssues.length > 0) {
        setActiveResultTab('issues');
      } else if (mappedNodes.length > 0) {
        setActiveResultTab('nodes');
      } else {
        setActiveResultTab('events');
      }
    } catch (err: any) {
      showNotice(
        'Phân tích thất bại',
        err?.message || 'Không thể kết nối AI để kiểm tra văn bản. Vui lòng thử lại.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const executeSaveToDatabase = async () => {
    const trimmedText = chapterText.trim();
    if (!trimmedText) {
      showNotice('Thiếu nội dung', 'Vui lòng nhập nội dung chương trước khi lưu.');
      return;
    }

    const parsedNum = Number.parseInt(chapterNumberInput, 10);
    const existingChapters = getProjectChapters(currentProject);
    const finalChapterNum =
      Number.isFinite(parsedNum) && parsedNum > 0
        ? parsedNum
        : existingChapters.length > 0
          ? Math.max(...existingChapters.map((c) => Number(c.chapterNumber) || 0)) + 1
          : 1;
    const finalTitle = chapterTitle.trim() || `Chương ${finalChapterNum}`;

    setIsSaving(true);
    try {
      const initialProject = await projectStore.getProject(projectId);
      const initialNodeIds = new Set((initialProject.nodes || []).map((n) => n.id));

      // 1. Tạo chương mới kèm toàn bộ nội dung văn bản do người dùng viết
      const savedChapter = await projectStore.createChapter(projectId, {
        chapterNumber: finalChapterNum,
        title: finalTitle,
        desc:
          chapterSummary.trim() ||
          `Nội dung chương ${finalChapterNum} (${wordCount} từ).`,
        content: trimmedText,
      });

      // 2. Tạo các node thực thể được người dùng chọn (làm giàu stub nếu mới sinh trong batch, không ghi đè node cũ)
      const nodesToSave = suggestedNodes.filter((n) => n.selected && n.name.trim());
      let savedNodesCount = 0;
      for (const item of nodesToSave) {
        const latestProj = await projectStore.getProject(projectId);
        const normalizedName = item.name.trim();
        const stubMatch = (latestProj.nodes || []).find(
          (n) =>
            n.type === item.type &&
            n.name.trim().toLocaleLowerCase('vi') === normalizedName.toLocaleLowerCase('vi') &&
            (n.autoCreatedStub === true || !initialNodeIds.has(n.id))
        );

        const payload: Partial<StoryNode> = {
          type: item.type,
          name: normalizedName,
          role: item.role.trim(),
          desc: item.desc.trim(),
          status: item.status.trim(),
          gender: item.gender.trim(),
          dob: item.dob.trim(),
          birthplace: item.birthplace.trim(),
          weapon: item.weapon.trim(),
          sect: item.sect.trim(),
          personality: item.personality.trim(),
          rarity: item.rarity.trim(),
          origin: item.origin.trim(),
          element: item.element.trim(),
          holderOrLocation: item.holderOrLocation.trim(),
          region: item.region.trim(),
          climate: item.climate.trim(),
          terrain: item.terrain.trim(),
          dangerLevel: item.dangerLevel.trim(),
          ruler: item.ruler.trim(),
          subType: item.subType.trim(),
          alignment: item.alignment.trim(),
          leader: item.leader.trim(),
          headquarters: item.headquarters.trim(),
          motto: item.motto.trim(),
          autoCreatedStub: false,
        };

        if (stubMatch) {
          await projectStore.updateNode(projectId, stubMatch.id, payload);
        } else {
          await projectStore.createNode(projectId, payload);
        }
        savedNodesCount += 1;
      }

      // 3. Tạo các node sự kiện của chương và gán trực tiếp vào chương mới
      const eventsToSave = suggestedEvents.filter((e) => e.selected && e.name.trim());
      let savedEventsCount = 0;
      for (const ev of eventsToSave) {
        const participantNames = ev.charactersText
          .split(/[,;\n]+/)
          .map((s) => s.trim())
          .filter(Boolean);

        const createdEventNode = await projectStore.createNode(projectId, {
          type: 'event',
          name: ev.name.trim(),
          role: 'SỰ KIỆN',
          desc: ev.desc.trim() || `Sự kiện trong ${finalTitle}`,
          status: 'Đã diễn ra',
          chapter: savedChapter.id,
          location: ev.location.trim(),
          time: ev.time.trim(),
          impact: ev.impact.trim(),
          charactersInvolved: JSON.stringify(participantNames),
          autoCreatedStub: false,
        });

        await projectStore.assignEventToChapter(projectId, savedChapter.id, createdEventNode);
        savedEventsCount += 1;
      }

      // 4. Áp dụng các thay đổi trạng thái nhân vật được chọn (Đã chết / Hồi sinh)
      const activeStatusChanges = statusChanges.filter((s) => s.selected);
      if (activeStatusChanges.length > 0) {
        const latestProj = await projectStore.getProject(projectId);
        for (const sc of activeStatusChanges) {
          const targetChar = (latestProj.nodes || []).find(
            (n) =>
              n.type === 'character' &&
              n.name.trim().toLocaleLowerCase('vi') ===
                sc.characterName.trim().toLocaleLowerCase('vi')
          );
          if (targetChar) {
            await projectStore.updateNode(projectId, targetChar.id, {
              status: sc.status,
              statusEvent: sc.statusEvent || targetChar.statusEvent || '',
            });
          }
        }
      }

      const refreshedProject = await projectStore.getProject(projectId);
      setCurrentProject(refreshedProject);
      const updatedChapters = getProjectChapters(refreshedProject);
      const nextNum =
        updatedChapters.length > 0
          ? Math.max(...updatedChapters.map((c) => Number(c.chapterNumber) || 0)) + 1
          : finalChapterNum + 1;
      setChapterNumberInput(String(nextNum));

      setSaveSuccessInfo({
        chapterTitle: finalTitle,
        nodesCount: savedNodesCount,
        eventsCount: savedEventsCount,
      });
    } catch (err: any) {
      showNotice(
        'Lưu chưa hoàn tất',
        err?.message || 'Đã xảy ra lỗi khi lưu chương và các node vào cơ sở dữ liệu.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePress = () => {
    if (unresolvedErrorCount > 0) {
      const warningMsg = `Vẫn còn ${unresolvedErrorCount} lỗi logic nghiêm trọng chưa đánh dấu xử lý. Bạn có muốn tiếp tục lưu đồ thị và chương mới không?`;
      if (Platform.OS === 'web') {
        if (window.confirm(warningMsg)) {
          void executeSaveToDatabase();
        }
      } else {
        Alert.alert('Vẫn còn lỗi nghiêm trọng', warningMsg, [
          { text: 'Quay lại sửa', style: 'cancel' },
          { text: 'Vẫn lưu', style: 'destructive', onPress: () => void executeSaveToDatabase() },
        ]);
      }
      return;
    }
    void executeSaveToDatabase();
  };

  const handleCommitNodeEdit = () => {
    if (!editingNode) return;
    if (!editingNode.name.trim()) {
      showNotice('Thiếu tên thực thể', 'Vui lòng nhập tên cho node đề xuất.');
      return;
    }
    if (isAddingNewNode) {
      setSuggestedNodes((prev) => [...prev, editingNode]);
    } else {
      setSuggestedNodes((prev) =>
        prev.map((n) => (n.localId === editingNode.localId ? editingNode : n))
      );
    }
    setEditingNode(null);
    setIsAddingNewNode(false);
  };

  const handleCommitEventEdit = () => {
    if (!editingEvent) return;
    if (!editingEvent.name.trim()) {
      showNotice('Thiếu tên sự kiện', 'Vui lòng nhập tên sự kiện.');
      return;
    }
    if (isAddingNewEvent) {
      setSuggestedEvents((prev) => [...prev, editingEvent]);
    } else {
      setSuggestedEvents((prev) =>
        prev.map((ev) => (ev.localId === editingEvent.localId ? editingEvent : ev))
      );
    }
    setEditingEvent(null);
    setIsAddingNewEvent(false);
  };

  const handleResetWorkspace = () => {
    setChapterTitle('');
    setChapterText('');
    setChapterSummary('');
    setIssues([]);
    setSuggestedNodes([]);
    setSuggestedEvents([]);
    setStatusChanges([]);
    setHasAnalyzed(false);
    setSaveSuccessInfo(null);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.headerBar}>
        <View style={styles.headerLeftGroup}>
          <Pressable
            hitSlop={12}
            style={({ pressed }) => [styles.menuBtn, pressed && styles.menuBtnPressed]}
            onPress={() => setSidebarVisible(true)}>
            <Text style={styles.menuBtnIcon}>☰</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Kiểm tra văn bản</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {currentProject.title} · {currentProject.nodes.length} NODE ·{' '}
              {getProjectChapters(currentProject).length} CHƯƠNG
            </Text>
          </View>
        </View>

        {hasAnalyzed && (
          <Pressable style={styles.resetHeaderBtn} onPress={handleResetWorkspace}>
            <Text style={styles.resetHeaderBtnText}>Viết mới</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {/* Banner lưu thành công */}
        {saveSuccessInfo && (
          <View style={styles.successBanner}>
            <Text style={styles.successBannerTitle}>
              ✅ Đã lưu thành công "{saveSuccessInfo.chapterTitle}"
            </Text>
            <Text style={styles.successBannerDesc}>
              Đã tạo {saveSuccessInfo.nodesCount} node mới, {saveSuccessInfo.eventsCount} sự kiện
              được gán vào Chi tiết chương và lưu toàn văn vào cơ sở dữ liệu.
            </Text>
            <View style={styles.successActionsRow}>
              <Pressable
                style={styles.successActionBtn}
                onPress={() =>
                  router.replace({ pathname: '/graph', params: { projectId: currentProject.id } })
                }>
                <Text style={styles.successActionBtnText}>☍ Xem bản đồ node</Text>
              </Pressable>
              <Pressable
                style={styles.successActionBtn}
                onPress={() =>
                  router.replace({
                    pathname: '/graph/events',
                    params: { projectId: currentProject.id },
                  })
                }>
                <Text style={styles.successActionBtnText}>📖 Xem chi tiết chương</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Khối 1: Nhập nội dung chương */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>01 · NHẬP CHƯƠNG TỰ VIẾT</Text>
          <View style={styles.chapterMetaRow}>
            <View style={{ width: 92 }}>
              <Text style={styles.fieldLabel}>Số chương</Text>
              <TextInput
                style={styles.input}
                value={chapterNumberInput}
                onChangeText={setChapterNumberInput}
                keyboardType="number-pad"
                placeholder="1"
                placeholderTextColor="#6d6253"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Tiêu đề chương</Text>
              <TextInput
                style={styles.input}
                value={chapterTitle}
                onChangeText={setChapterTitle}
                placeholder="VD: Chương 4: Bóng tối dưới tháp cổ"
                placeholderTextColor="#6d6253"
              />
            </View>
          </View>

          <View style={styles.fieldHeaderRow}>
            <Text style={styles.fieldLabel}>Nội dung văn bản chương</Text>
            <Text style={styles.wordCountText}>
              {wordCount} từ · {chapterText.length} ký tự
            </Text>
          </View>
          <TextInput
            style={[styles.input, styles.chapterTextArea]}
            value={chapterText}
            onChangeText={setChapterText}
            multiline
            textAlignVertical="top"
            placeholder="Dán hoặc tự viết nội dung chương truyện tại đây...&#10;&#10;AI sẽ đối chiếu toàn bộ bản đồ nhân vật, địa điểm, vật phẩm, tổ chức và các chương trước để phát hiện lỗi logic (nhân vật đã chết xuất hiện, sai lịch sử địa điểm, mâu thuẫn vật phẩm...) đồng thời đề xuất các node & sự kiện mới."
            placeholderTextColor="#6d6253"
          />

          <Pressable
            style={[styles.primaryBtn, (isAnalyzing || !chapterText.trim()) && styles.btnDisabled]}
            onPress={handleAnalyze}
            disabled={isAnalyzing || !chapterText.trim()}>
            {isAnalyzing ? (
              <View style={styles.btnInlineRow}>
                <ActivityIndicator size="small" color="#12100d" />
                <Text style={styles.primaryBtnText}>AI đang đọc & kiểm tra nhất quán...</Text>
              </View>
            ) : (
              <Text style={styles.primaryBtnText}>
                {hasAnalyzed ? '🔄 Phân tích & Kiểm tra lại' : '✨ Phân tích & Bắt lỗi bằng AI'}
              </Text>
            )}
          </Pressable>
        </View>

        {/* Khối 2: Kết quả phân tích */}
        {hasAnalyzed && (
          <>
            {/* Tóm tắt chương & Cập nhật trạng thái nhân vật */}
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>02 · TÓM TẮT CHƯƠNG & TRẠNG THÁI</Text>
              <Text style={styles.fieldLabel}>Tóm tắt chương (lưu vào Chi tiết chương)</Text>
              <TextInput
                style={[styles.input, { minHeight: 72 }]}
                value={chapterSummary}
                onChangeText={setChapterSummary}
                multiline
                textAlignVertical="top"
                placeholder="Tóm tắt ngắn gọn diễn biến chính của chương..."
                placeholderTextColor="#6d6253"
              />

              {statusChanges.length > 0 && (
                <View style={{ marginTop: 14 }}>
                  <Text style={styles.fieldLabel}>
                    Cập nhật trạng thái nhân vật phát hiện trong chương ({selectedStatusCount}/
                    {statusChanges.length})
                  </Text>
                  {statusChanges.map((sc) => (
                    <Pressable
                      key={sc.localId}
                      style={[
                        styles.statusChangeCard,
                        !sc.selected && styles.cardDimmed,
                      ]}
                      onPress={() =>
                        setStatusChanges((prev) =>
                          prev.map((x) =>
                            x.localId === sc.localId ? { ...x, selected: !x.selected } : x
                          )
                        )
                      }>
                      <Text style={styles.checkboxIcon}>{sc.selected ? '☑' : '☐'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.statusChangeTitle}>
                          {sc.characterName} →{' '}
                          <Text
                            style={{
                              color: sc.status === 'Đã chết' ? '#f08378' : '#7fd4a7',
                            }}>
                            {sc.status}
                          </Text>
                        </Text>
                        {!!sc.reason && <Text style={styles.statusChangeReason}>{sc.reason}</Text>}
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* Tabs chuyển đổi kết quả: Bắt lỗi / Node đề xuất / Sự kiện chương */}
            <View style={styles.tabsRow}>
              <Pressable
                style={[styles.tabBtn, activeResultTab === 'issues' && styles.tabBtnActive]}
                onPress={() => setActiveResultTab('issues')}>
                <Text
                  style={[
                    styles.tabBtnText,
                    activeResultTab === 'issues' && styles.tabBtnTextActive,
                  ]}>
                  🛡️ Lỗi ({issues.length})
                </Text>
              </Pressable>
              <Pressable
                style={[styles.tabBtn, activeResultTab === 'nodes' && styles.tabBtnActive]}
                onPress={() => setActiveResultTab('nodes')}>
                <Text
                  style={[
                    styles.tabBtnText,
                    activeResultTab === 'nodes' && styles.tabBtnTextActive,
                  ]}>
                  ◈ Node mới ({selectedNodesCount}/{suggestedNodes.length})
                </Text>
              </Pressable>
              <Pressable
                style={[styles.tabBtn, activeResultTab === 'events' && styles.tabBtnActive]}
                onPress={() => setActiveResultTab('events')}>
                <Text
                  style={[
                    styles.tabBtnText,
                    activeResultTab === 'events' && styles.tabBtnTextActive,
                  ]}>
                  📖 Sự kiện ({selectedEventsCount}/{suggestedEvents.length})
                </Text>
              </Pressable>
            </View>

            {/* TAB 1: BÁO CÁO BẮT LỖI */}
            {activeResultTab === 'issues' && (
              <View style={styles.card}>
                <View style={styles.summaryPillsRow}>
                  <View style={[styles.summaryPill, { borderColor: '#7a2f28' }]}>
                    <Text style={[styles.summaryPillText, { color: '#f5b0a8' }]}>
                      ⛔ {unresolvedErrorCount} Nghiêm trọng
                    </Text>
                  </View>
                  <View style={[styles.summaryPill, { borderColor: '#755622' }]}>
                    <Text style={[styles.summaryPillText, { color: '#f3d28e' }]}>
                      ⚠️ {unresolvedWarningCount} Cảnh báo
                    </Text>
                  </View>
                </View>

                {issues.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyBoxIcon}>✨</Text>
                    <Text style={styles.emptyBoxTitle}>
                      Không phát hiện lỗi nhất quán nào!
                    </Text>
                    <Text style={styles.emptyBoxDesc}>
                      Nội dung chương khớp tốt với bản đồ thực thể và lịch sử các chương trước. Bạn
                      có thể xem các node & sự kiện đề xuất rồi lưu vào đồ thị.
                    </Text>
                  </View>
                ) : (
                  issues.map((issue) => {
                    const meta = SEVERITY_META[issue.severity];
                    return (
                      <View
                        key={issue.id}
                        style={[
                          styles.issueCard,
                          { backgroundColor: meta.bg, borderColor: meta.border },
                          issue.resolved && styles.cardDimmed,
                        ]}>
                        <View style={styles.issueHeaderRow}>
                          <View style={[styles.issueBadge, { backgroundColor: meta.badgeBg }]}>
                            <Text style={[styles.issueBadgeText, { color: meta.text }]}>
                              {meta.icon} {issue.category}
                            </Text>
                          </View>
                          <Pressable
                            style={styles.resolveBtn}
                            onPress={() =>
                              setIssues((prev) =>
                                prev.map((it) =>
                                  it.id === issue.id ? { ...it, resolved: !it.resolved } : it
                                )
                              )
                            }>
                            <Text style={styles.resolveBtnText}>
                              {issue.resolved ? '↩ Mở lại' : '✓ Đã xử lý'}
                            </Text>
                          </Pressable>
                        </View>

                        <Text style={styles.issueTitle}>{issue.title}</Text>

                        {!!issue.quote && (
                          <View style={styles.quoteBox}>
                            <Text style={styles.quoteText}>"{issue.quote}"</Text>
                          </View>
                        )}

                        {!!issue.explanation && (
                          <Text style={styles.issueExplanation}>{issue.explanation}</Text>
                        )}

                        {!!issue.suggestion && (
                          <Text style={styles.issueSuggestion}>
                            💡 Gợi ý sửa: {issue.suggestion}
                          </Text>
                        )}

                        {issue.relatedEntities.length > 0 && (
                          <View style={styles.tagsRow}>
                            {issue.relatedEntities.map((ent, idx) => (
                              <View key={`${issue.id}-${idx}`} style={styles.entityTag}>
                                <Text style={styles.entityTagText}>{ent}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {/* TAB 2: ĐỀ XUẤT NODE MỚI */}
            {activeResultTab === 'nodes' && (
              <View style={styles.card}>
                <View style={styles.tabHeaderRow}>
                  <Text style={styles.tabHintText}>
                    Chọn và chỉnh sửa các thực thể mới sẽ thêm vào đồ thị:
                  </Text>
                  <Pressable
                    style={styles.addSmallBtn}
                    onPress={() => {
                      setIsAddingNewNode(true);
                      setEditingNode(createEmptySuggestedNode('character'));
                    }}>
                    <Text style={styles.addSmallBtnText}>+ Thêm node</Text>
                  </Pressable>
                </View>

                {suggestedNodes.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyBoxTitle}>Không có thực thể mới nào cần tạo</Text>
                    <Text style={styles.emptyBoxDesc}>
                      Tất cả nhân vật, vật phẩm, địa điểm và tổ chức trong chương đã có sẵn trên bản
                      đồ, hoặc bạn có thể bấm "+ Thêm node" để bổ sung thủ công.
                    </Text>
                  </View>
                ) : (
                  suggestedNodes.map((node) => {
                    const typeMeta = ENTITY_TYPE_META[node.type];
                    return (
                      <View
                        key={node.localId}
                        style={[styles.suggestionCard, !node.selected && styles.cardDimmed]}>
                        <View style={styles.suggestionTopRow}>
                          <Pressable
                            style={styles.checkboxHit}
                            onPress={() =>
                              setSuggestedNodes((prev) =>
                                prev.map((n) =>
                                  n.localId === node.localId ? { ...n, selected: !n.selected } : n
                                )
                              )
                            }>
                            <Text style={styles.checkboxIcon}>{node.selected ? '☑' : '☐'}</Text>
                          </Pressable>
                          <View style={{ flex: 1 }}>
                            <View style={styles.suggestionTitleRow}>
                              <Text style={[styles.typePill, { color: typeMeta.color }]}>
                                {typeMeta.icon} {typeMeta.label}
                              </Text>
                              <Text style={styles.suggestionName} numberOfLines={1}>
                                {node.name}
                              </Text>
                            </View>
                            {!!node.role && (
                              <Text style={styles.suggestionRole}>{node.role}</Text>
                            )}
                          </View>
                          <Pressable
                            style={styles.editMiniBtn}
                            onPress={() => {
                              setIsAddingNewNode(false);
                              setEditingNode({ ...node });
                            }}>
                            <Text style={styles.editMiniBtnText}>✏️ Sửa</Text>
                          </Pressable>
                          <Pressable
                            style={styles.deleteMiniBtn}
                            onPress={() =>
                              setSuggestedNodes((prev) =>
                                prev.filter((n) => n.localId !== node.localId)
                              )
                            }>
                            <Text style={styles.deleteMiniBtnText}>✕</Text>
                          </Pressable>
                        </View>
                        {!!node.desc && (
                          <Text style={styles.suggestionDesc}>{node.desc}</Text>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {/* TAB 3: ĐỀ XUẤT SỰ KIỆN CỦA CHƯƠNG */}
            {activeResultTab === 'events' && (
              <View style={styles.card}>
                <View style={styles.tabHeaderRow}>
                  <Text style={styles.tabHintText}>
                    Các sự kiện được chọn sẽ tạo thành node Sự kiện và gán vào chương này:
                  </Text>
                  <Pressable
                    style={styles.addSmallBtn}
                    onPress={() => {
                      setIsAddingNewEvent(true);
                      setEditingEvent(createEmptySuggestedEvent());
                    }}>
                    <Text style={styles.addSmallBtnText}>+ Thêm sự kiện</Text>
                  </Pressable>
                </View>

                {suggestedEvents.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyBoxTitle}>Chưa có sự kiện nào được trích xuất</Text>
                    <Text style={styles.emptyBoxDesc}>
                      Bạn có thể bấm "+ Thêm sự kiện" để tự thêm sự kiện cho chương này.
                    </Text>
                  </View>
                ) : (
                  suggestedEvents.map((ev, index) => (
                    <View
                      key={ev.localId}
                      style={[styles.suggestionCard, !ev.selected && styles.cardDimmed]}>
                      <View style={styles.suggestionTopRow}>
                        <Pressable
                          style={styles.checkboxHit}
                          onPress={() =>
                            setSuggestedEvents((prev) =>
                              prev.map((item) =>
                                item.localId === ev.localId
                                  ? { ...item, selected: !item.selected }
                                  : item
                              )
                            )
                          }>
                          <Text style={styles.checkboxIcon}>{ev.selected ? '☑' : '☐'}</Text>
                        </Pressable>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.suggestionName}>
                            #{index + 1} · {ev.name}
                          </Text>
                          <Text style={styles.suggestionMeta}>
                            {[ev.time, ev.location].filter(Boolean).join(' · ') || 'Diễn biến trong chương'}
                          </Text>
                        </View>
                        <Pressable
                          style={styles.editMiniBtn}
                          onPress={() => {
                            setIsAddingNewEvent(false);
                            setEditingEvent({ ...ev });
                          }}>
                          <Text style={styles.editMiniBtnText}>✏️ Sửa</Text>
                        </Pressable>
                        <Pressable
                          style={styles.deleteMiniBtn}
                          onPress={() =>
                            setSuggestedEvents((prev) =>
                              prev.filter((item) => item.localId !== ev.localId)
                            )
                          }>
                          <Text style={styles.deleteMiniBtnText}>✕</Text>
                        </Pressable>
                      </View>
                      {!!ev.desc && <Text style={styles.suggestionDesc}>{ev.desc}</Text>}
                      {!!ev.charactersText && (
                        <Text style={styles.eventCharsText}>
                          👥 Nhân vật: {ev.charactersText}
                        </Text>
                      )}
                      {!!ev.impact && (
                        <Text style={styles.eventImpactText}>⚡ Tác động: {ev.impact}</Text>
                      )}
                    </View>
                  ))
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Thanh hành động lưu cố định dưới cùng */}
      {hasAnalyzed && (
        <View style={styles.bottomActionBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bottomBarTitle}>
              Lưu 1 chương · {selectedNodesCount} node · {selectedEventsCount} sự kiện
            </Text>
            <Text style={styles.bottomBarSub}>
              {unresolvedErrorCount > 0
                ? `Còn ${unresolvedErrorCount} lỗi nghiêm trọng chưa xử lý`
                : 'Sẵn sàng lưu vào đồ thị và Chi tiết chương'}
            </Text>
          </View>
          <Pressable
            style={[styles.saveBtn, isSaving && styles.btnDisabled]}
            onPress={handleSavePress}
            disabled={isSaving}>
            {isSaving ? (
              <ActivityIndicator size="small" color="#12100d" />
            ) : (
              <Text style={styles.saveBtnText}>💾 Lưu đồ thị & Chương</Text>
            )}
          </Pressable>
        </View>
      )}

      {/* Modal chỉnh sửa Node đề xuất */}
      <Modal
        visible={editingNode !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingNode(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {isAddingNewNode ? 'Thêm node đề xuất' : 'Chỉnh sửa node đề xuất'}
            </Text>
            {editingNode && (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
                <Text style={styles.fieldLabel}>Loại thực thể</Text>
                <View style={styles.typeChipsRow}>
                  {(['character', 'item', 'location', 'faction'] as EntityType[]).map((t) => {
                    const meta = ENTITY_TYPE_META[t];
                    const active = editingNode.type === t;
                    return (
                      <Pressable
                        key={t}
                        style={[styles.typeChip, active && styles.typeChipActive]}
                        onPress={() => setEditingNode({ ...editingNode, type: t })}>
                        <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>
                          {meta.icon} {meta.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.fieldLabel}>Tên thực thể *</Text>
                <TextInput
                  style={styles.input}
                  value={editingNode.name}
                  onChangeText={(v) => setEditingNode({ ...editingNode, name: v })}
                  placeholder="Nhập tên..."
                  placeholderTextColor="#6d6253"
                />

                <Text style={styles.fieldLabel}>Vai trò / Phân loại ngắn</Text>
                <TextInput
                  style={styles.input}
                  value={editingNode.role}
                  onChangeText={(v) => setEditingNode({ ...editingNode, role: v })}
                  placeholder="VD: NHÂN VẬT PHỤ, Quý hiếm, Địa danh..."
                  placeholderTextColor="#6d6253"
                />

                <Text style={styles.fieldLabel}>Trạng thái</Text>
                <TextInput
                  style={styles.input}
                  value={editingNode.status}
                  onChangeText={(v) => setEditingNode({ ...editingNode, status: v })}
                  placeholder="Còn sống / Nguyên vẹn / Hoạt động..."
                  placeholderTextColor="#6d6253"
                />

                <Text style={styles.fieldLabel}>Mô tả</Text>
                <TextInput
                  style={[styles.input, { minHeight: 80 }]}
                  value={editingNode.desc}
                  onChangeText={(v) => setEditingNode({ ...editingNode, desc: v })}
                  multiline
                  textAlignVertical="top"
                  placeholder="Mô tả chi tiết..."
                  placeholderTextColor="#6d6253"
                />

                {editingNode.type === 'character' && (
                  <>
                    <Text style={styles.fieldLabel}>Giới tính</Text>
                    <TextInput
                      style={styles.input}
                      value={editingNode.gender}
                      onChangeText={(v) => setEditingNode({ ...editingNode, gender: v })}
                      placeholder="Nam / Nữ / Khác"
                      placeholderTextColor="#6d6253"
                    />
                    <Text style={styles.fieldLabel}>Vật dụng / Vũ khí</Text>
                    <TextInput
                      style={styles.input}
                      value={editingNode.weapon}
                      onChangeText={(v) => setEditingNode({ ...editingNode, weapon: v })}
                      placeholder="Để trống nếu không có"
                      placeholderTextColor="#6d6253"
                    />
                    <Text style={styles.fieldLabel}>Tổ chức / Môn phái</Text>
                    <TextInput
                      style={styles.input}
                      value={editingNode.sect}
                      onChangeText={(v) => setEditingNode({ ...editingNode, sect: v })}
                      placeholder="Để trống nếu không có"
                      placeholderTextColor="#6d6253"
                    />
                    <Text style={styles.fieldLabel}>Nơi sinh</Text>
                    <TextInput
                      style={styles.input}
                      value={editingNode.birthplace}
                      onChangeText={(v) => setEditingNode({ ...editingNode, birthplace: v })}
                      placeholder="Để trống nếu không có"
                      placeholderTextColor="#6d6253"
                    />
                  </>
                )}

                {editingNode.type === 'item' && (
                  <>
                    <Text style={styles.fieldLabel}>Độ hiếm</Text>
                    <TextInput
                      style={styles.input}
                      value={editingNode.rarity}
                      onChangeText={(v) => setEditingNode({ ...editingNode, rarity: v })}
                      placeholder="Phổ thông / Hiếm / Quý hiếm / Độc bản..."
                      placeholderTextColor="#6d6253"
                    />
                    <Text style={styles.fieldLabel}>Người giữ / Vị trí</Text>
                    <TextInput
                      style={styles.input}
                      value={editingNode.holderOrLocation}
                      onChangeText={(v) => setEditingNode({ ...editingNode, holderOrLocation: v })}
                      placeholder="Tên nhân vật giữ vật phẩm"
                      placeholderTextColor="#6d6253"
                    />
                    <Text style={styles.fieldLabel}>Nguồn gốc</Text>
                    <TextInput
                      style={styles.input}
                      value={editingNode.origin}
                      onChangeText={(v) => setEditingNode({ ...editingNode, origin: v })}
                      placeholder="Địa điểm nguồn gốc"
                      placeholderTextColor="#6d6253"
                    />
                  </>
                )}

                {editingNode.type === 'location' && (
                  <>
                    <Text style={styles.fieldLabel}>Vùng miền</Text>
                    <TextInput
                      style={styles.input}
                      value={editingNode.region}
                      onChangeText={(v) => setEditingNode({ ...editingNode, region: v })}
                      placeholder="VD: Miền Bắc, Kinh thành..."
                      placeholderTextColor="#6d6253"
                    />
                    <Text style={styles.fieldLabel}>Khí hậu / Mức nguy hiểm</Text>
                    <TextInput
                      style={styles.input}
                      value={editingNode.dangerLevel}
                      onChangeText={(v) => setEditingNode({ ...editingNode, dangerLevel: v })}
                      placeholder="An toàn / Bình thường / Nguy hiểm..."
                      placeholderTextColor="#6d6253"
                    />
                    <Text style={styles.fieldLabel}>Thế lực cai quản</Text>
                    <TextInput
                      style={styles.input}
                      value={editingNode.ruler}
                      onChangeText={(v) => setEditingNode({ ...editingNode, ruler: v })}
                      placeholder="Tên tổ chức cai quản"
                      placeholderTextColor="#6d6253"
                    />
                  </>
                )}

                {editingNode.type === 'faction' && (
                  <>
                    <Text style={styles.fieldLabel}>Thủ lĩnh / Đại diện</Text>
                    <TextInput
                      style={styles.input}
                      value={editingNode.leader}
                      onChangeText={(v) => setEditingNode({ ...editingNode, leader: v })}
                      placeholder="Tên nhân vật thủ lĩnh"
                      placeholderTextColor="#6d6253"
                    />
                    <Text style={styles.fieldLabel}>Trụ sở / Căn cứ</Text>
                    <TextInput
                      style={styles.input}
                      value={editingNode.headquarters}
                      onChangeText={(v) => setEditingNode({ ...editingNode, headquarters: v })}
                      placeholder="Tên địa điểm trụ sở"
                      placeholderTextColor="#6d6253"
                    />
                    <Text style={styles.fieldLabel}>Tôn chỉ</Text>
                    <TextInput
                      style={styles.input}
                      value={editingNode.motto}
                      onChangeText={(v) => setEditingNode({ ...editingNode, motto: v })}
                      placeholder="Khẩu hiệu hoặc mục tiêu..."
                      placeholderTextColor="#6d6253"
                    />
                  </>
                )}
              </ScrollView>
            )}
            <View style={styles.modalActionsRow}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => {
                  setEditingNode(null);
                  setIsAddingNewNode(false);
                }}>
                <Text style={styles.modalCancelBtnText}>Hủy</Text>
              </Pressable>
              <Pressable style={styles.modalSaveBtn} onPress={handleCommitNodeEdit}>
                <Text style={styles.modalSaveBtnText}>Áp dụng</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal chỉnh sửa Sự kiện đề xuất */}
      <Modal
        visible={editingEvent !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingEvent(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {isAddingNewEvent ? 'Thêm sự kiện cho chương' : 'Chỉnh sửa sự kiện'}
            </Text>
            {editingEvent && (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 440 }}>
                <Text style={styles.fieldLabel}>Tên sự kiện *</Text>
                <TextInput
                  style={styles.input}
                  value={editingEvent.name}
                  onChangeText={(v) => setEditingEvent({ ...editingEvent, name: v })}
                  placeholder="VD: Cuộc phục kích tại cầu đá"
                  placeholderTextColor="#6d6253"
                />

                <Text style={styles.fieldLabel}>Mô tả diễn biến</Text>
                <TextInput
                  style={[styles.input, { minHeight: 80 }]}
                  value={editingEvent.desc}
                  onChangeText={(v) => setEditingEvent({ ...editingEvent, desc: v })}
                  multiline
                  textAlignVertical="top"
                  placeholder="Mô tả chi tiết sự kiện..."
                  placeholderTextColor="#6d6253"
                />

                <Text style={styles.fieldLabel}>Địa điểm diễn ra</Text>
                <TextInput
                  style={styles.input}
                  value={editingEvent.location}
                  onChangeText={(v) => setEditingEvent({ ...editingEvent, location: v })}
                  placeholder="Tên địa điểm"
                  placeholderTextColor="#6d6253"
                />

                <Text style={styles.fieldLabel}>Thời điểm</Text>
                <TextInput
                  style={styles.input}
                  value={editingEvent.time}
                  onChangeText={(v) => setEditingEvent({ ...editingEvent, time: v })}
                  placeholder="VD: Đêm khuya / Đầu chương"
                  placeholderTextColor="#6d6253"
                />

                <Text style={styles.fieldLabel}>Nhân vật tham gia (phân cách bằng dấu phẩy)</Text>
                <TextInput
                  style={styles.input}
                  value={editingEvent.charactersText}
                  onChangeText={(v) => setEditingEvent({ ...editingEvent, charactersText: v })}
                  placeholder="VD: Minh, Lan, Trưởng lão Hắc Phong"
                  placeholderTextColor="#6d6253"
                />

                <Text style={styles.fieldLabel}>Tác động / Hậu quả</Text>
                <TextInput
                  style={styles.input}
                  value={editingEvent.impact}
                  onChangeText={(v) => setEditingEvent({ ...editingEvent, impact: v })}
                  placeholder="Hệ quả sau sự kiện..."
                  placeholderTextColor="#6d6253"
                />
              </ScrollView>
            )}
            <View style={styles.modalActionsRow}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => {
                  setEditingEvent(null);
                  setIsAddingNewEvent(false);
                }}>
                <Text style={styles.modalCancelBtnText}>Hủy</Text>
              </Pressable>
              <Pressable style={styles.modalSaveBtn} onPress={handleCommitEventEdit}>
                <Text style={styles.modalSaveBtnText}>Áp dụng</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Thanh bên điều hướng */}
      <GraphSidebar
        visible={sidebarVisible}
        project={currentProject}
        activeSection="checker"
        onClose={() => setSidebarVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#12100d',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#26211b',
    backgroundColor: '#16130f',
    gap: 10,
  },
  headerLeftGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#211c16',
    borderWidth: 1,
    borderColor: '#352d23',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBtnPressed: {
    opacity: 0.7,
  },
  menuBtnIcon: {
    color: '#e5a93c',
    fontSize: 18,
    fontWeight: '700',
  },
  headerTitle: {
    color: '#f5efe6',
    fontSize: 18,
    fontFamily: AppFonts.serif,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#9c8f7d',
    fontSize: 11,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  resetHeaderBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3c3328',
    backgroundColor: '#1f1a14',
  },
  resetHeaderBtnText: {
    color: '#d6c7b2',
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 110,
    gap: 14,
  },
  card: {
    backgroundColor: '#191511',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2c251d',
    padding: 14,
  },
  sectionLabel: {
    color: '#e5a93c',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    marginBottom: 10,
  },
  chapterMetaRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  fieldHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldLabel: {
    color: '#bfb29e',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 4,
  },
  wordCountText: {
    color: '#8c7f6d',
    fontSize: 11,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#120f0c',
    borderWidth: 1,
    borderColor: '#332b22',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f4ede4',
    fontSize: 14,
    marginBottom: 8,
  },
  chapterTextArea: {
    minHeight: 190,
    lineHeight: 22,
  },
  primaryBtn: {
    marginTop: 6,
    backgroundColor: '#e5a93c',
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#12100d',
    fontSize: 14,
    fontWeight: '700',
  },
  btnInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btnDisabled: {
    opacity: 0.55,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2e271f',
    backgroundColor: '#181410',
    alignItems: 'center',
  },
  tabBtnActive: {
    borderColor: '#e5a93c',
    backgroundColor: '#261f15',
  },
  tabBtnText: {
    color: '#9c8f7d',
    fontSize: 12,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: '#f2c265',
  },
  summaryPillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  summaryPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: '#14110e',
  },
  summaryPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 12,
  },
  emptyBoxIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  emptyBoxTitle: {
    color: '#f0e6d8',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyBoxDesc: {
    color: '#9c8f7d',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  issueCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  issueHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  issueBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  issueBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  resolveBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4c4236',
    backgroundColor: '#1b1713',
  },
  resolveBtnText: {
    color: '#d8cbb8',
    fontSize: 11,
    fontWeight: '600',
  },
  issueTitle: {
    color: '#f7f0e6',
    fontSize: 14,
    fontWeight: '700',
  },
  quoteBox: {
    borderLeftWidth: 3,
    borderLeftColor: '#e5a93c',
    paddingLeft: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 4,
  },
  quoteText: {
    color: '#e6d8c3',
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 19,
  },
  issueExplanation: {
    color: '#d3c5b2',
    fontSize: 13,
    lineHeight: 19,
  },
  issueSuggestion: {
    color: '#f2c879',
    fontSize: 13,
    lineHeight: 19,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  entityTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#252019',
    borderWidth: 1,
    borderColor: '#3d3428',
  },
  entityTagText: {
    color: '#d5c6b0',
    fontSize: 11,
  },
  tabHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  tabHintText: {
    flex: 1,
    color: '#9f927f',
    fontSize: 12,
    lineHeight: 17,
  },
  addSmallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5a93c',
    backgroundColor: '#241d13',
  },
  addSmallBtnText: {
    color: '#e5a93c',
    fontSize: 12,
    fontWeight: '700',
  },
  suggestionCard: {
    backgroundColor: '#13100d',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#2d261e',
    padding: 12,
    marginBottom: 10,
    gap: 6,
  },
  cardDimmed: {
    opacity: 0.48,
  },
  suggestionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkboxHit: {
    padding: 2,
  },
  checkboxIcon: {
    color: '#e5a93c',
    fontSize: 20,
  },
  suggestionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  typePill: {
    fontSize: 11,
    fontWeight: '700',
  },
  suggestionName: {
    color: '#f5efe6',
    fontSize: 14,
    fontWeight: '700',
  },
  suggestionRole: {
    color: '#a39582',
    fontSize: 12,
    marginTop: 2,
  },
  suggestionMeta: {
    color: '#a39582',
    fontSize: 12,
    marginTop: 2,
  },
  suggestionDesc: {
    color: '#cfc2af',
    fontSize: 13,
    lineHeight: 18,
  },
  eventCharsText: {
    color: '#d9bc82',
    fontSize: 12,
  },
  eventImpactText: {
    color: '#a5bfa7',
    fontSize: 12,
  },
  editMiniBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#241e17',
    borderWidth: 1,
    borderColor: '#3f3529',
  },
  editMiniBtnText: {
    color: '#e5a93c',
    fontSize: 11,
    fontWeight: '600',
  },
  deleteMiniBtn: {
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#261715',
    borderWidth: 1,
    borderColor: '#4f2822',
  },
  deleteMiniBtnText: {
    color: '#e8958a',
    fontSize: 11,
    fontWeight: '700',
  },
  statusChangeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#13100d',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#30281f',
    padding: 10,
    marginTop: 6,
  },
  statusChangeTitle: {
    color: '#f2e8da',
    fontSize: 13,
    fontWeight: '700',
  },
  statusChangeReason: {
    color: '#a89a86',
    fontSize: 12,
    marginTop: 2,
  },
  bottomActionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#181410',
    borderTopWidth: 1,
    borderTopColor: '#332b21',
  },
  bottomBarTitle: {
    color: '#f5efe6',
    fontSize: 13,
    fontWeight: '700',
  },
  bottomBarSub: {
    color: '#9c8f7d',
    fontSize: 11,
    marginTop: 2,
  },
  saveBtn: {
    backgroundColor: '#e5a93c',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 158,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#12100d',
    fontSize: 13,
    fontWeight: '700',
  },
  successBanner: {
    backgroundColor: '#14241b',
    borderWidth: 1,
    borderColor: '#2d6344',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  successBannerTitle: {
    color: '#8ee6b3',
    fontSize: 15,
    fontWeight: '700',
  },
  successBannerDesc: {
    color: '#c9e6d5',
    fontSize: 13,
    lineHeight: 19,
  },
  successActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  successActionBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#1d3829',
    borderWidth: 1,
    borderColor: '#3e855c',
    alignItems: 'center',
  },
  successActionBtnText: {
    color: '#d8f5e3',
    fontSize: 12,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    backgroundColor: '#1a1612',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#382f25',
    padding: 16,
  },
  modalTitle: {
    color: '#f5efe6',
    fontSize: 16,
    fontFamily: AppFonts.serif,
    fontWeight: '700',
    marginBottom: 12,
  },
  typeChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  typeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#332b21',
    backgroundColor: '#120f0c',
  },
  typeChipActive: {
    borderColor: '#e5a93c',
    backgroundColor: '#292014',
  },
  typeChipText: {
    color: '#a39582',
    fontSize: 12,
    fontWeight: '600',
  },
  typeChipTextActive: {
    color: '#f2c265',
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3d3429',
    backgroundColor: '#14110e',
  },
  modalCancelBtnText: {
    color: '#bfb29e',
    fontSize: 13,
    fontWeight: '600',
  },
  modalSaveBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#e5a93c',
  },
  modalSaveBtnText: {
    color: '#12100d',
    fontSize: 13,
    fontWeight: '700',
  },
});
