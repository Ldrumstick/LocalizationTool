import { CSVFileData } from '../types';
import { useProjectStore } from '../stores/project-store';
import Papa from 'papaparse';

/**
 * 文件管理服务
 * 封装与 Electron 主进程的 IPC 通信
 */
export const fileService = {
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
      const csvContent = Papa.unparse(data, {
        quotes: true, // 确保特殊字符被引用
        quoteChar: '"',
      });

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
