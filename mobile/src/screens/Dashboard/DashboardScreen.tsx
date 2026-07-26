/**
 * 仪表盘页面（占位）
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useDispatch } from 'react-redux';
import { connectionService } from '../../services/ConnectionService';

const DashboardScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const dispatch = useDispatch();

  const handleDisconnect = () => {
    connectionService.disconnect();
    navigation.replace('Connection');
  };

  return (
    <View style={styles.container}>
      <Text variant="headlineMedium">Dashboard</Text>
      <Text variant="bodyMedium" style={styles.hint}>
        控制大盘功能开发中...
      </Text>
      
      <Button 
        mode="outlined" 
        onPress={handleDisconnect}
        style={styles.button}
      >
        断开连接
      </Button>
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
  button: {
    marginTop: 24,
  },
});

export default DashboardScreen;
