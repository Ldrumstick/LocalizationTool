import { ProjectData, SearchResponse, SearchResult } from '../types';

/**
 * 鎼滅储鏈嶅姟 - 鍓嶇浠ｇ悊
 * 鎼滅储閫昏緫宸蹭笅娌夎嚦 Electron 涓昏繘绋?(Backend Search)
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
   * 鍦ㄩ」鐩腑鎼滅储鍏抽敭璇?(Async)
   * 璋冪敤 Electron 涓昏繘绋嬫墽琛屾悳绱紝浠ユ敮鎸佸叏椤圭洰鎵弿
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
        ignoredFileIds: projectData.ignoredFileIds || [] // Pass ignored files
      });

      // Backward compatible with older main-process return shape.
      if (Array.isArray(response)) {
        return { results: response as SearchResult[], hasMore: false };
      }

      return {
        results: response?.results || [],
        hasMore: Boolean(response?.hasMore)
      };
    } catch (error) {
      console.error('鎼滅储鏈嶅姟璋冪敤澶辫触:', error);
      return { results: [], hasMore: false };
    }
  },

  /**
   * 鎵ц鏇挎崲閫昏緫锛堝崟鏉★級
   * 绾枃鏈鐞嗭紝淇濇寔鍚屾浠ヤ究蹇€熷搷搴?UI
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

