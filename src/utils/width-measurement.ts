
/**
 * Utility for measuring text width and calculating auto-fit column widths
 */

let canvas: HTMLCanvasElement | null = null;
let context: CanvasRenderingContext2D | null = null;

const DEFAULT_FONT = '14px "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const HEADER_FONT = '600 13px "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const CELL_PADDING = 20; // 10px padding on each side
const MAX_COLUMN_WIDTH = 800; // Maximum allowed width
const MIN_COLUMN_WIDTH = 50;  // Minimum allowed width

/**
 * Get or create a canvas context for measuring text
 */
function getContext(): CanvasRenderingContext2D | null {
    if (!context) {
        canvas = document.createElement('canvas');
        context = canvas.getContext('2d');
    }
    return context;
}

/**
 * Measure the width of a specific text string with a given font
 */
export function measureTextWidth(text: string, font: string = DEFAULT_FONT): number {
    const ctx = getContext();
    if (!ctx) return 0;

    ctx.font = font;
    return ctx.measureText(text || '').width;
}

/**
 * Calculate the best fit width for a column based on its content
 * 
 * @param rows The data rows
 * @param colIndex The column index to measure
 * @param headerText The header text for this column
 * @param sampleSize Number of random rows to sample for performance (default: 50)
 */
export function calculateAutoFitWidth(
    rows: any[],
    colIndex: number,
    headerText: string,
    sampleSize: number = 50
): number {
    // 1. Measure header width
    let maxWidth = measureTextWidth(headerText, HEADER_FONT);

    // 2. Measure first few rows (usually important)
    const scanLimit = Math.min(rows.length, 20);
    for (let i = 0; i < scanLimit; i++) {
        const cellValue = rows[i]?.cells?.[colIndex] || '';
        const width = measureTextWidth(cellValue, DEFAULT_FONT);
        if (width > maxWidth) maxWidth = width;
    }

    // 3. Random sample for the rest if dataset is large
    if (rows.length > scanLimit) {
        // Calculate step to distribute samples somewhat evenly
        const remainingRows = rows.length - scanLimit;
        const actualSamples = Math.min(sampleSize, remainingRows);

        for (let i = 0; i < actualSamples; i++) {
            // Random index between scanLimit and total length
            const randomIndex = scanLimit + Math.floor(Math.random() * remainingRows);
            const cellValue = rows[randomIndex]?.cells?.[colIndex] || '';
            const width = measureTextWidth(cellValue, DEFAULT_FONT);
            if (width > maxWidth) maxWidth = width;
        }
    }

    // 4. Add padding and constrain
    const finalWidth = Math.min(Math.max(maxWidth + CELL_PADDING, MIN_COLUMN_WIDTH), MAX_COLUMN_WIDTH);
    return Math.ceil(finalWidth);
}
