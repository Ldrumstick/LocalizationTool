import { searchService } from '../../src/services/search-service';
import { ProjectData, SearchResult } from '../../src/types';

function createProjectData(): ProjectData {
  return {
    projectPath: 'G:/demo',
    files: {},
    ignoredFileIds: [],
    groups: {}
  };
}

describe('search-service', () => {
  const projectData = createProjectData();

  beforeEach(() => {
    (window as any).electronAPI = {
      searchProject: jest.fn()
    };
  });

  test('returns empty response for empty query without calling ipc', async () => {
    const response = await searchService.searchInProject(projectData, '', {
      isRegExp: false,
      isGlobalSearch: true
    });

    expect(response).toEqual({ results: [], hasMore: false });
    expect(window.electronAPI.searchProject).not.toHaveBeenCalled();
  });

  test('uses unlimited maxResults by default', async () => {
    window.electronAPI.searchProject = jest.fn().mockResolvedValue({ results: [], hasMore: false });

    await searchService.searchInProject(projectData, 'a', {
      isRegExp: false,
      isGlobalSearch: true
    });

    expect(window.electronAPI.searchProject).toHaveBeenCalledTimes(1);
    expect(window.electronAPI.searchProject).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'a',
        maxResults: undefined
      })
    );
  });

  test('normalizes legacy array response shape', async () => {
    const legacyResults: SearchResult[] = [
      { fileId: 'f1', rowIndex: 1, colIndex: 2, key: 'K', context: 'ctx' }
    ];
    window.electronAPI.searchProject = jest.fn().mockResolvedValue(legacyResults);

    const response = await searchService.searchInProject(projectData, 'a', {
      isRegExp: false,
      isGlobalSearch: true
    });

    expect(response).toEqual({ results: legacyResults, hasMore: false });
  });

  test('returns hasMore from object response', async () => {
    const payload = {
      results: [{ fileId: 'f1', rowIndex: 0, colIndex: 0, key: 'K', context: 'abc' }],
      hasMore: true
    };
    window.electronAPI.searchProject = jest.fn().mockResolvedValue(payload);

    const response = await searchService.searchInProject(projectData, 'a', {
      isRegExp: false,
      isGlobalSearch: true
    });

    expect(response).toEqual(payload);
  });

  test('returns empty response when ipc throws', async () => {
    window.electronAPI.searchProject = jest.fn().mockRejectedValue(new Error('boom'));

    const response = await searchService.searchInProject(projectData, 'a', {
      isRegExp: false,
      isGlobalSearch: true
    });

    expect(response).toEqual({ results: [], hasMore: false });
  });
});
