Undo/Redo 系统设计规范
1. 概述
本系统旨在为游戏本地化工具提供完整的撤销（Undo）和重做（Redo）功能。系统需要支持所有破坏性的数据修改操作，并保证操作的原子性和数据的一致性。

2. 核心架构
鉴于项目已经使用 zustand 和 immer，我们将利用 Command Pattern（命令模式）结合 immer 的 patches 功能（或手动状态快照）来实现历史记录管理。

考虑到性能（50000+ 行数据），全量快照（Snapshots）不可行。必须使用增量记录（Patches / Deltas）。

2.1 存储结构
建议在 src/stores/ 下新建 history-store.ts 或在 project-store.ts 中扩展 HistorySlice。

数据结构定义:

typescript
// 历史记录项类型
export interface HistoryEntry {
  id: string; //用于唯一标识操作
  timestamp: number;
  description: string; // 用于 UI 显示，如 "编辑单元格", "删除行"
  fileId: string; // 关联的文件 ID
  
  // 核心：执行撤销和重做的操作
  // 方案 A: 使用 Inverse Patches (Immer) - 适合精细操作
  // patches?: Patch[]; 
  // inversePatches?: Patch[];
  // 方案 B: 使用命令对象 - 更灵活，易于处理复杂业务逻辑（如行增删）
  undo: () => void;
  redo: () => void;
  
  // 考虑到持久化和序列化（如果需要），存储数据负载（Payload）而非函数可能更好
  // 但为了快速开发，Zustand Store 中存储函数也是可行的。
  // 为了稳健性，推荐存储数据负载 + 操作类型
  type: HistoryOperationType;
  payload: any;
}
export enum HistoryOperationType {
  CELL_EDIT = 'CELL_EDIT',
  ROW_INSERT = 'ROW_INSERT',
  ROW_DELETE = 'ROW_DELETE',
  COL_INSERT = 'COL_INSERT',
  COL_DELETE = 'COL_DELETE',
  PASTE = 'PASTE',
  FILL = 'FILL'
}
export interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
  
  // Actions
  undo: () => void;
  redo: () => void;
  pushEntry: (entry: HistoryEntry) => void;
  clear: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}
2.2 作用域
采用 全局历史栈 (Global Stack) 策略，模拟 Excel 的行为。

当执行 Undo/Redo 时，如果受影响的文件当前未被选中，系统应自动跳转/选中该文件，确保用户看到变更。
3. 支持的操作类型
以下操作必须接入历史记录：

操作类型	记录内容 (Payload)	Undo 逻辑	Redo 逻辑
单元格编辑	row, col, oldValue, newValue	恢复 oldValue	恢复 newValue
批量粘贴	startRow, startCol, oldBlockData (被覆盖区域的数据)	恢复 oldBlockData	重新执行粘贴
填充柄	range, oldBlockData	恢复 oldBlockData	重新执行填充
插入行	index, count	删除插入的行	重新插入
删除行	index, deletedRowsData (完整行数据)	重新插入 deletedRowsData	再次删除
插入列	index, count	删除插入的列	重新插入
删除列	index, deletedColsData	重新插入 deletedColsData	再次删除
全部替换	fileId, updates (list of cell updates)	恢复旧值 (Batch Restore)	重新执行替换 (Batch Update)
复制行	fileId, indices	删除复制生成的行	重新生成复制行
4. 实现细节
4.1 集成方式
修改 useProjectStore 中的 Actions，在执行修改前/后构建 HistoryEntry 并推入 HistoryStore。

示例：单元格编辑

typescript
// project-store.ts
updateFile: (fileId, updates) => {
  // 1. 获取变更前状态 (用于 Undo)
  const oldFile = get().files[fileId];
  
  // 2. 执行更新
  set(produce(...));
  
  // 3. 记录历史 (需在 updates 仅包含 cell 变更时处理，或者拆分专门的 setCellValue Action)
  // 建议将 updateFile 拆分为更细粒度的 updateCell(fileId, row, col, value) 以便精确记录
}
重构建议： 为了更清晰地管理历史，建议在 ProjectStore 中增加专门的 executeAction 方法，或者重构现有的 insertRows 等方法，使其内部调用 HistoryStore.pushEntry。

4.2 内存管理
最大栈限制: 限制 past 数组长度为 100。超出时移除最早的记录。
大对象处理: 对于批量操作（如全表粘贴），需要由 HistoryStore 持有数据副本。需注意内存占用。
4.3 交互体验
快捷键: 绑定 Ctrl+Z / Cmd+Z 到 undo()，Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y 到 redo()。
UI 反馈: 触发 Undo/Redo 后，自动定位（Scroll Into View）到变更发生的对应行/列。
5. 验证计划
单元测试: 针对 HistoryStore 的逻辑测试（栈操作、限制长度）。
集成测试: 模拟用户操作序列（编辑 -> 删除 -> Undo -> Redo），验证数据最终一致性。