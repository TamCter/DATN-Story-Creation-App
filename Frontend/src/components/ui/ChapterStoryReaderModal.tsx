import React, { useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppFonts } from '@/constants/theme';
import { StoryChapter } from '@/constants/story-data';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ChapterStoryReaderModalProps {
  visible: boolean;
  onClose: () => void;
  chapter: StoryChapter | null;
  onRewriteWithAI?: (chapter: StoryChapter) => void;
}

export default function ChapterStoryReaderModal({
  visible,
  onClose,
  chapter,
  onRewriteWithAI,
}: ChapterStoryReaderModalProps) {
  const [copySuccess, setCopySuccess] = useState(false);

  if (!visible || !chapter) return null;

  const content = chapter.content || '';
  const wordCount = content.split(/\s+/).filter(Boolean).length;

  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(content);
      }
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    } catch {
      setCopySuccess(true);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.chapterBadge}>CHƯƠNG {chapter.chapterNumber}</Text>
              <Text style={styles.title} numberOfLines={1}>
                {chapter.title}
              </Text>
            </View>
            <Pressable hitSlop={12} onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {/* Subheader info & Actions */}
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>
              {wordCount.toLocaleString()} từ · {chapter.events?.length || 0} sự kiện
            </Text>
            <View style={styles.actionRow}>
              {Boolean(onRewriteWithAI) && (
                <Pressable
                  style={styles.rewriteBtn}
                  onPress={() => {
                    onClose();
                    onRewriteWithAI?.(chapter);
                  }}>
                  <Text style={styles.rewriteBtnText}>✨ AI Viết lại</Text>
                </Pressable>
              )}
              <Pressable
                style={[styles.copyBtn, copySuccess && styles.copyBtnSuccess]}
                onPress={handleCopy}>
                <Text style={styles.copyBtnText}>
                  {copySuccess ? '✓ Đã sao chép' : '📋 Sao chép'}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Reader Body */}
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}>
            {Boolean(chapter.desc) && (
              <View style={styles.descBox}>
                <Text style={styles.descTitle}>Tóm tắt chương:</Text>
                <Text style={styles.descContent}>{chapter.desc}</Text>
              </View>
            )}

            {content ? (
              <Text style={styles.storyText}>{content}</Text>
            ) : (
              <View style={styles.emptyContentBox}>
                <Text style={styles.emptyIcon}>✍️</Text>
                <Text style={styles.emptyText}>Chương này chưa có nội dung câu chuyện.</Text>
                {Boolean(onRewriteWithAI) && (
                  <Pressable
                    style={styles.startWriteBtn}
                    onPress={() => {
                      onClose();
                      onRewriteWithAI?.(chapter);
                    }}>
                    <Text style={styles.startWriteBtnText}>✨ Dùng AI sáng tác ngay</Text>
                  </Pressable>
                )}
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <Pressable style={styles.closeFooterBtn} onPress={onClose}>
              <Text style={styles.closeFooterBtnText}>Đóng</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  card: {
    width: '100%',
    maxWidth: 680,
    height: '92%',
    backgroundColor: '#171410',
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(229,169,60,0.15)',
    backgroundColor: '#1b1813',
  },
  chapterBadge: {
    fontSize: 9.5,
    color: '#e5a93c',
    fontFamily: AppFonts.mono,
    fontWeight: '700',
    letterSpacing: 1,
  },
  title: {
    fontSize: 16,
    color: '#f3c76f',
    fontFamily: AppFonts.serif,
    fontWeight: '700',
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
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
    backgroundColor: '#13110d',
    borderBottomWidth: 1,
    borderBottomColor: '#2b241c',
  },
  metaText: {
    fontSize: 11,
    color: '#8f887b',
    fontFamily: AppFonts.mono,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  rewriteBtn: {
    backgroundColor: 'rgba(229,169,60,0.12)',
    borderWidth: 1,
    borderColor: '#e5a93c60',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  rewriteBtnText: {
    fontSize: 11,
    color: '#e5a93c',
    fontWeight: '600',
  },
  copyBtn: {
    backgroundColor: '#26201a',
    borderWidth: 1,
    borderColor: '#4d3f32',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  copyBtnSuccess: {
    backgroundColor: 'rgba(52,211,153,0.15)',
    borderColor: '#34d399',
  },
  copyBtnText: {
    fontSize: 11,
    color: '#ded5c7',
    fontWeight: '600',
  },
  scrollArea: {
    flex: 1,
    backgroundColor: '#171410',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 32,
    gap: 16,
  },
  descBox: {
    backgroundColor: '#1f1b15',
    borderLeftWidth: 3,
    borderLeftColor: '#e5a93c',
    borderRadius: 6,
    padding: 12,
    gap: 4,
  },
  descTitle: {
    fontSize: 11,
    color: '#e5a93c',
    fontWeight: '700',
    fontFamily: AppFonts.sans,
    letterSpacing: 0.5,
  },
  descContent: {
    fontSize: 12.5,
    color: '#a89c8a',
    lineHeight: 18,
    fontStyle: 'italic',
  },
  storyText: {
    fontSize: 15,
    fontFamily: AppFonts.serif,
    color: '#ded5c7',
    lineHeight: 26,
    letterSpacing: 0.35,
  },
  emptyContentBox: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptyIcon: {
    fontSize: 32,
  },
  emptyText: {
    fontSize: 13,
    color: '#8f887b',
    fontFamily: AppFonts.sans,
  },
  startWriteBtn: {
    marginTop: 8,
    backgroundColor: '#e5a93c',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  startWriteBtnText: {
    color: '#12100d',
    fontSize: 13,
    fontFamily: AppFonts.sans,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#2b241c',
    backgroundColor: '#1b1813',
    alignItems: 'flex-end',
  },
  closeFooterBtn: {
    backgroundColor: '#26201a',
    borderWidth: 1,
    borderColor: '#4d3f32',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  closeFooterBtnText: {
    color: '#ded5c7',
    fontSize: 12.5,
    fontWeight: '600',
  },
});

