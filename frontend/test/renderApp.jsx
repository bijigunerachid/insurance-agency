import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { App } from '../src/App.jsx';

/** Renders the whole app at `path`, with the same kind of router as production. */
export function renderApp(path = '/') {
  const router = createMemoryRouter([{ path: '*', element: <App /> }], {
    initialEntries: [path],
  });
  return { router, ...render(<RouterProvider router={router} />) };
}
