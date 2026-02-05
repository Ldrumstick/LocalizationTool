import { ProjectData, ValidationError } from '../types';

/**
 * 验证服务
 * 提供全项目 Key 值格式校验与重复性检测
 */
import { ProjectData, ValidationError } from '../types';

/**
 * 验证服务 (Real-time Validation)
 * 基于 Backend Indexing + Frontend Dirty Data 进行全项目实时校验
 */
export const validatorService = {
  /**
   * 执行全项目验证
   */
  validateProject(projectData: ProjectData): ValidationError[] {
    const errors: ValidationError[] = [];
    const keyMap = new Map<string, { fileId: string; rowIndex: number }[]>();
    const KEY_PATTERN = /^[A-Z0-9_]+$/;

    // 获取所有文件的 ID 集合 (包括已加载和索引中的)
    const allFileIds = new Set<string>();
    if (projectData.keyIndex) {
      Object.keys(projectData.keyIndex).forEach(id => allFileIds.add(id));
    }
    Object.keys(projectData.files).forEach(id => allFileIds.add(id));

    // 遍历每个文件获取 Keys
    allFileIds.forEach(fileId => {
       // 如果被忽略，跳过
       if (projectData.ignoredFileIds.includes(fileId)) return;
       // 如果在 store 中且被标记 ignore，也跳过
       if (projectData.files[fileId]?.isIgnored) return;

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

          // 检测空值
          if (!key || key.trim() === '') {
            if (loadedFile) { // 仅对已加载文件报详细错误，避免索引脏数据干扰体验? 
              // 暂时策略：都报错，因为空 Key 是严重错误
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

          // 记录查重
          if (!keyMap.has(key)) {
            keyMap.set(key, []);
          }
          keyMap.get(key)!.push({ fileId, rowIndex });
       });
    });

    // 检测重复 Key
    keyMap.forEach((locations, key) => {
      if (locations.length > 1) {
        locations.forEach((loc) => {
          errors.push({
            fileId: loc.fileId,
            rowIndex: loc.rowIndex,
            colIndex: 0,
            message: `重复 Key: "${key}"`,
            type: 'duplicate_key'
          });
        });
      }
    });

    return errors;
  }
};
