import React, { useState, useEffect, useMemo, useRef } from 'react';
import useMeasure from 'react-use-measure';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import { useProjectStore } from '../../stores/project-store';
import { useEditorStore } from '../../stores/editor-store';
import { searchService } from '../../services/search-service';
import { fileService } from '../../services/file-service';
import { validatorService } from '../../services/validator-service';
import { CSVFileData, SearchResult, ValidationError } from '../../types';
import { useDebounce } from '../../hooks/useDebounce';
import { hasModKey, isEditableTarget, registerShortcut, runShortcutRules, ShortcutPriority } from '../../services/shortcut-service';
import './FunctionPanel.css';

type GroupedSearchItem = {
  result: SearchResult;
  index: number;
};

type GroupedSearchResult = {
  fileId: string;
  items: GroupedSearchItem[];
};

type VirtualSearchRow =
  | { type: 'group'; key: string; fileId: string; count: number }
  | { type: 'match'; key: string; item: GroupedSearchItem };

const RESULT_ROW_HEIGHT = 34;
const VIRTUAL_PAGE_SIZE = 200;
const VIRTUAL_PAGE_CACHE_LIMIT = 24;

function buildLocalSearchResults(
  files: CSVFileData[],
  query: string,
  options: { isRegExp: boolean; isCaseSensitive: boolean }
): SearchResult[] {
  if (!query) return [];

  let regex: RegExp | null = null;
  let searchTerms: string[] = [];
  const flags = options.isCaseSensitive ? 'g' : 'gi';

  try {
    if (options.isRegExp) {
      regex = new RegExp(query, flags);
    } else {
      const trimmed = query.trim();
      if (trimmed.includes(' ')) {
        searchTerms = trimmed.split(/\s+/).filter((t) => t.length > 0);
      } else {
        const pattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = new RegExp(pattern, flags);
      }
    }
  } catch {
    return [];
  }

  const results: SearchResult[] = [];
  files.forEach((file) => {
    if (!file.rows || file.rows.length === 0) return;
    file.rows.forEach((row) => {
      row.cells.forEach((cell, colIndex) => {
        if (!cell) return;
        let isMatch = false;
        if (regex) {
          regex.lastIndex = 0;
          isMatch = regex.test(cell);
        } else if (searchTerms.length > 0) {
          const target = options.isCaseSensitive ? cell : cell.toLowerCase();
          isMatch = searchTerms.every((term) => {
            const t = options.isCaseSensitive ? term : term.toLowerCase();
            return target.includes(t);
          });
        }
        if (!isMatch) return;
        results.push({
          fileId: file.id,
          rowIndex: row.rowIndex,
          colIndex,
          key: row.key || '',
          context: cell.length > 50 ? `${cell.substring(0, 50)}...` : cell
        });
      });
    });
  });
  return results;
}

const FunctionPanel: React.FC = () => {
  const activeTab = useEditorStore((state) => state.activeTab);
  const setActiveTab = useEditorStore((state) => state.setActiveTab);

  const searchQuery = useEditorStore((state) => state.searchQuery);
  const setSearchQuery = useEditorStore((state) => state.setSearchQuery);
  const replaceQuery = useEditorStore((state) => state.replaceQuery);
  const setReplaceQuery = useEditorStore((state) => state.setReplaceQuery);

  const isRegExp = useEditorStore((state) => state.isRegExp);
  const toggleRegExp = useEditorStore((state) => state.toggleRegExp);
  const isCaseSensitive = useEditorStore((state) => state.isCaseSensitive);
  const toggleCaseSensitive = useEditorStore((state) => state.toggleCaseSensitive);
  const isGlobalSearch = useEditorStore((state) => state.isGlobalSearch);
  const toggleGlobalSearch = useEditorStore((state) => state.toggleGlobalSearch);

  const setSearchResults = useEditorStore((state) => state.setSearchResults);
  const appendSearchResults = useEditorStore((state) => state.appendSearchResults);
  const currentResultIndex = useEditorStore((state) => state.currentResultIndex);
  const setCurrentResultIndex = useEditorStore((state) => state.setCurrentResultIndex);
  const setCurrentSearchResult = useEditorStore((state) => state.setCurrentSearchResult);

  const setSelectedFile = useEditorStore((state) => state.setSelectedFile);
  const setSelectedCell = useEditorStore((state) => state.setSelectedCell);
  const selectedFileId = useEditorStore((state) => state.selectedFileId);

  const projectData = useProjectStore();

  const [isSearching, setIsSearching] = useState(false);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const [resultsContainerRef, { height: resultsListHeight, width: resultsListWidth }] = useMeasure();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const latestSearchTokenRef = useRef(0);
  const cancelSearchStreamRef = useRef<(() => void) | null>(null);
  const virtualRowPageCacheRef = useRef<Map<number, VirtualSearchRow[]>>(new Map());

  const allSearchResultsRef = useRef<SearchResult[]>([]);
  const [searchResultCount, setSearchResultCount] = useState(0);
  const [searchResultVersion, setSearchResultVersion] = useState(0);

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const syncHighlightsForFile = (fileId?: string) => {
    if (!fileId) {
      setSearchResults([]);
      return;
    }
    const matches = allSearchResultsRef.current.filter((r) => r.fileId === fileId);
    setSearchResults(matches);
  };

  const resetAllSearchResults = () => {
    allSearchResultsRef.current = [];
    setSearchResultCount(0);
    setSearchResultVersion((v) => v + 1);
    setSearchResults([]);
    setCurrentSearchResult(undefined);
  };

  const groupedResults = useMemo<GroupedSearchResult[]>(() => {
    const groupsMap = new Map<string, GroupedSearchResult>();
    allSearchResultsRef.current.forEach((res, idx) => {
      const existing = groupsMap.get(res.fileId);
      if (existing) {
        existing.items.push({ result: res, index: idx });
      } else {
        groupsMap.set(res.fileId, { fileId: res.fileId, items: [{ result: res, index: idx }] });
      }
    });
    return Array.from(groupsMap.values());
  }, [searchResultVersion]);

  const virtualRows = useMemo<VirtualSearchRow[]>(() => {
    const rows: VirtualSearchRow[] = [];
    groupedResults.forEach((group) => {
      rows.push({ type: 'group', key: `g-${group.fileId}`, fileId: group.fileId, count: group.items.length });
      if (!collapsedFiles.has(group.fileId)) {
        group.items.forEach((item) => {
          rows.push({ type: 'match', key: `m-${group.fileId}-${item.index}`, item });
        });
      }
    });
    return rows;
  }, [groupedResults, collapsedFiles]);

  useEffect(() => {
    if (debouncedSearchQuery) {
      handleSearch();
    } else {
      cancelSearchStreamRef.current?.();
      cancelSearchStreamRef.current = null;
      resetAllSearchResults();
      setSearchHasMore(false);
      setIsSearching(false);
    }
  }, [debouncedSearchQuery, isRegExp, isCaseSensitive, isGlobalSearch, selectedFileId, projectData.files, projectData.ignoredFileIds]);

  useEffect(() => {
    syncHighlightsForFile(selectedFileId);
  }, [selectedFileId, searchResultVersion]);

  const toggleFileCollapse = (fileId: string) => {
    const newSet = new Set(collapsedFiles);
    if (newSet.has(fileId)) newSet.delete(fileId);
    else newSet.add(fileId);
    setCollapsedFiles(newSet);
  };

  const handleJump = async (fileId: string, rowIndex: number, colIndex: number, desiredIndex?: number) => {
    const file = projectData.files[fileId];
    if (file && (!file.rows || file.rows.length === 0)) {
      try {
        await fileService.readFile(fileId);
      } catch (e) {
        console.error('自动加载文件失败', e);
      }
    }

    const currentSelectedFileId = useEditorStore.getState().selectedFileId;
    if (currentSelectedFileId !== fileId) {
      setSelectedFile(fileId);
      syncHighlightsForFile(fileId);
    }

    let targetIndex = desiredIndex;
    if (targetIndex === undefined) {
      targetIndex = allSearchResultsRef.current.findIndex(
        (r) => r.fileId === fileId && r.rowIndex === rowIndex && r.colIndex === colIndex
      );
      if (targetIndex < 0) targetIndex = undefined;
    }

    if (targetIndex !== undefined) {
      setCurrentResultIndex(targetIndex);
      setCurrentSearchResult(allSearchResultsRef.current[targetIndex]);
    }

    setSelectedCell(rowIndex, colIndex);
  };

  const handleSearch = () => {
    if (!searchQuery) return;

    const requestToken = ++latestSearchTokenRef.current;
    cancelSearchStreamRef.current?.();
    cancelSearchStreamRef.current = null;

    setIsSearching(true);
    setSearchHasMore(false);
    resetAllSearchResults();

    const dirtyLoadedFiles = Object.values(projectData.files).filter((file) => {
      if (!file.isDirty || !file.rows || file.rows.length === 0) return false;
      if (isGlobalSearch) return true;
      return Boolean(selectedFileId && file.id === selectedFileId);
    });
    const dirtyFileIds = dirtyLoadedFiles.map((f) => f.id);

    if (dirtyLoadedFiles.length > 0) {
      const localResults = buildLocalSearchResults(dirtyLoadedFiles, searchQuery, {
        isRegExp,
        isCaseSensitive: Boolean(isCaseSensitive)
      });
      allSearchResultsRef.current.push(...localResults);
      setSearchResultCount(localResults.length);
      setSearchResultVersion((v) => v + 1);
      const currentFileId = useEditorStore.getState().selectedFileId;
      if (currentFileId) {
        const localHighlights = localResults.filter((r) => r.fileId === currentFileId);
        if (localHighlights.length > 0) {
          appendSearchResults(localHighlights);
        }
      }
    }

    const shouldStreamBackend = isGlobalSearch || !selectedFileId || !dirtyFileIds.includes(selectedFileId);
    if (!shouldStreamBackend) {
      setIsSearching(false);
      setSearchHasMore(false);
      return;
    }

    cancelSearchStreamRef.current = searchService.streamSearchInProject(
      projectData,
      searchQuery,
      {
        isRegExp,
        isCaseSensitive,
        isGlobalSearch,
        selectedFileId,
        maxResults: undefined,
        extraIgnoredFileIds: dirtyFileIds
      },
      {
        onChunk: (chunk) => {
          if (requestToken !== latestSearchTokenRef.current) return;
          if (chunk.length === 0) return;

          allSearchResultsRef.current.push(...chunk);
          setSearchResultCount(allSearchResultsRef.current.length);
          setSearchResultVersion((v) => v + 1);

          const currentFileId = useEditorStore.getState().selectedFileId;
          if (currentFileId) {
            const fileChunk = chunk.filter((item) => item.fileId === currentFileId);
            if (fileChunk.length > 0) {
              appendSearchResults(fileChunk);
            }
          }
        },
        onDone: ({ hasMore }) => {
          if (requestToken !== latestSearchTokenRef.current) return;
          setSearchHasMore(hasMore);
          setIsSearching(false);
          cancelSearchStreamRef.current = null;
        }
      }
    );
  };

  const mutateSearchResults = (updater: (items: SearchResult[]) => SearchResult[]) => {
    const next = updater(allSearchResultsRef.current);
    allSearchResultsRef.current = next;
    setSearchResultCount(next.length);
    setSearchResultVersion((v) => v + 1);

    const state = useEditorStore.getState();
    syncHighlightsForFile(state.selectedFileId);

    if (state.currentResultIndex >= next.length) {
      const nextIndex = next.length > 0 ? next.length - 1 : -1;
      setCurrentResultIndex(nextIndex);
      setCurrentSearchResult(nextIndex >= 0 ? next[nextIndex] : undefined);
    }
  };

  const handleReplaceSingle = (result: SearchResult) => {
    const file = projectData.files[result.fileId];
    if (!file) return;

    const originalText = file.rows[result.rowIndex].cells[result.colIndex];
    const newText = searchService.replace(originalText, searchQuery, replaceQuery, {
      isRegExp,
      isCaseSensitive
    });

    projectData.updateCell(result.fileId, result.rowIndex, result.colIndex, newText);
    mutateSearchResults((items) => items.filter((r) => r !== result));
  };

  const handleReplaceAll = () => {
    if (allSearchResultsRef.current.length === 0) return;

    const fileGroups: Record<string, SearchResult[]> = {};
    allSearchResultsRef.current.forEach((res) => {
      if (!fileGroups[res.fileId]) fileGroups[res.fileId] = [];
      fileGroups[res.fileId].push(res);
    });

    Object.entries(fileGroups).forEach(([fileId, results]) => {
      const file = projectData.files[fileId];
      if (!file) return;

      const updates: { row: number; col: number; value: string }[] = [];
      results.forEach((res) => {
        const originalText = file.rows[res.rowIndex].cells[res.colIndex];
        const newText = searchService.replace(originalText, searchQuery, replaceQuery, {
          isRegExp,
          isCaseSensitive
        });
        updates.push({ row: res.rowIndex, col: res.colIndex, value: newText });
      });

      if (updates.length > 0) {
        projectData.batchUpdateCells(fileId, updates, `批量替换 ${updates.length} 处`);
      }
    });

    handleSearch();
  };

  const handleDismiss = (result: SearchResult) => {
    mutateSearchResults((items) => items.filter((r) => r !== result));
  };

  const handleErrorClick = async (error: ValidationError) => {
    await handleJump(error.fileId, error.rowIndex, error.colIndex);
  };

  const focusSearchInput = () => {
    setActiveTab('search');
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  };

  const focusReplaceInput = () => {
    setActiveTab('search');
    requestAnimationFrame(() => {
      replaceInputRef.current?.focus();
      replaceInputRef.current?.select();
    });
  };

  const jumpSearchResult = (direction: 1 | -1) => {
    const allResults = allSearchResultsRef.current;
    if (allResults.length === 0) return;

    const base = currentResultIndex >= 0 ? currentResultIndex : 0;
    const nextIndex = (base + direction + allResults.length) % allResults.length;
    const target = allResults[nextIndex];
    if (!target) return;

    setCurrentResultIndex(nextIndex);
    setCurrentSearchResult(target);
    void handleJump(target.fileId, target.rowIndex, target.colIndex, nextIndex);
  };

  useEffect(() => {
    const handleShortcutFocusSearch = () => focusSearchInput();
    const handleShortcutFocusReplace = () => focusReplaceInput();

    window.addEventListener('shortcut:focus-search', handleShortcutFocusSearch as EventListener);
    window.addEventListener('shortcut:focus-replace', handleShortcutFocusReplace as EventListener);
    return () => {
      window.removeEventListener('shortcut:focus-search', handleShortcutFocusSearch as EventListener);
      window.removeEventListener('shortcut:focus-replace', handleShortcutFocusReplace as EventListener);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (runShortcutRules(e, [
        {
          match: (ev) => ev.key === 'F3',
          run: (ev) => {
            ev.preventDefault();
            jumpSearchResult(ev.shiftKey ? -1 : 1);
          }
        },
        {
          match: (ev) => hasModKey(ev) && ev.altKey && ev.key === 'Enter',
          run: (ev) => {
            ev.preventDefault();
            setActiveTab('search');
            handleReplaceAll();
          }
        }
      ])) return true;

      if (isEditableTarget(e.target)) return false;

      return runShortcutRules(e, [
        {
          match: (ev) => !hasModKey(ev) && ev.altKey && ev.key.toLowerCase() === 'c',
          run: (ev) => {
            ev.preventDefault();
            setActiveTab('search');
            toggleCaseSensitive();
          }
        },
        {
          match: (ev) => !hasModKey(ev) && ev.altKey && ev.key.toLowerCase() === 'r',
          run: (ev) => {
            ev.preventDefault();
            setActiveTab('search');
            toggleRegExp();
          }
        }
      ]);
    };

    return registerShortcut(handleKeyDown, { priority: ShortcutPriority.panel });
  }, [currentResultIndex, searchResultCount, setActiveTab, toggleCaseSensitive, toggleRegExp]);

  useEffect(() => {
    if (Object.keys(projectData.files).length > 0 || projectData.keyIndex) {
      const errors = validatorService.validateProject(projectData);
      setValidationErrors(errors);
    }
  }, [projectData.files, projectData.keyIndex, projectData.ignoredFileIds]);

  useEffect(() => {
    return () => {
      cancelSearchStreamRef.current?.();
      cancelSearchStreamRef.current = null;
    };
  }, []);

  const renderMatchContent = (context: string) => {
    if (!searchQuery) return <span className="match-context" title={context}>{context}</span>;

    const PADDING = 20;
    let matchIndex = -1;
    let matchLength = 0;
    let regex: RegExp | null = null;

    try {
      let pattern = searchQuery;
      const flags = isCaseSensitive ? '' : 'i';

      if (isRegExp) {
        regex = new RegExp(pattern, flags);
      } else {
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = new RegExp(escaped, flags);

        if (!regex.test(context) && pattern.includes(' ')) {
          const fuzzyPattern = pattern.split(' ').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
          regex = new RegExp(fuzzyPattern, flags);
        }
      }

      if (regex) {
        const match = regex.exec(context);
        if (match) {
          matchIndex = match.index;
          matchLength = match[0].length;
        }
      }
    } catch {
      matchIndex = -1;
    }

    if (matchIndex === -1) {
      const idx = context.toLowerCase().indexOf(searchQuery.toLowerCase());
      if (idx !== -1) {
        matchIndex = idx;
        matchLength = searchQuery.length;
      } else {
        return <span className="match-context" title={context}>{context}</span>;
      }
    }

    const start = Math.max(0, matchIndex - PADDING);
    const end = Math.min(context.length, matchIndex + matchLength + PADDING);

    const prefix = start > 0 ? '...' : '';
    const suffix = end < context.length ? '...' : '';
    const snippet = context.slice(start, end);
    const localMatchStart = matchIndex - start;

    const beforeMatch = snippet.slice(0, localMatchStart);
    const matchText = snippet.slice(localMatchStart, localMatchStart + matchLength);
    const afterMatch = snippet.slice(localMatchStart + matchLength);

    if (replaceQuery) {
      const replacement = searchService.replace(matchText, searchQuery, replaceQuery, { isRegExp, isCaseSensitive });
      return (
        <span className="match-context" title={context}>
          <span className="dim-text">{prefix}{beforeMatch}</span>
          <span className="diff-del">{matchText}</span>
          <span style={{ margin: '0 4px', color: '#999', fontSize: '10px' }}>→</span>
          <span className="diff-ins">{replacement}</span>
          <span className="dim-text">{afterMatch}{suffix}</span>
        </span>
      );
    }

    return (
      <span className="match-context" title={context}>
        <span className="dim-text">{prefix}{beforeMatch}</span>
        <span className="highlight-match-text">{matchText}</span>
        <span className="dim-text">{afterMatch}{suffix}</span>
      </span>
    );
  };

  const renderVirtualRow = ({ index, style }: ListChildComponentProps) => {
    const pageIndex = Math.floor(index / VIRTUAL_PAGE_SIZE);
    let pageRows = virtualRowPageCacheRef.current.get(pageIndex);

    if (!pageRows) {
      const start = pageIndex * VIRTUAL_PAGE_SIZE;
      const end = Math.min(start + VIRTUAL_PAGE_SIZE, virtualRows.length);
      pageRows = virtualRows.slice(start, end);
      virtualRowPageCacheRef.current.set(pageIndex, pageRows);

      if (virtualRowPageCacheRef.current.size > VIRTUAL_PAGE_CACHE_LIMIT) {
        const oldestPage = virtualRowPageCacheRef.current.keys().next().value as number | undefined;
        if (oldestPage !== undefined) virtualRowPageCacheRef.current.delete(oldestPage);
      }
    } else {
      virtualRowPageCacheRef.current.delete(pageIndex);
      virtualRowPageCacheRef.current.set(pageIndex, pageRows);
    }

    const row = pageRows[index % VIRTUAL_PAGE_SIZE];
    if (!row) return null;

    if (row.type === 'group') {
      return (
        <div style={style}>
          <div className="file-group-header" onClick={() => toggleFileCollapse(row.fileId)}>
            <span className={`file-group-icon ${collapsedFiles.has(row.fileId) ? 'collapsed' : ''}`}>▼</span>
            <span className="file-group-name" title={projectData.files[row.fileId]?.fileName}>
              {projectData.files[row.fileId]?.fileName}
            </span>
            <span className="file-match-count">{row.count}</span>
          </div>
        </div>
      );
    }

    const { result, index: absoluteIndex } = row.item;
    return (
      <div style={style}>
        <div
          className={`match-item ${currentResultIndex === absoluteIndex ? 'active' : ''}`}
          onClick={() => {
            setCurrentResultIndex(absoluteIndex);
            setCurrentSearchResult(result);
            handleJump(result.fileId, result.rowIndex, result.colIndex, absoluteIndex);
          }}
        >
          {renderMatchContent(result.context)}
          <div className="match-actions" onClick={(e) => e.stopPropagation()}>
            <button className="action-icon-btn" title="替换" onClick={() => handleReplaceSingle(result)}>R</button>
            <button className="action-icon-btn" title="忽略" onClick={() => handleDismiss(result)}>×</button>
          </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    virtualRowPageCacheRef.current.clear();
  }, [virtualRows]);

  return (
    <div className="function-panel">
      <div className="panel-tabs">
        <button className={activeTab === 'search' ? 'active' : ''} onClick={() => setActiveTab('search')}>查找</button>
        <button className={activeTab === 'validation' ? 'active' : ''} onClick={() => setActiveTab('validation')}>
          校验
          {validationErrors.length > 0 && <span className="tab-badge">{validationErrors.length}</span>}
        </button>
      </div>

      <div className="panel-content">
        {activeTab === 'search' && (
          <div className="search-tab">
            <div className="search-container">
              <div className="input-wrapper">
                <input ref={searchInputRef} type="text" placeholder="查找" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                <div className="input-options">
                  <div className={`option-btn ${isCaseSensitive ? 'active' : ''}`} title="区分大小写 (Alt+C)" onClick={toggleCaseSensitive}><span className="option-icon">Aa</span></div>
                  <div className={`option-btn ${isRegExp ? 'active' : ''}`} title="正则表达式 (Alt+R)" onClick={toggleRegExp}><span className="option-icon">.*</span></div>
                  <div className={`option-btn ${isGlobalSearch ? 'active' : ''}`} title="全项目搜索" onClick={toggleGlobalSearch} style={{ fontSize: '16px' }}><span className="option-icon">◎</span></div>
                </div>
              </div>

              <div className="input-wrapper">
                <input
                  ref={replaceInputRef}
                  type="text"
                  placeholder="替换为"
                  value={replaceQuery}
                  onChange={(e) => setReplaceQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleReplaceAll()}
                />
                <div className="input-options">
                  <div className="option-btn" title="全部替换 (Ctrl+Alt+Enter)" onClick={handleReplaceAll} style={{ color: searchResultCount === 0 ? '#ccc' : '#333' }}>
                    <span className="option-icon">all</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="search-results">
              {isSearching && <div className="results-info">搜索中... 已加载 {searchResultCount} 条（不限流）</div>}
              {!isSearching && searchResultCount > 0 && (
                <div className="results-info">
                  {groupedResults.length} 个文件，{searchResultCount} 条结果{searchHasMore ? '（结果过多，已截断）' : ''}
                </div>
              )}

              <div className="results-list results-list-virtual" ref={resultsContainerRef}>
                {resultsListHeight > 0 && (
                  <FixedSizeList height={resultsListHeight} width={resultsListWidth || '100%'} itemCount={virtualRows.length} itemSize={RESULT_ROW_HEIGHT}>
                    {renderVirtualRow}
                  </FixedSizeList>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'validation' && (
          <div className="validation-tab">
            {validationErrors.length > 0 ? (
              <div className="search-results">
                <div className="results-info error-info">发现 {validationErrors.length} 个错误</div>
                <ul className="results-list">
                  {validationErrors.map((error, index) => (
                    <li key={index} className="error-item" onClick={() => handleErrorClick(error)}>
                      <div className="error-header">
                        <span className="res-file">{projectData.files[error.fileId]?.fileName}</span>
                        <span className="res-pos">[{error.rowIndex + 1}]</span>
                      </div>
                      <div className={`error-message type-${error.type}`}>{error.message}</div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="placeholder-text">暂无发现错误。<br />点击上方标签页切换回查找功能。</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FunctionPanel;
