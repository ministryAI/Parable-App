import React from 'react';
import { AlertTriangle, BookOpen, Bookmark, Check, Cloud, Layers, Loader2, PanelLeft, Sparkles, Undo2, Wand2, X } from 'lucide-react';
import { StoreProvider, useStore } from './store/StoreContext';
import { navigate, useRoute } from './lib/route';
import { ShelfPage } from './components/ShelfPage';
import { SeriesPage } from './components/SeriesPage';
import { ServiceEditor } from './components/ServiceEditor';
import { LibraryPage } from './components/LibraryPage';
import { StudioPage } from './components/studio/StudioPage';
import { Sidebar } from './components/Sidebar';
import { setSidebarShown, useSidebarShown } from './lib/sidebar';
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
  const shelf = route.name === 'home' || route.name === 'series-list' || route.name === 'series' || route.name === 'service';
  const { db } = useStore();
  const sidebar = useSidebarShown();
  const toggleSidebar = () => setSidebarShown(!sidebar);
  const title =
    route.name === 'library' ? 'Library'
    : route.name === 'studio' ? 'Studio'
    : route.name === 'series' ? db.series.find((x) => x.id === route.id)?.title ?? 'Series'
    : route.name === 'service' ? db.services.find((x) => x.id === route.id)?.title ?? 'Lesson'
    : 'Shelf';

  return (
    <>
      <div className="min-h-screen bg-canvas font-sans text-ink print:hidden flex">
        {sidebar && <Sidebar route={route} />}
        <div className="flex-1 min-w-0">
        <nav className="material border-b border-black/[0.06] sticky top-0 z-40">
          <div className="px-4 md:px-6 h-[52px] grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="justify-self-start flex items-center gap-2 min-w-0">
              <button type="button" onClick={toggleSidebar} aria-label={sidebar ? 'Hide sidebar' : 'Show sidebar'} title={sidebar ? 'Hide sidebar' : 'Show sidebar'} className="hidden lg:inline-flex p-1.5 rounded-md text-gray-600 hover:bg-black/[0.05] hover:text-ink">
                <PanelLeft className="w-[18px] h-[18px]" />
              </button>
              <button type="button" onClick={() => navigate('/')} className={`${sidebar ? 'lg:hidden' : ''} flex items-center gap-2 rounded-lg`}>
                <span className="w-7 h-7 rounded-[8px] bg-gradient-to-b from-[#2b8cff] to-[#0062C4] text-white flex items-center justify-center shadow-sm"><Layers className="w-4 h-4" /></span>
                <span className="hidden sm:inline text-[15px] font-semibold tracking-tight">Parable</span>
              </button>
              <span className="hidden lg:inline text-[13px] font-semibold text-gray-800 truncate">{title}</span>
            </div>
            <div className={`segmented ${sidebar ? 'lg:invisible' : ''}`} role="tablist" aria-label="Sections">
              <button type="button" aria-current={shelf ? 'page' : undefined} onClick={() => navigate('/')}><BookOpen className="w-3.5 h-3.5 hidden sm:inline" />Shelf</button>
              <button type="button" aria-current={route.name === 'library' ? 'page' : undefined} onClick={() => navigate('/library')}><Bookmark className="w-3.5 h-3.5 hidden sm:inline" />Library</button>
              <button type="button" aria-current={route.name === 'studio' ? 'page' : undefined} onClick={() => navigate('/studio')}><Wand2 className="w-3.5 h-3.5 hidden sm:inline" />Studio</button>
            </div>
            <div className="justify-self-end flex items-center gap-1">
              <span className="hidden xl:inline text-xs text-gray-500 mr-2"><SaveIndicator /></span>
              <button type="button" onClick={() => setSettingsOpen(true)} className={`${sidebar ? 'lg:hidden' : ''} inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-700 hover:text-ink px-2.5 py-1.5 rounded-full hover:bg-black/[0.05]`}>
                <Sparkles className="w-4 h-4" />
                <span className={`w-1.5 h-1.5 rounded-full ${aiDot}`} aria-hidden="true" />
                <span className="hidden sm:inline">{aiLabel}</span>
              </button>
            </div>
          </div>
        </nav>

        <main>
          {route.name === 'service' && <ServiceEditor key={route.id} serviceId={route.id} focusPartId={route.partId} />}
          {route.name === 'series-list' && <ShelfPage />}
          {route.name === 'series' && <SeriesPage key={route.id} seriesId={route.id} view={route.view} />}
          {route.name === 'library' && <LibraryPage />}
          {route.name === 'studio' && <StudioPage />}
          {route.name === 'home' && <ShelfPage />}
        </main>
        </div>

        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 space-y-2 w-[calc(100%-2rem)] max-w-md" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className="flex items-center gap-3 material-dark text-white rounded-2xl px-4 py-3 shadow-lift text-sm animate-sheet">
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
