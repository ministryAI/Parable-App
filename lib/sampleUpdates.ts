import { Series, Service } from '../types';
import bless from './samples/bless.json';
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

// The built-in series' practice card, for saved copies made before the card existed.
export const addSamplePracticeCards = (series: Series[]): Series[] =>
  series.map((s) => {
    const sample = bless.series.find((x) => x.id === s.id) as { practiceCard?: Series['practiceCard'] } | undefined;
    return !s.practiceCard && sample?.practiceCard ? { ...s, practiceCard: sample.practiceCard } : s;
  });

// The B.L.E.S.S. welcome letter used to coach leaders; now it thanks and encourages them. A letter still
// word for word the old one gets the new one; an edited letter only loses the coaching paragraph, if it's
// still there as it was.
const OLD_LETTER = "Thank you for leading B.L.E.S.S. Over five weeks, students learn five everyday practices for joining what God is already doing: Begin with prayer, Listen with care, Eat together, Serve with love, and Share the story. It all starts with God's promise to Abraham: \"I will bless you… and you will be a blessing.\"\n\nOne practice runs through every week. In week 1, each student writes three names on a BLESS card, and every week the group prays for those names together, adding one step at a time. Each week also studies the passage the same way, with the S.T.A.R.S. method: Something familiar, Themes, Attributes of God, Repetition, Something surprising.\n\nBeing known matters more than being impressive. Pray for each student by name before you arrive. Listen more than you talk; \"I don't know, I wonder too\" is a faithful answer. Notice the student who is here but not included, and sit with them. When a student questions or doubts, stay calm, stay close, and follow up one-on-one. Some students need help seeing hope; others need someone to stay with them in the pain. Behavior can be a response to something hard, so respond calmly.";
const COACHING = "Being known matters more than being impressive. Pray for each student by name before you arrive. Listen more than you talk; \"I don't know, I wonder too\" is a faithful answer. Notice the student who is here but not included, and sit with them. When a student questions or doubts, stay calm, stay close, and follow up one-on-one. Some students need help seeing hope; others need someone to stay with them in the pain. Behavior can be a response to something hard, so respond calmly.";

export const updateSampleLetters = (series: Series[]): Series[] =>
  series.map((s) => {
    const sample = bless.series.find((x) => x.id === s.id);
    if (!sample) return s;
    if (s.leaderGuide.trim() === OLD_LETTER.trim()) return { ...s, leaderGuide: sample.leaderGuide };
    if (s.leaderGuide.includes(COACHING)) return { ...s, leaderGuide: s.leaderGuide.replace(COACHING, '').replace(/\n{3,}/g, '\n\n').trim() };
    return s;
  });
