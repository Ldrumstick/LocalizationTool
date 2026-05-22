# 游戏本地化编辑工具

> 🎮 专为游戏本地化工作设计的高性能 CSV 编辑器

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey.svg)]()
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)]()

---

## 📖 项目简介

游戏本地化编辑工具是一款**轻量级、高性能**的 CSV 编辑器，专为游戏本地化团队打造。支持管理大规模翻译内容（50000+ 条目），提供 Excel 式编辑体验、全局 Key 值管理、Unity TextMeshPro 富文本支持等强大功能。

### ✨ 核心特性

- 🚀 **高性能**: 流畅处理 50000+ 条目，虚拟滚动优化
- 📊 **Excel 式编辑**: 支持复制粘贴、填充柄、批量操作
- 🔍 **强大搜索**: 全局搜索替换，支持正则表达式
- ✅ **Key 值管理**: 自动检测重复和非法 Key，全局唯一性保证
- 🎨 **富文本支持**: Unity TextMeshPro 标签编辑，类似 Typora 的体验
- 📁 **多文件协同**: 支持同时管理多个 CSV 文件
- 🔄 **文件监控**: 检测外部变更，智能冲突解决
- 🔔 **应用更新**: 启动自动检查更新，支持忽略版本、手动检查、从 GitHub 下载并自动安装
- ⏮️ **完整历史**: 支持单元格编辑、批量填充、复制粘贴、行列操作（含复制行）、全部替换的撤销重做
- 🌍 **跨平台**: 支持 Windows, macOS

---

## 🎯 适用场景

- 游戏文本本地化管理
- 多语言翻译内容编辑
- 大规模 CSV 数据整理
- Unity 项目文本资源管理

---

## 🛠️ 技术栈

- **框架**: Electron 28+
- **前端**: React 18 + TypeScript
- **构建工具**: Vite 5
- **状态管理**: Zustand
- **富文本编辑**: CodeMirror 6
- **虚拟滚动**: react-window
- **CSV 解析**: PapaParse (RFC 4180 兼容)

---

## 📦 快速开始

### 环境要求

- Node.js >= 18.x
- npm >= 9.x

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建应用

```bash
# Windows
npm run build:win

# macOS
npm run build:mac
```

---

## 📂 项目结构

```
localization-tool/
├── electron/              # Electron 主进程
│   ├── main.ts           # 主进程入口
│   ├── preload.ts        # 预加载脚本
│   └── ipc/              # IPC 处理器
├── src/                  # React 前端
│   ├── components/       # UI 组件
│   │   ├── FileList/     # 左侧工作面板内的文件列表
│   │   ├── Editor/       # 编辑主区域
│   │   └── FunctionPanel/ # 左侧工作面板内的查找与校验功能
│   ├── stores/           # Zustand 状态管理
│   ├── hooks/            # 自定义 Hooks
│   └── utils/            # 工具函数
├── contexts/             # 项目上下文文档
├── specs/                # 技术规范文档
└── design.md             # 设计文档
```

---

## 🎨 界面布局

```
┌────┬────────────────┬──────────────────────────────────────┐
│图标│ 当前工作面板   │              编辑区域                │
│栏  │                │                                      │
│📄  │ ┌────────────┐ │   ┌──────────────────────────────┐   │
│🔍  │ │ 项目文件 / │ │   │          表格编辑器           │   │
│✓   │ │ 查找 / 校验 │ │   │          (虚拟滚动)          │   │
│    │ │ 单面板显示 │ │   └──────────────────────────────┘   │
│    │ └────────────┘ │   ┌──────────────────────────────┐   │
│    │                │   │        富文本编辑器           │   │
│    │                │   │        (CodeMirror 6)        │   │
│    │                │   └──────────────────────────────┘   │
└────┴────────────────┴──────────────────────────────────────┘
```

最左侧图标栏始终保留；点击文件、查找或校验图标会展开并单独显示对应面板。当前面板已展开时，再次点击已选中的图标会折叠为仅图标栏；图标栏底部按钮或 `Ctrl/Cmd + B` 也可在“仅图标栏”和“图标栏 + 当前面板”之间切换。

---

## 🔑 核心功能说明

### 1. 左侧工作面板：文件列表

- **打开项目**: 选择文件夹，自动扫描 CSV 文件
- **启动恢复**: 再次启动应用时，默认自动打开上次使用的项目，并优先恢复上次选中的文件
- **文件状态**: 未保存文件显示 `*` 标记
- **编辑态脏标记**: 单元格/表头/富文本在编辑中但尚未失焦时，也会即时显示未保存状态
- **忽略文件**: 右键菜单可忽略文件，文件将被隐藏且不参与全局操作
- **管理忽略**: 提供 "显示已忽略文件" 开关，开启后可查看并还原文件
- **面板切换与最小化**: 左侧图标栏可切换文件、查找、校验单一面板；再次点击已选中图标、点击底部折叠按钮或使用 `Ctrl/Cmd + B` 可折叠或恢复当前面板

### 2. 编辑区域

#### 表格编辑器
- 双击单元格进入编辑
- `Enter` 键跳转下一行，`Tab` 键移动到右侧
- 支持复制粘贴、批量插入/删除
- 支持从 Excel / TSV 复制多格内容后按单元格粘贴到表格，带引号、Tab、换行的单元格内容也会正确解析
- 填充柄拖动：数字递增或纯复制 (支持填充选项菜单切换)
- 非法 Key 自动标红

#### 富文本编辑器
- 选中单元格时显示内容
- 支持 Unity TextMeshPro 富文本标签
- 编辑中可直接保存当前输入，无需先点到其他位置触发失焦
- 富文本编辑框保持焦点连续输入时，表格中的当前单元格也会即时刷新预览
- 右侧编辑区会显示当前打开文件的文本格式（编码 / BOM / 换行风格）
- 颜色选择器默认以 `HEX` 模式打开；如果切换为 `RGB` / `HSL`，下次打开会记住上次使用的模式
- **Typora 式体验**:
  - 光标在标签内：显示源码 `<color=#FF0000>文本</color>`
  - 光标离开：只显示样式化内容

### 3. 左侧工作面板：查找与校验

#### 查找与替换
- 全局搜索或单文件搜索
- 支持正则表达式（语法与 VSCode 一致）
- 搜索结果列表显示更醒目的行号与命中列，且行号与编辑器左侧行号栏保持一致，点击可跳转到对应位置
- 点击搜索结果跳转时会自动结束当前单元格/富文本编辑态，避免旧输入框与富文本编辑器残留焦点
- 编辑内容后搜索结果会动态刷新，并尽量保持当前列表滚动位置，避免刷新后跳回顶部
- 编辑中的当前单元格会按临时输入值即时预览到搜索结果，无需先点回搜索面板触发刷新
- 保存文件不会触发无意义的搜索结果重刷，当前浏览位置会继续保持
- 支持逐个替换或全部替换

#### Key 值有效性检查
- **规则**: 只能包含大写字母、数字、下划线
- **全局唯一性**: 跨文件检测重复
- 非法 Key 列表展示，点击跳转
- Tab 按钮显示非法数量角标

---

## ⚙️ 配置说明

### CSV 编码

工具会自动检测文件编码（UTF-8, GBK, UTF-16 等）、BOM 与换行风格（CRLF / LF / CR）。读取时兼容纯 `CRLF` / `LF` / `CR` 以及引号外混用的换行分隔；保存时按打开文件时分析出的文本格式写回，避免把 `UTF-8 with BOM` 改成 `UTF-8` 或把 `LF` 改成 `CRLF`。

### 文件监控

实时监控外部文件变更，检测到修改时提供以下选项：
- 重新加载（丢弃本地修改）
- 保留本地（忽略外部变更）
- 合并（自动或手动）

### 应用更新

- 启动后自动检查新版本（仅打包版本生效）
- 检测到新版本时弹出更新窗口，可选择：
  - 更新并安装（从 GitHub Releases 下载，完成后自动安装）
  - 忽略此版本（该版本不再自动提醒）
  - 稍后处理
- 可从顶部菜单 `Help -> Check for Updates...` 手动打开更新窗口，查看当前版本和最新版本并执行更新

### 启动恢复

- 应用会记住上次成功打开的项目路径
- 再次启动时会自动重新加载该项目
- 若上次选中过具体文件，会优先恢复到该文件
- 若项目目录已不存在，会自动清除过期记忆，避免每次启动反复报错

### Key 值规则

```regex
^[A-Z0-9_]+$
```

**示例**:
- ✅ `DIALOG_001`
- ✅ `ITEM_SWORD_2`
- ❌ `dialog-001` (含小写字母)
- ❌ `Item.Sword` (含点号)

---

## ⌨️ 快捷键

<!-- shortcuts-table:start -->
| Shortcut | Action | Scope |
| --- | --- | --- |
| `Ctrl/Cmd + O` | Open project | Global (native menu) |
| `Ctrl/Cmd + S` | Save all files | Global (native menu) |
| `Ctrl/Cmd + Z` | Undo | Global |
| `Ctrl/Cmd + Shift + Z` | Redo | Global |
| `Ctrl/Cmd + Y` | Redo | Global |
| `Ctrl/Cmd + B` | Toggle left workspace panel | Global (non-editing) |
| `Ctrl/Cmd + F` | Focus search input | Global / Search panel |
| `Ctrl/Cmd + H` | Focus replace input | Global / Search panel |
| `F3` | Next search result | Search panel |
| `Shift + F3` | Previous search result | Search panel |
| `Alt + C` | Toggle case sensitivity | Search panel |
| `Alt + R` | Toggle regex mode | Search panel |
| `Ctrl/Cmd + Alt + Enter` | Replace all | Search panel |
| `Ctrl/Cmd + C` | Copy selected cell/range | Grid |
| `Ctrl/Cmd + V` | Paste into selected cell/range | Grid |
| `F2` | Enter append edit mode | Grid |
| `Enter` | Move selection to next row | Grid (non-editing) |
| `Tab` | Move selection to next column | Grid (non-editing) |
| `Shift + Tab` | Move selection to previous column | Grid (non-editing) |
| `Arrow Up/Down/Left/Right` | Cell navigation | Grid (non-editing) |
<!-- shortcuts-table:end -->

---

## 📚 相关文档

- [设计文档](design.md) - 产品需求和界面设计
- [技术规范](specs/technical-specification.md) - 技术架构和实现细节
- [项目上下文](contexts/context.md) - 核心决策和注意事项
- [实施计划](implementation-plan.md) - 开发路线图

---

## 🐛 故障排查

### 问题：大文件加载卡顿

**解决方案**:
1. 检查文件大小，建议单文件 < 10MB
2. 启用分批加载（配置项：`BATCH_LOAD_SIZE`）

### 问题：保存后文件乱码

**检查清单**:
- 确认原始文件编码是否正确检测
- 查看开发者工具控制台是否有编码错误

### 问题：Undo/Redo 无效

**常见原因**:
- 操作未正确记录到历史栈
- 异步操作时序问题

---

## 🤝 贡献指南

欢迎贡献！请遵循以下步骤：

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: 添加某个功能'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 提交 Pull Request

### Commit 规范

使用约定式提交（Conventional Commits）：

```
feat: 添加新功能
fix: 修复 Bug
docs: 更新文档
style: 代码格式调整
refactor: 重构代码
test: 添加测试
chore: 构建/工具链更新
```

---

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

---

## 🙏 致谢

感谢以下开源项目：

- [Electron](https://www.electronjs.org/)
- [React](https://react.dev/)
- [CodeMirror](https://codemirror.net/)
- [PapaParse](https://www.papaparse.com/)
- [react-window](https://react-window.vercel.app/)

---

## 📧 联系方式

如有问题或建议，请通过以下方式联系：

- 提交 Issue: [GitHub Issues](#)
- 邮箱: [your-email@example.com]

---

**开发团队** | 2026  
让游戏本地化更简单 🎮✨

### CSV 换行兼容性
- 读取 CSV 时兼容 `\r\n`、`\n`、`\r` 三种行结束符。
- 当外部工具把部分记录改成不同换行风格时，主进程会仅在引号外统一记录分隔符后再解析，避免下一行 Key 被串到上一行最后一个字段中。
