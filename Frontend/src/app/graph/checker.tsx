import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import { GraphSidebar } from '@/components/graph/GraphSidebar';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { FormSelectField } from '@/components/ui/FormSelectField';
import {
  CHARACTER_PROFESSIONS,
  CHARACTER_STATUS_OPTIONS,
  FACTION_CLASSIFICATIONS,
  FACTION_STATUS_OPTIONS,
  getProjectChapters,
  INITIAL_PROJECTS,
  ITEM_RARITY_OPTIONS,
  LOCATION_CLIMATE_OPTIONS,
  LOCATION_DANGER_OPTIONS,
  LOCATION_REGION_OPTIONS,
  StoryChapter,
  StoryNode,
  StoryProject,
} from '@/constants/story-data';
import { AppFonts } from '@/constants/theme';
import { api, ApiError } from '@/services/api';
import { projectStore } from '@/services/project-store';

type EntityType = 'character' | 'item' | 'location' | 'faction';

const GENDER_OPTIONS = [
  { label: 'Nam', value: 'Nam', icon: '♂️' },
  { label: 'Nữ', value: 'Nữ', icon: '♀️' },
  { label: 'Khác / Phi giới tính', value: 'Khác', icon: '⚧️' },
];

interface AppliedRewriteRange {
  start: number;
  end: number;
  beforeContext: string;
  afterContext: string;
  originalText: string;
  replacementText: string;
  anchoredWasUniqueAfterApply: boolean;
}

interface ContextOmissionsInfo {
  omittedCharacters: number;
  omittedLocations: number;
  omittedItems: number;
  omittedFactions: number;
  omittedEvents: number;
  omittedChapters: number;
  omittedLinks: number;
  totalOmitted: number;
}

interface EditableIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  category: string;
  title: string;
  quote: string;
  explanation: string;
  suggestion: string;
  suggestedRewrite: string;
  relatedEntities: string[];
  resolved: boolean;
  applied: boolean;
  appliedRange?: AppliedRewriteRange;
}

interface EditableSuggestedNode {
  localId: string;
  selected: boolean;
  type: EntityType;
  name: string;
  role: string;
  desc: string;
  status: string;
  statusEvent: string;
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
  charactersInvolved: string[];
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
  item: { label: 'Vật phẩm', icon: '⚔️', color: '#42b883' },
  location: { label: 'Địa điểm', icon: '📍', color: '#9f70cf' },
  faction: { label: 'Tổ chức', icon: '🏛️', color: '#d95a38' },
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const REWRITE_CONTEXT_WINDOW = 24;

type ReplaceQuoteResult =
  | { status: 'ok'; updatedText: string; range: AppliedRewriteRange }
  | { status: 'ambiguous' }
  | { status: 'not_found' };

function replaceQuoteInText(
  sourceText: string,
  quote: string,
  replacement: string
): ReplaceQuoteResult {
  const cleanQuote = quote.trim();
  if (!cleanQuote) return { status: 'not_found' };

  const exactIdx = sourceText.indexOf(cleanQuote);
  if (exactIdx !== -1) {
    // Chỉ áp dụng khi đoạn trích dẫn xuất hiện duy nhất 1 lần
    if (sourceText.indexOf(cleanQuote, exactIdx + 1) !== -1) {
      return { status: 'ambiguous' };
    }
    const endIdx = exactIdx + cleanQuote.length;
    const updatedText = sourceText.slice(0, exactIdx) + replacement + sourceText.slice(endIdx);
    const beforeContext = sourceText.slice(Math.max(0, exactIdx - REWRITE_CONTEXT_WINDOW), exactIdx);
    const afterContext = sourceText.slice(endIdx, endIdx + REWRITE_CONTEXT_WINDOW);
    const anchored = `${beforeContext}${replacement}${afterContext}`;
    const firstAnchoredIdx = anchored ? updatedText.indexOf(anchored) : -1;
    const anchoredWasUniqueAfterApply =
      firstAnchoredIdx !== -1 && updatedText.indexOf(anchored, firstAnchoredIdx + 1) === -1;
    return {
      status: 'ok',
      updatedText,
      range: {
        start: exactIdx,
        end: exactIdx + replacement.length,
        beforeContext,
        afterContext,
        originalText: cleanQuote,
        replacementText: replacement,
        anchoredWasUniqueAfterApply,
      },
    };
  }

  // Fallback: khớp linh hoạt theo khoảng trắng / xuống dòng, đồng thời bắt buộc duy nhất
  const tokens = cleanQuote.split(/\s+/).filter(Boolean).map(escapeRegex);
  if (tokens.length === 0) return { status: 'not_found' };
  const flexRegex = new RegExp(tokens.join('\\s+'), 'g');
  const matches = Array.from(sourceText.matchAll(flexRegex));
  if (matches.length === 0) return { status: 'not_found' };
  if (matches.length > 1) return { status: 'ambiguous' };

  const first = matches[0];
  if (first.index === undefined) return { status: 'not_found' };
  const startIdx = first.index;
  const matchedText = first[0];
  const endIdx = startIdx + matchedText.length;
  const updatedText = sourceText.slice(0, startIdx) + replacement + sourceText.slice(endIdx);
  const beforeContext = sourceText.slice(Math.max(0, startIdx - REWRITE_CONTEXT_WINDOW), startIdx);
  const afterContext = sourceText.slice(endIdx, endIdx + REWRITE_CONTEXT_WINDOW);
  const anchored = `${beforeContext}${replacement}${afterContext}`;
  const firstAnchoredIdx = anchored ? updatedText.indexOf(anchored) : -1;
  const anchoredWasUniqueAfterApply =
    firstAnchoredIdx !== -1 && updatedText.indexOf(anchored, firstAnchoredIdx + 1) === -1;
  return {
    status: 'ok',
    updatedText,
    range: {
      start: startIdx,
      end: startIdx + replacement.length,
      beforeContext,
      afterContext,
      originalText: matchedText,
      replacementText: replacement,
      anchoredWasUniqueAfterApply,
    },
  };
}

function restoreAppliedRangeInText(
  sourceText: string,
  range: AppliedRewriteRange
): string | null {
  const {
    start,
    end,
    beforeContext,
    afterContext,
    originalText,
    replacementText,
    anchoredWasUniqueAfterApply,
  } = range;

  // 1. Ưu tiên kiểm tra chính xác tại vị trí đã ghi nhận kèm ngữ cảnh xung quanh
  if (
    start >= 0 &&
    end <= sourceText.length &&
    sourceText.slice(start, end) === replacementText &&
    sourceText.slice(Math.max(0, start - beforeContext.length), start) === beforeContext &&
    sourceText.slice(end, end + afterContext.length) === afterContext &&
    (beforeContext.length > 0 ||
      afterContext.length > 0 ||
      (start === 0 && end === sourceText.length))
  ) {
    return sourceText.slice(0, start) + originalText + sourceText.slice(end);
  }

  // 2. Nếu có chỉnh sửa ở đoạn khác làm dịch chỉ số, chỉ khôi phục khi có ngữ cảnh phân biệt
  // và cụm ngữ cảnh đó là duy nhất cả lúc áp dụng lẫn hiện tại
  if (!anchoredWasUniqueAfterApply || (beforeContext.length === 0 && afterContext.length === 0)) {
    return null;
  }
  const anchored = `${beforeContext}${replacementText}${afterContext}`;
  if (!anchored) return null;
  const idx = sourceText.indexOf(anchored);
  if (idx === -1 || sourceText.indexOf(anchored, idx + 1) !== -1) {
    return null;
  }
  const replaceStart = idx + beforeContext.length;
  const replaceEnd = replaceStart + replacementText.length;
  return sourceText.slice(0, replaceStart) + originalText + sourceText.slice(replaceEnd);
}

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
    statusEvent: '',
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
    subType: type === 'faction' ? 'Đồng minh' : '',
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
    charactersInvolved: [],
  };
}

function createPlaceholderProject(id: string): StoryProject {
  return {
    id,
    title: 'Đang tải dự án...',
    genre: '',
    number: '№ 01',
    nodeCount: 0,
    linkCount: 0,
    updatedAt: '',
    nodes: [],
    links: [],
    chapters: [],
  };
}

export default function TextCheckerScreen() {
  const params = useLocalSearchParams<{ projectId?: string }>();
  const projectId = (typeof params.projectId === 'string' && params.projectId.trim()) || INITIAL_PROJECTS[0].id;
  const matchedInitialProject = INITIAL_PROJECTS.find((p) => p.id === projectId);

  const [currentProject, setCurrentProject] = useState<StoryProject>(
    () => matchedInitialProject || createPlaceholderProject(projectId)
  );
  const [projectLoadState, setProjectLoadState] = useState<'loading' | 'ready' | 'error'>(
    matchedInitialProject ? 'ready' : 'loading'
  );
  const [projectLoadError, setProjectLoadError] = useState<string | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(false);

  // Form nhập chương do tác giả tự viết
  const [chapterNumberInput, setChapterNumberInput] = useState('1');
  const chapterNumberTouchedRef = useRef(false);
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterText, setChapterText] = useState('');

  // Kết quả phân tích từ AI (có thể chỉnh sửa trước khi lưu)
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [isAnalysisStale, setIsAnalysisStale] = useState(false);
  const analyzedTextSnapshotRef = useRef<string | null>(null);
  const [contextOmissions, setContextOmissions] = useState<ContextOmissionsInfo | null>(null);
  const [chapterSummary, setChapterSummary] = useState('');
  const [issues, setIssues] = useState<EditableIssue[]>([]);
  const [suggestedNodes, setSuggestedNodes] = useState<EditableSuggestedNode[]>([]);
  const [suggestedEvents, setSuggestedEvents] = useState<EditableSuggestedEvent[]>([]);
  const [statusChanges, setStatusChanges] = useState<EditableStatusChange[]>([]);
  const [activeResultTab, setActiveResultTab] = useState<'issues' | 'nodes' | 'events'>('issues');

  // Modal chỉnh sửa node / event đề xuất (tái sử dụng chuẩn form của dự án)
  const [editingNode, setEditingNode] = useState<EditableSuggestedNode | null>(null);
  const [editingNodeOriginalName, setEditingNodeOriginalName] = useState<string>('');
  const [isAddingNewNode, setIsAddingNewNode] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EditableSuggestedEvent | null>(null);
  const [isAddingNewEvent, setIsAddingNewEvent] = useState(false);
  const [customParticipantInput, setCustomParticipantInput] = useState('');

  // Lưu vào database (ghi nhớ chapterId đã tạo trong phiên để retry không tạo trùng chương)
  const [isSaving, setIsSaving] = useState(false);
  const activeSaveAttemptRef = useRef<{
    chapterId: string;
    chapterNumber: number;
    title: string;
    committedNodeIds: Record<string, string>;
    committedEventIds: Record<string, string>;
  } | null>(null);
  const [saveSuccessInfo, setSaveSuccessInfo] = useState<{
    chapterTitle: string;
    nodesCount: number;
    eventsCount: number;
  } | null>(null);

  // Khóa toàn bộ nhập liệu khi AI đang phân tích hoặc đang lưu vào DB
  const isLocked = isAnalyzing || isSaving;

  const loadProject = useCallback(async () => {
    setProjectLoadError(null);
    setProjectLoadState((prev) => (prev === 'ready' ? 'ready' : 'loading'));
    try {
      const proj = await projectStore.getProject(projectId, { requireRemoteOrCache: true });
      setCurrentProject(proj);
      setProjectLoadState('ready');
      if (!chapterNumberTouchedRef.current) {
        const existingChapters = getProjectChapters(proj);
        const nextNum =
          existingChapters.length > 0
            ? Math.max(...existingChapters.map((c) => Number(c.chapterNumber) || 0)) + 1
            : 1;
        setChapterNumberInput(String(nextNum));
      }
    } catch (err: any) {
      console.warn('[TextChecker] Lỗi tải dự án:', err);
      setProjectLoadState('error');
      setProjectLoadError(err?.message || 'Không thể tải thông tin dự án.');
    }
  }, [projectId]);

  useEffect(() => {
    chapterNumberTouchedRef.current = false;
    activeSaveAttemptRef.current = null;
    void loadProject();
  }, [loadProject]);

  // Danh sách các thực thể hiện có + đề xuất mới để chọn trong FormSelectField (giống graph/index.tsx)
  const characterOptions = useMemo(() => {
    const map = new Map<string, { label: string; value: string; subtitle?: string; icon: string }>();
    for (const n of currentProject.nodes || []) {
      if (n.type === 'character' && n.name) {
        map.set(n.name.toLocaleLowerCase('vi'), {
          label: n.name,
          value: n.name,
          subtitle: n.role || 'Nhân vật hiện có',
          icon: '👤',
        });
      }
    }
    for (const n of suggestedNodes) {
      if (n.type === 'character' && n.name.trim()) {
        const key = n.name.trim().toLocaleLowerCase('vi');
        if (!map.has(key)) {
          map.set(key, {
            label: n.name.trim(),
            value: n.name.trim(),
            subtitle: n.role || 'Nhân vật mới đề xuất',
            icon: '✨',
          });
        }
      }
    }
    return Array.from(map.values());
  }, [currentProject.nodes, suggestedNodes]);

  const locationOptions = useMemo(() => {
    const map = new Map<string, { label: string; value: string; subtitle?: string; icon: string }>();
    for (const n of currentProject.nodes || []) {
      if (n.type === 'location' && n.name) {
        map.set(n.name.toLocaleLowerCase('vi'), {
          label: n.name,
          value: n.name,
          subtitle: n.region || n.role || 'Địa danh',
          icon: '📍',
        });
      }
    }
    for (const n of suggestedNodes) {
      if (n.type === 'location' && n.name.trim()) {
        const key = n.name.trim().toLocaleLowerCase('vi');
        if (!map.has(key)) {
          map.set(key, {
            label: n.name.trim(),
            value: n.name.trim(),
            subtitle: n.region || 'Địa điểm mới đề xuất',
            icon: '✨',
          });
        }
      }
    }
    return Array.from(map.values());
  }, [currentProject.nodes, suggestedNodes]);

  const itemOptions = useMemo(() => {
    const map = new Map<string, { label: string; value: string; subtitle?: string; icon: string }>();
    for (const n of currentProject.nodes || []) {
      if (n.type === 'item' && n.name) {
        map.set(n.name.toLocaleLowerCase('vi'), {
          label: n.name,
          value: n.name,
          subtitle: n.rarity || n.role || 'Vật phẩm',
          icon: '🗡️',
        });
      }
    }
    for (const n of suggestedNodes) {
      if (n.type === 'item' && n.name.trim()) {
        const key = n.name.trim().toLocaleLowerCase('vi');
        if (!map.has(key)) {
          map.set(key, {
            label: n.name.trim(),
            value: n.name.trim(),
            subtitle: n.rarity || 'Vật phẩm mới đề xuất',
            icon: '✨',
          });
        }
      }
    }
    return Array.from(map.values());
  }, [currentProject.nodes, suggestedNodes]);

  const factionOptions = useMemo(() => {
    const map = new Map<string, { label: string; value: string; subtitle?: string; icon: string }>();
    for (const n of currentProject.nodes || []) {
      if (n.type === 'faction' && n.name) {
        map.set(n.name.toLocaleLowerCase('vi'), {
          label: n.name,
          value: n.name,
          subtitle: n.alignment || n.role || 'Tổ chức',
          icon: '🏛️',
        });
      }
    }
    for (const n of suggestedNodes) {
      if (n.type === 'faction' && n.name.trim()) {
        const key = n.name.trim().toLocaleLowerCase('vi');
        if (!map.has(key)) {
          map.set(key, {
            label: n.name.trim(),
            value: n.name.trim(),
            subtitle: n.alignment || 'Tổ chức mới đề xuất',
            icon: '✨',
          });
        }
      }
    }
    return Array.from(map.values());
  }, [currentProject.nodes, suggestedNodes]);

  const eventOptions = useMemo(() => {
    const map = new Map<string, { label: string; value: string; subtitle?: string; icon: string }>();
    for (const n of currentProject.nodes || []) {
      if (n.type === 'event' && n.name) {
        map.set(n.name.toLocaleLowerCase('vi'), {
          label: n.name,
          value: n.name,
          subtitle: n.chapter || 'Biến cố',
          icon: '⚡',
        });
      }
    }
    for (const ev of suggestedEvents) {
      if (ev.name.trim()) {
        const key = ev.name.trim().toLocaleLowerCase('vi');
        if (!map.has(key)) {
          map.set(key, {
            label: ev.name.trim(),
            value: ev.name.trim(),
            subtitle: 'Sự kiện trong chương này',
            icon: '✨',
          });
        }
      }
    }
    return Array.from(map.values());
  }, [currentProject.nodes, suggestedEvents]);

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

  const handleChapterTextChange = (nextText: string) => {
    setChapterText(nextText);
    if (hasAnalyzed && analyzedTextSnapshotRef.current !== null) {
      setIsAnalysisStale(nextText !== analyzedTextSnapshotRef.current);
    }
  };

  const handleAnalyze = async () => {
    if (isLocked) return;
    if (projectLoadState !== 'ready') {
      showNotice('Đang tải dự án', 'Vui lòng chờ tải xong thông tin dự án trước khi phân tích.');
      return;
    }
    const trimmedText = chapterText.trim();
    if (trimmedText.length < 20) {
      showNotice(
        'Nội dung quá ngắn',
        'Vui lòng nhập hoặc dán nội dung chương (tối thiểu 20 ký tự) để AI kiểm tra.'
      );
      return;
    }
    if (trimmedText.length > 40000) {
      showNotice(
        'Nội dung vượt giới hạn',
        `Nội dung chương hiện có ${trimmedText.length.toLocaleString('vi-VN')} ký tự, vượt mức tối đa 40.000 ký tự. Vui lòng rút gọn hoặc chia thành hai chương.`
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
      setContextOmissions(data.contextOmissions || null);
      if (!chapterTitle.trim()) {
        setChapterTitle(`Chương ${data.chapterNumber}`);
      }

      const mappedIssues: EditableIssue[] = (data.issues || []).map((item) => ({
        ...item,
        suggestedRewrite: item.suggestedRewrite || '',
        resolved: false,
        applied: false,
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
        subType: n.subType || (n.type === 'faction' ? 'Đồng minh' : ''),
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
        charactersInvolved: Array.isArray(ev.charactersInvolved)
          ? ev.charactersInvolved.filter(Boolean)
          : [],
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
      analyzedTextSnapshotRef.current = chapterText;
      setIsAnalysisStale(false);
      setHasAnalyzed(true);

      if (mappedIssues.length > 0) {
        setActiveResultTab('issues');
      } else if (mappedNodes.length > 0) {
        setActiveResultTab('nodes');
      } else {
        setActiveResultTab('events');
      }
    } catch (err: any) {
      if (hasAnalyzed && analyzedTextSnapshotRef.current !== chapterText) {
        setIsAnalysisStale(true);
      }
      showNotice(
        'Phân tích thất bại',
        err?.message || 'Không thể kết nối AI để kiểm tra văn bản. Vui lòng thử lại.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const confirmAction = (
    title: string,
    message: string,
    confirmLabel = 'Tiếp tục',
    cancelLabel = 'Hủy'
  ): Promise<boolean> => {
    if (Platform.OS === 'web') {
      return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    }
    return new Promise((resolve) => {
      Alert.alert(title, message, [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, onPress: () => resolve(true) },
      ]);
    });
  };

  // Chấp nhận đề xuất sửa của AI: chỉ thay khi đoạn trích dẫn khớp duy nhất trong chapterText
  const handleAcceptRewrite = (issue: EditableIssue) => {
    if (isLocked || !issue.suggestedRewrite.trim() || !issue.quote.trim()) return;
    const replaced = replaceQuoteInText(chapterText, issue.quote, issue.suggestedRewrite.trim());
    if (replaced.status === 'ambiguous') {
      showNotice(
        'Đoạn văn xuất hiện nhiều lần',
        'Đoạn trích dẫn này khớp nhiều vị trí trong chương nên hệ thống không tự động thay thế. Vui lòng tự tìm và sửa trực tiếp đoạn bạn muốn trong văn bản chương.'
      );
      return;
    }
    if (replaced.status === 'not_found') {
      showNotice(
        'Không tìm thấy đoạn văn gốc',
        'Đoạn trích dẫn này có thể đã được bạn chỉnh sửa trước đó trong văn bản chương. Vui lòng kiểm tra lại hoặc bấm "Phân tích lại".'
      );
      return;
    }
    setChapterText(replaced.updatedText);
    // Đánh dấu kết quả phân tích đồ thị cần phân tích lại vì văn bản đã thay đổi so với snapshot
    if (hasAnalyzed) {
      setIsAnalysisStale(replaced.updatedText !== analyzedTextSnapshotRef.current);
    }
    setIssues((prev) =>
      prev.map((it) =>
        it.id === issue.id
          ? { ...it, applied: true, resolved: true, appliedRange: replaced.range }
          : it
      )
    );
  };

  // Hoàn tác đề xuất sửa đã áp dụng dựa trên đúng vị trí + ngữ cảnh xung quanh đã ghi nhận
  const handleUndoRewrite = (issue: EditableIssue) => {
    if (isLocked || !issue.applied || !issue.appliedRange) return;
    const revertedText = restoreAppliedRangeInText(chapterText, issue.appliedRange);
    if (revertedText === null) {
      showNotice(
        'Không thể hoàn tác tự động',
        'Đoạn văn hoặc ngữ cảnh xung quanh đã thay đổi nên không xác minh được vị trí hoàn tác duy nhất.'
      );
      return;
    }
    setChapterText(revertedText);
    if (hasAnalyzed) {
      setIsAnalysisStale(revertedText !== analyzedTextSnapshotRef.current);
    }
    setIssues((prev) =>
      prev.map((it) =>
        it.id === issue.id
          ? { ...it, applied: false, resolved: false, appliedRange: undefined }
          : it
      )
    );
  };

  const executeSaveToDatabase = async (options?: { saveChapterOnly?: boolean }) => {
    const saveChapterOnly = Boolean(options?.saveChapterOnly);
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
      const initialProject = await projectStore.getProject(projectId, {
        requireRemoteOrCache: true,
      });
      const initialNodes = initialProject.nodes || [];
      const latestChapters = getProjectChapters(initialProject);
      const nodesToSave = saveChapterOnly
        ? []
        : suggestedNodes.filter((n) => n.selected && n.name.trim());
      const eventsToSave = saveChapterOnly
        ? []
        : suggestedEvents.filter((e) => e.selected && e.name.trim());
      const activeStatusChanges = saveChapterOnly
        ? []
        : statusChanges.filter((s) => s.selected);

      // Xác định chương mục tiêu: chỉ tái sử dụng ID từ phiên lưu đang dở khi đúng số chương & tiêu đề
      let currentAttempt = activeSaveAttemptRef.current;
      let effectiveChapterNum = finalChapterNum;
      let effectiveTitle = finalTitle;
      let existingChapter: StoryChapter | undefined;

      if (currentAttempt) {
        const sameTarget =
          currentAttempt.chapterNumber === finalChapterNum &&
          currentAttempt.title.trim().toLocaleLowerCase('vi') ===
          finalTitle.toLocaleLowerCase('vi');
        if (sameTarget) {
          existingChapter = latestChapters.find((c) => c.id === currentAttempt!.chapterId);
        } else {
          const resumePrevious = await confirmAction(
            'Phiên lưu trước chưa hoàn tất',
            `Bạn đang có phiên lưu dở cho Chương ${currentAttempt.chapterNumber}: "${currentAttempt.title}".\n\nChọn "Tiếp tục phiên cũ" để hoàn tất chương đó, hoặc "Bắt đầu phiên mới" để lưu như một chương mới.`,
            'Tiếp tục phiên cũ',
            'Bắt đầu phiên mới'
          );
          if (resumePrevious) {
            effectiveChapterNum = currentAttempt.chapterNumber;
            effectiveTitle = currentAttempt.title;
            existingChapter = latestChapters.find((c) => c.id === currentAttempt!.chapterId);
          } else {
            activeSaveAttemptRef.current = null;
            currentAttempt = null;
          }
        }
      }

      // Phiên lưu mới: nếu số chương đã tồn tại trong dự án, yêu cầu xác nhận trước khi ghi đè
      if (!existingChapter) {
        const collidingChapter = latestChapters.find(
          (c) => Number(c.chapterNumber) === effectiveChapterNum
        );
        if (collidingChapter) {
          const confirmOverwrite = await confirmAction(
            'Số chương đã tồn tại',
            `Chương ${effectiveChapterNum} ("${collidingChapter.title}") đã tồn tại trong dự án.\n\nBạn có muốn ghi đè nội dung văn bản của chương này không? Nếu không, hãy hủy và đổi sang số chương khác.`,
            'Ghi đè chương này',
            'Đổi số chương'
          );
          if (!confirmOverwrite) {
            return;
          }
          existingChapter = collidingChapter;
        }
      }

      // Kiểm tra trước khi tạo chương: mọi cập nhật trạng thái nhân vật phải có mục tiêu hợp lệ
      if (activeStatusChanges.length > 0) {
        const existingCharKeys = new Set(
          initialNodes
            .filter((n) => n.type === 'character' && n.name)
            .map((n) => n.name.trim().toLocaleLowerCase('vi'))
        );
        const proposedCharKeys = new Set(
          nodesToSave
            .filter((n) => n.type === 'character' && n.name.trim())
            .map((n) => n.name.trim().toLocaleLowerCase('vi'))
        );
        const missingTargets = activeStatusChanges
          .filter((sc) => {
            const key = sc.characterName.trim().toLocaleLowerCase('vi');
            return !existingCharKeys.has(key) && !proposedCharKeys.has(key);
          })
          .map((sc) => sc.characterName);
        if (missingTargets.length > 0) {
          showNotice(
            'Không tìm thấy nhân vật mục tiêu',
            `Không thể cập nhật trạng thái cho: ${missingTargets.join(', ')}. Hãy bật chọn đề xuất nhân vật tương ứng hoặc bỏ chọn cập nhật trạng thái trước khi lưu.`
          );
          return;
        }
      }

      // Kiểm tra trước khi tạo chương: không tạo trùng node đầy đủ đã tồn tại trong đồ thị
      // Miễn trừ riêng các node đã được tạo/cập nhật trong chính phiên lưu retry này
      const committedNodeIdSet = new Set(
        Object.values(currentAttempt?.committedNodeIds || {})
      );
      const duplicateFullNodeNames: string[] = [];
      for (const item of nodesToSave) {
        const key = item.name.trim().toLocaleLowerCase('vi');
        const matchedFull = initialNodes.find(
          (n) =>
            n.type === item.type &&
            n.name.trim().toLocaleLowerCase('vi') === key &&
            n.autoCreatedStub !== true &&
            !committedNodeIdSet.has(n.id)
        );
        if (matchedFull) {
          duplicateFullNodeNames.push(`${item.name.trim()} (${ENTITY_TYPE_META[item.type].label})`);
        }
      }
      if (duplicateFullNodeNames.length > 0) {
        showNotice(
          'Thực thể đã tồn tại trong đồ thị',
          `Các node sau đã có đầy đủ trong dự án nên không thể tạo mới trùng lặp:\n- ${duplicateFullNodeNames.join('\n- ')}\n\nVui lòng bỏ chọn hoặc đổi tên các node này trước khi lưu.`
        );
        return;
      }

      // 1. Tạo hoặc cập nhật chương mục tiêu
      let savedChapter: StoryChapter;
      if (existingChapter) {
        savedChapter = existingChapter;
        await projectStore.updateChapterStoryContent(projectId, existingChapter.id, trimmedText);
      } else {
        savedChapter = await projectStore.createChapter(projectId, {
          chapterNumber: effectiveChapterNum,
          title: effectiveTitle,
          desc:
            (!saveChapterOnly && chapterSummary.trim()) ||
            `Nội dung chương ${effectiveChapterNum} (${wordCount} từ).`,
          content: trimmedText,
        });
      }
      if (
        !activeSaveAttemptRef.current ||
        activeSaveAttemptRef.current.chapterId !== savedChapter.id
      ) {
        activeSaveAttemptRef.current = {
          chapterId: savedChapter.id,
          chapterNumber: effectiveChapterNum,
          title: effectiveTitle,
          committedNodeIds: {},
          committedEventIds: {},
        };
      }
      const attempt = activeSaveAttemptRef.current;

      // 2. Tạo hoặc làm giàu nguyên tử các node thực thể được chọn (chỉ update khi vẫn là stub)
      let savedNodesCount = 0;
      for (const item of nodesToSave) {
        const latestProj = await projectStore.getProject(projectId);
        const alreadyCommittedNodeId = attempt.committedNodeIds[item.localId];
        if (
          alreadyCommittedNodeId &&
          (latestProj.nodes || []).some((n) => n.id === alreadyCommittedNodeId)
        ) {
          continue;
        }
        const normalizedName = item.name.trim();
        const existingMatch = (latestProj.nodes || []).find(
          (n) =>
            n.type === item.type &&
            n.name.trim().toLocaleLowerCase('vi') === normalizedName.toLocaleLowerCase('vi')
        );

        const payload: Partial<StoryNode> = {
          type: item.type,
          name: normalizedName,
          role: item.role.trim(),
          desc: item.desc.trim(),
          status: item.status.trim(),
          statusEvent: item.statusEvent.trim(),
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

        if (existingMatch) {
          if (existingMatch.autoCreatedStub === true) {
            try {
              const updatedNode = await projectStore.updateNode(
                projectId,
                existingMatch.id,
                payload,
                { onlyIfStub: true }
              );
              attempt.committedNodeIds[item.localId] = updatedNode.id;
              savedNodesCount += 1;
            } catch (stubErr) {
              // Nếu node đã trở thành node đầy đủ trong lúc ghi -> giữ nguyên, không ghi đè
              if (!(stubErr instanceof ApiError && stubErr.status === 409)) {
                throw stubErr;
              }
            }
          }
          // Nếu đã là node đầy đủ -> giữ nguyên, không tạo trùng
        } else {
          const createdNode = await projectStore.createNode(projectId, payload);
          attempt.committedNodeIds[item.localId] = createdNode.id;
          savedNodesCount += 1;
        }
      }

      // 3. Tạo hoặc tái sử dụng các node sự kiện theo localId của phiên lưu hiện tại (chỉ khớp chapter === savedChapter.id)
      let savedEventsCount = 0;
      for (const ev of eventsToSave) {
        const latestProj = await projectStore.getProject(projectId);
        const evName = ev.name.trim();
        const committedEventId = attempt.committedEventIds[ev.localId];
        const existingEvent = committedEventId
          ? (latestProj.nodes || []).find(
            (n) =>
              n.id === committedEventId &&
              n.type === 'event' &&
              n.chapter === savedChapter.id
          )
          : undefined;

        const targetEventNode =
          existingEvent ||
          (await projectStore.createNode(projectId, {
            type: 'event',
            name: evName,
            role: 'SỰ KIỆN',
            desc: ev.desc.trim() || `Sự kiện trong ${effectiveTitle}`,
            status: 'Đã diễn ra',
            chapter: savedChapter.id,
            location: ev.location.trim(),
            time: ev.time.trim(),
            impact: ev.impact.trim(),
            charactersInvolved: JSON.stringify(ev.charactersInvolved),
            autoCreatedStub: false,
          }));
        attempt.committedEventIds[ev.localId] = targetEventNode.id;

        await projectStore.assignEventToChapter(projectId, savedChapter.id, targetEventNode);
        savedEventsCount += 1;
      }

      // 4. Áp dụng các thay đổi trạng thái nhân vật được chọn (chỉ dùng statusEvent mới, báo nếu mục tiêu biến mất)
      const unappliedStatusChanges: string[] = [];
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
              statusEvent: sc.statusEvent.trim(),
            });
          } else {
            unappliedStatusChanges.push(`${sc.characterName} → ${sc.status}`);
          }
        }
      }

      const refreshedProject = await projectStore.getProject(projectId);
      setCurrentProject(refreshedProject);

      // Nếu còn cập nhật trạng thái chưa áp dụng được: giữ nguyên phiên lưu retry và số chương hiện tại
      if (unappliedStatusChanges.length > 0) {
        showNotice(
          'Lưu hoàn tất một phần',
          `Đã lưu chương "${effectiveTitle}", nhưng chưa thể cập nhật trạng thái cho nhân vật do không còn tồn tại trong đồ thị:\n- ${unappliedStatusChanges.join('\n- ')}\n\nBạn có thể chỉnh sửa và bấm lưu lại để hoàn tất trên cùng chương này.`
        );
        return;
      }

      const updatedChapters = getProjectChapters(refreshedProject);
      const nextNum =
        updatedChapters.length > 0
          ? Math.max(...updatedChapters.map((c) => Number(c.chapterNumber) || 0)) + 1
          : effectiveChapterNum + 1;
      chapterNumberTouchedRef.current = false;
      setChapterNumberInput(String(nextNum));
      activeSaveAttemptRef.current = null;

      setSaveSuccessInfo({
        chapterTitle: effectiveTitle,
        nodesCount: savedNodesCount,
        eventsCount: savedEventsCount,
      });

      router.replace({
        pathname: '/graph/events',
        params: { projectId: refreshedProject.id || projectId },
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
    if (isLocked) return;
    if (isAnalysisStale) {
      const staleMsg =
        'Văn bản chương đã thay đổi kể từ lần phân tích gần nhất nên kết quả phân tích trước đã cũ.\n\nBạn hãy bấm "Phân tích lại" để cập nhật đề xuất mới, hoặc chọn "Chỉ lưu văn bản chương" để lưu chương mà không áp dụng các node/sự kiện cũ.';
      if (Platform.OS === 'web') {
        if (window.confirm(`${staleMsg}\n\nNhấn OK để chỉ lưu văn bản chương (bỏ qua kết quả phân tích cũ).`)) {
          void executeSaveToDatabase({ saveChapterOnly: true });
        }
      } else {
        Alert.alert('Kết quả phân tích đã cũ', staleMsg, [
          { text: 'Phân tích lại', style: 'cancel', onPress: () => void handleAnalyze() },
          {
            text: 'Chỉ lưu văn bản chương',
            onPress: () => void executeSaveToDatabase({ saveChapterOnly: true }),
          },
        ]);
      }
      return;
    }
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
    const trimmedNewName = editingNode.name.trim();
    if (!trimmedNewName) {
      showNotice('Thiếu tên thực thể', 'Vui lòng nhập tên cho node đề xuất.');
      return;
    }
    const normalizedNode = { ...editingNode, name: trimmedNewName };
    if (isAddingNewNode) {
      setSuggestedNodes((prev) => [...prev, normalizedNode]);
    } else {
      const oldNameTrimmed = editingNodeOriginalName.trim();
      setSuggestedNodes((prev) =>
        prev.map((n) => (n.localId === normalizedNode.localId ? normalizedNode : n))
      );
      // Nếu đổi tên một nhân vật đề xuất, đồng bộ tên mới vào charactersInvolved của các sự kiện đề xuất
      // và cập nhật (hoặc hỏi xác nhận nếu mơ hồ) các mục statusChanges có liên quan
      if (
        normalizedNode.type === 'character' &&
        oldNameTrimmed &&
        oldNameTrimmed.toLocaleLowerCase('vi') !== trimmedNewName.toLocaleLowerCase('vi')
      ) {
        const oldKey = oldNameTrimmed.toLocaleLowerCase('vi');
        setSuggestedEvents((prev) =>
          prev.map((ev) => ({
            ...ev,
            charactersInvolved: Array.from(
              new Set(
                ev.charactersInvolved.map((participant) =>
                  participant.trim().toLocaleLowerCase('vi') === oldKey
                    ? trimmedNewName
                    : participant
                )
              )
            ),
          }))
        );

        const hasMatchingStatusChange = statusChanges.some(
          (sc) => sc.characterName.trim().toLocaleLowerCase('vi') === oldKey
        );
        if (hasMatchingStatusChange) {
          const existsOtherCharWithOldName =
            (currentProject.nodes || []).some(
              (n) =>
                n.type === 'character' &&
                n.name.trim().toLocaleLowerCase('vi') === oldKey
            ) ||
            suggestedNodes.some(
              (n) =>
                n.localId !== normalizedNode.localId &&
                n.type === 'character' &&
                n.name.trim().toLocaleLowerCase('vi') === oldKey
            );

          const retargetStatusChanges = () => {
            setStatusChanges((prev) =>
              prev.map((sc) =>
                sc.characterName.trim().toLocaleLowerCase('vi') === oldKey
                  ? { ...sc, characterName: trimmedNewName }
                  : sc
              )
            );
          };

          if (!existsOtherCharWithOldName) {
            retargetStatusChanges();
          } else {
            const confirmMsg = `Trong danh sách cập nhật trạng thái có mục đang nhắm tới "${oldNameTrimmed}", nhưng đồ thị vẫn còn nhân vật khác mang tên này.\n\nBạn có muốn chuyển các cập nhật trạng thái đó sang "${trimmedNewName}" không?`;
            if (Platform.OS === 'web') {
              if (window.confirm(confirmMsg)) {
                retargetStatusChanges();
              }
            } else {
              Alert.alert('Đồng bộ cập nhật trạng thái?', confirmMsg, [
                { text: 'Giữ tên cũ', style: 'cancel' },
                { text: `Đổi sang "${trimmedNewName}"`, onPress: retargetStatusChanges },
              ]);
            }
          }
        }
      }
    }
    setEditingNode(null);
    setEditingNodeOriginalName('');
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
    setCustomParticipantInput('');
  };

  const handleAddCustomParticipant = () => {
    const clean = customParticipantInput.trim();
    if (!clean || !editingEvent) return;
    if (!editingEvent.charactersInvolved.includes(clean)) {
      setEditingEvent({
        ...editingEvent,
        charactersInvolved: [...editingEvent.charactersInvolved, clean],
      });
    }
    setCustomParticipantInput('');
  };

  const handleResetWorkspace = () => {
    if (isLocked) return;
    setChapterTitle('');
    setChapterText('');
    setChapterSummary('');
    setIssues([]);
    setSuggestedNodes([]);
    setSuggestedEvents([]);
    setStatusChanges([]);
    setHasAnalyzed(false);
    setIsAnalysisStale(false);
    analyzedTextSnapshotRef.current = null;
    setContextOmissions(null);
    activeSaveAttemptRef.current = null;
    chapterNumberTouchedRef.current = false;
    setSaveSuccessInfo(null);
  };

  const contextOmissionSummary = useMemo(() => {
    if (!contextOmissions || contextOmissions.totalOmitted <= 0) return null;
    const parts: string[] = [];
    if (contextOmissions.omittedCharacters > 0) parts.push(`${contextOmissions.omittedCharacters} nhân vật`);
    if (contextOmissions.omittedLocations > 0) parts.push(`${contextOmissions.omittedLocations} địa điểm`);
    if (contextOmissions.omittedItems > 0) parts.push(`${contextOmissions.omittedItems} vật phẩm`);
    if (contextOmissions.omittedFactions > 0) parts.push(`${contextOmissions.omittedFactions} tổ chức`);
    if (contextOmissions.omittedEvents > 0) parts.push(`${contextOmissions.omittedEvents} sự kiện`);
    if (contextOmissions.omittedChapters > 0) parts.push(`${contextOmissions.omittedChapters} chương cũ`);
    if (contextOmissions.omittedLinks > 0) parts.push(`${contextOmissions.omittedLinks} liên kết`);
    return parts.join(', ');
  }, [contextOmissions]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.headerBar}>
        <View style={styles.headerLeftGroup}>
          <Pressable
            hitSlop={12}
            style={({ pressed }) => [
              styles.menuBtn,
              pressed && styles.menuBtnPressed,
              (isLocked || projectLoadState !== 'ready') && styles.btnDisabled,
            ]}
            onPress={() => setSidebarVisible(true)}
            disabled={isLocked || projectLoadState !== 'ready'}>
            <Text style={styles.menuBtnIcon}>☰</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Kiểm tra văn bản</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {projectLoadState === 'loading'
                ? 'Đang tải thông tin dự án...'
                : projectLoadState === 'error'
                  ? 'Không thể tải dự án'
                  : `${currentProject.title} · ${currentProject.nodes.length} NODE · ${getProjectChapters(currentProject).length} CHƯƠNG`}
            </Text>
          </View>
        </View>

        {hasAnalyzed && (
          <Pressable
            style={[styles.resetHeaderBtn, isLocked && styles.btnDisabled]}
            onPress={handleResetWorkspace}
            disabled={isLocked}>
            <Text style={styles.resetHeaderBtnText}>Viết mới</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {/* Banner trạng thái tải dự án */}
        {projectLoadState === 'loading' && (
          <View style={styles.infoBanner}>
            <ActivityIndicator size="small" color="#e5a93c" />
            <Text style={styles.infoBannerText}>Đang tải dữ liệu đồ thị của dự án...</Text>
          </View>
        )}

        {projectLoadState === 'error' && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>
              ⚠️ {projectLoadError || 'Không thể tải dự án này.'}
            </Text>
            <Pressable style={styles.retryLoadBtn} onPress={() => void loadProject()}>
              <Text style={styles.retryLoadBtnText}>Thử lại</Text>
            </Pressable>
          </View>
        )}

        {/* Banner cảnh báo kết quả phân tích đã lỗi thời sau khi chỉnh sửa văn bản */}
        {hasAnalyzed && isAnalysisStale && (
          <View style={styles.staleBanner}>
            <Text style={styles.staleBannerText}>
              ⚠️ Văn bản chương đã thay đổi kể từ lần phân tích gần nhất. Hãy bấm "Phân tích & Kiểm
              tra lại" trước khi lưu node/sự kiện để tránh lưu đề xuất cũ.
            </Text>
          </View>
        )}

        {/* Banner thông báo phần bối cảnh đồ thị bị rút gọn khi gửi AI */}
        {hasAnalyzed && contextOmissionSummary && (
          <View style={styles.infoBanner}>
            <Text style={styles.infoBannerText}>
              ℹ️ Do giới hạn ngữ cảnh AI, lần phân tích này đã lược bớt: {contextOmissionSummary}.
            </Text>
          </View>
        )}

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
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>01 · NHẬP CHƯƠNG TỰ VIẾT</Text>
            {isAnalyzing && (
              <Text style={styles.analyzingLockHint}>🔒 Đang phân tích, tạm khóa nhập liệu...</Text>
            )}
          </View>
          <View style={styles.chapterMetaRow}>
            <View style={{ width: 92 }}>
              <Text style={styles.fieldLabel}>Số chương</Text>
              <TextInput
                style={[styles.input, isLocked && styles.inputLocked]}
                value={chapterNumberInput}
                onChangeText={(val) => {
                  chapterNumberTouchedRef.current = true;
                  setChapterNumberInput(val);
                }}
                keyboardType="number-pad"
                editable={!isLocked}
                placeholder="1"
                placeholderTextColor="#6d6253"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Tiêu đề chương</Text>
              <TextInput
                style={[styles.input, isLocked && styles.inputLocked]}
                value={chapterTitle}
                onChangeText={setChapterTitle}
                editable={!isLocked}
                placeholder="VD: Chương 4: Bóng tối dưới tháp cổ"
                placeholderTextColor="#6d6253"
              />
            </View>
          </View>

          <View style={styles.fieldHeaderRow}>
            <Text style={styles.fieldLabel}>Nội dung văn bản chương</Text>
            <Text style={styles.wordCountText}>
              {wordCount} từ · {chapterText.length.toLocaleString('vi-VN')}/40.000 ký tự
            </Text>
          </View>
          <TextInput
            style={[styles.input, styles.chapterTextArea, isLocked && styles.inputLocked]}
            value={chapterText}
            onChangeText={handleChapterTextChange}
            multiline
            editable={!isLocked}
            textAlignVertical="top"
            placeholder="Dán hoặc tự viết nội dung chương truyện tại đây (tối đa 40.000 ký tự)...&#10;&#10;AI sẽ đối chiếu với bối cảnh đồ thị được chọn của dự án (nhân vật, địa điểm, vật phẩm, tổ chức, sự kiện và các chương gần nhất; một phần dữ liệu lớn có thể được lược bớt) để bắt lỗi logic, đề xuất viết lại và trích xuất node & sự kiện mới."
            placeholderTextColor="#6d6253"
          />

          <Pressable
            style={[styles.primaryBtn, (isLocked || !chapterText.trim()) && styles.btnDisabled]}
            onPress={handleAnalyze}
            disabled={isLocked || !chapterText.trim()}>
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
                style={[styles.input, { minHeight: 72 }, isLocked && styles.inputLocked]}
                value={chapterSummary}
                onChangeText={setChapterSummary}
                multiline
                editable={!isLocked}
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
                      disabled={isLocked}
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
                            disabled={isLocked}
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
                            <Text style={styles.quoteLabel}>Đoạn gốc trong chương:</Text>
                            <Text style={styles.quoteText}>"{issue.quote}"</Text>
                          </View>
                        )}

                        {!!issue.explanation && (
                          <Text style={styles.issueExplanation}>{issue.explanation}</Text>
                        )}

                        {!!issue.suggestion && (
                          <Text style={styles.issueSuggestion}>
                            💡 Hướng xử lý: {issue.suggestion}
                          </Text>
                        )}

                        {/* Đề xuất sửa trực tiếp của AI + nút Chấp nhận thay vào văn bản gốc */}
                        {!!issue.suggestedRewrite && (
                          <View style={styles.rewriteBox}>
                            <Text style={styles.rewriteLabel}>✨ Đề xuất sửa của AI:</Text>
                            <Text style={styles.rewriteText}>"{issue.suggestedRewrite}"</Text>
                            <View style={styles.rewriteActionsRow}>
                              {!issue.applied ? (
                                <Pressable
                                  style={[
                                    styles.acceptRewriteBtn,
                                    (isLocked || !issue.quote.trim()) && styles.btnDisabled,
                                  ]}
                                  disabled={isLocked || !issue.quote.trim()}
                                  onPress={() => handleAcceptRewrite(issue)}>
                                  <Text style={styles.acceptRewriteBtnText}>
                                    ✓ Chấp nhận đề xuất
                                  </Text>
                                </Pressable>
                              ) : (
                                <View style={styles.appliedRow}>
                                  <Text style={styles.appliedBadgeText}>
                                    ✅ Đã thay vào văn bản gốc
                                  </Text>
                                  <Pressable
                                    style={styles.undoRewriteBtn}
                                    disabled={isLocked}
                                    onPress={() => handleUndoRewrite(issue)}>
                                    <Text style={styles.undoRewriteBtnText}>↩ Hoàn tác</Text>
                                  </Pressable>
                                </View>
                              )}
                            </View>
                          </View>
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
                    style={[styles.addSmallBtn, isLocked && styles.btnDisabled]}
                    disabled={isLocked}
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
                            disabled={isLocked}
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
                            disabled={isLocked}
                            onPress={() => {
                              setIsAddingNewNode(false);
                              setEditingNodeOriginalName(node.name);
                              setEditingNode({ ...node });
                            }}>
                            <Text style={styles.editMiniBtnText}>✏️ Sửa</Text>
                          </Pressable>
                          <Pressable
                            style={styles.deleteMiniBtn}
                            disabled={isLocked}
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
                    style={[styles.addSmallBtn, isLocked && styles.btnDisabled]}
                    disabled={isLocked}
                    onPress={() => {
                      setIsAddingNewEvent(true);
                      setEditingEvent(createEmptySuggestedEvent());
                      setCustomParticipantInput('');
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
                          disabled={isLocked}
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
                          disabled={isLocked}
                          onPress={() => {
                            setIsAddingNewEvent(false);
                            setEditingEvent({
                              ...ev,
                              charactersInvolved: [...ev.charactersInvolved],
                            });
                            setCustomParticipantInput('');
                          }}>
                          <Text style={styles.editMiniBtnText}>✏️ Sửa</Text>
                        </Pressable>
                        <Pressable
                          style={styles.deleteMiniBtn}
                          disabled={isLocked}
                          onPress={() =>
                            setSuggestedEvents((prev) =>
                              prev.filter((item) => item.localId !== ev.localId)
                            )
                          }>
                          <Text style={styles.deleteMiniBtnText}>✕</Text>
                        </Pressable>
                      </View>
                      {!!ev.desc && <Text style={styles.suggestionDesc}>{ev.desc}</Text>}
                      {ev.charactersInvolved.length > 0 && (
                        <Text style={styles.eventCharsText}>
                          👥 Nhân vật: {ev.charactersInvolved.join(', ')}
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
              {isAnalysisStale
                ? 'Kết quả phân tích đã cũ'
                : `Lưu 1 chương · ${selectedNodesCount} node · ${selectedEventsCount} sự kiện`}
            </Text>
            <Text style={styles.bottomBarSub}>
              {isAnalysisStale
                ? 'Hãy phân tích lại hoặc bấm lưu để chỉ lưu văn bản chương'
                : unresolvedErrorCount > 0
                  ? `Còn ${unresolvedErrorCount} lỗi nghiêm trọng chưa xử lý`
                  : 'Sẵn sàng lưu vào đồ thị và Chi tiết chương'}
            </Text>
          </View>
          <Pressable
            style={[styles.saveBtn, isLocked && styles.btnDisabled]}
            onPress={handleSavePress}
            disabled={isLocked}>
            {isSaving ? (
              <ActivityIndicator size="small" color="#12100d" />
            ) : (
              <Text style={styles.saveBtnText}>💾 Lưu đồ thị & Chương</Text>
            )}
          </Pressable>
        </View>
      )}

      {/* Modal chỉnh sửa Node đề xuất — Tái sử dụng chuẩn form & options của dự án (graph/index.tsx) */}
      <Modal
        visible={editingNode !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingNode(null)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {isAddingNewNode ? 'Tạo Thực Thể Mới' : 'Chỉnh Sửa Thực Thể'}
            </Text>
            {editingNode && (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 490 }}>
                <Text style={styles.fieldLabel}>Phân loại thực thể</Text>
                <View style={styles.typeChipsRow}>
                  {(['character', 'item', 'location', 'faction'] as EntityType[]).map((t) => {
                    const meta = ENTITY_TYPE_META[t];
                    const active = editingNode.type === t;
                    return (
                      <Pressable
                        key={t}
                        style={[styles.typeChip, active && styles.typeChipActive]}
                        onPress={() => {
                          if (editingNode.type === t) return;
                          setEditingNode({
                            ...editingNode,
                            type: t,
                            status:
                              t === 'character'
                                ? 'Còn sống'
                                : t === 'item'
                                  ? 'Nguyên vẹn'
                                  : t === 'faction'
                                    ? 'Đang hoạt động'
                                    : 'Hoạt động',
                          });
                        }}>
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
                  placeholder={
                    editingNode.type === 'character'
                      ? 'Ví dụ: Lăng Tiêu'
                      : editingNode.type === 'item'
                        ? 'Ví dụ: Hồ Sơ Hoàng Hôn'
                        : editingNode.type === 'location'
                          ? 'Ví dụ: Thành phố Bắc Nguyệt'
                          : 'Ví dụ: Tập đoàn Thiên Hạ'
                  }
                  placeholderTextColor="#6d6253"
                />

                {/* ============ THÔNG TIN NHÂN VẬT ============ */}
                {editingNode.type === 'character' && (
                  <View style={styles.dynamicSectionBox}>
                    <Text style={styles.dynamicSectionHeader}>THÔNG TIN NHÂN VẬT</Text>

                    <Text style={styles.fieldLabel}>Vai trò / Nhãn</Text>
                    <TextInput
                      style={styles.input}
                      value={editingNode.role}
                      onChangeText={(v) => setEditingNode({ ...editingNode, role: v })}
                      placeholder="Ví dụ: NHÂN VẬT CHÍNH"
                      placeholderTextColor="#6d6253"
                    />

                    <Text style={styles.fieldLabel}>Phân loại phụ (Nghề nghiệp)</Text>
                    <FormSelectField
                      value={editingNode.subType}
                      onChange={(v) => setEditingNode({ ...editingNode, subType: v })}
                      options={CHARACTER_PROFESSIONS.map((p) => ({
                        label: p,
                        value: p,
                        icon: '🎭',
                      }))}
                      allowCustom
                      placeholder="-- Chọn nghề nghiệp --"
                      customPlaceholder="Tự nhập nghề nghiệp khác..."
                    />

                    <Text style={styles.fieldLabel}>Trạng thái hiện tại</Text>
                    <FormSelectField
                      value={editingNode.status}
                      onChange={(v) => setEditingNode({ ...editingNode, status: v })}
                      options={CHARACTER_STATUS_OPTIONS}
                      placeholder="-- Chọn trạng thái --"
                    />

                    {(editingNode.status === 'Đã chết' || editingNode.status === 'Hồi sinh') && (
                      <>
                        <Text style={styles.fieldLabel}>
                          Sự kiện {editingNode.status === 'Đã chết' ? 'tử nạn' : 'hồi sinh'}
                        </Text>
                        <FormSelectField
                          value={editingNode.statusEvent}
                          onChange={(v) => setEditingNode({ ...editingNode, statusEvent: v })}
                          options={eventOptions}
                          allowCustom
                          placeholder="-- Chọn hoặc bỏ trống --"
                          customPlaceholder="Nhập tên sự kiện mới..."
                        />
                      </>
                    )}

                    <Text style={styles.fieldLabel}>Ngày sinh</Text>
                    <DatePickerField
                      value={editingNode.dob}
                      onChange={(v) => setEditingNode({ ...editingNode, dob: v })}
                      placeholder="Chọn ngày sinh"
                    />

                    <Text style={styles.fieldLabel}>Nơi sinh ra</Text>
                    <FormSelectField
                      value={editingNode.birthplace}
                      onChange={(v) => setEditingNode({ ...editingNode, birthplace: v })}
                      options={locationOptions}
                      allowCustom
                      placeholder="-- Chọn địa điểm hoặc bỏ trống --"
                      customPlaceholder="Nhập tên địa điểm mới..."
                    />

                    <Text style={styles.fieldLabel}>Giới tính</Text>
                    <FormSelectField
                      value={editingNode.gender}
                      onChange={(v) => setEditingNode({ ...editingNode, gender: v })}
                      options={GENDER_OPTIONS}
                      placeholder="-- Chọn giới tính --"
                    />

                    <Text style={styles.fieldLabel}>Vật dụng / Vật phẩm</Text>
                    <FormSelectField
                      value={editingNode.weapon}
                      onChange={(v) => setEditingNode({ ...editingNode, weapon: v })}
                      options={itemOptions}
                      allowCustom
                      placeholder="-- Chọn vật phẩm hoặc bỏ trống --"
                      customPlaceholder="Nhập tên vật phẩm mới..."
                    />

                    <Text style={styles.fieldLabel}>Tổ chức / Nhóm</Text>
                    <FormSelectField
                      value={editingNode.sect}
                      onChange={(v) => setEditingNode({ ...editingNode, sect: v })}
                      options={factionOptions}
                      allowCustom
                      placeholder="-- Chọn tổ chức hoặc bỏ trống --"
                      customPlaceholder="Nhập tên tổ chức mới..."
                    />

                    <Text style={styles.fieldLabel}>Tính cách</Text>
                    <TextInput
                      style={styles.input}
                      value={editingNode.personality}
                      onChangeText={(v) => setEditingNode({ ...editingNode, personality: v })}
                      placeholder="Ví dụ: Trầm mặc, kiên định"
                      placeholderTextColor="#6d6253"
                    />
                  </View>
                )}

                {/* ============ THÔNG TIN VẬT PHẨM ============ */}
                {editingNode.type === 'item' && (
                  <View style={styles.dynamicSectionBox}>
                    <Text style={[styles.dynamicSectionHeader, { color: '#42b883' }]}>
                      THÔNG TIN VẬT PHẨM
                    </Text>

                    <Text style={styles.fieldLabel}>Độ hiếm</Text>
                    <FormSelectField
                      value={editingNode.rarity}
                      onChange={(v) => setEditingNode({ ...editingNode, rarity: v, role: v })}
                      options={ITEM_RARITY_OPTIONS}
                      allowCustom
                      placeholder="-- Chọn độ hiếm --"
                      customPlaceholder="Nhập độ hiếm khác..."
                    />

                    <Text style={styles.fieldLabel}>Nguồn gốc xuất xứ</Text>
                    <FormSelectField
                      value={editingNode.origin}
                      onChange={(v) => setEditingNode({ ...editingNode, origin: v })}
                      options={locationOptions}
                      allowCustom
                      placeholder="-- Chọn nguồn gốc hoặc bỏ trống --"
                      customPlaceholder="Nhập tên địa danh mới..."
                    />

                    <Text style={styles.fieldLabel}>Người sở hữu / Nắm giữ</Text>
                    <FormSelectField
                      value={editingNode.holderOrLocation}
                      onChange={(v) => setEditingNode({ ...editingNode, holderOrLocation: v })}
                      options={characterOptions}
                      allowCustom
                      placeholder="-- Chọn người sở hữu hoặc bỏ trống --"
                      customPlaceholder="Nhập tên nhân vật mới..."
                    />
                  </View>
                )}

                {/* ============ THÔNG TIN ĐỊA ĐIỂM ============ */}
                {editingNode.type === 'location' && (
                  <View style={styles.dynamicSectionBox}>
                    <Text style={[styles.dynamicSectionHeader, { color: '#9f70cf' }]}>
                      THÔNG TIN ĐỊA DANH / ĐỊA ĐIỂM
                    </Text>

                    <Text style={styles.fieldLabel}>Khu vực / Phương hướng</Text>
                    <FormSelectField
                      value={editingNode.region}
                      onChange={(v) => setEditingNode({ ...editingNode, region: v })}
                      options={LOCATION_REGION_OPTIONS}
                      allowCustom
                      placeholder="-- Chọn khu vực --"
                      customPlaceholder="Nhập khu vực khác..."
                    />

                    <Text style={styles.fieldLabel}>Mức độ nguy hiểm</Text>
                    <FormSelectField
                      value={editingNode.dangerLevel}
                      onChange={(v) => setEditingNode({ ...editingNode, dangerLevel: v })}
                      options={LOCATION_DANGER_OPTIONS}
                      placeholder="-- Chọn mức độ nguy hiểm --"
                    />

                    <Text style={styles.fieldLabel}>Khí hậu đặc trưng</Text>
                    <FormSelectField
                      value={editingNode.climate}
                      onChange={(v) => setEditingNode({ ...editingNode, climate: v })}
                      options={LOCATION_CLIMATE_OPTIONS}
                      allowCustom
                      placeholder="-- Chọn khí hậu --"
                      customPlaceholder="Nhập khí hậu khác..."
                    />

                    <Text style={styles.fieldLabel}>Thế lực cai quản</Text>
                    <FormSelectField
                      value={editingNode.ruler}
                      onChange={(v) => setEditingNode({ ...editingNode, ruler: v })}
                      options={factionOptions}
                      allowCustom
                      placeholder="-- Chọn thế lực hoặc bỏ trống --"
                      customPlaceholder="Nhập tên thế lực mới..."
                    />
                  </View>
                )}

                {/* ============ THÔNG TIN TỔ CHỨC ============ */}
                {editingNode.type === 'faction' && (
                  <View style={styles.dynamicSectionBox}>
                    <Text style={[styles.dynamicSectionHeader, { color: '#d95a38' }]}>
                      THÔNG TIN TỔ CHỨC
                    </Text>

                    <Text style={styles.fieldLabel}>Vai trò trong câu chuyện</Text>
                    <FormSelectField
                      value={editingNode.subType}
                      onChange={(v) => setEditingNode({ ...editingNode, subType: v })}
                      options={FACTION_CLASSIFICATIONS}
                      placeholder="-- Chọn vai trò --"
                    />

                    <Text style={styles.fieldLabel}>Trạng thái tổ chức</Text>
                    <FormSelectField
                      value={editingNode.status}
                      onChange={(v) => setEditingNode({ ...editingNode, status: v })}
                      options={FACTION_STATUS_OPTIONS}
                      placeholder="-- Chọn trạng thái --"
                    />

                    {(editingNode.status === 'Tạm ngừng' || editingNode.status === 'Suy tàn') && (
                      <>
                        <Text style={styles.fieldLabel}>Sự kiện dẫn đến thay đổi trạng thái</Text>
                        <FormSelectField
                          value={editingNode.statusEvent}
                          onChange={(v) => setEditingNode({ ...editingNode, statusEvent: v })}
                          options={eventOptions}
                          allowCustom
                          placeholder="-- Chọn hoặc bỏ trống --"
                          customPlaceholder="Nhập tên sự kiện mới..."
                        />
                      </>
                    )}

                    <Text style={styles.fieldLabel}>Người đại diện / Thủ lĩnh</Text>
                    <FormSelectField
                      value={editingNode.leader}
                      onChange={(v) => setEditingNode({ ...editingNode, leader: v })}
                      options={characterOptions}
                      allowCustom
                      placeholder="-- Chọn thủ lĩnh hoặc bỏ trống --"
                      customPlaceholder="Nhập tên thủ lĩnh mới..."
                    />

                    <Text style={styles.fieldLabel}>Trụ sở / Cơ sở</Text>
                    <FormSelectField
                      value={editingNode.headquarters}
                      onChange={(v) => setEditingNode({ ...editingNode, headquarters: v })}
                      options={locationOptions}
                      allowCustom
                      placeholder="-- Chọn căn cứ hoặc bỏ trống --"
                      customPlaceholder="Nhập tên căn cứ mới..."
                    />

                    <Text style={styles.fieldLabel}>Tôn chỉ</Text>
                    <TextInput
                      style={styles.input}
                      value={editingNode.motto}
                      onChangeText={(v) => setEditingNode({ ...editingNode, motto: v })}
                      placeholder="Ví dụ: nghiên cứu, hỗ trợ cộng đồng, kinh doanh..."
                      placeholderTextColor="#6d6253"
                    />
                  </View>
                )}

                <Text style={styles.fieldLabel}>Mô tả chi tiết</Text>
                <TextInput
                  style={[styles.input, { minHeight: 80 }]}
                  value={editingNode.desc}
                  onChangeText={(v) => setEditingNode({ ...editingNode, desc: v })}
                  multiline
                  textAlignVertical="top"
                  placeholder="Ghi chú bối cảnh, lai lịch, cốt truyện liên quan..."
                  placeholderTextColor="#6d6253"
                />
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
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal chỉnh sửa Sự kiện đề xuất — Tái sử dụng chuẩn form sự kiện của dự án (graph/index.tsx) */}
      <Modal
        visible={editingEvent !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingEvent(null)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {isAddingNewEvent ? 'Thêm Biến Cố / Sự Kiện' : 'Chỉnh Sửa Sự Kiện'}
            </Text>
            {editingEvent && (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 490 }}>
                <Text style={styles.fieldLabel}>Tên sự kiện *</Text>
                <TextInput
                  style={styles.input}
                  value={editingEvent.name}
                  onChangeText={(v) => setEditingEvent({ ...editingEvent, name: v })}
                  placeholder="Ví dụ: Đêm Hỏa Thiêu"
                  placeholderTextColor="#6d6253"
                />

                <View style={styles.dynamicSectionBox}>
                  <Text style={[styles.dynamicSectionHeader, { color: '#5b8ec2' }]}>
                    THÔNG TIN BIẾN CỐ / SỰ KIỆN
                  </Text>

                  <Text style={styles.fieldLabel}>Nơi diễn ra</Text>
                  <FormSelectField
                    value={editingEvent.location}
                    onChange={(v) => setEditingEvent({ ...editingEvent, location: v })}
                    options={locationOptions}
                    allowCustom
                    placeholder="-- Chọn nơi diễn ra hoặc bỏ trống --"
                    customPlaceholder="Nhập tên địa điểm mới để tự tạo node..."
                  />

                  <Text style={styles.fieldLabel}>Thời điểm diễn ra</Text>
                  <TextInput
                    style={styles.input}
                    value={editingEvent.time}
                    onChangeText={(v) => setEditingEvent({ ...editingEvent, time: v })}
                    placeholder="VD: Đầu chương / Đêm khuya / Khi trăng tròn"
                    placeholderTextColor="#6d6253"
                  />

                  <Text style={styles.fieldLabel}>Nhân vật tham gia</Text>
                  {characterOptions.length > 0 ? (
                    <View style={styles.eventCharacterOptions}>
                      {characterOptions.map((ch) => {
                        const isSelected = editingEvent.charactersInvolved.includes(ch.value);
                        return (
                          <Pressable
                            key={ch.value}
                            style={[
                              styles.eventCharacterChip,
                              isSelected && styles.eventCharacterChipSelected,
                            ]}
                            onPress={() =>
                              setEditingEvent({
                                ...editingEvent,
                                charactersInvolved: isSelected
                                  ? editingEvent.charactersInvolved.filter((n) => n !== ch.value)
                                  : [...editingEvent.charactersInvolved, ch.value],
                              })
                            }
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: isSelected }}>
                            <Text
                              style={[
                                styles.eventCharacterChipText,
                                isSelected && styles.eventCharacterChipTextSelected,
                              ]}>
                              {isSelected ? '✓ ' : ''}
                              {ch.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.eventCharacterEmpty}>
                      Chưa có node nhân vật nào trong dự án.
                    </Text>
                  )}

                  {/* Các nhân vật tùy chỉnh ngoài danh sách hiện có */}
                  {editingEvent.charactersInvolved
                    .filter((name) => !characterOptions.some((o) => o.value === name))
                    .length > 0 && (
                      <View style={[styles.eventCharacterOptions, { marginTop: 6 }]}>
                        {editingEvent.charactersInvolved
                          .filter((name) => !characterOptions.some((o) => o.value === name))
                          .map((customName) => (
                            <Pressable
                              key={customName}
                              style={[styles.eventCharacterChip, styles.eventCharacterChipSelected]}
                              onPress={() =>
                                setEditingEvent({
                                  ...editingEvent,
                                  charactersInvolved: editingEvent.charactersInvolved.filter(
                                    (n) => n !== customName
                                  ),
                                })
                              }>
                              <Text
                                style={[
                                  styles.eventCharacterChipText,
                                  styles.eventCharacterChipTextSelected,
                                ]}>
                                ✓ {customName} ✕
                              </Text>
                            </Pressable>
                          ))}
                      </View>
                    )}

                  <View style={styles.customParticipantRow}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginBottom: 0 }]}
                      value={customParticipantInput}
                      onChangeText={setCustomParticipantInput}
                      placeholder="Thêm tên nhân vật khác..."
                      placeholderTextColor="#6d6253"
                      onSubmitEditing={handleAddCustomParticipant}
                    />
                    <Pressable style={styles.addSmallBtn} onPress={handleAddCustomParticipant}>
                      <Text style={styles.addSmallBtnText}>+ Thêm</Text>
                    </Pressable>
                  </View>

                  <Text style={styles.fieldLabel}>Tác động / Hậu quả</Text>
                  <TextInput
                    style={styles.input}
                    value={editingEvent.impact}
                    onChangeText={(v) => setEditingEvent({ ...editingEvent, impact: v })}
                    placeholder="Hệ quả sau sự kiện..."
                    placeholderTextColor="#6d6253"
                  />
                </View>

                <Text style={styles.fieldLabel}>Mô tả chi tiết</Text>
                <TextInput
                  style={[styles.input, { minHeight: 80 }]}
                  value={editingEvent.desc}
                  onChangeText={(v) => setEditingEvent({ ...editingEvent, desc: v })}
                  multiline
                  textAlignVertical="top"
                  placeholder="Mô tả chi tiết diễn biến sự kiện..."
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
                  setCustomParticipantInput('');
                }}>
                <Text style={styles.modalCancelBtnText}>Hủy</Text>
              </Pressable>
              <Pressable style={styles.modalSaveBtn} onPress={handleCommitEventEdit}>
                <Text style={styles.modalSaveBtnText}>Áp dụng</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  sectionLabel: {
    color: '#e5a93c',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  analyzingLockHint: {
    color: '#e5a93c',
    fontSize: 11,
    fontWeight: '600',
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
    marginTop: 6,
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
  inputLocked: {
    opacity: 0.6,
    backgroundColor: '#171410',
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
    opacity: 0.5,
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
    borderLeftColor: '#d97a6c',
    paddingLeft: 10,
    paddingVertical: 6,
    paddingRight: 8,
    backgroundColor: 'rgba(0,0,0,0.24)',
    borderRadius: 6,
    gap: 2,
  },
  quoteLabel: {
    color: '#c99c95',
    fontSize: 11,
    fontWeight: '600',
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
  rewriteBox: {
    borderLeftWidth: 3,
    borderLeftColor: '#42b883',
    backgroundColor: '#12211a',
    borderRadius: 8,
    padding: 10,
    gap: 6,
  },
  rewriteLabel: {
    color: '#7fe0b2',
    fontSize: 11,
    fontWeight: '700',
  },
  rewriteText: {
    color: '#dcf5e8',
    fontSize: 13,
    lineHeight: 19,
  },
  rewriteActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 2,
  },
  acceptRewriteBtn: {
    backgroundColor: '#2d8a61',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  acceptRewriteBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  appliedRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  appliedBadgeText: {
    color: '#7fe0b2',
    fontSize: 12,
    fontWeight: '600',
  },
  undoRewriteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4b6e5c',
    backgroundColor: '#172b22',
  },
  undoRewriteBtnText: {
    color: '#c4e6d5',
    fontSize: 11,
    fontWeight: '600',
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
    paddingVertical: 8,
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
    opacity: 0.52,
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
    padding: 16,
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
  dynamicSectionBox: {
    backgroundColor: '#14110e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2b241c',
    padding: 12,
    marginTop: 6,
    marginBottom: 8,
  },
  dynamicSectionHeader: {
    color: '#e5a93c',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
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
  eventCharacterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  eventCharacterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#3a3228',
    backgroundColor: '#181410',
  },
  eventCharacterChipSelected: {
    borderColor: '#e5a93c',
    backgroundColor: '#2c2315',
  },
  eventCharacterChipText: {
    color: '#a89a86',
    fontSize: 12,
    fontWeight: '600',
  },
  eventCharacterChipTextSelected: {
    color: '#f5c76b',
  },
  eventCharacterEmpty: {
    color: '#807464',
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  customParticipantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
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
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#162129',
    borderWidth: 1,
    borderColor: '#2d516b',
    borderRadius: 12,
    padding: 12,
  },
  infoBannerText: {
    flex: 1,
    color: '#b9dbf2',
    fontSize: 12,
    lineHeight: 18,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: '#2b1614',
    borderWidth: 1,
    borderColor: '#7a2f28',
    borderRadius: 12,
    padding: 12,
  },
  errorBannerText: {
    flex: 1,
    color: '#f5b0a8',
    fontSize: 12,
    lineHeight: 18,
  },
  retryLoadBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5a93c',
    backgroundColor: '#241d13',
  },
  retryLoadBtnText: {
    color: '#e5a93c',
    fontSize: 12,
    fontWeight: '700',
  },
  staleBanner: {
    backgroundColor: '#292113',
    borderWidth: 1,
    borderColor: '#755622',
    borderRadius: 12,
    padding: 12,
  },
  staleBannerText: {
    color: '#f3d28e',
    fontSize: 12,
    lineHeight: 18,
  },
});
