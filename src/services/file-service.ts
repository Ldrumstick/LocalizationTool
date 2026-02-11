import { CSVFileData } from '../types';
import { useProjectStore } from '../stores/project-store';
import Papa from 'papaparse';
import { configService } from './config-service';

/**
 * 文件管理服务
 * 封装与 Electron 主进程的 IPC 通信
 */
export const fileService = {
  normalizeConfigIds(
    files: any[],
    config: { ignoredFileIds?: string[]; groups?: Record<string, any> }
  ): { ignoredFileIds: string[]; groups: Record<string, any> } {
    const filePathToNewId = new Map<string, string>();
    const fileNameToIds = new Map<string, string[]>();

    files.forEach((file) => {
      filePathToNewId.set(file.filePath, file.id);
      if (!fileNameToIds.has(file.fileName)) fileNameToIds.set(file.fileName, []);
      fileNameToIds.get(file.fileName)!.push(file.id);
    });

    const resolveId = (rawId: string): string | null => {
      if (!rawId) return null;
      if (filePathToNewId.has(rawId)) return filePathToNewId.get(rawId)!;
      if (Object.values(files).some((f: any) => f.id === rawId)) return rawId;

      try {
        const decoded = Buffer.from(rawId, 'base64').toString();
        // 兼容旧配置：ID=绝对路径 base64
        if (filePathToNewId.has(decoded)) {
          return filePathToNewId.get(decoded)!;
        }
        // 兼容新配置：ID=相对路径 base64
        const normalizedDecoded = decoded.replace(/\\/g, '/');
        const matched = files.find((f: any) => {
          const rel = f.relativePath ? String(f.relativePath).replace(/\\/g, '/') : '';
          return rel === normalizedDecoded;
        });
        if (matched) return matched.id;

        // 兜底：按文件名匹配（仅当唯一）
        const fileName = normalizedDecoded.split('/').pop() || '';
        const ids = fileNameToIds.get(fileName) || [];
        if (ids.length === 1) return ids[0];
      } catch (e) {
        // ignore malformed base64
      }
      return null;
    };

    const ignoredSet = new Set<string>();
    (config.ignoredFileIds || []).forEach((id) => {
      const resolved = resolveId(id);
      if (resolved) ignoredSet.add(resolved);
    });

    const groups: Record<string, any> = {};
    Object.entries(config.groups || {}).forEach(([groupId, group]) => {
      const normalizedFileIds = Array.from(new Set((group.fileIds || [])
        .map((id: string) => resolveId(id))
        .filter(Boolean))) as string[];
      groups[groupId] = {
        ...group,
        fileIds: normalizedFileIds,
      };
    });

    return {
      ignoredFileIds: Array.from(ignoredSet),
      groups,
    };
  },

  /**
   * 打开项目文件夹并获取 CSV 文件列表
   */
  async openProject(): Promise<void> {
    const projectStore = useProjectStore.getState();
    
    try {
      const result = await window.electronAPI.openProject('');
      
      if (result) {
        const { projectPath, files } = result;
        
        // 将文件数组转换为 Record 结构
        const filesMap: Record<string, CSVFileData> = {};
        files.forEach((file: any) => {
          filesMap[file.id] = {
            ...file,
            encoding: 'UTF-8', // 初始默认
            headers: [],
            rows: [],
            isDirty: false,
            isIgnored: false,
          };
        });

        projectStore.setProjectPath(projectPath);
        
        // 1. Load Config first (Groups & Ignored Files)
        const config = await configService.loadConfig(projectPath);
        const normalizedConfig = this.normalizeConfigIds(files, config);
        projectStore.setIgnoredFileIds(normalizedConfig.ignoredFileIds);
        projectStore.setGroups(normalizedConfig.groups);

        // 2. Set Files (will use ignoredFileIds to set isIgnored flag)
        projectStore.setFiles(filesMap);

        // 异步构建 Key Index
        window.electronAPI.buildProjectIndex(projectPath)
          .then(index => {
            projectStore.setKeyIndex(index);
          })
          .catch(err => {
            console.error('索引构建失败:', err);
          });
      }
    } catch (error) {
      console.error('打开项目失败:', error);
      throw error;
    }
  },

  /**
   * 读取单个文件内容
   */
  async readFile(fileId: string): Promise<void> {
    const projectStore = useProjectStore.getState();
    const file = projectStore.files[fileId];

    if (!file) return;

    try {
      const result = await window.electronAPI.readFile(file.filePath);
      
      if (result) {
        projectStore.updateFile(fileId, {
          encoding: result.encoding,
          headers: result.headers,
          rows: result.rows,
          isDirty: false,
        });
      }
    } catch (error) {
      console.error(`读取文件失败: ${file.fileName}`, error);
      throw error;
    }
  },

  /**
   * 保存单个文件
   */
  async saveFile(fileId: string): Promise<void> {
    const projectStore = useProjectStore.getState();
    const file = projectStore.files[fileId];

    if (!file || !file.rows) return;

    try {
      // 构造 CSV 数据 (Header + Rows)
      const data = [file.headers, ...file.rows.map(row => row.cells)];
      
      // 生成 CSV 字符串
      let csvContent = Papa.unparse(data, {
        quotes: false, // 仅在必要时添加引号 (Smart Quoting)
        quoteChar: '"',
        newline: '\r\n', // RFC 4180 style record separator
      });

      // Ensure a trailing line break so external append tools start on a new record.
      if (csvContent.length > 0 && !csvContent.endsWith('\r\n')) {
        csvContent += '\r\n';
      }

      // 调用 Electron 保存
      const result = await window.electronAPI.saveFile({
        filePath: file.filePath,
        content: csvContent,
        encoding: file.encoding || 'UTF-8',
      });

      if (result.success) {
        // 更新 dirty 状态
        projectStore.updateFile(fileId, {
          isDirty: false,
          lastModified: result.lastModified
        });
        console.log(`文件已保存: ${file.fileName}`);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error(`保存文件失败: ${file.fileName}`, error);
      throw error;
    }
  },

  /**
   * 保存所有已修改的文件
   */
  async saveAllDirtyFiles(): Promise<void> {
    const projectStore = useProjectStore.getState();
    const dirtyFiles = Object.values(projectStore.files).filter(f => f.isDirty);
    
    if (dirtyFiles.length === 0) return;

    await Promise.all(dirtyFiles.map(file => this.saveFile(file.id)));
  }
};
