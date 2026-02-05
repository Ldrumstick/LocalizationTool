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
- ⏮️ **完整历史**: 所有操作支持 Undo/Redo
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
│   │   ├── FileList/     # 文件列表（第一列）
│   │   ├── Editor/       # 编辑区域（第二列）
│   │   └── FunctionPanel/ # 功能面板（第三列）
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
┌─────────────┬──────────────────────────┬─────────────────┐
│  文件列表   │      编辑区域            │   功能面板      │
│             │                          │                 │
│  • CSV文件  │   ┌───────────────────┐  │  • 查找替换     │
│  • 状态标识 │   │   表格编辑器      │  │  • Key值检查    │
│  • 忽略管理 │   │   (虚拟滚动)      │  │  • 扩展功能     │
│             │   └───────────────────┘  │                 │
│             │   ┌───────────────────┐  │                 │
│             │   │ 富文本编辑器      │  │                 │
│             │   │ (CodeMirror 6)    │  │                 │
│             │   └───────────────────┘  │                 │
└─────────────┴──────────────────────────┴─────────────────┘
```

---

## 🔑 核心功能说明

### 1. 文件列表（第一列）

- **打开项目**: 选择文件夹，自动扫描 CSV 文件
- **文件状态**: 未保存文件显示 `*` 标记
- **忽略文件**: 右键菜单可忽略文件，文件将被隐藏且不参与全局操作
- **管理忽略**: 提供 "显示已忽略文件" 开关，开启后可查看并还原文件

### 2. 编辑区域（第二列）

#### 表格编辑器
- 双击单元格进入编辑
- `Enter` 键跳转下一行，`Tab` 键移动到右侧
- 支持复制粘贴、批量插入/删除
- 填充柄拖动：数字递增或纯复制 (支持填充选项菜单切换)
- 非法 Key 自动标红

#### 富文本编辑器
- 选中单元格时显示内容
- 支持 Unity TextMeshPro 富文本标签
- **Typora 式体验**:
  - 光标在标签内：显示源码 `<color=#FF0000>文本</color>`
  - 光标离开：只显示样式化内容

### 3. 功能面板（第三列）

#### 查找与替换
- 全局搜索或单文件搜索
- 支持正则表达式（语法与 VSCode 一致）
- 搜索结果列表，点击跳转到对应位置
- 支持逐个替换或全部替换

#### Key 值有效性检查
- **规则**: 只能包含大写字母、数字、下划线
- **全局唯一性**: 跨文件检测重复
- 非法 Key 列表展示，点击跳转
- Tab 按钮显示非法数量角标

---

## ⚙️ 配置说明

### CSV 编码

工具会自动检测文件编码（UTF-8, GBK, UTF-16 等），保存时使用原编码格式，避免乱码。

### 文件监控

实时监控外部文件变更，检测到修改时提供以下选项：
- 重新加载（丢弃本地修改）
- 保留本地（忽略外部变更）
- 合并（自动或手动）

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

| 快捷键 | 功能 |
|--------|------|
| `Ctrl/Cmd + S` | 保存文件 |
| `Ctrl/Cmd + Z` | 撤销 |
| `Ctrl/Cmd + Shift + Z` | 重做 |
| `Ctrl/Cmd + F` | 查找 |
| `Ctrl/Cmd + H` | 替换 |
| `Ctrl/Cmd + C` | 复制 |
| `Ctrl/Cmd + V` | 粘贴 |
| `Enter` | 下一行 |
| `Tab` | 右移一格 |
| `方向键` | 移动聚焦 |

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
