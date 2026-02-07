import React, { useState, useEffect, useMemo } from 'react';
import { useProjectStore } from '../../stores/project-store';
import { useEditorStore } from '../../stores/editor-store';
import { searchService } from '../../services/search-service';
import { fileService } from '../../services/file-service';
import { validatorService } from '../../services/validator-service';
import { SearchResult, ValidationError } from '../../types';
import { useDebounce } from '../../hooks/useDebounce';
import './FunctionPanel.css';

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
  
  const searchResults = useEditorStore((state) => state.searchResults);
  const setSearchResults = useEditorStore((state) => state.setSearchResults);
  const currentResultIndex = useEditorStore((state) => state.currentResultIndex);
  const setCurrentResultIndex = useEditorStore((state) => state.setCurrentResultIndex);
  
  const setSelectedFile = useEditorStore((state) => state.setSelectedFile);
  const setSelectedCell = useEditorStore((state) => state.setSelectedCell);

  const projectData = useProjectStore();
  const selectedFileId = useEditorStore((state) => state.selectedFileId);

  const [isSearching, setIsSearching] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());

  // Debounce search query
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Group Results Logic
  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {};
    searchResults.forEach(res => {
        if (!groups[res.fileId]) groups[res.fileId] = [];
        groups[res.fileId].push(res);
    });
    return groups;
  }, [searchResults]);

  // Instant Search Effect
  useEffect(() => {
    if (debouncedSearchQuery) {
        handleSearch();
    } else {
        setSearchResults([]);
    }
  }, [debouncedSearchQuery, isRegExp, isCaseSensitive, isGlobalSearch, selectedFileId]);

  // Collapse Toggle
  const toggleFileCollapse = (fileId: string) => {
    const newSet = new Set(collapsedFiles);
    if (newSet.has(fileId)) {
        newSet.delete(fileId);
    } else {
        newSet.add(fileId);
    }
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
    }
    if (desiredIndex !== undefined) {
      setCurrentResultIndex(desiredIndex);
    }
    setSelectedCell(rowIndex, colIndex);
  };

  const handleSearch = async () => {
    if (!searchQuery) return;
    setIsSearching(true);
    try {
      const results = await searchService.searchInProject(projectData, searchQuery, {
        isRegExp,
        isCaseSensitive,
        isGlobalSearch,
        selectedFileId
      });
      setSearchResults(results);
    } finally {
      setIsSearching(false);
    }
  };

  // Replace Single (Modified to work with specific result from list)
  const handleReplaceSingle = (result: SearchResult) => {
    const file = projectData.files[result.fileId];
    if (!file) return;

    const originalText = file.rows[result.rowIndex].cells[result.colIndex];
    const newText = searchService.replace(originalText, searchQuery, replaceQuery, {
      isRegExp,
      isCaseSensitive
    });

    projectData.updateCell(result.fileId, result.rowIndex, result.colIndex, newText);
    
    // Optimistic update: Remove specific result from list without fuller re-search
    // In a real app we might want to regex check the new text if it still matches
    const newResults = searchResults.filter(r => r !== result);
    setSearchResults(newResults);
  };

  const handleReplaceAll = () => {
    if (searchResults.length === 0) return;

    const fileGroups: Record<string, SearchResult[]> = {};
    searchResults.forEach(res => {
      if (!fileGroups[res.fileId]) fileGroups[res.fileId] = [];
      fileGroups[res.fileId].push(res);
    });

    Object.entries(fileGroups).forEach(([fileId, results]) => {
      const file = projectData.files[fileId];
      if (!file) return;

      const updates: { row: number; col: number; value: string }[] = [];

      results.forEach(res => {
        const originalText = file.rows[res.rowIndex].cells[res.colIndex];
        const newText = searchService.replace(originalText, searchQuery, replaceQuery, {
          isRegExp,
          isCaseSensitive
        });
        updates.push({
            row: res.rowIndex,
            col: res.colIndex,
            value: newText
        });
      });

      if (updates.length > 0) {
          projectData.batchUpdateCells(fileId, updates, `批量替换 ${updates.length} 处`);
      }
    });

    handleSearch(); 
  };
  
  const handleDismiss = (result: SearchResult) => {
       const newResults = searchResults.filter(r => r !== result);
       setSearchResults(newResults);
  };

  const handleErrorClick = async (error: ValidationError) => {
    await handleJump(error.fileId, error.rowIndex, error.colIndex);
  };

  React.useEffect(() => {
    if (Object.keys(projectData.files).length > 0 || projectData.keyIndex) {
      const errors = validatorService.validateProject(projectData);
      setValidationErrors(errors);
    }
  }, [projectData.files, projectData.keyIndex, projectData.ignoredFileIds]);

  // Render Helper: Diff View & Context Truncation
  const renderMatchContent = (context: string) => {
    if (!searchQuery) return <span className="match-context" title={context}>{context}</span>;

    const PADDING = 20;
    let matchIndex = -1;
    let matchLength = 0;
    let regex: RegExp | null = null;

    try {
        let pattern = searchQuery;
        let flags = isCaseSensitive ? '' : 'i';
        
        if (isRegExp) {
            regex = new RegExp(pattern, flags);
        } else {
            // "Smart" handling: If literal match fails, try splitting by space (fuzzy-ish)
            // But to keep it consistent with "VS Code-like", we primarily focus on the user's input.
            // If the user meant "wonder conquest" to match "wonder_conquest", they probably expect wildcard behavior.
            // Let's first try literal match.
            const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            regex = new RegExp(escaped, flags);
            
            if (!regex.test(context)) {
                // If literal failed, and there are spaces, try replacing spaces with .* (Common fuzzy expectation)
                if (pattern.includes(' ')) {
                     const fuzzyPattern = pattern.split(' ').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
                     regex = new RegExp(fuzzyPattern, flags);
                }
            }
        }
        
        if (regex) {
            const match = regex.exec(context);
            if (match) {
                matchIndex = match.index;
                matchLength = match[0].length;
            }
        }
    } catch (e) {
        matchIndex = -1;
    }

    // Fallback: If still no match found (should be rare if backend found it), just show start
    if (matchIndex === -1) {
         // Try a simple string index if regex failed somehow
         const lowerContext = context.toLowerCase();
         const lowerQuery = searchQuery.toLowerCase();
         const idx = lowerContext.indexOf(lowerQuery);
         if (idx !== -1) {
             matchIndex = idx;
             matchLength = searchQuery.length;
         } else {
             return <span className="match-context" title={context}>{context}</span>;
         }
    }

    // Calculate Truncation
    let start = Math.max(0, matchIndex - PADDING);
    let end = Math.min(context.length, matchIndex + matchLength + PADDING);
    
    let prefix = start > 0 ? '...' : '';
    let suffix = end < context.length ? '...' : '';

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

  return (
    <div className="function-panel">
      <div className="panel-tabs">
        <button 
          className={activeTab === 'search' ? 'active' : ''} 
          onClick={() => setActiveTab('search')}
        >查找</button>
        <button 
          className={activeTab === 'validation' ? 'active' : ''} 
          onClick={() => setActiveTab('validation')}
        >
          校验
          {validationErrors.length > 0 && <span className="tab-badge">{validationErrors.length}</span>}
        </button>
      </div>

      <div className="panel-content">
        {activeTab === 'search' && (
          <div className="search-tab">
            <div className="search-container">
                {/* Search Input */}
                <div className="input-wrapper">
                    <input 
                        type="text" 
                        placeholder="查找"
                        value={searchQuery} 
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <div className="input-options">
                        <div 
                            className={`option-btn ${isCaseSensitive ? 'active' : ''}`} 
                            title="区分大小写 (Alt+C)"
                            onClick={toggleCaseSensitive}
                        >
                             <span className="option-icon">Aa</span>
                        </div>
                        <div 
                            className={`option-btn ${isRegExp ? 'active' : ''}`} 
                            title="正则表达式 (Alt+R)"
                            onClick={toggleRegExp}
                        >
                            <span className="option-icon">.*</span>
                        </div>
                         <div 
                            className={`option-btn ${isGlobalSearch ? 'active' : ''}`} 
                            title="全项目搜索"
                            onClick={toggleGlobalSearch}
                            style={{ fontSize: '16px' }}
                        >
                            <span className="option-icon">≡</span>
                        </div>
                    </div>
                </div>

                {/* Replace Input with Button */}
                <div className="input-wrapper">
                    <input 
                        type="text" 
                        placeholder="替换为"
                        value={replaceQuery} 
                        onChange={(e) => setReplaceQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleReplaceAll()}
                    />
                     <div className="input-options">
                        <div 
                            className="option-btn"
                            title="全部替换 (Ctrl+Alt+Enter)"
                            onClick={handleReplaceAll}
                            style={{ color: searchResults.length === 0 ? '#ccc' : '#333' }}
                        >
                             <span className="option-icon">all</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Results List */}
            <div className="search-results">
                {isSearching && <div className="results-info">搜索中...</div>}
                
                {!isSearching && searchResults.length > 0 && (
                     <div className="results-info">
                        {Object.keys(groupedResults).length} 文件中找到 {searchResults.length} 个结果
                    </div>
                )}

                <div className="results-list">
                    {Object.entries(groupedResults).map(([fileId, results]) => (
                        <div key={fileId} className="file-group">
                            <div className="file-group-header" onClick={() => toggleFileCollapse(fileId)}>
                                <span className={`file-group-icon ${collapsedFiles.has(fileId) ? 'collapsed' : ''}`}>▼</span>
                                <span className="file-group-name" title={projectData.files[fileId]?.fileName}>
                                    {projectData.files[fileId]?.fileName}
                                </span>
                                <span className="file-match-count">{results.length}</span>
                            </div>
                            
                            {!collapsedFiles.has(fileId) && (
                                <ul className="file-matches">
                                    {results.map((result, idx) => (
                                        <li 
                                            key={`${fileId}-${idx}`} 
                                            className={`match-item ${currentResultIndex === searchResults.indexOf(result) ? 'active' : ''}`}
                                            onClick={() => {
                                                setCurrentResultIndex(searchResults.indexOf(result));
                                                handleJump(result.fileId, result.rowIndex, result.colIndex);
                                            }}
                                        >
                                            {renderMatchContent(result.context)}
                                            
                                            <div className="match-actions" onClick={(e) => e.stopPropagation()}>
                                                <button 
                                                    className="action-icon-btn" 
                                                    title="替换"
                                                    onClick={() => handleReplaceSingle(result)}
                                                >
                                                    R
                                                </button>
                                                <button 
                                                    className="action-icon-btn" 
                                                    title="忽略"
                                                    onClick={() => handleDismiss(result)}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ))}
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
                    <li 
                      key={index} 
                      className="error-item"
                      onClick={() => handleErrorClick(error)}
                    >
                      <div className="error-header">
                        <span className="res-file">{projectData.files[error.fileId]?.fileName}</span>
                        <span className="res-pos">[{error.rowIndex + 1}]</span>
                      </div>
                      <div className={`error-message type-${error.type}`}>
                        {error.message}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
               <p className="placeholder-text">暂无发现错误。<br/>点击上方标签页切换回查找功能。</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FunctionPanel;
