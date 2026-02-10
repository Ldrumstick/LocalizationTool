type ShortcutHandler = (e: KeyboardEvent) => boolean | void;
type ShortcutRule = {
  match: (e: KeyboardEvent) => boolean;
  run: (e: KeyboardEvent) => void;
};

interface ShortcutRegistration {
  id: number;
  priority: number;
  handler: ShortcutHandler;
  enabled: boolean;
}

let nextId = 1;
const registrations = new Map<number, ShortcutRegistration>();
let installed = false;

const handleKeyDown = (e: KeyboardEvent) => {
  const active = Array.from(registrations.values())
    .filter((item) => item.enabled)
    .sort((a, b) => b.priority - a.priority);

  for (const item of active) {
    const handled = item.handler(e);
    if (handled) return;
  }
};

const ensureInstalled = () => {
  if (installed || typeof window === 'undefined') return;
  window.addEventListener('keydown', handleKeyDown);
  installed = true;
};

const maybeUninstall = () => {
  if (!installed || registrations.size > 0 || typeof window === 'undefined') return;
  window.removeEventListener('keydown', handleKeyDown);
  installed = false;
};

export const ShortcutPriority = {
  app: 100,
  panel: 70,
  grid: 60
} as const;

export const hasModKey = (e: KeyboardEvent) => e.ctrlKey || e.metaKey;

export const isEditableTarget = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const contentEditableAttr = el.getAttribute?.('contenteditable');
  const isContentEditable =
    el.isContentEditable === true ||
    contentEditableAttr === '' ||
    contentEditableAttr === 'true';

  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || isContentEditable;
};

export const runShortcutRules = (e: KeyboardEvent, rules: ShortcutRule[]) => {
  for (const rule of rules) {
    if (!rule.match(e)) continue;
    rule.run(e);
    return true;
  }
  return false;
};

export const registerShortcut = (
  handler: ShortcutHandler,
  options?: { priority?: number; enabled?: boolean }
) => {
  ensureInstalled();

  const id = nextId++;
  registrations.set(id, {
    id,
    priority: options?.priority ?? 0,
    handler,
    enabled: options?.enabled ?? true
  });

  return () => {
    registrations.delete(id);
    maybeUninstall();
  };
};
