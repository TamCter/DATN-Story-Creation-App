import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { AppFonts } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/services/api';
import { projectStore } from '@/services/project-store';
import { StoryLink, StoryNode } from '@/constants/story-data';

const AI_CHAT_STORAGE_PREFIX = '@story_app_ai_chat_';
const AI_CHAT_PENDING_DELETE_PREFIX = '@story_app_ai_chat_pending_delete_';
const AI_CHAT_LOCAL_CLEANUP_PREFIX = '@story_app_ai_chat_local_cleanup_';
const AI_CHAT_SERVER_REV_PREFIX = '@story_app_ai_chat_server_rev_';
// Giữ payload JSON dưới giới hạn 100KB mặc định của express.json()
const MAX_CHAT_SYNC_BYTES = 85_000;

interface StoredChatPayload {
  messages: AIChatMessage[];
  updatedAt: number;
  serverRevision?: number;
  dirty?: boolean;
  serverTruncated?: boolean;
  replacedClearId?: string;
  pendingWriteId?: string;
}

interface ClearIntentMarker {
  clearId: string;
  opId: number;
  createdAt: number;
  localPending: boolean;
  serverPending: boolean;
  baseRevision?: number;
}

interface PendingDeleteMarker {
  opId: number;
  createdAt: number;
  clearId?: string;
  baseRevision?: number;
}

function parseClearIntentMarker(raw: string | null): ClearIntentMarker | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.opId === 'number') {
      const createdAt = Number(parsed.createdAt) || 0;
      return {
        clearId:
          typeof parsed.clearId === 'string' && parsed.clearId
            ? parsed.clearId
            : `legacy-${parsed.opId}-${createdAt}`,
        opId: parsed.opId,
        createdAt,
        localPending: Boolean(parsed.localPending),
        serverPending: Boolean(parsed.serverPending),
        baseRevision:
          typeof parsed.baseRevision === 'number' && Number.isInteger(parsed.baseRevision) && parsed.baseRevision >= 0
            ? parsed.baseRevision
            : undefined,
      };
    }
  } catch {
    // Tương thích ngược định dạng timestamp chuỗi cũ
  }
  const ts = Number(raw) || 0;
  return {
    clearId: `legacy-0-${ts}`,
    opId: 0,
    createdAt: ts,
    localPending: true,
    serverPending: false,
  };
}

function parsePendingDeleteMarker(raw: string | null): PendingDeleteMarker | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.opId === 'number') {
      return {
        opId: parsed.opId,
        createdAt: Number(parsed.createdAt) || 0,
        clearId: typeof parsed.clearId === 'string' && parsed.clearId ? parsed.clearId : undefined,
        baseRevision:
          typeof parsed.baseRevision === 'number' && Number.isInteger(parsed.baseRevision) && parsed.baseRevision >= 0
            ? parsed.baseRevision
            : undefined,
      };
    }
  } catch {
    // Tương thích ngược định dạng timestamp chuỗi cũ
  }
  return {
    opId: 0,
    createdAt: Number(raw) || 0,
  };
}

function getUtf8ByteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }
  return encodeURIComponent(value).replace(/%[A-F\d]{2}/g, 'U').length;
}

function fitMessagesToByteBudget(
  messages: AIChatMessage[],
  maxBytes: number = MAX_CHAT_SYNC_BYTES
): { payload: AIChatMessage[]; trimmed: boolean } {
  const fullBytes = getUtf8ByteLength(JSON.stringify({ messages }));
  if (fullBytes <= maxBytes) {
    return { payload: messages, trimmed: false };
  }

  // Giữ các tin nhắn mới nhất trong ngân sách byte
  const kept: AIChatMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const candidate = [messages[i], ...kept];
    if (getUtf8ByteLength(JSON.stringify({ messages: candidate })) <= maxBytes) {
      kept.unshift(messages[i]);
    } else {
      break;
    }
  }
  return { payload: kept, trimmed: true };
}

function parseStoredChatPayload(raw: string): StoredChatPayload | null {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const latestTs = parsed.reduce(
        (max, m) => Math.max(max, Number(m?.timestamp) || 0),
        0
      );
      return {
        messages: parsed,
        updatedAt: latestTs,
        serverRevision: 0,
        dirty: false,
        serverTruncated: false,
      };
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray(parsed.messages) &&
      parsed.messages.length > 0
    ) {
      return {
        messages: parsed.messages,
        updatedAt: Number(parsed.updatedAt) || 0,
        serverRevision: Number(parsed.serverRevision) || 0,
        dirty: Boolean(parsed.dirty),
        serverTruncated: Boolean(parsed.serverTruncated),
        replacedClearId:
          typeof parsed.replacedClearId === 'string' ? parsed.replacedClearId : undefined,
        pendingWriteId:
          typeof parsed.pendingWriteId === 'string' && parsed.pendingWriteId
            ? parsed.pendingWriteId
            : undefined,
      };
    }
  } catch {
    // Ignore parse error
  }
  return null;
}

export interface AIChatSuggestedLink {
  source: string;
  target: string;
  sourceName?: string;
  targetName?: string;
  label: string;
  category?: string;
  tone?: 'loyalty' | 'hostile' | 'possession' | 'sect' | 'event' | 'location';
  type?: 'solid' | 'dashed';
  contextNote?: string;
}

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  nodeData?: Partial<StoryNode> | null;
  nodeDataList?: Partial<StoryNode>[];
  nodesAdded?: boolean;
  linkDataList?: AIChatSuggestedLink[];
  linksAdded?: boolean;
  suggestedPrompt?: string | null;
  timestamp: number;
  canRetry?: boolean;
}

interface AIChatPanelProps {
  visible: boolean;
  onClose: () => void;
  onCreateNode: (nodeData: Partial<StoryNode>) => void;
  onCreateNodes: (nodes: Partial<StoryNode>[]) => Promise<boolean>;
  onCreateLinks?: (links: AIChatSuggestedLink[]) => Promise<boolean>;
  projectId?: string;
  projectTitle?: string;
  existingNodes?: StoryNode[];
  existingLinks?: StoryLink[];
}

const WELCOME_MSG: AIChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    '✨ Xin chào! Tôi là trợ lý AI sáng tác truyện.\n\nHãy mô tả nhân vật, vật phẩm, địa điểm, tổ chức hoặc sự kiện bạn muốn thêm vào câu chuyện – tôi sẽ gợi ý các chi tiết còn thiếu. Bạn có thể tạo cùng lúc tối đa 3 thực thể mỗi lượt (nếu cần nhiều hơn, tôi sẽ gợi ý prompt để bạn tạo tiếp).\n\nVí dụ: "Tạo một phóng viên điều tra có quá khứ bí ẩn" hoặc "Tạo một nhân vật, một vật phẩm và địa điểm họ gặp nhau"',
  timestamp: Date.now(),
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function AIChatPanel({
  visible,
  onClose,
  onCreateNode,
  onCreateNodes,
  onCreateLinks,
  projectId,
  projectTitle,
  existingNodes = [],
  existingLinks = [],
}: AIChatPanelProps) {
  const { user } = useAuth();
  const authorKey = user?.id || user?.email || 'guest';
  const effectiveProjectKey = projectId || projectTitle || 'default';
  const scopeSuffix = `${encodeURIComponent(authorKey)}_${encodeURIComponent(effectiveProjectKey)}`;
  const storageKey = `${AI_CHAT_STORAGE_PREFIX}${scopeSuffix}`;
  const pendingDeleteKey = `${AI_CHAT_PENDING_DELETE_PREFIX}${scopeSuffix}`;
  const localCleanupKey = `${AI_CHAT_LOCAL_CLEANUP_PREFIX}${scopeSuffix}`;
  const serverRevKey = `${AI_CHAT_SERVER_REV_PREFIX}${scopeSuffix}`;

  const [chatState, setChatState] = useState<{
    scopeKey: string;
    messages: AIChatMessage[];
    loaded: boolean;
    baseRevision: number;
  }>({
    scopeKey: storageKey,
    messages: [WELCOME_MSG],
    loaded: false,
    baseRevision: 0,
  });
  const [pendingDeleteFailed, setPendingDeleteFailed] = useState(false);
  const [serverSyncWarning, setServerSyncWarning] = useState<string | null>(null);
  const [clearingScopeKey, setClearingScopeKey] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef<any>(null);
  const slideAnim = useRef(new Animated.Value(visible ? 0 : 400)).current;

  // Quản lý scope đang commit, phiên tài khoản, generation, revision, thứ tự thao tác bền vững và hàng đợi ghi tuần tự
  const chatStateRef = useRef(chatState);
  chatStateRef.current = chatState;
  const activeScopeRef = useRef(storageKey);
  const activeUserIdRef = useRef<string | undefined>(user?.id);
  const scopeGenerationRef = useRef(0);
  const lastOpIdRef = useRef(Date.now() * 1000);
  const lastLoadedScopeRef = useRef<string | null>(null);
  const prevVisibleRef = useRef<boolean>(visible);
  const scopeRevisionsRef = useRef<Map<string, number>>(new Map());
  const saveQueuesRef = useRef<Map<string, Promise<void>>>(new Map());
  const workingHistoryByScopeRef = useRef<Map<string, AIChatMessage[]>>(new Map());
  const clearingScopesRef = useRef<Set<string>>(new Set());
  // Lưu revision đã xác nhận bởi chính chuỗi ghi cục bộ (PUT/DELETE, không bao gồm GET) kèm opId
  const lastLocalWriteAckRef = useRef<
    Map<string, { revision: number; messageIds: string[]; opId: number }>
  >(new Map());

  const nextOpId = useCallback(() => {
    const candidate = Math.max(lastOpIdRef.current + 1, Date.now() * 1000);
    lastOpIdRef.current = candidate;
    return candidate;
  }, []);

  useLayoutEffect(() => {
    const prevScope = activeScopeRef.current;
    const prevUserId = activeUserIdRef.current;
    if (prevScope !== storageKey || prevUserId !== user?.id) {
      workingHistoryByScopeRef.current.delete(prevScope);
      if (prevUserId !== user?.id) {
        workingHistoryByScopeRef.current.clear();
      }
    }
    activeScopeRef.current = storageKey;
    activeUserIdRef.current = user?.id;
  }, [storageKey, user?.id]);

  const getRevision = useCallback((scope: string) => {
    return scopeRevisionsRef.current.get(scope) || 0;
  }, []);

  const bumpRevision = useCallback((scope: string) => {
    const next = (scopeRevisionsRef.current.get(scope) || 0) + 1;
    scopeRevisionsRef.current.set(scope, next);
    return next;
  }, []);

  const messages = chatState.scopeKey === storageKey ? chatState.messages : [WELCOME_MSG];
  const isScopeLoaded = chatState.scopeKey === storageKey && chatState.loaded;
  const isScopeClearing = clearingScopeKey === storageKey;

  const enqueueScopedWrite = useCallback((scope: string, task: () => Promise<void>) => {
    const previous = saveQueuesRef.current.get(scope) || Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    saveQueuesRef.current.set(scope, next);
    void next.finally(() => {
      if (saveQueuesRef.current.get(scope) === next) {
        saveQueuesRef.current.delete(scope);
      }
    });
    return next;
  }, []);

  const persistMessagesForScope = useCallback(
    (
      targetScopeKey: string,
      targetPendingDeleteKey: string,
      targetLocalCleanupKey: string,
      targetServerRevKey: string,
      targetProjectId: string | undefined,
      targetUserId: string | undefined,
      nextMessagesInput:
        | AIChatMessage[]
        | ((latestMessages: AIChatMessage[]) => AIChatMessage[] | null),
      turnRevision: { current: number },
      options?: { expectedLocalScopeRevision?: number; writeId?: string }
    ) => {
      // Tạo opId bền vững qua các lần khởi động lại trước khi xếp hàng
      const saveOpId = nextOpId();
      const writeId =
        options?.writeId || `w-${saveOpId}-${Math.random().toString(36).slice(2, 8)}`;

      return enqueueScopedWrite(targetScopeKey, async () => {
        // Nếu là thao tác phục hồi snapshot cũ, bỏ qua nếu cuộc hội thoại đã có lượt mới làm đổi revision cục bộ
        if (
          options?.expectedLocalScopeRevision !== undefined &&
          getRevision(targetScopeKey) !== options.expectedLocalScopeRevision
        ) {
          return;
        }

        // Kiểm tra xem có lệnh xóa nào mới hơn thao tác lưu này không (không xóa marker trước khi ghi snapshot thay thế)
        let supersededClearMarker: ClearIntentMarker | null = null;
        try {
          const rawClearMarker = await AsyncStorage.getItem(targetLocalCleanupKey);
          const clearMarker = parseClearIntentMarker(rawClearMarker);
          if (clearMarker) {
            if (clearMarker.opId > saveOpId) {
              return;
            }
            if (saveOpId > clearMarker.opId) {
              supersededClearMarker = clearMarker;
            }
          }
        } catch {
          // Ignore marker read error
        }

        // Nếu truyền hàm biến đổi, ưu tiên dùng working history đã tuần tự hóa của scope này
        // (giữ đủ các lượt ghi đã được chấp nhận kể cả khi ghi AsyncStorage trước đó thất bại)
        let nextMessages: AIChatMessage[];
        if (typeof nextMessagesInput === 'function') {
          let baseMessages: AIChatMessage[] | null =
            workingHistoryByScopeRef.current.get(targetScopeKey) || null;
          let rejectedPendingClearBase = false;
          if (!baseMessages) {
            try {
              const rawStored = await AsyncStorage.getItem(targetScopeKey);
              if (rawStored) {
                const parsedStored = JSON.parse(rawStored);
                if (parsedStored && Array.isArray(parsedStored.messages)) {
                  if (
                    supersededClearMarker?.localPending &&
                    parsedStored.replacedClearId !== supersededClearMarker.clearId
                  ) {
                    rejectedPendingClearBase = true;
                  } else {
                    baseMessages = parsedStored.messages as AIChatMessage[];
                  }
                }
              }
            } catch {
              // Fallback sang state hiện tại nếu không đọc được cache
            }
          }
          if (
            !baseMessages &&
            !rejectedPendingClearBase &&
            chatStateRef.current.scopeKey === targetScopeKey
          ) {
            baseMessages = chatStateRef.current.messages;
          }
          if (!baseMessages) {
            return;
          }
          const resolved = nextMessagesInput(baseMessages);
          if (!resolved) {
            return;
          }
          nextMessages = resolved;
        } else {
          nextMessages = nextMessagesInput;
        }
        workingHistoryByScopeRef.current.set(targetScopeKey, nextMessages);

        // Nếu tiền nhiệm cục bộ (PUT trước hoặc DELETE vừa hoàn tất) đã được server xác nhận và snapshot này bao gồm tiền nhiệm đó,
        // dùng revision đã xác nhận đó (tuyệt đối không dùng revision chỉ quan sát từ GET)
        let baseRevisionForPut = turnRevision.current;
        const lastLocalAck = lastLocalWriteAckRef.current.get(targetScopeKey);
        if (lastLocalAck && lastLocalAck.revision > baseRevisionForPut) {
          const nextIdSet = new Set(nextMessages.map((m) => m.id));
          const includesPredecessor = lastLocalAck.messageIds.every((id) => nextIdSet.has(id));
          if (includesPredecessor) {
            baseRevisionForPut = lastLocalAck.revision;
            turnRevision.current = lastLocalAck.revision;
          }
        }

        const isServerBacked = Boolean(targetProjectId && targetUserId);
        const localPayload: StoredChatPayload = {
          messages: nextMessages,
          updatedAt: Date.now(),
          serverRevision: baseRevisionForPut,
          dirty: isServerBacked,
          serverTruncated: false,
          ...(isServerBacked ? { pendingWriteId: writeId } : {}),
          ...(supersededClearMarker ? { replacedClearId: supersededClearMarker.clearId } : {}),
        };

        if (targetProjectId && projectStore.isProjectDeleted(targetProjectId)) {
          workingHistoryByScopeRef.current.delete(targetScopeKey);
          return;
        }

        let localWriteSucceeded = false;
        try {
          // Ghi snapshot thay thế gắn với clearId và pendingWriteId TRƯỚC khi đánh dấu dọn dẹp cục bộ đã xong
          await AsyncStorage.setItem(targetScopeKey, JSON.stringify(localPayload));
          localWriteSucceeded = true;
        } catch (err) {
          console.warn('[AIChatPanel] Không thể lưu lịch sử chat vào bộ nhớ cục bộ:', err);
        }

        if (targetProjectId && projectStore.isProjectDeleted(targetProjectId)) {
          await AsyncStorage.multiRemove([
            targetScopeKey,
            targetPendingDeleteKey,
            targetLocalCleanupKey,
            targetServerRevKey,
          ]).catch(() => undefined);
          return;
        }

        // Chỉ cập nhật/gỡ targetLocalCleanupKey SAU KHI snapshot thay thế đã được ghi bền vững
        if (localWriteSucceeded && supersededClearMarker && supersededClearMarker.localPending) {
          try {
            const latestRaw = await AsyncStorage.getItem(targetLocalCleanupKey);
            const latestMarker = parseClearIntentMarker(latestRaw);
            if (latestMarker && latestMarker.clearId === supersededClearMarker.clearId) {
              if (latestMarker.serverPending) {
                await AsyncStorage.setItem(
                  targetLocalCleanupKey,
                  JSON.stringify({ ...latestMarker, localPending: false })
                ).catch(() => undefined);
              } else {
                await AsyncStorage.removeItem(targetLocalCleanupKey).catch(() => undefined);
              }
            }
          } catch {
            // Ignore marker update error
          }
        }

        if (!isServerBacked || !targetProjectId || !targetUserId) {
          return;
        }
        // Chỉ gửi PUT khi phiên tài khoản tạo ra thay đổi vẫn đang hoạt động và dự án chưa bị xóa
        if (activeUserIdRef.current !== targetUserId || projectStore.isProjectDeleted(targetProjectId)) {
          return;
        }

        const { payload: boundedMessages, trimmed } = fitMessagesToByteBudget(nextMessages);
        if (boundedMessages.length === 0 && nextMessages.length > 0) {
          if (activeScopeRef.current === targetScopeKey) {
            setServerSyncWarning('Lịch sử vượt quá giới hạn dung lượng máy chủ; bản đầy đủ vẫn được lưu cục bộ.');
          }
          return;
        }

        try {
          const saveRes = await api.saveAIChatHistory(targetProjectId, boundedMessages, {
            expectedRevision: baseRevisionForPut,
            writeId,
          });
          if (projectStore.isProjectDeleted(targetProjectId)) {
            await AsyncStorage.multiRemove([
              targetScopeKey,
              targetPendingDeleteKey,
              targetLocalCleanupKey,
              targetServerRevKey,
            ]).catch(() => undefined);
            return;
          }
          const confirmedRevision = Number(saveRes.data?.revision) || baseRevisionForPut + 1;
          turnRevision.current = confirmedRevision;
          lastLocalWriteAckRef.current.set(targetScopeKey, {
            revision: confirmedRevision,
            messageIds: nextMessages.map((m) => m.id),
            opId: saveOpId,
          });
          await AsyncStorage.setItem(targetServerRevKey, String(confirmedRevision)).catch(() => undefined);

          // Chỉ gỡ pendingDeleteKey / clearMarker nếu lệnh xóa đó xảy ra TRƯỚC thao tác PUT này
          const pendingDelRaw = await AsyncStorage.getItem(targetPendingDeleteKey).catch(() => null);
          const pendingDelMarker = parsePendingDeleteMarker(pendingDelRaw);
          if (pendingDelMarker && pendingDelMarker.opId < saveOpId) {
            await AsyncStorage.removeItem(targetPendingDeleteKey).catch(() => undefined);
          }
          const clearRawAfterPut = await AsyncStorage.getItem(targetLocalCleanupKey).catch(() => null);
          const clearMarkerAfterPut = parseClearIntentMarker(clearRawAfterPut);
          if (clearMarkerAfterPut && clearMarkerAfterPut.opId < saveOpId) {
            await AsyncStorage.removeItem(targetLocalCleanupKey).catch(() => undefined);
          }

          // Nếu không có lệnh xóa mới hơn diễn ra trong lúc PUT đang bay, cập nhật snapshot đã xác nhận
          if (!clearMarkerAfterPut || clearMarkerAfterPut.opId < saveOpId) {
            await AsyncStorage.setItem(
              targetScopeKey,
              JSON.stringify({
                messages: nextMessages,
                updatedAt: saveRes.data?.updatedAt || localPayload.updatedAt,
                serverRevision: confirmedRevision,
                dirty: false,
                serverTruncated: trimmed,
                ...(supersededClearMarker ? { replacedClearId: supersededClearMarker.clearId } : {}),
              } satisfies StoredChatPayload)
            ).catch(() => undefined);

            if (activeScopeRef.current === targetScopeKey) {
              setChatState((prev) =>
                prev.scopeKey === targetScopeKey
                  ? { ...prev, baseRevision: confirmedRevision }
                  : prev
              );
              setPendingDeleteFailed(false);
              setServerSyncWarning(
                trimmed
                  ? 'Bản lưu trên máy chủ đã rút gọn do giới hạn dung lượng; bản đầy đủ vẫn được giữ trên thiết bị này.'
                  : null
              );
            }
          }
        } catch (err) {
          // Xung đột phiên bản (409) hoặc lỗi mạng: giữ bản đầy đủ ở cục bộ (dirty: true, pendingWriteId) để đối chiếu/replay
          if (activeScopeRef.current === targetScopeKey) {
            if (err instanceof ApiError && err.status === 409) {
              setServerSyncWarning(
                'Xung đột phiên bản với máy chủ; đang giữ tin nhắn cục bộ để đối chiếu.'
              );
            } else {
              setServerSyncWarning(
                'Chưa đồng bộ được lịch sử mới nhất lên máy chủ; dữ liệu vẫn được lưu cục bộ.'
              );
            }
          }
        }
      });
    },
    [enqueueScopedWrite, getRevision, nextOpId]
  );

  // Thực thi DELETE bên trong một tác vụ đã được xếp hàng theo scope
  const executeServerDeleteInQueue = useCallback(
    async (
      targetProjectId: string | undefined,
      targetUserId: string | undefined,
      targetPendingDeleteKey: string,
      targetLocalCleanupKey: string,
      targetServerRevKey: string,
      targetScopeKey: string,
      expectedClearOpId?: number
    ): Promise<boolean> => {
      if (!targetProjectId || !targetUserId) {
        await AsyncStorage.removeItem(targetPendingDeleteKey).catch(() => undefined);
        if (activeScopeRef.current === targetScopeKey) {
          setPendingDeleteFailed(false);
        }
        return true;
      }

      const rawClear = await AsyncStorage.getItem(targetLocalCleanupKey).catch(() => null);
      const clearMarker = parseClearIntentMarker(rawClear);
      const rawPendingDel = await AsyncStorage.getItem(targetPendingDeleteKey).catch(() => null);
      const pendingDelMarker = parsePendingDeleteMarker(rawPendingDel);

      const hasPendingWork = Boolean(pendingDelMarker) || Boolean(clearMarker?.serverPending);
      if (!hasPendingWork) {
        if (activeScopeRef.current === targetScopeKey) {
          setPendingDeleteFailed(false);
        }
        return true;
      }

      // Không gửi DELETE bằng thông tin xác thực của tài khoản khác
      if (activeUserIdRef.current !== targetUserId) {
        return false;
      }

      const targetOpId =
        expectedClearOpId ?? clearMarker?.opId ?? pendingDelMarker?.opId ?? 0;
      const clearId = clearMarker?.clearId ?? pendingDelMarker?.clearId;
      const expectedRevision = clearMarker?.baseRevision ?? pendingDelMarker?.baseRevision;

      // Chỉ tự động thử lại DELETE khi marker có baseRevision xác định;
      // với marker cũ chỉ có timestamp (không có baseRevision), dừng tự động xóa để tải & hiển thị lịch sử hiện tại trước khi người dùng xác nhận xóa lại.
      if (typeof expectedRevision !== 'number') {
        if (pendingDelMarker && pendingDelMarker.opId <= targetOpId) {
          await AsyncStorage.removeItem(targetPendingDeleteKey).catch(() => undefined);
        }
        if (clearMarker && clearMarker.opId <= targetOpId) {
          if (clearMarker.localPending) {
            await AsyncStorage.setItem(
              targetLocalCleanupKey,
              JSON.stringify({ ...clearMarker, serverPending: false })
            ).catch(() => undefined);
          } else {
            await AsyncStorage.removeItem(targetLocalCleanupKey).catch(() => undefined);
          }
        }
        if (activeScopeRef.current === targetScopeKey) {
          setPendingDeleteFailed(false);
          setServerSyncWarning(
            'Đã hủy lệnh xóa cũ chưa có phiên bản gốc; vui lòng kiểm tra lịch sử hiện tại và nhấn xóa lại nếu cần.'
          );
        }
        return true;
      }

      try {
        const clearRes = await api.clearAIChatHistory(targetProjectId, {
          clearId,
          expectedRevision,
        });
        const confirmedRev = Number(clearRes.data?.revision) || 0;
        if (confirmedRev > 0) {
          lastLocalWriteAckRef.current.set(targetScopeKey, {
            revision: confirmedRev,
            messageIds: [],
            opId: targetOpId,
          });
          await AsyncStorage.setItem(targetServerRevKey, String(confirmedRev)).catch(() => undefined);
        }

        // Chỉ gỡ pendingDeleteKey nếu không thuộc lệnh xóa mới hơn
        const latestPendingRaw = await AsyncStorage.getItem(targetPendingDeleteKey).catch(() => null);
        const latestPending = parsePendingDeleteMarker(latestPendingRaw);
        if (latestPending && latestPending.opId <= targetOpId) {
          await AsyncStorage.removeItem(targetPendingDeleteKey).catch(() => undefined);
        }

        // Xác nhận serverPending trong bản ghi kết hợp clearRecord mà không đụng tới lệnh xóa mới hơn
        const latestClearRaw = await AsyncStorage.getItem(targetLocalCleanupKey).catch(() => null);
        const latestClear = parseClearIntentMarker(latestClearRaw);
        if (latestClear && latestClear.opId <= targetOpId) {
          if (latestClear.localPending) {
            await AsyncStorage.setItem(
              targetLocalCleanupKey,
              JSON.stringify({ ...latestClear, serverPending: false })
            ).catch(() => undefined);
          } else {
            await AsyncStorage.removeItem(targetLocalCleanupKey).catch(() => undefined);
          }
        }

        if (activeScopeRef.current === targetScopeKey) {
          if (confirmedRev > 0) {
            setChatState((prev) =>
              prev.scopeKey === targetScopeKey
                ? { ...prev, baseRevision: confirmedRev }
                : prev
            );
          }
          setPendingDeleteFailed(false);
          setServerSyncWarning(null);
        }
        return true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          // Máy chủ đã có revision mới hơn -> không ghi đè, gỡ pending delete cũ và báo xung đột
          const latestPendingRaw = await AsyncStorage.getItem(targetPendingDeleteKey).catch(() => null);
          const latestPending = parsePendingDeleteMarker(latestPendingRaw);
          if (latestPending && latestPending.opId <= targetOpId) {
            await AsyncStorage.removeItem(targetPendingDeleteKey).catch(() => undefined);
          }
          const latestClearRaw = await AsyncStorage.getItem(targetLocalCleanupKey).catch(() => null);
          const latestClear = parseClearIntentMarker(latestClearRaw);
          if (latestClear && latestClear.opId <= targetOpId) {
            if (latestClear.localPending) {
              await AsyncStorage.setItem(
                targetLocalCleanupKey,
                JSON.stringify({ ...latestClear, serverPending: false })
              ).catch(() => undefined);
            } else {
              await AsyncStorage.removeItem(targetLocalCleanupKey).catch(() => undefined);
            }
          }
          if (activeScopeRef.current === targetScopeKey) {
            setPendingDeleteFailed(false);
            setServerSyncWarning('Lịch sử trên máy chủ đã có cập nhật mới hơn lệnh xóa trước đó.');
          }
          return true;
        }
        if (activeScopeRef.current === targetScopeKey) {
          setPendingDeleteFailed(true);
        }
        return false;
      }
    },
    []
  );

  const retryServerDelete = useCallback(
    async (
      targetProjectId: string | undefined,
      targetUserId: string | undefined,
      targetPendingDeleteKey: string,
      targetLocalCleanupKey: string,
      targetServerRevKey: string,
      targetScopeKey: string,
      expectedClearOpId?: number
    ): Promise<boolean> => {
      let cleared = false;
      await enqueueScopedWrite(targetScopeKey, async () => {
        cleared = await executeServerDeleteInQueue(
          targetProjectId,
          targetUserId,
          targetPendingDeleteKey,
          targetLocalCleanupKey,
          targetServerRevKey,
          targetScopeKey,
          expectedClearOpId
        );
      });
      return cleared;
    },
    [enqueueScopedWrite, executeServerDeleteInQueue]
  );

  // Tải & làm mới lịch sử trò chuyện khi đổi scope hoặc khi panel chuyển sang hiển thị (visible)
  useEffect(() => {
    const scopeChanged = lastLoadedScopeRef.current !== storageKey;
    const becameVisible = visible && !prevVisibleRef.current;
    prevVisibleRef.current = visible;

    if (!scopeChanged && !becameVisible) {
      return;
    }
    lastLoadedScopeRef.current = storageKey;

    let isMounted = true;
    const targetScope = storageKey;
    const targetPendingDelete = pendingDeleteKey;
    const targetLocalCleanup = localCleanupKey;
    const targetServerRev = serverRevKey;
    const targetProjectId = projectId;
    const targetUserId = user?.id;
    const isServerBacked = Boolean(targetProjectId && targetUserId);

    if (scopeChanged) {
      // Vô hiệu hóa các phản hồi AI cũ của scope trước khi chuyển dự án / tác giả
      scopeGenerationRef.current += 1;
      setIsLoading(false);
      setPendingDeleteFailed(false);
      setServerSyncWarning(null);
      setChatState((prev) =>
        prev.scopeKey === targetScope
          ? prev
          : { scopeKey: targetScope, messages: [WELCOME_MSG], loaded: false, baseRevision: 0 }
      );
    }

    const startRevision = getRevision(targetScope);

    async function loadHistory() {
      // Chờ các thao tác ghi/xóa đang chờ của chính scope này hoàn tất trước khi đọc
      const pendingWrite = saveQueuesRef.current.get(targetScope);
      if (pendingWrite) {
        await pendingWrite.catch(() => undefined);
      }
      if (!isMounted || activeScopeRef.current !== targetScope) return;

      // Đọc serverRevision quan sát gần nhất (độc lập với snapshot cục bộ)
      let lastObservedServerRev = 0;
      try {
        const rawRev = await AsyncStorage.getItem(targetServerRev);
        lastObservedServerRev = Number(rawRev) || 0;
      } catch {
        // Ignore read error
      }

      // Xử lý bản ghi dọn dẹp bền vững: chỉ khôi phục snapshot thay thế nếu khớp clearId, ngược lại tiếp tục dọn bản cũ
      let localCleanupPending = false;
      let clearMarker: ClearIntentMarker | null = null;
      try {
        const rawCleanup = await AsyncStorage.getItem(targetLocalCleanup);
        clearMarker = parseClearIntentMarker(rawCleanup);
        if (clearMarker) {
          // Đảm bảo mọi lệnh lưu sau khi khởi động lại đều có opId lớn hơn lệnh xóa đã lưu trước đó
          lastOpIdRef.current = Math.max(lastOpIdRef.current, clearMarker.opId);
        }
        if (clearMarker?.localPending) {
          // Tuần tự hóa dọn dẹp phục hồi trong hàng đợi của chính scope này để không xóa nhầm snapshot mới hơn
          await enqueueScopedWrite(targetScope, async () => {
            if (
              !isMounted ||
              activeScopeRef.current !== targetScope ||
              getRevision(targetScope) !== startRevision
            ) {
              return;
            }

            let latestCleanupRaw: string | null = null;
            try {
              latestCleanupRaw = await AsyncStorage.getItem(targetLocalCleanup);
            } catch {
              localCleanupPending = true;
              return;
            }

            const latestMarker = parseClearIntentMarker(latestCleanupRaw);
            clearMarker = latestMarker;
            if (!latestMarker?.localPending) {
              return;
            }

            let existingRaw: string | null = null;
            let existingReadFailed = false;
            try {
              existingRaw = await AsyncStorage.getItem(targetScope);
            } catch {
              // Phân biệt lỗi đọc AsyncStorage với trường hợp key không tồn tại: giữ cleanup pending khi đọc thất bại
              existingReadFailed = true;
              localCleanupPending = true;
            }

            if (existingReadFailed) {
              return;
            }

            if (
              !isMounted ||
              activeScopeRef.current !== targetScope ||
              getRevision(targetScope) !== startRevision
            ) {
              return;
            }

            const existingSnap = existingRaw ? parseStoredChatPayload(existingRaw) : null;
            if (existingSnap && existingSnap.replacedClearId === latestMarker.clearId) {
              // Snapshot thay thế đã được ghi bền vững gắn với đúng clearId này -> giữ nguyên snapshot và hoàn tất cờ localPending
              workingHistoryByScopeRef.current.set(targetScope, existingSnap.messages);
              if (latestMarker.serverPending) {
                clearMarker = { ...latestMarker, localPending: false };
                await AsyncStorage.setItem(targetLocalCleanup, JSON.stringify(clearMarker)).catch(() => undefined);
              } else {
                await AsyncStorage.removeItem(targetLocalCleanup).catch(() => undefined);
                clearMarker = null;
              }
            } else {
              localCleanupPending = true;
              try {
                await AsyncStorage.removeItem(targetScope);
                workingHistoryByScopeRef.current.delete(targetScope);
                localCleanupPending = false;
                if (latestMarker.serverPending) {
                  clearMarker = { ...latestMarker, localPending: false };
                  await AsyncStorage.setItem(targetLocalCleanup, JSON.stringify(clearMarker)).catch(() => undefined);
                } else {
                  await AsyncStorage.removeItem(targetLocalCleanup).catch(() => undefined);
                  clearMarker = null;
                }
              } catch {
                // Giữ localCleanupPending = true để không khôi phục bản đã đánh dấu xóa
              }
            }
          });
        }
      } catch {
        // Ignore storage read error
      }

      if (!isMounted || activeScopeRef.current !== targetScope) return;

      let localPayload: StoredChatPayload | null = null;
      if (!localCleanupPending) {
        try {
          const raw = await AsyncStorage.getItem(targetScope);
          if (raw) {
            localPayload = parseStoredChatPayload(raw);
          }
        } catch {
          // Ignore parse error
        }
      }

      // Luôn dùng serverRevision đi kèm chính snapshot hiện có (cả bản sạch lẫn bản dirty);
      // chỉ fallback sang lastObservedServerRev khi không có snapshot cục bộ (lịch sử trống đã xác nhận).
      const isDirtyLocal = Boolean(localPayload?.dirty);
      const snapshotBaseRev =
        localPayload !== null ? localPayload.serverRevision || 0 : lastObservedServerRev;
      const hasLocalUserMessages = Boolean(
        localPayload?.messages.some((m) => m.role === 'user')
      );

      if (isServerBacked) {
        const rawPendingDel = await AsyncStorage.getItem(targetPendingDelete).catch(() => null);
        const pendingDelMarker = parsePendingDeleteMarker(rawPendingDel);
        if (pendingDelMarker) {
          lastOpIdRef.current = Math.max(lastOpIdRef.current, pendingDelMarker.opId);
        }
        const hasPendingDelete = Boolean(pendingDelMarker) || Boolean(clearMarker?.serverPending);
        if (hasPendingDelete) {
          if (hasLocalUserMessages && localPayload) {
            // Chỉ xếp hàng lưu phục hồi khi revision cục bộ chưa thay đổi bởi lượt mới
            if (getRevision(targetScope) === startRevision) {
              void persistMessagesForScope(
                targetScope,
                targetPendingDelete,
                targetLocalCleanup,
                targetServerRev,
                targetProjectId,
                targetUserId,
                localPayload.messages,
                { current: snapshotBaseRev },
                {
                  expectedLocalScopeRevision: startRevision,
                  writeId: localPayload.pendingWriteId,
                }
              );
            }
          } else {
            const clearOpId = clearMarker?.opId ?? pendingDelMarker?.opId ?? 0;
            const cleared = await retryServerDelete(
              targetProjectId,
              targetUserId,
              targetPendingDelete,
              targetLocalCleanup,
              targetServerRev,
              targetScope,
              clearOpId
            );
            if (!isMounted || activeScopeRef.current !== targetScope) return;
            const revAfterRetry =
              Number(await AsyncStorage.getItem(targetServerRev).catch(() => null)) ||
              lastObservedServerRev;
            if (!cleared) {
              if (getRevision(targetScope) === startRevision) {
                setChatState({
                  scopeKey: targetScope,
                  messages: [{ ...WELCOME_MSG, timestamp: Date.now() }],
                  loaded: true,
                  baseRevision: revAfterRetry,
                });
              }
              return;
            }
            lastObservedServerRev = revAfterRetry;
          }
        }
      }

      if (!isMounted || activeScopeRef.current !== targetScope) return;
      // Chỉ đánh dấu loaded trước GET nếu là hội thoại local-only HOẶC đã có bản cache cục bộ;
      // với hội thoại đã đăng nhập có cache trống, chờ GET ban đầu hoàn tất để biết server revision.
      if (getRevision(targetScope) === startRevision && (!isServerBacked || localPayload !== null)) {
        setChatState({
          scopeKey: targetScope,
          messages: localPayload?.messages || [WELCOME_MSG],
          loaded: true,
          baseRevision: snapshotBaseRev,
        });
      }

      if (isServerBacked && activeUserIdRef.current === targetUserId) {
        try {
          const res = await api.getAIChatHistory(targetProjectId!);
          const isStillCurrent = () =>
            isMounted &&
            activeScopeRef.current === targetScope &&
            activeUserIdRef.current === targetUserId &&
            getRevision(targetScope) === startRevision;

          if (!isStillCurrent()) return;

          const remoteMsgs =
            res.success && Array.isArray(res.data?.messages) ? res.data.messages : [];
          const remoteUpdatedAt = Number(res.data?.updatedAt) || 0;
          const remoteRevision = Number(res.data?.revision) || 0;
          const remoteDeletedAt = res.data?.deletedAt || null;
          const remoteLastWriteId = res.data?.lastWriteId || null;
          const localServerRevision = snapshotBaseRev;
          const hasUnackedLocalChanges = isDirtyLocal;
          const localHasFullOfTruncatedServer = Boolean(localPayload?.serverTruncated);
          const pendingWriteAlreadyAcked = Boolean(
            hasUnackedLocalChanges &&
            localPayload?.pendingWriteId &&
            remoteLastWriteId &&
            remoteLastWriteId === localPayload.pendingWriteId
          );

          if (remoteMsgs.length > 0) {
            if (!hasUnackedLocalChanges || pendingWriteAlreadyAcked) {
              await enqueueScopedWrite(targetScope, async () => {
                if (!isStillCurrent()) return;
                if (remoteRevision > 0) {
                  await AsyncStorage.setItem(targetServerRev, String(remoteRevision)).catch(() => undefined);
                }
                if (!isStillCurrent()) return;

                if (pendingWriteAlreadyAcked && localPayload) {
                  // Server đã xác nhận chính thao tác ghi pendingWriteId này -> khôi phục xác nhận và nâng base revision
                  await AsyncStorage.setItem(
                    targetScope,
                    JSON.stringify({
                      messages: localPayload.messages,
                      updatedAt: remoteUpdatedAt || localPayload.updatedAt,
                      serverRevision: remoteRevision,
                      dirty: false,
                      serverTruncated: localPayload.messages.length > remoteMsgs.length,
                      ...(localPayload.replacedClearId
                        ? { replacedClearId: localPayload.replacedClearId }
                        : {}),
                    } satisfies StoredChatPayload)
                  ).catch(() => undefined);
                  if (!isStillCurrent()) return;
                  workingHistoryByScopeRef.current.set(targetScope, localPayload.messages);
                  setChatState({
                    scopeKey: targetScope,
                    messages: localPayload.messages,
                    loaded: true,
                    baseRevision: remoteRevision,
                  });
                  setServerSyncWarning(null);
                  return;
                }

                // Nếu bản server ở cùng revision đã xác nhận và đang là bản rút gọn, giữ nguyên bản đầy đủ cục bộ
                if (localHasFullOfTruncatedServer && remoteRevision === localServerRevision) {
                  workingHistoryByScopeRef.current.set(targetScope, localPayload!.messages);
                  setChatState({
                    scopeKey: targetScope,
                    messages: localPayload!.messages,
                    loaded: true,
                    baseRevision: remoteRevision,
                  });
                  return;
                }

                if (!hasLocalUserMessages || remoteRevision >= localServerRevision) {
                  await AsyncStorage.setItem(
                    targetScope,
                    JSON.stringify({
                      messages: remoteMsgs,
                      updatedAt: remoteUpdatedAt || Date.now(),
                      serverRevision: remoteRevision,
                      dirty: false,
                      serverTruncated: false,
                    } satisfies StoredChatPayload)
                  ).catch(() => undefined);
                  if (!isStillCurrent()) return;
                  workingHistoryByScopeRef.current.set(targetScope, remoteMsgs);
                  setChatState({
                    scopeKey: targetScope,
                    messages: remoteMsgs,
                    loaded: true,
                    baseRevision: remoteRevision,
                  });
                }
              });
            } else if (localPayload && remoteRevision <= localServerRevision) {
              // Bản cục bộ có thay đổi chưa đồng bộ và máy chủ chưa có revision mới hơn -> đẩy lên máy chủ
              if (remoteRevision > 0) {
                await AsyncStorage.setItem(targetServerRev, String(remoteRevision)).catch(() => undefined);
              }
              if (!isStillCurrent()) return;
              setChatState({
                scopeKey: targetScope,
                messages: localPayload.messages,
                loaded: true,
                baseRevision: localServerRevision,
              });
              void persistMessagesForScope(
                targetScope,
                targetPendingDelete,
                targetLocalCleanup,
                targetServerRev,
                targetProjectId,
                targetUserId,
                localPayload.messages,
                { current: localServerRevision },
                {
                  expectedLocalScopeRevision: startRevision,
                  writeId: localPayload.pendingWriteId,
                }
              );
            } else {
              // Xung đột từ một thao tác ghi khác trên máy chủ -> giữ nguyên tin chưa đồng bộ ở cục bộ và cảnh báo
              if (remoteRevision > 0) {
                await AsyncStorage.setItem(targetServerRev, String(remoteRevision)).catch(() => undefined);
              }
              if (!isStillCurrent()) return;
              setChatState({
                scopeKey: targetScope,
                messages: localPayload?.messages || [WELCOME_MSG],
                loaded: true,
                baseRevision: localServerRevision,
              });
              setServerSyncWarning('Phát hiện thay đổi chưa đồng bộ với máy chủ; đang giữ bản trên thiết bị này.');
            }
          } else {
            const serverConfirmedDeletion = Boolean(remoteDeletedAt) || remoteRevision > 0;
            if (serverConfirmedDeletion) {
              if (!hasUnackedLocalChanges) {
                // Xếp hàng xóa cache cục bộ và giữ lại remoteRevision cho các lần lưu sau
                await enqueueScopedWrite(targetScope, async () => {
                  if (!isStillCurrent()) return;
                  await AsyncStorage.removeItem(targetScope).catch(() => undefined);
                  workingHistoryByScopeRef.current.delete(targetScope);
                  if (remoteRevision > 0) {
                    await AsyncStorage.setItem(targetServerRev, String(remoteRevision)).catch(() => undefined);
                  }
                  if (!isStillCurrent()) return;
                  setChatState({
                    scopeKey: targetScope,
                    messages: [WELCOME_MSG],
                    loaded: true,
                    baseRevision: remoteRevision,
                  });
                });
              } else if (localPayload && remoteRevision <= localServerRevision) {
                if (remoteRevision > 0) {
                  await AsyncStorage.setItem(targetServerRev, String(remoteRevision)).catch(() => undefined);
                }
                if (!isStillCurrent()) return;
                setChatState({
                  scopeKey: targetScope,
                  messages: localPayload.messages,
                  loaded: true,
                  baseRevision: localServerRevision,
                });
                void persistMessagesForScope(
                  targetScope,
                  targetPendingDelete,
                  targetLocalCleanup,
                  targetServerRev,
                  targetProjectId,
                  targetUserId,
                  localPayload.messages,
                  { current: localServerRevision },
                  {
                    expectedLocalScopeRevision: startRevision,
                    writeId: localPayload.pendingWriteId,
                  }
                );
              } else {
                if (remoteRevision > 0) {
                  await AsyncStorage.setItem(targetServerRev, String(remoteRevision)).catch(() => undefined);
                }
                if (!isStillCurrent()) return;
                setChatState({
                  scopeKey: targetScope,
                  messages: localPayload?.messages || [WELCOME_MSG],
                  loaded: true,
                  baseRevision: localServerRevision,
                });
                setServerSyncWarning('Lịch sử đã bị xóa ở nơi khác nhưng thiết bị này còn tin nhắn chưa đồng bộ.');
              }
            } else if (localPayload && hasLocalUserMessages) {
              // Hội thoại chưa từng đồng bộ lên máy chủ (revision === 0 && !deletedAt) -> tải lên máy chủ
              setChatState({
                scopeKey: targetScope,
                messages: localPayload.messages,
                loaded: true,
                baseRevision: 0,
              });
              void persistMessagesForScope(
                targetScope,
                targetPendingDelete,
                targetLocalCleanup,
                targetServerRev,
                targetProjectId,
                targetUserId,
                localPayload.messages,
                { current: 0 },
                {
                  expectedLocalScopeRevision: startRevision,
                  writeId: localPayload.pendingWriteId,
                }
              );
            } else {
              // Máy chủ chưa có lịch sử và cục bộ trống -> đánh dấu đã tải xong với revision 0
              setChatState({
                scopeKey: targetScope,
                messages: [WELCOME_MSG],
                loaded: true,
                baseRevision: 0,
              });
            }
          }
        } catch {
          // Lỗi mạng / lỗi server: vẫn cho phép dùng bản cục bộ hoặc soạn nháp offline
          if (
            isMounted &&
            activeScopeRef.current === targetScope &&
            activeUserIdRef.current === targetUserId &&
            getRevision(targetScope) === startRevision
          ) {
            setChatState({
              scopeKey: targetScope,
              messages: localPayload?.messages || [WELCOME_MSG],
              loaded: true,
              baseRevision: snapshotBaseRev,
            });
          }
        }
      }
    }

    void loadHistory();
    return () => {
      isMounted = false;
    };
  }, [
    enqueueScopedWrite,
    getRevision,
    localCleanupKey,
    pendingDeleteKey,
    persistMessagesForScope,
    projectId,
    retryServerDelete,
    serverRevKey,
    storageKey,
    user?.id,
    visible,
  ]);

  // Lắng nghe sự kiện bàn phím để nâng toàn bộ khung chat lên trên bàn phím
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  React.useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : 400,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [visible, slideAnim]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const sendMessagesToAI = async (
    currentHistory: AIChatMessage[],
    capturedScope: string,
    capturedPendingDelete: string,
    capturedLocalCleanup: string,
    capturedServerRev: string,
    capturedProjectId: string | undefined,
    capturedUserId: string | undefined,
    capturedGen: number,
    turnRevision: { current: number }
  ) => {
    setIsLoading(true);
    scrollToBottom();

    try {
      // Chuyển messages sang format API (bỏ message welcome system và các trường thừa)
      const apiMessages = currentHistory
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const res = await api.chatWithAI({
        messages: apiMessages,
        projectContext: {
          projectId: capturedProjectId,
          projectTitle,
          nodes: existingNodes.slice(0, 30),
        },
      });

      // Nếu cuộc hội thoại đã bị xóa hoặc chuyển sang dự án/tác giả khác trong lúc chờ AI, bỏ qua kết quả cũ
      if (
        scopeGenerationRef.current !== capturedGen ||
        activeScopeRef.current !== capturedScope
      ) {
        return;
      }

      if (res.success && res.data) {
        const aiMsg: AIChatMessage = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: res.data.message,
          nodeData: res.data.nodeData,
          nodeDataList: res.data.nodeDataList?.length
            ? res.data.nodeDataList
            : res.data.nodeData
              ? [res.data.nodeData]
              : [],
          linkDataList: res.data.linkDataList?.length ? res.data.linkDataList : [],
          suggestedPrompt: res.data.suggestedPrompt || null,
          timestamp: Date.now(),
        };
        bumpRevision(capturedScope);
        setChatState((prev) => ({
          scopeKey: capturedScope,
          messages:
            prev.scopeKey === capturedScope
              ? [...prev.messages, aiMsg]
              : [...currentHistory, aiMsg],
          loaded: true,
          baseRevision: prev.scopeKey === capturedScope ? prev.baseRevision : turnRevision.current,
        }));
        void persistMessagesForScope(
          capturedScope,
          capturedPendingDelete,
          capturedLocalCleanup,
          capturedServerRev,
          capturedProjectId,
          capturedUserId,
          (latestMessages) => [...latestMessages, aiMsg],
          turnRevision
        );
        scrollToBottom();
      } else {
        throw new Error(res.message || 'AI không phản hồi');
      }
    } catch (err: any) {
      if (
        scopeGenerationRef.current !== capturedGen ||
        activeScopeRef.current !== capturedScope
      ) {
        return;
      }
      const errMsg: AIChatMessage = {
        id: `e-${Date.now()}`,
        role: 'system',
        content: `⚠️ ${err.message || 'Không thể kết nối AI. Hãy kiểm tra lại kết nối mạng hoặc thử lại.'}`,
        timestamp: Date.now(),
        canRetry: true,
      };
      bumpRevision(capturedScope);
      setChatState((prev) => ({
        scopeKey: capturedScope,
        messages:
          prev.scopeKey === capturedScope
            ? [...prev.messages, errMsg]
            : [...currentHistory, errMsg],
        loaded: true,
        baseRevision: prev.scopeKey === capturedScope ? prev.baseRevision : turnRevision.current,
      }));
      void persistMessagesForScope(
        capturedScope,
        capturedPendingDelete,
        capturedLocalCleanup,
        capturedServerRev,
        capturedProjectId,
        capturedUserId,
        (latestMessages) => [...latestMessages, errMsg],
        turnRevision
      );
      scrollToBottom();
    } finally {
      if (
        scopeGenerationRef.current === capturedGen &&
        activeScopeRef.current === capturedScope
      ) {
        setIsLoading(false);
      }
    }
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isLoading || !isScopeLoaded || isScopeClearing || clearingScopesRef.current.has(storageKey)) return;

    const capturedScope = storageKey;
    const capturedPendingDelete = pendingDeleteKey;
    const capturedLocalCleanup = localCleanupKey;
    const capturedServerRev = serverRevKey;
    const capturedProjectId = projectId;
    const capturedUserId = user?.id;
    const capturedGen = scopeGenerationRef.current;
    const turnRevision = {
      current: chatState.scopeKey === capturedScope ? chatState.baseRevision : 0,
    };

    Keyboard.dismiss();
    setInputText('');

    const userMsg: AIChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, userMsg];
    bumpRevision(capturedScope);
    setChatState({
      scopeKey: capturedScope,
      messages: updatedMessages,
      loaded: true,
      baseRevision: turnRevision.current,
    });
    void persistMessagesForScope(
      capturedScope,
      capturedPendingDelete,
      capturedLocalCleanup,
      capturedServerRev,
      capturedProjectId,
      capturedUserId,
      updatedMessages,
      turnRevision
    );
    await sendMessagesToAI(
      updatedMessages,
      capturedScope,
      capturedPendingDelete,
      capturedLocalCleanup,
      capturedServerRev,
      capturedProjectId,
      capturedUserId,
      capturedGen,
      turnRevision
    );
  };

  const handleRetry = async () => {
    if (isLoading || !isScopeLoaded || isScopeClearing || clearingScopesRef.current.has(storageKey)) return;
    const capturedScope = storageKey;
    const capturedPendingDelete = pendingDeleteKey;
    const capturedLocalCleanup = localCleanupKey;
    const capturedServerRev = serverRevKey;
    const capturedProjectId = projectId;
    const capturedUserId = user?.id;
    const capturedGen = scopeGenerationRef.current;
    const turnRevision = {
      current: chatState.scopeKey === capturedScope ? chatState.baseRevision : 0,
    };

    // Bỏ qua các tin nhắn lỗi hệ thống gần nhất để gửi lại
    const cleanedMessages = messages.filter((m) => m.role !== 'system');
    bumpRevision(capturedScope);
    setChatState({
      scopeKey: capturedScope,
      messages: cleanedMessages,
      loaded: true,
      baseRevision: turnRevision.current,
    });
    void persistMessagesForScope(
      capturedScope,
      capturedPendingDelete,
      capturedLocalCleanup,
      capturedServerRev,
      capturedProjectId,
      capturedUserId,
      cleanedMessages,
      turnRevision
    );
    await sendMessagesToAI(
      cleanedMessages,
      capturedScope,
      capturedPendingDelete,
      capturedLocalCleanup,
      capturedServerRev,
      capturedProjectId,
      capturedUserId,
      capturedGen,
      turnRevision
    );
  };

  const handleClearChat = () => {
    const capturedScope = storageKey;
    const capturedPendingDelete = pendingDeleteKey;
    const capturedLocalCleanup = localCleanupKey;
    const capturedServerRev = serverRevKey;
    const capturedProjectId = projectId;
    const capturedUserId = user?.id;
    const capturedBaseRevision =
      chatState.scopeKey === capturedScope ? chatState.baseRevision : 0;

    const doClear = async () => {
      if (clearingScopesRef.current.has(capturedScope)) {
        return;
      }

      // Khóa gửi tin và thử lại trước khi await ghi clearRecord để tránh có lượt mới chen vào trước khi clear được xếp hàng
      clearingScopesRef.current.add(capturedScope);
      if (activeScopeRef.current === capturedScope) {
        setClearingScopeKey(capturedScope);
      }

      const releaseClearingGuard = () => {
        clearingScopesRef.current.delete(capturedScope);
        setClearingScopeKey((prev) => (prev === capturedScope ? null : prev));
      };

      const clearOpId = nextOpId();
      const createdAt = Date.now();
      const clearId = `clear-${clearOpId}-${Math.random().toString(36).slice(2, 8)}`;
      const needsServerDelete = Boolean(capturedProjectId && capturedUserId);
      const initialClearRecord: ClearIntentMarker = {
        clearId,
        opId: clearOpId,
        createdAt,
        localPending: true,
        serverPending: needsServerDelete,
        baseRevision: capturedBaseRevision,
      };

      // Dùng clearRecord duy nhất làm điểm commit bền vững: nếu ghi thất bại thì khôi phục khả năng gửi/thử lại và dừng hẳn
      try {
        await AsyncStorage.setItem(capturedLocalCleanup, JSON.stringify(initialClearRecord));
      } catch {
        releaseClearingGuard();
        const msg = 'Không thể lưu trạng thái xóa lịch sử trò chuyện. Vui lòng thử lại.';
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert('Không thể xóa lịch sử', msg);
        }
        return;
      }

      workingHistoryByScopeRef.current.delete(capturedScope);
      bumpRevision(capturedScope);
      // Chỉ vô hiệu hóa generation và đặt lại trạng thái hiển thị/loading khi cuộc hội thoại này vẫn đang mở
      if (activeScopeRef.current === capturedScope) {
        scopeGenerationRef.current += 1;
        setIsLoading(false);
        setServerSyncWarning(null);
        const resetList = [{ ...WELCOME_MSG, timestamp: Date.now() }];
        setChatState((prev) => ({
          scopeKey: capturedScope,
          messages: resetList,
          loaded: true,
          baseRevision: prev.scopeKey === capturedScope ? prev.baseRevision : capturedBaseRevision,
        }));
      }

      // Xếp hàng tác vụ xóa TRƯỚC khi mở lại khả năng gửi tin để mọi lượt mới luôn chạy sau lệnh xóa này
      const queuedClearPromise = enqueueScopedWrite(capturedScope, async () => {
        // Bỏ qua nếu đã có thao tác xóa/lưu mới hơn sau clearOpId này
        const currentRaw = await AsyncStorage.getItem(capturedLocalCleanup).catch(() => null);
        const currentMarker = parseClearIntentMarker(currentRaw);
        if (currentMarker && currentMarker.opId > clearOpId) {
          return;
        }
        workingHistoryByScopeRef.current.delete(capturedScope);

        // Chốt baseRevision khi tác vụ xóa bắt đầu chạy trong hàng đợi:
        // chỉ nâng theo xác nhận từ thao tác ghi cục bộ liền trước (opId < clearOpId), không dùng revision từ GET.
        const lastLocalAck = lastLocalWriteAckRef.current.get(capturedScope);
        const resolvedClearBaseRev =
          lastLocalAck &&
            lastLocalAck.opId < clearOpId &&
            lastLocalAck.revision > capturedBaseRevision
            ? lastLocalAck.revision
            : capturedBaseRevision;
        const resolvedClearRecord: ClearIntentMarker = {
          ...initialClearRecord,
          baseRevision: resolvedClearBaseRev,
        };

        if (needsServerDelete) {
          await AsyncStorage.setItem(
            capturedLocalCleanup,
            JSON.stringify(resolvedClearRecord)
          ).catch(() => undefined);
          await AsyncStorage.setItem(
            capturedPendingDelete,
            JSON.stringify({
              opId: clearOpId,
              createdAt: resolvedClearRecord.createdAt,
              clearId,
              baseRevision: resolvedClearBaseRev,
            } satisfies PendingDeleteMarker)
          ).catch(() => undefined);
        }

        let localCleared = false;
        try {
          await AsyncStorage.removeItem(capturedScope);
          localCleared = true;
        } catch {
          // Giữ capturedLocalCleanup để lần tải sau tiếp tục dọn dẹp mà không khôi phục bản cũ
          if (activeScopeRef.current === capturedScope) {
            setServerSyncWarning('Chưa thể xóa hoàn toàn bộ nhớ cục bộ; hệ thống sẽ tự dọn lại khi tải lại.');
          }
        }

        if (needsServerDelete) {
          if (localCleared) {
            await AsyncStorage.setItem(
              capturedLocalCleanup,
              JSON.stringify({ ...resolvedClearRecord, localPending: false, serverPending: true })
            ).catch(() => undefined);
          }
          await executeServerDeleteInQueue(
            capturedProjectId,
            capturedUserId,
            capturedPendingDelete,
            capturedLocalCleanup,
            capturedServerRev,
            capturedScope,
            clearOpId
          );
        } else if (localCleared) {
          await AsyncStorage.removeItem(capturedLocalCleanup).catch(() => undefined);
        }
      });

      releaseClearingGuard();
      await queuedClearPromise;
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Bạn có muốn xóa lịch sử trò chuyện AI của dự án này không?')) {
        void doClear();
      }
    } else {
      Alert.alert(
        'Làm mới trò chuyện',
        'Bạn có muốn xóa lịch sử trò chuyện AI của dự án này không?',
        [
          { text: 'Hủy', style: 'cancel' },
          { text: 'Xóa', style: 'destructive', onPress: () => void doClear() },
        ]
      );
    }
  };

  const handleCopyMessage = async (message: AIChatMessage) => {
    try {
      await Clipboard.setStringAsync(message.content);
      setCopiedMessageId(message.id);
      setTimeout(() => {
        setCopiedMessageId((currentId) => currentId === message.id ? null : currentId);
      }, 1800);
    } catch (error) {
      console.warn('[AIChatPanel] Không thể sao chép tin nhắn:', error);
      Alert.alert('Không thể sao chép', 'Vui lòng thử lại.');
    }
  };

  const handleConfirmCreate = (nodeData: Partial<StoryNode>) => {
    onCreateNode(nodeData);
  };

  const existingFullNodeKeys = React.useMemo(() => {
    const keys = new Set<string>();
    for (const node of existingNodes) {
      if (node && node.type && node.name && node.autoCreatedStub !== true) {
        keys.add(`${node.type}::${node.name.trim().toLocaleLowerCase('vi')}`);
      }
    }
    return keys;
  }, [existingNodes]);

  const handleConfirmCreateMany = async (
    messageId: string,
    nodes: Partial<StoryNode>[]
  ): Promise<boolean> => {
    const capturedScope = storageKey;
    const capturedPendingDelete = pendingDeleteKey;
    const capturedLocalCleanup = localCleanupKey;
    const capturedServerRev = serverRevKey;
    const capturedProjectId = projectId;
    const capturedUserId = user?.id;
    const turnRevision = {
      current: chatState.scopeKey === capturedScope ? chatState.baseRevision : 0,
    };

    const ok = await onCreateNodes(nodes);
    if (ok) {
      bumpRevision(capturedScope);
      setChatState((prev) =>
        prev.scopeKey === capturedScope
          ? {
              ...prev,
              messages: prev.messages.map((m) =>
                m.id === messageId ? { ...m, nodesAdded: true } : m
              ),
            }
          : prev
      );

      if (capturedScope) {
        void persistMessagesForScope(
          capturedScope,
          capturedPendingDelete,
          capturedLocalCleanup,
          capturedServerRev,
          capturedProjectId,
          capturedUserId,
          (latestMessages) => {
            if (!latestMessages.some((m) => m.id === messageId)) {
              return null;
            }
            return latestMessages.map((m) =>
              m.id === messageId ? { ...m, nodesAdded: true } : m
            );
          },
          turnRevision
        );
      }
    }
    return ok;
  };

  const existingLinkKeys = React.useMemo(() => {
    const keys = new Set<string>();
    for (const link of existingLinks) {
      if (link && link.source && link.target) {
        const labelKey = (link.label || '').trim().toLocaleLowerCase('vi');
        keys.add(`${link.source}::${link.target}::${labelKey}`);
      }
    }
    return keys;
  }, [existingLinks]);

  const handleConfirmCreateLinks = async (
    messageId: string,
    links: AIChatSuggestedLink[]
  ): Promise<boolean> => {
    if (!onCreateLinks || links.length === 0) return false;
    const capturedScope = storageKey;
    const capturedPendingDelete = pendingDeleteKey;
    const capturedLocalCleanup = localCleanupKey;
    const capturedServerRev = serverRevKey;
    const capturedProjectId = projectId;
    const capturedUserId = user?.id;
    const turnRevision = {
      current: chatState.scopeKey === capturedScope ? chatState.baseRevision : 0,
    };

    const ok = await onCreateLinks(links);
    if (ok) {
      bumpRevision(capturedScope);
      setChatState((prev) =>
        prev.scopeKey === capturedScope
          ? {
              ...prev,
              messages: prev.messages.map((m) =>
                m.id === messageId ? { ...m, linksAdded: true } : m
              ),
            }
          : prev
      );

      if (capturedScope) {
        void persistMessagesForScope(
          capturedScope,
          capturedPendingDelete,
          capturedLocalCleanup,
          capturedServerRev,
          capturedProjectId,
          capturedUserId,
          (latestMessages) => {
            if (!latestMessages.some((m) => m.id === messageId)) {
              return null;
            }
            return latestMessages.map((m) =>
              m.id === messageId ? { ...m, linksAdded: true } : m
            );
          },
          turnRevision
        );
      }
    }
    return ok;
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
          bottom: keyboardHeight,
          maxHeight: keyboardHeight > 0 ? SCREEN_HEIGHT - keyboardHeight - 20 : '75%',
        },
      ]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerIcon}>✦</Text>
          <View>
            <Text style={styles.headerTitle}>Trợ lý AI Sáng tác</Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              {projectTitle ? `${projectTitle} · Đã lưu tự động` : 'Powered by Gemini'}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {messages.length > 1 && (
            <Pressable
              style={styles.closeBtn}
              onPress={handleClearChat}
              accessibilityRole="button"
              accessibilityLabel="Xóa lịch sử trò chuyện">
              <Text style={styles.closeBtnText}>🗑️</Text>
            </Pressable>
          )}
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>
      </View>

      {pendingDeleteFailed && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 14,
            paddingVertical: 8,
            backgroundColor: '#2a1814',
            borderBottomWidth: 1,
            borderBottomColor: '#5c2d23',
            gap: 8,
          }}>
          <Text style={{ flex: 1, color: '#f3b6a6', fontSize: 12 }}>
            ⚠️ Chưa xóa được lịch sử trên máy chủ.
          </Text>
          <Pressable
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: '#e5a93c',
            }}
            onPress={() => {
              void retryServerDelete(
                projectId,
                user?.id,
                pendingDeleteKey,
                localCleanupKey,
                serverRevKey,
                storageKey
              );
            }}>
            <Text style={{ color: '#e5a93c', fontSize: 12, fontWeight: '600' }}>Thử lại</Text>
          </Pressable>
        </View>
      )}

      {serverSyncWarning && !pendingDeleteFailed && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 14,
            paddingVertical: 8,
            backgroundColor: '#262015',
            borderBottomWidth: 1,
            borderBottomColor: '#544225',
            gap: 8,
          }}>
          <Text style={{ flex: 1, color: '#ecd2a0', fontSize: 12 }}>
            ⚠️ {serverSyncWarning}
          </Text>
        </View>
      )}

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            existingFullNodeKeys={existingFullNodeKeys}
            existingLinkKeys={existingLinkKeys}
            onConfirmCreate={handleConfirmCreate}
            onConfirmCreateMany={(nodes) => handleConfirmCreateMany(msg.id, nodes)}
            onConfirmCreateLinks={
              onCreateLinks ? (links) => handleConfirmCreateLinks(msg.id, links) : undefined
            }
            onRetry={handleRetry}
            onCopy={handleCopyMessage}
            onUseSuggestedPrompt={(prompt) => setInputText(prompt)}
            copied={copiedMessageId === msg.id}
            isLoading={isLoading || isScopeClearing}
          />
        ))}
        {isLoading && (
          <View style={styles.loadingBubble}>
            <ActivityIndicator size="small" color="#e5a93c" />
            <Text style={styles.loadingText}>AI đang suy nghĩ...</Text>
          </View>
        )}
      </ScrollView>

      {/* Input Bar */}
      <View style={styles.inputSection}>
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder={
              isScopeClearing
                ? 'Đang xóa lịch sử trò chuyện...'
                : isScopeLoaded
                  ? 'Mô tả thực thể muốn tạo...'
                  : 'Đang tải lịch sử trò chuyện...'
            }
            placeholderTextColor="#6e6150"
            multiline
            maxLength={500}
            editable={isScopeLoaded && !isScopeClearing}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <Pressable
            style={[
              styles.sendBtn,
              (!inputText.trim() || isLoading || !isScopeLoaded || isScopeClearing) &&
              styles.sendBtnDisabled,
            ]}
            onPress={handleSend}
            disabled={!inputText.trim() || isLoading || !isScopeLoaded || isScopeClearing}>
            <Text style={styles.sendBtnText}>↑</Text>
          </Pressable>
        </View>
        {/* Quick suggestions */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.suggestionsRow}
          keyboardShouldPersistTaps="handled">
          {[
            'Tạo nhân vật chính',
            'Thêm vật phẩm quan trọng',
            'Thêm địa điểm bí ẩn',
            'Tạo tổ chức đối lập',
            'Thêm một sự kiện lớn',
          ].map((s) => (
            <Pressable key={s} style={styles.suggestionChip} onPress={() => setInputText(s)}>
              <Text style={styles.suggestionText}>{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Animated.View>
  );
}

function MessageBubble({
  message,
  existingFullNodeKeys,
  existingLinkKeys,
  onConfirmCreate,
  onConfirmCreateMany,
  onConfirmCreateLinks,
  onRetry,
  onCopy,
  onUseSuggestedPrompt,
  copied,
  isLoading,
}: {
  message: AIChatMessage;
  existingFullNodeKeys: Set<string>;
  existingLinkKeys: Set<string>;
  onConfirmCreate: (node: Partial<StoryNode>) => void;
  onConfirmCreateMany: (nodes: Partial<StoryNode>[]) => Promise<boolean>;
  onConfirmCreateLinks?: (links: AIChatSuggestedLink[]) => Promise<boolean>;
  onRetry?: () => void;
  onCopy?: (message: AIChatMessage) => void;
  onUseSuggestedPrompt?: (prompt: string) => void;
  copied?: boolean;
  isLoading?: boolean;
}) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const nodeDataList = message.nodeDataList?.length
    ? message.nodeDataList
    : message.nodeData
      ? [message.nodeData]
      : [];
  const linkDataList = message.linkDataList?.length ? message.linkDataList : [];
  const allNodesAlreadyInGraph =
    nodeDataList.length > 0 &&
    nodeDataList.every((n) => {
      const t = n.type || 'character';
      const name = (n.name || '').trim().toLocaleLowerCase('vi');
      return Boolean(name) && existingFullNodeKeys.has(`${t}::${name}`);
    });
  const allLinksAlreadyInGraph =
    linkDataList.length > 0 &&
    linkDataList.every((l) => {
      const labelKey = (l.label || '').trim().toLocaleLowerCase('vi');
      return existingLinkKeys.has(`${l.source}::${l.target}::${labelKey}`);
    });
  const [isAddingNodes, setIsAddingNodes] = useState(false);
  const [localNodesAdded, setLocalNodesAdded] = useState(Boolean(message.nodesAdded));
  const nodesAdded = Boolean(message.nodesAdded) || localNodesAdded || allNodesAlreadyInGraph;
  const isAddingRef = useRef(false);
  const hasAddedRef = useRef(nodesAdded);
  if (nodesAdded) {
    hasAddedRef.current = true;
  }

  const [isAddingLinks, setIsAddingLinks] = useState(false);
  const [localLinksAdded, setLocalLinksAdded] = useState(Boolean(message.linksAdded));
  const linksAdded = Boolean(message.linksAdded) || localLinksAdded || allLinksAlreadyInGraph;
  const isAddingLinksRef = useRef(false);
  const hasAddedLinksRef = useRef(Boolean(message.linksAdded));
  if (message.linksAdded) {
    hasAddedLinksRef.current = true;
  }

  const handleAddAllNodes = async () => {
    if (isAddingRef.current || hasAddedRef.current || isAddingNodes || nodesAdded) return;
    isAddingRef.current = true;
    setIsAddingNodes(true);
    try {
      const ok = await onConfirmCreateMany(nodeDataList);
      if (ok) {
        hasAddedRef.current = true;
        setLocalNodesAdded(true);
      }
    } catch (error) {
      console.error('[AIChatPanel] Không thể thêm nhóm node:', error);
      Alert.alert('Không thể thêm node', 'Đã xảy ra lỗi khi thêm các node vào đồ thị.');
    } finally {
      isAddingRef.current = false;
      setIsAddingNodes(false);
    }
  };

  const handleAddAllLinks = async () => {
    if (
      !onConfirmCreateLinks ||
      isAddingLinksRef.current ||
      hasAddedLinksRef.current ||
      isAddingLinks ||
      linksAdded
    ) {
      return;
    }
    isAddingLinksRef.current = true;
    setIsAddingLinks(true);
    try {
      const ok = await onConfirmCreateLinks(linkDataList);
      if (ok) {
        hasAddedLinksRef.current = true;
        setLocalLinksAdded(true);
      }
    } catch (error) {
      console.error('[AIChatPanel] Không thể lưu quan hệ:', error);
      Alert.alert('Không thể lưu quan hệ', 'Đã xảy ra lỗi khi lưu các mối quan hệ vào đồ thị.');
    } finally {
      isAddingLinksRef.current = false;
      setIsAddingLinks(false);
    }
  };

  return (
    <View style={[styles.messageBubbleRow, isUser && styles.messageBubbleRowUser]}>
      {!isUser && (
        <View style={styles.avatarIcon}>
          <Text style={styles.avatarText}>{isSystem ? '⚠️' : '✦'}</Text>
        </View>
      )}
      <View
        style={[
          styles.bubble,
          isUser && styles.bubbleUser,
          isSystem && styles.bubbleSystem,
        ]}>
        <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser, isSystem && styles.bubbleTextSystem]}>
          {message.content}
        </Text>

        {isUser && onCopy && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sao chép tin nhắn"
            style={styles.copyBtn}
            onPress={() => onCopy(message)}>
            <Text style={styles.copyBtnText}>{copied ? '✓ Đã sao chép' : '⧉ Sao chép'}</Text>
          </Pressable>
        )}

        {/* Nút Thử Lại khi có lỗi kết nối / timeout */}
        {isSystem && message.canRetry && onRetry && (
          <Pressable
            style={[styles.retryBtn, isLoading && { opacity: 0.5 }]}
            onPress={onRetry}
            disabled={isLoading}>
            <Text style={styles.retryBtnText}>🔄 Gửi lại yêu cầu</Text>
          </Pressable>
        )}

        {/* Nút tạo node nếu AI trả về dữ liệu */}
        {nodeDataList.map((nodeData, index) => (
          <View key={`${message.id}-${index}`} style={styles.nodePreview}>
            <View style={styles.nodePreviewHeader}>
              <Text style={styles.nodePreviewIcon}>
                {nodeData.type === 'character' ? '●' :
                  nodeData.type === 'item' ? '◆' :
                    nodeData.type === 'faction' ? '⬡' :
                      nodeData.type === 'event' ? '■' : '▲'}
              </Text>
              <Text style={styles.nodePreviewType}>
                {nodeData.type === 'character' ? 'NHÂN VẬT' :
                  nodeData.type === 'item' ? 'VẬT PHẨM' :
                    nodeData.type === 'faction' ? 'TỔ CHỨC' :
                      nodeData.type === 'event' ? 'SỰ KIỆN' : 'ĐỊA ĐIỂM'}
              </Text>
            </View>
            <Text style={styles.nodePreviewName}>{nodeData.name}</Text>
            {nodeData.desc ? (
              <Text style={styles.nodePreviewDesc} numberOfLines={2}>{nodeData.desc}</Text>
            ) : null}
            <Pressable
              style={[styles.createNodeBtn, (isAddingNodes || nodesAdded) && styles.sendBtnDisabled]}
              disabled={isAddingNodes || nodesAdded}
              onPress={() => {
                if (isAddingRef.current || hasAddedRef.current) return;
                onConfirmCreate(nodeData);
              }}>
              <Text style={styles.createNodeBtnText}>
                {nodesAdded ? '✓ Đã thêm vào đồ thị' : '+ Xem / chỉnh sửa node'}
              </Text>
            </Pressable>
          </View>
        ))}
        {nodeDataList.length >= 1 && (
          <Pressable
            accessibilityRole="button"
            style={[styles.createAllNodesBtn, (isAddingNodes || nodesAdded) && styles.sendBtnDisabled]}
            onPress={handleAddAllNodes}
            disabled={isAddingNodes || nodesAdded}>
            {isAddingNodes ? (
              <ActivityIndicator size="small" color="#12100d" />
            ) : (
              <Text style={styles.createAllNodesBtnText}>
                {nodesAdded
                  ? '✓ Đã thêm vào đồ thị'
                  : nodeDataList.length === 1
                    ? '＋ Lưu node vào đồ thị'
                    : `＋ Thêm cả ${nodeDataList.length} node vào đồ thị`}
              </Text>
            )}
          </Pressable>
        )}
        {linkDataList.map((linkData, index) => (
          <View key={`${message.id}-link-${index}`} style={styles.nodePreview}>
            <View style={styles.nodePreviewHeader}>
              <Text style={styles.nodePreviewIcon}>🔗</Text>
              <Text style={styles.nodePreviewType}>QUAN HỆ ĐỒ THỊ</Text>
            </View>
            <Text style={styles.nodePreviewName}>
              {linkData.sourceName || linkData.source} ──[{linkData.label}]──▶{' '}
              {linkData.targetName || linkData.target}
            </Text>
            {linkData.contextNote ? (
              <Text style={styles.nodePreviewDesc} numberOfLines={2}>
                {linkData.contextNote}
              </Text>
            ) : null}
          </View>
        ))}
        {linkDataList.length >= 1 && onConfirmCreateLinks && (
          <Pressable
            accessibilityRole="button"
            style={[styles.createAllNodesBtn, (isAddingLinks || linksAdded) && styles.sendBtnDisabled]}
            onPress={handleAddAllLinks}
            disabled={isAddingLinks || linksAdded}>
            {isAddingLinks ? (
              <ActivityIndicator size="small" color="#12100d" />
            ) : (
              <Text style={styles.createAllNodesBtnText}>
                {linksAdded
                  ? '✓ Đã nối quan hệ vào đồ thị'
                  : linkDataList.length === 1
                    ? '🔗 Lưu quan hệ vào đồ thị'
                    : `🔗 Lưu cả ${linkDataList.length} quan hệ vào đồ thị`}
              </Text>
            )}
          </Pressable>
        )}
        {!isUser && !!message.suggestedPrompt && onUseSuggestedPrompt && (
          <Pressable
            accessibilityRole="button"
            style={[
              styles.retryBtn,
              {
                marginTop: 8,
                borderColor: 'rgba(229, 169, 60, 0.45)',
                backgroundColor: 'rgba(229, 169, 60, 0.12)',
              },
              isLoading && { opacity: 0.5 },
            ]}
            disabled={isLoading}
            onPress={() => onUseSuggestedPrompt(message.suggestedPrompt!)}>
            <Text style={[styles.retryBtnText, { color: '#f3d28e' }]}>
              💡 Dùng gợi ý tạo tiếp: “{message.suggestedPrompt}”
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '75%',
    backgroundColor: '#1a1710',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: 'rgba(229,169,60,0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 20,
    zIndex: 100,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(229,169,60,0.15)',
    backgroundColor: '#141210',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: { fontSize: 20, color: '#e5a93c' },
  headerTitle: {
    fontSize: 15,
    fontFamily: AppFonts.serif,
    fontWeight: '700',
    color: '#ded5c7',
    letterSpacing: 0.5,
  },
  headerSub: { fontSize: 10, color: '#6e6150', fontFamily: AppFonts.mono, letterSpacing: 1 },
  closeBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: 'rgba(229,169,60,0.1)',
  },
  closeBtnText: { fontSize: 13, color: '#e5a93c' },
  messageList: { flex: 1 },
  messageListContent: { padding: 12, gap: 10, paddingBottom: 8 },
  messageBubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    maxWidth: '90%',
  },
  messageBubbleRowUser: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
    maxWidth: '80%',
  },
  avatarIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(229,169,60,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(229,169,60,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 11, color: '#e5a93c' },
  bubble: {
    backgroundColor: '#252018',
    borderRadius: 14,
    borderTopLeftRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '100%',
    borderWidth: 1,
    borderColor: 'rgba(229,169,60,0.1)',
  },
  bubbleUser: {
    backgroundColor: 'rgba(229,169,60,0.15)',
    borderColor: 'rgba(229,169,60,0.3)',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 4,
  },
  bubbleSystem: {
    backgroundColor: 'rgba(220,38,38,0.1)',
    borderColor: 'rgba(220,38,38,0.3)',
  },
  bubbleText: {
    fontSize: 13.5,
    color: '#d4c9b8',
    fontFamily: AppFonts.sans,
    lineHeight: 20,
  },
  bubbleTextUser: { color: '#f3c76f' },
  bubbleTextSystem: { color: '#f87171', fontSize: 12 },
  copyBtn: {
    alignSelf: 'flex-end',
    marginTop: 6,
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  copyBtnText: {
    fontSize: 11,
    color: '#d9a441',
    fontFamily: AppFonts.sans,
    fontWeight: '600',
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: 'rgba(248,113,113,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.4)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  retryBtnText: {
    fontSize: 12,
    color: '#fca5a5',
    fontFamily: AppFonts.sans,
    fontWeight: '700',
  },
  nodePreview: {
    marginTop: 10,
    backgroundColor: 'rgba(18,16,13,0.9)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(229,169,60,0.35)',
  },
  nodePreviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  nodePreviewIcon: { fontSize: 14, color: '#e5a93c' },
  nodePreviewType: {
    fontSize: 9,
    color: '#e5a93c',
    fontFamily: AppFonts.mono,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  nodePreviewName: {
    fontSize: 15,
    color: '#f3c76f',
    fontFamily: AppFonts.serif,
    fontWeight: '700',
    marginBottom: 4,
  },
  nodePreviewDesc: { fontSize: 12, color: '#a89c8a', fontFamily: AppFonts.sans, lineHeight: 17 },
  createNodeBtn: {
    marginTop: 8,
    backgroundColor: 'rgba(229,169,60,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(229,169,60,0.5)',
    borderRadius: 8,
    paddingVertical: 7,
    alignItems: 'center',
  },
  createNodeBtnText: {
    fontSize: 12.5,
    color: '#e5a93c',
    fontFamily: AppFonts.sans,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  createAllNodesBtn: {
    marginTop: 10,
    backgroundColor: '#e5a93c',
    borderRadius: 9,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  createAllNodesBtnText: {
    fontSize: 12.5,
    color: '#12100d',
    fontFamily: AppFonts.sans,
    fontWeight: '700',
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  loadingText: { fontSize: 12, color: '#6e6150', fontFamily: AppFonts.mono },
  inputSection: {
    backgroundColor: '#141210',
    borderTopWidth: 1,
    borderTopColor: 'rgba(229,169,60,0.1)',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(229,169,60,0.1)',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#252018',
    borderWidth: 1,
    borderColor: 'rgba(229,169,60,0.2)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#ded5c7',
    fontFamily: AppFonts.sans,
    fontSize: 13.5,
    maxHeight: 100,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#e5a93c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: 'rgba(229,169,60,0.3)' },
  sendBtnText: { fontSize: 18, color: '#12100d', fontWeight: '700', lineHeight: 22 },
  suggestionsRow: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  suggestionChip: {
    backgroundColor: 'rgba(229,169,60,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(229,169,60,0.2)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  suggestionText: { fontSize: 11.5, color: '#a89c8a', fontFamily: AppFonts.sans },
});
