
import { CSVRow } from '../../src/types';
import { detectBooleanColumns, isBooleanValue, isTruthyValue, toggleBooleanValue } from '../../src/utils/toggle-column';

describe('Toggle Column Utils', () => {

    describe('isBooleanValue', () => {
        it('should return true for valid boolean strings', () => {
            expect(isBooleanValue('0')).toBe(true);
            expect(isBooleanValue('1')).toBe(true);
            expect(isBooleanValue('true')).toBe(true);
            expect(isBooleanValue('false')).toBe(true);
            expect(isBooleanValue('TRUE')).toBe(true);
            expect(isBooleanValue('FALSE')).toBe(true);
        });

        it('should return false for invalid strings', () => {
            expect(isBooleanValue('abc')).toBe(false);
            expect(isBooleanValue('12')).toBe(false);
            expect(isBooleanValue('')).toBe(false);
            expect(isBooleanValue(' ')).toBe(false);
        });
    });

    describe('isTruthyValue', () => {
        it('should return true for truthy strings', () => {
            expect(isTruthyValue('1')).toBe(true);
            expect(isTruthyValue('true')).toBe(true);
            expect(isTruthyValue('TRUE')).toBe(true);
        });

        it('should return false for falsy strings', () => {
            expect(isTruthyValue('0')).toBe(false);
            expect(isTruthyValue('false')).toBe(false);
            expect(isTruthyValue('FALSE')).toBe(false);
            expect(isTruthyValue('something else')).toBe(false);
        });
    });

    describe('toggleBooleanValue', () => {
        it('should toggle numeric boolean strings', () => {
            expect(toggleBooleanValue('0')).toBe('1');
            expect(toggleBooleanValue('1')).toBe('0');
        });

        it('should toggle text boolean strings', () => {
            expect(toggleBooleanValue('true')).toBe('false');
            expect(toggleBooleanValue('false')).toBe('true');
        });

        it('should toggle uppercase boolean strings', () => {
            expect(toggleBooleanValue('TRUE')).toBe('FALSE');
            expect(toggleBooleanValue('FALSE')).toBe('TRUE');
        });

        it('should return original value for non-boolean strings', () => {
            expect(toggleBooleanValue('abc')).toBe('abc');
        });
    });

    describe('detectBooleanColumns', () => {
        const headers = ['Key', 'IsTranslated', 'Value', 'Enable'];

        it('should detect boolean columns correctly', () => {
            const rows: CSVRow[] = [
                { rowIndex: 0, cells: ['Key1', '1', 'Val1', 'true'] },
                { rowIndex: 1, cells: ['Key2', '0', 'Val2', 'false'] },
                { rowIndex: 2, cells: ['Key3', '1', 'Val3', 'TRUE'] },
            ];

            const result = detectBooleanColumns(rows, headers);
            // Index 1 (IsTranslated) and 3 (Enable) should be detected
            expect(result).toContain(1);
            expect(result).toContain(3);
            expect(result).not.toContain(0);
            expect(result).not.toContain(2);
        });

        it('should ignore empty values', () => {
            const rows: CSVRow[] = [
                { rowIndex: 0, cells: ['Key1', '1', 'Val1', 'true'] },
                { rowIndex: 1, cells: ['Key2', '', 'Val2', ''] }, // Empty values
                { rowIndex: 2, cells: ['Key3', '0', 'Val3', 'false'] },
            ];

            const result = detectBooleanColumns(rows, headers);
            expect(result).toContain(1);
            expect(result).toContain(3);
        });

        it('should not detect columns with mixed non-boolean values', () => {
            const rows: CSVRow[] = [
                { rowIndex: 0, cells: ['Key1', '1', 'Val1', 'true'] },
                { rowIndex: 1, cells: ['Key2', '2', 'Val2', 'false'] }, // '2' is not boolean
            ];

            const result = detectBooleanColumns(rows, headers);
            expect(result).not.toContain(1);
            expect(result).toContain(3);
        });

        it('should not detect columns that are all empty', () => {
            const rows: CSVRow[] = [
                { rowIndex: 0, cells: ['Key1', '', 'Val1', ''] },
                { rowIndex: 1, cells: ['Key2', '', 'Val2', ''] },
            ];
            const result = detectBooleanColumns(rows, headers);
            expect(result.length).toBe(0);
        });
    });

});
