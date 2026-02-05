import { test, expect } from '@playwright/test';

test.describe('应用启动测试', () => {
    test('应用应该成功启动', async ({ page }) => {
        await page.goto('http://localhost:5173');

        // 验证页面标题
        await expect(page).toHaveTitle(/游戏本地化编辑工具/);

        // 验证三列布局存在
        await expect(page.locator('.file-list-panel')).toBeVisible();
        await expect(page.locator('.editor-panel')).toBeVisible();
        await expect(page.locator('.function-panel')).toBeVisible();
    });
});
