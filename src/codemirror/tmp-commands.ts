import { EditorView } from '@codemirror/view';
import { TMPTagType, parseTMPTags } from './tmp-parser';

/**
 * 切换指定类型的 TMP 标签 (Wrap/Unwrap)
 * @param view 编辑器视图
 * @param type 标签类型 (如 'b', 'i', 'color')
 * @param value 标签值 (可选，用于 color, size 等)
 */
export const toggleTag = (view: EditorView, type: TMPTagType, value?: string) => {
    const { state, dispatch } = view;
    const { from, to } = state.selection.main;
    const text = state.doc.toString();
    const tags = parseTMPTags(text);
    
    // 1. 检查当前选区是否已被该类型标签包裹
    const existingTag = tags.find(tag => 
        tag.type === type && 
        tag.openTo <= from && 
        tag.closeFrom >= to
    );

    if (existingTag) {
        // --- 去除标签 (Unwrap) ---
        // 如果提供了 value 且与现有 value 不同 (例如颜色不同)，则更新 value
        if (value && existingTag.value !== value) {
            // 更新标签值 logic
            // 简单起见，这里先做 Unwrap 再 Wrap，或者直接替换 Header
            // 但标准 toggle 行为通常是移除
            // 计算新的 open tag
            const newOpenTag = `<${type}=${formatValue(value)}>`;
            
            dispatch({
                changes: {
                    from: existingTag.openFrom,
                    to: existingTag.openTo,
                    insert: newOpenTag
                }
            });
            return true;
        }

        // 执行 Unwrap
        const changes = [
            { from: existingTag.openFrom, to: existingTag.openTo, insert: '' }, // 移除开始标签
            { from: existingTag.closeFrom, to: existingTag.closeTo, insert: '' } // 移除结束标签
        ];
        dispatch({ changes });
        return true;
    } 
    
    // 2. 包裹标签 (Wrap)
    let openTag = `<${type}`;
    if (value) {
        openTag += `=${formatValue(value)}`;
    }
    openTag += '>';
    const closeTag = `</${type}>`;

    if (from === to) {
        // --- 没有选区：插入空标签并将光标置于中间 ---
        // 检查是否已经在标签内部 (嵌套情况) - 暂不阻止嵌套
        const insertText = `${openTag}${closeTag}`;
        dispatch({
            changes: { from, insert: insertText },
            selection: { anchor: from + openTag.length }
        });
    } else {
        // --- 有选区：包裹选区 ---
        const selectedText = state.sliceDoc(from, to);
        dispatch({
            changes: {
                from,
                to,
                insert: `${openTag}${selectedText}${closeTag}`
            },
            selection: {
                anchor: from + openTag.length,
                head: from + openTag.length + selectedText.length
            }
        });
    }
    return true;
};

/**
 * 设置标签值 (专门用于 color, size 等需要值的标签)
 * 如果当前已被包裹则更新值，否则包裹
 */
export const setTagValue = (view: EditorView, type: TMPTagType, value: string) => {
    return toggleTag(view, type, value);
};

/**
 * 插入自闭合标签 (如 <br>, <space=10>)
 */
export const insertSelfClosingTag = (view: EditorView, type: TMPTagType, value?: string) => {
    const { state, dispatch } = view;
    const { from } = state.selection.main;
    
    let tagStr = `<${type}`;
    if (value) {
        tagStr += `=${formatValue(value)}`;
    }
    tagStr += '>';

    dispatch({
        changes: { from, insert: tagStr },
        selection: { anchor: from + tagStr.length }
    });
    return true;
};

/**
 * 辅助函数：格式化标签值
 * 如果值包含空格或特殊字符，加上引号 (虽然 TMP 解析通常比较宽容)
 */
function formatValue(val: string): string {
    // 简单判断，如果包含空格且没引号，加引号
    if (val.includes(' ') && !val.startsWith('"')) {
        return `"${val}"`;
    }
    return val;
}
