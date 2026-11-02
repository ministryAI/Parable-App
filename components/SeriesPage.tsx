import React, { useState } from 'react';
import { DndContext, DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, BookOpen, BookOpenText, CalendarDays, Copy, Download, FileText, GripVertical, Layers, ListOrdered, Palette, Plus, Printer, Scissors, Sunrise, Trash2, Users } from 'lucide-react';
import { Series, Service, TeachingRun } from '../types';
import { cloneService, newRun, newSeries, todayISO } from '../lib/factory';
import { downloadJson, slug } from '../lib/files';
import { COLOR_CLASSES, RunPace, planDates, shortWhen, weeksOf } from '../lib/series';
import { readiness } from '../lib/readiness';
import { formatDuration, sectionMinutes, serviceMinutes, visibleParts } from '../lib/time';
import { navigate } from '../lib/route';
import { useStore } from '../store/StoreContext';
import { restrictToVerticalAxis } from './dndModifiers';
import { ColorPicker, NewServiceDialog } from './NewServiceDialog';
import { DesignDialog } from './DesignDialog';
import { seriesStatus } from './ShelfPage';
import { BookPreview, CoverThumb } from './print/PrintView';
import { Button, EmptyState, Label, Menu, MenuDivider, MenuItem, Meter, TextArea, inputClass } from './ui';

type View = 'lessons' | 'book' | 'teach';
const VIEW_KEY = 'parable.seriesView';
// Section colors for the "shape of the lesson" bars, by position.
const SHAPE = ['#FDBA74', '#7DD3FC', '#A5B4FC', '#86EFAC', '#F9A8D4', '#FDE68A', '#C4B5FD'];

export const SeriesPage: React.FC<{ seriesId: string }> = ({ seriesId }) => {
  const { db, updateSeries, deleteSeries, addSeries, print, toast } = useStore();
  const series = db.series.find((s) => s.id === seriesId);
  const [addOpen, setAddOpen] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  const [view, setViewState] = useState<View>(() => {
    try { const v = localStorage.getItem(VIEW_KEY); return v === 'book' || v === 'teach' ? v : 'lessons'; } catch { return 'lessons'; }
  });
  const setView = (v: View) => {
    setViewState(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* preference only */ }
  };

  if (!series) {
    return (
      <div className="max-w-xl mx-auto py-20">
        <EmptyState icon={Layers} title="Series not found">
          It may have been deleted. <button className="underline" onClick={() => navigate('/')}>Back to the shelf</button>
        </EmptyState>
      </div>
    );
  }

  const lessons = weeksOf(db, series.id);
  const status = seriesStatus(series, lessons);
  const set = <K extends keyof Series>(key: K, value: Series[K]) => updateSeries(series.id, (s) => ({ ...s, [key]: value }));
  const totals = lessons.reduce((t, w) => { const r = readiness(w); return { ready: t.ready + r.ready, total: t.total + r.total }; }, { ready: 0, total: 0 });
  const minutes = lessons.map(serviceMinutes);
  const typical = minutes.length ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length) : 0;

  const duplicateSeries = () => {
    const copy = newSeries({ ...series, id: undefined, title: `${series.title} (copy)`, runs: [], printRun: '', createdAt: undefined, updatedAt: undefined });
    addSeries(copy, lessons.map((w) => cloneService(w, { checkedSupplies: [] })));
    toast('Series duplicated');
    navigate(`/series/${copy.id}`);
  };

  const tabs: [View, string, typeof Layers][] = [['lessons', 'Lessons', ListOrdered], ['book', 'Book', BookOpenText], ['teach', 'When I teach it', CalendarDays]];

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 pb-24">
      <div className="flex items-center gap-2 text-sm text-gray-500 py-3">
        <button type="button" onClick={() => navigate('/')} className="inline-flex items-center gap-1 hover:text-ink">
          <ArrowLeft className="w-4 h-4" /> Shelf
        </button>
      </div>

      <header className="flex flex-col sm:flex-row gap-5 sm:items-end mb-6">
        <button type="button" onClick={() => setView('book')} aria-label="Open the book" className="shrink-0 self-start rounded-[3px] overflow-hidden shadow-[0_1px_0_rgba(0,0,0,0.06),0_8px_20px_rgba(22,22,29,0.14)] hover:-translate-y-0.5 transition-transform">
          <CoverThumb series={series} weeks={lessons} width={104} />
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold uppercase tracking-wider ${COLOR_CLASSES[series.color].text}`}>{series.audience} series</p>
          <input
            value={series.title}
            onChange={(e) => set('title', e.target.value)}
            aria-label="Series title"
            className="w-full bg-transparent font-display text-3xl md:text-4xl leading-tight rounded-lg px-1 -mx-1 mt-1 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          <p className="text-sm text-gray-500 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{lessons.length} lesson{lessons.length === 1 ? '' : 's'}{typical ? ` · about ${formatDuration(typical)} each` : ''}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${status.tone}`}>{status.label}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button icon={Plus} onClick={() => setAddOpen(true)}>Add lesson</Button>
          <Button variant="outline" icon={Palette} onClick={() => setDesignOpen(true)}>Design</Button>
          <Menu trigger={<Button variant="outline" icon={Printer}>Print</Button>}>
            <MenuItem icon={BookOpen} onClick={() => print('', { kind: 'series-book', seriesId: series.id })}>Series book (everything)</MenuItem>
            <MenuItem icon={FileText} onClick={() => print('', { kind: 'series', seriesId: series.id })}>Cover + leader guide</MenuItem>
            <MenuItem icon={Users} onClick={() => print('', { kind: 'series-small', seriesId: series.id })}>All small group guides</MenuItem>
            <MenuItem icon={Sunrise} onClick={() => print('', { kind: 'series-family', seriesId: series.id })}>All family pages</MenuItem>
            <MenuItem icon={Scissors} onClick={() => print('', { kind: 'series-takehome', seriesId: series.id })}>All take-home cards</MenuItem>
          </Menu>
          <Menu label="Series actions">
            <MenuItem icon={Copy} onClick={duplicateSeries}>Duplicate series</MenuItem>
            <MenuItem icon={Download} onClick={() => downloadJson(`${slug(series.title)}.parable.json`, { version: 1, series: [series], services: lessons, library: [] })}>Export series</MenuItem>
            <MenuDivider />
            <MenuItem icon={Trash2} danger onClick={() => { deleteSeries(series.id); navigate('/'); }}>Delete series</MenuItem>
          </Menu>
        </div>
      </header>

      <div className={`grid grid-cols-1 gap-6 items-start ${view === 'book' ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : 'lg:grid-cols-[minmax(0,1fr)_320px]'}`}>
        <section className="min-w-0">
          <div role="tablist" aria-label="Series view" className="inline-flex flex-wrap bg-white border border-line rounded-lg p-0.5 mb-4">
            {tabs.map(([id, text, Icon]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={view === id}
                onClick={() => setView(id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md ${view === id ? 'bg-accent text-white font-semibold' : 'text-gray-600 hover:text-ink'}`}
              >
                <Icon className="w-4 h-4" /> {text}
              </button>
            ))}
          </div>
          {view === 'lessons' && <LessonsTab series={series} lessons={lessons} onAdd={() => setAddOpen(true)} />}
          {view === 'book' && (
            <>
              <p className="text-xs text-gray-500 mb-3">The whole printed book. Click a part to edit it. Exact page breaks show when you print.</p>
              <BookPreview
                series={series}
                weeks={lessons}
                onPartClick={(partId) => {
                  const lesson = lessons.find((w) => w.sections.some((sec) => sec.parts.some((p) => p.id === partId)));
                  if (lesson) navigate(`/s/${lesson.id}/p/${partId}`);
                }}
              />
            </>
          )}
          {view === 'teach' && <RunsTab series={series} lessons={lessons} />}
        </section>

        <aside className="space-y-4 lg:sticky lg:top-20">
          <div className="bg-white border border-line rounded-2xl p-5 space-y-4">
            <h2 className="font-display text-lg">Writing progress</h2>
            <Meter value={totals.ready} total={totals.total} label="Parts with content" />
          </div>
          <div className="bg-white border border-line rounded-2xl p-5 space-y-4">
            <h2 className="font-display text-lg">Series details</h2>
            <div>
              <Label htmlFor="sd-aud">Audience</Label>
              <input id="sd-aud" className={inputClass} value={series.audience} onChange={(e) => set('audience', e.target.value)} />
            </div>
            <div>
              <Label>Color</Label>
              <ColorPicker value={series.color} onChange={(color) => set('color', color)} />
            </div>
            <div>
              <Label htmlFor="sd-big">Series theme</Label>
              <TextArea id="sd-big" minRows={2} value={series.bigIdea} onChange={(e) => set('bigIdea', e.target.value)} placeholder="The one idea that ties every lesson together" />
            </div>
            <div>
              <Label htmlFor="sd-mv">Memory verse</Label>
              <TextArea id="sd-mv" minRows={2} value={series.memoryVerse} onChange={(e) => set('memoryVerse', e.target.value)} placeholder="Verse text (reference)" />
            </div>
            <div>
              <Label htmlFor="sd-lg">Leader guide</Label>
              <TextArea id="sd-lg" minRows={4} value={series.leaderGuide} onChange={(e) => set('leaderGuide', e.target.value)} placeholder="A welcome letter to your leaders. It opens the printed series book." />
            </div>
            <div>
              <Label htmlFor="sd-desc">Description</Label>
              <TextArea id="sd-desc" minRows={3} value={series.description} onChange={(e) => set('description', e.target.value)} placeholder="An overview for leaders and parents" />
            </div>
          </div>
        </aside>
      </div>

      <DesignDialog open={designOpen} onClose={() => setDesignOpen(false)} series={series} weeks={lessons} />
      <NewServiceDialog open={addOpen} onClose={() => setAddOpen(false)} seriesId={series.id} />
    </div>
  );
};

// ---------- Lessons: the table of contents ----------

const LessonsTab: React.FC<{ series: Series; lessons: Service[]; onAdd: () => void }> = ({ series, lessons, onAdd }) => {
  const { reorderWeeks, addWeeks, deleteService, toast } = useStore();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = lessons.map((w) => w.id);
    reorderWeeks(series.id, arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };
  const legend = lessons[0]?.sections.filter((s) => visibleParts(s).length > 0) ?? [];

  if (!lessons.length) {
    return (
      <div className="border-2 border-dashed border-line rounded-2xl bg-white">
        <EmptyState icon={FileText} title="No lessons yet">
          <div className="mt-3"><Button size="sm" icon={Plus} onClick={onAdd}>Add the first lesson</Button></div>
        </EmptyState>
      </div>
    );
  }
  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxis]}>
        <SortableContext items={lessons.map((w) => w.id)} strategy={verticalListSortingStrategy}>
          <ol className="bg-white border border-line rounded-2xl divide-y divide-line">
            {lessons.map((w) => (
              <LessonRow
                key={w.id}
                lesson={w}
                onDuplicate={() => { addWeeks(series.id, [cloneService(w, { title: `${w.title} (copy)`, checkedSupplies: [] })]); toast('Lesson duplicated'); }}
                onDelete={() => deleteService(w.id)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          {legend.map((s, i) => (
            <span key={s.id} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: SHAPE[i % SHAPE.length] }} />{s.title}</span>
          ))}
        </div>
        <span className="text-xs text-gray-400">Drag to reorder.</span>
      </div>
      <Button variant="outline" icon={Plus} className="w-full mt-3 border-dashed" onClick={onAdd}>Add lesson {lessons.length + 1}</Button>
    </>
  );
};

const LessonRow: React.FC<{ lesson: Service; onDuplicate: () => void; onDelete: () => void }> = ({ lesson, onDuplicate, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lesson.id });
  const r = readiness(lesson);
  const total = serviceMinutes(lesson) || 1;
  const sections = lesson.sections.filter((s) => visibleParts(s).length > 0);
  const todo = r.total - r.ready;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-stretch ${isDragging ? 'relative z-20 bg-white shadow-lift rounded-2xl' : ''}`}
    >
      <button type="button" className="px-2 text-gray-300 hover:text-ink cursor-grab active:cursor-grabbing touch-none" aria-label={`Reorder ${lesson.title}`} {...attributes} {...listeners}>
        <GripVertical className="w-4 h-4" />
      </button>
      <a href={`#/s/${lesson.id}`} className="flex-1 min-w-0 grid grid-cols-[40px_minmax(0,1fr)] md:grid-cols-[40px_minmax(0,1.5fr)_minmax(0,1fr)_76px] gap-x-4 gap-y-2 items-center py-4 pr-2 group">
        <span className="font-display text-xl text-gray-300 tabular-nums">{String(lesson.week ?? 0).padStart(2, '0')}</span>
        <span className="min-w-0">
          <span className="block font-semibold truncate group-hover:text-accent">{lesson.title}</span>
          <span className="block text-xs text-gray-500 truncate">{[lesson.scripture, todo ? `${todo} part${todo === 1 ? '' : 's'} to write` : 'Every part written'].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="col-start-2 md:col-start-auto flex h-2.5 rounded-full overflow-hidden bg-gray-100" title="Shape of the lesson">
          {sections.map((s, i) => (
            <span key={s.id} style={{ width: `${(sectionMinutes(s) / total) * 100}%`, background: SHAPE[i % SHAPE.length] }} title={`${s.title} · ${sectionMinutes(s)} min`} />
          ))}
        </span>
        <span className="hidden md:block text-sm text-gray-600 tabular-nums text-right">{serviceMinutes(lesson)} min</span>
      </a>
      <div className="p-2 self-center">
        <Menu label="Lesson actions">
          <MenuItem icon={FileText} onClick={() => navigate(`/s/${lesson.id}`)}>Open</MenuItem>
          <MenuItem icon={Copy} onClick={onDuplicate}>Duplicate</MenuItem>
          <MenuDivider />
          <MenuItem icon={Trash2} danger onClick={onDelete}>Delete lesson</MenuItem>
        </Menu>
      </div>
    </li>
  );
};

// ---------- When I teach it: runs ----------

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const runState = (run: TeachingRun, lessons: Service[], today: string) => {
  const dated = lessons.map((l) => run.dates[l.id] ?? '').filter((d) => ISO.test(d)).sort();
  if (!dated.length) return null;
  if (today > dated[dated.length - 1]) return { label: 'Taught', tone: 'bg-gray-100 text-gray-700' };
  if (today < dated[0]) return { label: 'Planned', tone: 'bg-indigo-100 text-indigo-900' };
  const next = lessons.findIndex((l) => (run.dates[l.id] ?? '') >= today);
  return { label: `Now · lesson ${next + 1} of ${lessons.length}`, tone: 'bg-emerald-100 text-emerald-900' };
};

const RunsTab: React.FC<{ series: Series; lessons: Service[] }> = ({ series, lessons }) => {
  const { updateSeries, toast } = useStore();
  const today = todayISO();
  const [name, setName] = useState('');
  const [pace, setPace] = useState<RunPace>('weekly');
  const [first, setFirst] = useState(today);
  const [time, setTime] = useState('');

  const save = (fn: (s: Series) => Series) => updateSeries(series.id, fn);
  const updateRun = (id: string, fn: (r: TeachingRun) => TeachingRun) => save((s) => ({ ...s, runs: s.runs.map((r) => (r.id === id ? fn(r) : r)) }));
  const removeRun = (run: TeachingRun) => {
    save((s) => ({ ...s, runs: s.runs.filter((r) => r.id !== run.id), printRun: s.printRun === run.id ? '' : s.printRun }));
    toast(`Removed "${run.name}"`, () => save((s) => ({ ...s, runs: [...s.runs, run] })));
  };
  const addRun = (e: React.FormEvent) => {
    e.preventDefault();
    const run = newRun({ name: name.trim() || `${series.title} · ${new Date(`${first || today}T12:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`, time, dates: planDates(lessons, first, pace) });
    save((s) => ({ ...s, runs: [run, ...s.runs] }));
    setName('');
    toast(`Added "${run.name}"`);
  };

  return (
    <div className="space-y-4">
      <p className="text-gray-600 max-w-2xl">
        The series itself has no dates. Each time you teach it, add a run. A run only adds dates and times to what you print; the lessons stay the same.
      </p>

      <fieldset className="bg-white border border-line rounded-2xl p-4">
        <legend className="sr-only">Dates on printouts</legend>
        <p className="text-sm font-semibold mb-2">Dates on printouts</p>
        <div className="flex flex-col gap-1.5 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name="print-run" className="accent-indigo-600" checked={!series.printRun} onChange={() => save((s) => ({ ...s, printRun: '' }))} /> No dates (print the series as a book)</label>
          {series.runs.map((r) => (
            <label key={r.id} className="flex items-center gap-2"><input type="radio" name="print-run" className="accent-indigo-600" checked={series.printRun === r.id} onChange={() => save((s) => ({ ...s, printRun: r.id }))} /> Dates from {r.name}</label>
          ))}
        </div>
      </fieldset>

      {series.runs.map((run) => {
        const state = runState(run, lessons, today);
        const labels = run.labels;
        return (
          <article key={run.id} className="bg-white border border-line rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input aria-label="Run name" value={run.name} onChange={(e) => updateRun(run.id, (r) => ({ ...r, name: e.target.value }))} className="font-semibold text-base bg-transparent rounded px-1 -mx-1 focus:bg-canvas focus:outline-none focus:ring-2 focus:ring-accent/20 min-w-0 flex-1" />
              {state && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${state.tone}`}>{state.label}</span>}
              {series.printRun === run.id && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-accent-soft text-accent">On printouts</span>}
              <label className="text-sm text-gray-600 inline-flex items-center gap-1.5">Starts at
                <input type="time" value={run.time} onChange={(e) => updateRun(run.id, (r) => ({ ...r, time: e.target.value }))} className="border border-line rounded-md px-1.5 py-1 text-sm" />
              </label>
              <Menu label="Run actions">
                <MenuItem icon={CalendarDays} onClick={() => updateRun(run.id, (r) => ({ ...r, labels: !labels, dates: Object.fromEntries(Object.entries(r.dates).map(([k, v]) => [k, labels ? (ISO.test(v) ? v : '') : v ? shortWhen(v) : ''])) }))}>
                  {labels ? 'Use calendar dates' : 'Use labels instead (camp, retreat)'}
                </MenuItem>
                <MenuDivider />
                <MenuItem icon={Trash2} danger onClick={() => removeRun(run)}>Remove run</MenuItem>
              </Menu>
            </div>
            <ol className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
              {lessons.map((l) => {
                const value = run.dates[l.id] ?? '';
                const past = ISO.test(value) && value < today;
                return (
                  <li key={l.id} className={`rounded-xl border px-3 py-2 ${past ? 'bg-gray-50 border-gray-100' : 'border-line'}`}>
                    <label className="block">
                      <span className="block text-xs text-gray-500 truncate">{String(l.week ?? 0).padStart(2, '0')} · {l.title}</span>
                      <input
                        type={labels ? 'text' : 'date'}
                        value={value}
                        placeholder={labels ? 'e.g. Sat morning' : undefined}
                        onChange={(e) => updateRun(run.id, (r) => ({ ...r, dates: { ...r.dates, [l.id]: e.target.value } }))}
                        className="mt-1 w-full bg-transparent text-sm font-semibold focus:outline-none"
                      />
                    </label>
                  </li>
                );
              })}
            </ol>
          </article>
        );
      })}

      <form onSubmit={addRun} className="bg-white border border-line rounded-2xl p-4 space-y-3">
        <h3 className="font-semibold">Teach this series {series.runs.length ? 'again' : ''}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_170px_120px] gap-3">
          <div>
            <Label htmlFor="run-name">Name</Label>
            <input id="run-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wednesday Youth · Fall 2026" />
          </div>
          <div>
            <Label htmlFor="run-first">First lesson</Label>
            <input id="run-first" type="date" className={inputClass} value={first} disabled={pace === 'custom'} onChange={(e) => setFirst(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="run-time">Start time</Label>
            <input id="run-time" type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <fieldset className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          <legend className="text-sm font-medium mb-1.5">How often</legend>
          {([['weekly', 'Every week'], ['daily', 'Back to back days (camp, retreat)'], ['custom', "I'll fill in each date"]] as const).map(([v, text]) => (
            <label key={v} className="inline-flex items-center gap-2"><input type="radio" name="run-pace" className="accent-indigo-600" checked={pace === v} onChange={() => setPace(v)} /> {text}</label>
          ))}
        </fieldset>
        <Button type="submit" icon={Plus}>Add run</Button>
      </form>
    </div>
  );
};
