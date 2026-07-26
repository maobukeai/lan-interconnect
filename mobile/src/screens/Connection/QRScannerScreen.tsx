/**
 * 二维码扫描页面
 */
import React, { useEffect } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, Button } from 'react-native-paper';
// TODO: 实际开发中需要使用 react-native-vision-camera 或 react-native-camera

interface QRScannerScreenProps {
  route: {
    params: {
      onScan: (data: string) => void;
    };
  };
  navigation: any;
}

const QRScannerScreen: React.FC<QRScannerScreenProps> = ({ route, navigation }) => {
  const { onScan } = route.params;

  // TODO: 实现真实的扫码功能
  // 这里使用模拟数据演示流程
  useEffect(() => {
    // 在实际应用中，这里会打开摄像头进行扫码
    // 现在使用模拟数据
    const simulateScan = () => {
      setTimeout(() => {
        // 模拟扫描结果（电脑端生成的二维码格式）
        const mockData = 'http://192.168.1.100:3000?pin=123456';
        onScan(mockData);
        navigation.goBack();
      }, 2000);
    };

    simulateScan();
  }, [onScan, navigation]);

  const handleManualInput = () => {
    // TODO: 打开手动输入对话框
    Alert.alert('提示', '手动输入 IP 功能开发中...');
  };

  return (
    <View style={styles.container}>
      <View style={styles.scannerArea}>
        {/* TODO: 替换为真实的相机预览组件 */}
        <View style={styles.placeholder}>
          <Text variant="headlineMedium">📷</Text>
          <Text variant="bodyLarge" style={styles.placeholderText}>
            摄像头预览区域
          </Text>
          <Text variant="bodySmall" style={styles.hint}>
            将二维码放入框内即可自动扫描
          </Text>
        </View>
        
        {/* 扫描框 */}
        <View style={styles.scanFrame}>
          <View style={styles.cornerTopLeft} />
          <View style={styles.cornerTopRight} />
          <View style={styles.cornerBottomLeft} />
          <View style={styles.cornerBottomRight} />
        </View>
      </View>
      
      <View style={styles.controls}>
        <Button
          mode="contained"
          onPress={handleManualInput}
          style={styles.button}
        >
          手动输入 IP
        </Button>
        
        <Button
          mode="text"
          onPress={() => navigation.goBack()}
          style={styles.button}
        >
          取消
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scannerArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  placeholderText: {
    color: '#fff',
    marginTop: 16,
  },
  hint: {
    color: '#aaa',
    marginTop: 8,
  },
  scanFrame: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cornerTopLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 30,
    height: 30,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#6366f1',
  },
  cornerTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 30,
    height: 30,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: '#6366f1',
  },
  cornerBottomLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 30,
    height: 30,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#6366f1',
  },
  cornerBottomRight: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: '#6366f1',
  },
  controls: {
    padding: 24,
    paddingBottom: 40,
  },
  button: {
    marginVertical: 8,
  },
});

export default QRScannerScreen;
