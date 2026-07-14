import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyTheme } from './ui/theme';

// Before the first paint: every CSS variable lives under :root[data-theme=…],
// so without this the app renders with no colours at all.
applyTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
