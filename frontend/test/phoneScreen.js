/** A phone-wide screen for the app's media query; call the returned function to restore it. */
export function phoneScreen() {
  const previous = window.matchMedia;
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  return () => {
    window.matchMedia = previous;
  };
}
