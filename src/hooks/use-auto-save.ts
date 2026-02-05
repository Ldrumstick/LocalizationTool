import { useEffect, useRef } from 'react';
import { useProjectStore } from '../stores/project-store';
import { fileService } from '../services/file-service';

/**
 * 自动保存 Hook
 * 定期检查并保存所有 dirty files
 */
export const useAutoSave = (intervalMs = 30000) => {
  const files = useProjectStore((state) => state.files);
  // 使用 useRef 避免 interval 闭包问题，或者直接依赖 files 变化重置 timer (频繁)
  // 这里选择简单定时器，每次执行时获取最新 state (通过 fileService 读取 store 是安全的，或者直接在 effect 中读取)
  
  // 由于我们无法在 useEffect 外部方便地直接访问 store 的最新值而不触发重渲染，
  // 我们使用 useProjectStore.getState() 在 fileService 内部已经是这样做的。
  // 但为了触发保存，我们只需设置一个定时器。

  useEffect(() => {
    const timer = setInterval(async () => {
      // 检查是否有脏文件
      const currentFiles = useProjectStore.getState().files;
      const hasDirty = Object.values(currentFiles).some(f => f.isDirty);
      
      if (hasDirty) {
        console.log('触发自动保存...');
        try {
          await fileService.saveAllDirtyFiles();
        } catch (e) {
          console.error('自动保存失败', e);
        }
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [intervalMs]);
};
