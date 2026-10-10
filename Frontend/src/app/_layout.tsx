import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <ThemeProvider value={DarkTheme}>
      <StatusBar style="light" backgroundColor="#0e0d0b" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0e0d0b' },
          animation: 'fade',
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="projects/index" />
        <Stack.Screen name="graph/index" />
      </Stack>
    </ThemeProvider>
  );
}
