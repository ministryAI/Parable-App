export type PartType =
  | 'script'
  | 'bible-story'
  | 'bible-verse'
  | 'worship'
  | 'video'
  | 'game'
  | 'group-activity'
  | 'discussion'
  | 'prayer'
  | 'craft'
  | 'announcement'
  | 'other';

// How a supply quantity scales: a fixed amount, or multiplied by class size / group count.
export type SupplyPer = 'total' | 'person' | 'group';

export interface Supply {
  id: string;
  name: string;
  qty: number;
  per: SupplyPer;
}

export interface LinkItem {
  id: string;
  label: string;
  url: string;
}

export interface Part {
  id: string;
  title: string;
  type: PartType;
  minutes: number;
  hidden: boolean;
  pageBreak: boolean;
  optional: boolean; // "Going deeper": extra material a leader can use if there's time
  script: string;
  instructions: string;
  supplies: Supply[];
  media: LinkItem[];
  resources: LinkItem[];
  inclusionTips: string;
  leaderNotes: string;
}

// Who a section is for: the whole room, small group leaders, or neither (arrival, games, announcements).
export type SectionRole = 'large' | 'small' | 'other';

export interface Section {
  id: string;
  title: string;
  role: SectionRole;
  hidden: boolean;
  pageBreak: boolean;
  collapsed: boolean;
  parts: Part[];
}

export type SeriesColor = 'indigo' | 'sky' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate';

// ---------- Book design ----------
// How a series looks in print, as data. The renderer reads it; Diana edits it with small patches;
// lib/design.ts fills every missing field with a default and clamps anything out of range.

export type DesignTone = 'paper' | 'ink' | 'accent' | 'secondary' | 'muted' | 'deep';
export type MotifType = 'band' | 'circle' | 'ring' | 'x' | 'track' | 'line' | 'frame' | 'arrow' | 'grid' | 'barcode' | 'stripes' | 'crosshair' | 'label';

// One shape on a cover or divider. Positions and sizes are fractions of the page:
// x 0 = left edge, 1 = right edge; y 0 = top, 1 = bottom; size is a fraction of the page width.
export interface Motif {
  type: MotifType;
  x: number;
  y: number;
  size: number;
  aspect: number; // width ÷ height for bands, tracks, frames, grids, stripes, barcodes
  rotation: number; // degrees
  tone: DesignTone;
  style: 'solid' | 'outline';
  opacity: number; // 0.05–1
  count: number; // rings in a ring, bars in a barcode, lines in a grid
  text: string; // label motifs only
}

export interface DesignSurface {
  background: DesignTone;
  layout: 'bottom' | 'center' | 'top';
  align: 'left' | 'center' | 'right';
  titleScale: number; // 0.7–1.4
  titleDirection: 'across' | 'up'; // 'up' sets the title huge and vertical, reading bottom to top, like a book spine
  titleBox: 'none' | 'outline' | 'solid'; // a label box around the small text (eyebrow, theme)
  showCount: boolean; // the big "05 weeks" number on the cover
  motifs: Motif[];
}

export interface BookDesign {
  palette: { paper: string; ink: string; accent: string; secondary: string; muted: string; deep: string }; // deep '' = derived from accent
  type: {
    display: 'jakarta' | 'fraunces' | 'dmserif' | 'oswald' | 'nunito' | 'grotesk' | 'inter' | 'mono';
    body: 'serif' | 'sans' | 'rounded';
    label: 'sans' | 'mono';
    headingCase: 'normal' | 'caps';
  };
  page: {
    corners: 'round' | 'soft' | 'square';
    headerRule: 'ink' | 'accent' | 'heavy';
    mark: 'none' | 'x' | 'ring' | 'arrow' | 'crosshair' | 'barcode' | 'dot';
  };
  components: { questions: 'numbers' | 'boxed'; scripture: 'panel' | 'rule' };
  cover: DesignSurface;
  divider: DesignSurface;
  // From an imported layout file (cleaned by lib/customPage.ts): HTML + inline SVG pages that replace the built-in
  // cover / dividers, and CSS scoped to this book that restyles any page.
  custom: { name: string; cover: string; divider: string; css: string };
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends (infer U)[] ? Partial<U>[] : T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type BookDesignPatch = DeepPartial<BookDesign>;

export interface DesignRevision {
  id: string;
  createdAt: number;
  source: 'manual' | 'diana' | 'look' | 'reference-image';
  prompt?: string;
  note?: string;
  design: BookDesign;
}

export interface Series {
  id: string;
  title: string;
  description: string;
  audience: string;
  color: SeriesColor;
  startDate: string; // legacy: lessons used to be scheduled from this; dates now live in runs
  bigIdea: string;
  memoryVerse: string;
  leaderGuide: string; // welcome letter for the "Start here" page of the printed book
  design?: BookDesign; // missing means the default look
  designHistory?: DesignRevision[]; // newest first, kept short
  runs: TeachingRun[]; // each time this series is taught; the series itself has no dates
  printRun: string; // id of the run whose dates go on printouts; '' prints without dates
  practiceCard?: PracticeCard; // a wallet card for the series practice, printed as cut-out sheets after week 1
  createdAt: number;
  updatedAt: number;
}

// A card students keep for the series practice: the series title and a few write-in lines on the front,
// the practice's steps on the back.
export interface PracticeCard {
  label: string; // "My three names"
  lines: number; // write-in lines on the front
  footer: string; // a one-line reminder under the lines
  back: string[]; // one line each, e.g. the five B.L.E.S.S. practices
  writeIn: string; // an optional write-in line on the back; '' for none
}

// One time a series is taught: a name, an optional start time, and a date (or label) per lesson.
export interface TeachingRun {
  id: string;
  name: string; // "Wednesday Youth · Fall 2026"
  time: string; // HH:MM, or '' for no clock times
  dates: Record<string, string>; // lesson id → YYYY-MM-DD, or a label like "Sat morning"
  labels: boolean; // true: each lesson gets a label ("Sat morning") instead of a calendar date
}

export interface Service {
  id: string;
  title: string;
  audience: string;
  seriesId: string | null;
  week: number | null;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM, 24h
  classSize: number;
  groupCount: number;
  bigIdea: string;
  objectives: string; // one per line
  keyVerse: string;
  scripture: string;
  checkedSupplies: string[];
  family: FamilyCues;
  sections: Section[];
  createdAt: number;
  updatedAt: number;
}

// Four everyday moments for parents to carry the lesson home.
export interface FamilyCues {
  morning: string;
  onTheGo: string;
  meal: string;
  bedtime: string;
}

// A layout file (.parable-layout.json): a complete book design in code, made outside Parable and imported.
export interface LayoutPack {
  id: string;
  name: string;
  description: string;
  design: BookDesignPatch; // colors, fonts and page settings
  cover: string; // HTML + inline SVG for the cover, with {{placeholders}}
  divider: string; // HTML + inline SVG for divider pages
  css: string; // extra CSS for any page of the book, scoped when applied
}

export interface Database {
  version: 1;
  series: Series[];
  services: Service[];
  library: Part[];
  layouts?: LayoutPack[];
}

export type PrintScope =
  | { kind: 'series-book'; seriesId: string }
  | { kind: 'series'; seriesId: string }
  | { kind: 'series-small'; seriesId: string }
  | { kind: 'series-family'; seriesId: string }
  | { kind: 'series-takehome'; seriesId: string }
  | { kind: 'week' }
  | { kind: 'lesson' }
  | { kind: 'small' }
  | { kind: 'family' }
  | { kind: 'takehome' }
  | { kind: 'run-sheet' }
  | { kind: 'supplies' }
  | { kind: 'section'; sectionId: string }
  | { kind: 'part'; sectionId: string; partId: string };
