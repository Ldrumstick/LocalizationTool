import {
  hasModKey,
  isEditableTarget,
  registerShortcut,
  runShortcutRules,
  ShortcutPriority
} from '../../src/services/shortcut-service';

describe('shortcut-service', () => {
  test('hasModKey detects ctrl/meta correctly', () => {
    expect(hasModKey(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }))).toBe(true);
    expect(hasModKey(new KeyboardEvent('keydown', { key: 'a', metaKey: true }))).toBe(true);
    expect(hasModKey(new KeyboardEvent('keydown', { key: 'a' }))).toBe(false);
  });

  test('isEditableTarget detects input-like elements', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const div = document.createElement('div');
    const editableDiv = document.createElement('div');
    editableDiv.setAttribute('contenteditable', 'true');

    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(textarea)).toBe(true);
    expect(isEditableTarget(editableDiv)).toBe(true);
    expect(isEditableTarget(div)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });

  test('runShortcutRules runs first matching rule', () => {
    const calls: string[] = [];
    const event = new KeyboardEvent('keydown', { key: 'F3' });

    const handled = runShortcutRules(event, [
      {
        match: (e) => e.key === 'F3',
        run: () => {
          calls.push('first');
        }
      },
      {
        match: () => true,
        run: () => {
          calls.push('second');
        }
      }
    ]);

    expect(handled).toBe(true);
    expect(calls).toEqual(['first']);
  });

  test('registerShortcut obeys priority and stop-on-handled', () => {
    const calls: string[] = [];

    const unregisterLow = registerShortcut(() => {
      calls.push('low');
      return false;
    }, { priority: ShortcutPriority.grid });

    const unregisterHigh = registerShortcut(() => {
      calls.push('high');
      return true;
    }, { priority: ShortcutPriority.app });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));

    unregisterHigh();
    unregisterLow();

    expect(calls).toEqual(['high']);
  });

  test('unregister removes handler', () => {
    let count = 0;
    const unregister = registerShortcut(() => {
      count += 1;
      return true;
    }, { priority: ShortcutPriority.panel });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y' }));
    unregister();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y' }));

    expect(count).toBe(1);
  });
});
