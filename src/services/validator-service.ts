import { ProjectData, ValidationError } from '../types';

/**
 * 验证服务
 * 提供全项目 Key 值格式校验与重复性检测 (支持分组作用域)
 */
export const validatorService = {
  /**
    * 执行全项目验证
    */
  validateProject(projectData: ProjectData): ValidationError[] {
    const errors: ValidationError[] = [];
    const KEY_PATTERN = /^[A-Z0-9_]+$/;

    // 1. 构建文件到组的映射 (FileID -> GroupID)
    const fileGroupMap = new Map<string, string>();
    const UNGROUPED_ID = '__ungrouped__';

    // 预先填充所有文件默认为 Ungrouped
    const allFileIds = new Set<string>();
    if (projectData.keyIndex) {
      Object.keys(projectData.keyIndex).forEach(id => allFileIds.add(id));
    }
    Object.keys(projectData.files).forEach(id => allFileIds.add(id));

    allFileIds.forEach(id => fileGroupMap.set(id, UNGROUPED_ID));

    // 根据 Group 定义更新映射
    if (projectData.groups) {
      Object.values(projectData.groups).forEach(group => {
        group.fileIds.forEach(fileId => {
          if (allFileIds.has(fileId)) {
            fileGroupMap.set(fileId, group.id);
          }
        });
      });
    }

    // 2. 按组收集 Keys
    // Map<GroupId, Map<Key, Location[]>>
    const groupKeyMaps = new Map<string, Map<string, { fileId: string; rowIndex: number }[]>>();

    allFileIds.forEach(fileId => {
       // 如果被忽略，跳过
       const isIgnoredInStore = projectData.ignoredFileIds && projectData.ignoredFileIds.includes(fileId);
       const isIgnoredInFile = projectData.files[fileId]?.isIgnored;
       
       if (isIgnoredInStore || isIgnoredInFile) return;

       const groupId = fileGroupMap.get(fileId) || UNGROUPED_ID;
       
       // 初始化组 Map
       if (!groupKeyMaps.has(groupId)) {
         groupKeyMaps.set(groupId, new Map());
       }
       const currentGroupMap = groupKeyMaps.get(groupId)!;

       let keys: string[] = [];
       const loadedFile = projectData.files[fileId];

       // 策略：优先使用内存中已加载的最新数据 (Loaded Data)，否则兜底使用索引数据 (Index Data)
       if (loadedFile && loadedFile.rows && loadedFile.rows.length > 0) {
         keys = loadedFile.rows.map(row => row.cells[0] || '');
       } else if (projectData.keyIndex && projectData.keyIndex[fileId]) {
         keys = projectData.keyIndex[fileId];
       }

       keys.forEach((key, rowIndex) => {
          const colIndex = 0;

          // 检测空值 (空值校验通常是文件级别的，不需要关心组，但为了统一流程放在这里)
          if (!key || key.trim() === '') {
            if (loadedFile) { 
               errors.push({
                fileId,
                rowIndex,
                colIndex,
                message: 'Key 不能为空',
                type: 'empty_value'
              });
            }
            return;
          }

          // 检测格式
          if (!KEY_PATTERN.test(key)) {
            errors.push({
              fileId,
              rowIndex,
              colIndex,
              message: `Key 格式错误: "${key}"`,
              type: 'invalid_key'
            });
          }

          // 记录用于查重
          if (!currentGroupMap.has(key)) {
            currentGroupMap.set(key, []);
          }
          currentGroupMap.get(key)!.push({ fileId, rowIndex });
       });
    });

    // 3. 检测重复 Key (组内)
    groupKeyMaps.forEach((keyMap, groupId) => {
      // 获取友好组名用于显示 (可选)
      // const groupName = groupId === UNGROUPED_ID ? '未分组' : (projectData.groups[groupId]?.name || '未知组');

      keyMap.forEach((locations, key) => {
        if (locations.length > 1) {
          locations.forEach((loc) => {
            errors.push({
              fileId: loc.fileId,
              rowIndex: loc.rowIndex,
              colIndex: 0,
              message: `重复 Key: "${key}"`, // 暂时不显示组名，保持消息简洁，因为用户能看到文件在同一个组
              type: 'duplicate_key'
            });
          });
        }
      });
    });

    return errors;
  }
};
