import { Service } from '../types';
import blessUpdates from './samples/bless-updates.json';

// Corrections to the built-in sample, applied to saved copies on load. Each one replaces a field only
// while it still holds the sample's old text: anything the leader has rewritten is left alone.

interface Update { service: string; part?: string; field: string; from: unknown; to: unknown }

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
// Supplies get fresh ids in some saves, so compare what a leader sees: names, amounts, how they scale.
const comparable = (field: string, v: unknown) =>
  field === 'supplies' && Array.isArray(v) ? v.map((s: { name?: string; qty?: number; per?: string }) => [s.name, s.qty, s.per]) : v;

export const applySampleUpdates = (services: Service[], updates: Update[] = blessUpdates as Update[]): Service[] => {
  if (!updates.length) return services;
  const byService = new Map<string, Update[]>();
  updates.forEach((u) => byService.set(u.service, [...(byService.get(u.service) ?? []), u]));
  return services.map((service) => {
    const mine = byService.get(service.id);
    if (!mine) return service;
    let next = service;
    for (const u of mine) {
      if (!u.part) {
        const cur = (next as unknown as Record<string, unknown>)[u.field];
        if (same(cur, u.from)) next = { ...next, [u.field]: u.to };
        continue;
      }
      next = {
        ...next,
        sections: next.sections.map((sec) => ({
          ...sec,
          parts: sec.parts.map((p) => {
            if (p.id !== u.part) return p;
            const cur = (p as unknown as Record<string, unknown>)[u.field];
            if (!same(comparable(u.field, cur), comparable(u.field, u.from))) return p;
            const to = u.field === 'supplies'
              ? (u.to as { name: string; qty: number; per: string }[]).map((s, i) => ({ ...(p.supplies[i] ?? {}), ...s, id: (p.supplies[i]?.id ?? `${p.id}-s${i}`) }))
              : u.to;
            return { ...p, [u.field]: to };
          }),
        })),
      };
    }
    return next;
  });
};
