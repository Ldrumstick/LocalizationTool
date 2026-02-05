
/**
 * Smart Fill Logic
 * 
 * Generates the next set of values based on the source pattern.
 * Supports:
 * 1. Numeric Progression (1, 2 -> 3, 4)
 * 2. Suffix Increment (Item 1, Item 2 -> Item 3, Item 4)
 * 3. Pattern Repeat (A, B -> A, B, A, B)
 * 
 * @param sourceValues The array of values selected by the user to start the fill.
 * @param count The number of new values to generate.
 * @param mode The fill mode: 'auto' (smart detect), 'series' (force series if possible), 'copy' (force copy).
 * @returns An array of generated strings of length `count`.
 */
export function generateFillData(sourceValues: string[], count: number, mode: 'auto' | 'series' | 'copy' = 'auto'): string[] {
    if (sourceValues.length === 0) return Array(count).fill('');
    
    // Explicit Copy Mode
    if (mode === 'copy') {
        const result: string[] = [];
        for (let i = 0; i < count; i++) {
            result.push(sourceValues[i % sourceValues.length]);
        }
        return result;
    }

    // Series / Auto Mode
    // 1. Try to detect a numeric progression
    const progression = detectProgression(sourceValues);
    if (progression) {
        // If mode is 'series', we use progression.
        // If mode is 'auto', we usually prioritize progression for numbers.
        return generateProgression(progression, sourceValues.length, count);
    }
    
    // 2. Fallback: Repeat Pattern (Copy)
    const result: string[] = [];
    for (let i = 0; i < count; i++) {
        result.push(sourceValues[i % sourceValues.length]);
    }
    return result;
}

interface ProgressionPattern {
    prefix: string;
    suffix: string;
    startValue: number;
    step: number; 
    hasNumber: boolean;
    precision: number; // decimal places
    isPadding: boolean; // e.g. 001
    paddingLength: number;
}

function detectProgression(values: string[]): ProgressionPattern | null {
    if (values.length === 0) return null;
    
    // Check if ALL values match the same regex structure: Prefix + Number + Suffix
    // We look for the LAST number in the string to increment (Excel behavior usually)
    // Regex: ^(.*?)(\d+)(\D*)$
    const regex = /^(.*?)(\d+)(\D*)$/;
    
    const parsed = values.map(v => v.match(regex));
    
    // If any does not match, return null (unless it's just a pure non-numeric string? No, simple repeat handled outside)
    if (parsed.some(m => !m)) return null;
    
    const matches = parsed as RegExpMatchArray[];
    
    const firstMatch = matches[0];
    const prefix = firstMatch[1];
    const suffix = firstMatch[3];
    
    // Check if prefix and suffix are identical for ALL items
    // If multiple items, we need to ensure consistency.
    // If only 1 item, we assume step = 1
    
    for (const m of matches) {
        if (m[1] !== prefix || m[3] !== suffix) return null;
    }
    
    // Extract numbers
    const numbers = matches.map(m => parseInt(m[2], 10));
    
    // Padding check
    const rawNumbers = matches.map(m => m[2]);
    const isPadding = rawNumbers.some(s => s.startsWith('0') && s.length > 1);
    const paddingLength = rawNumbers[0].length;
    
    let step = 1;
    let startValue = numbers[0];
    
    if (numbers.length > 1) {
        // Calculate step
        step = numbers[1] - numbers[0];
        // Verify linear progression
        for (let i = 1; i < numbers.length; i++) {
            if (numbers[i] - numbers[i-1] !== step) return null;
        }
    } else {
        // Single item: Default to step 1
        step = 1;
    }
    
    return {
        prefix,
        suffix,
        startValue,
        step,
        hasNumber: true,
        precision: 0, // Integer for now
        isPadding,
        paddingLength
    };
}

function generateProgression(pattern: ProgressionPattern, sourceLength: number, count: number): string[] {
    const result: string[] = [];
    
    // Calculate the last value in the source
    // value = start + (index) * step
    // The previous sequence ended at index = sourceLength - 1
    // We start generating from sourceLength
    
    for (let i = 0; i < count; i++) {
        const index = sourceLength + i;
        const currentVal = pattern.startValue + index * pattern.step;
        
        let numStr = currentVal.toString();
        
        // Apply Padding
        if (pattern.isPadding) {
            while (numStr.length < pattern.paddingLength) {
                numStr = '0' + numStr;
            }
        }
        
        result.push(`${pattern.prefix}${numStr}${pattern.suffix}`);
    }
    
    return result;
}
