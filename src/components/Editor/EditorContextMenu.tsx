import React, { useEffect, useRef } from 'react';
import { useEditorStore } from '../../stores/editor-store';
import { toggleTag, setTagValue } from '../../codemirror/tmp-commands';
import { DEFAULT_COLOR_PICKER_HEX } from '../../utils/color-picker';
import './EditorContextMenu.css';

const EditorContextMenu: React.FC = () => {
  const contextMenu = useEditorStore((state) => state.contextMenu);
  const setContextMenu = useEditorStore((state) => state.setContextMenu);
  const setInputModal = useEditorStore((state) => state.setInputModal);
  const setColorPickerModal = useEditorStore((state) => state.setColorPickerModal);
  const editorView = useEditorStore((state) => state.editorView);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [contextMenu, setContextMenu]);

  // if (!contextMenu || !editorView) return null; // Removed early return to keep component mounted
  const isVisible = !!contextMenu && !!editorView;

  const handleAction = (action: () => void) => {
    if (!editorView) return;
    action();
    setContextMenu(null); // Close menu after action
    editorView.focus();
  };

  const handleBold = () => editorView && handleAction(() => toggleTag(editorView, 'b'));
  const handleItalic = () => editorView && handleAction(() => toggleTag(editorView, 'i'));
  const handleUnderline = () => editorView && handleAction(() => toggleTag(editorView, 'u'));
  const handleStrike = () => editorView && handleAction(() => toggleTag(editorView, 's'));
  
  const handleColor = () => {
    if (!editorView) return;
    const view = editorView;
    setContextMenu(null);
    setColorPickerModal({
      isOpen: true,
      defaultColor: DEFAULT_COLOR_PICKER_HEX,
      onConfirm: (color) => {
        setTagValue(view, 'color', color);
        view.focus();
      }
    });
  };

  const handleSize = () => {
      if (!editorView) return;
      const view = editorView; // Capture for closure
      handleAction(() => {
          setInputModal({
            isOpen: true,
            title: '输入字号 (px 或 %)',
            defaultValue: '20',
            onConfirm: (size) => {
                if (size) {
                    setTagValue(view, 'size', size);
                }
            }
          });
      });
  };

  // Prevent default context menu on the custom menu itself
  const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
  };

  return (
    isVisible ? (
      <div 
        className="editor-context-menu"
        style={{ top: contextMenu!.y, left: contextMenu!.x }}
        ref={menuRef}
        onContextMenu={handleContextMenu}
      >
        <div className="context-menu-item" onClick={handleBold}>
          <span className="icon">B</span>
          <span className="label">Bold</span>
          <span className="shortcut">Ctrl+B</span>
        </div>
        <div className="context-menu-item" onClick={handleItalic}>
          <span className="icon">I</span>
          <span className="label">Italic</span>
          <span className="shortcut">Ctrl+I</span>
        </div>
        <div className="context-menu-item" onClick={handleUnderline}>
          <span className="icon">U</span>
          <span className="label">Underline</span>
          <span className="shortcut">Ctrl+U</span>
        </div>
        <div className="context-menu-item" onClick={handleStrike}>
          <span className="icon">S</span>
          <span className="label">Strikethrough</span>
        </div>
        
        <div className="context-menu-divider" />
        
        <div className="context-menu-item" onClick={handleColor}>
          <span className="icon">🎨</span>
          <span className="label">Color...</span>
        </div>
        <div className="context-menu-item" onClick={handleSize}>
          <span className="icon">T</span>
          <span className="label">Size...</span>
        </div>

        <div className="context-menu-divider" />
      </div>
    ) : null
  );
};

export default EditorContextMenu;
