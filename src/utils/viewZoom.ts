// Page zoom for the whole app, remembered on this browser.
const KEY = 'viewZoom';
export const ZOOM_MIN = 0.7;
export const ZOOM_MAX = 2;

export const getZoom = (): number => {
  try { const v = Number(localStorage.getItem(KEY)); return v >= ZOOM_MIN && v <= ZOOM_MAX ? v : 1; } catch { return 1; }
};

export const setZoom = (value: number): number => {
  const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));
  document.documentElement.style.setProperty('zoom', String(z));
  try { localStorage.setItem(KEY, String(z)); } catch { /* not remembered */ }
  return z;
};

export const applySavedZoom = (): void => { setZoom(getZoom()); };
