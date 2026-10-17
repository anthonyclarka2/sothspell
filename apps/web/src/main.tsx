import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router.js';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('the root element is missing from index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
