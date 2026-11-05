export type Theme = "light" | "dark";
const THEME_KEY = "kreovar-theme";
const THEME_EVENT = "kreovar-theme-change";
const normalizeTheme = (value: string | null | undefined): Theme => value === "dark" ? "dark" : "light";

/** Static, nonce-authorized bootstrap; no user input is interpolated into it. */
export const THEME_BOOTSTRAP = `(function(){var t='light';try{t=window.localStorage.getItem('kreovar-theme')==='dark'?'dark':'light'}catch(e){}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t})()`;

export function getTheme(): Theme {
  return normalizeTheme(document.documentElement.dataset.theme);
}
export function getServerTheme(): Theme { return "light"; }
function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}
export function setTheme(theme: Theme) {
  applyTheme(theme);
  try { window.localStorage.setItem(THEME_KEY, theme); } catch { /* Switching still works when browser storage is unavailable. */ }
  window.dispatchEvent(new Event(THEME_EVENT));
}
export function subscribeTheme(listener: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY && event.key !== null) return;
    applyTheme(normalizeTheme(event.newValue));
    listener();
  };
  window.addEventListener(THEME_EVENT, listener);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(THEME_EVENT, listener);
    window.removeEventListener("storage", storage);
  };
}
