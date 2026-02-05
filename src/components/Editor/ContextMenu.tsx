import React, { useEffect, useRef } from 'react';
import './ContextMenu.css';

export interface MenuItem {
  label: string;
  action?: (value?: any) => void;
  disabled?: boolean;
  separator?: boolean;
  danger?: boolean;
  inputType?: 'number'; // Currently only supporting number
  defaultValue?: number;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 点击外部关闭
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    
    // 窗口失焦/滚动关闭
    const handleScroll = () => onClose();
    const handleResize = () => onClose();

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true); // Capture phase/all scroll
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [onClose]);

  // 边界检查：防止菜单超出视图
  const style = {
    top: y,
    left: x,
  };

  // Adjust position if overflowing (simple heuristic)
  // In a real app we might use useMeasure or getBoundingClientRect after mount
  // But for now, we trust x/y is roughly correct or CSS handles min-content.
  // We can add logic: if y + height > window.innerHeight, top = y - height.

  return (
    <div className="context-menu" style={style} ref={menuRef}>
      {items.map((item, index) => {
        if (item.separator) {
          return <div key={index} className="context-menu-separator" />;
        }

        if (item.inputType === 'number') {
            return (
                <div key={index} className="context-menu-item input-item" onClick={(e) => e.stopPropagation()}>
                    <span className="item-label">{item.label}</span>
                    <div className="input-wrapper">
                        <input 
                            type="number" 
                            defaultValue={item.defaultValue} 
                            min={1}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    const val = parseInt((e.target as HTMLInputElement).value, 10);
                                    if (item.action && !isNaN(val) && val > 0) {
                                        item.action(val);
                                        onClose();
                                    }
                                }
                            }}
                            ref={() => {
                                // Auto-focus logic could go here if needed
                            }}
                        />
                        <button className="confirm-btn" onClick={(e) => {
                            const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                            const val = parseInt(input.value, 10);
                            if (item.action && !isNaN(val) && val > 0) {
                                item.action(val);
                                onClose();
                            }
                        }}>✓</button>
                    </div>
                </div>
            )
        }

        return (
          <div
            key={index}
            className={`context-menu-item ${item.disabled ? 'disabled' : ''} ${item.danger ? 'danger' : ''}`}
            onClick={() => {
              if (!item.disabled && item.action) {
                item.action();
                onClose();
              }
            }}
          >
            {item.label}
          </div>
        );
      })}
    </div>
  );
};

export default ContextMenu;
