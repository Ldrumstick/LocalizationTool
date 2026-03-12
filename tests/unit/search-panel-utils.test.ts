import {
  buildSearchDataDependencyKey,
  buildLocalSearchResults,
  buildVirtualSearchRows,
  captureSearchListViewport,
  getSearchResultColumnLabel,
  getSearchResultDisplayRowNumber,
  getSearchResultKey,
  groupSearchResults,
  resolveSearchListViewport
} from '../../src/components/FunctionPanel/search-panel-utils';
import { CSVFileData, SearchResult } from '../../src/types';

function createResult(fileId: string, rowIndex: number, colIndex: number, key = 'KEY'): SearchResult {
  return {
    fileId,
    rowIndex,
    colIndex,
    key,
    context: `${fileId}-${rowIndex}-${colIndex}`
  };
}

function createFile(id: string, rows: CSVFileData['rows']): CSVFileData {
  return {
    id,
    fileName: `${id}.csv`,
    filePath: `G:/${id}.csv`,
    encoding: 'UTF-8',
    headers: ['id', 'value'],
    rows,
    isDirty: false,
    isIgnored: false,
    lastModified: 1
  };
}

describe('search-panel-utils', () => {
  test('为命中项生成稳定的虚拟列表 key', () => {
    const results = [
      createResult('file-a', 3, 1, 'A'),
      createResult('file-a', 8, 2, 'B')
    ];

    const rows = buildVirtualSearchRows(groupSearchResults(results), new Set());

    expect(getSearchResultKey(results[0])).toBe('file-a:3:1');
    expect(rows.map((row) => row.key)).toEqual([
      'g-file-a',
      'm-file-a:3:1',
      'm-file-a:8:2'
    ]);
  });

  test('返回搜索结果展示用的行号与列标签', () => {
    const result = createResult('file-a', 3, 1, 'A');

    expect(getSearchResultDisplayRowNumber(result)).toBe(4);
    expect(getSearchResultColumnLabel(['Key', 'English'], 1)).toBe('English');
    expect(getSearchResultColumnLabel(['Key', ''], 3)).toBe('列 4');
  });

  test('本地搜索可使用编辑中的临时值覆盖当前单元格', () => {
    const file = createFile('file-a', [{ rowIndex: 0, cells: ['A', 'Alpha'], key: 'A' }]);

    const results = buildLocalSearchResults([file], 'beta', {
      isRegExp: false,
      isCaseSensitive: false
    }, {
      fileId: 'file-a',
      rowIndex: 0,
      colIndex: 1,
      value: 'Beta'
    });

    expect(results).toEqual([
      expect.objectContaining({
        fileId: 'file-a',
        rowIndex: 0,
        colIndex: 1,
        context: 'Beta'
      })
    ]);
  });

  test('保存引起的元数据变化不应改变搜索数据依赖 key', () => {
    const rows = [{ rowIndex: 0, cells: ['A', 'Alpha'], key: 'A' }];
    const originalFile = createFile('file-a', rows);
    const savedFile = {
      ...originalFile,
      isDirty: true,
      lastModified: 999
    };

    const beforeSave = buildSearchDataDependencyKey({ 'file-a': originalFile }, {
      isGlobalSearch: false,
      selectedFileId: 'file-a'
    });
    const afterSave = buildSearchDataDependencyKey({ 'file-a': savedFile }, {
      isGlobalSearch: false,
      selectedFileId: 'file-a'
    });

    expect(afterSave).toBe(beforeSave);
  });

  test('文本内容变更时应改变搜索数据依赖 key', () => {
    const originalRows = [{ rowIndex: 0, cells: ['A', 'Alpha'], key: 'A' }];
    const updatedRows = [{ rowIndex: 0, cells: ['A', 'Beta'], key: 'A' }];
    const beforeEdit = buildSearchDataDependencyKey({ 'file-a': createFile('file-a', originalRows) }, {
      isGlobalSearch: false,
      selectedFileId: 'file-a'
    });
    const afterEdit = buildSearchDataDependencyKey({ 'file-a': createFile('file-a', updatedRows) }, {
      isGlobalSearch: false,
      selectedFileId: 'file-a'
    });

    expect(afterEdit).not.toBe(beforeEdit);
  });

  test('结果刷新后可按锚点恢复滚动位置', () => {
    const initialRows = buildVirtualSearchRows(groupSearchResults([
      createResult('file-a', 1, 0),
      createResult('file-a', 2, 0),
      createResult('file-b', 4, 0)
    ]), new Set());

    const snapshot = captureSearchListViewport(initialRows, 34 * 2 + 7, 34);
    expect(snapshot).toBeTruthy();

    const refreshedRows = buildVirtualSearchRows(groupSearchResults([
      createResult('file-0', 0, 0),
      createResult('file-a', 1, 0),
      createResult('file-a', 2, 0),
      createResult('file-b', 4, 0)
    ]), new Set());

    const resolution = resolveSearchListViewport(refreshedRows, snapshot!, 34, 68);

    expect(resolution).toEqual({
      anchorFound: true,
      scrollOffset: 34 * 4 + 7
    });
  });

  test('锚点消失时回退到原滚动偏移', () => {
    const snapshot = {
      anchorKey: 'm-file-a:2:0',
      anchorOffset: 5,
      fallbackScrollOffset: 120
    };

    const refreshedRows = buildVirtualSearchRows(groupSearchResults([
      createResult('file-b', 0, 0),
      createResult('file-b', 1, 0),
      createResult('file-c', 2, 0),
      createResult('file-c', 3, 0)
    ]), new Set());

    const resolution = resolveSearchListViewport(refreshedRows, snapshot, 34, 34);

    expect(resolution).toEqual({
      anchorFound: false,
      scrollOffset: 120
    });
  });
});
