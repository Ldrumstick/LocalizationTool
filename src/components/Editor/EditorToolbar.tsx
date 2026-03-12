import React, { useCallback } from 'react';
import { useEditorStore } from '../../stores/editor-store';
import { toggleTag, setTagValue } from '../../codemirror/tmp-commands';
import { DEFAULT_COLOR_PICKER_HEX } from '../../utils/color-picker';
import './EditorToolbar.css';

const EditorToolbar: React.FC = () => {
    const isEditing = useEditorStore(state => state.isEditing);
    const editorView = useEditorStore(state => state.editorView);
    const setInputModal = useEditorStore(state => state.setInputModal);
    const setColorPickerModal = useEditorStore(state => state.setColorPickerModal);

    const disabled = !isEditing || !editorView;

    // Helper to safely dispatch command
    const runCommand = useCallback((cmd: (view: any) => void) => {
        if (!disabled && editorView) {
            cmd(editorView);
            editorView.focus();
        }
    }, [disabled, editorView]);

    // Handlers
    const handleBold = () => runCommand(v => toggleTag(v, 'b'));
    const handleItalic = () => runCommand(v => toggleTag(v, 'i'));
    const handleUnderline = () => runCommand(v => toggleTag(v, 'u'));
    const handleStrike = () => runCommand(v => toggleTag(v, 's'));
    
    const handleSub = () => runCommand(v => toggleTag(v, 'sub'));
    const handleSup = () => runCommand(v => toggleTag(v, 'sup'));
    const handleAllCaps = () => runCommand(v => toggleTag(v, 'allcaps'));

    const handleColor = () => {
        setColorPickerModal({
            isOpen: true,
            defaultColor: DEFAULT_COLOR_PICKER_HEX,
            onConfirm: (color) => {
                runCommand(v => setTagValue(v, 'color', color));
            }
        });
    };

    const handleSize = () => {
        setInputModal({
            isOpen: true,
            title: '输入字号 (px 或 %)',
            defaultValue: '20',
            onConfirm: (size) => {
                if (size) {
                    runCommand(v => setTagValue(v, 'size', size));
                }
            }
        });
    };

    const handleAlign = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const align = e.target.value;
        if (align) {
            runCommand(v => setTagValue(v, 'align', align));
            // Reset select
            e.target.value = '';
        }
    };

    const handleIndent = () => runCommand(v => toggleTag(v, 'indent'));
    
    const handleNoParse = () => runCommand(v => toggleTag(v, 'noparse'));

    return (
        <div className="editor-toolbar">
            <div className="toolbar-group">
                <button className="toolbar-btn btn-bold" onClick={handleBold} disabled={disabled} title="Bold (Ctrl+B)">B</button>
                <button className="toolbar-btn btn-italic" onClick={handleItalic} disabled={disabled} title="Italic (Ctrl+I)">I</button>
                <button className="toolbar-btn btn-underline" onClick={handleUnderline} disabled={disabled} title="Underline (Ctrl+U)">U</button>
                <button className="toolbar-btn btn-strike" onClick={handleStrike} disabled={disabled} title="Strikethrough (Alt+Shift+5)">S</button>
            </div>

            <div className="toolbar-group">
                <button className="toolbar-btn" onClick={handleSub} disabled={disabled} title="Subscript">X₂</button>
                <button className="toolbar-btn" onClick={handleSup} disabled={disabled} title="Superscript">X²</button>
                <button className="toolbar-btn" onClick={handleAllCaps} disabled={disabled} style={{ fontSize: '10px' }} title="All Caps">AAA</button>
            </div>

            <div className="toolbar-group">
                <button className="toolbar-btn" onClick={handleColor} disabled={disabled} title="Text Color">🎨</button>
                <button className="toolbar-btn" onClick={handleSize} disabled={disabled} title="Font Size">T↕</button>
            </div>

            <div className="toolbar-group">
                <select className="toolbar-select" onChange={handleAlign} disabled={disabled} defaultValue="">
                    <option value="" disabled>≡</option>
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                    <option value="justified">Justify</option>
                </select>
                <button className="toolbar-btn" onClick={handleIndent} disabled={disabled} title="Indent">⇥</button>
            </div>

            <div className="toolbar-group">
                <button className="toolbar-btn" onClick={handleNoParse} disabled={disabled} title="No Parse (Raw)">{'</>'}</button>
            </div>
            
        </div>
    );
};

export default EditorToolbar;
