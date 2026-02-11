# AGENTS.md

本文件是本仓库内 AI/自动化协作代理的执行规则。目标是：在不破坏现有行为的前提下，稳定迭代功能并保持文档同步。

## 1. 项目概览

- 项目类型：Electron + React + TypeScript 桌面应用
- 目标场景：游戏本地化 CSV 编辑（大数据量、富文本、全局检索、Key 校验）
- 主要入口：
  - 主进程：`electron/main.ts`
  - 预加载：`electron/preload.ts`
  - 渲染入口：`src/main.tsx`
  - 根组件：`src/App.tsx`
- 新增能力（已落地）：应用自动更新（`electron/update-service.ts` + `electron-updater`）

## 2. 架构与职责边界

### 2.1 主进程（`electron/`）

- 负责：
  - 文件系统读写、编码处理（`iconv-lite`）
  - 文件监控（`chokidar`）
  - 搜索 IPC（普通 + 流式）
  - 应用更新检查/下载/安装（`electron-updater`）
  - 原生菜单与应用生命周期
- 原则：
  - 不在渲染进程直接访问 Node 文件系统能力
  - 所有主进程能力通过 IPC 暴露

### 2.2 预加载层（`electron/preload.ts`）

- 负责对外暴露 `window.electronAPI`
- 新增/修改 IPC 时必须同步：
  - `contextBridge.exposeInMainWorld`
  - `ElectronAPI` 类型定义
  - 渲染层调用点

### 2.3 渲染层（`src/`）

- 状态管理：`zustand`（`src/stores/*`）
- 服务层：`src/services/*`（调用 `window.electronAPI`）
- UI 组件：`src/components/*`
- 关键约束：
  - Key 规则：`^[A-Z0-9_]+$`
  - 大数据表格渲染优先使用虚拟列表方案
  - 搜索支持流式返回与增量渲染

## 3. 开发与验证命令

- 安装：`npm install`
- 开发：`npm run dev`
- 类型检查：`npx tsc --noEmit`
- 单测：`npm run test:unit -- --runInBand`
- 全量测试：`npm test`
- 构建：`npm run build`
- Windows 打包：`npm run build:win`

在涉及主流程改动（IPC、store、搜索、保存、更新）时，至少执行：
- `npx tsc --noEmit`
- `npm run test:unit -- --runInBand`

## 4. 文档优先级与同步规则

功能或架构有变化时，需同步更新下列文档（按适用范围）：

- 功能清单：`FeatureTracker.md`
- 架构上下文：`contexts/context.md`
- 技术规范：`specs/technical-specification.md`
- 用户说明：`README.md`
- 计划状态：`implementation-plan.md`

规则：
- 改了用户可见行为 -> 必更 `README.md`
- 改了主进程/IPC/架构 -> 必更 `contexts/context.md` 或 `specs/technical-specification.md`
- 完成了可交付功能点 -> 必更 `FeatureTracker.md`

## 5. 代码风格与文本规范

- 默认语言：
  - 面向用户与团队的注释、日志、文档使用中文
  - 代码标识符保持英文
- 文件编码：
  - 统一 UTF-8（避免注释乱码）
  - 修改后若出现乱码，优先修复文本，不改业务逻辑
- 改动风格：
  - 小步修改、最小影响面
  - 不做无关重构
  - 优先复用现有服务/状态流

## 6. 提交与变更管理

- 提交信息遵循 Conventional Commits：
  - `feat|fix|refactor|docs|chore: 中文描述`
- 提交前检查：
  - 确认未误纳入构建产物与大体积文件
  - 确认文档已同步

### 6.1 构建产物处理（重要）

仓库当前常见产物目录：
- `dist-renderer/`
- `dist-release/`
- `dist-release-2/`

默认不应提交上述目录内容，除非用户明确要求提交发布产物。

## 7. 高风险操作约束

- 禁止执行破坏性命令（如 `git reset --hard`、`git checkout --`）除非用户明确要求
- 不得回滚用户未授权的现有改动
- 若发现工作区有非本次任务相关变更，先说明并隔离本次提交范围

## 8. 针对本项目的实现偏好

- 搜索相关改动：
  - 优先保持“流式 + 虚拟列表 + 脏文件优先”策略
- 更新相关改动：
  - 保持 `electron/update-service.ts` 作为单一更新状态来源
  - 菜单入口与弹窗状态通过 IPC 事件联动
- 保存相关改动：
  - 注意 `updateLastSaveTime` 与 watcher 自触发问题

## 9. 代理执行清单（每次任务结束前）

1. 确认改动仅覆盖需求范围
2. 跑类型检查/必要测试
3. 核对是否需要更新文档
4. 检查是否误包含构建产物
5. 给出变更摘要与后续建议（如有）
