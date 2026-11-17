import { router } from 'expo-router';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getProjectChapters, StoryProject } from '@/constants/story-data';

type GraphSection =
  | 'graph'
  | 'nodes'
  | 'events'
  | 'locations'
  | 'characters'
  | 'factions'
  | 'items'
  | 'links';

interface GraphSidebarProps {
  visible: boolean;
  project: StoryProject;
  activeSection: GraphSection;
  onClose: () => void;
}

export function GraphSidebar({
  visible,
  project,
  activeSection,
  onClose,
}: GraphSidebarProps) {
  const chapters = getProjectChapters(project);
  const sections: {
    id: GraphSection;
    number: string;
    title: string;
    subtitle?: string;
    badge?: number;
    route: string;
  }[] = [
    { id: 'graph', number: '01', title: 'Bản đồ node', subtitle: 'Màn hình đồ thị', route: '/graph' },
    { id: 'nodes', number: '02', title: 'Chi tiết node', subtitle: 'Danh sách các node', badge: project.nodes.length, route: '/graph/nodes' },
    { id: 'events', number: '03', title: 'Chi tiết chương', subtitle: 'Dòng thời gian & sự kiện', badge: chapters.length, route: '/graph/events' },
    { id: 'locations', number: '04', title: 'Địa điểm', badge: project.nodes.filter((node) => node.type === 'location').length, route: '/graph/locations' },
    { id: 'characters', number: '05', title: 'Nhân vật', badge: project.nodes.filter((node) => node.type === 'character').length, route: '/graph/characters' },
    { id: 'factions', number: '06', title: 'Tổ chức', badge: project.nodes.filter((node) => node.type === 'faction').length, route: '/graph/factions' },
    { id: 'items', number: '07', title: 'Vật phẩm', badge: project.nodes.filter((node) => node.type === 'item').length, route: '/graph/items' },
    { id: 'links', number: '08', title: 'Mối liên kết', subtitle: 'Tất cả cạnh', badge: project.links.length, route: '/graph/links' },
  ];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.drawer}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <Text style={styles.headerSub}>DỰ ÁN</Text>
              <Text style={styles.projectTitle}>{project.title}</Text>
              <Text style={styles.projectGenre}>{project.genre}</Text>
            </View>
            <View style={styles.divider} />
            {sections.map((section) => {
              const isActive = section.id === activeSection;
              return (
                <Pressable
                  key={section.id}
                  style={[styles.menuItem, isActive && styles.menuItemActive]}
                  onPress={() => {
                    onClose();
                    if (!isActive) {
                      router.replace({
                        pathname: section.route as any,
                        params: { projectId: project.id },
                      });
                    }
                  }}>
                  <Text style={[styles.number, isActive && styles.numberActive]}>
                    {section.number}
                  </Text>
                  <View style={styles.titleBox}>
                    <Text style={[styles.title, isActive && styles.titleActive]}>
                      {section.title}
                    </Text>
                    {section.subtitle ? (
                      <Text style={styles.subtitle}>{section.subtitle}</Text>
                    ) : null}
                  </View>
                  {section.badge !== undefined ? (
                    <Text style={styles.badge}>{section.badge}</Text>
                  ) : null}
                </Pressable>
              );
            })}
            <View style={styles.divider} />
            <Pressable
              style={styles.projectButton}
              onPress={() => {
                onClose();
                router.replace('/projects' as any);
              }}>
              <Text style={styles.projectButtonText}>〈 Về danh sách dự án</Text>
            </Pressable>
          </ScrollView>
        </View>
        <Pressable style={styles.backdropAction} onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  backdropAction: { flex: 1 },
  drawer: {
    width: 300,
    maxWidth: '84%',
    backgroundColor: '#11100d',
    borderRightWidth: 1,
    borderRightColor: '#342b1e',
  },
  content: { padding: 20, paddingTop: 54, gap: 8 },
  header: { gap: 5, paddingBottom: 8 },
  headerSub: {
    color: '#d19839',
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '700',
  },
  projectTitle: { color: '#e0d8cb', fontSize: 18, fontWeight: '700' },
  projectGenre: { color: '#736a5c', fontSize: 12 },
  divider: { height: 1, backgroundColor: '#29251e', marginVertical: 8 },
  menuItem: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  menuItemActive: { backgroundColor: 'rgba(209,152,57,0.12)' },
  number: { color: '#736a5c', fontSize: 11, fontWeight: '700' },
  numberActive: { color: '#e5a93c' },
  titleBox: { flex: 1, gap: 3 },
  title: { color: '#c4b9a8', fontSize: 13, fontWeight: '600' },
  titleActive: { color: '#e5a93c' },
  subtitle: { color: '#736a5c', fontSize: 10 },
  badge: { color: '#8f887b', fontSize: 11 },
  projectButton: { paddingVertical: 12, paddingHorizontal: 8 },
  projectButtonText: { color: '#b0a696', fontSize: 12 },
});
