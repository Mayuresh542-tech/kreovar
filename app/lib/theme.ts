export type Theme = "light";
const THEME_KEY = "kreovar-theme";
const THEME_EVENT = "kreovar-theme-change";

/** Static bootstrap: locks theme strictly to clean white UI and clears any dark mode state */
export const THEME_BOOTSTRAP = `(function(){try{window.localStorage.removeItem('kreovar-theme')}catch(e){}document.documentElement.dataset.theme='light';document.documentElement.style.colorScheme='light'})()`;

export function getTheme(): Theme {
  return "light";
}
export function getServerTheme(): Theme {
  return "light";
}
function applyTheme() {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = "light";
    document.documentElement.style.colorScheme = "light";
  }
}
export function setTheme(_theme?: string) {
  applyTheme();
  try {
    window.localStorage.removeItem(THEME_KEY);
  } catch {}
  window.dispatchEvent(new Event(THEME_EVENT));
}
export function subscribeTheme(listener: () => void) {
  applyTheme();
  window.addEventListener(THEME_EVENT, listener);
  return () => {
    window.removeEventListener(THEME_EVENT, listener);
  };
}
