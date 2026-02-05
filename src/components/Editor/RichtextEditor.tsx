import React, { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { ViewUpdate, keymap } from '@codemirror/view';
import { indentWithTab, insertTab } from '@codemirror/commands';
import { useProjectStore } from '../../stores/project-store';
import { useEditorStore } from '../../stores/editor-store';
import './RichtextEditor.css';

const RichtextEditor: React.FC = () => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const readOnlyCompartment = useRef(new Compartment());
  const prevFileIdRef = useRef<string | undefined>();
  
  // Store Selectors
  const selectedFileId = useEditorStore((state) => state.selectedFileId);
  const selectedCell = useEditorStore((state) => state.selectedCell);
  const isEditing = useEditorStore((state) => state.isEditing);
  const editingLocation = useEditorStore((state) => state.editingLocation);
  const tempValue = useEditorStore((state) => state.tempValue);
  const updateTempValue = useEditorStore((state) => state.updateTempValue);
  const enterEditMode = useEditorStore((state) => state.enterEditMode);
  const exitEditMode = useEditorStore((state) => state.exitEditMode);
  const setEditingLocation = useEditorStore((state) => state.setEditingLocation);
  const setSelectedCell = useEditorStore((state) => state.setSelectedCell);
  
  const projectFiles = useProjectStore((state) => state.files);
  const updateFile = useProjectStore((state) => state.updateFile);

  // 计算当前单元格的原始值
  const currentCellValue = React.useMemo(() => {
    if (!selectedFileId || !selectedCell) return '';
    const file = projectFiles[selectedFileId];
    return file?.rows[selectedCell.row]?.cells[selectedCell.col] || '';
  }, [selectedFileId, selectedCell, projectFiles]);

  // 决定编辑器显示的内容：编辑模式下显示临时值，否则显示原始值
  const displayValue = isEditing ? tempValue : currentCellValue;

  // 监听文件切换，强制退出编辑并清空状态
  useEffect(() => {
    if (prevFileIdRef.current && prevFileIdRef.current !== selectedFileId) {
      // 切换文件时，如果正在编辑，强制退出（这里可以选择保存或放弃，通常切换文件意味着放弃未完成的编辑或已自动保存）
      // 根据之前的逻辑，切换时我们只重置状态
      if (isEditing) {
        exitEditMode(false);
      }
    }
    prevFileIdRef.current = selectedFileId;
  }, [selectedFileId, isEditing, exitEditMode]);

  // 初始化 CodeMirror 编辑器
  useEffect(() => {
    if (!editorRef.current) return;

    // 创建初始 EditorState配置
    const state = EditorState.create({
      doc: displayValue,
      extensions: [
        basicSetup,
        markdown(), // Markdown 语法高亮
        EditorView.lineWrapping, // 自动换行
        
        // 使用 Compartment 动态管理只读状态
        readOnlyCompartment.current.of(EditorState.readOnly.of(!isEditing)),
        
        // 监听内容变化，同步到 Store 的 tempValue
        // 使用 store 的实时状态判断是否处于编辑模式（避免闭包过期）
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            const storeState = useEditorStore.getState();
            if (storeState.isEditing) {
              const newValue = update.state.doc.toString();
              // 避免循环更新：只有当编辑器内容真的改变且在编辑模式下时才更新 tempValue
              updateTempValue(newValue);
            }
          }
        }),
        
        // 快捷键配置
        keymap.of([
          {
            key: 'Tab',
            run: (view) => insertTab(view)
          },
          indentWithTab, // 将 Tab 键映射为缩进字符
          {
            key: 'Escape',
            run: () => {
              if (isEditing) {
                exitEditMode(false); // 取消编辑，恢复原值
                return true;
              }
              return false;
            }
          },
          {
            key: 'Alt-Enter',
            run: () => {
              if (isEditing && selectedCell && selectedFileId) {
                // 保存编辑内容到 ProjectStore
                const file = projectFiles[selectedFileId];
                if (file) {
                  const newRows = [...file.rows];
                  const newCells = [...newRows[selectedCell.row].cells];
                  
                  // 使用最新的 tempValue 进行保存
                  // 注意：这里我们应该确保 tempValue 是最新的。
                  // 由于 updateTempValue 是同步的，且我们使用 zustand，这里可以直接取最新的
                  // 但为了保险，我们可以直接用编辑器当前的内容
                  // const currentContent = view.state.doc.toString(); // 如果能获取到view实例的话
                  // 在这里我们使用闭包中的 tempValue，或者最好是从 store 中获取最新的
                  // 为避免闭包过期问题，最好信任 tempValue 或者重新获取 state
                  // 这里的 run 函数闭包可能会捕获旧的 tempValue 吗？CodeMirror 的 keymap 可能会。
                  // 安全起见，做一次 store 读取或者利用 updateListener 已更新的 tempValue
                  
                  // 由于 tempValue 是从 useEditorStore hook 获取的，组件重新渲染时会更新，
                  // keymap 配置是在 useEffect 依赖为空数组时创建的，所以这里的闭包 
                  // 确实可能捕获初始的 tempValue (空字符串)！这是一个常见陷阱。
                  
                  // 修复方案：这里的逻辑应该放到外部引用其实例，或者依赖项更新重建扩展。
                  // 但频繁重建编辑器不好。
                  // 更好的方式：利用 EditorView.domEventHandlers 或者 dispatch 事件。
                  // 或者，直接操作 store 的 getState()
                  
                  const currentStoreState = useEditorStore.getState();
                  const contentToSave = currentStoreState.tempValue;
                  
                  newCells[selectedCell.col] = contentToSave;
                  newRows[selectedCell.row] = { ...newRows[selectedCell.row], cells: newCells };
                  updateFile(selectedFileId, { rows: newRows, isDirty: true });
                  
                  // 退出编辑模式
                  exitEditMode(true);
                  
                  // 跳转到下一行
                  const maxRow = file.rows.length;
                  if (selectedCell.row + 1 < maxRow) {
                    setSelectedCell(selectedCell.row + 1, selectedCell.col);
                  }
                }
                return true;
              }
              return false;
            }
          }
        ]),
        
        // DOM 事件处理
        EditorView.domEventHandlers({
          keydown: (_e) => {
            const e = _e as KeyboardEvent;
            if (e.key === 'Escape') {
              const beforeState = useEditorStore.getState();
              if (beforeState.isEditing) {
                exitEditMode(false);
                return true;
              }
            }
            return false;
          },
          mousedown: (e, view) => {
            // 如果已在编辑模式，允许默认行为（放置光标）
            const currentStoreState = useEditorStore.getState();
            if (currentStoreState.isEditing) {
              setEditingLocation('editor-bar');
              return false;
            }

            // 如果未在编辑模式，且有选中的单元格 -> 进入编辑模式
            if (currentStoreState.selectedCell && currentStoreState.selectedFileId) {
              const file = useProjectStore.getState().files[currentStoreState.selectedFileId];
              const content = file?.rows[currentStoreState.selectedCell.row]?.cells[currentStoreState.selectedCell.col] || '';

              // 1. 进入编辑模式，并初始化内容
              enterEditMode('append', content);
              setEditingLocation('editor-bar');

              // 2. 立即解除只读并设置焦点，无需等待 React 渲染周期
              // 获取点击位置的字符偏移量
              const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
              
              // 构建一个事务：解除只读 + 设置光标
              const transactionSpecs: any = {
                effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(false))
              };
              
              if (pos !== null) {
                transactionSpecs.selection = { anchor: pos, head: pos };
              }
              
              view.dispatch(transactionSpecs);
              view.focus();
              
              // 返回 false 允许 CodeMirror 继续处理事件（如拖拽选区）
              return false;
            }
            return false;
          },
          focus: () => {
             const currentStoreState = useEditorStore.getState();
             if (currentStoreState.isEditing) {
               setEditingLocation('editor-bar');
             }
          }
        }),

        EditorView.theme({
          "&": { height: "100%", fontSize: "14px" },
          ".cm-content": { fontFamily: "inherit" },
          "&.cm-focused": { outline: "none" } // 移除 CodeMirror 默认聚焦边框，由外部容器控制或保持简洁
        })
      ]
    });

    // 创建 View 实例
    const view = new EditorView({
      state,
      parent: editorRef.current
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, []); // 仅挂载时执行一次

  // 响应 isEditing 变化：更新只读状态
  useEffect(() => {
    if (viewRef.current) {
      const isReadOnly = !isEditing;
      viewRef.current.dispatch({
        effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(isReadOnly))
      });

      // 如果进入编辑模式且位置在 editor-bar，确保聚焦
      if (isEditing && editingLocation === 'editor-bar') {
        viewRef.current.focus();
      }
    }
  }, [isEditing, editingLocation]);

  // 响应 displayValue 变化：同步内容到编辑器
  // 注意：如果是编辑模式下且内容是由编辑器自己产生的（通过 updateListener），则不需要再次 dispatch，防止光标跳动
  useEffect(() => {
    if (viewRef.current) {
      const currentDoc = viewRef.current.state.doc.toString();
      if (currentDoc !== displayValue) {
        // 全量替换内容
        viewRef.current.dispatch({
          changes: { from: 0, to: currentDoc.length, insert: displayValue }
        });
      }
    }
  }, [displayValue]);

  return <div className="richtext-editor-container" ref={editorRef} />;
};

export default RichtextEditor;
