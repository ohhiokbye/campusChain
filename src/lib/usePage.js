import { useEffect, useRef, useState } from 'react';

// Two local pages need only the browser's history API; contract state stays in App.
const readPage = () =>
  window.location.pathname.replace(/\/+$/, '') === '/treasury'
    ? 'treasury'
    : 'bookings';
export function usePage() {
  const [page, setPage] = useState(readPage);
  const previous = useRef(page);
  useEffect(() => {
    const changed = () => setPage(readPage());
    window.addEventListener('popstate', changed);
    return () => window.removeEventListener('popstate', changed);
  }, []);
  useEffect(() => {
    document.title =
      page === 'treasury'
        ? 'Treasury · CampusChain · VIT Chennai'
        : 'CampusChain · VIT Chennai';
    if (previous.current !== page) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      document
        .querySelector('[data-page-title]')
        ?.focus({ preventScroll: true });
      previous.current = page;
    }
  }, [page]);
  function navigate(event, next) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    if (next === page) return;
    window.history.pushState(null, '', next === 'treasury' ? '/treasury' : '/');
    setPage(next);
  }
  return { page, navigate };
}
