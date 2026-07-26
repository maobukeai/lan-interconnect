/**
 * Material Design 主题配置
 */
import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#6366f1', // Indigo
    secondary: '#8b5cf6', // Violet
    tertiary: '#06b6d4', // Cyan
    error: '#ef4444',
    background: '#f8fafc',
    surface: '#ffffff',
    onPrimary: '#ffffff',
    onSecondary: '#ffffff',
  },
  roundness: 12,
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#818cf8',
    secondary: '#a78bfa',
    tertiary: '#22d3ee',
    background: '#0f172a',
    surface: '#1e293b',
  },
  roundness: 12,
};
