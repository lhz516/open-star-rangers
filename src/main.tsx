import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { createBrowserPorts } from './app/browser-ports.ts';
import './app/app.css';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root element');

const ports = createBrowserPorts();

createRoot(root).render(
  <StrictMode>
    <App ports={ports} />
  </StrictMode>,
);
