# 游戏本地化编辑工具 - 开发环境搭建指南

## 环境要求

- Node.js >= 18.0.0
- npm >= 9.0.0

## 安装步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

应用将在 `http://localhost:5173` 启动。

### 3. 运行测试

```bash
# 运行所有测试
npm test

# 运行单元测试
npm run test:unit

# 运行 E2E 测试
npm run test:e2e

# 查看测试覆盖率
npm run test:coverage
```

### 4. 代码检查

```bash
# ESLint 检查
npm run lint

# 自动修复
npm run lint:fix

# 代码格式化
npm run format
```

## 项目结构

```
localization-tool/
├── electron/              # Electron 主进程
│   ├── main.ts           # 主进程入口
│   └── preload.ts        # 预加载脚本
├── src/                  # React 前端
│   ├── components/       # UI 组件
│   │   ├── FileList/     # 文件列表
│   │   ├── Editor/       # 编辑区域
│   │   └── FunctionPanel/ # 功能面板
│   ├── App.tsx           # 应用根组件
│   └── main.tsx          # React 入口
├── tests/                # 测试文件
│   ├── e2e/              # E2E 测试
│   └── setup.ts          # 测试环境设置
├── package.json          # 项目配置
├── tsconfig.json         # TypeScript 配置
├── vite.config.ts        # Vite 配置
└── jest.config.js        # Jest 配置
```

## 开发流程

1. 创建功能分支
2. 编写代码
3. 运行测试确保通过
4. 提交代码（遵循 Conventional Commits 规范）
5. 创建 Pull Request

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run build:win` | 构建 Windows 安装包 |
| `npm run build:mac` | 构建 macOS 安装包 |
| `npm test` | 运行所有测试 |
| `npm run lint` | 代码检查 |
| `npm run format` | 代码格式化 |

## 故障排查

### 问题：依赖安装失败

**解决方案**:
```bash
# 清除缓存
npm cache clean --force

# 删除 node_modules 和 package-lock.json
rm -rf node_modules package-lock.json

# 重新安装
npm install
```

### 问题：端口被占用

**解决方案**:
修改 `vite.config.ts` 中的端口号。

### 配置说明

#### 原生应用菜单
应用提供了原生菜单栏功能：
- **File**: Open Project (Ctrl+O), Save All (Ctrl+S), Quit
- **Edit**: Undo, Redo, Cut, Copy, Paste, Delete, Select All
- **View**: Reload, Force Reload, Toggle DevTools, Zoom, Toggle Fullscreen

菜单实现位于 `electron/main.ts`，通过 IPC 与渲染进程通信。

#### 自动保存
默认开启 30 秒周期自动保存，实现位于 `src/hooks/use-auto-save.ts`。

## 下一步

开发环境搭建完成后，请参考：
- [实施计划](implementation-plan.md) - 开发路线图
- [技术规范](specs/technical-specification.md) - 技术细节
- [项目上下文](contexts/context.md) - 核心决策
