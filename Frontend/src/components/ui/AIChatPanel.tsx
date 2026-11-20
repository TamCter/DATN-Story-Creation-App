import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { api } from '@/services/api';
import { StoryNode } from '@/constants/story-data';

const AI_CHAT_STORAGE_PREFIX = '@story_app_ai_chat_';
const AI_CHAT_PENDING_DELETE_PREFIX = '@story_app_ai_chat_pending_delete_';

interface StoredChatPayload {
  messages: AIChatMessage[];
  updatedAt: number;
}

function parseStoredChatPayload(raw: string): StoredChatPayload | null {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const latestTs = parsed.reduce(
        (max, m) => Math.max(max, Number(m?.timestamp) || 0),
        0
      );
      return { messages: parsed, updatedAt: latestTs };
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
      };
    }
  } catch {
    // Ignore parse error
  }
  return null;
}

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  nodeData?: Partial<StoryNode> | null;
  nodeDataList?: Partial<StoryNode>[];
  timestamp: number;
  canRetry?: boolean;
}

interface AIChatPanelProps {
  visible: boolean;
  onClose: () => void;
  onCreateNode: (nodeData: Partial<StoryNode>) => void;
  onCreateNodes: (nodes: Partial<StoryNode>[]) => Promise<boolean>;
  projectId?: string;
  projectTitle?: string;
  existingNodes?: StoryNode[];
}

const WELCOME_MSG: AIChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    '✨ Xin chào! Tôi là trợ lý AI sáng tác truyện.\n\nHãy mô tả nhân vật, vật phẩm, địa điểm, tổ chức hoặc sự kiện bạn muốn thêm vào câu chuyện – tôi sẽ gợi ý các chi tiết còn thiếu. Bạn cũng có thể yêu cầu tạo cùng lúc tối đa 3 thực thể.\n\nVí dụ: "Tạo một phóng viên điều tra có quá khứ bí ẩn" hoặc "Tạo một nhân vật, một tập hồ sơ và nơi họ gặp nhau"',
  timestamp: Date.now(),
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function AIChatPanel({
  visible,
  onClose,
  onCreateNode,
  onCreateNodes,
  projectId,
  projectTitle,
  existingNodes = [],
}: AIChatPanelProps) {
  const { user } = useAuth();
  const authorKey = user?.id || user?.email || 'guest';
  const effectiveProjectKey = projectId || projectTitle || 'default';
  const storageKey = `${AI_CHAT_STORAGE_PREFIX}${encodeURIComponent(authorKey)}_${encodeURIComponent(effectiveProjectKey)}`;
  const pendingDeleteKey = `${AI_CHAT_PENDING_DELETE_PREFIX}${encodeURIComponent(authorKey)}_${encodeURIComponent(effectiveProjectKey)}`;

  const [chatState, setChatState] = useState<{
    scopeKey: string;
    messages: AIChatMessage[];
    loaded: boolean;
  }>({
    scopeKey: storageKey,
    messages: [WELCOME_MSG],
    loaded: false,
  });
  const [pendingDeleteFailed, setPendingDeleteFailed] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef<any>(null);
  const slideAnim = useRef(new Animated.Value(visible ? 0 : 400)).current;

  // Quản lý thế hệ thao tác (generation), phiên bản (revision) và hàng đợi lưu tuần tự theo từng cuộc hội thoại
  const activeScopeRef = useRef(storageKey);
  activeScopeRef.current = storageKey;
  const scopeGenerationRef = useRef(0);
  const scopeRevisionsRef = useRef<Map<string, number>>(new Map());
  const saveQueuesRef = useRef<Map<string, Promise<void>>>(new Map());

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
      targetProjectId: string | undefined,
      targetUserId: string | undefined,
      nextMessages: AIChatMessage[]
    ) => {
      const payload: StoredChatPayload = {
        messages: nextMessages,
        updatedAt: Date.now(),
      };
      return enqueueScopedWrite(targetScopeKey, async () => {
        try {
          await AsyncStorage.removeItem(targetPendingDeleteKey);
          await AsyncStorage.setItem(targetScopeKey, JSON.stringify(payload));
        } catch (err) {
          console.warn('[AIChatPanel] Không thể lưu lịch sử chat vào bộ nhớ cục bộ:', err);
        }
        if (targetProjectId && targetUserId) {
          try {
            await api.saveAIChatHistory(targetProjectId, nextMessages);
          } catch {
            // Bỏ qua lỗi mạng, đã lưu ở AsyncStorage
          }
        }
      });
    },
    [enqueueScopedWrite]
  );

  const retryServerDelete = useCallback(
    async (
      targetProjectId: string | undefined,
      targetPendingDeleteKey: string,
      targetScopeKey: string
    ): Promise<boolean> => {
      if (!targetProjectId) {
        await AsyncStorage.removeItem(targetPendingDeleteKey).catch(() => undefined);
        if (activeScopeRef.current === targetScopeKey) {
          setPendingDeleteFailed(false);
        }
        return true;
      }
      try {
        await api.clearAIChatHistory(targetProjectId);
        await AsyncStorage.removeItem(targetPendingDeleteKey).catch(() => undefined);
        if (activeScopeRef.current === targetScopeKey) {
          setPendingDeleteFailed(false);
        }
        return true;
      } catch {
        if (activeScopeRef.current === targetScopeKey) {
          setPendingDeleteFailed(true);
        }
        return false;
      }
    },
    []
  );

  // Tải lịch sử trò chuyện riêng theo từng tác giả + từng dự án
  useEffect(() => {
    let isMounted = true;
    const targetScope = storageKey;
    const targetPendingDelete = pendingDeleteKey;
    const targetProjectId = projectId;
    const targetUserId = user?.id;

    // Vô hiệu hóa các phản hồi AI cũ của scope trước khi chuyển dự án / tác giả
    scopeGenerationRef.current += 1;
    setIsLoading(false);
    setPendingDeleteFailed(false);
    setChatState((prev) =>
      prev.scopeKey === targetScope
        ? prev
        : { scopeKey: targetScope, messages: [WELCOME_MSG], loaded: false }
    );

    const startRevision = getRevision(targetScope);

    async function loadHistory() {
      // Nếu lần xóa trước lên máy chủ thất bại, thử xóa lại trước khi tải lịch sử từ máy chủ
      if (targetProjectId && targetUserId) {
        const hasPendingDelete = await AsyncStorage.getItem(targetPendingDelete).catch(() => null);
        if (hasPendingDelete) {
          const cleared = await retryServerDelete(targetProjectId, targetPendingDelete, targetScope);
          if (!isMounted || activeScopeRef.current !== targetScope) return;
          if (!cleared) {
            setChatState({
              scopeKey: targetScope,
              messages: [{ ...WELCOME_MSG, timestamp: Date.now() }],
              loaded: true,
            });
            return;
          }
        }
      }

      let localPayload: StoredChatPayload | null = null;
      try {
        const raw = await AsyncStorage.getItem(targetScope);
        if (raw) {
          localPayload = parseStoredChatPayload(raw);
        }
      } catch {
        // Ignore parse error
      }

      if (!isMounted || activeScopeRef.current !== targetScope) return;
      if (getRevision(targetScope) === startRevision) {
        setChatState({
          scopeKey: targetScope,
          messages: localPayload?.messages || [WELCOME_MSG],
          loaded: true,
        });
      }

      if (targetProjectId && targetUserId) {
        try {
          const res = await api.getAIChatHistory(targetProjectId);
          if (!isMounted || activeScopeRef.current !== targetScope) return;
          // Chỉ áp dụng dữ liệu từ server nếu cuộc hội thoại chưa bị người dùng chỉnh sửa/xóa trong lúc chờ
          if (getRevision(targetScope) !== startRevision) return;

          const remoteMsgs =
            res.success && Array.isArray(res.data?.messages) ? res.data.messages : [];
          const remoteUpdatedAt = Number(res.data?.updatedAt) || 0;
          const localUpdatedAt = localPayload?.updatedAt || 0;
          const hasLocalUserMessages = Boolean(
            localPayload?.messages.some((m) => m.role === 'user')
          );

          if (remoteMsgs.length > 0) {
            if (!hasLocalUserMessages || remoteUpdatedAt >= localUpdatedAt) {
              setChatState({
                scopeKey: targetScope,
                messages: remoteMsgs,
                loaded: true,
              });
              await AsyncStorage.setItem(
                targetScope,
                JSON.stringify({
                  messages: remoteMsgs,
                  updatedAt: remoteUpdatedAt || Date.now(),
                })
              );
            } else if (localPayload && localUpdatedAt > remoteUpdatedAt) {
              // Bản cục bộ mới hơn theo timestamp/revision -> giữ bản cục bộ và đồng bộ lên server
              void persistMessagesForScope(
                targetScope,
                targetPendingDelete,
                targetProjectId,
                targetUserId,
                localPayload.messages
              );
            }
          } else if (localPayload && hasLocalUserMessages) {
            void persistMessagesForScope(
              targetScope,
              targetPendingDelete,
              targetProjectId,
              targetUserId,
              localPayload.messages
            );
          }
        } catch {
          // Lỗi mạng / lỗi server: giữ nguyên bản lưu cục bộ, không ghi đè lên server
        }
      }
    }

    void loadHistory();
    return () => {
      isMounted = false;
    };
  }, [
    getRevision,
    pendingDeleteKey,
    persistMessagesForScope,
    projectId,
    retryServerDelete,
    storageKey,
    user?.id,
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
    capturedProjectId: string | undefined,
    capturedUserId: string | undefined,
    capturedGen: number
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
          timestamp: Date.now(),
        };
        const nextHistory = [...currentHistory, aiMsg];
        bumpRevision(capturedScope);
        setChatState({ scopeKey: capturedScope, messages: nextHistory, loaded: true });
        void persistMessagesForScope(
          capturedScope,
          capturedPendingDelete,
          capturedProjectId,
          capturedUserId,
          nextHistory
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
      const nextHistory = [...currentHistory, errMsg];
      bumpRevision(capturedScope);
      setChatState({ scopeKey: capturedScope, messages: nextHistory, loaded: true });
      void persistMessagesForScope(
        capturedScope,
        capturedPendingDelete,
        capturedProjectId,
        capturedUserId,
        nextHistory
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
    if (!text || isLoading || !isScopeLoaded) return;

    const capturedScope = storageKey;
    const capturedPendingDelete = pendingDeleteKey;
    const capturedProjectId = projectId;
    const capturedUserId = user?.id;
    const capturedGen = scopeGenerationRef.current;

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
    setPendingDeleteFailed(false);
    setChatState({ scopeKey: capturedScope, messages: updatedMessages, loaded: true });
    void persistMessagesForScope(
      capturedScope,
      capturedPendingDelete,
      capturedProjectId,
      capturedUserId,
      updatedMessages
    );
    await sendMessagesToAI(
      updatedMessages,
      capturedScope,
      capturedPendingDelete,
      capturedProjectId,
      capturedUserId,
      capturedGen
    );
  };

  const handleRetry = async () => {
    if (isLoading || !isScopeLoaded) return;
    const capturedScope = storageKey;
    const capturedPendingDelete = pendingDeleteKey;
    const capturedProjectId = projectId;
    const capturedUserId = user?.id;
    const capturedGen = scopeGenerationRef.current;

    // Bỏ qua các tin nhắn lỗi hệ thống gần nhất để gửi lại
    const cleanedMessages = messages.filter((m) => m.role !== 'system');
    bumpRevision(capturedScope);
    setChatState({ scopeKey: capturedScope, messages: cleanedMessages, loaded: true });
    void persistMessagesForScope(
      capturedScope,
      capturedPendingDelete,
      capturedProjectId,
      capturedUserId,
      cleanedMessages
    );
    await sendMessagesToAI(
      cleanedMessages,
      capturedScope,
      capturedPendingDelete,
      capturedProjectId,
      capturedUserId,
      capturedGen
    );
  };

  const handleClearChat = () => {
    const capturedScope = storageKey;
    const capturedPendingDelete = pendingDeleteKey;
    const capturedProjectId = projectId;
    const capturedUserId = user?.id;

    const doClear = async () => {
      scopeGenerationRef.current += 1;
      bumpRevision(capturedScope);
      setIsLoading(false);
      const resetList = [{ ...WELCOME_MSG, timestamp: Date.now() }];
      setChatState({ scopeKey: capturedScope, messages: resetList, loaded: true });

      await enqueueScopedWrite(capturedScope, async () => {
        try {
          await AsyncStorage.removeItem(capturedScope);
          if (capturedProjectId && capturedUserId) {
            await AsyncStorage.setItem(capturedPendingDelete, String(Date.now()));
          }
        } catch {
          // Ignore storage error
        }
        if (capturedProjectId && capturedUserId) {
          await retryServerDelete(capturedProjectId, capturedPendingDelete, capturedScope);
        }
      });
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
              void retryServerDelete(projectId, pendingDeleteKey, storageKey);
            }}>
            <Text style={{ color: '#e5a93c', fontSize: 12, fontWeight: '600' }}>Thử lại</Text>
          </Pressable>
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
            onConfirmCreate={handleConfirmCreate}
            onConfirmCreateMany={onCreateNodes}
            onRetry={handleRetry}
            onCopy={handleCopyMessage}
            copied={copiedMessageId === msg.id}
            isLoading={isLoading}
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
            placeholder={isScopeLoaded ? 'Mô tả thực thể muốn tạo...' : 'Đang tải lịch sử trò chuyện...'}
            placeholderTextColor="#6e6150"
            multiline
            maxLength={500}
            editable={isScopeLoaded}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <Pressable
            style={[
              styles.sendBtn,
              (!inputText.trim() || isLoading || !isScopeLoaded) && styles.sendBtnDisabled,
            ]}
            onPress={handleSend}
            disabled={!inputText.trim() || isLoading || !isScopeLoaded}>
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
  onConfirmCreate,
  onConfirmCreateMany,
  onRetry,
  onCopy,
  copied,
  isLoading,
}: {
  message: AIChatMessage;
  onConfirmCreate: (node: Partial<StoryNode>) => void;
  onConfirmCreateMany: (nodes: Partial<StoryNode>[]) => Promise<boolean>;
  onRetry?: () => void;
  onCopy?: (message: AIChatMessage) => void;
  copied?: boolean;
  isLoading?: boolean;
}) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const [isAddingNodes, setIsAddingNodes] = useState(false);
  const [nodesAdded, setNodesAdded] = useState(false);
  const nodeDataList = message.nodeDataList?.length
    ? message.nodeDataList
    : message.nodeData
      ? [message.nodeData]
      : [];

  const handleAddAllNodes = async () => {
    if (isAddingNodes || nodesAdded) return;
    setIsAddingNodes(true);
    try {
      setNodesAdded(await onConfirmCreateMany(nodeDataList));
    } catch (error) {
      console.error('[AIChatPanel] Không thể thêm nhóm node:', error);
      Alert.alert('Không thể thêm node', 'Đã xảy ra lỗi khi thêm các node vào đồ thị.');
    } finally {
      setIsAddingNodes(false);
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
              style={styles.createNodeBtn}
              onPress={() => onConfirmCreate(nodeData)}>
              <Text style={styles.createNodeBtnText}>+ Xem / chỉnh sửa node</Text>
            </Pressable>
          </View>
        ))}
        {nodeDataList.length > 1 && (
          <Pressable
            accessibilityRole="button"
            style={[styles.createAllNodesBtn, (isAddingNodes || nodesAdded) && styles.sendBtnDisabled]}
            onPress={handleAddAllNodes}
            disabled={isAddingNodes || nodesAdded}>
            {isAddingNodes ? (
              <ActivityIndicator size="small" color="#12100d" />
            ) : (
              <Text style={styles.createAllNodesBtnText}>
                {nodesAdded ? '✓ Đã thêm tất cả node' : `＋ Thêm cả ${nodeDataList.length} node vào đồ thị`}
              </Text>
            )}
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
