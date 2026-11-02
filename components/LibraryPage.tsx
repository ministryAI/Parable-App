import React, { useState } from 'react';
import { Bookmark, Search, Trash2 } from 'lucide-react';
import { useStore } from '../store/StoreContext';
import { PART_TYPES } from '../lib/partTypes';
import { TypeChip } from './PartCard';
import { EmptyState, IconButton, inputClass } from './ui';
import { DesignLibrary } from './DesignLibrary';

export const LibraryPage: React.FC = () => {
  const { db, removeFromLibrary } = useStore();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const parts = db.library.filter((p) => !q || p.title.toLowerCase().includes(q) || PART_TYPES[p.type].label.toLowerCase().includes(q));

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 pb-24">
      <section className="py-10">
        <h1 className="text-4xl md:text-5xl font-display">Library</h1>
        <p className="text-gray-600 mt-3 max-w-2xl">Book designs and parts you reuse across series.</p>
      </section>
      <DesignLibrary />
      <div className="mb-4">
        <h2 className="text-2xl font-display">Parts</h2>
        <p className="text-sm text-gray-600 mt-1 max-w-2xl">
          Parts you reuse every week, like welcome scripts, games, or a prayer routine. Save a part from its menu, then insert it into any section with <strong>From library</strong>.
        </p>
      </div>
      {db.library.length === 0 ? (
        <div className="border-2 border-dashed border-gray-300 rounded-xl bg-white/50">
          <EmptyState icon={Bookmark} title="Nothing saved yet">Open a service, then choose <strong>Save to library</strong> in any part's ⋮ menu.</EmptyState>
        </div>
      ) : (
        <>
          <div className="relative max-w-sm mb-4">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className={`${inputClass} pl-9`} placeholder="Search library" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <ul className="space-y-3">
            {parts.map((p) => (
              <li key={p.id} className="bg-white border border-line rounded-xl p-4 flex gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{p.title}</span>
                    <TypeChip type={p.type} />
                    <span className="text-xs text-gray-500">{p.minutes} min</span>
                  </div>
                  {(p.script || p.instructions) && <p className="text-sm text-gray-600 mt-2 whitespace-pre-line line-clamp-3">{p.script || p.instructions}</p>}
                  {p.supplies.length > 0 && <p className="text-xs text-gray-500 mt-2">Supplies: {p.supplies.map((s) => s.name).join(', ')}</p>}
                </div>
                <IconButton icon={Trash2} label={`Remove ${p.title} from library`} onClick={() => removeFromLibrary(p.id)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};
