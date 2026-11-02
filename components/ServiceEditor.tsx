import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { DndContext, DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ArrowLeft, BookOpen, Clock, Copy, Download, Eye, EyeOff, FileText, LayoutList, Package, PanelRight, Plus, Printer, Scissors, Sunrise, Trash2, Users } from 'lucide-react';
import { Part, Section, Service } from '../types';
import { cloneSection, clonePart, cloneService, newSection } from '../lib/factory';
import { COLOR_CLASSES, weeksOf } from '../lib/series';
import { buildElapsed, formatDuration, serviceMinutes, visibleParts } from '../lib/time';
import { downloadJson, slug } from '../lib/files';
import { navigate } from '../lib/route';
import { JUMP_EVENT, useSidebarShown } from '../lib/sidebar';
import { useStore } from '../store/StoreContext';
import { restrictToVerticalAxis } from './dndModifiers';
import { SectionActions, SectionCard } from './SectionCard';
import { SidePanel } from './SidePanel';
import { PreviewKind, PrintPreview } from './print/PrintView';
import { Button, EmptyState, Menu, MenuDivider, MenuItem } from './ui';

const PREVIEW_KEY = 'parable.preview';
const PREVIEW_KINDS: { id: PreviewKind; label: string }[] = [
  { id: 'week', label: 'Whole lesson' },
  { id: 'lesson', label: 'Lesson' },
  { id: 'small', label: 'Small group' },
  { id: 'family', label: 'Family' },
  { id: 'takehome', label: 'Take-home' },
  { id: 'run-sheet', label: 'Run sheet' },
];
const readPref = <T,>(fallback: T): T => {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(PREVIEW_KEY) || '{}') };
  } catch {
    return fallback;
  }
};

export const ServiceEditor: React.FC<{ serviceId: string; focusPartId?: string }> = ({ serviceId, focusPartId }) => {
  const sidebarShown = useSidebarShown();
  // The sidebar's part links land here.
  const openPartRef = React.useRef<(partId: string) => void>(() => {});
  useEffect(() => {
    const onJump = (e: Event) => openPartRef.current((e as CustomEvent<string>).detail);
    window.addEventListener(JUMP_EVENT, onJump);
    return () => window.removeEventListener(JUMP_EVENT, onJump);
  }, []);
  const { db, updateService, addServices, addWeeks, deleteService, toast, print } = useStore();
  const found = db.services.find((s) => s.id === serviceId);
  const series = found?.seriesId ? db.series.find((s) => s.id === found.seriesId) : undefined;
  // Carry the series along so AI helpers can match the series theme.
  const service = useMemo(() => (found ? { ...found, seriesInfo: series } : undefined), [found, series]);
  const [openPartIds, setOpenPartIds] = useState<Set<string>>(() => new Set(focusPartId ? [focusPartId] : []));
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // Times count from the start of the lesson (0:00, 0:04…); clock times belong to a run, not the lesson.
  const schedule = useMemo(() => (service ? buildElapsed(service) : {}), [service]);
  // Live preview of the printed pages beside the editor; the choice is remembered per browser.
  const [pref, setPref] = useState(() => readPref<{ on: boolean; kind: PreviewKind; panel: 'preview' | 'details' }>({ on: true, kind: 'week', panel: 'preview' }));
  const savePref = (next: Partial<typeof pref>) => {
    const merged = { ...pref, ...next };
    setPref(merged);
    try { localStorage.setItem(PREVIEW_KEY, JSON.stringify(merged)); } catch { /* preference only */ }
  };
  const savePrefRef = React.useRef(savePref);
  savePrefRef.current = savePref;
  const previewService = useDeferredValue(service);
  const previewRef = React.useRef<HTMLDivElement>(null);
  // Whatever part you open, click or type in, the preview shows where it prints, and briefly lights it up.
  // Clicks count as well as focus: Safari doesn't focus a button when you click it.
  const liveRef = React.useRef({ pref, service });
  liveRef.current = { pref, service };
  const showInPreview = React.useCallback((partId: string) => {
    const { pref: p, service: svc } = liveRef.current;
    if (!p.on || p.panel !== 'preview' || !svc) return;
    const find = () => {
      const box = previewRef.current;
      if (!box) return null;
      const direct = box.querySelector<HTMLElement>(`[data-part="${partId}"]`);
      if (direct) return direct;
      // Small group parts print on the small group guide page, not one by one.
      const section = svc.sections.find((sec) => sec.parts.some((part) => part.id === partId));
      return section?.role === 'small' ? box.querySelector<HTMLElement>('.pr-sg') : null;
    };
    const go = (el: HTMLElement) => {
      const box = previewRef.current!;
      box.scrollTo({ top: box.scrollTop + el.getBoundingClientRect().top - box.getBoundingClientRect().top - 24, behavior: 'smooth' });
      el.classList.remove('pv-flash');
      void el.offsetWidth;
      el.classList.add('pv-flash');
      setTimeout(() => el.classList.remove('pv-flash'), 1600);
    };
    const el = find();
    if (el) go(el);
    else if (p.kind !== 'week') {
      // The part isn't on the pages being previewed (say, Family): switch to the whole lesson, then show it.
      savePrefRef.current({ kind: 'week' });
      setTimeout(() => { const later = find(); if (later) go(later); }, 300);
    }
  }, []);
  const followInPreview = (e: React.SyntheticEvent) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[id^="part-"]')?.id.slice(5);
    if (id) showInPreview(id);
  };

  // Arriving from a dashboard link: expand that part's section and scroll to it.
  useEffect(() => {
    if (!focusPartId) return;
    const section = service?.sections.find((s) => s.parts.some((p) => p.id === focusPartId));
    if (section?.collapsed) updateService(serviceId, (s) => ({ ...s, sections: s.sections.map((x) => (x.id === section.id ? { ...x, collapsed: false } : x)) }));
    const t = setTimeout(() => document.getElementById(`part-${focusPartId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    return () => clearTimeout(t);
  }, [focusPartId]);

  if (!service) {
    return (
      <div className="max-w-xl mx-auto py-20">
        <EmptyState icon={FileText} title="Service not found">
          It may have been deleted. <button className="underline" onClick={() => navigate('/series')}>Back to series</button>
        </EmptyState>
      </div>
    );
  }

  const update = (fn: (s: Service) => Service) => updateService(service.id, fn);
  const mapSections = (fn: (sections: Section[]) => Section[]) => update((s) => ({ ...s, sections: fn(s.sections) }));

  const actions: SectionActions = {
    updateSection: (id, fn) => mapSections((secs) => secs.map((s) => (s.id === id ? fn(s) : s))),
    deleteSection: (id) => {
      const index = service.sections.findIndex((s) => s.id === id);
      const removed = service.sections[index];
      mapSections((secs) => secs.filter((s) => s.id !== id));
      toast(`Deleted section "${removed.title}"`, () =>
        mapSections((secs) => [...secs.slice(0, index), removed, ...secs.slice(index)]),
      );
    },
    duplicateSection: (id) =>
      mapSections((secs) => secs.flatMap((s) => (s.id === id ? [s, { ...cloneSection(s), title: `${s.title} (copy)` }] : [s]))),
    addParts: (sectionId, parts) => {
      setOpenPartIds((ids) => new Set([...ids, ...parts.map((p) => p.id)]));
      mapSections((secs) => secs.map((s) => (s.id === sectionId ? { ...s, collapsed: false, parts: [...s.parts, ...parts] } : s)));
    },
    deletePart: (sectionId, partId) => {
      const section = service.sections.find((s) => s.id === sectionId);
      const index = section?.parts.findIndex((p) => p.id === partId) ?? -1;
      const removed = section?.parts[index];
      if (!removed) return;
      mapSections((secs) => secs.map((s) => (s.id === sectionId ? { ...s, parts: s.parts.filter((p) => p.id !== partId) } : s)));
      toast(`Deleted "${removed.title}"`, () =>
        mapSections((secs) => secs.map((s) => (s.id === sectionId ? { ...s, parts: [...s.parts.slice(0, index), removed, ...s.parts.slice(index)] } : s))),
      );
    },
    duplicatePart: (sectionId, partId) =>
      mapSections((secs) => secs.map((s) => (s.id === sectionId ? { ...s, parts: s.parts.flatMap((p) => (p.id === partId ? [p, clonePart(p)] : [p])) } : s))),
    movePart: (fromId, partId, toId) =>
      mapSections((secs) => {
        const part = secs.find((s) => s.id === fromId)?.parts.find((p) => p.id === partId);
        if (!part) return secs;
        return secs.map((s) =>
          s.id === fromId ? { ...s, parts: s.parts.filter((p) => p.id !== partId) } : s.id === toId ? { ...s, collapsed: false, parts: [...s.parts, part] } : s,
        );
      }),
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    mapSections((secs) => {
      const from = secs.findIndex((s) => s.id === active.id);
      const to = secs.findIndex((s) => s.id === over.id);
      return from < 0 || to < 0 ? secs : arrayMove(secs, from, to);
    });
  };

  const addSection = () => mapSections((secs) => [...secs, newSection({ title: 'New section' })]);
  const allCollapsed = service.sections.length > 0 && service.sections.every((s) => s.collapsed);
  const duplicate = () => {
    const { seriesInfo: _, ...plain } = service;
    const copy = cloneService(plain, { title: `${service.title} (copy)`, checkedSupplies: [] });
    if (series) addWeeks(series.id, [copy]);
    else addServices([copy]);
    navigate(`/s/${copy.id}`);
    toast('Lesson duplicated');
  };
  const openPart = (partId: string) => {
    // A collapsed section mounts its parts on the next render, so open it via both routes.
    setOpenPartIds((ids) => new Set([...ids, partId]));
    jumpToPart(partId);
    setTimeout(() => window.dispatchEvent(new CustomEvent('parable:open-part', { detail: partId })), 50);
    setTimeout(() => showInPreview(partId), 120);
  };
  openPartRef.current = openPart;
  const jumpToPart = (partId: string) => {
    const section = service.sections.find((s) => s.parts.some((p: Part) => p.id === partId));
    if (section?.collapsed) actions.updateSection(section.id, (s) => ({ ...s, collapsed: false }));
    requestAnimationFrame(() => document.getElementById(`part-${partId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <div className={`${pref.on ? 'max-w-[1680px]' : 'max-w-7xl'} mx-auto px-4 md:px-6 pb-24`}>
      <div className="flex items-center gap-2 text-sm text-gray-500 py-3">
        <button type="button" onClick={() => navigate('/')} className="inline-flex items-center gap-1 hover:text-ink">
          <ArrowLeft className="w-4 h-4" /> Shelf
        </button>
        {series && (
          <>
            <span>/</span>
            <button type="button" onClick={() => navigate(`/series/${series.id}`)} className="inline-flex items-center gap-1.5 truncate hover:text-ink">
              <span className={`w-2 h-2 rounded-full ${COLOR_CLASSES[series.color].dot}`} />{series.title}
            </button>
          </>
        )}
      </div>

      <header className="flex flex-col md:flex-row md:items-end gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <input
            value={service.title}
            onChange={(e) => update((s) => ({ ...s, title: e.target.value }))}
            aria-label="Lesson title"
            className="w-full bg-transparent font-display text-3xl md:text-4xl leading-tight rounded px-1 -mx-1 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 mt-2">
            {series && service.week && <span className="font-semibold">Lesson {service.week} of {series.title}</span>}
            <span className="inline-flex items-center gap-1"><Users className="w-4 h-4" />{service.audience} · {service.classSize} kids</span>
            <span className="inline-flex items-center gap-1 font-semibold text-ink"><Clock className="w-4 h-4" />{formatDuration(serviceMinutes(service))}</span>
          </div>
          {service.bigIdea && <p className="mt-2 text-gray-700 italic">{service.bigIdea}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button type="button" variant="outline" icon={pref.on ? EyeOff : Eye} onClick={() => savePref({ on: !pref.on })} className="hidden lg:inline-flex">
            {pref.on ? 'Hide preview' : 'Preview'}
          </Button>
          <Menu trigger={<Button type="button" icon={Printer}>Print</Button>}>
            <MenuItem icon={BookOpen} onClick={() => print(service.id, { kind: 'week' })}>Whole lesson (large group, small group, family)</MenuItem>
            <MenuItem icon={FileText} onClick={() => print(service.id, { kind: 'lesson' })}>Large group lesson</MenuItem>
            <MenuItem icon={Users} onClick={() => print(service.id, { kind: 'small' })}>Small group guide</MenuItem>
            <MenuItem icon={Sunrise} onClick={() => print(service.id, { kind: 'family' })}>Family page</MenuItem>
            <MenuItem icon={Scissors} onClick={() => print(service.id, { kind: 'takehome' })}>Take-home cards (2 per page)</MenuItem>
            <MenuDivider />
            <MenuItem icon={LayoutList} onClick={() => print(service.id, { kind: 'run-sheet' })}>Run sheet</MenuItem>
            <MenuItem icon={Package} onClick={() => print(service.id, { kind: 'supplies' })}>Supply list</MenuItem>
          </Menu>
          <Menu label="Lesson actions">
            <MenuItem icon={Copy} onClick={duplicate}>Duplicate lesson</MenuItem>
            <MenuItem icon={Download} onClick={() => downloadJson(`${slug(service.title)}.parable.json`, { version: 1, series: [], services: [found!], library: [] })}>Export file</MenuItem>
            <MenuItem icon={LayoutList} onClick={() => mapSections((secs) => secs.map((s) => ({ ...s, collapsed: !allCollapsed })))}>
              {allCollapsed ? 'Expand all sections' : 'Collapse all sections'}
            </MenuItem>
            <MenuDivider />
            <MenuItem icon={Trash2} danger onClick={() => { deleteService(service.id); navigate(series ? `/series/${series.id}` : '/'); }}>Delete lesson</MenuItem>
          </Menu>
        </div>
      </header>

      <div className={`grid grid-cols-1 gap-6 items-start ${
        sidebarShown
          ? pref.on ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]' : 'lg:grid-cols-[minmax(0,1fr)_380px]'
          : pref.on ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_minmax(0,1fr)] 2xl:grid-cols-[230px_minmax(0,5fr)_minmax(0,6fr)]' : 'lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[210px_minmax(0,1fr)_380px]'
      }`}>
        {!sidebarShown && <Outline service={service} lessons={series ? weeksOf(db, series.id) : [service]} onPart={openPart} />}
        <div className="space-y-4" onFocus={pref.on ? followInPreview : undefined} onClick={pref.on ? followInPreview : undefined}>
          {service.sections.length === 0 && (
            <div className="border-2 border-dashed border-gray-300 rounded-xl">
              <EmptyState icon={LayoutList} title="This lesson is empty">Add a section like "Worship" or "Small Groups", then add parts to it.</EmptyState>
            </div>
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxis]}>
            <SortableContext items={service.sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {service.sections.map((section) => (
                <SectionCard key={section.id} service={service} section={section} schedule={schedule} openPartIds={openPartIds} actions={actions} />
              ))}
            </SortableContext>
          </DndContext>
          <Button type="button" variant="outline" icon={Plus} onClick={addSection} className="w-full border-dashed">Add section</Button>
        </div>
        {pref.on ? (
          <div className="hidden lg:flex flex-col gap-3 lg:sticky lg:top-[76px] lg:h-[calc(100vh-92px)]">
            <div className="flex items-center gap-2 shrink-0">
              <div role="tablist" aria-label="Right panel" className="segmented">
                <button type="button" role="tab" aria-selected={pref.panel === 'preview'} onClick={() => savePref({ panel: 'preview' })} >
                  <Eye className="w-4 h-4" /> Preview
                </button>
                <button type="button" role="tab" aria-selected={pref.panel === 'details'} onClick={() => savePref({ panel: 'details' })} >
                  <PanelRight className="w-4 h-4" /> Details
                </button>
              </div>
              {pref.panel === 'preview' && (
                <select aria-label="Which pages to preview" value={pref.kind} onChange={(e) => savePref({ kind: e.target.value as PreviewKind })} className="ml-auto text-sm bg-white border border-line rounded-lg px-2 py-1.5">
                  {PREVIEW_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                </select>
              )}
            </div>
            {pref.panel === 'preview' ? (
              <div ref={previewRef} className="flex-1 min-h-0 overflow-y-auto rounded-xl">
                <PrintPreview service={previewService ?? service} series={series} kind={pref.kind} onPartClick={openPart} />
              </div>
            ) : (
              <div className="flex-1 min-h-0">
                <SidePanel service={service} update={update} onJumpToPart={jumpToPart} />
              </div>
            )}
          </div>
        ) : null}
        <div className={pref.on ? 'lg:hidden' : ''}>
          <SidePanel service={service} update={update} onJumpToPart={jumpToPart} />
        </div>
      </div>
    </div>
  );
};

// The writer's outline: every lesson in the series, and the open lesson's sections and parts.
const Outline: React.FC<{ service: Service; lessons: Service[]; onPart: (partId: string) => void }> = ({ service, lessons, onPart }) => (
  <nav aria-label="Outline" className="hidden xl:block sticky top-[76px] max-h-[calc(100vh-92px)] overflow-y-auto text-sm pr-1">
    <ol className="space-y-0.5">
      {lessons.map((l) => (
        <li key={l.id}>
          {l.id === service.id ? (
            <>
              <span className="flex gap-2 px-2 py-1.5 rounded-lg bg-accent-soft text-accent font-semibold">
                {l.week && <span className="tabular-nums opacity-70">{String(l.week).padStart(2, '0')}</span>}
                <span className="min-w-0">{l.title}</span>
              </span>
              <div className="ml-3 pl-3 border-l border-line my-1 space-y-2">
                {service.sections.filter((sec) => visibleParts(sec).length > 0).map((sec) => (
                  <div key={sec.id}>
                    <p className="px-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{sec.title}</p>
                    {visibleParts(sec).map((p) => (
                      <button key={p.id} type="button" onClick={() => onPart(p.id)} className="block w-full text-left px-2 py-1 rounded-md text-gray-600 hover:bg-white hover:text-ink truncate">
                        {p.title}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <a href={`#/s/${l.id}`} className="flex gap-2 px-2 py-1.5 rounded-lg text-gray-600 hover:bg-white hover:text-ink">
              {l.week && <span className="tabular-nums text-gray-400">{String(l.week).padStart(2, '0')}</span>}
              <span className="min-w-0 truncate">{l.title}</span>
            </a>
          )}
        </li>
      ))}
    </ol>
  </nav>
);
