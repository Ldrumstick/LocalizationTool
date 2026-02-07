import { FileGroup } from '../types';

interface ProjectConfig {
  ignoredFileIds: string[];
  groups: Record<string, FileGroup>;
}

export const configService = {
  /**
   * 读取项目配置
   */
  async loadConfig(projectPath: string): Promise<ProjectConfig> {
    try {
      const config = await window.electronAPI.readConfig(projectPath);
      if (config) {
        return {
          ignoredFileIds: Array.isArray(config.ignoredFileIds) ? config.ignoredFileIds : [],
          groups: config.groups || {},
        };
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
    
    // Default config
    return {
      ignoredFileIds: [],
      groups: {},
    };
  },

  /**
   * 保存项目配置
   */
  async saveConfig(projectPath: string, config: ProjectConfig): Promise<void> {
    if (!projectPath) return;
    
    try {
      await window.electronAPI.saveConfig({
        projectPath,
        config
      });
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }
};
