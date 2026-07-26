/**
 * 聊天室页面（占位）
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

const ChatScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text variant="headlineMedium">聊天室</Text>
      <Text variant="bodyMedium" style={styles.hint}>
        实时聊天功能开发中...
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

export default ChatScreen;
