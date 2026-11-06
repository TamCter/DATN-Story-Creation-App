import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { AppFonts } from '@/constants/theme';
import { api } from '@/services/api';
import { StoryNode } from '@/constants/story-data';

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  nodeData?: Partial<StoryNode> | null;
  timestamp: number;
}

interface AIChatPanelProps {
  visible: boolean;
  onClose: () => void;
  onCreateNode: (nodeData: Partial<StoryNode>) => void;
  projectTitle?: string;
  existingNodes?: StoryNode[];
}

const WELCOME_MSG: AIChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    '✨ Xin chào! Tôi là trợ lý AI sáng tác truyện.\n\nHãy mô tả nhân vật, bảo vật, địa điểm, phe phái hoặc sự kiện bạn muốn thêm vào câu chuyện – tôi sẽ giúp bạn tạo thực thể hoàn chỉnh.\n\nVí dụ: "Tạo cho tôi một nữ kiếm khách bí ẩn từ Bắc Vực"',
  timestamp: Date.now(),
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function AIChatPanel({
  visible,
  onClose,
  onCreateNode,
  projectTitle,
  existingNodes = [],
}: AIChatPanelProps) {
  const [messages, setMessages] = useState<AIChatMessage[]>([WELCOME_MSG]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef<any>(null);
  const slideAnim = useRef(new Animated.Value(visible ? 0 : 400)).current;

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

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;

    Keyboard.dismiss();
    setInputText('');

    const userMsg: AIChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setIsLoading(true);
    scrollToBottom();

    try {
      // Chuyển messages sang format API (bỏ message welcome system và các trường thừa)
      const apiMessages = updatedMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      // Thêm user message vừa gửi nếu chưa có
      if (!apiMessages.find((m) => m.content === text && m.role === 'user')) {
        apiMessages.push({ role: 'user', content: text });
      }

      const res = await api.chatWithAI({
        messages: apiMessages,
        projectContext: {
          projectTitle,
          nodes: existingNodes.slice(0, 30),
        },
      });

      if (res.success && res.data) {
        const aiMsg: AIChatMessage = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: res.data.message,
          nodeData: res.data.nodeData,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, aiMsg]);
        scrollToBottom();
      } else {
        throw new Error(res.message || 'AI không phản hồi');
      }
    } catch (err: any) {
      const errMsg: AIChatMessage = {
        id: `e-${Date.now()}`,
        role: 'system',
        content: `⚠️ ${err.message || 'Không thể kết nối AI. Hãy kiểm tra GEMINI_API_KEY trong Backend/.env'}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errMsg]);
      scrollToBottom();
    } finally {
      setIsLoading(false);
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
            <Text style={styles.headerSub}>Powered by Gemini</Text>
          </View>
        </View>
        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>✕</Text>
        </Pressable>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} onConfirmCreate={handleConfirmCreate} />
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
            placeholder="Mô tả thực thể muốn tạo..."
            placeholderTextColor="#6e6150"
            multiline
            maxLength={500}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <Pressable
            style={[styles.sendBtn, (!inputText.trim() || isLoading) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || isLoading}>
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
            'Tạo nhân vật chính diện',
            'Thêm bảo vật thần kỳ',
            'Thêm địa điểm bí ẩn',
            'Tạo phe phái tà đạo',
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
}: {
  message: AIChatMessage;
  onConfirmCreate: (node: Partial<StoryNode>) => void;
}) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  // Tách phần text và phần JSON khỏi message assistant
  const displayContent = message.content.replace(/\{[\s\S]*"action"\s*:\s*"create_node"[\s\S]*\}/g, '').trim();

  return (
    <View style={[styles.messageBubbleRow, isUser && styles.messageBubbleRowUser]}>
      {!isUser && (
        <View style={styles.avatarIcon}>
          <Text style={styles.avatarText}>✦</Text>
        </View>
      )}
      <View
        style={[
          styles.bubble,
          isUser && styles.bubbleUser,
          isSystem && styles.bubbleSystem,
        ]}>
        <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser, isSystem && styles.bubbleTextSystem]}>
          {displayContent || message.content}
        </Text>

        {/* Nút tạo node nếu AI trả về dữ liệu */}
        {message.nodeData && (
          <View style={styles.nodePreview}>
            <View style={styles.nodePreviewHeader}>
              <Text style={styles.nodePreviewIcon}>
                {message.nodeData.type === 'character' ? '●' :
                 message.nodeData.type === 'item' ? '◆' :
                 message.nodeData.type === 'faction' ? '⬡' :
                 message.nodeData.type === 'event' ? '■' : '▲'}
              </Text>
              <Text style={styles.nodePreviewType}>
                {message.nodeData.type === 'character' ? 'NHÂN VẬT' :
                 message.nodeData.type === 'item' ? 'VẬT PHẨM' :
                 message.nodeData.type === 'faction' ? 'PHE PHÁI' :
                 message.nodeData.type === 'event' ? 'SỰ KIỆN' : 'ĐỊA ĐIỂM'}
              </Text>
            </View>
            <Text style={styles.nodePreviewName}>{message.nodeData.name}</Text>
            {message.nodeData.desc ? (
              <Text style={styles.nodePreviewDesc} numberOfLines={2}>{message.nodeData.desc}</Text>
            ) : null}
            <Pressable
              style={styles.createNodeBtn}
              onPress={() => onConfirmCreate(message.nodeData!)}>
              <Text style={styles.createNodeBtnText}>+ Thêm vào đồ thị</Text>
            </Pressable>
          </View>
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
