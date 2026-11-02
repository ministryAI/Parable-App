import React, { useRef, useState } from 'react';
import { Download, FileText, Layers, Plus, Search, Upload } from 'lucide-react';
import { Database, Series, Service } from '../types';
import { cloneService, todayISO } from '../lib/factory';
import { downloadJson, readJsonFile } from '../lib/files';
import { weeksOf } from '../lib/series';
import { readiness } from '../lib/readiness';
import { navigate } from '../lib/route';
import { useStore } from '../store/StoreContext';
import { NewSeriesDialog, NewServiceDialog } from './NewServiceDialog';
import { CoverThumb } from './print/PrintView';
import { Button, EmptyState, Menu, MenuItem, inputClass } from './ui';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Where a series stands, from its lessons (writing) and its runs (teaching).
export const seriesStatus = (series: Series, lessons: Service[], today = todayISO()) => {
  const teaching = series.runs.some((run) => {
    const dates = Object.values(run.dates).filter((d) => ISO.test(d)).sort();
    return dates.length > 0 && dates[0] <= today && today <= dates[dates.length - 1];
  });
  if (teaching) return { label: 'Teaching now', tone: 'bg-indigo-100 text-indigo-900' };
  if (!lessons.length) return { label: 'No lessons yet', tone: 'bg-gray-100 text-gray-700' };
  const ready = lessons.filter((l) => { const r = readiness(l); return r.total > 0 && r.ready === r.total; }).length;
  if (ready === lessons.length) return { label: 'Ready to print', tone: 'bg-emerald-100 text-emerald-900' };
  if (lessons.some((l) => readiness(l).ready > 0)) return { label: `Writing · ${ready} of ${lessons.length} ready`, tone: 'bg-amber-100 text-amber-900' };
  return { label: 'Just started', tone: 'bg-gray-100 text-gray-700' };
};

const timeAgo = (ms: number) => {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

// Home: every series as a book on a shelf. Series have no dates; open one to write it or teach it.
export const ShelfPage: React.FC = () => {
  const { db, addServices, importDatabase, toast } = useStore();
  const [query, setQuery] = useState('');
  const [seriesOpen, setSeriesOpen] = useState(false);
  const [lessonOpen, setLessonOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();

  const books = db.series
    .map((series) => ({ series, lessons: weeksOf(db, series.id) }))
    .filter(({ series, lessons }) => !q || [series.title, series.audience, series.description, series.bigIdea, ...lessons.map((l) => l.title)].some((f) => f.toLowerCase().includes(q)))
    .sort((a, b) => b.series.updatedAt - a.series.updatedAt);
  const standalone = db.services
    .filter((s) => !s.seriesId && (!q || [s.title, s.audience, s.bigIdea].some((f) => f.toLowerCase().includes(q))))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const recent = [...db.services].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);

  const onImport = async (file: File) => {
    try {
      const count = importDatabase((await readJsonFile(file)) as Partial<Database>);
      toast(count ? `Imported ${count} item${count === 1 ? '' : 's'}` : 'Nothing to import in that file');
    } catch {
      toast("That file couldn't be read. Choose a .parable.json export or backup.");
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 pb-24">
      <section className="py-8 md:py-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-display">Your shelf</h1>
          <p className="text-gray-500 mt-1">Each series is a book. Write it once, teach it whenever you want.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={Plus} onClick={() => setSeriesOpen(true)}>New series</Button>
          <Menu trigger={<Button variant="outline">More</Button>}>
            <MenuItem icon={FileText} onClick={() => setLessonOpen(true)}>New stand-alone lesson</MenuItem>
            <MenuItem icon={Upload} onClick={() => fileRef.current?.click()}>Import a file</MenuItem>
            <MenuItem icon={Download} onClick={() => downloadJson(`parable-backup-${todayISO()}.json`, db)}>Back up everything</MenuItem>
          </Menu>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }} />
        </div>
      </section>

      {recent.length > 0 && !q && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-2">Pick up where you left off</h2>
          <div className="flex flex-wrap gap-2">
            {recent.map((s) => {
              const series = s.seriesId ? db.series.find((x) => x.id === s.seriesId) : undefined;
              return (
                <button key={s.id} type="button" onClick={() => navigate(`/s/${s.id}`)} className="text-left bg-white border border-line rounded-xl px-3 py-2 hover:border-gray-300 min-w-0 max-w-full">
                  <span className="block text-sm font-semibold truncate">{s.title}</span>
                  <span className="block text-xs text-gray-500 truncate">{series ? `${series.title} · lesson ${s.week}` : 'Stand-alone'} · {timeAgo(s.updatedAt)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {db.series.length > 6 && (
        <div className="relative max-w-sm w-full mb-6">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className={`${inputClass} pl-9`} placeholder="Search series and lessons" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}

      {db.series.length === 0 && standalone.length === 0 ? (
        <div className="border-2 border-dashed border-line rounded-2xl bg-white">
          <EmptyState icon={Layers} title="Your shelf is empty">
            Start a series: pick how many lessons and a layout, or have Diana draft it.
            <div className="mt-4"><Button icon={Plus} onClick={() => setSeriesOpen(true)}>New series</Button></div>
          </EmptyState>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-x-6 gap-y-8 mb-12">
            {books.map(({ series, lessons }) => {
              const status = seriesStatus(series, lessons);
              return (
                <li key={series.id}>
                  <a href={`#/series/${series.id}`} className="group block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4">
                    <div className="w-[168px] rounded-[4px] overflow-hidden shadow-[0_1px_0_rgba(0,0,0,0.06),0_10px_24px_rgba(22,22,29,0.14)] group-hover:-translate-y-1 transition-transform">
                      <CoverThumb series={series} weeks={lessons} width={168} />
                    </div>
                    <span className="block mt-3 font-semibold group-hover:text-accent">{series.title}</span>
                    <span className="block text-sm text-gray-500">{lessons.length} lesson{lessons.length === 1 ? '' : 's'} · {series.audience}</span>
                  </a>
                  <span className={`inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full ${status.tone}`}>{status.label}</span>
                </li>
              );
            })}
            <li>
              <button type="button" onClick={() => setSeriesOpen(true)} className="w-[168px] h-[217px] rounded-[4px] border-2 border-dashed border-gray-300 text-gray-500 hover:text-ink hover:border-gray-400 flex flex-col items-center justify-center gap-2 font-semibold">
                <Plus className="w-6 h-6" /> New series
              </button>
            </li>
          </ul>

          {standalone.length > 0 && (
            <section className="mb-10">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">Stand-alone lessons</h2>
              <ul className="bg-white border border-line rounded-xl divide-y divide-line">
                {standalone.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                    <a href={`#/s/${s.id}`} className="flex-1 min-w-0 hover:text-accent">
                      <span className="block font-semibold truncate">{s.title}</span>
                      <span className="block text-xs text-gray-500 truncate">{s.audience}{s.scripture ? ` · ${s.scripture}` : ''}</span>
                    </a>
                    <Button size="sm" variant="ghost" onClick={() => { addServices([cloneService(s, { title: `${s.title} (copy)`, checkedSupplies: [] })]); toast('Lesson duplicated'); }}>Duplicate</Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {q && books.length + standalone.length === 0 && <EmptyState icon={Search} title="Nothing matches your search" />}
        </>
      )}

      <NewSeriesDialog open={seriesOpen} onClose={() => setSeriesOpen(false)} />
      <NewServiceDialog open={lessonOpen} onClose={() => setLessonOpen(false)} />
    </div>
  );
};
