import { router } from 'expo-router';
import React, { useState } from 'react';
import {
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

export default function ProjectsScreen() {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState<StoryProject[]>(INITIAL_PROJECTS);
  const [modalVisible, setModalVisible] = useState(false);
  const [userModalVisible, setUserModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newGenre, setNewGenre] = useState('');

  const displayName = user?.penName || 'Tác giả';
  const displayInitial = displayName.charAt(0).toUpperCase();

  const handleLogout = async () => {
    setUserModalVisible(false);
    await logout();
    router.replace('/' as any);
  };

  const totalProjects = projects.length;
  const totalNodes = projects.reduce((acc, p) => acc + p.nodeCount, 0);

  const handleOpenProject = (project: StoryProject) => {
    router.push({
      pathname: '/graph' as any,
      params: { projectId: project.id },
    });
  };

  const handleCreateProject = () => {
    if (!newTitle.trim()) return;
    const newProj: StoryProject = {
      id: `project-${Date.now()}`,
      number: `№ 0${projects.length + 1}`,
      title: newTitle.trim(),
      genre: newGenre.trim() || 'Huyền huyễn · Phiêu lưu',
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
    setProjects([newProj, ...projects]);
    setNewTitle('');
    setNewGenre('');
    setModalVisible(false);
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
            <Text style={styles.statLabel}>DỰ ÁN</Text>
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

        {/* Projects List */}
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
                <Text style={styles.cardNum}>{project.number}</Text>
                <Text style={styles.cardTitle}>{project.title}</Text>
                <Text style={styles.cardGenre}>{project.genre}</Text>
                <Text style={styles.cardMeta}>
                  {project.nodeCount} node · {project.linkCount} liên kết ·{' '}
                  {project.updatedAt}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* New Project Modal (Bottom Sheet - Screenshot 2) */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalDismissArea}
            onPress={() => setModalVisible(false)}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalKeyboardAvoiding}
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Khai sinh một thế giới</Text>

              <View style={styles.modalInputGroup}>
                <TextInput
                  style={[styles.modalInput, styles.modalInputTitle]}
                  value={newTitle}
                  onChangeText={setNewTitle}
                  placeholder="Tên truyện"
                  placeholderTextColor="#665f52"
                  autoFocus
                />

                <TextInput
                  style={styles.modalInput}
                  value={newGenre}
                  onChangeText={setNewGenre}
                  placeholder="Thể loại (vd. Kiếm hiệp, Trinh thám...)"
                  placeholderTextColor="#665f52"
                />
              </View>

              <View style={styles.modalActionRow}>
                <Pressable
                  style={styles.modalCancelBtn}
                  onPress={() => setModalVisible(false)}>
                  <Text style={styles.modalCancelText}>Hủy</Text>
                </Pressable>
                <Pressable
                  style={styles.modalConfirmBtn}
                  onPress={handleCreateProject}>
                  <Text style={styles.modalConfirmText}>Tạo dự án</Text>
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
    marginVertical: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 22,
    color: '#e5a93c',
    fontFamily: AppFonts.serif,
    fontStyle: 'italic',
    fontWeight: '500',
  },
  addBtn: {
    backgroundColor: '#db9d33',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 22,
  },
  addBtnPressed: {
    opacity: 0.85,
  },
  addBtnText: {
    color: '#15130e',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: AppFonts.sans,
  },
  listContainer: {
    gap: 16,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#181612',
    borderWidth: 1,
    borderColor: '#2e2a22',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    gap: 14,
  },
  cardPressed: {
    borderColor: '#db9d33',
    backgroundColor: '#1f1c16',
  },
  thumbBox: {
    width: 68,
    height: 68,
    borderRadius: 8,
    backgroundColor: '#100f0c',
    borderWidth: 1,
    borderColor: '#24211a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
  },
  cardNum: {
    fontSize: 10.5,
    color: '#9e7e39',
    letterSpacing: 1.5,
    fontWeight: '700',
    fontFamily: AppFonts.mono,
    marginBottom: 2,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: ThemeColors.textPrimary,
    fontFamily: AppFonts.serif,
    lineHeight: 22,
  },
  cardGenre: {
    fontSize: 12.5,
    color: '#8c8577',
    marginTop: 3,
    fontFamily: AppFonts.sans,
  },
  cardMeta: {
    fontSize: 11,
    color: '#615b4f',
    marginTop: 6,
    fontFamily: AppFonts.sans,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalDismissArea: {
    flex: 1,
  },
  modalKeyboardAvoiding: {
    width: '100%',
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#15130f',
    borderTopWidth: 1.5,
    borderTopColor: '#c99632',
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 36,
    gap: 22,
  },
  modalTitle: {
    fontSize: 23,
    fontStyle: 'italic',
    color: '#f5eee6',
    fontFamily: AppFonts.serif,
  },
  modalInputGroup: {
    gap: 16,
  },
  modalInput: {
    borderBottomWidth: 1,
    borderBottomColor: '#363025',
    paddingVertical: 12,
    paddingHorizontal: 0,
    color: '#f5eee6',
    fontSize: 15,
    fontFamily: AppFonts.sans,
  },
  modalInputTitle: {
    borderBottomColor: '#c99632',
    borderBottomWidth: 1.5,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#15130f',
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
  headerUserPressable: {
    flex: 1,
    marginRight: 12,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  userModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#15130e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3a3224',
    padding: 24,
    alignItems: 'center',
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
