import React from 'react';
import { BookOpen, Bookmark, Layers, Settings, Sparkles, Wand2 } from 'lucide-react';
import { useStore } from '../store/StoreContext';
import { navigate, Route } from '../lib/route';
import { weeksOf } from '../lib/series';
import { designOf, resolvePalette } from '../lib/design';
import { visibleParts } from '../lib/time';
import { JUMP_EVENT } from '../lib/sidebar';

// A macOS source list: places at the top, every series below, and the open series' lessons under it.
const Item: React.FC<{ active?: boolean; onClick: () => void; icon?: React.ReactNode; children: React.ReactNode; trail?: React.ReactNode; inset?: boolean }> = ({ active, onClick, icon, children, trail, inset }) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    className={`w-full flex items-center gap-2 rounded-[7px] text-left text-[13px] leading-5 transition-colors ${inset ? 'pl-7 pr-2 py-1' : 'px-2 py-[5px]'} ${
      active ? 'bg-black/[0.08] text-ink font-medium' : 'text-gray-800 hover:bg-black/[0.04]'
    }`}
  >
    {icon}
    <span className="flex-1 min-w-0 truncate">{children}</span>
    {trail && <span className="text-[12px] text-gray-500 tabular-nums">{trail}</span>}
  </button>
);

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="px-2 pt-5 pb-1 text-[11px] font-semibold text-gray-500">{children}</p>
);

export const Sidebar: React.FC<{ route: Route }> = ({ route }) => {
  const { db, aiStatus, setSettingsOpen } = useStore();
  const openService = route.name === 'service' ? db.services.find((s) => s.id === route.id) : undefined;
  const openSeriesId = route.name === 'series' ? route.id : openService?.seriesId ?? null;
  const series = [...db.series].sort((a, b) => b.updatedAt - a.updatedAt);
  const aiDot = { off: 'bg-gray-400', checking: 'bg-amber-400', online: 'bg-emerald-500', offline: 'bg-red-500' }[aiStatus];
  const aiLabel = { off: 'AI is off', checking: 'Checking AI…', online: 'AI is on', offline: 'AI is offline' }[aiStatus];
  const icon = (Icon: React.FC<{ className?: string }>) => <Icon className="w-4 h-4 text-accent shrink-0" />;

  return (
    <aside className="sidebar-material hidden lg:flex flex-col w-[248px] shrink-0 h-screen sticky top-0 border-r border-black/[0.08]">
      <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2.5 px-4 h-[52px] shrink-0">
        <span className="w-7 h-7 rounded-[8px] bg-gradient-to-b from-[#2b8cff] to-[#0062C4] text-white flex items-center justify-center shadow-sm"><Layers className="w-4 h-4" /></span>
        <span className="text-[15px] font-semibold tracking-tight">Parable</span>
      </button>

      <nav className="flex-1 overflow-y-auto px-2.5 pb-4" aria-label="Sidebar">
        <div className="space-y-px">
          <Item active={route.name === 'home' || route.name === 'series-list'} onClick={() => navigate('/')} icon={icon(BookOpen)}>Shelf</Item>
          <Item active={route.name === 'library'} onClick={() => navigate('/library')} icon={icon(Bookmark)}>Library</Item>
          <Item active={route.name === 'studio'} onClick={() => navigate('/studio')} icon={icon(Wand2)}>Studio</Item>
        </div>

        {series.length > 0 && <Heading>Series</Heading>}
        <div className="space-y-px">
          {series.map((s) => {
            const lessons = weeksOf(db, s.id);
            const open = s.id === openSeriesId;
            const color = resolvePalette(designOf(s)).accent;
            return (
              <div key={s.id}>
                <Item
                  active={route.name === 'series' && route.id === s.id && route.view !== 'book'}
                  onClick={() => navigate(`/series/${s.id}`)}
                  icon={<span className="w-3.5 h-3.5 rounded-[4px] shrink-0 shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.15)]" style={{ background: color }} />}
                  trail={lessons.length}
                >
                  {s.title}
                </Item>
                {open && (
                  <div className="mt-px mb-1 space-y-px">
                    <Item inset active={route.name === 'series' && route.id === s.id && route.view === 'book'} onClick={() => navigate(`/series/${s.id}/book`)}>
                      <span className="text-gray-500">Cover &amp; leader guide</span>
                    </Item>
                    {lessons.map((l, i) => {
                      const here = route.name === 'service' && route.id === l.id;
                      return (
                        <div key={l.id}>
                          <Item inset active={here} onClick={() => navigate(`/s/${l.id}`)}>
                            <span className="text-gray-400 tabular-nums mr-1.5">{String(i + 1).padStart(2, '0')}</span>
                            {l.title || 'Untitled lesson'}
                          </Item>
                          {here && (
                            <div className="ml-[34px] pl-2 border-l border-black/10 my-1">
                              {l.sections.filter((sec) => visibleParts(sec).length > 0).map((sec) => (
                                <div key={sec.id}>
                                  <p className="px-2 pt-1.5 pb-0.5 text-[11px] font-semibold text-gray-500 truncate">{sec.title}</p>
                                  {visibleParts(sec).map((p) => (
                                    <button
                                      key={p.id}
                                      type="button"
                                      onClick={() => window.dispatchEvent(new CustomEvent(JUMP_EVENT, { detail: p.id }))}
                                      className="block w-full text-left px-2 py-[3px] rounded-[6px] text-[12.5px] text-gray-600 hover:bg-black/[0.04] hover:text-ink truncate"
                                    >
                                      {p.title || 'Untitled part'}
                                    </button>
                                  ))}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      <div className="shrink-0 border-t border-black/[0.06] p-2.5 space-y-px">
        <Item onClick={() => setSettingsOpen(true)} icon={<Sparkles className="w-4 h-4 text-gray-500 shrink-0" />} trail={<span className={`inline-block w-2 h-2 rounded-full ${aiDot}`} />}>{aiLabel}</Item>
        <Item onClick={() => setSettingsOpen(true)} icon={<Settings className="w-4 h-4 text-gray-500 shrink-0" />}>Settings</Item>
      </div>
    </aside>
  );
};
