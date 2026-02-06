---

## trigger: always_on

# 🚀 Workspace Rules

## 1. 🔍 深度分析与规约 (Pre-Work)

- **设计优先**: 在分析需求或生成 Implementation Plan 前，**必须**先阅读以下文件（如果存在）：
  - [./Design.md](cci:7://file:///g:/LocalizationTool/Design.md:0:0-0:0)
  - [./contexts/context.md](cci:7://file:///g:/LocalizationTool/contexts/context.md:0:0-0:0)
  - `./specs/*.md`
  确保方案符合项目架构和技术决策。
- **明确边界**: 遇到未定义的需求或边界情况，**必须优先提问**，禁止基于猜测开发。

## 2. 🧪 同步测试与验证 (Execution)

- **测试同步**: 遵循 TDD，在编码时同步编写测试：
  - 业务逻辑：使用 `Jest` 编写单元测试（通常在 `./tests/` 或同级 `__tests__` 目录）。
  - UI 流程：使用 `Playwright` 编写 E2E 测试。
- **自我验证**: 交付前运行相关测试，确保无回归。

## 3. 📝 文档与进度追踪 (Post-Work)

- **更新追踪**: 任务完成后，**必须**更新项目根目录下的进度文档（推荐路径：`./FeatureTracker.md` 或 `./docs/FeatureTracker.md`）及 [./task.md](cci:7://file:///C:/Users/LCT/.gemini/antigravity/brain/13bd40d2-cdb4-4dbe-a2ec-4879ec45aac8/task.md:0:0-0:0)。
- **文档维护**: 若修改了核心逻辑，同步更新 [./Design.md](cci:7://file:///g:/LocalizationTool/Design.md:0:0-0:0)。
- **路径规范**: 在所有文档、计划和沟通中，**统一使用相对路径**（Project Root Relative），例如 `./src/components/Editor`，禁止使用绝对路径，以保证跨环境兼容性。

