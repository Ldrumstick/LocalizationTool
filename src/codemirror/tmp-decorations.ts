/**
 * TMP 标签装饰器插件
 * 实现类 Typora 的光标感知渲染效果
 */

import { RangeSetBuilder } from '@codemirror/state';
import {
    Decoration,
    DecorationSet,
    EditorView,
    ViewPlugin,
    ViewUpdate,
    WidgetType
} from '@codemirror/view';
import { getTagStyle, parseTMPTags, PASSTHROUGH_TAGS, TMPTag } from './tmp-parser';

// ============================================================================
// Widget 类定义
// ============================================================================

/**
 * 换行标签 Widget
 */
class BrWidget extends WidgetType {
    toDOM(): HTMLElement {
        const br = document.createElement('br');
        return br;
    }
}

/**
 * 分页标签 Widget (显示为分隔线)
 */
class PageWidget extends WidgetType {
    toDOM(): HTMLElement {
        const hr = document.createElement('hr');
        hr.className = 'cm-tmp-page';
        return hr;
    }
}

/**
 * 空白间距 Widget
 */
class SpaceWidget extends WidgetType {
    constructor(private width: string) {
        super();
    }

    toDOM(): HTMLElement {
        const span = document.createElement('span');
        span.className = 'cm-tmp-space';
        span.style.display = 'inline-block';
        span.style.width = this.width;
        return span;
    }
}

// ============================================================================
// 装饰器构建
// ============================================================================

/**
 * 构建装饰器
 * @param view EditorView 实例
 * @returns 装饰器集合
 */
function buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const text = view.state.doc.toString();
    const tags = parseTMPTags(text);

    // 检查编辑器是否有焦点
    const hasFocus = view.hasFocus;

    // 获取所有光标位置 (支持多光标)
    const cursorPositions: number[] = [];
    if (hasFocus) {
        for (const range of view.state.selection.ranges) {
            cursorPositions.push(range.from);
            if (range.from !== range.to) {
                cursorPositions.push(range.to);
            }
        }
    }

    // 收集所有装饰信息
    const decorations: Array<{ from: number, to: number, decoration: Decoration }> = [];

    for (const tag of tags) {
        // 如果没有焦点，始终渲染样式效果
        // 如果有焦点，检查光标是否在标签区域内
        const cursorInTag = hasFocus && cursorPositions.some(
            pos => pos >= tag.from && pos <= tag.to
        );

        if (cursorInTag) {
            // 光标在内：显示源码 + 语法高亮
            addSourceHighlighting(decorations, tag);
        } else {
            // 光标在外或没有焦点：隐藏标签 + 渲染样式
            addRenderedDecorations(decorations, tag);
        }
    }

    // 按起始位置排序后添加到 builder
    decorations.sort((a, b) => a.from - b.from || a.to - b.to);
    for (const { from, to, decoration } of decorations) {
        builder.add(from, to, decoration);
    }

    return builder.finish();
}

/**
 * 添加源码高亮装饰 (光标在标签内时)
 */
function addSourceHighlighting(
    decorations: Array<{ from: number, to: number, decoration: Decoration }>,
    tag: TMPTag
): void {
    // 高亮开始标签
    decorations.push({
        from: tag.openFrom,
        to: tag.openTo,
        decoration: Decoration.mark({ class: 'cm-tmp-tag' })
    });

    // 如果不是自闭合标签，高亮闭合标签
    if (!tag.isSelfClosing && tag.closeFrom !== tag.openFrom) {
        decorations.push({
            from: tag.closeFrom,
            to: tag.closeTo,
            decoration: Decoration.mark({ class: 'cm-tmp-tag' })
        });
    }
}

/**
 * 添加渲染后的装饰 (光标在标签外时)
 */
function addRenderedDecorations(
    decorations: Array<{ from: number, to: number, decoration: Decoration }>,
    tag: TMPTag
): void {
    // 保留原始文本的标签不做处理
    if (PASSTHROUGH_TAGS.has(tag.type)) {
        // 只高亮标签部分
        decorations.push({
            from: tag.openFrom,
            to: tag.openTo,
            decoration: Decoration.mark({ class: 'cm-tmp-tag-passthrough' })
        });
        if (!tag.isSelfClosing && tag.closeFrom !== tag.openFrom) {
            decorations.push({
                from: tag.closeFrom,
                to: tag.closeTo,
                decoration: Decoration.mark({ class: 'cm-tmp-tag-passthrough' })
            });
        }
        return;
    }

    // 处理特殊标签
    if (tag.isSelfClosing) {
        handleSelfClosingTag(decorations, tag);
        return;
    }

    // 处理 noparse 标签 - 显示内容但不解析
    if (tag.type === 'noparse') {
        // 隐藏开闭标签
        decorations.push({
            from: tag.openFrom,
            to: tag.openTo,
            decoration: Decoration.replace({})
        });
        decorations.push({
            from: tag.closeFrom,
            to: tag.closeTo,
            decoration: Decoration.replace({})
        });
        return;
    }

    // 隐藏开始标签
    decorations.push({
        from: tag.openFrom,
        to: tag.openTo,
        decoration: Decoration.replace({})
    });

    // 隐藏闭合标签
    if (tag.closeFrom !== tag.openFrom) {
        decorations.push({
            from: tag.closeFrom,
            to: tag.closeTo,
            decoration: Decoration.replace({})
        });
    }

    // 获取内容区域
    const contentFrom = tag.openTo;
    const contentTo = tag.closeFrom;

    if (contentFrom < contentTo) {
        // 对内容区域应用样式
        const style = getTagStyle(tag);
        const styleString = cssPropertiesToString(style);

        if (styleString) {
            decorations.push({
                from: contentFrom,
                to: contentTo,
                decoration: Decoration.mark({
                    class: `cm-tmp-${tag.type}`,
                    attributes: { style: styleString }
                })
            });
        }
    }
}

/**
 * 处理自闭合标签
 */
function handleSelfClosingTag(
    decorations: Array<{ from: number, to: number, decoration: Decoration }>,
    tag: TMPTag
): void {
    switch (tag.type) {
        case 'br':
            decorations.push({
                from: tag.from,
                to: tag.to,
                decoration: Decoration.replace({ widget: new BrWidget() })
            });
            break;
        case 'page':
            decorations.push({
                from: tag.from,
                to: tag.to,
                decoration: Decoration.replace({ widget: new PageWidget() })
            });
            break;
        case 'space':
            const width = tag.value ? `${parseFloat(tag.value)}px` : '1em';
            decorations.push({
                from: tag.from,
                to: tag.to,
                decoration: Decoration.replace({ widget: new SpaceWidget(width) })
            });
            break;
    }
}

/**
 * 将 CSSProperties 对象转换为内联样式字符串
 */
function cssPropertiesToString(style: React.CSSProperties): string {
    return Object.entries(style)
        .map(([key, value]) => {
            // 将 camelCase 转换为 kebab-case
            const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
            return `${cssKey}: ${value}`;
        })
        .join('; ');
}

// ============================================================================
// ViewPlugin 定义
// ============================================================================

/**
 * TMP 装饰器插件
 */
const tmpDecorationsPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = buildDecorations(view);
        }

        update(update: ViewUpdate) {
            // 当文档内容、选区或焦点状态发生变化时重新构建装饰器
            if (update.docChanged || update.selectionSet || update.focusChanged) {
                this.decorations = buildDecorations(update.view);
            }
        }
    },
    {
        decorations: (v) => v.decorations
    }
);

/**
 * 导出 TMP 装饰器扩展
 * 在编辑器中使用: extensions: [tmpDecorations()]
 */
export function tmpDecorations() {
    return tmpDecorationsPlugin;
}

export default tmpDecorations;
