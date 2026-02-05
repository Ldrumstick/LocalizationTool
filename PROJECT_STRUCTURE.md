# 项目文件结构

## 已创建的文件和目录

```
LocalizationTool/
├── .vscode/
│   ├── extensions.json          # VS Code 推荐扩展
│   └── settings.json             # VS Code 工作区设置
├── electron/
│   ├── main.ts                   # Electron 主进程入口
│   └── preload.ts                # 预加载脚本（IPC 安全桥接）
├── src/
│   ├── components/
│   │   ├── FileList/
│   │   │   ├── FileList.tsx      # 文件列表组件
│   │   │   └── FileList.css      # 文件列表样式
│   │   ├── Editor/
│   │   │   ├── Editor.tsx        # 编辑器组件
│   │   │   └── Editor.css        # 编辑器样式
│   │   └── FunctionPanel/
│   │       ├── FunctionPanel.tsx # 功能面板组件
│   │       └── FunctionPanel.css # 功能面板样式
│   ├── App.tsx                   # 应用根组件
│   ├── App.css                   # 应用样式
│   ├── main.tsx                  # React 入口
│   └── index.css                 # 全局样式
├── tests/
│   ├── e2e/
│   │   └── app.spec.ts           # E2E 测试示例
│   └── setup.ts                  # Jest 测试环境设置
├── contexts/
│   └── context.md                # 项目核心上下文
├── specs/
│   └── technical-specification.md # 技术规范文档
├── .eslintrc.json                # ESLint 配置
├── .gitignore                    # Git 忽略文件
├── .prettierrc.json              # Prettier 配置
├── design.md                     # 设计文档
├── DEV_SETUP.md                  # 开发环境搭建指南
├── implementation-plan.md        # 实施计划
├── index.html                    # HTML 入口
├── jest.config.js                # Jest 配置
├── package.json                  # 项目配置和依赖
├── playwright.config.ts          # Playwright 配置
├── README.md                     # 项目说明
├── tsconfig.json                 # TypeScript 配置
├── tsconfig.node.json            # Vite TypeScript 配置
└── vite.config.ts                # Vite 构建配置
```

## 核心配置文件说明

### package.json
- 定义了所有依赖包
- 配置了开发、构建、测试脚本
- 设置了 Electron Builder 打包配置

### tsconfig.json
- TypeScript 编译器配置
- 启用严格模式
- 配置路径别名（@/ 和 @electron/）

### vite.config.ts
- Vite 构建工具配置
- React 插件集成
- 路径别名解析

### jest.config.js
- Jest 测试框架配置
- 覆盖率阈值设置（70%）
- 测试文件匹配规则

### playwright.config.ts
- E2E 测试配置
- 浏览器设备配置
- Web 服务器自动启动

## 组件结构

### 三列布局
1. **FileList** - 文件列表（左侧）
2. **Editor** - 编辑区域（中间）
3. **FunctionPanel** - 功能面板（右侧）

## 下一步开发任务

参考 `implementation-plan.md` 中的第二阶段任务：
- 实现文件管理模块
- 实现表格编辑模块
- 实现 Key 值验证模块
