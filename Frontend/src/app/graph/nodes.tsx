import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  INITIAL_PROJECTS,
  NODE_TYPE_CONFIG,
} from '@/constants/story-data';
import { AppFonts, ThemeColors } from '@/constants/theme';

export default function NodesDetailScreen() {
  const params = useLocalSearchParams();
  const projectId = (params.projectId as string) || 'project-1';

  const currentProject = useMemo(() => {
    return (
      INITIAL_PROJECTS.find((p) => p.id === projectId) || INITIAL_PROJECTS[0]
    );
  }, [projectId]);

  const nodes = currentProject.nodes;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.headerBar}>
        <Pressable
          hitSlop={12}
          style={({ pressed }) => [
            styles.backBtn,
            pressed && styles.backBtnPressed,
          ]}
          onPress={() => router.back()}>
          <Text style={styles.backBtnIcon}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Chi tiết node</Text>
      </View>

      {/* Nodes List */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {nodes.map((node) => {
          const config = NODE_TYPE_CONFIG[node.type];
          return (
            <View key={node.id} style={styles.nodeItem}>
              <View style={styles.nodeRow}>
                <View style={styles.nodeNameWrap}>
                  <Text style={[styles.nodeSymbol, { color: config.color }]}>
                    {config.symbol}
                  </Text>
                  <Text style={styles.nodeName}>{node.name}</Text>
                </View>
                <Text style={styles.nodeRoleBadge}>{node.role}</Text>
              </View>

              <Text style={styles.nodeDesc}>{node.desc}</Text>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: ThemeColors.background,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1c1a15',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#2d271e',
    backgroundColor: '#15130f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPressed: {
    backgroundColor: '#201d16',
  },
  backBtnIcon: {
    color: '#e5a93c',
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '300',
    marginTop: -2,
  },
  headerTitle: {
    fontFamily: AppFonts.serif,
    fontStyle: 'italic',
    fontSize: 21,
    color: '#e5a93c',
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 40,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  nodeItem: {
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#1c1a15',
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  nodeNameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  nodeSymbol: {
    fontSize: 14,
  },
  nodeName: {
    fontFamily: AppFonts.serif,
    fontSize: 17.5,
    color: '#e5a93c',
    fontWeight: '500',
  },
  nodeRoleBadge: {
    fontSize: 10.5,
    letterSpacing: 1.5,
    color: '#8f887b',
    fontWeight: '700',
    fontFamily: AppFonts.sans,
    textTransform: 'uppercase',
  },
  nodeDesc: {
    fontSize: 13.5,
    lineHeight: 20,
    color: '#8f887b',
    fontFamily: AppFonts.sans,
    paddingLeft: 24,
  },
});
