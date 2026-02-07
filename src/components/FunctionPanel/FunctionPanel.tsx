import React, { useState } from 'react';
import { useProjectStore } from '../../stores/project-store';
import { useEditorStore } from '../../stores/editor-store';
import { searchService } from '../../services/search-service';
import { fileService } from '../../services/file-service';
import { validatorService } from '../../services/validator-service';
import { SearchResult, ValidationError } from '../../types';
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

  // 提取公共跳转逻辑
  const handleJump = async (fileId: string, rowIndex: number, colIndex: number) => {
    // 检查文件是否已加载内容，若未加载则自动读取
    const file = projectData.files[fileId];
    if (file && (!file.rows || file.rows.length === 0)) {
      try {
        await fileService.readFile(fileId);
      } catch (e) {
        console.error('自动加载文件失败', e);
      }
    }
    setSelectedFile(fileId);
    setSelectedCell(rowIndex, colIndex);
  };


  const handleSearch = async () => {
    setIsSearching(true);
    try {
      const results = await searchService.searchInProject(projectData, searchQuery, {
        isRegExp,
        isGlobalSearch,
        selectedFileId
      });
      setSearchResults(results);
    } finally {
      setIsSearching(false);
    }
  };

  const handleReplace = () => {
    if (searchResults.length === 0 || currentResultIndex === -1) return;
    
    const result = searchResults[currentResultIndex];
    const file = projectData.files[result.fileId];
    if (!file) return;

    const originalText = file.rows[result.rowIndex].cells[result.colIndex];
    const newText = searchService.replace(originalText, searchQuery, replaceQuery, {
      isRegExp
    });

    // 使用 updateCell
    projectData.updateCell(result.fileId, result.rowIndex, result.colIndex, newText);
    
    // 替换后通常需要重新搜索以更新结果列表
    handleSearch();
  };

  const handleReplaceAll = () => {
    if (searchResults.length === 0) return;

    // 按文件分组执行替换，减少 Store 更新次数
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
          isRegExp
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

    handleSearch(); // 刷新搜索结果
  };

  const handleNext = async () => {
    if (searchResults.length === 0) return;
    const nextIndex = (currentResultIndex + 1) % searchResults.length;
    setCurrentResultIndex(nextIndex);
    
    const result = searchResults[nextIndex];
    await handleJump(result.fileId, result.rowIndex, result.colIndex);
  };

  const handleResultClick = async (index: number) => {
    setCurrentResultIndex(index);
    const result = searchResults[index];
    await handleJump(result.fileId, result.rowIndex, result.colIndex);
  };

  const handleErrorClick = async (error: ValidationError) => {
    await handleJump(error.fileId, error.rowIndex, error.colIndex);
  };

  // 实时校验 Effect
  React.useEffect(() => {
    // 只有当有文件被加载 或 有索引数据时才校验
    if (Object.keys(projectData.files).length > 0 || projectData.keyIndex) {
      const errors = validatorService.validateProject(projectData);
      setValidationErrors(errors);
    }
  }, [projectData.files, projectData.keyIndex, projectData.ignoredFileIds]);

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
            <div className="input-group">
              <label>查找内容</label>
              <input 
                type="text" 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            
            <div className="input-group">
              <label>替换为</label>
              <input 
                type="text" 
                value={replaceQuery} 
                onChange={(e) => setReplaceQuery(e.target.value)}
              />
            </div>

            <div className="options-group">
              <label>
                <input type="checkbox" checked={isRegExp} onChange={toggleRegExp} />
                正则匹配
              </label>
              <label>
                <input type="checkbox" checked={isGlobalSearch} onChange={toggleGlobalSearch} />
                全项目搜索
              </label>
            </div>

            <div className="action-buttons">
              <button className="primary-btn" onClick={handleSearch} disabled={isSearching}>
                {isSearching ? '搜索中...' : '查找全部'}
              </button>
              <button disabled={searchResults.length === 0} onClick={handleNext}>查找下一个</button>
              <button disabled={searchResults.length === 0 || currentResultIndex === -1} onClick={handleReplace}>替换当前</button>
              <button disabled={searchResults.length === 0} onClick={handleReplaceAll}>全部替换</button>
            </div>

            {searchResults.length > 0 && (
              <div className="search-results">
                <div className="results-info">找到 {searchResults.length} 个匹配项</div>
                <ul className="results-list">
                  {searchResults.map((result, index) => (
                    <li 
                      key={index} 
                      className={currentResultIndex === index ? 'active' : ''}
                      onClick={() => handleResultClick(index)}
                    >
                      <span className="res-file">{projectData.files[result.fileId]?.fileName}</span>
                      <span className="res-pos">[{result.rowIndex + 1}, {result.colIndex + 1}]</span>
                      <div className="res-context">{result.context}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
               <p className="placeholder-text">点击上方按钮开始检测项目中的 Key 值错误</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FunctionPanel;
