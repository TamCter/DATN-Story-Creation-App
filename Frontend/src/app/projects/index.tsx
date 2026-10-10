import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line } from 'react-native-svg';

import { INITIAL_PROJECTS, StoryProject } from '@/constants/story-data';
import { AppFonts, ThemeColors } from '@/constants/theme';

export default function ProjectsScreen() {
  const [projects, setProjects] = useState<StoryProject[]>(INITIAL_PROJECTS);
  const [modalVisible, setModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newGenre, setNewGenre] = useState('');

  const totalProjects = projects.length;
  const totalNodes = projects.reduce((acc, p) => acc + p.nodeCount, 0);

  const handleOpenProject = (project: StoryProject) => {
    router.push({
      pathname: '/graph',
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
          <View>
            <Text style={styles.greetingSub}>XIN CHÀO,</Text>
            <Text style={styles.userName}>Tam</Text>
          </View>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>T</Text>
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

      {/* New Project Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Tạo dự án truyện mới</Text>

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalInputLabel}>Tên tác phẩm</Text>
              <TextInput
                style={styles.modalInput}
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder="Ví dụ: Vạn Cổ Kiếm Tông"
                placeholderTextColor="#665f52"
              />
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalInputLabel}>Thể loại</Text>
              <TextInput
                style={styles.modalInput}
                value={newGenre}
                onChangeText={setNewGenre}
                placeholder="Ví dụ: Tiên hiệp · Thần thoại"
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
        </View>
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
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#191713',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#383226',
    padding: 24,
    gap: 18,
  },
  modalTitle: {
    fontSize: 20,
    color: '#e5a93c',
    fontFamily: AppFonts.serif,
    fontWeight: '600',
  },
  modalInputGroup: {
    gap: 6,
  },
  modalInputLabel: {
    fontSize: 12.5,
    color: '#8f887b',
    fontFamily: AppFonts.sans,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#2d281f',
    backgroundColor: '#12110e',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f5eee6',
    fontSize: 14,
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  modalCancelText: {
    color: '#8f887b',
    fontSize: 14,
  },
  modalConfirmBtn: {
    backgroundColor: '#db9d33',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  modalConfirmText: {
    color: '#15130e',
    fontWeight: '700',
    fontSize: 14,
  },
});
