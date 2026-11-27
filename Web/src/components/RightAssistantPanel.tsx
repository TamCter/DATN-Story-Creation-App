import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookMarked,
  Check,
  CheckCircle2,
  Copy,
  CornerDownLeft,
  Info,
  Link2,
  Loader2,
  MessageSquare,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { webApi } from '../services/api';
import type {
  AIChatMessage,
  AuthUser,
  ChapterAnalysisIssue,
  ChapterAnalysisResult,
  StoryChapter,
  StoryLink,
  StoryNode,
  StoryNodeType,
  StoryProject,
} from '../types/story';

interface RightAssistantPanelProps {
  user: AuthUser | null;
  activeProject: StoryProject | null;
  activeChapter: StoryChapter | null;
  chapters: StoryChapter[];
  nodes: StoryNode[];
  links: StoryLink[];
  hidden?: boolean;
  onInsertText: (text: string, expectedChapterId?: string) => boolean;
  onReplaceQuote: (quote: string, replacement: string, expectedChapterId?: string) => boolean;
  onRefreshGraph: () => Promise<void>;
  onAnalyzingChange?: (analyzing: boolean) => void;
  onOpenAuth: () => void;
  onNotify: (msg: string) => void;
  onClose?: () => void;
}

const NODE_TYPE_LABELS: Record<StoryNodeType | 'all', string> = {
  all: 'Tất cả',
  character: 'Nhân vật',
  faction: 'Tổ chức',
  location: 'Địa điểm',
  item: 'Vật phẩm',
  event: 'Sự kiện',
};

const NODE_TYPE_COLORS: Record<StoryNodeType, string> = {
  character: 'var(--node-character)',
  faction: 'var(--node-faction)',
  location: 'var(--node-location)',
  item: 'var(--node-item)',
  event: 'var(--node-event)',
};

export const RightAssistantPanel: React.FC<RightAssistantPanelProps> = ({
  user,
  activeProject,
  activeChapter,
  chapters,
  nodes,
  links,
  hidden = false,
  onInsertText,
  onReplaceQuote,
  onRefreshGraph,
  onAnalyzingChange,
  onOpenAuth,
  onNotify,
  onClose,
}) => {
  const [tab, setTab] = useState<'checker' | 'chat' | 'world'>('checker');

  const projectKey = activeProject?.id || '__none__';
  const activeChapterId = activeChapter?.id || null;
  const activeChapterIdRef = useRef<string | null>(activeChapterId);
  activeChapterIdRef.current = activeChapterId;

  // Checker state (scoped to active chapter)
  const [analyzingChapterId, setAnalyzingChapterId] = useState<string | null>(null);
  const [analysisState, setAnalysisState] = useState<{
    analysisId: number;
    chapterId: string;
    result: ChapterAnalysisResult;
  } | null>(null);
  const analysisStateRef = useRef(analysisState);
  analysisStateRef.current = analysisState;
  const [appliedIssueIds, setAppliedIssueIds] = useState<Set<string>>(() => new Set());
  const [selectedNodeIdxs, setSelectedNodeIdxs] = useState<Set<number>>(() => new Set());
  const [selectedEventIdxs, setSelectedEventIdxs] = useState<Set<number>>(() => new Set());
  const [selectedStatusIdxs, setSelectedStatusIdxs] = useState<Set<number>>(() => new Set());
  const [savingExtracted, setSavingExtracted] = useState(false);
  const [savedExtractedDone, setSavedExtractedDone] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const analysisReqRef = useRef(0);
  const savedKeysByAnalysisRef = useRef<Map<number, Set<string>>>(new Map());
  const savedNodesByAnalysisRef = useRef<Map<number, StoryNode[]>>(new Map());

  // Chat state (scoped per project)
  const [chatByProject, setChatByProject] = useState<Record<string, AIChatMessage[]>>({});
  const [chatInput, setChatInput] = useState('');
  const [chatLoadingByProject, setChatLoadingByProject] = useState<Record<string, boolean>>({});

  // World lookup state
  const [worldQuery, setWorldQuery] = useState('');
  const [worldType, setWorldType] = useState<StoryNodeType | 'all'>('all');
  const [selectedWorldNodeId, setSelectedWorldNodeId] = useState<string | null>(null);

  // Clear visible chapter-specific error & applied-issue state when switching chapters
  useEffect(() => {
    setAnalysisError('');
    setAppliedIssueIds(new Set());
    setSelectedNodeIdxs(new Set());
    setSelectedEventIdxs(new Set());
    setSelectedStatusIdxs(new Set());
    setSavedExtractedDone(false);
  }, [activeChapterId]);

  useEffect(() => {
    setSelectedWorldNodeId(null);
  }, [projectKey]);

  const analyzing = Boolean(activeChapterId && analyzingChapterId === activeChapterId);

  useEffect(() => {
    onAnalyzingChange?.(Boolean(analyzingChapterId));
    return () => {
      onAnalyzingChange?.(false);
    };
  }, [analyzingChapterId, onAnalyzingChange]);
  const analysis =
    analysisState && analysisState.chapterId === activeChapterId ? analysisState.result : null;
  const chatMessages = chatByProject[projectKey] || [];
  const chatLoading = Boolean(chatLoadingByProject[projectKey]);

  const filteredNodes = useMemo(() => {
    const q = worldQuery.trim().toLowerCase();
    return nodes.filter((n) => {
      if (worldType !== 'all' && n.type !== worldType) return false;
      if (!q) return true;
      return (
        n.name.toLowerCase().includes(q) ||
        (n.role || '').toLowerCase().includes(q) ||
        (n.desc || '').toLowerCase().includes(q)
      );
    });
  }, [nodes, worldQuery, worldType]);

  const handleAnalyze = async () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (!activeChapter || !activeChapter.content.trim()) {
      setAnalysisError('Hãy viết ít nhất vài câu trước khi kiểm tra chương.');
      return;
    }
    const targetChapterId = activeChapter.id;
    const reqId = ++analysisReqRef.current;
    setAnalyzingChapterId(targetChapterId);
    setAnalysisError('');
    try {
      const res = await webApi.analyzeChapterText({
        projectTitle: activeProject?.title || 'Truyện chưa đặt tên',
        chapterNumber: activeChapter.chapterNumber,
        chapterTitle: activeChapter.title,
        chapterText: activeChapter.content,
        nodes,
        links,
        chapters: chapters.map((c) => ({
          ...c,
          content: c.id === activeChapter.id ? activeChapter.content : (c.content || '').slice(0, 1200),
        })),
      });
      if (analysisReqRef.current !== reqId || activeChapterIdRef.current !== targetChapterId) {
        return;
      }
      if (!res.success || !res.data) {
        setAnalysisError(res.message || 'Không thể phân tích chương lúc này.');
      } else {
        setAnalysisState({ analysisId: reqId, chapterId: targetChapterId, result: res.data });
        setAppliedIssueIds(new Set());
        setSelectedNodeIdxs(new Set((res.data.suggestedNodes || []).map((_, i) => i)));
        setSelectedEventIdxs(new Set((res.data.suggestedEvents || []).map((_, i) => i)));
        setSelectedStatusIdxs(new Set((res.data.characterStatusChanges || []).map((_, i) => i)));
        setSavedExtractedDone(false);
      }
    } catch (err: unknown) {
      if (analysisReqRef.current !== reqId || activeChapterIdRef.current !== targetChapterId) {
        return;
      }
      setAnalysisError(err instanceof Error ? err.message : 'Lỗi khi gọi AI phân tích chương.');
    } finally {
      if (analysisReqRef.current === reqId) {
        setAnalyzingChapterId((curr) => (curr === targetChapterId ? null : curr));
      }
    }
  };

  const handleSendChat = async (customPrompt?: string) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    const originProjectKey = projectKey;
    const originChapterId = activeChapter?.id;
    const text = (customPrompt ?? chatInput).trim();
    if (!text || chatLoadingByProject[originProjectKey]) return;

    const userMsg: AIChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: Date.now(),
      chapterId: originChapterId,
    };
    const priorMessages = chatByProject[originProjectKey] || [];
    setChatByProject((prev) => ({
      ...prev,
      [originProjectKey]: [...(prev[originProjectKey] || []), userMsg],
    }));
    if (!customPrompt) setChatInput('');
    setChatLoadingByProject((prev) => ({ ...prev, [originProjectKey]: true }));

    try {
      const chapterExcerpt = (activeChapter?.content || '').slice(-3500);
      const contextualPrompt = activeChapter
        ? `[Ngữ cảnh đang viết — ${activeChapter.title || `Chương ${activeChapter.chapterNumber}`}]\n${
            chapterExcerpt ? `Nội dung gần nhất:\n"""\n${chapterExcerpt}\n"""\n\n` : ''
          }Yêu cầu của tác giả: ${text}`
        : text;

      const apiMessages = [
        ...priorMessages.slice(-8).map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: contextualPrompt },
      ];

      const res = await webApi.chatWithAI({
        mode: 'web_writing',
        messages: apiMessages,
        projectContext: activeProject
          ? {
              projectId: activeProject.isLocalOnly ? undefined : activeProject.id,
              projectTitle: activeProject.title,
              chapterNumber: activeChapter?.chapterNumber,
              chapterTitle: activeChapter?.title,
              chapterDesc: activeChapter?.desc,
              nodes: nodes.slice(0, 60),
            }
          : undefined,
      });

      const assistantMsg: AIChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: res.data?.message || 'AI chưa trả về nội dung.',
        createdAt: Date.now(),
        chapterId: originChapterId,
      };
      setChatByProject((prev) => ({
        ...prev,
        [originProjectKey]: [...(prev[originProjectKey] || []), assistantMsg],
      }));
    } catch (err: unknown) {
      const errMsg: AIChatMessage = {
        id: `e-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ ${err instanceof Error ? err.message : 'Không thể kết nối AI.'}`,
        createdAt: Date.now(),
        chapterId: originChapterId,
      };
      setChatByProject((prev) => ({
        ...prev,
        [originProjectKey]: [...(prev[originProjectKey] || []), errMsg],
      }));
    } finally {
      setChatLoadingByProject((prev) => ({ ...prev, [originProjectKey]: false }));
    }
  };

  const handleCopyText = async (content: string) => {
    if (!navigator.clipboard?.writeText) {
      onNotify('Trình duyệt không hỗ trợ sao chép tự động.');
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
      onNotify('Đã sao chép vào khay nhớ tạm.');
    } catch {
      onNotify('Không thể sao chép vào khay nhớ tạm.');
    }
  };

  const handleSaveExtractedToProject = async () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (!activeProject || activeProject.isLocalOnly || !analysis || !analysisState) {
      onNotify('Hãy đăng nhập và mở dự án đồng bộ để lưu node vào đồ thị.');
      return;
    }
    const totalSelected =
      selectedNodeIdxs.size + selectedEventIdxs.size + selectedStatusIdxs.size;
    if (totalSelected === 0 || savingExtracted) return;

    const originAnalysisId = analysisState.analysisId;
    const originChapterId = analysisState.chapterId;

    setSavingExtracted(true);
    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = 0;

    try {
      const priorSavedKeys =
        savedKeysByAnalysisRef.current.get(originAnalysisId) || new Set<string>();
      savedKeysByAnalysisRef.current.set(originAnalysisId, priorSavedKeys);
      const priorSavedNodes =
        savedNodesByAnalysisRef.current.get(originAnalysisId) || [];
      savedNodesByAnalysisRef.current.set(originAnalysisId, priorSavedNodes);

      const existingKeys = new Set<string>([
        ...nodes.map((n) => `${n.type.toLowerCase()}::${n.name.trim().toLowerCase()}`),
        ...Array.from(priorSavedKeys),
      ]);

      // Các thực thể bị người dùng bỏ chọn và chưa tồn tại trong dự án không được tự tạo ngầm qua trường quan hệ
      const deselectedNewByType = new Map<string, Set<string>>();
      (analysis.suggestedNodes || []).forEach((sn, idx) => {
        if (selectedNodeIdxs.has(idx) || !sn?.name?.trim()) return;
        const typeKey = sn.type.toLowerCase();
        const nameLower = sn.name.trim().toLowerCase();
        if (existingKeys.has(`${typeKey}::${nameLower}`)) return;
        const bucket = deselectedNewByType.get(typeKey) || new Set<string>();
        bucket.add(nameLower);
        deselectedNewByType.set(typeKey, bucket);
      });

      const allowRelVal = (targetType: string, rawVal?: string): string => {
        const trimmed = (rawVal || '').trim();
        if (!trimmed) return '';
        const blocked = deselectedNewByType.get(targetType);
        if (blocked && blocked.has(trimmed.toLowerCase())) return '';
        return trimmed;
      };

      const createdNodes: StoryNode[] = [...priorSavedNodes];

      for (const idx of Array.from(selectedNodeIdxs)) {
        const sn = analysis.suggestedNodes?.[idx];
        if (!sn || !sn.name?.trim()) continue;
        const key = `${sn.type.toLowerCase()}::${sn.name.trim().toLowerCase()}`;
        if (existingKeys.has(key)) continue;
        try {
          const payload: Record<string, unknown> = {
            name: sn.name.trim(),
            type: sn.type,
            role: sn.role || '',
            desc: sn.desc || '',
            status: sn.status || '',
            gender: sn.gender || '',
            dob: sn.dob || '',
            age: sn.age || '',
            birthplace: allowRelVal('location', sn.birthplace),
            weapon: allowRelVal('item', sn.weapon),
            sect: allowRelVal('faction', sn.sect),
            personality: sn.personality || '',
            rarity: sn.rarity || '',
            origin: allowRelVal('location', sn.origin),
            element: sn.element || '',
            holderOrLocation: allowRelVal('character', sn.holderOrLocation),
            region: sn.region || '',
            climate: sn.climate || '',
            terrain: sn.terrain || '',
            dangerLevel: sn.dangerLevel || '',
            ruler: allowRelVal('faction', sn.ruler),
            subType: sn.subType || '',
            alignment: sn.alignment || '',
            leader: allowRelVal('character', sn.leader),
            headquarters: allowRelVal('location', sn.headquarters),
            motto: sn.motto || '',
          };
          Object.keys(payload).forEach((k) => {
            if (payload[k] === '') delete payload[k];
          });
          const createdRes = await webApi.createNode(activeProject.id, payload);
          if (createdRes?.data?.id) {
            createdNodes.push(createdRes.data);
            priorSavedNodes.push(createdRes.data);
          }
          existingKeys.add(key);
          priorSavedKeys.add(key);
          createdCount += 1;
        } catch {
          failedCount += 1;
        }
      }

      for (const idx of Array.from(selectedEventIdxs)) {
        const ev = analysis.suggestedEvents?.[idx];
        if (!ev || !ev.name?.trim()) continue;
        const key = `event::${ev.name.trim().toLowerCase()}`;
        if (existingKeys.has(key)) continue;
        try {
          const payload: Record<string, unknown> = {
            name: ev.name.trim(),
            type: 'event',
            role: 'BIẾN CỐ',
            desc: ev.desc || '',
            chapter: originChapterId,
            eventType: ev.eventType || '',
            importance: ev.importance || '',
            arcName: ev.arcName || '',
            sequenceOrder: ev.sequenceOrder || '',
            location: allowRelVal('location', ev.location),
            time: ev.time || '',
            timelineType: ev.timelineType || '',
            duration: ev.duration || '',
            cause: ev.cause || '',
            conflict: ev.conflict || '',
            outcome: ev.outcome || '',
            consequences: ev.consequences || '',
            impact: ev.impact || '',
            characterRoles: ev.characterRoles || '',
            charactersInvolved: Array.isArray(ev.charactersInvolved)
              ? JSON.stringify(
                  ev.charactersInvolved.filter((name) => Boolean(allowRelVal('character', name)))
                )
              : '',
            itemsInvolved: Array.isArray(ev.itemsInvolved)
              ? JSON.stringify(
                  ev.itemsInvolved.filter((name) => Boolean(allowRelVal('item', name)))
                )
              : '',
            factionsInvolved: Array.isArray(ev.factionsInvolved)
              ? JSON.stringify(
                  ev.factionsInvolved.filter((name) => Boolean(allowRelVal('faction', name)))
                )
              : '',
          };
          Object.keys(payload).forEach((k) => {
            if (payload[k] === '' || payload[k] === '[]') delete payload[k];
          });
          const createdRes = await webApi.createNode(activeProject.id, payload);
          if (createdRes?.data?.id) {
            createdNodes.push(createdRes.data);
            priorSavedNodes.push(createdRes.data);
          }
          existingKeys.add(key);
          priorSavedKeys.add(key);
          createdCount += 1;
        } catch {
          failedCount += 1;
        }
      }

      const allCandidateNodes = [...nodes, ...createdNodes];
      for (const idx of Array.from(selectedStatusIdxs)) {
        const sc = analysis.characterStatusChanges?.[idx];
        if (!sc || !sc.characterName?.trim()) continue;
        const match = allCandidateNodes.find(
          (n) =>
            n.type === 'character' &&
            n.name.trim().toLowerCase() === sc.characterName.trim().toLowerCase()
        );
        if (!match) {
          failedCount += 1;
          continue;
        }
        try {
          await webApi.updateNode(match.id, {
            status: sc.status,
            ...(sc.statusEvent ? { statusEvent: sc.statusEvent } : {}),
          });
          updatedCount += 1;
        } catch {
          failedCount += 1;
        }
      }

      await onRefreshGraph();

      const isSameAnalysis =
        analysisStateRef.current?.analysisId === originAnalysisId &&
        activeChapterIdRef.current === originChapterId;

      if (failedCount === 0) {
        if (isSameAnalysis) {
          setSavedExtractedDone(true);
        }
        onNotify(
          `Đã lưu ${createdCount} node mới${updatedCount > 0 ? ` và cập nhật ${updatedCount} trạng thái` : ''} vào dự án.`
        );
      } else {
        onNotify(
          `Đã lưu ${createdCount + updatedCount} mục, ${failedCount} mục bị lỗi. Bạn có thể thử lại.`
        );
      }
    } finally {
      setSavingExtracted(false);
    }
  };

  const renderIssueIcon = (severity: ChapterAnalysisIssue['severity']) => {
    if (severity === 'error') return <ShieldAlert size={14} color="var(--danger)" />;
    if (severity === 'warning') return <AlertTriangle size={14} color="var(--warning)" />;
    return <Info size={14} color="var(--accent)" />;
  };

  return (
    <aside className="sidebar-right" style={hidden ? { display: 'none' } : undefined}>
      <div className="tab-bar">
        <button
          type="button"
          className={`tab-btn ${tab === 'checker' ? 'active' : ''}`}
          onClick={() => setTab('checker')}
        >
          <Sparkles size={13} /> Kiểm tra
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === 'chat' ? 'active' : ''}`}
          onClick={() => setTab('chat')}
        >
          <MessageSquare size={13} /> Trợ lý AI
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === 'world' ? 'active' : ''}`}
          onClick={() => setTab('world')}
        >
          <BookMarked size={13} /> Thế giới
        </button>
        {onClose && (
          <button
            type="button"
            className="icon-btn drawer-close-btn"
            onClick={onClose}
            aria-label="Đóng thanh trợ lý"
            title="Đóng"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* TAB 1: AI CHAPTER CHECKER */}
      {tab === 'checker' && (
        <div className="panel-body">
          <div className="card">
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>
              Phân tích chương & tạo node
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 10px' }}>
              Kiểm tra mâu thuẫn bản thảo bạn tự viết và tự động trích xuất nhân vật, địa điểm, vật phẩm, tổ chức, sự kiện để lưu vào dự án.
            </p>
            <button
              type="button"
              className="primary-btn"
              style={{ width: '100%' }}
              disabled={analyzing}
              onClick={handleAnalyze}
            >
              {analyzing ? (
                <>
                  <Loader2 size={14} className="spin" /> Đang phân tích chương...
                </>
              ) : (
                <>
                  <Sparkles size={14} /> Phân tích & tạo node
                </>
              )}
            </button>
            {analysisError && (
              <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>{analysisError}</div>
            )}
          </div>

          {analysis && analysisState && (
            <>
              {analysis.summary && (
                <div className="card">
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>
                    TÓM TẮT AI
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-primary)' }}>
                    {analysis.summary}
                  </div>
                </div>
              )}

              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Cảnh báo & Gợi ý ({analysis.issues?.length || 0})
              </div>

              {!analysis.issues || analysis.issues.length === 0 ? (
                <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--success)', fontSize: 13 }}>
                  <CheckCircle2 size={16} /> Không phát hiện mâu thuẫn nào!
                </div>
              ) : (
                analysis.issues.map((issue) => (
                  <div key={issue.id} className={`card issue-card severity-${issue.severity}`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}>
                      {renderIssueIcon(issue.severity)}
                      <span>{issue.title}</span>
                    </div>
                    {issue.quote && <div className="issue-quote">“{issue.quote}”</div>}
                    <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                      {issue.explanation}
                    </div>
                    {issue.suggestion && (
                      <div style={{ fontSize: 12.5, marginTop: 6, color: 'var(--text-primary)' }}>
                        <strong>Gợi ý:</strong> {issue.suggestion}
                      </div>
                    )}
                    {issue.suggestedRewrite && issue.quote && (() => {
                      const isApplied = appliedIssueIds.has(issue.id);
                      return (
                        <button
                          type="button"
                          className="icon-btn bordered"
                          disabled={isApplied || analyzing}
                          style={{ marginTop: 8, width: '100%', justifyContent: 'center', fontSize: 12 }}
                          onClick={() => {
                            if (isApplied || analyzing) return;
                            const ok = onReplaceQuote(
                              issue.quote,
                              issue.suggestedRewrite!,
                              analysisState.chapterId
                            );
                            if (ok) {
                              setAppliedIssueIds((prev) => {
                                const next = new Set(prev);
                                next.add(issue.id);
                                return next;
                              });
                              onNotify('Đã áp dụng gợi ý sửa vào bản thảo.');
                            } else {
                              onNotify('Không tìm thấy chính xác đoạn trích dẫn trong bản thảo.');
                            }
                          }}
                        >
                          {isApplied ? (
                            <>
                              <Check size={13} /> Đã áp dụng
                            </>
                          ) : (
                            <>
                              <CornerDownLeft size={13} /> Áp dụng gợi ý sửa
                            </>
                          )}
                        </button>
                      );
                    })()}
                  </div>
                ))
              )}

              {((analysis.suggestedNodes && analysis.suggestedNodes.length > 0) ||
                (analysis.suggestedEvents && analysis.suggestedEvents.length > 0) ||
                (analysis.characterStatusChanges && analysis.characterStatusChanges.length > 0)) && (
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase' }}>
                    Trích xuất Node từ chương
                  </div>

                  {analysis.suggestedNodes && analysis.suggestedNodes.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)' }}>
                        THỰC THỂ MỚI ({analysis.suggestedNodes.length})
                      </div>
                      {analysis.suggestedNodes.map((n, idx) => (
                        <label key={`${n.type}-${n.name}-${idx}`} className="extract-check-row">
                          <input
                            type="checkbox"
                            disabled={savedExtractedDone || savingExtracted}
                            checked={selectedNodeIdxs.has(idx)}
                            onChange={() =>
                              setSelectedNodeIdxs((prev) => {
                                const next = new Set(prev);
                                if (next.has(idx)) next.delete(idx);
                                else next.add(idx);
                                return next;
                              })
                            }
                          />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                              <strong style={{ fontSize: 12.5, minWidth: 0, wordBreak: 'break-word' }}>
                                {n.name}
                              </strong>
                              <span className="node-pill" style={{ color: NODE_TYPE_COLORS[n.type] }}>
                                {NODE_TYPE_LABELS[n.type]}
                              </span>
                            </div>
                            {n.desc && (
                              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
                                {n.desc}
                              </div>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}

                  {analysis.suggestedEvents && analysis.suggestedEvents.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)' }}>
                        SỰ KIỆN MỚI ({analysis.suggestedEvents.length})
                      </div>
                      {analysis.suggestedEvents.map((ev, idx) => (
                        <label key={`${ev.name}-${idx}`} className="extract-check-row">
                          <input
                            type="checkbox"
                            disabled={savedExtractedDone || savingExtracted}
                            checked={selectedEventIdxs.has(idx)}
                            onChange={() =>
                              setSelectedEventIdxs((prev) => {
                                const next = new Set(prev);
                                if (next.has(idx)) next.delete(idx);
                                else next.add(idx);
                                return next;
                              })
                            }
                          />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                              <strong style={{ fontSize: 12.5, minWidth: 0, wordBreak: 'break-word' }}>
                                {ev.name}
                              </strong>
                              <span className="node-pill" style={{ color: NODE_TYPE_COLORS.event }}>
                                Sự kiện
                              </span>
                            </div>
                            {ev.desc && (
                              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
                                {ev.desc}
                              </div>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}

                  {analysis.characterStatusChanges && analysis.characterStatusChanges.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)' }}>
                        CẬP NHẬT TRẠNG THÁI ({analysis.characterStatusChanges.length})
                      </div>
                      {analysis.characterStatusChanges.map((sc, idx) => (
                        <label key={`${sc.characterName}-${idx}`} className="extract-check-row">
                          <input
                            type="checkbox"
                            disabled={savedExtractedDone || savingExtracted}
                            checked={selectedStatusIdxs.has(idx)}
                            onChange={() =>
                              setSelectedStatusIdxs((prev) => {
                                const next = new Set(prev);
                                if (next.has(idx)) next.delete(idx);
                                else next.add(idx);
                                return next;
                              })
                            }
                          />
                          <div style={{ minWidth: 0, flex: 1, fontSize: 12.5 }}>
                            <strong>{sc.characterName}</strong> →{' '}
                            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{sc.status}</span>
                            {sc.reason && (
                              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                                {sc.reason}
                              </div>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    className="primary-btn"
                    style={{ width: '100%' }}
                    disabled={
                      savingExtracted ||
                      savedExtractedDone ||
                      selectedNodeIdxs.size + selectedEventIdxs.size + selectedStatusIdxs.size === 0
                    }
                    onClick={() => void handleSaveExtractedToProject()}
                  >
                    {savingExtracted ? (
                      <>
                        <Loader2 size={14} className="spin" /> Đang lưu vào dự án...
                      </>
                    ) : savedExtractedDone ? (
                      <>
                        <Check size={14} /> Đã lưu vào dự án
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={14} /> Lưu{' '}
                        {selectedNodeIdxs.size + selectedEventIdxs.size + selectedStatusIdxs.size} mục
                        vào dự án
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB 2: AI WRITING CHAT */}
      {tab === 'chat' && (
        <div className="panel-body" style={{ overflow: 'hidden' }}>
          <div className="chat-messages">
            {chatMessages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '28px 12px', color: 'var(--text-muted)', fontSize: 13 }}>
                Hỏi AI để gợi ý viết tiếp, chau chuốt câu chữ, hoặc kiểm tra ý tưởng cho chương hiện tại.
              </div>
            ) : (
              chatMessages.map((msg) => {
                const belongsToActiveChapter =
                  Boolean(activeChapterId) && (!msg.chapterId || msg.chapterId === activeChapterId);
                return (
                  <div key={msg.id} className={`chat-bubble ${msg.role}`}>
                    <div>{msg.content}</div>
                    {msg.role === 'assistant' && !msg.content.startsWith('⚠️') && (
                      <div className="chat-actions">
                        {belongsToActiveChapter && (
                          <button
                            type="button"
                            className="icon-btn"
                            disabled={analyzing}
                            style={{ height: 26, fontSize: 11.5 }}
                            onClick={() => {
                              const inserted = onInsertText(
                                `\n\n${msg.content}`,
                                msg.chapterId || activeChapterId || undefined
                              );
                              if (inserted) {
                                onNotify('Đã chèn gợi ý vào chương.');
                              }
                            }}
                          >
                            <CornerDownLeft size={12} /> Chèn vào chương
                          </button>
                        )}
                        <button
                          type="button"
                          className="icon-btn"
                          style={{ height: 26, fontSize: 11.5 }}
                          onClick={() => void handleCopyText(msg.content)}
                        >
                          <Copy size={12} /> Sao chép
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {chatLoading && (
              <div className="chat-bubble assistant" style={{ color: 'var(--text-muted)' }}>
                Đang suy nghĩ...
              </div>
            )}
          </div>

          <form
            className="chat-input-bar"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSendChat();
            }}
          >
            <input
              className="text-input"
              placeholder="Nhắn trợ lý viết..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={chatLoading}
            />
            <button className="primary-btn" type="submit" disabled={chatLoading || !chatInput.trim()}>
              <Send size={14} />
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: WORLD LOOKUP */}
      {tab === 'world' && (() => {
        const selectedNode = selectedWorldNodeId
          ? nodes.find((n) => n.id === selectedWorldNodeId) || null
          : null;

        if (selectedNode) {
          const nodeById = new Map(nodes.map((n) => [n.id, n]));
          const formatListVal = (raw?: string): string => {
            if (!raw) return '';
            const trimmed = raw.trim();
            if (!trimmed) return '';
            try {
              const parsed = JSON.parse(trimmed);
              if (Array.isArray(parsed)) {
                return parsed
                  .map((v) => nodeById.get(String(v))?.name || String(v))
                  .filter(Boolean)
                  .join(', ');
              }
            } catch {
              // plain text
            }
            return nodeById.get(trimmed)?.name || trimmed;
          };

          const formatChapterVal = (raw?: string): string => {
            if (!raw) return '';
            const trimmed = raw.trim();
            if (!trimmed) return '';
            const found = chapters.find(
              (c) =>
                c.id === trimmed ||
                (c.code && c.code.toLowerCase() === trimmed.toLowerCase()) ||
                String(c.chapterNumber) === trimmed
            );
            if (found) {
              const title = (found.title || '').trim();
              if (!title) return `Chương ${found.chapterNumber}`;
              if (/^chương\s*\d+/i.test(title)) return title;
              return `Chương ${found.chapterNumber}: ${title}`;
            }
            return trimmed;
          };

          const detailRows: Array<{ label: string; value: string }> = [
            { label: 'Vai trò', value: selectedNode.role || '' },
            { label: 'Trạng thái', value: selectedNode.status || '' },
            { label: 'Giới tính', value: selectedNode.gender || '' },
            { label: 'Ngày sinh', value: selectedNode.dob || '' },
            { label: 'Tuổi', value: selectedNode.age || '' },
            { label: 'Nơi sinh', value: formatListVal(selectedNode.birthplace) },
            { label: 'Tính cách', value: selectedNode.personality || '' },
            { label: 'Vật phẩm / Vũ khí', value: formatListVal(selectedNode.weapon) },
            { label: 'Tổ chức', value: formatListVal(selectedNode.sect) },
            { label: 'Độ hiếm', value: selectedNode.rarity || '' },
            { label: 'Thuộc tính / Nguyên tố', value: selectedNode.element || '' },
            { label: 'Nguồn gốc', value: formatListVal(selectedNode.origin) },
            { label: 'Người nắm giữ / Vị trí', value: formatListVal(selectedNode.holderOrLocation) },
            { label: 'Khu vực', value: selectedNode.region || '' },
            { label: 'Khí hậu', value: selectedNode.climate || '' },
            { label: 'Địa hình', value: selectedNode.terrain || '' },
            { label: 'Mức độ nguy hiểm', value: selectedNode.dangerLevel || '' },
            { label: 'Thế lực cai quản', value: formatListVal(selectedNode.ruler) },
            { label: 'Phân loại', value: selectedNode.subType || '' },
            { label: 'Lập trường', value: selectedNode.alignment || '' },
            { label: 'Thủ lĩnh / Đại diện', value: formatListVal(selectedNode.leader) },
            { label: 'Thành viên cấp cao', value: formatListVal(selectedNode.seniorMembers) },
            { label: 'Thành viên', value: formatListVal(selectedNode.members) },
            { label: 'Tổ chức trực thuộc', value: formatListVal(selectedNode.subFactions) },
            { label: 'Trụ sở', value: formatListVal(selectedNode.headquarters) },
            { label: 'Tôn chỉ / Khẩu hiệu', value: selectedNode.motto || '' },
            { label: 'Chương', value: formatChapterVal(selectedNode.chapter) },
            { label: 'Thời gian', value: selectedNode.time || '' },
            { label: 'Địa điểm diễn ra', value: formatListVal(selectedNode.location) },
            { label: 'Loại sự kiện', value: selectedNode.eventType || '' },
            { label: 'Độ quan trọng', value: selectedNode.importance || '' },
            { label: 'Nhân vật tham gia', value: formatListVal(selectedNode.charactersInvolved) },
            { label: 'Nguyên nhân', value: formatListVal(selectedNode.cause) },
            { label: 'Xung đột', value: selectedNode.conflict || '' },
            { label: 'Kết quả', value: selectedNode.outcome || '' },
            { label: 'Hệ quả', value: selectedNode.consequences || '' },
            { label: 'Tác động', value: selectedNode.impact || '' },
            { label: 'Sự kiện trạng thái', value: formatListVal(selectedNode.statusEvent) },
          ].filter((row) => row.value.trim().length > 0);

          const relatedLinks = links
            .filter((l) => l.source === selectedNode.id || l.target === selectedNode.id)
            .map((l) => {
              const otherId = l.source === selectedNode.id ? l.target : l.source;
              const otherNode = nodeById.get(otherId);
              if (!otherNode) return null;
              return {
                id: l.id,
                label: l.label || l.category || 'Liên quan',
                otherNode,
              };
            })
            .filter(Boolean) as Array<{ id: string; label: string; otherNode: StoryNode }>;

          return (
            <div className="panel-body">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <button
                  type="button"
                  className="icon-btn bordered"
                  onClick={() => setSelectedWorldNodeId(null)}
                >
                  <ArrowLeft size={14} /> Danh sách
                </button>
                <button
                  type="button"
                  className="icon-btn bordered"
                  disabled={analyzing}
                  title="Chèn tên vào vị trí con trỏ (hoặc gõ @tên trong khung viết)"
                  onClick={() => {
                    const inserted = onInsertText(selectedNode.name, activeChapterId || undefined);
                    if (inserted) {
                      onNotify(`Đã chèn "${selectedNode.name}"`);
                    }
                  }}
                >
                  + Chèn tên
                </button>
              </div>

              <div className="card">
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {selectedNode.name}
                </div>
                <div style={{ marginTop: 6 }}>
                  <span className="node-pill" style={{ color: NODE_TYPE_COLORS[selectedNode.type] }}>
                    {NODE_TYPE_LABELS[selectedNode.type]}
                  </span>
                </div>

                {selectedNode.desc && (
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--text-secondary)',
                      marginTop: 10,
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {selectedNode.desc}
                  </div>
                )}

                {detailRows.length > 0 && (
                  <div className="node-detail-list">
                    {detailRows.map((row) => (
                      <div key={row.label} className="node-detail-row">
                        <span className="node-detail-label">{row.label}</span>
                        <span className="node-detail-val">{row.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {relatedLinks.length > 0 && (
                <div className="card">
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      marginBottom: 8,
                    }}
                  >
                    <Link2 size={13} /> Quan hệ liên kết ({relatedLinks.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {relatedLinks.map((rel) => (
                      <button
                        key={rel.id}
                        type="button"
                        className="world-node-card"
                        style={{ padding: '7px 10px' }}
                        onClick={() => setSelectedWorldNodeId(rel.otherNode.id)}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                          <strong style={{ fontSize: 12.5 }}>{rel.otherNode.name}</strong>
                          <span style={{ fontSize: 11, color: 'var(--accent)' }}>{rel.label}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        }

        return (
          <div className="panel-body">
            <div style={{ position: 'relative' }}>
              <Search
                size={14}
                style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-muted)' }}
              />
              <input
                className="text-input"
                style={{ paddingLeft: 30 }}
                placeholder="Tìm nhân vật, địa điểm, tổ chức..."
                value={worldQuery}
                onChange={(e) => setWorldQuery(e.target.value)}
              />
            </div>

            <div className="chip-row">
              {(['all', 'character', 'faction', 'location', 'item', 'event'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className="chip-btn"
                  style={
                    worldType === t
                      ? { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-soft)' }
                      : undefined
                  }
                  onClick={() => setWorldType(t)}
                >
                  {NODE_TYPE_LABELS[t]}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
              Nhấn vào thực thể để xem chi tiết · Gõ <strong>@tên</strong> trong khung viết để chèn nhanh.
            </div>

            {filteredNodes.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
                {nodes.length === 0
                  ? 'Chưa có thực thể nào từ đồ thị dự án. Đăng nhập để tải dữ liệu thế giới từ app.'
                  : 'Không tìm thấy thực thể phù hợp.'}
              </div>
            ) : (
              filteredNodes.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  className="world-node-card"
                  onClick={() => setSelectedWorldNodeId(node.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <strong style={{ fontSize: 13.5, minWidth: 0, wordBreak: 'break-word' }}>
                      {node.name}
                    </strong>
                    <span className="node-pill" style={{ color: NODE_TYPE_COLORS[node.type] }}>
                      {NODE_TYPE_LABELS[node.type]}
                    </span>
                  </div>
                  {(node.role || node.status) && (
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 3 }}>
                      {node.role}
                      {node.role && node.status ? ' · ' : ''}
                      {node.status}
                    </div>
                  )}
                  {node.desc && (
                    <div
                      style={{
                        fontSize: 12.5,
                        color: 'var(--text-secondary)',
                        marginTop: 5,
                        lineHeight: 1.45,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {node.desc}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        );
      })()}
    </aside>
  );
};
