import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getProjectChapters, StoryProject } from '@/constants/story-data';
import { AppFonts } from '@/constants/theme';

const USE_NATIVE_DRIVER = Platform.OS !== 'web';
const OPEN_DURATION = 280;
const CLOSE_DURATION = 220;

type GraphSection =
  | 'graph'
  | 'nodes'
  | 'events'
  | 'locations'
  | 'characters'
  | 'factions'
  | 'items'
  | 'links'
  | 'checker';

interface GraphSidebarProps {
  visible: boolean;
  project: StoryProject;
  activeSection: GraphSection;
  onClose: () => void;
}

/**
 * Thanh bên điều hướng dự án.
 * - Không dùng Modal để tránh lỗi kẹt trạng thái khi mở/đóng liên tục.
 * - Gỡ khỏi cây layout/focus sau khi animation đóng hoàn tất.
 * - Trạng thái mở/đóng hoàn toàn do prop `visible` của màn hình cha quyết định.
 */
export function GraphSidebar({
  visible,
  project,
  activeSection,
  onClose,
}: GraphSidebarProps) {
  const { width: windowWidth } = useWindowDimensions();
  const drawerWidth = Math.min(320, Math.floor(windowWidth * 0.84));
  const insets = useSafeAreaInsets();
  const chapters = getProjectChapters(project);

  const [isRendered, setIsRendered] = useState(visible);

  // -drawerWidth = đóng hoàn toàn, 0 = mở hoàn toàn
  const translateX = useRef(new Animated.Value(visible ? 0 : -drawerWidth)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const drawerWidthRef = useRef(drawerWidth);
  drawerWidthRef.current = drawerWidth;
  const prevDrawerWidthRef = useRef(drawerWidth);

  // Chỉ đồng bộ lại vị trí ẩn khi drawerWidth thay đổi trong lúc thanh bên đang đóng
  useEffect(() => {
    if (prevDrawerWidthRef.current !== drawerWidth) {
      prevDrawerWidthRef.current = drawerWidth;
      if (!visibleRef.current) {
        translateX.setValue(-drawerWidth);
      }
    }
  }, [drawerWidth, translateX]);

  // Animation trượt ra / trượt vào theo prop `visible`
  useEffect(() => {
    if (visible) {
      setIsRendered(true);
    }
    translateX.stopAnimation();
    Animated.timing(translateX, {
      toValue: visible ? 0 : -drawerWidth,
      duration: visible ? OPEN_DURATION : CLOSE_DURATION,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start(({ finished }) => {
      if (finished && !visibleRef.current) {
        setIsRendered(false);
      }
    });
  }, [visible, drawerWidth, translateX]);

  // Nút Back trên Android đóng thanh bên
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onCloseRef.current();
      return true;
    });
    return () => sub.remove();
  }, [visible]);

  // Vuốt sang trái để đóng (kéo theo tay)
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          visibleRef.current &&
          Math.abs(g.dx) > 8 &&
          Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
        onPanResponderGrant: () => {
          translateX.stopAnimation();
        },
        onPanResponderMove: (_, g) => {
          const w = drawerWidthRef.current;
          translateX.setValue(Math.max(-w, Math.min(0, g.dx)));
        },
        onPanResponderRelease: (_, g) => {
          const w = drawerWidthRef.current;
          if (!visibleRef.current || g.dx < -w * 0.3 || g.vx < -0.5) {
            onCloseRef.current();
            if (!visibleRef.current) {
              Animated.spring(translateX, {
                toValue: -w,
                friction: 9,
                tension: 70,
                useNativeDriver: USE_NATIVE_DRIVER,
              }).start();
            }
          } else {
            Animated.spring(translateX, {
              toValue: 0,
              friction: 9,
              tension: 70,
              useNativeDriver: USE_NATIVE_DRIVER,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          const w = drawerWidthRef.current;
          Animated.spring(translateX, {
            toValue: visibleRef.current ? 0 : -w,
            friction: 9,
            tension: 70,
            useNativeDriver: USE_NATIVE_DRIVER,
          }).start();
        },
      }),
    [translateX]
  );

  const backdropOpacity = useMemo(
    () =>
      translateX.interpolate({
        inputRange: [-drawerWidth, 0],
        outputRange: [0, 0.65],
        extrapolate: 'clamp',
      }),
    [translateX, drawerWidth]
  );

  if (!isRendered && !visible) {
    return null;
  }

  const handleNavigate = (route: string, isActive: boolean) => {
    onClose();
    if (!isActive) {
      router.replace({
        pathname: route as any,
        params: { projectId: project.id },
      });
    }
  };

  const sections: {
    id: GraphSection;
    number: string;
    icon: string;
    title: string;
    subtitle?: string;
    badge?: number;
    route: string;
  }[] = [
    { id: 'graph', number: '01', icon: '☍', title: 'Bản đồ node', subtitle: 'Màn hình đồ thị trực quan', route: '/graph' },
    { id: 'nodes', number: '02', icon: '◈', title: 'Chi tiết node', subtitle: 'Danh sách toàn bộ node', badge: project.nodes.length, route: '/graph/nodes' },
    { id: 'events', number: '03', icon: '📖', title: 'Chi tiết chương', subtitle: 'Dòng thời gian & sự kiện', badge: chapters.length, route: '/graph/events' },
    { id: 'locations', number: '04', icon: '📍', title: 'Địa điểm', badge: project.nodes.filter((n) => n.type === 'location').length, route: '/graph/locations' },
    { id: 'characters', number: '05', icon: '👤', title: 'Nhân vật', badge: project.nodes.filter((n) => n.type === 'character').length, route: '/graph/characters' },
    { id: 'factions', number: '06', icon: '🏛️', title: 'Tổ chức / Môn phái', badge: project.nodes.filter((n) => n.type === 'faction').length, route: '/graph/factions' },
    { id: 'items', number: '07', icon: '⚔️', title: 'Vật phẩm / Bảo vật', badge: project.nodes.filter((n) => n.type === 'item').length, route: '/graph/items' },
    { id: 'links', number: '08', icon: '⟷', title: 'Mối liên kết', subtitle: 'Tất cả cạnh quan hệ', badge: project.links.length, route: '/graph/links' },
    { id: 'checker', number: '09', icon: '🔍', title: 'Kiểm tra văn bản', subtitle: 'Bắt lỗi & trích xuất node', route: '/graph/checker' },
  ];

  return (
    <View
      style={styles.root}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityViewIsModal={visible}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}>
      {/* Nền tối: bấm ra ngoài để đóng */}
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Đóng thanh điều hướng"
        />
      </Animated.View>

      {/* Thanh bên trượt từ trái */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.drawer,
          {
            width: drawerWidth,
            transform: [{ translateX }],
          },
        ]}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
          bounces={false}>
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <View style={styles.headerTagBox}>
                <Text style={styles.headerSub}>DỰ ÁN TRUYỆN</Text>
              </View>
              <Pressable
                style={styles.closeBtn}
                onPress={onClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Đóng thanh điều hướng">
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>
            <Text style={styles.projectTitle} numberOfLines={2}>
              {project.title}
            </Text>
            <Text style={styles.projectGenre} numberOfLines={1}>
              {project.genre || 'Tiểu thuyết / Kịch bản'}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.menuList}>
            {sections.map((section) => {
              const isActive = section.id === activeSection;
              return (
                <Pressable
                  key={section.id}
                  style={({ pressed }) => [
                    styles.menuItem,
                    isActive && styles.menuItemActive,
                    pressed && styles.menuItemPressed,
                  ]}
                  onPress={() => handleNavigate(section.route, isActive)}>
                  <Text style={[styles.itemIcon, isActive && styles.itemIconActive]}>
                    {section.icon}
                  </Text>
                  <View style={styles.titleBox}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.number, isActive && styles.numberActive]}>
                        {section.number}.
                      </Text>
                      <Text style={[styles.title, isActive && styles.titleActive]}>
                        {section.title}
                      </Text>
                    </View>
                    {section.subtitle ? (
                      <Text style={styles.subtitle} numberOfLines={1}>
                        {section.subtitle}
                      </Text>
                    ) : null}
                  </View>
                  {section.badge !== undefined ? (
                    <View style={[styles.badgeBox, isActive && styles.badgeBoxActive]}>
                      <Text style={[styles.badgeText, isActive && styles.badgeTextActive]}>
                        {section.badge}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.divider} />

          <Pressable
            style={({ pressed }) => [
              styles.projectButton,
              pressed && styles.projectButtonPressed,
            ]}
            onPress={() => {
              onClose();
              router.replace('/projects' as any);
            }}>
            <Text style={styles.projectButtonIcon}>‹</Text>
            <Text style={styles.projectButtonText}>Về danh sách dự án</Text>
          </Pressable>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    elevation: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#12100d',
    borderRightWidth: 1,
    borderRightColor: '#2b2318',
    shadowColor: '#000000',
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 20,
    elevation: 24,
  },
  content: {
    paddingHorizontal: 16,
  },
  header: { gap: 6, paddingBottom: 6 },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTagBox: {
    backgroundColor: 'rgba(209,152,57,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(209,152,57,0.25)',
  },
  headerSub: {
    color: '#e5a93c',
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '700',
    fontFamily: AppFonts.sans,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1b1712',
    borderWidth: 1,
    borderColor: '#382f23',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { color: '#b0a696', fontSize: 13, fontWeight: '700' },
  projectTitle: {
    color: '#ede5d8',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: AppFonts.sans,
    marginTop: 2,
    lineHeight: 24,
  },
  projectGenre: { color: '#8a7e6d', fontSize: 12, fontFamily: AppFonts.sans },
  divider: { height: 1, backgroundColor: '#262017', marginVertical: 12 },
  menuList: { gap: 4 },
  menuItem: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  menuItemActive: {
    backgroundColor: 'rgba(209,152,57,0.14)',
    borderLeftColor: '#e5a93c',
  },
  menuItemPressed: { backgroundColor: 'rgba(255,255,255,0.05)' },
  itemIcon: { fontSize: 15, color: '#736a5c', width: 20, textAlign: 'center' },
  itemIconActive: { color: '#e5a93c' },
  titleBox: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  number: { color: '#6e6557', fontSize: 11, fontWeight: '700', fontFamily: AppFonts.sans },
  numberActive: { color: '#e5a93c' },
  title: { color: '#c4b9a8', fontSize: 13, fontWeight: '600', fontFamily: AppFonts.sans },
  titleActive: { color: '#f0c265', fontWeight: '700' },
  subtitle: { color: '#6e6557', fontSize: 10, fontFamily: AppFonts.sans },
  badgeBox: {
    backgroundColor: '#1d1914',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#30281d',
    minWidth: 22,
    alignItems: 'center',
  },
  badgeBoxActive: {
    backgroundColor: 'rgba(209,152,57,0.2)',
    borderColor: 'rgba(209,152,57,0.4)',
  },
  badgeText: { color: '#8f887b', fontSize: 11, fontWeight: '600', fontFamily: AppFonts.sans },
  badgeTextActive: { color: '#e5a93c' },
  projectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#181410',
    borderWidth: 1,
    borderColor: '#2b2318',
  },
  projectButtonPressed: { backgroundColor: '#201a14' },
  projectButtonIcon: { color: '#e5a93c', fontSize: 18, lineHeight: 18, fontWeight: '700' },
  projectButtonText: {
    color: '#b0a696',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: AppFonts.sans,
  },
});
