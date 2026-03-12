import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ColorPickerMode,
  DEFAULT_COLOR_PICKER_HEX,
  getStoredColorPickerMode,
  hexToRgb,
  hslToRgb,
  hsvToRgb,
  normalizeHexColor,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
  setStoredColorPickerMode
} from '../../utils/color-picker';
import './EditorColorPickerModal.css';

interface EditorColorPickerModalProps {
  isOpen: boolean;
  defaultColor: string;
  onConfirm: (color: string) => void;
  onCancel: () => void;
}

type TripleInputs = {
  first: string;
  second: string;
  third: string;
};

interface ColorSnapshot {
  hex: string;
  rgb: TripleInputs;
  hsl: TripleInputs;
  hsv: {
    h: number;
    s: number;
    v: number;
  };
}

const createSnapshot = (color: string): ColorSnapshot => {
  const normalized = normalizeHexColor(color) || DEFAULT_COLOR_PICKER_HEX;
  const rgb = hexToRgb(normalized);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);

  return {
    hex: normalized,
    rgb: {
      first: String(rgb.r),
      second: String(rgb.g),
      third: String(rgb.b)
    },
    hsl: {
      first: String(hsl.h),
      second: String(hsl.s),
      third: String(hsl.l)
    },
    hsv
  };
};

const parseInteger = (value: string): number | null => {
  if (value.trim() === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const EditorColorPickerModal: React.FC<EditorColorPickerModalProps> = ({
  isOpen,
  defaultColor,
  onConfirm,
  onCancel
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [mode, setMode] = useState<ColorPickerMode>(getStoredColorPickerMode());
  const [draftColor, setDraftColor] = useState(DEFAULT_COLOR_PICKER_HEX);
  const [hexValue, setHexValue] = useState(DEFAULT_COLOR_PICKER_HEX);
  const [rgbValue, setRgbValue] = useState<TripleInputs>({ first: '0', second: '0', third: '0' });
  const [hslValue, setHslValue] = useState<TripleInputs>({ first: '0', second: '0', third: '0' });
  const [hsvValue, setHsvValue] = useState({ h: 0, s: 0, v: 0 });
  const [error, setError] = useState('');

  const hueColor = useMemo(() => {
    const rgb = hsvToRgb(hsvValue.h, 100, 100);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }, [hsvValue.h]);

  const syncFromHex = (color: string) => {
    const next = createSnapshot(color);
    setDraftColor(next.hex);
    setHexValue(next.hex);
    setRgbValue(next.rgb);
    setHslValue(next.hsl);
    setHsvValue(next.hsv);
    setError('');
  };

  useEffect(() => {
    if (!isOpen) return;

    setMode(getStoredColorPickerMode());
    syncFromHex(defaultColor);
  }, [isOpen, defaultColor]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!draggingRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = Math.min(rect.width, Math.max(0, event.clientX - rect.left));
      const y = Math.min(rect.height, Math.max(0, event.clientY - rect.top));
      const saturation = Math.round((x / rect.width) * 100);
      const value = Math.round(100 - ((y / rect.height) * 100));
      const rgb = hsvToRgb(hsvValue.h, saturation, value);
      syncFromHex(rgbToHex(rgb.r, rgb.g, rgb.b));
    };

    const handleMouseUp = () => {
      draggingRef.current = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isOpen, onCancel, hsvValue.h]);

  const updateMode = (nextMode: ColorPickerMode) => {
    setMode(nextMode);
    setStoredColorPickerMode(nextMode);
    setError('');
  };

  const handleCanvasPointer = (event: React.MouseEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(rect.width, Math.max(0, event.clientX - rect.left));
    const y = Math.min(rect.height, Math.max(0, event.clientY - rect.top));
    const saturation = Math.round((x / rect.width) * 100);
    const value = Math.round(100 - ((y / rect.height) * 100));
    const rgb = hsvToRgb(hsvValue.h, saturation, value);
    syncFromHex(rgbToHex(rgb.r, rgb.g, rgb.b));
  };

  const handleHueChange = (value: string) => {
    const nextHue = parseInteger(value);
    if (nextHue === null) return;
    const rgb = hsvToRgb(nextHue, hsvValue.s, hsvValue.v);
    syncFromHex(rgbToHex(rgb.r, rgb.g, rgb.b));
  };

  const applyHexPreview = (rawValue: string) => {
    setHexValue(rawValue);
    const normalized = normalizeHexColor(rawValue);
    if (normalized) {
      syncFromHex(normalized);
    }
  };

  const applyRgbPreview = (nextValue: TripleInputs) => {
    setRgbValue(nextValue);
    const red = parseInteger(nextValue.first);
    const green = parseInteger(nextValue.second);
    const blue = parseInteger(nextValue.third);
    if (red === null || green === null || blue === null) return;

    syncFromHex(rgbToHex(red, green, blue));
  };

  const applyHslPreview = (nextValue: TripleInputs) => {
    setHslValue(nextValue);
    const hue = parseInteger(nextValue.first);
    const saturation = parseInteger(nextValue.second);
    const lightness = parseInteger(nextValue.third);
    if (hue === null || saturation === null || lightness === null) return;

    const rgb = hslToRgb(hue, saturation, lightness);
    syncFromHex(rgbToHex(rgb.r, rgb.g, rgb.b));
  };

  const handleApply = () => {
    let nextColor: string | null = null;

    if (mode === 'hex') {
      nextColor = normalizeHexColor(hexValue);
      if (!nextColor) {
        setError('请输入有效的 HEX，例如 #FFAA00。');
        return;
      }
    } else if (mode === 'rgb') {
      const red = parseInteger(rgbValue.first);
      const green = parseInteger(rgbValue.second);
      const blue = parseInteger(rgbValue.third);
      if (red === null || green === null || blue === null) {
        setError('请输入完整的 RGB 数值。');
        return;
      }
      nextColor = rgbToHex(red, green, blue);
    } else {
      const hue = parseInteger(hslValue.first);
      const saturation = parseInteger(hslValue.second);
      const lightness = parseInteger(hslValue.third);
      if (hue === null || saturation === null || lightness === null) {
        setError('请输入完整的 HSL 数值。');
        return;
      }
      const rgb = hslToRgb(hue, saturation, lightness);
      nextColor = rgbToHex(rgb.r, rgb.g, rgb.b);
    }

    onConfirm(nextColor);
  };

  if (!isOpen) return null;

  const renderValueInputs = () => {
    if (mode === 'hex') {
      return (
        <label className="editor-color-picker-channel editor-color-picker-channel-hex">
          <input
            type="text"
            value={hexValue}
            onChange={(event) => applyHexPreview(event.target.value)}
            placeholder="#RRGGBB"
          />
          <span>HEX</span>
        </label>
      );
    }

    const values = mode === 'rgb'
      ? {
          data: rgbValue,
          labels: ['R', 'G', 'B'],
          onChange: (field: keyof TripleInputs, value: string) => applyRgbPreview({ ...rgbValue, [field]: value })
        }
      : {
          data: hslValue,
          labels: ['H', 'S', 'L'],
          onChange: (field: keyof TripleInputs, value: string) => applyHslPreview({ ...hslValue, [field]: value })
        };

    const perFieldMax = mode === 'rgb' ? [255, 255, 255] : [360, 100, 100];

    return (
      <div className="editor-color-picker-channels">
        {(['first', 'second', 'third'] as const).map((field, index) => (
          <label key={field} className="editor-color-picker-channel">
            <input
              type="number"
              min={0}
              max={perFieldMax[index]}
              value={values.data[field]}
              onChange={(event) => values.onChange(field, event.target.value)}
            />
            <span>{values.labels[index]}</span>
          </label>
        ))}
      </div>
    );
  };

  return (
    <div className="editor-color-picker-overlay" onMouseDown={onCancel}>
      <div className="editor-color-picker-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div
          ref={canvasRef}
          className="editor-color-picker-canvas"
          style={{ backgroundColor: hueColor }}
          onMouseDown={handleCanvasPointer}
        >
          <div className="editor-color-picker-canvas-white" />
          <div className="editor-color-picker-canvas-black" />
          <div
            className="editor-color-picker-canvas-thumb"
            style={{
              left: `${hsvValue.s}%`,
              top: `${100 - hsvValue.v}%`
            }}
          />
        </div>

        <div className="editor-color-picker-toolbar">
          <div className="editor-color-picker-swatch" style={{ backgroundColor: draftColor }} />
          <input
            type="range"
            min={0}
            max={360}
            value={hsvValue.h}
            className="editor-color-picker-hue"
            onChange={(event) => handleHueChange(event.target.value)}
          />
          <div className="editor-color-picker-color-code">{draftColor}</div>
        </div>

        <div className="editor-color-picker-bottom">
          <div className="editor-color-picker-input-area">
            {renderValueInputs()}
            {error && <div className="editor-color-picker-error">{error}</div>}
          </div>

          <div className="editor-color-picker-side">
            <select
              className="editor-color-picker-mode-select"
              value={mode}
              onChange={(event) => updateMode(event.target.value as ColorPickerMode)}
            >
              <option value="hex">HEX</option>
              <option value="rgb">RGB</option>
              <option value="hsl">HSL</option>
            </select>

            <div className="editor-color-picker-actions">
              <button type="button" className="editor-color-picker-btn ghost" onClick={onCancel}>
                取消
              </button>
              <button type="button" className="editor-color-picker-btn primary" onClick={handleApply}>
                应用
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditorColorPickerModal;
