import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
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
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { INITIAL_PROJECTS, StoryProject } from '@/constants/story-data';
import { AppFonts, ThemeColors } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { api } from '@/services/api';

export default function ProjectsScreen() {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState<StoryProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [userModalVisible, setUserModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newGenre, setNewGenre] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const displayName = user?.penName || 'Tác giả';
  const displayInitial = displayName.charAt(0).toUpperCase();

  // Tải danh sách dự án thuộc về User hiện tại từ Backend (Neo4j)
  const fetchUserProjects = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.getProjects();
      if (res.success && Array.isArray(res.data)) {
        if (res.data.length > 0) {
          setProjects(res.data as StoryProject[]);
        } else if (user?.id === 'user-guest-demo') {
          // Tài khoản khách mẫu mặc định có sẵn dự án mẫu
          setProjects(INITIAL_PROJECTS);
        } else {
          // Tài khoản mới của user: bắt đầu với danh sách trống riêng biệt
          setProjects([]);
        }
      } else {
        setProjects([]);
      }
    } catch (error) {
      console.warn('Lỗi lấy danh sách dự án từ máy chủ:', error);
      // Nếu là tài khoản mẫu và không có mạng, dùng dữ liệu mẫu
      if (user?.id === 'user-guest-demo') {
        setProjects(INITIAL_PROJECTS);
      } else {
        setProjects([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void fetchUserProjects();
  }, [fetchUserProjects]);

  const handleLogout = async () => {
    setUserModalVisible(false);
    await logout();
    router.replace('/' as any);
  };

  const totalProjects = projects.length;
  const totalNodes = projects.reduce((acc, p) => acc + (p.nodeCount || 0), 0);

  const handleOpenProject = (project: StoryProject) => {
    router.push({
      pathname: '/graph' as any,
      params: { projectId: project.id },
    });
  };

  // Tạo dự án mới gắn riêng cho User hiện tại
  const handleCreateProject = async () => {
    if (!newTitle.trim()) return;

    setIsCreating(true);
    const projNumber = `№ 0${projects.length + 1}`;
    const genreText = newGenre.trim() || 'Huyền huyễn · Phiêu lưu';

    try {
      const res = await api.createProject({
        title: newTitle.trim(),
        genre: genreText,
        number: projNumber,
      });

      if (res.success && res.data) {
        const created: StoryProject = {
          ...res.data,
          nodeCount: 0,
          linkCount: 0,
          updatedAt: 'Vừa xong',
          nodes: [],
          links: [],
        };
        setProjects([created, ...projects]);
      } else {
        // Fallback lưu local nếu backend lỗi
        const fallbackProj: StoryProject = {
          id: `project-${Date.now()}`,
          number: projNumber,
          title: newTitle.trim(),
          genre: genreText,
          nodeCount: 1,
          linkCount: 0,
          updatedAt: 'Vừa xong',
          nodes: [
            {
              id: 'root-1',
              name: 'Khởi điểm',
              type: 'character',
              role: 'CHÍNH DIỆN',
              desc: 'Nhân vật đầu tiên trong mạch truyện.',
              x: 180,
              y: 350,
            },
          ],
          links: [],
        };
        setProjects([fallbackProj, ...projects]);
      }

      setNewTitle('');
      setNewGenre('');
      setModalVisible(false);
    } catch (err) {
      console.warn('Lỗi tạo dự án:', err);
    } finally {
      setIsCreating(false);
    }
  };

  // Nạp dự án mẫu "Hoàng Hôn Kiếm Vương" vào tài khoản của User nếu muốn
  const handleLoadSampleProject = async () => {
    setIsCreating(true);
    try {
      const sample = INITIAL_PROJECTS[0];
      const res = await api.createProject({
        title: sample.title,
        genre: sample.genre,
        number: '№ 01',
        desc: 'Mẫu cốt truyện kiếm hiệp Hoàng Hôn Kiếm Vương',
      });

      if (res.success && res.data) {
        const created: StoryProject = {
          ...res.data,
          nodeCount: 0,
          linkCount: 0,
          updatedAt: res.data.updatedAt || 'Vừa xong',
          nodes: [],
          links: [],
        };
        setProjects([created, ...projects]);
      } else {
        const msg = res.message || 'Không thể tạo dự án mẫu trên máy chủ.';
        Alert.alert('Lỗi tạo dự án', msg);
      }
    } catch (err: any) {
      console.warn('Lỗi nạp dự án mẫu:', err);
      const msg = err.message || 'Không thể kết nối đến máy chủ để tạo dự án mẫu.';
      Alert.alert('Lỗi nạp dự án mẫu', msg);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}>
        {/* Top Header */}
        <View style={styles.headerRow}>
          <Pressable onPress={() => setUserModalVisible(true)} style={styles.headerUserPressable}>
            <Text style={styles.greetingSub}>XIN CHÀO,</Text>
            <Text style={styles.userName} numberOfLines={1}>
              {displayName}
            </Text>
          </Pressable>
          <View style={styles.headerRightActions}>
            <Pressable
              style={styles.avatarCircle}
              onPress={() => setUserModalVisible(true)}>
              <Text style={styles.avatarText}>{displayInitial}</Text>
            </Pressable>
            <Pressable
              style={styles.logoutIconBtn}
              onPress={handleLogout}
              accessibilityLabel="Đăng xuất">
              <Svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <Path
                  d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
                  stroke="#8f887b"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <Path
                  d="M16 17l5-5-5-5"
                  stroke="#8f887b"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <Line
                  x1="21"
                  y1="12"
                  x2="9"
                  y2="12"
                  stroke="#8f887b"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </Svg>
            </Pressable>
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsContainer}>
          <View style={styles.statCol}>
            <Text style={styles.statValue}>{totalProjects}</Text>
            <Text style={styles.statLabel}>DỰ ÁN CỦA BẠN</Text>
          </View>
          <View style={styles.statCol}>
            <Text style={[styles.statValue, styles.statValueGold]}>
              {totalNodes}
            </Text>
            <Text style={styles.statLabel}>NODE ĐÃ NỐI</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Section Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Các dự án truyện</Text>
          <Pressable
            style={({ pressed }) => [
              styles.addBtn,
              pressed && styles.addBtnPressed,
            ]}
            onPress={() => setModalVisible(true)}>
            <Text style={styles.addBtnText}>+ Dự án mới</Text>
          </Pressable>
        </View>

        {/* Projects List or Loading or Empty State */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={ThemeColors.gold} />
            <Text style={styles.loadingText}>Đang tải dự án của {displayName}...</Text>
          </View>
        ) : projects.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <Path
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                stroke="#554d3f"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d="M14 2v6h6"
                stroke="#554d3f"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Line x1="12" y1="18" x2="12" y2="12" stroke="#e5a93c" strokeWidth="1.5" strokeLinecap="round" />
              <Line x1="9" y1="15" x2="15" y2="15" stroke="#e5a93c" strokeWidth="1.5" strokeLinecap="round" />
            </Svg>
            <Text style={styles.emptyTitle}>Chưa có dự án nào</Text>
            <Text style={styles.emptyDesc}>
              Không gian sáng tác của tài khoản <Text style={{ color: ThemeColors.gold }}>{displayName}</Text> hoàn toàn riêng biệt.
            </Text>

            <Pressable
              style={styles.emptyCreateBtn}
              onPress={() => setModalVisible(true)}>
              <Text style={styles.emptyCreateBtnText}>+ Bắt đầu tạo dự án đầu tiên</Text>
            </Pressable>

            <Pressable
              style={styles.emptySampleBtn}
              onPress={handleLoadSampleProject}>
              <Text style={styles.emptySampleBtnText}>
                Hoặc nạp mẫu "Hoàng Hôn Kiếm Vương"
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {projects.map((project, index) => (
              <Pressable
                key={project.id}
                style={({ pressed }) => [
                  styles.card,
                  pressed && styles.cardPressed,
                ]}
                onPress={() => handleOpenProject(project)}>
                {/* Thumbnail Mini Graph */}
                <View style={styles.thumbBox}>
                  {index === 0 && (
                    <Svg width="56" height="56" viewBox="0 0 60 60">
                      <Line x1="15" y1="18" x2="45" y2="16" stroke="rgba(229,169,60,0.3)" strokeWidth="1" />
                      <Line x1="45" y1="16" x2="30" y2="34" stroke="rgba(229,169,60,0.3)" strokeWidth="1" />
                      <Line x1="15" y1="18" x2="30" y2="34" stroke="rgba(229,169,60,0.3)" strokeWidth="1" />
                      <Line x1="12" y1="40" x2="30" y2="34" stroke="rgba(229,169,60,0.3)" strokeWidth="1" />
                      <Line x1="30" y1="34" x2="48" y2="44" stroke="rgba(229,169,60,0.3)" strokeWidth="1" />
                      <Line x1="22" y1="50" x2="30" y2="34" stroke="rgba(229,169,60,0.3)" strokeWidth="1" />
                      <Circle cx="15" cy="18" r="3" fill="#e5a93c" />
                      <Circle cx="45" cy="16" r="3.5" fill="#e5a93c" />
                      <Circle cx="30" cy="34" r="4" fill="#e5a93c" />
                      <Circle cx="12" cy="40" r="3" fill="#d95a38" />
                      <Circle cx="48" cy="44" r="3" fill="#42b883" />
                      <Circle cx="22" cy="50" r="3" fill="#5b8ec2" />
                      <Circle cx="38" cy="52" r="3" fill="#9f70cf" />
                    </Svg>
                  )}
                  {index === 1 && (
                    <Svg width="56" height="56" viewBox="0 0 60 60">
                      <Line x1="18" y1="40" x2="30" y2="22" stroke="rgba(229,169,60,0.3)" strokeWidth="1" />
                      <Line x1="30" y1="22" x2="46" y2="38" stroke="rgba(229,169,60,0.3)" strokeWidth="1" />
                      <Circle cx="18" cy="40" r="3.5" fill="#9f70cf" />
                      <Circle cx="30" cy="22" r="4" fill="#e5a93c" />
                      <Circle cx="46" cy="38" r="3.5" fill="#42b883" />
                    </Svg>
                  )}
                  {index >= 2 && (
                    <Svg width="56" height="56" viewBox="0 0 60 60">
                      <Circle cx="30" cy="30" r="4" fill="#e5a93c" />
                    </Svg>
                  )}
                </View>

                {/* Card Content */}
                <View style={styles.cardContent}>
                  <Text style={styles.cardNum}>{project.number || `№ 0${index + 1}`}</Text>
                  <Text style={styles.cardTitle}>{project.title}</Text>
                  <Text style={styles.cardGenre}>{project.genre}</Text>
                  <Text style={styles.cardMeta}>
                    {project.nodeCount || 0} node · {project.linkCount || 0} liên kết ·{' '}
                    {project.updatedAt || 'Vừa xong'}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {/* New Project Modal (Bottom Sheet) */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalKeyboard}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Tạo dự án mới</Text>
                <Pressable onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </Pressable>
              </View>

              <View style={styles.modalInputGroup}>
                <Text style={styles.modalLabel}>TÊN CỐT TRUYỆN</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Ví dụ: Nghìn Thu Kiếm Vũ"
                  placeholderTextColor="#5e574a"
                  value={newTitle}
                  onChangeText={setNewTitle}
                  autoFocus
                />
              </View>

              <View style={styles.modalInputGroup}>
                <Text style={styles.modalLabel}>THỂ LOẠI</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Ví dụ: Tiên hiệp · Trùng sinh"
                  placeholderTextColor="#5e574a"
                  value={newGenre}
                  onChangeText={setNewGenre}
                />
              </View>

              <View style={styles.modalActionRow}>
                <Pressable
                  style={styles.modalCancelBtn}
                  onPress={() => setModalVisible(false)}>
                  <Text style={styles.modalCancelText}>Hủy</Text>
                </Pressable>
                <Pressable
                  disabled={isCreating}
                  style={[styles.modalConfirmBtn, isCreating && { opacity: 0.6 }]}
                  onPress={handleCreateProject}>
                  {isCreating ? (
                    <ActivityIndicator size="small" color="#15130e" />
                  ) : (
                    <Text style={styles.modalConfirmText}>Tạo dự án</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Modal Thông tin tác giả & Đăng xuất */}
      <Modal
        visible={userModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setUserModalVisible(false)}>
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setUserModalVisible(false)}>
          <Pressable style={styles.userModalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.userModalAvatar}>
              <Text style={styles.userModalAvatarText}>{displayInitial}</Text>
            </View>
            <Text style={styles.userModalName}>{displayName}</Text>
            <Text style={styles.userModalEmail}>
              {user?.email || 'Tài khoản mẫu (Khách)'}
            </Text>

            <View style={styles.userModalDivider} />

            <Pressable style={styles.userModalLogoutBtn} onPress={handleLogout}>
              <Text style={styles.userModalLogoutText}>Đăng xuất khỏi thiết bị</Text>
            </Pressable>

            <Pressable
              style={styles.userModalCloseBtn}
              onPress={() => setUserModalVisible(false)}>
              <Text style={styles.userModalCloseText}>Đóng</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: ThemeColors.background,
  },
  container: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 48,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  headerUserPressable: {
    flex: 1,
    marginRight: 12,
  },
  greetingSub: {
    fontSize: 11.5,
    letterSpacing: 2,
    color: '#8f887b',
    fontWeight: '700',
    fontFamily: AppFonts.sans,
    marginBottom: 4,
  },
  userName: {
    fontSize: 34,
    color: ThemeColors.textPrimary,
    fontFamily: AppFonts.serif,
    fontWeight: '600',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#c99632',
    backgroundColor: '#161410',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#e5a93c',
    fontSize: 20,
    fontWeight: '600',
    fontFamily: AppFonts.serif,
  },
  logoutIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1b1914',
    borderWidth: 1,
    borderColor: '#2e2a22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  statCol: {
    flex: 1,
  },
  statValue: {
    fontSize: 38,
    color: ThemeColors.textPrimary,
    fontWeight: '700',
    fontFamily: AppFonts.sans,
    lineHeight: 44,
  },
  statValueGold: {
    color: ThemeColors.gold,
  },
  statLabel: {
    fontSize: 11,
    color: '#a38340',
    fontWeight: '700',
    letterSpacing: 1.5,
    fontFamily: AppFonts.sans,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#26231c',
    marginVertical: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 20,
    color: ThemeColors.textPrimary,
    fontFamily: AppFonts.serif,
    fontWeight: '600',
  },
  addBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#221f19',
    borderWidth: 1,
    borderColor: '#3a3427',
  },
  addBtnPressed: {
    opacity: 0.7,
  },
  addBtnText: {
    color: ThemeColors.gold,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: AppFonts.sans,
  },
  listContainer: {
    gap: 14,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#171511',
    borderWidth: 1,
    borderColor: '#2b271f',
    borderRadius: 6,
    padding: 16,
    alignItems: 'center',
  },
  cardPressed: {
    borderColor: '#e5a93c',
    backgroundColor: '#1c1914',
  },
  thumbBox: {
    width: 56,
    height: 56,
    borderWidth: 1,
    borderColor: '#2f2a20',
    backgroundColor: '#12110d',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    borderRadius: 4,
  },
  cardContent: {
    flex: 1,
  },
  cardNum: {
    fontSize: 11,
    color: '#9e7930',
    fontWeight: '700',
    fontFamily: AppFonts.sans,
    letterSpacing: 1,
    marginBottom: 2,
  },
  cardTitle: {
    fontSize: 17,
    color: ThemeColors.textPrimary,
    fontFamily: AppFonts.serif,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardGenre: {
    fontSize: 12.5,
    color: '#857e72',
    fontFamily: AppFonts.sans,
    marginBottom: 6,
  },
  cardMeta: {
    fontSize: 11,
    color: '#554e42',
    fontFamily: AppFonts.sans,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#8f887b',
    fontSize: 14,
    fontFamily: AppFonts.sans,
  },
  emptyContainer: {
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: '#14120e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#26221a',
    borderStyle: 'dashed',
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: AppFonts.serif,
    fontWeight: '600',
    color: ThemeColors.textPrimary,
    marginTop: 12,
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 13,
    color: '#8a8274',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    fontFamily: AppFonts.sans,
  },
  emptyCreateBtn: {
    backgroundColor: '#dca13c',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 22,
    alignItems: 'center',
    marginBottom: 10,
    width: '100%',
    maxWidth: 280,
  },
  emptyCreateBtnText: {
    color: '#15130f',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: AppFonts.sans,
  },
  emptySampleBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  emptySampleBtnText: {
    color: '#bd8f38',
    fontSize: 13,
    fontFamily: AppFonts.sans,
    textDecorationLine: 'underline',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalKeyboard: {
    width: '100%',
  },
  modalContent: {
    backgroundColor: '#1a1713',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderTopColor: '#3d3627',
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    color: ThemeColors.textPrimary,
    fontFamily: AppFonts.serif,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    color: '#8f887b',
    fontSize: 18,
  },
  modalInputGroup: {
    marginBottom: 20,
  },
  modalLabel: {
    fontSize: 11,
    color: '#bda36e',
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 8,
    fontFamily: AppFonts.sans,
  },
  modalInput: {
    backgroundColor: '#110f0c',
    borderWidth: 1,
    borderColor: '#383226',
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: ThemeColors.textPrimary,
    fontSize: 15,
    fontFamily: AppFonts.sans,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#383226',
    borderRadius: 4,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    color: '#f5eee6',
    fontSize: 14.5,
    fontWeight: '600',
    fontFamily: AppFonts.sans,
  },
  modalConfirmBtn: {
    flex: 1,
    backgroundColor: '#dca13c',
    borderRadius: 4,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    color: '#15130e',
    fontWeight: '700',
    fontSize: 14.5,
    fontFamily: AppFonts.sans,
  },
  userModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#15130e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3a3224',
    padding: 24,
    alignItems: 'center',
    alignSelf: 'center',
    marginVertical: 'auto',
  },
  userModalAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#c99632',
    backgroundColor: '#1b1914',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  userModalAvatarText: {
    color: '#e5a93c',
    fontSize: 26,
    fontWeight: '700',
    fontFamily: AppFonts.serif,
  },
  userModalName: {
    fontSize: 20,
    fontWeight: '700',
    color: ThemeColors.textPrimary,
    fontFamily: AppFonts.serif,
    marginBottom: 4,
    textAlign: 'center',
  },
  userModalEmail: {
    fontSize: 13,
    color: '#8f887b',
    fontFamily: AppFonts.sans,
    marginBottom: 16,
    textAlign: 'center',
  },
  userModalDivider: {
    width: '100%',
    height: 1,
    backgroundColor: '#26231c',
    marginBottom: 16,
  },
  userModalLogoutBtn: {
    width: '100%',
    backgroundColor: 'rgba(217, 90, 56, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(217, 90, 56, 0.4)',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  userModalLogoutText: {
    color: '#f09880',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: AppFonts.sans,
  },
  userModalCloseBtn: {
    width: '100%',
    paddingVertical: 10,
    alignItems: 'center',
  },
  userModalCloseText: {
    color: '#8f887b',
    fontSize: 14,
    fontFamily: AppFonts.sans,
  },
});
