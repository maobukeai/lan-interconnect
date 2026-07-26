/**
 * 连接引导页面
 * 提供扫码连接和手动输入连接两种方式
 */
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  Divider,
  ActivityIndicator,
} from 'react-native-paper';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '../store';
import { connectionService } from '../services/ConnectionService';
import { saveLastConnection } from '../store/slices/settingsSlice';

const ConnectionScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const dispatch: AppDispatch = useDispatch();
  const connectionState = useSelector((state: RootState) => state.connection);
  
  const [serverUrl, setServerUrl] = useState('');
  const [pin, setPin] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  /**
   * 处理手动连接
   */
  const handleConnect = async () => {
    if (!serverUrl.trim()) {
      Alert.alert('提示', '请输入服务器地址');
      return;
    }

    setIsConnecting(true);
    
    try {
      // 确保 URL 格式正确
      let url = serverUrl.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `http://${url}`;
      }

      // 连接服务器
      const result = await connectionService.connect(url, pin || undefined);
      
      if (result.success) {
        // 保存上次连接信息
        dispatch(saveLastConnection({ serverUrl: url, pin: pin || undefined }));
        
        // 跳转到主页面
        navigation.replace('Dashboard');
      } else {
        Alert.alert('连接失败', result.error);
      }
    } catch (error: any) {
      Alert.alert('连接失败', error.message || '无法连接到服务器');
    } finally {
      setIsConnecting(false);
    }
  };

  /**
   * 处理扫码连接
   */
  const handleScanQR = () => {
    // TODO: 打开扫码页面
    navigation.navigate('QRScanner', {
      onScan: (data: string) => {
        // 解析二维码数据（格式：http://192.168.1.100:3000?pin=123456）
        try {
          const url = new URL(data);
          const pinFromQR = url.searchParams.get('pin');
          
          setServerUrl(`${url.protocol}//${url.host}`);
          if (pinFromQR) {
            setPin(pinFromQR);
          }
          
          // 自动连接
          setTimeout(() => handleConnect(), 500);
        } catch (error) {
          Alert.alert('二维码格式错误', '无法解析二维码内容');
        }
      },
    });
  };

  /**
   * 快速扫描局域网设备
   */
  const handleScanNetwork = async () => {
    // TODO: 实现网络发现功能
    Alert.alert('提示', '网络发现功能开发中...');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Logo 和标题 */}
        <View style={styles.header}>
          <Text variant="displayMedium" style={styles.title}>
            局域网互联
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            跨设备文件共享与通信
          </Text>
        </View>

        {/* 连接卡片 */}
        <Card style={styles.card} elevation={2}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.cardTitle}>
              连接到电脑
            </Text>
            
            <Divider style={styles.divider} />
            
            {/* 服务器地址输入 */}
            <TextInput
              label="服务器地址"
              placeholder="例如：192.168.1.100:3000"
              value={serverUrl}
              onChangeText={setServerUrl}
              mode="outlined"
              style={styles.input}
              disabled={isConnecting}
              left={<TextInput.Icon icon="server" />}
            />
            
            {/* PIN 码输入 */}
            <TextInput
              label="PIN 码（可选）"
              placeholder="访问密码"
              value={pin}
              onChangeText={setPin}
              mode="outlined"
              style={styles.input}
              disabled={isConnecting}
              secureTextEntry
              left={<TextInput.Icon icon="lock" />}
            />
            
            {/* 连接按钮 */}
            <Button
              mode="contained"
              onPress={handleConnect}
              loading={isConnecting}
              disabled={isConnecting}
              style={styles.button}
              size="large"
            >
              {isConnecting ? '连接中...' : '连接'}
            </Button>
            
            {/* 分割线 */}
            <Divider style={styles.divider}>
              <Text variant="bodySmall">或</Text>
            </Divider>
            
            {/* 扫码按钮 */}
            <Button
              mode="outlined"
              onPress={handleScanQR}
              icon="qrcode-scan"
              style={styles.button}
              disabled={isConnecting}
            >
              扫描二维码
            </Button>
            
            {/* 网络发现按钮 */}
            <Button
              mode="text"
              onPress={handleScanNetwork}
              icon="wifi"
              style={styles.button}
              disabled={isConnecting}
            >
              扫描局域网设备
            </Button>
          </Card.Content>
        </Card>

        {/* 连接状态显示 */}
        {connectionState.status === 'connecting' && (
          <View style={styles.statusContainer}>
            <ActivityIndicator animating size="large" />
            <Text variant="bodyMedium" style={styles.statusText}>
              正在连接...
            </Text>
          </View>
        )}
        
        {connectionState.status === 'error' && connectionState.error && (
          <View style={[styles.statusContainer, styles.errorContainer]}>
            <Text variant="bodyMedium" style={styles.errorText}>
              错误：{connectionState.error}
            </Text>
          </View>
        )}

        {/* 帮助提示 */}
        <Card style={styles.helpCard} elevation={0}>
          <Card.Content>
            <Text variant="bodySmall" style={styles.helpText}>
              💡 提示：在电脑上启动"局域网互联 Pro"后，使用手机扫描屏幕上显示的二维码即可快速连接。
            </Text>
          </Card.Content>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontWeight: 'bold',
    color: '#6366f1',
  },
  subtitle: {
    color: '#666',
    marginTop: 8,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardTitle: {
    fontWeight: '600',
    marginBottom: 16,
  },
  divider: {
    marginVertical: 16,
  },
  input: {
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  button: {
    marginTop: 8,
  },
  statusContainer: {
    alignItems: 'center',
    marginTop: 24,
    padding: 16,
  },
  statusText: {
    marginTop: 12,
    color: '#666',
  },
  errorContainer: {
    backgroundColor: '#fee',
    borderRadius: 8,
  },
  errorText: {
    color: '#c00',
  },
  helpCard: {
    marginTop: 24,
    backgroundColor: '#e8eaf6',
  },
  helpText: {
    color: '#333',
    lineHeight: 22,
  },
});

export default ConnectionScreen;
