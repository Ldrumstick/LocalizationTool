# 游戏本地化编辑工具 - 项目上下文

> 本文档记录项目的核心上下文信息，包括背景、技术决策、约束条件和开发注意事项。
> 
> **重要性**: ⭐⭐⭐⭐⭐ 新成员加入或 AI 协作时必读

---

## 项目背景

### 问题域
游戏本地化工作通常涉及：
- 管理大量翻译内容（10000+ 条目）
- 多个 CSV 文件协同工作
- 需要频繁编辑和检索
- 需要严格的数据规范（Key 值唯一性、格式合法性）

### 现有方案的痛点
- **Excel**: 性能差，打开大文件卡顿；不支持全局唯一性检查
- **普通文本编辑器**: 缺乏表格编辑功能，易出错
- **专业工具**: 价格昂贵，功能冗余，学习成本高

### 我们的解决方案
开发一款**轻量级、高性能、专注于 CSV 编辑的本地化工具**：
- ✅ 流畅处理 50000+ 条目
- ✅ Excel 式编辑体验
- ✅ 全局 Key 值管理
- ✅ Unity TextMeshPro 富文本支持
- ✅ 强大的搜索替换功能

---

## 核心技术决策

### 1. 为什么选择 Electron？

**决策**: 使用 Electron 而非 Tauri

**理由**:
- 更成熟的生态系统和社区支持
- 丰富的 Node.js 库（CSV 解析、编码检测等）
- 更好的跨平台一致性
- 开发团队对 JavaScript/TypeScript 更熟悉

**权衡**:
- ❌ 安装包较大（~100MB）
- ✅ 但开发效率更高，稳定性更好

---

### 2. 为什么选择 React？

**决策**: React 而非 Vue 或 Svelte

**理由**:
- 虚拟滚动库（`react-window`）生态更成熟
- CodeMirror 6 的 React 集成更完善
- 团队经验丰富

---

### 3. 为什么选择 CodeMirror 6？

**决策**: 富文本编辑器使用 CodeMirror 6

**理由**:
- **Typora 式交互需求**: 光标在标签内显示源码，离开显示样式
- **性能卓越**: 专为代码编辑优化，处理大文本无压力
- **装饰器系统**: 完美支持焦点切换渲染模式

**备选方案**:
- ❌ Draft.js: 过于重型，维护不活跃
- ❌ Slate.js: 学习曲线陡峭，需要大量自定义
- ❌ 双输入框方案: 用户体验差

---

### 4. 为什么选择 Zustand？

**决策**: 状态管理使用 Zustand 而非 Redux

**理由**:
- 轻量级（1KB）
- API 简洁，学习成本低
- 内置 TypeScript 支持
- 适合中小型应用

---

### 5. 虚拟滚动方案

**决策**: 使用 `react-window`

**理由**:
- 专为大数据列表优化
- API 简单易用
- 性能经过验证（支持 100k+ 行）

**性能目标**:
- 初始渲染 50000 行 < 2 秒
- 滚动帧率 > 60 FPS

---

### 6. CSV 解析库

**决策**: 使用 `papaparse`

**理由**:
- 严格遵循 RFC 4180 标准
- 正确处理引号、换行符、逗号等特殊字符
- 支持流式解析（可扩展到超大文件）

---

## 核心约束与规范

### 1. Key 值规范

**规则**: Key 值只能包含大写字母、数字、下划线

```regex
^[A-Z0-9_]+$
```

**示例**:
- ✅ `DIALOG_001`
- ✅ `ITEM_SWORD_LEGENDARY_2`
- ❌ `dialog-001` (含小写字母)
- ❌ `Item.Sword` (含点号)

**唯一性**: 全局唯一（跨所有文件）

---

### 2. CSV 格式规范

**标准**: 严格遵循 RFC 4180

**关键点**:
1. 第一行为表头
2. 第一列为 Key 值
3. 字段包含逗号或换行时必须用双引号包裹
4. 双引号转义：`"He said ""Hello"""`

---

### 3. 编码处理

**原则**: 自动检测 + 原样保存

**流程**:
1. 打开文件时使用 `chardet` 检测编码
2. 使用 `iconv-lite` 解码
3. 保存时使用**原编码格式**写入

**支持的编码**:
- UTF-8（推荐）
- GBK / GB2312
- UTF-16 LE/BE

---

### 4. 文件监控策略

**问题**: 文件可能在外部被修改（如 Git 同步、Excel 打开）

**解决方案**:
1. 使用 `chokidar` 实时监控
2. 检测到变更时弹出提示
3. 提供选项：
   - 重新加载（丢弃本地修改）
   - 保留本地（忽略外部变更）
   - 合并（自动或手动）

**注意**: 保存时暂停监控，避免误报

---

## 性能考虑

### 1. 大数据处理

**目标**: 流畅处理 50000+ 条目

**策略**:
- ✅ 虚拟滚动（仅渲染可见区域）
- ✅ 懒加载（按需加载文件内容）
- ✅ 分块读取大文件（每次 5000 行）
- ✅ Web Worker 执行搜索（不阻塞 UI）

---

### 2. 编辑响应

**目标**: 编辑操作响应时间 < 100ms

**策略**:
- 单元格编辑防抖（100ms）
- Key 值验证防抖（500ms）
- 批量操作分帧执行（`requestIdleCallback`）

---

### 3. 内存管理

**策略**:
- 不一次性加载所有文件
- 只保留当前打开文件和最近访问的 3 个文件
- 定期清理未使用的缓存

---

## 开发注意事项

### 1. IPC 通信安全

⚠️ **安全风险**: Electron 渲染进程不能直接访问 Node.js API

**正确做法**:
```typescript
// preload.ts
contextBridge.exposeInMainWorld('electronAPI', {
  openProject: (path) => ipcRenderer.invoke('project:open', path)
});

// 渲染进程
window.electronAPI.openProject(folderPath);
```

**错误做法**:
```typescript
// ❌ 渲染进程直接使用 fs
import fs from 'fs'; // 安全风险！
```

---

### 2. 路径处理

⚠️ **路径遍历攻击风险**

**防御措施**:
```typescript
import path from 'path';

const validatePath = (projectPath, filePath) => {
  const resolved = path.resolve(filePath);
  return resolved.startsWith(path.resolve(projectPath));
};
```

---

### 3. Undo/Redo 实现

**注意**: 每个操作必须是**纯函数**

**正确做法**:
```typescript
// 使用 immer 保证不可变性
const newState = produce(state, draft => {
  draft.rows[0].cells[0] = 'new value';
});
```

**错误做法**:
```typescript
// ❌ 直接修改状态
state.rows[0].cells[0] = 'new value'; // 破坏历史栈！
```

---

### 4. 正则表达式缓存

**性能优化**: 避免重复编译正则表达式

```typescript
// ✅ 缓存正则表达式
const regexCache = new Map<string, RegExp>();

const getRegex = (pattern: string) => {
  if (!regexCache.has(pattern)) {
    regexCache.set(pattern, new RegExp(pattern, 'g'));
  }
  return regexCache.get(pattern)!;
};
```

---

## 常见问题与解决方案

### Q1: 大文件加载卡顿怎么办？

**原因**: 一次性解析整个文件

**解决方案**:
1. 使用流式解析（`papaparse` 支持）
2. 分批加载（每次 5000 行）
3. 显示加载进度条

---

### Q2: 搜索 50000 行很慢？

**解决方案**:
1. 使用 Web Worker 执行搜索
2. 分批返回结果（每次 100 条）
3. 正则表达式缓存

---

### Q3: 文件保存后编码乱码？

**原因**: 没有使用原编码格式保存

**检查清单**:
- ✅ 保存时读取 `fileInfo.encoding`
- ✅ 使用 `iconv-lite.encode(content, encoding)`
- ✅ 写入二进制 Buffer，不是字符串

---

### Q4: Undo/Redo 无效？

**常见原因**:
1. 直接修改状态（未使用 `immer`）
2. 操作未推入历史栈
3. 异步操作时序问题

**调试方法**:
```typescript
console.log('Past:', history.past.length);
console.log('Future:', history.future.length);
```

---

## 扩展性设计

### 预留扩展点

1. **插件系统**（v2.0）
   - 自定义验证规则
   - 自定义 Tab 面板
   - 自定义导出格式

2. **多语言值验证**（v1.5）
   - 占位符一致性检查
   - 字符长度限制
   - 特殊字符检查

3. **版本控制集成**（v2.0）
   - Git 状态显示
   - Diff 可视化
   - 冲突解决工具

---

## 开发环境

### 必需软件
- Node.js >= 18.x
- npm >= 9.x
- Git

### 推荐工具
- VS Code
- ESLint / Prettier 插件
- Git 图形化工具（如 GitKraken）

### 快速启动
```bash
npm install
npm run dev
```

---

## 团队协作

### 分支策略
- `main`: 生产分支
- `develop`: 开发分支
- `feature/*`: 功能分支
- `hotfix/*`: 紧急修复

### Commit 规范
```
feat: 添加富文本编辑器
fix: 修复 Key 值重复检测
docs: 更新技术文档
refactor: 重构文件管理模块
test: 添加单元测试
```

---

## 项目里程碑

### v1.0 - MVP（最小可行产品）
- [x] 基础表格编辑
- [x] 文件加载/保存
- [x] 原生应用菜单 (File/Edit/View)
- [x] 快捷键支持 (Ctrl+S 保存, Ctrl+O 打开项目)
- [x] 自动保存 (30s 周期)
- [x] Key 值验证
- [x] 搜索替换

### v1.5 - 增强版
- [x] 富文本编辑器（CodeMirror 6）
- [x] 填充柄功能 (含自动填充选项)
- [ ] 文件监控与冲突解决
- [ ] 性能优化（50000+ 行）

### v2.0 - 专业版
- [ ] 插件系统
- [ ] 版本控制集成
- [ ] 多语言值验证
- [ ] 导出功能（JSON, XML）

---

**文档维护者**: 开发团队  
**最后更新**: 2026-02-04  
**版本**: 1.0
