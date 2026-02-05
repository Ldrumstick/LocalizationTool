import { ProjectData, SearchResult } from '../types';

/**
 * 搜索服务 - 前端代理
 * 搜索逻辑已下沉至 Electron 主进程 (Backend Search)
 */
export const searchService = {
  /**
   * 在项目中搜索关键词 (Async)
   * 调用 Electron 主进程执行搜索，以支持全项目扫描
   */
  async searchInProject(
    projectData: ProjectData,
    query: string,
    options: { isRegExp: boolean; isCaseSensitive?: boolean; isGlobalSearch: boolean; selectedFileId?: string }
  ): Promise<SearchResult[]> {
    if (!query) return [];

    try {
      const results = await window.electronAPI.searchProject({
        projectPath: projectData.projectPath,
        query,
        isRegExp: options.isRegExp,
        isCaseSensitive: options.isCaseSensitive,
        isGlobalSearch: options.isGlobalSearch,
        selectedFileId: options.selectedFileId,
        ignoredFileIds: projectData.ignoredFileIds || [] // Pass ignored files
      });
      return results;
    } catch (error) {
      console.error('搜索服务调用失败:', error);
      return [];
    }
  },

  /**
   * 执行替换逻辑（单条）
   * 纯文本处理，保持同步以便快速响应 UI
   */
  replace(
    originalText: string,
    query: string,
    replacement: string,
    options: { isRegExp: boolean; isCaseSensitive?: boolean }
  ): string {
    try {
      const { isRegExp, isCaseSensitive = false } = options;
      const flags = isCaseSensitive ? 'g' : 'gi';
      const pattern = isRegExp ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(pattern, flags);
      
      return originalText.replace(regex, replacement);
    } catch (e) {
      return originalText;
    }
  }
};
