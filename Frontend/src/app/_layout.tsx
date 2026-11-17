import {
  DarkTheme,
  ThemeProvider,
  Stack,
  useGlobalSearchParams,
  usePathname,
  useRouter,
  type Href,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useRef } from 'react';
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
  const searchParams = useGlobalSearchParams();
  const router = useRouter();
  const query = Object.entries(searchParams)
    .flatMap(([key, value]) => {
      const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
      return values.map(
        (item) => `${encodeURIComponent(key)}=${encodeURIComponent(item)}`
      );
    })
    .join('&');
  const currentUrl = `${pathname}${query ? `?${query}` : ''}`;
  const isProtectedPath = pathname !== '/' && pathname !== '/index';
  const pendingProtectedUrlRef = useRef<string | null>(
    isLoading && isProtectedPath ? currentUrl : null
  );

  useEffect(() => {
    if (isLoading && isProtectedPath) {
      pendingProtectedUrlRef.current = currentUrl;
    }
  }, [currentUrl, isLoading, isProtectedPath]);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      pendingProtectedUrlRef.current = null;
      return;
    }

    const pendingUrl = pendingProtectedUrlRef.current;
    pendingProtectedUrlRef.current = null;
    if (pendingUrl) {
      router.replace(pendingUrl as Href);
    } else if (pathname === '/' || pathname === '/index') {
      router.replace('/projects');
    }
  }, [isAuthenticated, isLoading, pathname, router]);

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
        <Stack.Protected guard={isLoading || !isAuthenticated}>
          <Stack.Screen name="index" />
        </Stack.Protected>
        <Stack.Protected guard={!isLoading && isAuthenticated}>
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
        </Stack.Protected>
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
