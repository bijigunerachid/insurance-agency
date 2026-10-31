import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { App } from './App.jsx';
import './styles/index.css';

// A data router (needed for unsaved-change warnings); the app declares its own routes inside.
const router = createBrowserRouter([{ path: '*', element: <App /> }]);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
