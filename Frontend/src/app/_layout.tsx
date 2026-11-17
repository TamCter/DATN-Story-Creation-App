import { DarkTheme, ThemeProvider, Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { AuthProvider, useAuth } from '@/context/auth-context';

const customDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#0e0d0b',
    card: '#0e0d0b',
  },
};

function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isAuthScreen = pathname === '/';

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated && !isAuthScreen) {
      router.replace('/');
    } else if (isAuthenticated && isAuthScreen) {
      router.replace('/projects');
    }
  }, [isAuthenticated, isAuthScreen, isLoading, router]);

  return (
    <View style={styles.container}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0e0d0b' },
          animation: Platform.OS === 'web' ? 'none' : 'slide_from_right',
          animationDuration: 220,
          freezeOnBlur: true,
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="projects/index" />
        <Stack.Screen name="graph/index" />
        <Stack.Screen name="graph/nodes" />
        <Stack.Screen name="graph/events" />
        <Stack.Screen name="graph/chapters" />
        <Stack.Screen name="graph/locations" />
        <Stack.Screen name="graph/characters" />
        <Stack.Screen name="graph/factions" />
        <Stack.Screen name="graph/items" />
        <Stack.Screen name="graph/links" />
      </Stack>
      {(isLoading ||
        (!isAuthenticated && !isAuthScreen) ||
        (isAuthenticated && isAuthScreen)) && (
        <View pointerEvents="auto" style={styles.navigationGuard} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  navigationGuard: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#0e0d0b',
  },
});

export default function RootLayout() {
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync('#0e0d0b');
  }, []);

  return (
    <AuthProvider>
      <ThemeProvider value={customDarkTheme}>
        <StatusBar style="light" />
        <AppNavigator />
      </ThemeProvider>
    </AuthProvider>
  );
}
