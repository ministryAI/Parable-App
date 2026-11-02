import React from 'react';
import { AlertTriangle, Bookmark, Check, Cloud, Layers, Loader2, Sparkles, Undo2, X } from 'lucide-react';
import { StoreProvider, useStore } from './store/StoreContext';
import { navigate, useRoute } from './lib/route';
import { ShelfPage } from './components/ShelfPage';
import { SeriesPage } from './components/SeriesPage';
import { ServiceEditor } from './components/ServiceEditor';
import { LibraryPage } from './components/LibraryPage';
import { SettingsPanel } from './components/SettingsPanel';
import { PrintRoot } from './components/print/PrintView';

const SaveIndicator: React.FC = () => {
  const { saveState } = useStore();
  if (saveState === 'saving') return <span className="inline-flex items-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin" />Saving…</span>;
  if (saveState === 'error') return <span className="inline-flex items-center gap-1.5 text-red-700"><AlertTriangle className="w-4 h-4" />Storage full. Export a backup.</span>;
  return <span className="inline-flex items-center gap-1.5"><Cloud className="w-4 h-4" /><Check className="w-3 h-3 -ml-2.5 mt-1" />Saved in this browser</span>;
};

const Shell: React.FC = () => {
  const route = useRoute();
  const { setSettingsOpen, aiStatus, toasts, dismissToast } = useStore();
  const aiDot = { off: 'bg-gray-300', checking: 'bg-amber-400', online: 'bg-emerald-500', offline: 'bg-red-500' }[aiStatus];
  const aiLabel = { off: 'AI off', checking: 'AI…', online: 'AI on', offline: 'AI offline' }[aiStatus];
  const nav = (active: boolean) => `px-2 sm:px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap ${active ? 'bg-accent-soft text-accent' : 'text-gray-500 hover:text-ink'}`;

  return (
    <>
      <div className="min-h-screen bg-canvas font-sans text-ink print:hidden">
        <nav className="border-b border-line bg-white/85 backdrop-blur sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 flex items-center gap-2">
            <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2 text-lg mr-2 sm:mr-4">
              <span className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center"><Layers className="w-5 h-5" /></span>
              <span className="hidden sm:inline font-display tracking-tight">Parable</span>
            </button>
            <button type="button" className={nav(route.name === 'home' || route.name === 'series-list' || route.name === 'series' || route.name === 'service')} onClick={() => navigate('/')}>Shelf</button>
            <button type="button" className={nav(route.name === 'library')} onClick={() => navigate('/library')}>
              <Bookmark className="w-4 h-4 hidden sm:inline -mt-0.5 mr-1" />Library
            </button>
            <div className="flex-1" />
            <span className="hidden md:inline text-xs text-gray-500 mr-3"><SaveIndicator /></span>
            <button type="button" onClick={() => setSettingsOpen(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-ink px-2 py-1.5 rounded-lg hover:bg-gray-100">
              <Sparkles className="w-4 h-4" />
              <span className={`w-2 h-2 rounded-full ${aiDot}`} aria-hidden="true" />
              <span className="hidden sm:inline">{aiLabel}</span>
            </button>
          </div>
        </nav>

        <main>
          {route.name === 'service' && <ServiceEditor key={route.id} serviceId={route.id} focusPartId={route.partId} />}
          {route.name === 'series-list' && <ShelfPage />}
          {route.name === 'series' && <SeriesPage key={route.id} seriesId={route.id} />}
          {route.name === 'library' && <LibraryPage />}
          {route.name === 'home' && <ShelfPage />}
        </main>

        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 space-y-2 w-[calc(100%-2rem)] max-w-md" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className="flex items-center gap-3 bg-ink text-white rounded-xl px-4 py-3 shadow-lift text-sm">
              <span className="flex-1">{t.message}</span>
              {t.undo && (
                <button type="button" className="inline-flex items-center gap-1 font-semibold underline" onClick={() => { t.undo!(); dismissToast(t.id); }}>
                  <Undo2 className="w-4 h-4" />Undo
                </button>
              )}
              <button type="button" aria-label="Dismiss" onClick={() => dismissToast(t.id)} className="text-white/60 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>

        <SettingsPanel />
      </div>
      <PrintRoot />
    </>
  );
};

const App: React.FC = () => (
  <StoreProvider>
    <Shell />
  </StoreProvider>
);

export default App;
