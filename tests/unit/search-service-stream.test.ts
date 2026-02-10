import { searchService } from '../../src/services/search-service';
import { ProjectData } from '../../src/types';

function createProjectData(): ProjectData {
  return {
    projectPath: 'G:/demo',
    files: {},
    ignoredFileIds: [],
    groups: {}
  };
}

type Handler = (payload: any) => void;

describe('search-service stream', () => {
  const projectData = createProjectData();

  test('receives chunk and done callbacks', () => {
    const chunkListeners: Handler[] = [];
    const doneListeners: Handler[] = [];
    const startCalls: any[] = [];

    (window as any).electronAPI = {
      onSearchProjectChunk: (cb: Handler) => {
        chunkListeners.push(cb);
        return () => {
          const idx = chunkListeners.indexOf(cb);
          if (idx >= 0) chunkListeners.splice(idx, 1);
        };
      },
      onSearchProjectDone: (cb: Handler) => {
        doneListeners.push(cb);
        return () => {
          const idx = doneListeners.indexOf(cb);
          if (idx >= 0) doneListeners.splice(idx, 1);
        };
      },
      searchProjectStreamStart: (payload: any) => {
        startCalls.push(payload);
      },
      searchProjectStreamCancel: jest.fn()
    };

    const chunks: any[] = [];
    const donePayloads: any[] = [];

    searchService.streamSearchInProject(
      projectData,
      'a',
      { isRegExp: false, isGlobalSearch: true },
      {
        onChunk: (chunk) => chunks.push(...chunk),
        onDone: (payload) => donePayloads.push(payload)
      }
    );

    expect(startCalls).toHaveLength(1);
    const requestId = startCalls[0].requestId;
    expect(typeof requestId).toBe('string');

    chunkListeners.forEach((cb) => cb({ requestId, chunk: [{ fileId: 'f1', rowIndex: 0, colIndex: 0, key: 'K', context: 'x' }] }));
    doneListeners.forEach((cb) => cb({ requestId, hasMore: true, cancelled: false }));

    expect(chunks).toHaveLength(1);
    expect(donePayloads).toEqual([{ hasMore: true, cancelled: false, error: undefined }]);
  });

  test('cancel stops stream via electron api', () => {
    const cancelSpy = jest.fn();
    let offChunkCalled = false;
    let offDoneCalled = false;
    let requestId = '';

    (window as any).electronAPI = {
      onSearchProjectChunk: () => () => { offChunkCalled = true; },
      onSearchProjectDone: () => () => { offDoneCalled = true; },
      searchProjectStreamStart: (payload: any) => { requestId = payload.requestId; },
      searchProjectStreamCancel: cancelSpy
    };

    const cancel = searchService.streamSearchInProject(
      projectData,
      'a',
      { isRegExp: false, isGlobalSearch: true },
      {
        onChunk: () => {},
        onDone: () => {}
      }
    );

    cancel();

    expect(offChunkCalled).toBe(true);
    expect(offDoneCalled).toBe(true);
    expect(cancelSpy).toHaveBeenCalledWith(requestId);
  });
});
