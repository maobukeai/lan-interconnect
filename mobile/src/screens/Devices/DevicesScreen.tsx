/**
 * 设备列表页面（占位）
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

const DevicesScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text variant="headlineMedium">设备管理</Text>
      <Text variant="bodyMedium" style={styles.hint}>
        在线设备列表、网速监控功能开发中...
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  hint: {
    marginTop: 16,
    color: '#666',
  },
});

export default DevicesScreen;
