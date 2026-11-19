// Tiny hash router. Views are plain names (#play, #review…) so the app works
// from any static host; per-visit parameters (which game, which theme) travel
// in memory alongside the route.
import { useEffect, useReducer } from 'preact/hooks';

export const ROUTES = ['home', 'play', 'review', 'tactics', 'learn', 'repertoire', 'insights', 'prefs'];
const fromHash = () => {
  const h = (typeof window !== 'undefined' ? window.location.hash : '').replace(/^#\/?/, '');
  return ROUTES.includes(h) ? h : 'home';
};
const nav = { route: fromHash(), params: {}, seq: 0 };
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export function go(route, params = {}) {
  nav.route = ROUTES.includes(route) ? route : 'home';
  nav.params = params;
  nav.seq++;
  if (fromHash() !== nav.route || !window.location.hash) {
    try {
      window.location.hash = nav.route;
    } catch {
      /* some embedded viewers lock the hash; in-memory routing still works */
    }
  }
  emit();
  window.scrollTo(0, 0);
}
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const r = fromHash();
    if (r !== nav.route) {
      nav.route = r;
      nav.params = {};
      nav.seq++;
      emit();
    }
  });
}
export function useRoute() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => listeners.delete(force);
  }, []);
  return nav;
}
