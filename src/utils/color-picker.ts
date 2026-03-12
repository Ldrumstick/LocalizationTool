export type ColorPickerMode = 'hex' | 'rgb' | 'hsl';

const COLOR_PICKER_MODE_STORAGE_KEY = 'richtext-color-picker-mode';

export const DEFAULT_COLOR_PICKER_MODE: ColorPickerMode = 'hex';
export const DEFAULT_COLOR_PICKER_HEX = '#000000';

type RGBColor = {
    r: number;
    g: number;
    b: number;
};

type HSLColor = {
    h: number;
    s: number;
    l: number;
};

type HSVColor = {
    h: number;
    s: number;
    v: number;
};

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function getLocalStorage(): Storage | null {
    try {
        if (typeof window === 'undefined') return null;
        return window.localStorage;
    } catch {
        return null;
    }
}

export function getStoredColorPickerMode(): ColorPickerMode {
    const storage = getLocalStorage();
    const rawValue = storage?.getItem(COLOR_PICKER_MODE_STORAGE_KEY);
    if (rawValue === 'hex' || rawValue === 'rgb' || rawValue === 'hsl') {
        return rawValue;
    }

    return DEFAULT_COLOR_PICKER_MODE;
}

export function setStoredColorPickerMode(mode: ColorPickerMode): void {
    const storage = getLocalStorage();
    storage?.setItem(COLOR_PICKER_MODE_STORAGE_KEY, mode);
}

export function normalizeHexColor(value: string): string | null {
    const normalized = value.trim().replace(/^#/, '');
    if (!normalized) return null;

    const expanded = normalized.length === 3
        ? normalized.split('').map((char) => `${char}${char}`).join('')
        : normalized;

    if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
        return null;
    }

    return `#${expanded.toUpperCase()}`;
}

export function rgbToHex(r: number, g: number, b: number): string {
    const channels = [r, g, b].map((value) => {
        const clamped = clamp(Math.round(value), 0, 255);
        return clamped.toString(16).padStart(2, '0').toUpperCase();
    });

    return `#${channels.join('')}`;
}

export function hexToRgb(hex: string): RGBColor {
    const normalized = normalizeHexColor(hex) || DEFAULT_COLOR_PICKER_HEX;
    return {
        r: parseInt(normalized.slice(1, 3), 16),
        g: parseInt(normalized.slice(3, 5), 16),
        b: parseInt(normalized.slice(5, 7), 16)
    };
}

export function rgbToHsl(r: number, g: number, b: number): HSLColor {
    const red = clamp(r, 0, 255) / 255;
    const green = clamp(g, 0, 255) / 255;
    const blue = clamp(b, 0, 255) / 255;

    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;

    let h = 0;
    const l = (max + min) / 2;
    const s = delta === 0 ? 0 : delta / (1 - Math.abs((2 * l) - 1));

    if (delta !== 0) {
        switch (max) {
            case red:
                h = 60 * (((green - blue) / delta) % 6);
                break;
            case green:
                h = 60 * (((blue - red) / delta) + 2);
                break;
            default:
                h = 60 * (((red - green) / delta) + 4);
                break;
        }
    }

    return {
        h: Math.round((h + 360) % 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100)
    };
}

export function hslToRgb(h: number, s: number, l: number): RGBColor {
    const hue = ((h % 360) + 360) % 360;
    const saturation = clamp(s, 0, 100) / 100;
    const lightness = clamp(l, 0, 100) / 100;

    const chroma = (1 - Math.abs((2 * lightness) - 1)) * saturation;
    const segment = hue / 60;
    const x = chroma * (1 - Math.abs((segment % 2) - 1));
    const m = lightness - (chroma / 2);

    let red = 0;
    let green = 0;
    let blue = 0;

    if (segment >= 0 && segment < 1) {
        red = chroma;
        green = x;
    } else if (segment < 2) {
        red = x;
        green = chroma;
    } else if (segment < 3) {
        green = chroma;
        blue = x;
    } else if (segment < 4) {
        green = x;
        blue = chroma;
    } else if (segment < 5) {
        red = x;
        blue = chroma;
    } else {
        red = chroma;
        blue = x;
    }

    return {
        r: Math.round((red + m) * 255),
        g: Math.round((green + m) * 255),
        b: Math.round((blue + m) * 255)
    };
}

export function rgbToHsv(r: number, g: number, b: number): HSVColor {
    const red = clamp(r, 0, 255) / 255;
    const green = clamp(g, 0, 255) / 255;
    const blue = clamp(b, 0, 255) / 255;

    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;

    let h = 0;
    const s = max === 0 ? 0 : delta / max;
    const v = max;

    if (delta !== 0) {
        switch (max) {
            case red:
                h = 60 * (((green - blue) / delta) % 6);
                break;
            case green:
                h = 60 * (((blue - red) / delta) + 2);
                break;
            default:
                h = 60 * (((red - green) / delta) + 4);
                break;
        }
    }

    return {
        h: Math.round((h + 360) % 360),
        s: Math.round(s * 100),
        v: Math.round(v * 100)
    };
}

export function hsvToRgb(h: number, s: number, v: number): RGBColor {
    const hue = ((h % 360) + 360) % 360;
    const saturation = clamp(s, 0, 100) / 100;
    const value = clamp(v, 0, 100) / 100;

    const chroma = value * saturation;
    const segment = hue / 60;
    const x = chroma * (1 - Math.abs((segment % 2) - 1));
    const m = value - chroma;

    let red = 0;
    let green = 0;
    let blue = 0;

    if (segment >= 0 && segment < 1) {
        red = chroma;
        green = x;
    } else if (segment < 2) {
        red = x;
        green = chroma;
    } else if (segment < 3) {
        green = chroma;
        blue = x;
    } else if (segment < 4) {
        green = x;
        blue = chroma;
    } else if (segment < 5) {
        red = x;
        blue = chroma;
    } else {
        red = chroma;
        blue = x;
    }

    return {
        r: Math.round((red + m) * 255),
        g: Math.round((green + m) * 255),
        b: Math.round((blue + m) * 255)
    };
}
