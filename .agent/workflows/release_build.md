---
description: 自动发版与构建流程：版本管理、Tag推送、GitHub Action触发及本地构建
---

1. **确定版本号**
   - 检查用户是否在指令中指定了版本号。
   - **如果指定了**：使用该版本号。
   - **如果没有指定**：
     1. 读取 `package.json` 中的 `version` 字段。
     2. 将版本号的 Patch 位（最后一位）+1。
     3. *示例：0.0.1 -> 0.0.2*

2. **更新项目版本**
   使用 npm 命令更新版本号（不自动打 tag，由后续步骤控制）。
   *注意：将 `<VERSION>` 替换为第一步确定的实际版本号*
   `npm version <VERSION> --no-git-tag-version`

3. **提交版本变更并打标签**
   这将触发 GitHub Action 自动构建 Windows 和 Mac 包。
   *注意：将 `<VERSION>` 替换为实际版本号*
   ```powershell
   git add package.json package-lock.json
   git commit -m "chore(release): bump version to <VERSION>"
   git tag v<VERSION>
   git push origin main
   git push origin v<VERSION>
   ```

4. **执行本地构建 (Windows)**
   运行本地构建脚本生成当前平台的安装包。
   > [!IMPORTANT]
   > Windows 构建通常需要管理员权限。
   
   `powershell -ExecutionPolicy Bypass -File .\local_build.ps1`
