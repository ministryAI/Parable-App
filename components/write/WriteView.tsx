import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CollisionDetection, DndContext, DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus } from 'lucide-react';
import { restrictToVerticalAxis } from '../dndModifiers';
import { Part, PartType, Section, Series, Service } from '../../types';
import { PART_TYPES, PART_TYPE_KEYS } from '../../lib/partTypes';
import { newPart, newSection } from '../../lib/factory';
import { formatDuration, sectionMinutes, serviceMinutes } from '../../lib/time';
import { designOf, resolvePalette } from '../../lib/design';
import { SectionActions } from '../SectionCard';
import { Inspector, Selection } from './Inspector';

// The lesson as one page: write straight onto it, the way it prints. Labels and timing sit in the
// left margin, just like the printed book. Click a part to see its details in the inspector.

const GUTTER = 'grid grid-cols-[76px_minmax(0,1fr)] gap-x-5';

// Parts are tall, so drop where the pointer is, not where the middle of the dragged part happens to be.
const pointerFirst: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCenter(args);
};

// A textarea that looks like page text and grows with what you type.
const PageText = React.forwardRef<HTMLTextAreaElement, {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
  label: string;
  show: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}>(({ value, onChange, placeholder, className = '', label, show, onKeyDown }, outer) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  React.useImperativeHandle(outer, () => ref.current!, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, show]);
  if (!show) return null;
  return (
    <textarea
      ref={ref}
      rows={1}
      aria-label={label}
      value={value}
      placeholder={placeholder}
      onKeyDown={onKeyDown}
      onChange={(e) => onChange(e.target.value)}
      className={`block w-full resize-none overflow-hidden bg-transparent border-0 p-0 focus:outline-none focus:ring-0 placeholder:text-gray-300 ${className}`}
    />
  );
});
PageText.displayName = 'PageText';

// Typing "/" at the start of a line: pick a part type to add right after this one.
const SlashMenu: React.FC<{ onPick: (t: PartType) => void; onClose: () => void }> = ({ onPick, onClose }) => {
  const [query, setQuery] = useState('');
  const [hot, setHot] = useState(0);
  const q = query.trim().toLowerCase();
  const matches = PART_TYPE_KEYS.filter((k) => !q || PART_TYPES[k].label.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || PART_TYPES[k].label.toLowerCase().startsWith(q));
  const pick = (k?: PartType) => (k ? onPick(k) : onClose());
  return (
    <div className="absolute left-0 z-40 mt-1 w-[260px] bg-white rounded-xl shadow-lift p-1.5 animate-fade" onMouseDown={(e) => e.preventDefault()}>
      <input
        autoFocus
        aria-label="Add a part"
        value={query}
        placeholder="Add a part…"
        onChange={(e) => { setQuery(e.target.value); setHot(0); }}
        onBlur={onClose}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHot((h) => Math.min(h + 1, matches.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHot((h) => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); pick(matches[hot]); }
          else if (e.key === 'Escape' || (e.key === 'Backspace' && !query)) { e.preventDefault(); e.stopPropagation(); onClose(); }
        }}
        className="w-full px-2.5 py-1.5 text-[13px] rounded-lg bg-black/[0.04] focus:outline-none mb-1"
      />
      {matches.length === 0 && <p className="px-2.5 py-2 text-[13px] text-gray-400">No part type called "{query}"</p>}
      <div className="max-h-[260px] overflow-y-auto">
        {matches.map((k, i) => {
          const { label, icon: Icon } = PART_TYPES[k];
          return (
            <button key={k} type="button" onMouseEnter={() => setHot(i)} onClick={() => pick(k)} className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] text-left ${i === hot ? 'bg-accent text-white' : 'text-gray-800'}`}>
              <Icon className="w-4 h-4 shrink-0" />{label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const MarginLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="pt-[3px] text-[10px] font-semibold tracking-[0.14em] uppercase text-gray-400 text-right">{children}</span>
);

const AddPart: React.FC<{ onAdd: (type: PartType) => void; quiet?: boolean }> = ({ onAdd, quiet }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div ref={ref} className={`${GUTTER} relative`}>
      <span />
      <div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`inline-flex items-center gap-1.5 text-[13px] rounded-full px-2.5 py-1 transition-opacity ${quiet ? 'opacity-0 group-hover/sec:opacity-100 focus:opacity-100' : ''} ${open ? 'opacity-100 bg-black/[0.05]' : ''} text-gray-500 hover:text-accent hover:bg-black/[0.04]`}
        >
          <Plus className="w-3.5 h-3.5" /> Add part
        </button>
        {open && (
          <div className="absolute z-30 mt-1 w-[380px] bg-white rounded-xl shadow-lift p-2 grid grid-cols-3 gap-1 animate-fade">
            {PART_TYPE_KEYS.map((k) => {
              const { label, icon: Icon } = PART_TYPES[k];
              return (
                <button key={k} type="button" onClick={() => { onAdd(k); setOpen(false); }} className="flex flex-col items-center gap-1.5 rounded-lg px-1 py-2.5 text-[12px] text-gray-700 hover:bg-accent hover:text-white">
                  <Icon className="w-5 h-5" />
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// One part on the page. Its grip sits in the margin; "/" at the start of a line adds a part after it.
const PartBlock: React.FC<{
  part: Part;
  accent: string;
  time: string;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<Part>) => void;
  onAddAfter: (t: PartType) => void;
}> = ({ part, accent, time, selected, onSelect, onChange, onAddAfter }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: part.id });
  const [slash, setSlash] = useState<'do' | 'say' | null>(null);
  const fields = { do: useRef<HTMLTextAreaElement>(null), say: useRef<HTMLTextAreaElement>(null) };
  const { icon: Icon, label } = PART_TYPES[part.type];
  const supplies = part.supplies.filter((s) => s.name.trim());
  const onKey = (which: 'do' | 'say') => (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const atLineStart = el.selectionStart === el.selectionEnd && (el.selectionStart === 0 || el.value[el.selectionStart - 1] === '\n');
    if (e.key === '/' && atLineStart) {
      e.preventDefault();
      setSlash(which);
    }
  };
  const closeSlash = () => {
    const which = slash;
    setSlash(null);
    if (which) requestAnimationFrame(() => fields[which].current?.focus());
  };
  const menu = (which: 'do' | 'say') => slash === which && (
    <SlashMenu
      onClose={closeSlash}
      onPick={(t) => {
        // The empty line the "/" was typed on goes away with it.
        const key = which === 'do' ? 'instructions' : 'script';
        if (/\s$/.test(part[key])) onChange({ [key]: part[key].replace(/\s+$/, '') });
        setSlash(null);
        onAddAfter(t);
      }}
    />
  );

  return (
    <div
      ref={setNodeRef}
      id={`part-${part.id}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onMouseDown={() => !selected && onSelect()}
      className={`group/part scroll-mt-24 relative -mx-4 px-4 py-4 rounded-xl transition-colors ${isDragging ? 'z-20 bg-white shadow-lift ring-1 ring-black/5' : selected ? 'bg-accent/[0.045] ring-1 ring-accent/25' : 'hover:bg-black/[0.018]'} ${part.hidden ? 'opacity-45' : ''} ${part.optional ? 'border-l-2 border-dashed border-gray-300' : ''}`}
    >
      <button
        type="button"
        aria-label={`Move ${part.title}`}
        title="Drag to move"
        className={`absolute -left-3 top-6 p-1 rounded-md text-gray-400 hover:text-ink hover:bg-black/[0.05] cursor-grab active:cursor-grabbing touch-none transition-opacity ${selected || isDragging ? 'opacity-100' : 'opacity-0 group-hover/part:opacity-100 focus:opacity-100'}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className={GUTTER}>
        <span className="pt-6 text-[11px] leading-tight text-gray-400 text-right tabular-nums">
          <b className="block font-semibold text-gray-500">{time}</b>
          {part.minutes} min
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[10px] font-semibold tracking-[0.16em] uppercase mb-0.5" style={{ color: accent }}>
            <Icon className="w-3 h-3" />{label}{part.optional && ' · going deeper'}
          </p>
          <input
            aria-label="Part title"
            value={part.title}
            onChange={(e) => onChange({ title: e.target.value })}
            className="w-full bg-transparent font-display text-[19px] font-semibold tracking-[-0.012em] focus:outline-none"
          />
        </div>
      </div>

      {supplies.length > 0 && (
        <div className={`${GUTTER} mt-2`}>
          <MarginLabel>Need</MarginLabel>
          <p className="text-[13px] text-gray-600">
            {supplies.map((s, i) => (
              <span key={s.id}>{i > 0 && <span className="text-gray-300 mx-1.5">·</span>}<b className="font-semibold tabular-nums" style={{ color: accent }}>{s.qty}</b> {s.name}</span>
            ))}
          </p>
        </div>
      )}

      {(part.instructions || selected) && (
        <div className={`${GUTTER} mt-3`}>
          <MarginLabel>Do</MarginLabel>
          <div className="relative">
            <PageText ref={fields.do} show label="What the leader does" value={part.instructions} onChange={(instructions) => onChange({ instructions })} onKeyDown={onKey('do')} placeholder="What the leader does: setup, how to run it, how to wrap up." className="text-[14px] leading-relaxed text-gray-700" />
            {menu('do')}
          </div>
        </div>
      )}

      {(part.script || selected) && (
        <div className={`${GUTTER} mt-3`}>
          <MarginLabel>Say</MarginLabel>
          <div className="relative border-l-2 pl-4" style={{ borderColor: accent }}>
            <PageText ref={fields.say} show label="What the leader says" value={part.script} onChange={(script) => onChange({ script })} onKeyDown={onKey('say')} placeholder="What the leader says, word for word. [Brackets] for actions. Type / on a new line to add a part." className="text-[16px] leading-[1.6] text-ink font-['Source_Serif_4_Variable',Georgia,serif]" />
            {menu('say')}
          </div>
        </div>
      )}

      {part.inclusionTips.trim() && (
        <div className={`${GUTTER} mt-3`}>
          <MarginLabel>Every kid</MarginLabel>
          <p className="text-[13px] leading-relaxed text-emerald-800 bg-emerald-500/[0.07] rounded-lg px-3 py-2 whitespace-pre-line">{part.inclusionTips}</p>
        </div>
      )}
      {part.leaderNotes.trim() && (
        <div className={`${GUTTER} mt-3`}>
          <MarginLabel>Note</MarginLabel>
          <p className="text-[13px] leading-relaxed text-amber-900 bg-amber-500/[0.08] rounded-lg px-3 py-2 whitespace-pre-line">{part.leaderNotes}</p>
        </div>
      )}
    </div>
  );
};

interface Props {
  service: Service;
  series?: Series;
  schedule: Record<string, string>;
  update: (fn: (s: Service) => Service) => void;
  actions: SectionActions;
}

export const WriteView: React.FC<Props> = ({ service, series, schedule, update, actions }) => {
  const [sel, setSel] = useState<Selection>(null);
  const accent = resolvePalette(designOf(series)).accentText;

  // The sidebar (and anything else) can select a part on the page.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const section = service.sections.find((s) => s.parts.some((p) => p.id === id));
      if (section) setSel({ kind: 'part', sectionId: section.id, partId: id });
    };
    window.addEventListener('parable:open-part', onOpen);
    return () => window.removeEventListener('parable:open-part', onOpen);
  }, [service.sections]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target as HTMLElement)?.closest?.('[aria-label="Add a part"]') && setSel(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const setPart = (sectionId: string, partId: string, fn: (p: Part) => Part) =>
    actions.updateSection(sectionId, (s) => ({ ...s, parts: s.parts.map((p) => (p.id === partId ? fn(p) : p)) }));
  const addPart = (section: Section, type: PartType, after?: string) => {
    const part = newPart({ type, title: PART_TYPES[type].label, minutes: 5 });
    actions.updateSection(section.id, (s) => {
      const i = after ? s.parts.findIndex((p) => p.id === after) + 1 : s.parts.length;
      return { ...s, collapsed: false, parts: [...s.parts.slice(0, i), part, ...s.parts.slice(i)] };
    });
    setSel({ kind: 'part', sectionId: section.id, partId: part.id });
    setTimeout(() => document.querySelector<HTMLInputElement>(`#part-${part.id} input`)?.select(), 60);
  };

  // Drag a part by its grip: within its section, or onto a part in another section.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    update((s) => {
      const from = s.sections.find((sec) => sec.parts.some((p) => p.id === active.id));
      const to = s.sections.find((sec) => sec.parts.some((p) => p.id === over.id));
      if (!from || !to) return s;
      const moving = from.parts.find((p) => p.id === active.id)!;
      if (from.id === to.id) {
        const a = from.parts.findIndex((p) => p.id === active.id);
        const b = from.parts.findIndex((p) => p.id === over.id);
        return { ...s, sections: s.sections.map((sec) => (sec.id === from.id ? { ...sec, parts: arrayMove(sec.parts, a, b) } : sec)) };
      }
      const at = to.parts.findIndex((p) => p.id === over.id);
      return {
        ...s,
        sections: s.sections.map((sec) =>
          sec.id === from.id ? { ...sec, parts: sec.parts.filter((p) => p.id !== active.id) }
          : sec.id === to.id ? { ...sec, parts: [...sec.parts.slice(0, at), moving, ...sec.parts.slice(at)] }
          : sec),
      };
    });
    if (sel?.kind === 'part' && sel.partId === active.id) {
      const to = service.sections.find((sec) => sec.parts.some((p) => p.id === over.id));
      if (to) setSel({ kind: 'part', sectionId: to.id, partId: String(active.id) });
    }
  };

  const eyebrow = [series && service.week ? `Week ${service.week}` : '', series?.title ?? '', service.audience].filter(Boolean).join(' · ');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
      {/* The page */}
      <div className="min-w-0" onMouseDown={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
        <article
          className="bg-white rounded-[10px] shadow-[0_0_0_0.5px_rgb(0_0_0/0.08),0_2px_6px_rgb(0_0_0/0.04),0_24px_60px_-28px_rgb(0_0_0/0.28)] px-6 sm:px-12 py-12 max-w-[860px] mx-auto"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setSel(null); }}
        >
          <header className={`${GUTTER} mb-10`}>
            <span />
            <div>
              <p className="text-[11px] font-semibold tracking-[0.14em] uppercase mb-2" style={{ color: accent }}>{eyebrow}</p>
              <PageText show label="Lesson title" value={service.title} onChange={(title) => update((s) => ({ ...s, title }))} placeholder="Lesson title" className="font-display text-[40px] leading-[1.05] font-bold tracking-[-0.028em] text-ink" />
              <PageText show label="Big idea" value={service.bigIdea} onChange={(bigIdea) => update((s) => ({ ...s, bigIdea }))} placeholder="The one idea this lesson is about" className="mt-3 text-[19px] leading-snug italic text-gray-600 font-['Source_Serif_4_Variable',Georgia,serif]" />
              <p className="mt-4 text-[13px] text-gray-500">{service.scripture && <>{service.scripture} · </>}{formatDuration(serviceMinutes(service))}</p>
            </div>
          </header>

          <DndContext sensors={sensors} collisionDetection={pointerFirst} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxis]}>
          {service.sections.map((section, si) => {
            const sectionSelected = sel?.kind === 'section' && sel.id === section.id;
            return (
              <section key={section.id} className={`group/sec mb-10 ${section.hidden ? 'opacity-45' : ''}`}>
                <div
                  className={`${GUTTER} items-end pb-2 mb-4 border-b-2 cursor-text ${sectionSelected ? 'border-accent' : 'border-ink'}`}
                  onClick={() => setSel({ kind: 'section', id: section.id })}
                >
                  <span className="pb-1 text-[11px] leading-tight text-gray-400 text-right tabular-nums">
                    <b className="block font-semibold text-gray-500">{schedule[section.id] ?? ''}</b>
                    {sectionMinutes(section)} min
                  </span>
                  <div>
                    <p className="text-[10px] font-semibold tracking-[0.16em] uppercase mb-0.5" style={{ color: accent }}>
                      Part {si + 1} · {section.role === 'small' ? 'Small groups' : section.role === 'large' ? 'Large group' : 'Everyone'}
                    </p>
                    <input
                      aria-label="Section title"
                      value={section.title}
                      onChange={(e) => actions.updateSection(section.id, (s) => ({ ...s, title: e.target.value }))}
                      onFocus={() => setSel({ kind: 'section', id: section.id })}
                      className="w-full bg-transparent font-display text-[28px] font-bold tracking-[-0.02em] leading-tight focus:outline-none"
                    />
                  </div>
                </div>

                <SortableContext items={section.parts.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                  {section.parts.map((part) => (
                    <PartBlock
                      key={part.id}
                      part={part}
                      accent={accent}
                      time={part.optional ? 'Extra' : schedule[part.id] ?? ''}
                      selected={sel?.kind === 'part' && sel.partId === part.id}
                      onSelect={() => setSel({ kind: 'part', sectionId: section.id, partId: part.id })}
                      onChange={(patch) => setPart(section.id, part.id, (p) => ({ ...p, ...patch }))}
                      onAddAfter={(t) => addPart(section, t, part.id)}
                    />
                  ))}
                </SortableContext>

                <div className="mt-2"><AddPart quiet={section.parts.length > 0} onAdd={(t) => addPart(section, t)} /></div>
              </section>
            );
          })}
          </DndContext>

          <div className={GUTTER}>
            <span />
            <button
              type="button"
              onClick={() => {
                const section = newSection({ title: 'New section', role: 'large' });
                update((s) => ({ ...s, sections: [...s.sections, section] }));
                setSel({ kind: 'section', id: section.id });
              }}
              className="justify-self-start inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-accent rounded-full px-2.5 py-1 hover:bg-black/[0.04]"
            >
              <Plus className="w-3.5 h-3.5" /> Add section
            </button>
          </div>
        </article>
      </div>

      {/* The inspector */}
      <Inspector service={service} sel={sel} setSel={setSel} update={update} actions={actions} setPart={setPart} />
    </div>
  );
};
