# 文件分组与作用域校验 (File Grouping & Scoped Validation)

## 1. 需求背景
目前工具强制要求**全项目 Key 值唯一**。用户希望将文件进行分组，**Key 的唯一性约束仅在组内生效**。这意味着不同组的文件可以拥有相同的 Key，互不冲突。

## 2. 数据结构设计

### 2.1 新增 Group 定义
在 `ProjectData` 中增加 `groups` 字段：

```typescript
interface FileGroup {
  id: string;
  name: string;
  color?: string; // 可选：组的标识颜色
  fileIds: string[];
}

interface ProjectData {
  // ... existing fields
  groups: Record<string, FileGroup>; 
}
```

### 2.2 文件归属
- 一个文件只能属于一个组（或不属于任何组）。
- **默认组 (Default/Ungrouped)**: 所有未分配组的文件自动视为"默认组"，它们之间仍然保持 Key 唯一性检查（或者选择互不检查，需确认）。
  - *建议方案*: 未分组的文件，视为都在 "Global" 组，彼此之间检查重复。

## 3. 校验逻辑变更 (`validator-service.ts`)

### 旧逻辑
- 收集全项目所有 Key -> 查重即报错。

### 新逻辑
- 以 **Group** 为单位进行校验。
- 遍历所有 Group (包括虚拟的 "Ungrouped"):
  - 收集该组内所有文件的 Key。
  - 仅在该组内部查重。
- **跨组不报错**: Group A 的 `KEY_1` 和 Group B 的 `KEY_1` 被视为合法。

## 4. 界面交互 (UI)

### 4.1 文件列表 (File List)
- **分组展示**: 文件列表不再是扁平结构，而是按组折叠/展开。
  - `v Group A`
    - `file1.csv`
    - `file2.csv`
  - `> Group B`
  - `file3.csv` (未分组)

### 4.2 组管理操作
- **创建组**: 文件列表顶部/右键菜单 -> "新建分组"。
- **移动文件**: 
  - 拖拽文件到组容器中。
  - 右键文件 -> "移动到组..." -> 选择组名。
- **重命名/删除组**: 右键点击组名。
  - 删除组时，组内文件自动变为"未分组"。

### 4.3 校验面板
- 错误信息需要带上组信息，例如："重复 Key (Group A): KEY_1"。

## 5. 实现计划

### Step 1: 数据层改造
1. 修改 `types/index.ts`，添加 `FileGroup` 接口。
2. 修改 `ProjectStore`，添加 `addGroup`, `removeGroup`, `addFileToGroup`, `removeFileFromGroup` 等 Action。

### Step 2: 校验逻辑升级
1. 重构 `validator-service.ts`，实现基于 Group 的查重算法。

### Step 3: UI 升级
1. 改造 `FileList` 组件，支持渲染分组结构。
2. 实现分组的增删改查交互。

### Step 4: 持久化 (Persistence)
- **配置文件**: 在项目根目录下创建 `.localization.config.json`。
- **内容结构**:
  ```json
  {
    "ignoredFileIds": ["file_id_1", "file_id_2"],
    "groups": {
      "group_id_1": {
        "id": "group_id_1",
        "name": "UI Text",
        "fileIds": ["file_a.csv", "file_b.csv"]
      }
    }
  }
  ```
- **读写时机**:
  - **Open Project**: 扫描 CSV 后，尝试读取配置文件并应用到 Store。
  - **Save Config**: 当分组或忽略文件发生变更时，自动写入该文件。
- **废弃**: 移除 `ignoredFileIds` 在 `localStorage` 中的持久化。
