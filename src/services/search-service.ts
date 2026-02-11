import { ProjectData, SearchResponse, SearchResult } from '../types';

/**
 * 搜索服务 - 渲染进程代理层
 * 实际搜索逻辑运行在 Electron 主进程
 */
export const searchService = {
  streamSearchInProject(
    projectData: ProjectData,
    query: string,
    options: { isRegExp: boolean; isCaseSensitive?: boolean; isGlobalSearch: boolean; selectedFileId?: string; maxResults?: number; extraIgnoredFileIds?: string[] },
    handlers: {
      onChunk: (chunk: SearchResult[]) => void;
      onDone: (payload: { hasMore: boolean; cancelled: boolean; error?: string }) => void;
    }
  ): () => void {
    if (!query) {
      handlers.onDone({ hasMore: false, cancelled: false });
      return () => {};
    }

    const requestId = `search-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const removeChunkListener = window.electronAPI.onSearchProjectChunk((payload: any) => {
      if (!payload || payload.requestId !== requestId) return;
      const chunk = Array.isArray(payload.chunk) ? payload.chunk : [];
      if (chunk.length > 0) {
        handlers.onChunk(chunk);
      }
    });

    const cleanup = () => {
      removeChunkListener();
      removeDoneListener();
    };

    const removeDoneListener = window.electronAPI.onSearchProjectDone((payload: any) => {
      if (!payload || payload.requestId !== requestId) return;
      cleanup();
      handlers.onDone({
        hasMore: Boolean(payload.hasMore),
        cancelled: Boolean(payload.cancelled),
        error: payload.error
      });
    });

    const mergedIgnored = new Set([...(projectData.ignoredFileIds || []), ...(options.extraIgnoredFileIds || [])]);

    window.electronAPI.searchProjectStreamStart({
      requestId,
      projectPath: projectData.projectPath,
      query,
      isRegExp: options.isRegExp,
      isCaseSensitive: options.isCaseSensitive,
      isGlobalSearch: options.isGlobalSearch,
      selectedFileId: options.selectedFileId,
      maxResults: options.maxResults,
      ignoredFileIds: Array.from(mergedIgnored)
    });

    return () => {
      cleanup();
      window.electronAPI.searchProjectStreamCancel(requestId);
    };
  },

  /**
   * 在当前项目中搜索关键词（异步）
   */
  async searchInProject(
    projectData: ProjectData,
    query: string,
    options: { isRegExp: boolean; isCaseSensitive?: boolean; isGlobalSearch: boolean; selectedFileId?: string; maxResults?: number }
  ): Promise<SearchResponse> {
    if (!query) return { results: [], hasMore: false };

    try {
      const response = await window.electronAPI.searchProject({
        projectPath: projectData.projectPath,
        query,
        isRegExp: options.isRegExp,
        isCaseSensitive: options.isCaseSensitive,
        isGlobalSearch: options.isGlobalSearch,
        selectedFileId: options.selectedFileId,
        maxResults: options.maxResults,
        ignoredFileIds: projectData.ignoredFileIds || []
      });

      // 兼容旧版主进程返回格式
      if (Array.isArray(response)) {
        return { results: response as SearchResult[], hasMore: false };
      }

      return {
        results: response?.results || [],
        hasMore: Boolean(response?.hasMore)
      };
    } catch (error) {
      console.error('搜索服务调用失败:', error);
      return { results: [], hasMore: false };
    }
  },

  /**
   * 执行单条文本替换
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
