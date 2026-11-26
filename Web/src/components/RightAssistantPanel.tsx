import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookMarked,
  CheckCircle2,
  Copy,
  CornerDownLeft,
  Info,
  Loader2,
  MessageSquare,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
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
  onInsertText: (text: string) => void;
  onReplaceQuote: (quote: string, replacement: string) => boolean;
  onOpenAuth: () => void;
  onNotify: (msg: string) => void;
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

const QUICK_PROMPTS = [
  {
    label: 'Gợi ý viết tiếp',
    prompt: 'Dựa trên nội dung chương hiện tại, hãy gợi ý 1-2 đoạn văn viết tiếp tự nhiên, giữ đúng giọng văn.',
  },
  {
    label: 'Chau chuốt đoạn cuối',
    prompt: 'Hãy chau chuốt lại đoạn cuối của chương hiện tại cho giàu hình ảnh và mượt mà hơn.',
  },
  {
    label: 'Kiểm tra nhịp độ',
    prompt: 'Nhận xét ngắn gọn về nhịp độ, cảm xúc và điểm nhấn của chương hiện tại.',
  },
  {
    label: 'Ý tưởng nút thắt',
    prompt: 'Đề xuất 3 hướng tạo nút thắt (plot twist) hoặc xung đột hợp lý cho phần tiếp theo.',
  },
];

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
}) => {
  const [tab, setTab] = useState<'checker' | 'chat' | 'world'>('checker');

  // Checker state
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ChapterAnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState('');

  // Chat state
  const [chatMessages, setChatMessages] = useState<AIChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // World lookup state
  const [worldQuery, setWorldQuery] = useState('');
  const [worldType, setWorldType] = useState<StoryNodeType | 'all'>('all');

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
    setAnalyzing(true);
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
      if (!res.success || !res.data) {
        setAnalysisError(res.message || 'Không thể phân tích chương lúc này.');
      } else {
        setAnalysis(res.data);
      }
    } catch (err: unknown) {
      setAnalysisError(err instanceof Error ? err.message : 'Lỗi khi gọi AI phân tích chương.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSendChat = async (customPrompt?: string) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    const text = (customPrompt ?? chatInput).trim();
    if (!text || chatLoading) return;

    const userMsg: AIChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: Date.now(),
    };
    const nextHistory = [...chatMessages, userMsg];
    setChatMessages(nextHistory);
    if (!customPrompt) setChatInput('');
    setChatLoading(true);

    try {
      const chapterExcerpt = (activeChapter?.content || '').slice(-3500);
      const contextualPrompt = activeChapter
        ? `[Ngữ cảnh đang viết — ${activeChapter.title || `Chương ${activeChapter.chapterNumber}`}]\n${
            chapterExcerpt ? `Nội dung gần nhất:\n"""\n${chapterExcerpt}\n"""\n\n` : ''
          }Yêu cầu của tác giả: ${text}`
        : text;

      const apiMessages = [
        ...chatMessages.slice(-8).map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: contextualPrompt },
      ];

      const res = await webApi.chatWithAI({
        messages: apiMessages,
        projectContext: activeProject
          ? {
              projectId: activeProject.isLocalOnly ? undefined : activeProject.id,
              projectTitle: activeProject.title,
              nodes: nodes.slice(0, 60),
            }
          : undefined,
      });

      const assistantMsg: AIChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: res.data?.message || 'AI chưa trả về nội dung.',
        createdAt: Date.now(),
      };
      setChatMessages([...nextHistory, assistantMsg]);
    } catch (err: unknown) {
      const errMsg: AIChatMessage = {
        id: `e-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ ${err instanceof Error ? err.message : 'Không thể kết nối AI.'}`,
        createdAt: Date.now(),
      };
      setChatMessages([...nextHistory, errMsg]);
    } finally {
      setChatLoading(false);
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
          className={`tab-btn ${tab === 'checker' ? 'active' : ''}`}
          onClick={() => setTab('checker')}
        >
          <Sparkles size={13} /> Kiểm tra
        </button>
        <button
          className={`tab-btn ${tab === 'chat' ? 'active' : ''}`}
          onClick={() => setTab('chat')}
        >
          <MessageSquare size={13} /> Trợ lý AI
        </button>
        <button
          className={`tab-btn ${tab === 'world' ? 'active' : ''}`}
          onClick={() => setTab('world')}
        >
          <BookMarked size={13} /> Thế giới
        </button>
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

          {analysis && (
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

              {(!analysis.issues || analysis.issues.length === 0) ? (
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
                    {issue.suggestedRewrite && issue.quote && (
                      <button
                        className="icon-btn bordered"
                        style={{ marginTop: 8, width: '100%', justifyContent: 'center', fontSize: 12 }}
                        onClick={() => {
                          const ok = onReplaceQuote(issue.quote, issue.suggestedRewrite!);
                          onNotify(
                            ok
                              ? 'Đã áp dụng gợi ý sửa vào bản thảo.'
                              : 'Không tìm thấy chính xác đoạn trích dẫn trong bản thảo.'
                          );
                        }}
                      >
                        <CornerDownLeft size={13} /> Áp dụng gợi ý sửa
                      </button>
                    )}
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
          <div className="chip-row">
            {QUICK_PROMPTS.map((qp) => (
              <button
                key={qp.label}
                className="chip-btn"
                disabled={chatLoading}
                onClick={() => void handleSendChat(qp.prompt)}
              >
                {qp.label}
              </button>
            ))}
          </div>

          <div className="chat-messages">
            {chatMessages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '28px 12px', color: 'var(--text-muted)', fontSize: 13 }}>
                Hỏi AI để gợi ý viết tiếp, chau chuốt câu chữ, hoặc kiểm tra ý tưởng cho chương hiện tại.
              </div>
            ) : (
              chatMessages.map((msg) => (
                <div key={msg.id} className={`chat-bubble ${msg.role}`}>
                  <div>{msg.content}</div>
                  {msg.role === 'assistant' && !msg.content.startsWith('⚠️') && (
                    <div className="chat-actions">
                      <button
                        className="icon-btn"
                        style={{ height: 26, fontSize: 11.5 }}
                        onClick={() => {
                          onInsertText(`\n\n${msg.content}`);
                          onNotify('Đã chèn gợi ý vào cuối chương.');
                        }}
                      >
                        <CornerDownLeft size={12} /> Chèn vào chương
                      </button>
                      <button
                        className="icon-btn"
                        style={{ height: 26, fontSize: 11.5 }}
                        onClick={() => {
                          void navigator.clipboard?.writeText(msg.content);
                          onNotify('Đã sao chép vào khay nhớ tạm.');
                        }}
                      >
                        <Copy size={12} /> Sao chép
                      </button>
                    </div>
                  )}
                </div>
              ))
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
      {tab === 'world' && (
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

          {filteredNodes.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
              {nodes.length === 0
                ? 'Chưa có thực thể nào từ đồ thị dự án. Đăng nhập để tải dữ liệu thế giới từ app.'
                : 'Không tìm thấy thực thể phù hợp.'}
            </div>
          ) : (
            filteredNodes.map((node) => (
              <div key={node.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <strong style={{ fontSize: 13.5 }}>{node.name}</strong>
                  <button
                    className="icon-btn"
                    style={{ height: 24, fontSize: 11.5 }}
                    title="Chèn tên vào vị trí con trỏ"
                    onClick={() => {
                      onInsertText(node.name);
                      onNotify(`Đã chèn "${node.name}"`);
                    }}
                  >
                    + Chèn tên
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                  <span className="node-pill" style={{ color: NODE_TYPE_COLORS[node.type] }}>
                    {NODE_TYPE_LABELS[node.type]}
                  </span>
                  {node.role && (
                    <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{node.role}</span>
                  )}
                  {node.status && (
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>· {node.status}</span>
                  )}
                </div>
                {node.desc && (
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
                    {node.desc}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </aside>
  );
};
