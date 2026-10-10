import '@/global.css';
import { Platform } from 'react-native';

export const ThemeColors = {
  background: '#0e0d0b',
  backgroundElevated: '#151310',
  surface: '#181612',
  surfaceCard: '#1a1814',
  border: '#28251e',
  borderLight: '#383329',
  borderGold: 'rgba(229, 169, 60, 0.35)',

  gold: '#e5a93c',
  goldLight: '#f3c76f',
  goldDim: '#ba852d',
  goldGlow: 'rgba(229, 169, 60, 0.2)',
  goldGlowStrong: 'rgba(229, 169, 60, 0.45)',

  textPrimary: '#f5eee6',
  textSecondary: '#8f887b',
  textMuted: '#5e584d',
  textGold: '#e5a93c',

  nodeCharacter: '#e5a93c',
  nodeItem: '#42b883',
  nodeFaction: '#d95a38',
  nodeEvent: '#5b8ec2',
  nodeLocation: '#9f70cf',
};

export const Colors = {
  light: {
    text: '#f5eee6',
    background: '#0e0d0b',
    backgroundElement: '#181612',
    backgroundSelected: '#24211a',
    textSecondary: '#8f887b',
  },
  dark: {
    text: '#f5eee6',
    background: '#0e0d0b',
    backgroundElement: '#181612',
    backgroundSelected: '#24211a',
    textSecondary: '#8f887b',
  },
} as const;

export const AppFonts = {
  serif: Platform.select({
    ios: 'Georgia',
    android: 'serif',
    web: '"Playfair Display", Georgia, "Noto Serif", serif',
    default: 'serif',
  }),
  sans: Platform.select({
    ios: 'system-ui',
    android: 'sans-serif',
    web: 'Spline Sans, Inter, system-ui, sans-serif',
    default: 'sans-serif',
  }),
  mono: Platform.select({
    ios: 'ui-monospace',
    android: 'monospace',
    web: 'ui-monospace, monospace',
    default: 'monospace',
  }),
};

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
