/**
 * 应用导航配置
 */
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useSelector } from 'react-redux';
import { RootState } from '../store';

// 导入页面
import ConnectionScreen from '../screens/Connection/ConnectionScreen';
import DashboardScreen from '../screens/Dashboard/DashboardScreen';
import FilesScreen from '../screens/Files/FilesScreen';
import ChatScreen from '../screens/Chat/ChatScreen';
import DevicesScreen from '../screens/Devices/DevicesScreen';
import QRScannerScreen from '../screens/Connection/QRScannerScreen';

export type RootStackParamList = {
  Connection: undefined;
  Dashboard: undefined;
  Files: undefined;
  Chat: undefined;
  Devices: undefined;
  QRScanner: { onScan: (data: string) => void };
};

const Stack = createStackNavigator<RootStackParamList>();

const AppNavigator: React.FC = () => {
  const connectionState = useSelector((state: RootState) => state.connection);

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      {connectionState.status === 'connected' ? (
        // 已连接时显示主页面
        <>
          <Stack.Screen name="Dashboard" component={DashboardScreen} />
          <Stack.Screen name="Files" component={FilesScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
          <Stack.Screen name="Devices" component={DevicesScreen} />
          <Stack.Screen 
            name="QRScanner" 
            component={QRScannerScreen}
            options={{ presentation: 'modal' }}
          />
        </>
      ) : (
        // 未连接时显示连接引导页
        <Stack.Screen name="Connection" component={ConnectionScreen} />
      )}
    </Stack.Navigator>
  );
};

export default AppNavigator;
