/**
 * Toggle 列辅助函数
 * 用于检测布尔类型列和处理值切换
 */

import { CSVRow } from '../types';

// 布尔值模式
const BOOLEAN_VALUES = new Set(['0', '1', 'true', 'false', 'TRUE', 'FALSE']);

/**
 * 自动检测哪些列是布尔列
 * @param rows 数据行
 * @param headers 表头
 * @returns 布尔列索引数组
 */
export function detectBooleanColumns(rows: CSVRow[], headers: string[]): number[] {
    const boolColumns: number[] = [];

    for (let colIndex = 0; colIndex < headers.length; colIndex++) {
        let allBoolean = true;
        let hasValue = false;

        for (const row of rows) {
            const value = row.cells[colIndex]?.trim();
            if (!value) continue; // 忽略空值

            hasValue = true;
            if (!BOOLEAN_VALUES.has(value)) {
                allBoolean = false;
                break;
            }
        }

        // 至少有一个非空值，且所有非空值都是布尔格式
        if (hasValue && allBoolean) {
            boolColumns.push(colIndex);
        }
    }

    return boolColumns;
}

/**
 * 判断值是否为真值
 */
export function isTruthyValue(value: string): boolean {
    const v = value?.trim()?.toLowerCase();
    return v === '1' || v === 'true';
}

/**
 * 判断值是否为布尔格式（包括空值）
 */
export function isBooleanValue(value: string): boolean {
    if (!value || value.trim() === '') return true; // 空值也视为有效（默认 false）
    return BOOLEAN_VALUES.has(value.trim());
}

/**
 * 切换布尔值，保持原始格式
 * @param value 当前值
 * @param preferredTrue 如果当前是空值，期望切换成的真值（默认 '1'）
 */
export function toggleBooleanValue(value: string, preferredTrue: string = '1'): string {
    const v = value?.trim();
    if (!v) return preferredTrue; // 空 -> true

    switch (v) {
        case '0': return '1';
        case '1': return '0';
        case 'true': return 'false';
        case 'false': return 'true';
        case 'TRUE': return 'FALSE';
        case 'FALSE': return 'TRUE';
        default: return value; // 非布尔值不变
    }
}
