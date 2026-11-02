import React from 'react';
import { ArrowRightLeft, Bookmark, Copy, ExternalLink, Minus, Plus, Trash2, X } from 'lucide-react';
import { LinkItem, Part, Section, SectionRole, Service, Supply } from '../../types';
import { PART_TYPES, PART_TYPE_KEYS } from '../../lib/partTypes';
import { newLink, newSupply } from '../../lib/factory';
import { PER_LABELS } from '../../lib/supplies';
import { formatDuration, sectionMinutes, serviceMinutes } from '../../lib/time';
import { draftPartText } from '../../services/aiService';
import { useStore } from '../../store/StoreContext';
import { AIAssist } from '../AIAssist';
import { SectionActions } from '../SectionCard';
import { SidePanel } from '../SidePanel';

export type Selection = { kind: 'part'; sectionId: string; partId: string } | { kind: 'section'; id: string } | null;

// Keynote-style inspector: what's selected on the page, and its settings. Nothing selected: the lesson.

const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="py-4 border-b border-black/[0.06] last:border-0">
    <h3 className="text-[12px] font-semibold text-gray-500 mb-2.5">{title}</h3>
    {children}
  </section>
);

const field = 'w-full bg-black/[0.04] rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:bg-white focus:ring-[3px] focus:ring-accent/25';

const Switch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <label className="flex items-center justify-between gap-3 py-1 text-[13px] text-gray-800 cursor-pointer">
    {label}
    <input type="checkbox" role="switch" className="sr-only peer" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span aria-hidden="true" className="relative w-[34px] h-5 shrink-0 rounded-full bg-gray-300 transition-colors peer-checked:bg-[#34C759] peer-focus-visible:ring-[3px] peer-focus-visible:ring-accent/40 after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-[14px]" />
  </label>
);

const Links: React.FC<{ items: LinkItem[]; onChange: (l: LinkItem[]) => void; noun: string }> = ({ items, onChange, noun }) => (
  <div className="space-y-2">
    {items.map((l) => (
      <div key={l.id} className="space-y-1">
        <div className="flex gap-1">
          <input className={field} value={l.label} placeholder="Name" aria-label={`${noun} name`} onChange={(e) => onChange(items.map((x) => (x.id === l.id ? { ...x, label: e.target.value } : x)))} />
          {/^https?:\/\//.test(l.url) && <a href={l.url} target="_blank" rel="noreferrer" className="p-1.5 rounded-md text-gray-500 hover:bg-black/5" aria-label="Open link"><ExternalLink className="w-4 h-4" /></a>}
          <button type="button" className="p-1.5 rounded-md text-gray-400 hover:bg-black/5 hover:text-ink" aria-label={`Remove ${noun}`} onClick={() => onChange(items.filter((x) => x.id !== l.id))}><X className="w-4 h-4" /></button>
        </div>
        <input className={field} value={l.url} placeholder="https://" aria-label={`${noun} link`} type="url" onChange={(e) => onChange(items.map((x) => (x.id === l.id ? { ...x, url: e.target.value } : x)))} />
      </div>
    ))}
    <button type="button" onClick={() => onChange([...items, newLink()])} className="inline-flex items-center gap-1 text-[13px] text-accent hover:underline"><Plus className="w-3.5 h-3.5" />Add {noun}</button>
  </div>
);

interface Props {
  service: Service;
  sel: Selection;
  setSel: (s: Selection) => void;
  update: (fn: (s: Service) => Service) => void;
  actions: SectionActions;
  setPart: (sectionId: string, partId: string, fn: (p: Part) => Part) => void;
}

export const Inspector: React.FC<Props> = ({ service, sel, setSel, update, actions, setPart }) => {
  const { aiSettings, saveToLibrary } = useStore();
  const shell = 'lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-88px)] overflow-y-auto bg-white rounded-2xl shadow-card px-5';

  if (sel?.kind === 'part') {
    const section = service.sections.find((s) => s.id === sel.sectionId);
    const part = section?.parts.find((p) => p.id === sel.partId);
    if (section && part) {
      const set = (patch: Partial<Part>) => setPart(section.id, part.id, (p) => ({ ...p, ...patch }));
      const setSupply = (id: string, patch: Partial<Supply>) => set({ supplies: part.supplies.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
      const others = service.sections.filter((s) => s.id !== section.id);
      return (
        <aside className={shell} aria-label="Part details">
          <div className="flex items-center justify-between pt-4">
            <p className="text-[15px] font-semibold truncate">{part.title || 'Part'}</p>
            <button type="button" onClick={() => setSel(null)} className="p-1 rounded-full text-gray-400 hover:bg-black/5 hover:text-ink" aria-label="Close details"><X className="w-4 h-4" /></button>
          </div>

          <Group title="Type">
            <div className="grid grid-cols-4 gap-1">
              {PART_TYPE_KEYS.map((k) => {
                const { label, icon: Icon } = PART_TYPES[k];
                const on = part.type === k;
                return (
                  <button key={k} type="button" title={label} onClick={() => set({ type: k })} className={`flex flex-col items-center gap-1 rounded-lg py-2 text-[10.5px] leading-tight ${on ? 'bg-accent text-white' : 'text-gray-600 hover:bg-black/[0.05]'}`}>
                    <Icon className="w-4 h-4" />
                    <span className="truncate max-w-full px-0.5">{label.replace(' Activity', '').replace(' Song', '')}</span>
                  </button>
                );
              })}
            </div>
          </Group>

          <Group title="Time">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-gray-800">Minutes</span>
              <div className="inline-flex items-center rounded-lg bg-black/[0.05]">
                <button type="button" className="p-1.5 text-gray-600 hover:text-ink" aria-label="One minute less" onClick={() => set({ minutes: Math.max(0, part.minutes - 1) })}><Minus className="w-3.5 h-3.5" /></button>
                <input aria-label="Minutes" type="number" min={0} value={part.minutes} onChange={(e) => set({ minutes: Math.max(0, Number(e.target.value) || 0) })} className="w-10 bg-transparent text-center text-[13px] tabular-nums focus:outline-none" />
                <button type="button" className="p-1.5 text-gray-600 hover:text-ink" aria-label="One minute more" onClick={() => set({ minutes: part.minutes + 1 })}><Plus className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <Switch label="Going deeper (optional extra)" checked={part.optional} onChange={(optional) => set({ optional })} />
          </Group>

          <Group title="Supplies">
            <div className="space-y-1.5">
              {part.supplies.map((s) => (
                <div key={s.id} className="flex items-center gap-1">
                  <input aria-label="Quantity" type="number" min={0} step="any" value={s.qty} onChange={(e) => setSupply(s.id, { qty: Math.max(0, Number(e.target.value) || 0) })} className={`${field} !w-12 text-center tabular-nums`} />
                  <input aria-label="Item" value={s.name} placeholder="Item" onChange={(e) => setSupply(s.id, { name: e.target.value })} className={field} />
                  <select aria-label="Quantity is" value={s.per} onChange={(e) => setSupply(s.id, { per: e.target.value as Supply['per'] })} className={`${field} !w-[78px] !px-1`}>
                    {Object.entries(PER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <button type="button" className="p-1 rounded-md text-gray-400 hover:bg-black/5 hover:text-ink" aria-label="Remove supply" onClick={() => set({ supplies: part.supplies.filter((x) => x.id !== s.id) })}><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              <button type="button" onClick={() => set({ supplies: [...part.supplies, newSupply({ name: '' })] })} className="inline-flex items-center gap-1 text-[13px] text-accent hover:underline"><Plus className="w-3.5 h-3.5" />Add supply</button>
            </div>
          </Group>

          <Group title="Notes on the page">
            <label className="block text-[12px] text-gray-500 mb-1">Every kid can join</label>
            <textarea rows={2} className={`${field} resize-y`} value={part.inclusionTips} placeholder="How to adapt this so everyone can take part" onChange={(e) => set({ inclusionTips: e.target.value })} />
            <label className="block text-[12px] text-gray-500 mt-3 mb-1">Leader note</label>
            <textarea rows={2} className={`${field} resize-y`} value={part.leaderNotes} placeholder="Prep or a heads-up for the leader" onChange={(e) => set({ leaderNotes: e.target.value })} />
          </Group>

          <Group title="Media and resources">
            <Links items={part.media} noun="video or song" onChange={(media) => set({ media })} />
            <div className="h-3" />
            <Links items={part.resources} noun="handout or file" onChange={(resources) => set({ resources })} />
          </Group>

          {aiSettings.enabled && (
            <Group title="Write with AI">
              <AIAssist
                label={part.script ? 'Improve what they say' : 'Draft what they say'}
                hasExisting={!!part.script.trim()}
                run={(instruction) => draftPartText(aiSettings, service, section, part, 'script', instruction)}
                onApply={(text, mode) => set({ script: mode === 'append' && part.script ? `${part.script}\n\n${text}` : text })}
              />
            </Group>
          )}

          <Group title="Print">
            <Switch label="Hide from print" checked={part.hidden} onChange={(hidden) => set({ hidden })} />
            <Switch label="Start a new page after" checked={part.pageBreak} onChange={(pageBreak) => set({ pageBreak })} />
          </Group>

          <div className="py-4 space-y-1">
            <button type="button" onClick={() => actions.duplicatePart(section.id, part.id)} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-gray-800 hover:bg-black/[0.04]"><Copy className="w-4 h-4 text-gray-500" />Duplicate</button>
            <button type="button" onClick={() => saveToLibrary(part)} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-gray-800 hover:bg-black/[0.04]"><Bookmark className="w-4 h-4 text-gray-500" />Save to library</button>
            {others.length > 0 && (
              <label className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-gray-800 hover:bg-black/[0.04]">
                <ArrowRightLeft className="w-4 h-4 text-gray-500" />
                <select aria-label="Move to section" value="" onChange={(e) => { actions.movePart(section.id, part.id, e.target.value); setSel({ kind: 'part', sectionId: e.target.value, partId: part.id }); }} className="flex-1 bg-transparent focus:outline-none">
                  <option value="" disabled>Move to…</option>
                  {others.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                </select>
              </label>
            )}
            <button type="button" onClick={() => { actions.deletePart(section.id, part.id); setSel(null); }} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-red-600 hover:bg-red-500/10"><Trash2 className="w-4 h-4" />Delete part</button>
          </div>
        </aside>
      );
    }
  }

  if (sel?.kind === 'section') {
    const section = service.sections.find((s) => s.id === sel.id);
    if (section) {
      const set = (patch: Partial<Section>) => actions.updateSection(section.id, (s) => ({ ...s, ...patch }));
      return (
        <aside className={shell} aria-label="Section details">
          <div className="flex items-center justify-between pt-4">
            <p className="text-[15px] font-semibold truncate">{section.title}</p>
            <button type="button" onClick={() => setSel(null)} className="p-1 rounded-full text-gray-400 hover:bg-black/5 hover:text-ink" aria-label="Close details"><X className="w-4 h-4" /></button>
          </div>
          <Group title="Who it's for">
            <div className="segmented w-full">
              {([['large', 'Large group'], ['small', 'Small groups'], ['other', 'Everyone']] as [SectionRole, string][]).map(([v, l]) => (
                <button key={v} type="button" aria-pressed={section.role === v} onClick={() => set({ role: v })} className="flex-1 justify-center !px-1">{l}</button>
              ))}
            </div>
            <p className="text-[12px] text-gray-500 mt-2">Small group sections become the small group leader's guide.</p>
          </Group>
          <Group title="Time">
            <p className="text-[13px] text-gray-800">{section.parts.length} parts · {sectionMinutes(section)} min</p>
          </Group>
          <Group title="Print">
            <Switch label="Hide from print" checked={section.hidden} onChange={(hidden) => set({ hidden })} />
            <Switch label="Start a new page after" checked={section.pageBreak} onChange={(pageBreak) => set({ pageBreak })} />
          </Group>
          <div className="py-4 space-y-1">
            <button type="button" onClick={() => actions.duplicateSection(section.id)} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-gray-800 hover:bg-black/[0.04]"><Copy className="w-4 h-4 text-gray-500" />Duplicate section</button>
            <button type="button" onClick={() => { actions.deleteSection(section.id); setSel(null); }} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-red-600 hover:bg-red-500/10"><Trash2 className="w-4 h-4" />Delete section</button>
          </div>
        </aside>
      );
    }
  }

  // Nothing selected: the lesson's own settings.
  return (
    <aside className="lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-88px)] overflow-y-auto space-y-3" aria-label="Lesson details">
      <div className="bg-white rounded-2xl shadow-card px-5 py-4">
        <p className="text-[15px] font-semibold">This lesson</p>
        <p className="text-[13px] text-gray-500 mt-0.5">{formatDuration(serviceMinutes(service))} · {service.sections.reduce((n, s) => n + s.parts.length, 0)} parts</p>
        <div className="flex h-1.5 rounded-full overflow-hidden mt-3 bg-black/[0.05]">
          {service.sections.filter((s) => !s.hidden).map((s, i) => (
            <span key={s.id} title={`${s.title}: ${sectionMinutes(s)} min`} style={{ flex: sectionMinutes(s) || 0.0001, background: ['#FF9F0A', '#64D2FF', '#5E5CE6', '#30D158', '#FF375F', '#BF5AF2'][i % 6] }} />
          ))}
        </div>
        <p className="text-[12px] text-gray-500 mt-3">Click any part on the page to see its details here.</p>
      </div>
      <SidePanel service={service} update={update} onJumpToPart={(id) => window.dispatchEvent(new CustomEvent('parable:open-part', { detail: id }))} />
    </aside>
  );
};
