/**
 * TMP 标签解析器
 * 用于解析 Unity TextMeshPro 富文本标签
 */

// ============================================================================
// 类型定义
// ============================================================================

/** 支持的 TMP 标签类型 */
export type TMPTagType =
  // 文本样式
  | 'b' | 'i' | 'u' | 's' | 'strikethrough'
  // 颜色透明
  | 'color' | 'alpha' | 'mark'
  // 尺寸位置
  | 'size' | 'voffset' | 'pos' | 'rotate'
  // 间距缩进
  | 'cspace' | 'mspace' | 'space' | 'indent' | 'line-indent' | 'margin'
  // 行高对齐
  | 'line-height' | 'align' | 'width'
  // 大小写
  | 'lowercase' | 'uppercase' | 'allcaps' | 'smallcaps'
  // 上下标
  | 'sub' | 'sup'
  // 其他
  | 'nobr' | 'noparse' | 'br' | 'page' | 'link'
  // 保留原始文本的标签
  | 'font' | 'gradient' | 'sprite' | 'style'
  // font-weight 特殊处理
  | 'font-weight';

/** 解析后的 TMP 标签信息 */
export interface TMPTag {
  type: TMPTagType;
  from: number;        // 整个区域起始位置
  to: number;          // 整个区域结束位置
  openFrom: number;    // 开始标签起始
  openTo: number;      // 开始标签结束
  closeFrom: number;   // 闭合标签起始
  closeTo: number;     // 闭合标签结束
  value?: string;      // 标签属性值
  isSelfClosing: boolean; // 是否自闭合标签
}

/** 原始匹配的标签信息 */
interface RawTag {
  type: string;
  from: number;
  to: number;
  isClosing: boolean;
  value?: string;
}

// ============================================================================
// 常量定义
// ============================================================================

/** 自闭合标签列表 */
const SELF_CLOSING_TAGS = new Set(['br', 'page', 'space']);

/** 需要保留原始文本的标签列表 */
export const PASSTHROUGH_TAGS = new Set(['font', 'gradient', 'sprite', 'style']);



/** 所有支持的标签 */
const ALL_TAGS = [
  'b', 'i', 'u', 's', 'strikethrough',
  'color', 'alpha', 'mark',
  'size', 'voffset', 'pos', 'rotate',
  'cspace', 'mspace', 'space', 'indent', 'line-indent', 'margin',
  'line-height', 'align', 'width',
  'lowercase', 'uppercase', 'allcaps', 'smallcaps',
  'sub', 'sup',
  'nobr', 'noparse', 'br', 'page', 'link',
  'font', 'gradient', 'sprite', 'style', 'font-weight'
];

// ============================================================================
// 正则表达式
// ============================================================================

/**
 * 匹配单个 TMP 标签的正则表达式
 * 支持格式:
 * - <tag>              简单标签
 * - <tag=value>        带等号值
 * - <tag="value">      带引号值
 * - </tag>             闭合标签
 */
const TAG_PATTERN = new RegExp(
  `<(\\/?)(${ALL_TAGS.join('|')})(?:=(?:"([^"]*)"|([^>]*)))?\\s*>`,
  'gi'
);

// ============================================================================
// 解析函数
// ============================================================================

/**
 * 解析文本中的所有 TMP 标签
 * @param text 输入文本
 * @returns 解析后的标签数组
 */
export function parseTMPTags(text: string): TMPTag[] {
  const rawTags: RawTag[] = [];

  // 重置正则表达式状态
  TAG_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = TAG_PATTERN.exec(text)) !== null) {
    const [fullMatch, slash, tagName, quotedValue, unquotedValue] = match;
    const type = tagName.toLowerCase();

    rawTags.push({
      type,
      from: match.index,
      to: match.index + fullMatch.length,
      isClosing: slash === '/',
      value: quotedValue ?? unquotedValue ?? undefined
    });
  }

  // 匹配开闭标签
  return matchTags(rawTags);
}

/**
 * 将原始标签匹配成开闭对
 */
function matchTags(rawTags: RawTag[]): TMPTag[] {
  const result: TMPTag[] = [];
  const stack: Map<string, RawTag[]> = new Map();

  for (const tag of rawTags) {
    // 处理自闭合标签
    if (SELF_CLOSING_TAGS.has(tag.type) && !tag.isClosing) {
      result.push({
        type: tag.type as TMPTagType,
        from: tag.from,
        to: tag.to,
        openFrom: tag.from,
        openTo: tag.to,
        closeFrom: tag.from,
        closeTo: tag.to,
        value: tag.value,
        isSelfClosing: true
      });
      continue;
    }

    if (!tag.isClosing) {
      // 开始标签：压入栈
      if (!stack.has(tag.type)) {
        stack.set(tag.type, []);
      }
      stack.get(tag.type)!.push(tag);
    } else {
      // 闭合标签：从栈中弹出匹配的开始标签
      const openTags = stack.get(tag.type);
      if (openTags && openTags.length > 0) {
        const openTag = openTags.pop()!;
        result.push({
          type: tag.type as TMPTagType,
          from: openTag.from,
          to: tag.to,
          openFrom: openTag.from,
          openTo: openTag.to,
          closeFrom: tag.from,
          closeTo: tag.to,
          value: openTag.value,
          isSelfClosing: false
        });
      }
      // 如果没有匹配的开始标签，忽略这个闭合标签
    }
  }

  // 按起始位置排序
  result.sort((a, b) => a.from - b.from);

  return result;
}

/**
 * 检查位置是否在某个标签区域内
 * @param pos 光标位置
 * @param tags 标签数组
 * @returns 包含该位置的标签，如果没有则返回 undefined
 */
export function findTagAtPosition(pos: number, tags: TMPTag[]): TMPTag | undefined {
  return tags.find(tag => pos >= tag.from && pos <= tag.to);
}

/**
 * 检查位置是否在任意标签区域内
 */
export function isPositionInTag(pos: number, tags: TMPTag[]): boolean {
  return findTagAtPosition(pos, tags) !== undefined;
}

/**
 * 获取标签应用的 CSS 样式
 */
export function getTagStyle(tag: TMPTag): React.CSSProperties {
  const style: React.CSSProperties = {};

  switch (tag.type) {
    case 'b':
      style.fontWeight = 'bold';
      break;
    case 'i':
      style.fontStyle = 'italic';
      break;
    case 'u':
      style.textDecoration = 'underline';
      break;
    case 's':
    case 'strikethrough':
      style.textDecoration = 'line-through';
      break;
    case 'color':
      if (tag.value) {
        style.color = tag.value.startsWith('#') ? tag.value : `#${tag.value}`;
      }
      break;
    case 'alpha':
      if (tag.value) {
        // TMP alpha 格式: #XX (00-FF)
        const alpha = parseInt(tag.value.replace('#', ''), 16) / 255;
        style.opacity = alpha;
      }
      break;
    case 'mark':
      if (tag.value) {
        style.backgroundColor = tag.value.startsWith('#') ? tag.value : `#${tag.value}`;
      } else {
        style.backgroundColor = 'yellow';
      }
      break;
    case 'size':
      if (tag.value) {
        // 支持百分比和绝对值
        const val = tag.value;
        if (val.endsWith('%')) {
          style.fontSize = val;
        } else if (val.endsWith('em')) {
          style.fontSize = val;
        } else {
          style.fontSize = `${parseFloat(val)}px`;
        }
      }
      break;
    case 'sub':
      style.verticalAlign = 'sub';
      style.fontSize = '0.75em';
      break;
    case 'sup':
      style.verticalAlign = 'super';
      style.fontSize = '0.75em';
      break;
    case 'lowercase':
      style.textTransform = 'lowercase';
      break;
    case 'uppercase':
    case 'allcaps':
      style.textTransform = 'uppercase';
      break;
    case 'smallcaps':
      style.fontVariant = 'small-caps';
      break;
    case 'cspace':
      if (tag.value) {
        style.letterSpacing = `${parseFloat(tag.value)}px`;
      }
      break;
    case 'mspace':
      if (tag.value) {
        style.fontFamily = 'monospace';
        style.letterSpacing = `${parseFloat(tag.value)}px`;
      }
      break;
    case 'rotate':
      if (tag.value) {
        style.display = 'inline-block';
        style.transform = `rotate(${tag.value}deg)`;
      }
      break;
    case 'voffset':
      if (tag.value) {
        style.verticalAlign = `${parseFloat(tag.value)}px`;
      }
      break;
    case 'nobr':
      style.whiteSpace = 'nowrap';
      break;
    case 'align':
      if (tag.value) {
        style.textAlign = tag.value as React.CSSProperties['textAlign'];
        style.display = 'block';
      }
      break;
    case 'indent':
    case 'line-indent':
      if (tag.value) {
        style.paddingLeft = `${parseFloat(tag.value)}px`;
      }
      break;
    case 'margin':
      if (tag.value) {
        style.marginLeft = `${parseFloat(tag.value)}px`;
        style.marginRight = `${parseFloat(tag.value)}px`;
      }
      break;
    case 'line-height':
      if (tag.value) {
        const val = tag.value;
        if (val.endsWith('%')) {
          style.lineHeight = parseFloat(val) / 100;
        } else if (val.endsWith('em')) {
          style.lineHeight = val;
        } else {
          style.lineHeight = `${parseFloat(val)}px`;
        }
      }
      break;
    case 'width':
      if (tag.value) {
        style.display = 'inline-block';
        const val = tag.value;
        if (val.endsWith('%')) {
          style.width = val;
        } else {
          style.width = `${parseFloat(val)}px`;
        }
      }
      break;
    case 'font-weight':
      if (tag.value) {
        style.fontWeight = parseInt(tag.value, 10) as React.CSSProperties['fontWeight'];
      }
      break;
    // link, noparse, br, page, pos 等不需要样式处理
  }

  return style;
}
