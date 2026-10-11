import { useState } from 'react';

export function useTheme() {
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme,
  );
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem('campuschain-theme', next);
    } catch {
      /* Storage can be blocked. */
    }
  }
  return [theme, toggleTheme];
}
