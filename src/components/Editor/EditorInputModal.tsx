import React, { useState, useEffect, useRef } from 'react';
import './EditorInputModal.css';

interface EditorInputModalProps {
    isOpen: boolean;
    title: string;
    defaultValue?: string;
    onConfirm: (value: string) => void;
    onCancel: () => void;
}

const EditorInputModal: React.FC<EditorInputModalProps> = ({
    isOpen,
    title,
    defaultValue = '',
    onConfirm,
    onCancel
}) => {
    const [value, setValue] = useState(defaultValue);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setValue(defaultValue);
            // Focus input on open
            setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 50);
        }
    }, [isOpen, defaultValue]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onConfirm(value);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onCancel();
        }
    };

    return (
        <div className="editor-input-modal-overlay" onMouseDown={onCancel}>
            <div className="editor-input-modal" onMouseDown={(e) => e.stopPropagation()}>
                <h3>{title}</h3>
                <form onSubmit={handleSubmit}>
                    <input
                        ref={inputRef}
                        type="text"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <div className="editor-input-modal-actions">
                        <button type="button" className="btn-cancel" onClick={onCancel}>
                            Cancel
                        </button>
                        <button type="submit" className="btn-confirm">
                            OK
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EditorInputModal;
