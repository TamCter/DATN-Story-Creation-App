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
  onInsertText: (text: string, expectedChapterId?: string) => void;
  onReplaceQuote: (quote: string, replacement: string, expectedChapterId?: string) => boolean;
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
  onInsertText,
  onReplaceQuote,
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
    chapterId: string;
    result: ChapterAnalysisResult;
  } | null>(null);
  const [appliedIssueIds, setAppliedIssueIds] = useState<Set<string>>(() => new Set());
  const [analysisError, setAnalysisError] = useState('');
  const analysisReqRef = useRef(0);

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
  }, [activeChapterId]);

  useEffect(() => {
    setSelectedWorldNodeId(null);
  }, [projectKey]);

  const analyzing = Boolean(activeChapterId && analyzingChapterId === activeChapterId);
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
        setAnalysisState({ chapterId: targetChapterId, result: res.data });
        setAppliedIssueIds(new Set());
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

  const renderIssueIcon = (severity: ChapterAnalysisIssue['severity']) => {
    if (severity === 'error') return <ShieldAlert size={14} color="var(--danger)" />;
    if (severity === 'warning') return <AlertTriangle size={14} color="var(--warning)" />;
    return <Info size={14} color="var(--accent)" />;
  };

  return (
    <aside className="sidebar-right">
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
              Kiểm tra mâu thuẫn & phân tích chương
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 10px' }}>
              Đối chiếu bản thảo với nhân vật, sự kiện và các chương trước để phát hiện lỗi logic.
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
                  <Sparkles size={14} /> Phân tích chương hiện tại
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
                          disabled={isApplied}
                          style={{ marginTop: 8, width: '100%', justifyContent: 'center', fontSize: 12 }}
                          onClick={() => {
                            if (isApplied) return;
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

              {analysis.suggestedNodes && analysis.suggestedNodes.length > 0 && (
                <div className="card">
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                    THỰC THỂ MỚI PHÁT HIỆN ({analysis.suggestedNodes.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {analysis.suggestedNodes.map((n, idx) => (
                      <div key={`${n.name}-${idx}`} style={{ fontSize: 12.5 }}>
                        <strong>{n.name}</strong>{' '}
                        <span style={{ color: 'var(--text-muted)' }}>({n.type})</span>
                        {n.desc ? <div style={{ color: 'var(--text-secondary)' }}>{n.desc}</div> : null}
                      </div>
                    ))}
                  </div>
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
                            style={{ height: 26, fontSize: 11.5 }}
                            onClick={() => {
                              onInsertText(`\n\n${msg.content}`, msg.chapterId || activeChapterId || undefined);
                              onNotify('Đã chèn gợi ý vào chương.');
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
            { label: 'Chương', value: selectedNode.chapter || '' },
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
                  title="Chèn tên vào vị trí con trỏ (hoặc gõ @tên trong khung viết)"
                  onClick={() => {
                    onInsertText(selectedNode.name, activeChapterId || undefined);
                    onNotify(`Đã chèn "${selectedNode.name}"`);
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                    <strong style={{ fontSize: 13.5 }}>{node.name}</strong>
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
