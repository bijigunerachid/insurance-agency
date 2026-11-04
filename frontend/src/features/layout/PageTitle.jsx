import { createContext, useContext, useEffect, useState } from 'react';

const PageTitleContext = createContext({ title: null, setTitle: () => {} });

/** Holds the name of the record a detail page shows, for the header (« Clients › Sara Test »). */
export function PageTitleProvider({ children }) {
  const [title, setTitle] = useState(null);
  return (
    <PageTitleContext.Provider value={{ title, setTitle }}>{children}</PageTitleContext.Provider>
  );
}

/** The record's name once loaded (null while loading); cleared when the page is left. */
export function usePageTitle(title) {
  const { setTitle } = useContext(PageTitleContext);
  useEffect(() => {
    setTitle(title ?? null);
    return () => setTitle(null);
  }, [title, setTitle]);
}

export const useCurrentPageTitle = () => useContext(PageTitleContext).title;
