import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'series-list' }
  | { name: 'series'; id: string }
  | { name: 'library' }
  | { name: 'service'; id: string; partId?: string };

const parse = (hash: string): Route => {
  const match = /^#\/s\/([^/]+)(?:\/p\/(.+))?$/.exec(hash);
  if (match) return { name: 'service', id: decodeURIComponent(match[1]), partId: match[2] && decodeURIComponent(match[2]) };
  const series = /^#\/series\/(.+)$/.exec(hash);
  if (series) return { name: 'series', id: decodeURIComponent(series[1]) };
  if (hash === '#/series' || hash === '#/services') return { name: 'series-list' };
  if (hash === '#/library') return { name: 'library' };
  return { name: 'home' };
};

export const navigate = (path: string) => {
  window.location.hash = path;
};

export const useRoute = (): Route => {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parse(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
};
