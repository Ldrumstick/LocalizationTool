---
description: 自动发版与构建流程：预验证、自动修复、变更日志生成、灵活打标
---

1. **解析需求与模式**
   - **确定模式**：
     - **新版本发版 (默认)**：用户未指定或指定了新版本号。
     - **更新现有标签 (Hotfix)**：用户明确要求“更新标签”、“修复当前版本”或“Hotfix”。
   - **确定版本号**：
     - 如果是 *新版本*：读取 `package.json` 并计算下一版本（如未指定）。
     - 如果是 *Hotfix*：读取当前 `package.json` 的版本（即现有 Tag）。

2. **构建验证与自动修复 (关键步骤)**
   在打标签前，确保代码是健康的。
   1. 执行构建检查：`npm run build`
   2. **如果失败**：
      - 分析错误日志。
      - 修改代码修复错误。
      - 提交修复：`git commit -am "fix: resolve build errors before release"`
      - **循环执行**直到构建成功。

3. **生成变更日志 (Changelog)**
   获取自上一个 Tag 以来的变动，用于 Release Note。
   - 运行：`git log $(git describe --tags --abbrev=0)..HEAD --pretty=format:"- %s (%h)"`
   - 将输出内容保存，作为后续的 `<RELEASE_NOTES>`。

4. **执行发版**
   根据第 1 步确定的模式执行：

   - **场景 A: 新版本发版**
     1. 更新文件版本：`npm version <NEW_VERSION> --no-git-tag-version`
     2. 提交版本变更：`git commit -am "chore(release): bump version to <NEW_VERSION>"`
     3. 创建带注释的标签：
        ```powershell
        git tag -a v<NEW_VERSION> -m "<RELEASE_NOTES>"
        ```
     4. 推送：
        ```powershell
        git push origin main
        git push origin v<NEW_VERSION>
        ```

   - **场景 B: 更新现有标签 (Hotfix)**
     1. 强制更新标签位置到当前 HEAD：
        ```powershell
        git tag -f -a v<CURRENT_VERSION> -m "<RELEASE_NOTES> (Hotfix Update)"
        ```
     2. 强制推送标签：
        ```powershell
        git push origin v<CURRENT_VERSION> --force
        ```

5. **本地构建通知**
   提醒用户手动运行本地构建（由于需要管理员权限）。
   - 提示：`请以管理员身份运行 ./local_build.ps1 以生成本地安装包。`