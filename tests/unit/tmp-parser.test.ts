/**
 * TMP 标签解析器单元测试
 */
import { findTagAtPosition, getTagStyle, isPositionInTag, parseTMPTags, TMPTag } from '../../src/codemirror/tmp-parser';

describe('TMP 标签解析器', () => {
    describe('parseTMPTags', () => {
        it('应该解析简单的粗体标签', () => {
            const text = '<b>粗体文本</b>';
            const tags = parseTMPTags(text);

            expect(tags).toHaveLength(1);
            expect(tags[0].type).toBe('b');
            expect(tags[0].openFrom).toBe(0);
            expect(tags[0].openTo).toBe(3);
            expect(tags[0].closeFrom).toBe(7);
            expect(tags[0].closeTo).toBe(11);
            expect(tags[0].isSelfClosing).toBe(false);
        });

        it('应该解析带属性值的颜色标签', () => {
            const text = '<color=#FF0000>红色文本</color>';
            const tags = parseTMPTags(text);

            expect(tags).toHaveLength(1);
            expect(tags[0].type).toBe('color');
            expect(tags[0].value).toBe('#FF0000');
        });

        it('应该解析带引号属性值的标签', () => {
            const text = '<color="red">红色</color>';
            const tags = parseTMPTags(text);

            expect(tags).toHaveLength(1);
            expect(tags[0].value).toBe('red');
        });

        it('应该解析嵌套标签', () => {
            const text = '<b><i>粗斜体</i></b>';
            const tags = parseTMPTags(text);

            expect(tags).toHaveLength(2);
            // 按起始位置排序
            const boldTag = tags.find(t => t.type === 'b');
            const italicTag = tags.find(t => t.type === 'i');

            expect(boldTag).toBeDefined();
            expect(italicTag).toBeDefined();
            expect(boldTag!.from).toBe(0);
            expect(italicTag!.from).toBe(3);
        });

        it('应该解析自闭合标签 br', () => {
            const text = '第一行<br>第二行';
            const tags = parseTMPTags(text);

            expect(tags).toHaveLength(1);
            expect(tags[0].type).toBe('br');
            expect(tags[0].isSelfClosing).toBe(true);
        });

        it('应该解析自闭合标签 page', () => {
            const text = '第一页<page>第二页';
            const tags = parseTMPTags(text);

            expect(tags).toHaveLength(1);
            expect(tags[0].type).toBe('page');
            expect(tags[0].isSelfClosing).toBe(true);
        });

        it('应该解析 size 标签', () => {
            const text = '<size=20>大字</size>';
            const tags = parseTMPTags(text);

            expect(tags).toHaveLength(1);
            expect(tags[0].type).toBe('size');
            expect(tags[0].value).toBe('20');
        });

        it('应该解析多个不同类型的标签', () => {
            const text = '<b>粗体</b>普通<i>斜体</i>';
            const tags = parseTMPTags(text);

            expect(tags).toHaveLength(2);
        });

        it('应该忽略未闭合的标签', () => {
            const text = '<b>未闭合粗体';
            const tags = parseTMPTags(text);

            expect(tags).toHaveLength(0);
        });

        it('应该忽略无匹配的闭合标签', () => {
            const text = '无开始标签</b>';
            const tags = parseTMPTags(text);

            expect(tags).toHaveLength(0);
        });

        it('应该正确处理空内容', () => {
            const text = '<b></b>';
            const tags = parseTMPTags(text);

            expect(tags).toHaveLength(1);
            expect(tags[0].openTo).toBe(tags[0].closeFrom);
        });

        it('应该解析大小写转换标签', () => {
            const text = '<uppercase>大写</uppercase><lowercase>小写</lowercase>';
            const tags = parseTMPTags(text);

            expect(tags).toHaveLength(2);
            expect(tags[0].type).toBe('uppercase');
            expect(tags[1].type).toBe('lowercase');
        });

        it('应该解析上下标标签', () => {
            const text = 'E=mc<sup>2</sup> H<sub>2</sub>O';
            const tags = parseTMPTags(text);

            expect(tags).toHaveLength(2);
            expect(tags[0].type).toBe('sup');
            expect(tags[1].type).toBe('sub');
        });

        it('应该解析删除线标签', () => {
            const text = '<s>删除线</s>';
            const tags = parseTMPTags(text);

            expect(tags).toHaveLength(1);
            expect(tags[0].type).toBe('s');
        });

        it('应该解析 strikethrough 标签', () => {
            const text = '<strikethrough>删除线</strikethrough>';
            const tags = parseTMPTags(text);

            expect(tags).toHaveLength(1);
            expect(tags[0].type).toBe('strikethrough');
        });
    });

    describe('findTagAtPosition', () => {
        it('应该找到光标位置所在的标签', () => {
            const text = '<b>粗体文本</b>';
            const tags = parseTMPTags(text);

            // 光标在标签开始位置
            const tagAtStart = findTagAtPosition(0, tags);
            expect(tagAtStart).toBeDefined();
            expect(tagAtStart?.type).toBe('b');

            // 光标在内容中间
            const tagInMiddle = findTagAtPosition(5, tags);
            expect(tagInMiddle).toBeDefined();

            // 光标在标签结束位置
            const tagAtEnd = findTagAtPosition(11, tags);
            expect(tagAtEnd).toBeDefined();
        });

        it('光标在标签外时应返回 undefined', () => {
            const text = '前缀<b>粗体</b>后缀';
            const tags = parseTMPTags(text);

            const tagBefore = findTagAtPosition(0, tags);
            expect(tagBefore).toBeUndefined();

            const tagAfter = findTagAtPosition(text.length, tags);
            expect(tagAfter).toBeUndefined();
        });
    });

    describe('isPositionInTag', () => {
        it('应该正确判断位置是否在标签内', () => {
            const text = '<b>粗体</b>';
            const tags = parseTMPTags(text);

            expect(isPositionInTag(0, tags)).toBe(true);
            expect(isPositionInTag(5, tags)).toBe(true);
        });
    });

    describe('getTagStyle', () => {
        it('应该返回粗体样式', () => {
            const tag: TMPTag = {
                type: 'b',
                from: 0, to: 10, openFrom: 0, openTo: 3, closeFrom: 7, closeTo: 10,
                isSelfClosing: false
            };

            const style = getTagStyle(tag);
            expect(style.fontWeight).toBe('bold');
        });

        it('应该返回斜体样式', () => {
            const tag: TMPTag = {
                type: 'i',
                from: 0, to: 10, openFrom: 0, openTo: 3, closeFrom: 7, closeTo: 10,
                isSelfClosing: false
            };

            const style = getTagStyle(tag);
            expect(style.fontStyle).toBe('italic');
        });

        it('应该返回颜色样式', () => {
            const tag: TMPTag = {
                type: 'color',
                from: 0, to: 20, openFrom: 0, openTo: 15, closeFrom: 17, closeTo: 25,
                value: '#FF0000',
                isSelfClosing: false
            };

            const style = getTagStyle(tag);
            expect(style.color).toBe('#FF0000');
        });

        it('应该处理不带 # 的颜色值', () => {
            const tag: TMPTag = {
                type: 'color',
                from: 0, to: 20, openFrom: 0, openTo: 15, closeFrom: 17, closeTo: 25,
                value: 'FF0000',
                isSelfClosing: false
            };

            const style = getTagStyle(tag);
            expect(style.color).toBe('#FF0000');
        });

        it('应该返回字号样式', () => {
            const tag: TMPTag = {
                type: 'size',
                from: 0, to: 20, openFrom: 0, openTo: 10, closeFrom: 12, closeTo: 19,
                value: '20',
                isSelfClosing: false
            };

            const style = getTagStyle(tag);
            expect(style.fontSize).toBe('20px');
        });

        it('应该返回上标样式', () => {
            const tag: TMPTag = {
                type: 'sup',
                from: 0, to: 10, openFrom: 0, openTo: 5, closeFrom: 6, closeTo: 12,
                isSelfClosing: false
            };

            const style = getTagStyle(tag);
            expect(style.verticalAlign).toBe('super');
            expect(style.fontSize).toBe('0.75em');
        });

        it('应该返回下标样式', () => {
            const tag: TMPTag = {
                type: 'sub',
                from: 0, to: 10, openFrom: 0, openTo: 5, closeFrom: 6, closeTo: 12,
                isSelfClosing: false
            };

            const style = getTagStyle(tag);
            expect(style.verticalAlign).toBe('sub');
        });

        it('应该返回下划线样式', () => {
            const tag: TMPTag = {
                type: 'u',
                from: 0, to: 10, openFrom: 0, openTo: 3, closeFrom: 7, closeTo: 10,
                isSelfClosing: false
            };

            const style = getTagStyle(tag);
            expect(style.textDecoration).toBe('underline');
        });

        it('应该返回删除线样式', () => {
            const tag: TMPTag = {
                type: 's',
                from: 0, to: 10, openFrom: 0, openTo: 3, closeFrom: 7, closeTo: 10,
                isSelfClosing: false
            };

            const style = getTagStyle(tag);
            expect(style.textDecoration).toBe('line-through');
        });

        it('应该返回大写转换样式', () => {
            const tag: TMPTag = {
                type: 'uppercase',
                from: 0, to: 20, openFrom: 0, openTo: 11, closeFrom: 13, closeTo: 25,
                isSelfClosing: false
            };

            const style = getTagStyle(tag);
            expect(style.textTransform).toBe('uppercase');
        });

        it('应该返回小写转换样式', () => {
            const tag: TMPTag = {
                type: 'lowercase',
                from: 0, to: 20, openFrom: 0, openTo: 11, closeFrom: 13, closeTo: 25,
                isSelfClosing: false
            };

            const style = getTagStyle(tag);
            expect(style.textTransform).toBe('lowercase');
        });

        it('应该返回 mark 高亮样式', () => {
            const tag: TMPTag = {
                type: 'mark',
                from: 0, to: 20, openFrom: 0, openTo: 15, closeFrom: 17, closeTo: 24,
                value: '#FFFF00',
                isSelfClosing: false
            };

            const style = getTagStyle(tag);
            expect(style.backgroundColor).toBe('#FFFF00');
        });

        it('mark 标签无值时应使用默认黄色', () => {
            const tag: TMPTag = {
                type: 'mark',
                from: 0, to: 20, openFrom: 0, openTo: 6, closeFrom: 10, closeTo: 17,
                isSelfClosing: false
            };

            const style = getTagStyle(tag);
            expect(style.backgroundColor).toBe('yellow');
        });
    });
});
