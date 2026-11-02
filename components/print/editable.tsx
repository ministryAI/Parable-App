import React, { useContext, useLayoutEffect, useRef, useState } from 'react';
import { FamilyCues, PartType, Series, Service } from '../../types';
import { PART_TYPES, PART_TYPE_KEYS } from '../../lib/partTypes';
import { listItems } from '../../lib/text';
import { useStore } from '../../store/StoreContext';

// Editing on the printed page itself. The print components wrap their text in <Ed>; on paper (no
// edit context) that renders exactly as before, and on screen in Write mode it becomes click-to-edit.

export type EditTarget =
  | { kind: 'series'; id: string; field: 'title' | 'bigIdea' | 'description' | 'memoryVerse' | 'leaderGuide' | 'audience' }
  | { kind: 'service'; id: string; field: 'title' | 'bigIdea' | 'keyVerse' | 'scripture' | 'objectives' }
  | { kind: 'section'; serviceId: string; sectionId: string }
  | { kind: 'part'; serviceId: string; partId: string; field: 'title' | 'script' | 'instructions' | 'inclusionTips' | 'leaderNotes' }
  | { kind: 'question'; serviceId: string; partId: string; index: number }
  | { kind: 'family'; serviceId: string; key: keyof FamilyCues };

export interface EditApi {
  commit: (t: EditTarget, value: string) => void;
  selectedPartId?: string | null;
  addPartAfter?: (partId: string, type: PartType) => void;
}

export const EditContext = React.createContext<EditApi | null>(null);
export const useEditing = () => useContext(EditContext);

// Writes an edit back to the series or lesson it came from.
export const useEditApi = (extra: Omit<EditApi, 'commit'> = {}): EditApi => {
  const { updateService, updateSeries } = useStore();
  const mapParts = (serviceId: string, partId: string, fn: (p: Service['sections'][number]['parts'][number]) => typeof p) =>
    updateService(serviceId, (s) => ({ ...s, sections: s.sections.map((sec) => ({ ...sec, parts: sec.parts.map((p) => (p.id === partId ? fn(p) : p)) })) }));
  const commit = (t: EditTarget, value: string) => {
    switch (t.kind) {
      case 'series': return updateSeries(t.id, (s: Series) => ({ ...s, [t.field]: value }));
      case 'service': return updateService(t.id, (s) => ({ ...s, [t.field]: value }));
      case 'section': return updateService(t.serviceId, (s) => ({ ...s, sections: s.sections.map((sec) => (sec.id === t.sectionId ? { ...sec, title: value } : sec)) }));
      case 'part': return mapParts(t.serviceId, t.partId, (p) => ({ ...p, [t.field]: value }));
      case 'question': return mapParts(t.serviceId, t.partId, (p) => {
        const items = listItems(p.script);
        const next = value.trim() ? items.map((q, i) => (i === t.index ? value.trim() : q)) : items.filter((_, i) => i !== t.index);
        return { ...p, script: next.join('\n') };
      });
      case 'family': return updateService(t.serviceId, (s) => ({ ...s, family: { ...s.family, [t.key]: value } }));
    }
  };
  return { commit, ...extra };
};

// Type "/" at the start of a line to add a part after this one.
export const SlashMenu: React.FC<{ onPick: (t: PartType) => void; onClose: () => void }> = ({ onPick, onClose }) => {
  const [query, setQuery] = useState('');
  const [hot, setHot] = useState(0);
  const q = query.trim().toLowerCase();
  const matches = PART_TYPE_KEYS.filter((k) => !q || PART_TYPES[k].label.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)));
  return (
    <div className="pr-ed-menu" onMouseDown={(e) => e.preventDefault()}>
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
          else if (e.key === 'Enter') { e.preventDefault(); if (matches[hot]) onPick(matches[hot]); else onClose(); }
          else if (e.key === 'Escape' || (e.key === 'Backspace' && !query)) { e.preventDefault(); e.stopPropagation(); onClose(); }
        }}
      />
      {matches.length === 0 && <p className="pr-ed-menu-empty">No part type called "{query}"</p>}
      {matches.map((k, i) => {
        const { label, icon: Icon } = PART_TYPES[k];
        return (
          <button key={k} type="button" data-hot={i === hot || undefined} onMouseEnter={() => setHot(i)} onClick={() => onPick(k)}>
            <Icon />{label}
          </button>
        );
      })}
    </div>
  );
};

const EdInput: React.FC<{ t: EditTarget; value: string; multiline: boolean; placeholder?: string; look?: string; onDone: () => void }> = ({ t, value, multiline, placeholder, look = '', onDone }) => {
  const api = useEditing()!;
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(value);
  const [slash, setSlash] = useState(false);
  const cancelled = useRef(false);
  const grow = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(() => {
    grow();
    const el = ref.current;
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }, []);
  useLayoutEffect(grow, [text]);
  const finish = (save: boolean, override?: string) => {
    const v = override ?? text;
    if (save && !cancelled.current && v !== value) api.commit(t, multiline ? v : v.replace(/\s*\n\s*/g, ' '));
    onDone();
  };
  const canSlash = multiline && t.kind === 'part' && !!api.addPartAfter;
  return (
    <span className="pr-ed-wrap">
      <textarea
        ref={ref}
        rows={1}
        className={`pr-ed-input ${look}`}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { if (!slash) finish(true); }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') { cancelled.current = true; e.currentTarget.blur(); return; }
          if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) { e.preventDefault(); e.currentTarget.blur(); return; }
          const el = e.currentTarget;
          if (canSlash && e.key === '/' && el.selectionStart === el.selectionEnd && (el.selectionStart === 0 || el.value[el.selectionStart - 1] === '\n')) {
            e.preventDefault();
            setSlash(true);
          }
        }}
      />
      {slash && (
        <SlashMenu
          onClose={() => { setSlash(false); requestAnimationFrame(() => ref.current?.focus()); }}
          onPick={(type) => {
            const trimmed = text.replace(/\s+$/, '');
            finish(true, trimmed);
            if (t.kind === 'part') api.addPartAfter!(t.partId, type);
          }}
        />
      )}
    </span>
  );
};

// Text on the page. Printed: just the text. In Write mode: click it (or Tab to it and press Enter) to edit.
export const Ed: React.FC<{
  t: EditTarget;
  value: string;
  children?: React.ReactNode;
  multiline?: boolean;
  block?: boolean;
  placeholder?: string;
  // How the words look while typing, when the printed text is set differently from its container.
  look?: 'say' | 'do';
}> = ({ t, value, children, multiline = false, block = false, placeholder = 'Click to write', look }) => {
  const api = useEditing();
  const [editing, setEditing] = useState(false);
  if (!api) return <>{children ?? value}</>;
  const Tag = block ? 'div' : 'span';
  if (editing) {
    return (
      <Tag className={`pr-ed-editing ${block ? 'pr-ed-block' : ''}`}>
        <EdInput t={t} value={value} multiline={multiline} placeholder={placeholder} look={look ? `pr-ed-${look}` : ''} onDone={() => setEditing(false)} />
      </Tag>
    );
  }
  const empty = !value.trim();
  return (
    <Tag
      className={`pr-ed ${block ? 'pr-ed-block' : ''} ${empty ? 'pr-ed-empty' : ''}`}
      tabIndex={0}
      role="button"
      aria-label={empty ? placeholder : `Edit: ${value.slice(0, 60)}`}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setEditing(true); } }}
    >
      {empty ? placeholder : children ?? value}
    </Tag>
  );
};

// For a page drawn from a layout file (its text is baked into the design): edit the words in a small panel.
export const EdPanel: React.FC<{ fields: { label: string; t: EditTarget; value: string; multiline?: boolean }[] }> = ({ fields }) => {
  const api = useEditing();
  const [open, setOpen] = useState(false);
  if (!api || !fields.length) return null;
  return (
    <div className="pr-ed-overlay">
      <button type="button" className="pr-ed-overlay-btn" onClick={() => setOpen(!open)}>{open ? 'Done' : 'Edit text'}</button>
      {open && (
        <div className="pr-ed-overlay-panel">
          {fields.map((f) => (
            <label key={f.label}>
              <span>{f.label}</span>
              <textarea
                rows={f.multiline ? 3 : 1}
                defaultValue={f.value}
                onBlur={(e) => e.target.value !== f.value && api.commit(f.t, e.target.value)}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
};
