import { DarkTheme, ThemeProvider, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <ThemeProvider value={DarkTheme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0e0d0b' },
          animation: 'fade',
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="projects/index" />
        <Stack.Screen name="graph/index" />
        <Stack.Screen name="graph/nodes" />
        <Stack.Screen name="graph/events" />
        <Stack.Screen name="graph/locations" />
      </Stack>
    </ThemeProvider>
  );
}
