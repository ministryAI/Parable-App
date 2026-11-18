import { DesignRevision, FamilyCues, LinkItem, Part, PartType, Section, SectionRole, Series, SeriesColor, Service, Supply, SupplyPer, TeachingRun, PracticeCard } from '../types';
import { PART_TYPE_KEYS } from './partTypes';
import { normalizeDesign } from './design';

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const todayISO = (): string => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const toPartType = (v: unknown): PartType => {
  const s = str(v).toLowerCase().replace(/[\s_]+/g, '-');
  return (PART_TYPE_KEYS as string[]).includes(s) ? (s as PartType) : 'other';
};

const toPer = (v: unknown): SupplyPer => (v === 'person' || v === 'group' ? v : 'total');

export const newSupply = (s: Partial<Supply> = {}): Supply => ({
  id: s.id || uid(),
  name: str(s.name),
  qty: num(s.qty, 1),
  per: toPer(s.per),
});

export const newLink = (l: Partial<LinkItem> = {}): LinkItem => ({
  id: l.id || uid(),
  label: str(l.label),
  url: str(l.url),
});

// Also used to normalize imported / AI-generated data, so every field is coerced.
export const newPart = (p: Partial<Record<keyof Part, unknown>> = {}): Part => ({
  id: str(p.id) || uid(),
  title: str(p.title, 'New part') || 'New part',
  type: toPartType(p.type),
  minutes: num(p.minutes, 5),
  hidden: p.hidden === true,
  pageBreak: p.pageBreak === true,
  optional: p.optional === true,
  script: str(p.script),
  instructions: str(p.instructions),
  supplies: Array.isArray(p.supplies) ? p.supplies.map((s) => newSupply(s ?? {})) : [],
  media: Array.isArray(p.media) ? p.media.map((l) => newLink(l ?? {})) : [],
  resources: Array.isArray(p.resources) ? p.resources.map((l) => newLink(l ?? {})) : [],
  inclusionTips: str(p.inclusionTips),
  leaderNotes: str(p.leaderNotes),
});

// Best guess from the title; the leader can change it on the section.
export const guessRole = (title: string): SectionRole =>
  /small|group|cabin|huddle|breakout|table/i.test(title) ? 'small'
    : /social|arrival|hangout|welcome|pre-?service|free play|announce/i.test(title) ? 'other'
    : 'large';

export const newSection = (s: Partial<Record<keyof Section, unknown>> = {}): Section => ({
  id: str(s.id) || uid(),
  title: str(s.title, 'New section') || 'New section',
  role: s.role === 'large' || s.role === 'small' || s.role === 'other' ? s.role : guessRole(str(s.title)),
  hidden: s.hidden === true,
  pageBreak: s.pageBreak === true,
  collapsed: s.collapsed === true,
  parts: Array.isArray(s.parts) ? s.parts.map((p) => newPart(p ?? {})) : [],
});

export const newFamily = (f: Partial<FamilyCues> = {}): FamilyCues => ({
  morning: str(f?.morning),
  onTheGo: str(f?.onTheGo),
  meal: str(f?.meal),
  bedtime: str(f?.bedtime),
});

export const newService = (s: Partial<Record<keyof Service, unknown>> = {}): Service => {
  const now = Date.now();
  return {
    id: str(s.id) || uid(),
    title: str(s.title, 'Untitled service') || 'Untitled service',
    audience: str(s.audience, 'Kids'),
    seriesId: str(s.seriesId) || null,
    week: typeof s.week === 'number' ? s.week : null,
    date: str(s.date) || todayISO(),
    startTime: str(s.startTime, '10:00'),
    classSize: num(s.classSize, 10),
    groupCount: num(s.groupCount, 2),
    bigIdea: str(s.bigIdea),
    objectives: str(s.objectives),
    keyVerse: str(s.keyVerse),
    scripture: str(s.scripture),
    family: newFamily(s.family as Partial<FamilyCues> | undefined),
    checkedSupplies: Array.isArray(s.checkedSupplies) ? s.checkedSupplies.filter((x): x is string => typeof x === 'string') : [],
    sections: Array.isArray(s.sections) ? s.sections.map((x) => newSection(x ?? {})) : [],
    createdAt: num(s.createdAt, now),
    updatedAt: num(s.updatedAt, now),
  };
};

export const newRun = (r: Partial<Record<keyof TeachingRun, unknown>> = {}): TeachingRun => ({
  id: str(r.id) || uid(),
  name: str(r.name, 'Untitled run') || 'Untitled run',
  time: /^\d{1,2}:\d{2}$/.test(str(r.time)) ? str(r.time) : '',
  labels: r.labels === true,
  dates: r.dates && typeof r.dates === 'object'
    ? Object.fromEntries(Object.entries(r.dates as Record<string, unknown>).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, (v as string).slice(0, 40)]))
    : {},
});

export const SERIES_COLORS: SeriesColor[] = ['indigo', 'sky', 'emerald', 'amber', 'rose', 'violet', 'slate'];

const readPracticeCard = (raw: unknown): PracticeCard | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Record<string, unknown>;
  const back = Array.isArray(c.back) ? c.back.map((x) => str(x)).filter(Boolean).slice(0, 8) : [];
  return { label: str(c.label), lines: Math.max(0, Math.min(5, Math.round(num(c.lines, 3)))), footer: str(c.footer), back, writeIn: str(c.writeIn) };
};

export const newSeries = (s: Partial<Record<keyof Series, unknown>> = {}): Series => {
  const now = Date.now();
  return {
    id: str(s.id) || uid(),
    title: str(s.title, 'Untitled series') || 'Untitled series',
    description: str(s.description),
    audience: str(s.audience, 'Kids'),
    color: (SERIES_COLORS as string[]).includes(str(s.color)) ? (s.color as SeriesColor) : 'indigo',
    startDate: str(s.startDate) || todayISO(),
    bigIdea: str(s.bigIdea),
    memoryVerse: str(s.memoryVerse),
    leaderGuide: str(s.leaderGuide),
    design: s.design ? normalizeDesign(s.design) : undefined,
    runs: Array.isArray(s.runs) ? s.runs.filter((r) => r && typeof r === 'object').map((r) => newRun(r as Partial<TeachingRun>)) : [],
    printRun: str(s.printRun),
    practiceCard: readPracticeCard(s.practiceCard),
    designHistory: Array.isArray(s.designHistory)
      ? s.designHistory.slice(0, 20).filter((r) => r && typeof r === 'object').map((r) => ({ ...(r as DesignRevision), design: normalizeDesign((r as DesignRevision).design) }))
      : undefined,
    createdAt: num(s.createdAt, now),
    updatedAt: num(s.updatedAt, now),
  };
};

export const clonePart = (p: Part): Part => ({
  ...p,
  id: uid(),
  supplies: p.supplies.map((s) => ({ ...s, id: uid() })),
  media: p.media.map((l) => ({ ...l, id: uid() })),
  resources: p.resources.map((l) => ({ ...l, id: uid() })),
});

export const cloneSection = (s: Section): Section => ({ ...s, id: uid(), parts: s.parts.map(clonePart) });

export const cloneService = (s: Service, overrides: Partial<Service> = {}): Service => {
  const now = Date.now();
  return { ...s, id: uid(), sections: s.sections.map(cloneSection), createdAt: now, updatedAt: now, ...overrides };
};
