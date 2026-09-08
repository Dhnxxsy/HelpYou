import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { I18nProvider } from './lib/i18n';
import { applyTheme, getStoredTheme } from './lib/themes';
import './index.css';

applyTheme(getStoredTheme());

const isOverlay = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('overlay') === '1';
if (typeof document !== 'undefined' && isOverlay) {
  document.body.classList.add('overlay-mode');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </I18nProvider>
  </React.StrictMode>
);
