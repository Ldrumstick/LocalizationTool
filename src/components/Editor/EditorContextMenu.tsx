import React, { useEffect, useRef } from 'react';
import { useEditorStore } from '../../stores/editor-store';
import { toggleTag, setTagValue } from '../../codemirror/tmp-commands';
import './EditorContextMenu.css';

const EditorContextMenu: React.FC = () => {
  const contextMenu = useEditorStore((state) => state.contextMenu);
  const setContextMenu = useEditorStore((state) => state.setContextMenu);
  const setInputModal = useEditorStore((state) => state.setInputModal);
  const editorView = useEditorStore((state) => state.editorView);
  const menuRef = useRef<HTMLDivElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const lastPositionRef = useRef({ x: 0, y: 0 });

  if (contextMenu) {
      lastPositionRef.current = { x: contextMenu.x, y: contextMenu.y };
  }

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
    // 1. Open picker (Input is always mounted now)
    colorInputRef.current?.click();
    // 2. Close menu immediately
    setContextMenu(null);
  };

  const onColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;
    if (color && editorView) {
        setTagValue(editorView, 'color', color);
        editorView.focus();
    }
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
    <>
        {isVisible && (
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
        )}
        
        {/* Persistent Input - Always mounted but hidden */}
        <input 
            type="color" 
            ref={colorInputRef} 
            className="context-menu-hidden-input" 
            style={{ 
                position: 'fixed',
                left: lastPositionRef.current.x,
                top: lastPositionRef.current.y,
                opacity: 0,
                pointerEvents: 'none',
                width: 0,
                height: 0
            }} 
            onChange={onColorChange} 
        />
    </>
  );
};

export default EditorContextMenu;
