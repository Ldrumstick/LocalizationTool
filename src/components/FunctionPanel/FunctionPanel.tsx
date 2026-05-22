import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import useMeasure from 'react-use-measure';
import { FixedSizeList, ListChildComponentProps, ListOnScrollProps } from 'react-window';
import { useProjectStore } from '../../stores/project-store';
import { useEditorStore } from '../../stores/editor-store';
import { searchService } from '../../services/search-service';
import { fileService } from '../../services/file-service';
import { commitActiveEdit } from '../../services/edit-session-service';
import { validatorService } from '../../services/validator-service';
import { SearchResult, ValidationError } from '../../types';
import { useDebounce } from '../../hooks/useDebounce';
import { hasModKey, isEditableTarget, registerShortcut, runShortcutRules, ShortcutPriority } from '../../services/shortcut-service';
import {
  buildSearchDataDependencyKey,
  buildLocalSearchResults,
  buildVirtualSearchRows,
  captureSearchListViewport,
  getSearchResultColumnLabel,
  getSearchResultDisplayRowNumber,
  getSearchResultKey,
  groupSearchResults,
  resolveSearchListViewport,
  SearchResultLiveOverride,
  SearchListViewportSnapshot,
  VirtualSearchRow
} from './search-panel-utils';
import './FunctionPanel.css';

const RESULT_ROW_HEIGHT = 34;
const VIRTUAL_PAGE_SIZE = 200;
const VIRTUAL_PAGE_CACHE_LIMIT = 24;

interface FunctionPanelProps {
  showTabs?: boolean;
}

const FunctionPanel: React.FC<FunctionPanelProps> = ({ showTabs = true }) => {
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
  const isEditing = useEditorStore((state) => state.isEditing);
  const editingCell = useEditorStore((state) => state.editingCell);
  const tempValue = useEditorStore((state) => state.tempValue);

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
  const virtualRowCacheSourceRef = useRef<VirtualSearchRow[] | null>(null);
  const searchListRef = useRef<FixedSizeList | null>(null);
  const searchListScrollOffsetRef = useRef(0);
  const pendingViewportSnapshotRef = useRef<SearchListViewportSnapshot | null>(null);
  const previousSearchCriteriaKeyRef = useRef('');
  const previousLivePreviewFileIdRef = useRef<string | undefined>();

  const allSearchResultsRef = useRef<SearchResult[]>([]);
  const [searchResultCount, setSearchResultCount] = useState(0);
  const [searchResultVersion, setSearchResultVersion] = useState(0);

  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const effectiveScopeId = isGlobalSearch ? '__global__' : (selectedFileId || '__none__');
  const ignoredFileIdsKey = useMemo(
    () => [...(projectData.ignoredFileIds || [])].sort().join('|'),
    [projectData.ignoredFileIds]
  );
  const searchDataDependencyKey = useMemo(
    () => buildSearchDataDependencyKey(projectData.files, {
      isGlobalSearch,
      selectedFileId
    }),
    [projectData.files, isGlobalSearch, selectedFileId]
  );
  const searchCriteriaKey = `${debouncedSearchQuery}::${isRegExp ? 1 : 0}::${isCaseSensitive ? 1 : 0}::${isGlobalSearch ? 1 : 0}::${effectiveScopeId}::${ignoredFileIdsKey}`;
  const livePreviewTarget = useMemo<SearchResultLiveOverride | undefined>(() => {
    if (!isEditing || !selectedFileId || !editingCell) return undefined;
    return {
      fileId: selectedFileId,
      rowIndex: editingCell.row,
      colIndex: editingCell.col,
      value: tempValue
    };
  }, [isEditing, selectedFileId, editingCell, tempValue]);
  const livePreviewKey = livePreviewTarget
    ? `${livePreviewTarget.fileId}:${livePreviewTarget.rowIndex}:${livePreviewTarget.colIndex}:${livePreviewTarget.value}`
    : '';

  const syncHighlightsForFile = (fileId?: string) => {
    if (!fileId) {
      setSearchResults([]);
      return;
    }

    const matches = allSearchResultsRef.current.filter((result) => result.fileId === fileId);
    setSearchResults(matches);
  };

  const resetAllSearchResults = () => {
    allSearchResultsRef.current = [];
    setSearchResultCount(0);
    setSearchResultVersion((version) => version + 1);
    setSearchResults([]);
    setCurrentResultIndex(-1);
    setCurrentSearchResult(undefined);
  };

  const groupedResults = useMemo(
    () => groupSearchResults(allSearchResultsRef.current),
    [searchResultVersion]
  );

  const virtualRows = useMemo(
    () => buildVirtualSearchRows(groupedResults, collapsedFiles),
    [groupedResults, collapsedFiles]
  );

  useEffect(() => {
    if (debouncedSearchQuery) {
      const preserveViewport = previousSearchCriteriaKeyRef.current === searchCriteriaKey;
      previousSearchCriteriaKeyRef.current = searchCriteriaKey;
      handleSearch({ query: debouncedSearchQuery, preserveViewport });
      return;
    }

    previousSearchCriteriaKeyRef.current = '';
    pendingViewportSnapshotRef.current = null;
    cancelSearchStreamRef.current?.();
    cancelSearchStreamRef.current = null;
    resetAllSearchResults();
    setSearchHasMore(false);
    setIsSearching(false);
    searchListRef.current?.scrollTo(0);
    searchListScrollOffsetRef.current = 0;
  }, [searchCriteriaKey, searchDataDependencyKey]);

  useEffect(() => {
    syncHighlightsForFile(selectedFileId);
  }, [selectedFileId, searchResultVersion]);

  const replaceResultsForFile = (items: SearchResult[], fileId: string, nextFileResults: SearchResult[]) => {
    const firstMatchIndex = items.findIndex((item) => item.fileId === fileId);
    const withoutFileItems = items.filter((item) => item.fileId !== fileId);

    if (firstMatchIndex < 0) {
      return nextFileResults.length > 0
        ? [...withoutFileItems, ...nextFileResults]
        : withoutFileItems;
    }

    const insertionIndex = items
      .slice(0, firstMatchIndex)
      .filter((item) => item.fileId !== fileId)
      .length;

    return [
      ...withoutFileItems.slice(0, insertionIndex),
      ...nextFileResults,
      ...withoutFileItems.slice(insertionIndex)
    ];
  };

  const refreshSearchResultsForFile = (fileId: string, override?: SearchResultLiveOverride) => {
    const file = projectData.files[fileId];
    if (!debouncedSearchQuery) return;

    if (!file || !file.rows || file.rows.length === 0) {
      mutateSearchResults((items) => replaceResultsForFile(items, fileId, []));
      return;
    }

    const nextFileResults = buildLocalSearchResults([file], debouncedSearchQuery, {
      isRegExp,
      isCaseSensitive: Boolean(isCaseSensitive)
    }, override);

    mutateSearchResults((items) => replaceResultsForFile(items, fileId, nextFileResults));
  };

  useEffect(() => {
    if (!debouncedSearchQuery) {
      previousLivePreviewFileIdRef.current = livePreviewTarget?.fileId;
      return;
    }

    const fileIdsToRefresh = new Set<string>();
    if (previousLivePreviewFileIdRef.current) fileIdsToRefresh.add(previousLivePreviewFileIdRef.current);
    if (livePreviewTarget?.fileId) fileIdsToRefresh.add(livePreviewTarget.fileId);
    if (fileIdsToRefresh.size === 0) return;

    fileIdsToRefresh.forEach((fileId) => {
      refreshSearchResultsForFile(
        fileId,
        livePreviewTarget?.fileId === fileId ? livePreviewTarget : undefined
      );
    });

    previousLivePreviewFileIdRef.current = livePreviewTarget?.fileId;
  }, [debouncedSearchQuery, livePreviewKey, isRegExp, isCaseSensitive]);

  useLayoutEffect(() => {
    const snapshot = pendingViewportSnapshotRef.current;
    if (!snapshot || !searchListRef.current || resultsListHeight <= 0) return;

    const resolution = resolveSearchListViewport(virtualRows, snapshot, RESULT_ROW_HEIGHT, resultsListHeight);
    searchListRef.current.scrollTo(resolution.scrollOffset);
    searchListScrollOffsetRef.current = resolution.scrollOffset;

    if (resolution.anchorFound || !isSearching) {
      pendingViewportSnapshotRef.current = null;
    }
  }, [virtualRows, isSearching, resultsListHeight]);

  const toggleFileCollapse = (fileId: string) => {
    const next = new Set(collapsedFiles);
    if (next.has(fileId)) next.delete(fileId);
    else next.add(fileId);
    setCollapsedFiles(next);
  };

  const handleJump = async (fileId: string, rowIndex: number, colIndex: number, desiredIndex?: number) => {
    commitActiveEdit({ exitEditing: true, blur: true });

    const file = projectData.files[fileId];
    if (file && (!file.rows || file.rows.length === 0)) {
      try {
        await fileService.readFile(fileId);
      } catch (error) {
        console.error('自动加载文件失败', error);
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
        (result) => result.fileId === fileId && result.rowIndex === rowIndex && result.colIndex === colIndex
      );
      if (targetIndex < 0) targetIndex = undefined;
    }

    if (targetIndex !== undefined) {
      setCurrentResultIndex(targetIndex);
      setCurrentSearchResult(allSearchResultsRef.current[targetIndex]);
    }

    setSelectedCell(rowIndex, colIndex);
  };

  const handleSearch = (options: { query: string; preserveViewport: boolean }) => {
    if (!options.query) return;

    if (options.preserveViewport) {
      pendingViewportSnapshotRef.current = captureSearchListViewport(
        virtualRows,
        searchListScrollOffsetRef.current,
        RESULT_ROW_HEIGHT
      );
    } else {
      pendingViewportSnapshotRef.current = null;
      searchListRef.current?.scrollTo(0);
      searchListScrollOffsetRef.current = 0;
    }

    const requestToken = ++latestSearchTokenRef.current;
    cancelSearchStreamRef.current?.();
    cancelSearchStreamRef.current = null;

    setIsSearching(true);
    setSearchHasMore(false);
    resetAllSearchResults();

    const dirtyLoadedFiles = Object.values(projectData.files).filter((file) => {
      const isLivePreviewFile = livePreviewTarget?.fileId === file.id;
      if ((!file.isDirty && !isLivePreviewFile) || !file.rows || file.rows.length === 0) return false;
      if (isGlobalSearch) return true;
      return Boolean(selectedFileId && file.id === selectedFileId);
    });
    const dirtyFileIds = Array.from(new Set(dirtyLoadedFiles.map((file) => file.id)));

    if (dirtyLoadedFiles.length > 0) {
      const localResults = buildLocalSearchResults(dirtyLoadedFiles, options.query, {
        isRegExp,
        isCaseSensitive: Boolean(isCaseSensitive)
      }, livePreviewTarget);
      allSearchResultsRef.current.push(...localResults);
      setSearchResultCount(localResults.length);
      setSearchResultVersion((version) => version + 1);

      const currentFileId = useEditorStore.getState().selectedFileId;
      if (currentFileId) {
        const localHighlights = localResults.filter((result) => result.fileId === currentFileId);
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
      options.query,
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
          setSearchResultVersion((version) => version + 1);

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
    setSearchResultVersion((version) => version + 1);

    const state = useEditorStore.getState();
    syncHighlightsForFile(state.selectedFileId);

    if (state.currentSearchResult) {
      const nextIndex = next.findIndex((item) => getSearchResultKey(item) === getSearchResultKey(state.currentSearchResult!));
      if (nextIndex >= 0) {
        setCurrentResultIndex(nextIndex);
        setCurrentSearchResult(next[nextIndex]);
        return;
      }
    }

    if (state.currentResultIndex >= next.length) {
      const nextIndex = next.length > 0 ? next.length - 1 : -1;
      setCurrentResultIndex(nextIndex);
      setCurrentSearchResult(nextIndex >= 0 ? next[nextIndex] : undefined);
      return;
    }

    if (state.currentResultIndex >= 0) {
      setCurrentSearchResult(next[state.currentResultIndex]);
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
    mutateSearchResults((items) => items.filter((item) => item !== result));
  };

  const handleReplaceAll = () => {
    if (allSearchResultsRef.current.length === 0) return;

    const fileGroups: Record<string, SearchResult[]> = {};
    allSearchResultsRef.current.forEach((result) => {
      if (!fileGroups[result.fileId]) fileGroups[result.fileId] = [];
      fileGroups[result.fileId].push(result);
    });

    Object.entries(fileGroups).forEach(([fileId, results]) => {
      const file = projectData.files[fileId];
      if (!file) return;

      const updates: { row: number; col: number; value: string }[] = [];
      results.forEach((result) => {
        const originalText = file.rows[result.rowIndex].cells[result.colIndex];
        const newText = searchService.replace(originalText, searchQuery, replaceQuery, {
          isRegExp,
          isCaseSensitive
        });
        updates.push({ row: result.rowIndex, col: result.colIndex, value: newText });
      });

      if (updates.length > 0) {
        projectData.batchUpdateCells(fileId, updates, `批量替换 ${updates.length} 处`);
      }
    });

    handleSearch({ query: searchQuery, preserveViewport: true });
  };

  const handleDismiss = (result: SearchResult) => {
    mutateSearchResults((items) => items.filter((item) => item !== result));
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (runShortcutRules(event, [
        {
          match: (keyboardEvent) => keyboardEvent.key === 'F3',
          run: (keyboardEvent) => {
            keyboardEvent.preventDefault();
            jumpSearchResult(keyboardEvent.shiftKey ? -1 : 1);
          }
        },
        {
          match: (keyboardEvent) => hasModKey(keyboardEvent) && keyboardEvent.altKey && keyboardEvent.key === 'Enter',
          run: (keyboardEvent) => {
            keyboardEvent.preventDefault();
            setActiveTab('search');
            handleReplaceAll();
          }
        }
      ])) return true;

      if (isEditableTarget(event.target)) return false;

      return runShortcutRules(event, [
        {
          match: (keyboardEvent) => !hasModKey(keyboardEvent) && keyboardEvent.altKey && keyboardEvent.key.toLowerCase() === 'c',
          run: (keyboardEvent) => {
            keyboardEvent.preventDefault();
            setActiveTab('search');
            toggleCaseSensitive();
          }
        },
        {
          match: (keyboardEvent) => !hasModKey(keyboardEvent) && keyboardEvent.altKey && keyboardEvent.key.toLowerCase() === 'r',
          run: (keyboardEvent) => {
            keyboardEvent.preventDefault();
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

  useEffect(() => () => {
    cancelSearchStreamRef.current?.();
    cancelSearchStreamRef.current = null;
  }, []);

  const renderMatchContent = (context: string) => {
    if (!searchQuery) {
      return <span className="match-context" title={context}>{context}</span>;
    }

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
          const fuzzyPattern = pattern
            .split(' ')
            .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('.*');
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
      const index = context.toLowerCase().indexOf(searchQuery.toLowerCase());
      if (index !== -1) {
        matchIndex = index;
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

  const handleSearchListScroll = ({ scrollOffset }: ListOnScrollProps) => {
    searchListScrollOffsetRef.current = scrollOffset;
  };

  const getVirtualRowItemKey = (index: number) => virtualRows[index]?.key ?? `row-${index}`;

  const renderVirtualRow = ({ index, style }: ListChildComponentProps) => {
    if (virtualRowCacheSourceRef.current !== virtualRows) {
      virtualRowPageCacheRef.current.clear();
      virtualRowCacheSourceRef.current = virtualRows;
    }

    const pageIndex = Math.floor(index / VIRTUAL_PAGE_SIZE);
    let pageRows = virtualRowPageCacheRef.current.get(pageIndex);

    if (!pageRows) {
      const start = pageIndex * VIRTUAL_PAGE_SIZE;
      const end = Math.min(start + VIRTUAL_PAGE_SIZE, virtualRows.length);
      pageRows = virtualRows.slice(start, end);
      virtualRowPageCacheRef.current.set(pageIndex, pageRows);

      if (virtualRowPageCacheRef.current.size > VIRTUAL_PAGE_CACHE_LIMIT) {
        const oldestPage = virtualRowPageCacheRef.current.keys().next().value as number | undefined;
        if (oldestPage !== undefined) {
          virtualRowPageCacheRef.current.delete(oldestPage);
        }
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
    const resultFile = projectData.files[result.fileId];
    const displayRowNumber = getSearchResultDisplayRowNumber(result);
    const columnLabel = getSearchResultColumnLabel(resultFile?.headers, result.colIndex);
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
          <div className="match-item-main">
            <div className="match-item-meta">
              <span
                className="match-line-badge"
                title={`第 ${displayRowNumber} 行`}
              >
                L{displayRowNumber}
              </span>
              <span
                className="match-column-badge"
                title={`命中列：${columnLabel}（第 ${result.colIndex + 1} 列）`}
              >
                {columnLabel}
              </span>
            </div>
            {renderMatchContent(result.context)}
          </div>
          <div className="match-actions" onClick={(event) => event.stopPropagation()}>
            <button className="action-icon-btn" title="替换" onClick={() => handleReplaceSingle(result)}>R</button>
            <button className="action-icon-btn" title="忽略" onClick={() => handleDismiss(result)}>×</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="function-panel">
      {showTabs && (
        <div className="panel-tabs">
          <button className={activeTab === 'search' ? 'active' : ''} onClick={() => setActiveTab('search')}>查找</button>
          <button className={activeTab === 'validation' ? 'active' : ''} onClick={() => setActiveTab('validation')}>
            校验
            {validationErrors.length > 0 && <span className="tab-badge">{validationErrors.length}</span>}
          </button>
        </div>
      )}

      <div className="panel-content">
        {activeTab === 'search' && (
          <div className="search-tab">
            <div className="search-container">
              <div className="input-wrapper">
                <input ref={searchInputRef} type="text" placeholder="查找" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
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
                  onChange={(event) => setReplaceQuery(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && handleReplaceAll()}
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
                  <FixedSizeList
                    ref={searchListRef}
                    height={resultsListHeight}
                    width={resultsListWidth || '100%'}
                    itemCount={virtualRows.length}
                    itemSize={RESULT_ROW_HEIGHT}
                    itemKey={getVirtualRowItemKey}
                    onScroll={handleSearchListScroll}
                  >
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
              <p className="placeholder-text">暂无发现错误。</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FunctionPanel;
