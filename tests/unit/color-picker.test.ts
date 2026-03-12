import {
  getStoredColorPickerMode,
  hslToRgb,
  hsvToRgb,
  normalizeHexColor,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
  setStoredColorPickerMode
} from '../../src/utils/color-picker';

describe('color-picker utils', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should default to hex mode when no preference is stored', () => {
    expect(getStoredColorPickerMode()).toBe('hex');
  });

  it('should persist the last selected picker mode', () => {
    setStoredColorPickerMode('hsl');
    expect(getStoredColorPickerMode()).toBe('hsl');

    setStoredColorPickerMode('rgb');
    expect(getStoredColorPickerMode()).toBe('rgb');
  });

  it('should normalize hex values consistently', () => {
    expect(normalizeHexColor('abc')).toBe('#AABBCC');
    expect(normalizeHexColor('#0f1e2d')).toBe('#0F1E2D');
    expect(normalizeHexColor('bad-value')).toBeNull();
  });

  it('should round-trip rgb and hsl conversions for common colors', () => {
    const orangeHex = rgbToHex(255, 170, 0);
    expect(orangeHex).toBe('#FFAA00');

    const hsl = rgbToHsl(255, 170, 0);
    const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);

    expect(rgbToHex(rgb.r, rgb.g, rgb.b)).toBe('#FFAA00');
  });

  it('should round-trip rgb and hsv conversions for picker interactions', () => {
    const hsv = rgbToHsv(255, 0, 0);
    expect(hsv).toEqual({ h: 0, s: 100, v: 100 });

    const rgb = hsvToRgb(210, 50, 80);
    const nextHsv = rgbToHsv(rgb.r, rgb.g, rgb.b);

    expect(Math.abs(nextHsv.h - 210)).toBeLessThanOrEqual(1);
    expect(Math.abs(nextHsv.s - 50)).toBeLessThanOrEqual(1);
    expect(Math.abs(nextHsv.v - 80)).toBeLessThanOrEqual(1);
  });
});
