import { DarkTheme, ThemeProvider, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { AuthProvider } from '@/context/auth-context';

const customDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#0e0d0b',
    card: '#0e0d0b',
  },
};

export default function RootLayout() {
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync('#0e0d0b');
  }, []);

  return (
    <AuthProvider>
      <ThemeProvider value={customDarkTheme}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#0e0d0b' },
            animation: Platform.OS === 'web' ? 'none' : 'slide_from_right',
            animationDuration: 220,
            freezeOnBlur: false,
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
      </ThemeProvider>
    </AuthProvider>
  );
}
