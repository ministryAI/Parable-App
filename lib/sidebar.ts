import { useSyncExternalStore } from 'react';

// Whether the app sidebar is showing. The lesson editor drops its own outline when it is,
// because the sidebar already lists the lessons and the open lesson's parts.
const KEY = 'parable.sidebar';
let shown = (() => {
  try { return localStorage.getItem(KEY) !== 'hidden'; } catch { return true; }
})();
const listeners = new Set<() => void>();

export const setSidebarShown = (value: boolean) => {
  shown = value;
  try { localStorage.setItem(KEY, value ? 'shown' : 'hidden'); } catch { /* preference only */ }
  listeners.forEach((fn) => fn());
};

export const useSidebarShown = () =>
  useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => shown);

// The sidebar asks the open lesson to jump to one of its parts.
export const JUMP_EVENT = 'parable:jump-part';
