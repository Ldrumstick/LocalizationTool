# AGENT.md

本文件是面向读取 `AGENT.md` 的协作代理说明，适用范围为整个仓库。若与历史设计文档冲突，以当前源码实现为准；若与 `AGENTS.md` 冲突，以两者中更严格的约束执行，并在后续任务中保持同步。

## 1. 项目现状

- 项目类型：Electron + React + TypeScript 桌面应用
- 目标场景：游戏本地化 CSV 编辑，强调大数据量、搜索替换、Key 校验、富文本与稳定保存
- 当前已落地能力：
  - 项目根目录 CSV 扫描与懒加载
  - 原编码读取/保存（`chardet` + `iconv-lite`）
  - 搜索 IPC、流式搜索、结果虚拟列表
  - 脏文件本地优先搜索
  - Key 格式校验与按分组范围查重
  - Undo/Redo、批量替换、填充、复制行列等编辑操作
  - 外部文件变更监听与冲突提示
  - 自动保存
  - 应用自动更新（GitHub Releases + `electron-updater`）

## 2. 真实入口与职责

### 2.1 主进程 `electron/`

- [electron/main.ts](/G:/LocalizationTool/electron/main.ts)
  - 创建窗口与原生菜单
  - 注册项目打开、文件读写、搜索、索引、配置、更新相关 IPC
- [electron/file-utils.ts](/G:/LocalizationTool/electron/file-utils.ts)
  - 扫描根目录 CSV
  - 构建稳定文件 ID
  - 编码检测、CSV 解析、引号外记录分隔符标准化兼容
- [electron/watcher.ts](/G:/LocalizationTool/electron/watcher.ts)
  - `chokidar` 监听项目根目录
  - 保存后 1 秒内忽略自触发
  - 500ms 防抖后通知渲染层
- [electron/update-service.ts](/G:/LocalizationTool/electron/update-service.ts)
  - 统一维护更新状态
  - 管理检查、下载、安装、忽略版本与错误提示

### 2.2 预加载层

- [electron/preload.ts](/G:/LocalizationTool/electron/preload.ts)
  - 通过 `window.electronAPI` 暴露所有 Electron 能力
  - 变更 IPC 时必须同步更新：
    - `contextBridge.exposeInMainWorld`
    - `ElectronAPI` 类型
    - 渲染层 service/调用点

### 2.3 渲染层

- [src/main.tsx](/G:/LocalizationTool/src/main.tsx)：React 入口
- [src/App.tsx](/G:/LocalizationTool/src/App.tsx)
  - 三列布局装配
  - 菜单事件绑定
  - 全局快捷键注册
  - 更新弹窗状态接线
- `src/stores/`
  - [src/stores/project-store.ts](/G:/LocalizationTool/src/stores/project-store.ts)：项目数据、文件内容、历史感知编辑动作、分组、忽略文件、索引、外部变更同步
  - [src/stores/editor-store.ts](/G:/LocalizationTool/src/stores/editor-store.ts)：UI 选择态、搜索态、面板态、编辑器引用
  - [src/stores/history-store.ts](/G:/LocalizationTool/src/stores/history-store.ts)：Undo/Redo 历史栈
- `src/services/`
  - [src/services/file-service.ts](/G:/LocalizationTool/src/services/file-service.ts)：打开项目、读取文件、CSV 序列化保存、批量保存
  - [src/services/search-service.ts](/G:/LocalizationTool/src/services/search-service.ts)：普通搜索、流式搜索、替换
  - [src/services/validator-service.ts](/G:/LocalizationTool/src/services/validator-service.ts)：Key 格式与重复校验
  - [src/services/config-service.ts](/G:/LocalizationTool/src/services/config-service.ts)：项目配置读写
  - [src/services/shortcut-service.ts](/G:/LocalizationTool/src/services/shortcut-service.ts)：快捷键注册与优先级
- `src/components/`
  - `FileList`：文件列表、分组、忽略、脏标识
  - `Editor/*`：虚拟表格、内联编辑、富文本编辑、工具栏、右键菜单、行头
  - `FunctionPanel`：查找替换、虚拟化结果、校验结果
  - `FileMonitor`：外部修改通知与冲突弹窗
  - `UpdateModal`：更新弹窗

## 3. 本项目的关键实现约束

### 3.1 文件与 ID

- 文件 ID 必须继续使用“项目相对路径 base64”，不要回退到绝对路径。
- 配置加载要兼容旧 ID；当前兼容逻辑在 `file-service.normalizeConfigIds`。
- 当前只扫描项目根目录下的 `.csv`，不要默认扩展为递归扫描，除非用户明确要求并同步文档。

### 3.2 CSV 读取与保存

- 第一行视为表头，第一列视为 Key。
- 读取时先按检测编码解码，再仅对引号外记录分隔符做标准化后以固定 `\n` 解析，兼容 `CRLF`、`LF`、`CR` 混用且不改写引号内多行文本。
- 保存时维持原编码写回。
- 保存路径必须保留：
  - `Papa.unparse(..., { newline: '\r\n' })`
  - 末尾补一个 trailing newline
  - 主进程调用 `updateLastSaveTime(filePath)`，避免 watcher 自触发

### 3.3 搜索

- 当前搜索链路是“渲染层脏文件本地搜索 + 主进程流式搜索补全”。
- `FunctionPanel` 会先在已加载且 `isDirty` 的文件里本地搜索，再把这些文件排除出后端搜索。
- 主进程搜索通过 `project:search-stream:*` 分块推送；不要改回一次性返回大结果集。
- 搜索结果列表已经做虚拟化和分页缓存，性能优化优先延续这条路径。

### 3.4 校验与编辑历史

- Key 规则固定为 `^[A-Z0-9_]+$`。
- 重复 Key 是“按分组作用域查重”，未分组文件共享一个默认作用域。
- 用户可见编辑优先走 `project-store` 中带历史记录的方法：
  - `updateCell`
  - `batchUpdateCells`
  - `insertRows/deleteRows`
  - `insertColumns/deleteColumns`
  - `duplicateRows`
- 不要直接用 `updateFile` 替代这些动作，否则会绕过 Undo/Redo。

### 3.5 更新与监听

- 更新状态的单一来源是 [electron/update-service.ts](/G:/LocalizationTool/electron/update-service.ts)，不要在多个位置各自维护更新状态机。
- 菜单入口、更新弹窗、IPC 事件必须保持联动。
- 文件监听策略目前是：
  - 仅监听项目根目录
  - clean 文件自动重载
  - dirty 文件弹冲突框

## 4. 文档与代码同步规则

- 改了用户可见行为：更新 [README.md](/G:/LocalizationTool/README.md)
- 改了主进程、IPC、存储结构、更新机制：更新 [contexts/context.md](/G:/LocalizationTool/contexts/context.md) 或 [specs/technical-specification.md](/G:/LocalizationTool/specs/technical-specification.md)
- 完成了可交付功能点：更新 [FeatureTracker.md](/G:/LocalizationTool/FeatureTracker.md)
- 涉及阶段计划或里程碑状态：更新 [implementation-plan.md](/G:/LocalizationTool/implementation-plan.md)

说明：
- 现有部分历史文档与当前代码不完全一致，修改功能时应优先修正文档，而不是继续复制旧表述。

## 5. 开发命令

- 安装依赖：`npm install`
- 开发模式：`npm run dev`
- 类型检查：`npx tsc --noEmit`
- 单元测试：`npm run test:unit -- --runInBand`
- 全量测试：`npm test`
- 构建：`npm run build`
- Windows 打包：`npm run build:win`

默认验证基线：

- 文档改动：至少检查目标文件内容和 `git diff`
- 涉及主流程改动（IPC、store、搜索、保存、更新）：必须跑
  - `npx tsc --noEmit`
  - `npm run test:unit -- --runInBand`

## 6. 代理执行偏好

- 注释、日志、文档默认使用中文；标识符保持英文。
- 采用小步修改，避免无关重构。
- 优先复用现有 store/service，不要平行新建第二套状态流。
- 搜索、diff、排查时默认排除：
  - `dist-renderer/`
  - `dist-release/`
  - `dist-release-2/`
  - `dist-electron/`
- 默认不要提交构建产物，除非用户明确要求。
- 禁止执行破坏性 git 命令，禁止回滚用户未授权改动。

## 7. 任务结束前检查

1. 改动是否只覆盖需求范围
2. 是否运行了对应级别的验证
3. 是否需要同步更新文档
4. 是否误包含构建产物或大文件
5. 输出变更摘要、验证结论和未覆盖风险
