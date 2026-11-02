import React, { useEffect, useState } from 'react';
import { Part, PartType, Series, Service } from '../../types';
import { PART_TYPES } from '../../lib/partTypes';
import { newPart } from '../../lib/factory';
import { SectionActions } from '../SectionCard';
import { PrintPreview } from '../print/PrintView';
import { EditContext, useEditApi } from '../print/editable';
import { Inspector, Selection } from './Inspector';

// Write mode: the lesson's printed pages, exactly as they print, edited in place.
// Click any words to change them; click a part to see its details on the right.

interface Props {
  service: Service;
  series?: Series;
  update: (fn: (s: Service) => Service) => void;
  actions: SectionActions;
}

export const WriteView: React.FC<Props> = ({ service, series, update, actions }) => {
  const [sel, setSel] = useState<Selection>(null);

  const reveal = (partId: string) =>
    requestAnimationFrame(() => document.querySelector(`.pr-preview [data-part="${partId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));

  // The sidebar (and anything else) can pick a part on the page.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const section = service.sections.find((s) => s.parts.some((p) => p.id === id));
      if (!section) return;
      setSel({ kind: 'part', sectionId: section.id, partId: id });
      reveal(id);
    };
    window.addEventListener('parable:open-part', onOpen);
    return () => window.removeEventListener('parable:open-part', onOpen);
  }, [service.sections]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target as HTMLElement)?.closest?.('textarea, input') && setSel(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const setPart = (sectionId: string, partId: string, fn: (p: Part) => Part) =>
    actions.updateSection(sectionId, (s) => ({ ...s, parts: s.parts.map((p) => (p.id === partId ? fn(p) : p)) }));
  const addPartAfter = (partId: string, type: PartType) => {
    const section = service.sections.find((s) => s.parts.some((p) => p.id === partId));
    if (!section) return;
    const part = newPart({ type, title: PART_TYPES[type].label, minutes: 5 });
    actions.updateSection(section.id, (s) => {
      const i = s.parts.findIndex((p) => p.id === partId) + 1;
      return { ...s, parts: [...s.parts.slice(0, i), part, ...s.parts.slice(i)] };
    });
    setSel({ kind: 'part', sectionId: section.id, partId: part.id });
    setTimeout(() => reveal(part.id), 80);
  };

  const api = useEditApi({ selectedPartId: sel?.kind === 'part' ? sel.partId : null, addPartAfter });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
      <div className="min-w-0">
        <EditContext.Provider value={api}>
          <PrintPreview
            service={service}
            series={series}
            kind="week"
            maxZoom={1.05}
            onPartClick={(partId) => {
              const section = service.sections.find((s) => s.parts.some((p) => p.id === partId));
              if (section) setSel({ kind: 'part', sectionId: section.id, partId });
            }}
            onSectionClick={(id) => setSel({ kind: 'section', id })}
          />
        </EditContext.Provider>
      </div>
      <Inspector service={service} sel={sel} setSel={setSel} update={update} actions={actions} setPart={setPart} onAddAfter={addPartAfter} />
    </div>
  );
};
