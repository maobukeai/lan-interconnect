/**
 * 文件列表组件
 * 支持文件浏览、上传、下载
 */
import React, { useState } from 'react';
import { View, FlatList, StyleSheet, Alert } from 'react-native';
import {
  Text,
  Card,
  IconButton,
  ActivityIndicator,
  Chip,
  Divider,
  Snackbar,
} from 'react-native-paper';
import { FileInfo } from '../../api/endpoints';
import { formatFileSize, formatDate } from '../../utils/format';

interface FileListProps {
  files: FileInfo[];
  currentPath: string;
  loading?: boolean;
  onFilePress?: (file: FileInfo) => void;
  onNavigateUp?: () => void;
  onRefresh?: () => void;
}

const FileList: React.FC<FileListProps> = ({
  files,
  currentPath,
  loading = false,
  onFilePress,
  onNavigateUp,
  onRefresh,
}) => {
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  // 分离文件夹和文件
  const folders = files.filter(f => f.isDirectory);
  const fileList = files.filter(f => !f.isDirectory);

  // 排序：文件夹优先，然后按名称字母排序
  const sortedFolders = folders.sort((a, b) => 
    a.name.localeCompare(b.name)
  );
  const sortedFiles = fileList.sort((a, b) => 
    a.name.localeCompare(b.name)
  );

  /**
   * 渲染文件夹项
   */
  const renderFolder = ({ item }: { item: FileInfo }) => (
    <Card
      style={styles.folderCard}
      onPress={() => onFilePress?.(item)}
      elevation={1}
    >
      <Card.Content style={styles.cardContent}>
        <IconButton
          icon="folder"
          size={40}
          iconColor="#fbbf24"
          style={styles.folderIcon}
        />
        <View style={styles.fileInfo}>
          <Text variant="bodyLarge" numberOfLines={1} style={styles.fileName}>
            {item.name}
          </Text>
          <Text variant="bodySmall" style={styles.fileMeta}>
            文件夹 • {formatDate(item.mtime)}
          </Text>
        </View>
        <IconButton icon="chevron-right" />
      </Card.Content>
    </Card>
  );

  /**
   * 渲染文件项
   */
  const renderFile = ({ item }: { item: FileInfo }) => {
    const fileIcon = getFileIcon(item.name);
    
    return (
      <Card
        style={styles.fileCard}
        onPress={() => onFilePress?.(item)}
        elevation={1}
      >
        <Card.Content style={styles.cardContent}>
          <IconButton
            icon={fileIcon}
            size={36}
            iconColor="#6366f1"
            style={styles.fileIcon}
          />
          <View style={styles.fileInfo}>
            <Text variant="bodyLarge" numberOfLines={1} style={styles.fileName}>
              {item.name}
            </Text>
            <View style={styles.fileMetaRow}>
              <Text variant="bodySmall" style={styles.fileMeta}>
                {formatFileSize(item.size)}
              </Text>
              <Text variant="bodySmall" style={styles.fileMetaDot}>•</Text>
              <Text variant="bodySmall" style={styles.fileMeta}>
                {formatDate(item.mtime)}
              </Text>
            </View>
          </View>
          <View style={styles.fileActions}>
            <Chip mode="outlined" compact textStyle={{ fontSize: 10 }}>
              {getFileExtension(item.name)}
            </Chip>
          </View>
        </Card.Content>
      </Card>
    );
  };

  /**
   * 空状态
   */
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <IconButton icon="folder-open" size={64} iconColor="#ccc" />
      <Text variant="bodyLarge" style={styles.emptyText}>
        此目录为空
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text variant="bodyMedium" style={styles.loadingText}>
          加载中...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 路径导航栏 */}
      <View style={styles.pathBar}>
        <IconButton
          icon="arrow-up"
          onPress={onNavigateUp}
          disabled={!currentPath || currentPath === 'C:\\'}
          size={20}
        />
        <Text variant="bodyMedium" numberOfLines={1} style={styles.pathText}>
          {currentPath || '根目录'}
        </Text>
        <IconButton icon="refresh" onPress={onRefresh} size={20} />
      </View>

      <Divider />

      {/* 文件列表 */}
      <FlatList
        data={[...sortedFolders, ...sortedFiles]}
        keyExtractor={(item) => item.path}
        renderItem={({ item, index }) =>
          item.isDirectory ? (
            renderFolder({ item })
          ) : (
            renderFile({ item })
          )
        }
        ListEmptyComponent={renderEmpty}
        ListHeaderComponent={
          files.length > 0 ? (
            <View style={styles.header}>
              <Text variant="bodySmall" style={styles.countText}>
                共 {files.length} 项 • {folders.length} 个文件夹 • {fileList.length} 个文件
              </Text>
            </View>
          ) : null
        }
      />

      {/* 提示框 */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={2000}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
};

/**
 * 根据文件扩展名返回图标
 */
function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  
  const iconMap: Record<string, string> = {
    // 图片
    jpg: 'image',
    jpeg: 'image',
    png: 'image',
    gif: 'image',
    bmp: 'image',
    webp: 'image',
    
    // 视频
    mp4: 'video',
    avi: 'video',
    mkv: 'video',
    mov: 'video',
    wmv: 'video',
    
    // 音频
    mp3: 'music-note',
    wav: 'music-note',
    flac: 'music-note',
    aac: 'music-note',
    
    // 文档
    pdf: 'file-pdf-box',
    doc: 'file-word',
    docx: 'file-word',
    xls: 'file-excel',
    xlsx: 'file-excel',
    ppt: 'file-powerpoint',
    pptx: 'file-powerpoint',
    
    // 压缩文件
    zip: 'zip-box',
    rar: 'zip-box',
    '7z': 'zip-box',
    tar: 'zip-box',
    gz: 'zip-box',
    
    // 代码/文本
    txt: 'file-document',
    md: 'file-document',
    js: 'language-javascript',
    ts: 'language-typescript',
    py: 'language-python',
    java: 'language-java',
    cpp: 'language-cpp',
    c: 'language-c',
    html: 'language-html5',
    css: 'language-css3',
    
    // 可执行文件
    exe: 'application',
    apk: 'android',
    dmg: 'apple',
    
    // 默认
  };
  
  return iconMap[ext || ''] || 'file';
}

/**
 * 获取文件扩展名
 */
function getFileExtension(filename: string): string {
  const ext = filename.split('.').pop();
  return ext ? ext.toUpperCase() : 'FILE';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  pathBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#fff',
  },
  pathText: {
    flex: 1,
    color: '#333',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
  },
  countText: {
    color: '#64748b',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    color: '#999',
    marginTop: 8,
  },
  folderCard: {
    marginHorizontal: 8,
    marginVertical: 4,
    borderRadius: 12,
  },
  fileCard: {
    marginHorizontal: 8,
    marginVertical: 4,
    borderRadius: 12,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  folderIcon: {
    marginRight: 4,
  },
  fileIcon: {
    marginRight: 8,
  },
  fileInfo: {
    flex: 1,
    marginLeft: 8,
  },
  fileName: {
    fontWeight: '500',
    color: '#1e293b',
  },
  fileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  fileMeta: {
    color: '#64748b',
  },
  fileMetaDot: {
    color: '#cbd5e1',
    marginHorizontal: 4,
  },
  fileActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export default FileList;
