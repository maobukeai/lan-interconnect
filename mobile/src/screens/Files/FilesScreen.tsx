/**
 * 文件管理页面（占位）
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

const FilesScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text variant="headlineMedium">文件管理</Text>
      <Text variant="bodyMedium" style={styles.hint}>
        文件浏览、上传下载功能开发中...
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

export default FilesScreen;
