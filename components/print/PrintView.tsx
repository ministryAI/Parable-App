import React from 'react';
import { DesignSurface, LayoutPack, Part, PrintScope, Section, Series, Service } from '../../types';
import { applyLayout } from '../../lib/layouts';
import { designAttrs, designOf, designVars, resolvePalette, surfaceText, toneColor } from '../../lib/design';
import { MotifLayer, PageMark } from './Motifs';
import { fillCustom, fitText, scopeCss, scopeId } from '../../lib/customPage';
import { PART_TYPES } from '../../lib/partTypes';
import { aggregateSupplies, supplyTotal } from '../../lib/supplies';
import { buildElapsed, buildSchedule, formatClock, formatDuration, sectionMinutes, serviceMinutes, visibleParts } from '../../lib/time';
import { forPrint, formatWhen, weeksOf } from '../../lib/series';
import { cueSegments, listItems, looksLikeList, paragraphs, stripCues } from '../../lib/text';
import { qrPath } from '../../lib/qr';
import { useStore } from '../../store/StoreContext';
import { Accessibility, Car, Layers, Compass, HelpCircle, ListChecks, MessageSquareQuote, Monitor, Moon, Package, Pointer, Quote, Sparkles, StickyNote, Sunrise, Target, Timer, Users, Utensils } from 'lucide-react';
import { engagement, FAMILY_LABELS, familyCues, sectionsFor, smallGroupGuide } from '../../lib/roles';
import { FamilyCues } from '../../types';
import { partReady } from '../../lib/readiness';
import './print.css';

// Colors, fonts, corners and heading case for a series (or the default look).
// CSS from an imported layout, scoped to this book's root element.
const LayoutCss: React.FC<{ series?: Series }> = ({ series }) => {
  const css = designOf(series).custom.css;
  return css ? <style>{scopeCss(css, `.pr[data-custom="${scopeId(css)}"]`)}</style> : null;
};

const theme = (series?: Series) => { const d = designOf(series); return { style: designVars(d), ...designAttrs(d) }; };

const cssString = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;

// Page size, margins, and a running footer ("Series · Leader guide ........ 3") in the page margin.
// The paper color is written in directly: CSS variables don't reach @page.
const PageStyle: React.FC<{ footer: string; series?: Series }> = ({ footer, series }) => (
  <style>{`
    @page {
      size: letter;
      margin: 0.6in 0.65in 0.7in;
      background: ${resolvePalette(designOf(series)).paper};
      @bottom-left { content: ${cssString(footer)}; font: 600 7.5pt 'Inter Variable', sans-serif; color: #94A3B8; letter-spacing: 0.04em; }
      @bottom-right { content: counter(page); font: 700 8pt 'Inter Variable', sans-serif; color: #64748B; }
    }
    @page cover { margin: 0; @bottom-left { content: none; } @bottom-right { content: none; } }
  `}</style>
);

// "Sun, Oct 4, 2026 – Sun, Nov 1, 2026" from the printed run, or '' when printing without dates.
const dateRange = (weeks: Service[]) => {
  const first = weeks[0]?.date ?? '';
  const last = weeks[weeks.length - 1]?.date ?? '';
  if (!first && !last) return '';
  return first === last || !last ? formatWhen(first) : !first ? formatWhen(last) : `${formatWhen(first)} – ${formatWhen(last)}`;
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const clockRange = (service: Service) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(service.startTime);
  if (!m) return '';
  const start = Number(m[1]) * 60 + Number(m[2]);
  return `${formatClock(start)} – ${formatClock(start + serviceMinutes(service))}`;
};

export const PrintRoot: React.FC = () => {
  const { printJob, db } = useStore();
  if (!printJob) return null;
  const { scope } = printJob;

  if ('seriesId' in scope && scope.kind.startsWith('series')) {
    const series = db.series.find((s) => s.id === scope.seriesId);
    if (!series) return null;
    const footer: Record<string, string> = { 'series-small': 'Small group guides', 'series-family': 'Family pages', 'series-takehome': 'Take-home cards' };
    return (
      <div className="pr-root pr" {...theme(series)}>
        <LayoutCss series={series} />
        <PageStyle series={series} footer={`${series.title} · ${footer[scope.kind] ?? 'Leader guide'}`} />
        <SeriesBook kind={scope.kind} series={series} weeks={weeksOf(db, series.id)} />
      </div>
    );
  }

  const service = db.services.find((s) => s.id === printJob.serviceId);
  if (!service) return null;
  const series = service.seriesId ? db.series.find((s) => s.id === service.seriesId) : undefined;
  const footer = [series?.title, series && service.week ? `Week ${service.week}` : '', service.title].filter(Boolean).join(' · ');
  return (
    <div className="pr-root pr" {...theme(series)}>
        <LayoutCss series={series} />
      <PageStyle series={series} footer={footer} />
      <ServiceScope scope={scope} service={service} series={series} />
    </div>
  );
};

type SeriesKind = 'series-book' | 'series' | 'series-small' | 'series-family' | 'series-takehome';

// Everything a series prints: the book (cover, leader guide, every week) or one kind of page for every week.
const SeriesBook: React.FC<{ kind: SeriesKind | string; series: Series; weeks: Service[] }> = ({ kind, series, weeks: lessons }) => {
  const weeks = forPrint(series, lessons);
  return (
  <>
    {(kind === 'series-book' || kind === 'series') && (
      <>
        <SeriesCover series={series} weeks={weeks} />
        <Divider series={series} uid={`lg-${series.id}`} icon={Compass} kicker="Start here" title="Leader guide" sub={`${weeks.length} weeks · ${series.audience}`} />
        <LeaderGuide series={series} weeks={weeks} />
      </>
    )}
    {kind === 'series-book' && weeks.map((w) => <FullWeek key={w.id} service={w} series={series} divider />)}
    {kind === 'series-small' && weeks.map((w) => <SmallGroupPage key={w.id} service={w} series={series} />)}
    {kind === 'series-family' && weeks.map((w) => <FamilyPage key={w.id} service={w} series={series} />)}
    {kind === 'series-takehome' && weeks.map((w) => <TakeHome key={w.id} service={w} series={series} />)}
  </>
  );
};

// The whole printed book on screen, page by page, in the series' design.
export const BookPreview: React.FC<{ series: Series; weeks: Service[]; onPartClick?: (partId: string) => void }> = ({ series, weeks, onPartClick }) => {
  const { outer, zoom } = useFitZoom(0.8);
  const onClick = (e: React.MouseEvent) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-part]')?.dataset.part;
    if (id && onPartClick) onPartClick(id);
  };
  return (
    <div ref={outer} className="pv-outer">
      <div className="pr pr-preview" {...theme(series)} style={{ ...designVars(designOf(series)), zoom }} onClick={onClick}>
        <LayoutCss series={series} />
        <SeriesBook kind="series-book" series={series} weeks={weeks} />
      </div>
    </div>
  );
};

const ServiceScope: React.FC<{ scope: PrintScope; service: Service; series?: Series }> = ({ scope, service: lesson, series }) => {
  const [service] = forPrint(series, [lesson]);
  const schedule = buildSchedule(service);
  switch (scope.kind) {
    case 'week':
      return <FullWeek service={service} series={series} />;
    case 'lesson':
      return <Lesson service={service} series={series} />;
    case 'small':
      return <SmallGroupPage service={service} series={series} />;
    case 'family':
      return <FamilyPage service={service} series={series} />;
    case 'takehome':
      return <TakeHome service={service} series={series} />;
    case 'run-sheet':
      return <RunSheet service={service} series={series} schedule={schedule} />;
    case 'supplies':
      return <SupplyList service={service} series={series} />;
    case 'section': {
      const section = service.sections.find((s) => s.id === scope.sectionId);
      return section ? <><MiniHeader service={service} series={series} title={section.title} /><SectionBlock service={service} section={section} schedule={schedule} /></> : null;
    }
    case 'part': {
      const part = service.sections.find((s) => s.id === scope.sectionId)?.parts.find((p) => p.id === scope.partId);
      return part ? <><MiniHeader service={service} series={series} title={part.title} /><PartBlock service={service} part={part} time={schedule[part.id]} /></> : null;
    }
    default:
      return null;
  }
};

// ---------- Live preview (on screen, next to the editor) ----------

export type PreviewKind = 'week' | 'lesson' | 'small' | 'family' | 'takehome' | 'run-sheet' | 'supplies';

const SHEET_PX = 816; // 8.5in at 96 dpi

// The same pages the printer gets, drawn as paper sheets and scaled to fit the pane.
export const PrintPreview: React.FC<{ service: Service; series?: Series; kind: PreviewKind; onPartClick?: (partId: string) => void }> = ({ service, series, kind, onPartClick }) => {
  const { outer, zoom } = useFitZoom();
  const empty =
    (kind === 'small' && !smallGroupGuide(service).has) ? 'No small group section yet. Add a section and set it to "Small group" to get this page.'
    : service.sections.every((s) => s.hidden || visibleParts(s).length === 0) ? 'Add a section and a few parts, and the printed pages will appear here.'
    : '';
  const onClick = (e: React.MouseEvent) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-part]')?.dataset.part;
    if (id && onPartClick) onPartClick(id);
  };
  return (
    <div ref={outer} className="pv-outer">
      {empty ? <p className="pv-empty">{empty}</p> : (
        <div className="pr pr-preview" {...theme(series)} style={{ ...designVars(designOf(series)), zoom }} onClick={onClick}>
        <LayoutCss series={series} />
          {kind === 'week' ? <FullWeek service={forPrint(series, [service])[0]} series={series} divider /> : <ServiceScope scope={{ kind }} service={service} series={series} />}
        </div>
      )}
    </div>
  );
};

// Sheets scaled to fit their container; shared by the week preview and the design picker.
const useFitZoom = (max = 1) => {
  const outer = React.useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = React.useState(0.5);
  React.useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const fit = () => setZoom(Math.min(max, (el.clientWidth - 32) / SHEET_PX));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { outer, zoom };
};

// What a series looks like with a given design: the cover, then all of week 1 (divider, lesson, small group, family).
export const DesignPreview: React.FC<{ series: Series; weeks: Service[] }> = ({ series, weeks }) => {
  // Smaller sheets so a whole page shows at once while picking a look.
  const { outer, zoom } = useFitZoom(0.62);
  const first = weeks[0];
  return (
    <div ref={outer} className="pv-outer">
      <div className="pr pr-preview" {...theme(series)} style={{ ...designVars(designOf(series)), zoom }}>
        <LayoutCss series={series} />
        <SeriesCover series={series} weeks={weeks} />
        {first && <FullWeek service={forPrint(series, [first])[0]} series={series} divider />}
      </div>
    </div>
  );
};

// A library design's cover, drawn small with a real series' text (or the series given), for picking at a glance.
export const LayoutThumb: React.FC<{ pack: LayoutPack; series: Series; weeks: Service[]; width?: number }> = ({ pack, series, weeks, width = 180 }) => {
  // Its own id, so each thumbnail's SVG masks stay separate.
  const shown = { ...series, id: `${series.id}-${pack.id}`, design: applyLayout(designOf(series), pack) };
  return (
    <div className="overflow-hidden rounded-md shadow-sm ring-1 ring-black/10 bg-white" style={{ width, height: width * (11 / 8.5) }} aria-hidden="true">
      <div className="pr pr-preview pr-thumb" {...theme(shown)} style={{ ...designVars(designOf(shown)), zoom: width / SHEET_PX }}>
        <LayoutCss series={shown} />
        <SeriesCover series={shown} weeks={weeks} />
      </div>
    </div>
  );
};

// A series' own cover, drawn small, for the shelf.
export const CoverThumb: React.FC<{ series: Series; weeks: Service[]; width?: number }> = ({ series, weeks, width = 180 }) => (
  <div className="overflow-hidden bg-white" style={{ width, height: (width * 11) / 8.5 }} aria-hidden="true">
    <div className="pr pr-preview pr-thumb" {...theme(series)} style={{ ...designVars(designOf(series)), zoom: width / SHEET_PX }}>
      <LayoutCss series={series} />
      <SeriesCover series={series} weeks={weeks} />
    </div>
  </div>
);

// ---------- Series ----------

// Where text sits on a full-bleed page, as page fractions; shapes fade out behind it.
const textZones = (sf: DesignSurface) => {
  const y = sf.layout === 'bottom' ? 0.5 : sf.layout === 'center' ? 0.28 : 0.1;
  const x = sf.align === 'left' ? 0.06 : sf.align === 'right' ? 0.2 : 0.1;
  const zones = [{ x, y, w: sf.align === 'center' ? 0.8 : 0.74, h: 0.44 }];
  // A vertical title runs the full height of its side of the page.
  if (sf.titleDirection === 'up') zones.push({ x: sf.align === 'right' ? 0.66 : 0.04, y: 0.04, w: 0.3, h: 0.92 });
  return zones;
};

// A vertical title is sized to fit the page height: one column for short titles, two for long ones.
// Average letter width per font (in ems), so condensed faces run taller.
const LETTER_WIDTH: Record<string, number> = { oswald: 0.44, grotesk: 0.6, mono: 0.62, dmserif: 0.52, fraunces: 0.56, nunito: 0.58, inter: 0.58, jakarta: 0.6 };
const verticalTitle = (title: string, scale: number, font: string) => {
  const chars = Math.max(4, title.length);
  const cols = chars > 16 ? 2 : 1;
  const size = Math.max(40, Math.min(170 * scale, (9.2 * 72 * cols) / (chars * (LETTER_WIDTH[font] ?? 0.6))));
  return { size, room: size * cols * 1.02 + 18 };
};

// A full-bleed surface (cover or divider): background, shapes, and the design's text placement.
const Surface: React.FC<{ kind: 'cover' | 'divider'; series?: Series; uid: string; title: string; children: React.ReactNode; corner?: React.ReactNode }> = ({ kind, series, uid, title, children, corner }) => {
  const d = designOf(series);
  const sf = d[kind];
  const p = resolvePalette(d);
  const bg = toneColor(p, sf.background);
  const text = surfaceText(p, sf.background);
  const vt = sf.titleDirection === 'up' ? verticalTitle(title, sf.titleScale, d.type.display) : null;
  return (
    <section
      className={kind === 'cover' ? 'pr-cover' : 'pr-divider'}
      data-layout={sf.layout}
      data-align={sf.align}
      data-dir={sf.titleDirection}
      data-box={sf.titleBox}
      style={{ background: bg, color: text, '--title-scale': sf.titleScale, '--vt-size': vt ? `${vt.size}pt` : undefined, '--vt-room': vt ? `${vt.room}pt` : undefined } as React.CSSProperties}
    >
      <MotifLayer motifs={sf.motifs} palette={p} bg={bg} textZones={textZones(sf)} uid={uid} />
      {corner}
      <div className={kind === 'cover' ? 'pr-cover-body' : 'pr-divider-body'}>{children}</div>
    </section>
  );
};

// A page Diana wrote as HTML/SVG (already cleaned), with the series' text filled in.
const CustomPage: React.FC<{ kind: 'cover' | 'divider'; series?: Series; values: Record<string, string> }> = ({ kind, series, values }) => {
  const p = resolvePalette(designOf(series));
  const ref = React.useRef<HTMLElement>(null);
  // The printed curriculum never names the app, even on layouts saved before that rule.
  const html = fillCustom(designOf(series).custom[kind], values).replace(/\bParable\s*[·|•–-]\s*/g, '').replace(/>\s*Parable\s*</g, '><');
  // On screen (previews) fit marked text now; for printing, printFit does it once the page is laid out.
  React.useLayoutEffect(() => {
    if (ref.current && ref.current.offsetParent !== null) fitText(ref.current);
  }, [html]);
  return (
    <section
      ref={ref}
      className={`${kind === 'cover' ? 'pr-cover' : 'pr-divider'} pr-custom`}
      style={{ background: p.deep, color: '#FFFFFF' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

const SeriesCover: React.FC<{ series: Series; weeks: Service[] }> = ({ series, weeks: lessons }) => {
  const weeks = forPrint(series, lessons);
  const sf = designOf(series).cover;
  if (designOf(series).custom.cover) {
    return (
      <CustomPage
        kind="cover"
        series={series}
        values={{
          title: series.title,
          subtitle: series.bigIdea || series.description,
          eyebrow: `${weeks.length}-week series · ${series.audience}`,
          dates: dateRange(weeks),
          weeks: pad2(weeks.length),
          audience: series.audience,
          verse: series.memoryVerse,
        }}
      />
    );
  }
  const label = (
    <>
      <p className="pr-eyebrow">{weeks.length}-week series · {series.audience}</p>
      {(series.bigIdea || series.description) && <p className="pr-cover-theme pr-serif">{series.bigIdea || series.description}</p>}
    </>
  );
  return (
    <Surface
      kind="cover"
      series={series}
      uid={`cover-${series.id}`}
      title={series.title}
      corner={
        <>
          {sf.showCount && <div className="pr-cover-num" data-side={sf.align === 'right' ? 'left' : 'right'}><b>{pad2(weeks.length)}</b><span>Weeks</span></div>}
        </>
      }
    >
      <h1 className="pr-cover-title">{series.title}</h1>
      {sf.titleBox === 'none' ? label : <div className="pr-title-box">{label}</div>}
      <div className="pr-cover-foot">
        <div className="pr-cover-meta">
          {dateRange(weeks) && <div><span>Dates</span><b>{dateRange(weeks)}</b></div>}
          <div><span>Leader guide</span><b>{series.audience}</b></div>
        </div>
        {series.memoryVerse && <div className="pr-cover-verse pr-serif"><span>Memory verse</span>{series.memoryVerse}</div>}
      </div>
    </Surface>
  );
};

// Full-bleed section opener, like a chapter page.
const Divider: React.FC<{ series?: Series; uid: string; icon: React.ElementType; kicker: string; title: string; sub?: string; idea?: string }> = ({ series, uid, icon: Icon, kicker, title, sub, idea }) => {
  const box = designOf(series).divider.titleBox;
  if (designOf(series).custom.divider) {
    return <CustomPage kind="divider" series={series} values={{ title, subtitle: sub ?? '', kicker, eyebrow: kicker, idea: idea ?? '' }} />;
  }
  const label = (
    <>
      <p className="pr-eyebrow">{kicker}</p>
      {sub && <p className="pr-divider-sub">{sub}</p>}
    </>
  );
  return (
    <Surface kind="divider" series={series} uid={uid} title={title}>
      <span className="pr-divider-icon"><Icon /></span>
      <h2>{title}</h2>
      {box === 'none' ? label : <div className="pr-title-box">{label}</div>}
      {idea && <p className="pr-divider-idea pr-serif">{idea}</p>}
    </Surface>
  );
};

const LEGEND: [React.ElementType, string, string][] = [
  [Target, 'Session aim', 'the one idea everything points to'],
  [Timer, 'Time', 'approximate minutes for each part'],
  [Pointer, 'Instructions', 'what the leader does'],
  [MessageSquareQuote, 'Say', 'a script to read or put in your own words'],
  [HelpCircle, 'Questions', 'to ask the group'],
  [Monitor, 'Show on screen', 'scan the code to open the song or video'],
  [Accessibility, 'Every kid can join', 'ways to adapt for different needs'],
  [Layers, 'Going deeper', 'optional extras if you have time'],
];

const LeaderGuide: React.FC<{ series: Series; weeks: Service[] }> = ({ series, weeks }) => (
  <section className="pr-leader pr-page">
    <header className="pr-head">
      <p className="pr-eyebrow">Start here</p>
      <h1>Welcome, leader</h1>
    </header>
    {(series.leaderGuide || series.description) && <p className="pr-letter pr-serif">{series.leaderGuide || series.description}</p>}
    <p className="pr-label" style={{ marginTop: '18pt' }}>Inside each week</p>
    <div className="pr-roles">
      <div><span className="pr-role-icon"><Sparkles /></span><b>Large group lesson</b><p>A session plan and overview, then the hook, teaching, and everything on stage, part by part.</p></div>
      <div><span className="pr-role-icon"><Users /></span><b>Small group guide</b><p>One page for each small group leader: an icebreaker, discussion questions, and a prayer focus.</p></div>
      <div><span className="pr-role-icon"><Sunrise /></span><b>Family page</b><p>Four everyday moments for parents to carry the lesson home. Copy one for each family.</p></div>
    </div>
    <p className="pr-label" style={{ marginTop: '20pt' }}>Symbols in use</p>
    <div className="pr-legend">
      {LEGEND.map(([Icon, name, text]) => (
        <div key={name}><span className="pr-ico"><Icon /></span><p><b>{name}</b><span>{text}</span></p></div>
      ))}
    </div>
    <div className="pr-avoid">
    <p className="pr-label" style={{ marginTop: '28pt' }}>The series at a glance</p>
    <ol className="pr-weeks">
      {weeks.map((w) => (
        <li key={w.id}>
          <span className="n">{pad2(w.week ?? 0)}</span>
          <div>
            <h3>{w.title}</h3>
            {w.bigIdea && <p className="idea pr-serif">{w.bigIdea}</p>}
          </div>
          <div className="when">{w.date && <b>{formatWhen(w.date)}</b>}{w.scripture}</div>
        </li>
      ))}
    </ol>
    </div>
  </section>
);

// ---------- One week: lesson, small group guide, family page ----------

const FullWeek: React.FC<{ service: Service; series?: Series; divider?: boolean }> = ({ service, series, divider }) => (
  <>
    {divider && (
      <Divider
        series={series}
        uid={`wk-${service.id}`}
        icon={Compass}
        kicker={[series?.title, formatWhen(service.date)].filter(Boolean).join(' · ') || service.audience}
        title={service.week ? `Week ${service.week}` : service.title}
        sub={service.week ? service.title : service.scripture}
        idea={service.bigIdea}
      />
    )}
    <Lesson service={service} series={series} />
    <SmallGroupPage service={service} series={series} />
    <FamilyPage service={service} series={series} />
  </>
);

const PageHead: React.FC<{ service: Service; series?: Series; kicker: string; title: string; right?: React.ReactNode }> = ({ service, series, kicker, title, right }) => (
  <header className="pr-head pr-head-split">
    <div>
      <PageMark kind={designOf(series).page.mark} />
      <p className="pr-eyebrow">{series && service.week ? `Week ${service.week} · ` : ''}{kicker}</p>
      <h1>{title}</h1>
    </div>
    {right}
  </header>
);

// A labeled row with an icon in the left gutter, used across the lesson pages.
const Row: React.FC<{ icon: React.ElementType; label: string; tone?: string; children: React.ReactNode }> = ({ icon: Icon, label, tone, children }) => (
  <div className={`pr-row ${tone ?? ''}`}>
    <span className="pr-ico"><Icon /></span>
    <div className="pr-row-body">
      <h4>{label}</h4>
      {children}
    </div>
  </div>
);

const Lesson: React.FC<{ service: Service; series?: Series }> = ({ service, series }) => {
  const schedule = buildSchedule(service);
  const main = sectionsFor(service, ['large', 'other']);
  return (
    <>
      <SessionPlan service={service} series={series} />
      <SessionOverview service={service} series={series} schedule={schedule} />
      <div className="pr-page pr-flow">
        {main.map((section, i) => <SectionBlock key={section.id} service={service} section={section} schedule={schedule} index={i} />)}
      </div>
    </>
  );
};

const SessionPlan: React.FC<{ service: Service; series?: Series }> = ({ service, series }) => {
  const { activities, challenge } = engagement(service);
  const supplies = aggregateSupplies(service);
  const all = service.sections.filter((s) => !s.hidden).flatMap(visibleParts);
  const media = all.flatMap((p) => p.media.filter((l) => l.url));
  const objectives = listItems(service.objectives);
  const notReady = all.filter((p) => !partReady(p)).length;
  const prep = [
    service.scripture ? `Read ${service.scripture} twice` : "Read this week's passage",
    'Read every script out loud once',
    supplies.length ? `Gather ${supplies.length} supply item${supplies.length === 1 ? '' : 's'}` : '',
    media.length ? `Queue ${media.length} song${media.length === 1 ? '' : 's'} / video${media.length === 1 ? '' : 's'}` : '',
    notReady ? `Finish ${notReady} part${notReady === 1 ? '' : 's'} that still need content` : '',
    `Brief your ${service.groupCount} small group leader${service.groupCount === 1 ? '' : 's'}`,
  ].filter(Boolean);
  return (
    <section className="pr-plan pr-page">
      <PageHead
        service={service}
        series={series}
        kicker="Session plan"
        title={service.title}
        right={service.scripture && <div className="pr-head-right"><span>Scripture</span><b className="pr-serif">{service.scripture}</b></div>}
      />
      <div className="pr-plan-grid">
        <div>
          {service.bigIdea && <Row icon={Target} label="Session aim"><p className="pr-serif pr-aim">{service.bigIdea}</p></Row>}
          {objectives.length > 0 && (
            <Row icon={ListChecks} label="Objectives">
              <p className="pr-row-lead">By the end of this session, {/kid|child|preschool/i.test(service.audience) ? 'kids' : 'students'} will:</p>
              <ul className="pr-bullets">{objectives.map((o, i) => <li key={i}>{o}</li>)}</ul>
            </Row>
          )}
          <Row icon={Package} label="What you will need">
            {supplies.length === 0 && media.length === 0 ? <p className="pr-row-lead">No supplies listed yet.</p> : (
              <ul className="pr-checklist">
                {supplies.map((l) => <li key={l.key}><span className="pr-box" /><span>{l.name}</span><span className="qty">{fmtQty(l.total)}</span></li>)}
                {media.map((m) => <li key={m.id}><span className="pr-box" /><span>{m.label || 'Media'} <em className="pr-dim">(on screen)</em></span><span /></li>)}
              </ul>
            )}
          </Row>
        </div>
        <aside>
          {service.keyVerse && (
            <div className="pr-side-verse">
              <p className="pr-label">Key verse</p>
              <p className="pr-serif">{service.keyVerse}</p>
            </div>
          )}
          {(activities.length > 0 || challenge) && (
            <div className="pr-engage">
              <p className="pr-label">Engagement</p>
              {activities.slice(0, 3).map((a) => (
                <div key={a.id} className="pr-engage-item">
                  <b>{a.title}</b>
                  <p>{clip(a.instructions.trim() ? listItems(a.instructions).join(' ') : a.script, 150)}</p>
                </div>
              ))}
              {challenge && <div className="pr-engage-item challenge"><b>Challenge</b><p>{clip(challenge, 180)}</p></div>}
            </div>
          )}
          <p className="pr-label">Before you teach</p>
          <ul className="pr-prep">{prep.map((item, i) => <li key={i}><span className="pr-box" /><span>{item}</span></li>)}</ul>
          <div className="pr-notes">
            <p className="pr-label">Notes</p>
            {Array.from({ length: 5 }, (_, i) => <div key={i} className="ln" />)}
          </div>
        </aside>
      </div>
    </section>
  );
};

// Every part at a glance with a blank column for the leader's own timing.
const SessionOverview: React.FC<{ service: Service; series?: Series; schedule: Record<string, string> }> = ({ service, series, schedule: clock }) => {
  const timed = Object.keys(clock).length > 0;
  const schedule = timed ? clock : buildElapsed(service);
  const sections = service.sections.filter((s) => !s.hidden && visibleParts(s).length > 0);
  return (
    <section className="pr-overview pr-page">
      <PageHead service={service} series={series} kicker="Session overview" title={service.title} right={<div className="pr-head-right"><span>Total</span><b className="pr-serif">{formatDuration(serviceMinutes(service))}{clockRange(service) && ` · ${clockRange(service)}`}</b></div>} />
      <table className="pr-ov">
        <thead>
          <tr><th /><th /><th>Part</th><th>{timed ? 'Starts' : 'At'}</th><th className="r">Approx.</th><th className="r">My time</th></tr>
        </thead>
        {sections.map((section) => {
          const parts = visibleParts(section);
          return (
            <tbody key={section.id} className="pr-ov-group">
              {parts.map((p, i) => {
                const Icon = PART_TYPES[p.type].icon;
                return (
                  <tr key={p.id} className={p.optional ? 'opt' : ''}>
                    {i === 0 && (
                      <td rowSpan={parts.length} className="pr-ov-sec">
                        <span>{section.title}</span>
                      </td>
                    )}
                    <td className="box"><span className="pr-box" /></td>
                    <td>
                      <b>{p.optional && '⊕ '}{p.title}</b>
                      <span className="pr-ov-type"><Icon /> {p.optional ? 'Going deeper' : PART_TYPES[p.type].label}</span>
                    </td>
                    <td className="t">{schedule[p.id] ?? '—'}</td>
                    <td className="r"><Timer className="pr-ov-clock" /> {p.minutes} min</td>
                    <td className="r"><span className="line" /></td>
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>
      <p className="pr-ov-foot">⊕ Going deeper parts are optional extras if you have time. They aren't counted in the run time.</p>
    </section>
  );
};

const SmallGroupPage: React.FC<{ service: Service; series?: Series }> = ({ service, series }) => {
  const g = smallGroupGuide(service);
  if (!g.has) return null;
  return (
    <section className="pr-sg pr-page">
      <PageHead
        service={service}
        series={series}
        kicker={series ? series.title : service.audience}
        title="Small group guide"
        right={<span className="pr-tag">{service.title}</span>}
      />
      {(service.bigIdea || service.keyVerse) && (
        <div className="pr-sg-idea">
          {service.bigIdea && <div><p className="pr-label">Today's big idea</p><p className="pr-serif">{service.bigIdea}</p></div>}
          {service.keyVerse && <div className="verse"><p className="pr-label">Key verse</p><p className="pr-serif">{service.keyVerse}</p></div>}
        </div>
      )}
      {g.icebreaker && (
        <div className="pr-sg-open">
          <p className="pr-sg-kicker warm">Open with</p>
          <p className="pr-serif">{g.icebreaker}</p>
        </div>
      )}
      {g.questions.length > 0 && (
        <div className="pr-sg-questions">
          <p className="pr-sg-kicker">Discussion</p>
          <ol>
            {g.questions.map((q, i) => <li key={i}><span>{i + 1}</span><p className="pr-serif">{q}</p></li>)}
          </ol>
        </div>
      )}
      {g.notes && (
        <div className="pr-sg-notes">
          <p className="pr-sg-kicker">Leading well</p>
          <Blocks text={g.notes} />
        </div>
      )}
      {(g.prayer || g.challenge) && (
        <div className={`pr-sg-close ${g.prayer && g.challenge ? 'two' : ''}`}>
          {g.prayer && (
            <div>
              <p className="pr-sg-kicker">Pray together</p>
              <p className="pr-serif pr-sg-pray">{g.prayer}</p>
            </div>
          )}
          {g.challenge && (
            <div>
              <p className="pr-sg-kicker">This week</p>
              {paragraphs(g.challenge).map((para, i) => <p key={i} className="pr-sg-small">{para}</p>)}
            </div>
          )}
        </div>
      )}
      {g.activities.map((a) => <PartBlock key={a.id} service={service} part={a} />)}
    </section>
  );
};

const FAMILY_ICONS: Record<keyof FamilyCues, React.ElementType> = { morning: Sunrise, onTheGo: Car, meal: Utensils, bedtime: Moon };

const FamilyPage: React.FC<{ service: Service; series?: Series }> = ({ service, series }) => {
  const cues = familyCues(service, series);
  const keys = (Object.keys(FAMILY_LABELS) as (keyof FamilyCues)[]).filter((k) => cues[k]);
  if (!keys.length) return null;
  const verse = service.keyVerse || series?.memoryVerse;
  return (
    <section className="pr-family pr-page">
      <header className="pr-family-head">
        <p className="pr-eyebrow">{series ? `${series.title} · Week ${service.week}` : service.audience} · For families</p>
        <h1>Everyday moments</h1>
        <p className="pr-family-sub">This week your {/kid|child|preschool|k–5|k-5/i.test(service.audience) ? 'child' : 'student'} learned: <b>{service.title}</b></p>
      </header>
      {(service.bigIdea || verse) && (
        <div className="pr-family-strip">
          {service.bigIdea && <p className="pr-serif">{service.bigIdea}</p>}
          {verse && <p className="pr-family-verse pr-serif">{verse}</p>}
        </div>
      )}
      <div className="pr-family-grid">
        {keys.map((k) => {
          const Icon = FAMILY_ICONS[k];
          return (
            <div key={k} className={`pr-family-card ${k}`}>
              <div className="pr-family-card-head"><span><Icon /></span><b>{FAMILY_LABELS[k].title}</b></div>
              <p className="pr-serif">{cues[k]}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
};

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const SectionBlock: React.FC<{ service: Service; section: Section; schedule: Record<string, string>; index?: number }> = ({ service, section, schedule, index }) => (
  <section className={`pr-sec ${section.pageBreak ? 'pr-break-after' : ''}`}>
    {visibleParts(section).map((part, i) => (
      <PartBlock
        key={part.id}
        service={service}
        part={part}
        time={schedule[part.id]}
        lead={i === 0 && (
          <header className="pr-sec-head">
            <p className="pr-eyebrow">
              {[index !== undefined ? `Part ${index + 1}` : '', schedule[section.id], `${sectionMinutes(section)} min`].filter(Boolean).join(' · ')}
            </p>
            <h2>{section.title}</h2>
          </header>
        )}
      />
    ))}
  </section>
);

// "The setup: Pair students…" → a bold lead-in, the way printed curricula set them.
const LEAD = /^([A-Z][^:.?!"“]{1,38}):\s+/;
const Rich: React.FC<{ text: string }> = ({ text }) => {
  const m = text.match(LEAD);
  const body = m ? text.slice(m[0].length) : text;
  return (
    <>
      {m && <b className="pr-lead">{m[1]}. </b>}
      {cueSegments(body).map((seg, j, all) => (seg.cue ? <span key={j} className={j === 0 && all.length > 1 && seg.text.length <= 60 ? 'pr-cue' : 'pr-direction'}>{seg.text}</span> : <React.Fragment key={j}>{seg.text}</React.Fragment>))}
    </>
  );
};

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;
// Paragraphs, with runs of "• …" lines grouped into lists.
const Blocks: React.FC<{ text: string; serif?: boolean }> = ({ text, serif }) => {
  const chunks = paragraphs(text).flatMap((p) => (p.split('\n').every((l) => BULLET.test(l)) || looksLikeList(p) ? p.split('\n') : [p]));
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={out.length} className="pr-list">{list.map((l, i) => <li key={i}><Rich text={l} /></li>)}</ul>);
    list = [];
  };
  chunks.forEach((c) => {
    if (BULLET.test(c)) list.push(c.replace(BULLET, '').trim());
    else {
      flush();
      out.push(<p key={out.length} className={serif ? 'pr-serif' : ''}><Rich text={c} /></p>);
    }
  });
  flush();
  return <div className={serif ? 'pr-say' : 'pr-do'}>{out}</div>;
};

// Scripture set like a reading: verse numbers become superscripts.
const Reading: React.FC<{ text: string }> = ({ text }) => (
  <div className={`pr-reading pr-serif ${text.length > 1100 ? 'cols' : ''}`}>
    {paragraphs(text).map((para, i) => {
      const cue = para.match(/^\[([^\]]+)\]$/);
      if (cue) return <p key={i} className="pr-reading-cue">{cue[1]}</p>;
      return (
        <p key={i}>
          {para.split(/(?:^|(?<=[\s.,;:!?"'”’—]))(\d{1,3})(?=\s+[A-Z“"‘'(])/).map((seg, j) => (j % 2 ? <sup key={j}>{seg}</sup> : seg))}
        </p>
      );
    })}
  </div>
);

const QR: React.FC<{ url: string }> = ({ url }) => {
  const qr = qrPath(url);
  if (!qr) return null;
  return (
    <svg viewBox={`-1 -1 ${qr.size + 2} ${qr.size + 2}`} shapeRendering="crispEdges" aria-hidden="true">
      <rect x={-1} y={-1} width={qr.size + 2} height={qr.size + 2} fill="white" />
      <path d={qr.d} fill="#0F172A" />
    </svg>
  );
};

// A row with its label set in the left margin: SAY, DO, ASK, READ…
const M: React.FC<{ label: string; tone?: string; children: React.ReactNode }> = ({ label, tone, children }) => (
  <div className={`pr-m ${tone ?? ''}`}>
    <p className="pr-m-label">{label}</p>
    <div className="pr-m-body">{children}</div>
  </div>
);

// "Read: Acts 8:26–38" is a scripture reading; "Read It · Sit In It · Live It" is a study, not a reading.
const READ_TITLE = /^read(ing)?\b(?!\s+it\b)/i;
const POINT = /^point\s+(\d+)\s*[:.–—-]\s*(.+)$/i;

const PartBlock: React.FC<{ service: Service; part: Part; time?: string; lead?: React.ReactNode }> = ({ service, part, time, lead }) => {
  const { label } = PART_TYPES[part.type];
  const links = [...part.media, ...part.resources].filter((l) => /^https?:\/\//.test(l.url));
  const supplies = part.supplies.filter((s) => s.name.trim());
  const isQuestions = part.type === 'discussion' && (listItems(part.script).length > 1 || part.script.trim().endsWith('?'));
  const isShortVerse = part.type === 'bible-verse' && part.script.trim() && part.script.length < 400;
  const isReading = !isShortVerse && (part.type === 'bible-verse' || READ_TITLE.test(part.title));
  const point = part.title.match(POINT);
  const readingRef = isReading ? part.title.replace(/^read(ing)?\s*[:–—-]?\s*/i, '') : '';
  const kind = part.optional ? 'Going deeper · optional'
    : point ? `Point ${point[1]}${time ? ` · ${time}` : ''} · ${part.minutes} min`
    : isReading ? 'Scripture reading'
    : part.type === 'script' || part.type === 'other' ? '' : label;
  const head = (
    <div className="pr-p-head">
      <div className="pr-p-when">
        {point ? <span className="pr-p-num">{pad2(Number(point[1]))}</span> : (
          <>
            {time && <b>{time}</b>}
            <span>{part.minutes} min</span>
          </>
        )}
      </div>
      <div>
        {kind && <p className="pr-p-kind">{kind}</p>}
        <h3>{point ? point[2] : isReading && readingRef ? readingRef : part.title}</h3>
      </div>
    </div>
  );
  const rows = [
    supplies.length > 0 && (
      <M key="need" label="Need">
        <ul className="pr-need">{supplies.map((s) => <li key={s.id}><b>{fmtQty(supplyTotal(s, service))}</b> {s.name}</li>)}</ul>
      </M>
    ),
    part.instructions.trim() && <M key="do" label="Do"><Blocks text={part.instructions} /></M>,
    part.script.trim() && (
      isQuestions ? (
        <M key="say" label="Ask">
          <ol className="pr-questions">
            {listItems(part.script).map((q, i) => <li key={i}><span className="n">{i + 1}</span><p className="pr-serif"><Rich text={q} /></p></li>)}
          </ol>
        </M>
      ) : isShortVerse ? (
        <M key="say" label="Read"><div className="pr-bigverse pr-serif"><p>{part.script}</p></div></M>
      ) : isReading ? (
        <M key="say" label="Read"><Reading text={part.script} /></M>
      ) : (
        <M key="say" label="Say"><Blocks text={part.script} serif /></M>
      )
    ),
    links.length > 0 && (
      <M key="screen" label="Screen">
        <div className="pr-links">
          {links.map((l) => (
            <div key={l.id} className="pr-link">
              <QR url={l.url} />
              <div><b>{l.label || 'Scan to open'}</b><span>{l.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}</span></div>
            </div>
          ))}
        </div>
      </M>
    ),
    part.inclusionTips.trim() && <M key="adapt" label="Adapt" tone="inclusion"><Blocks text={part.inclusionTips} /></M>,
    part.leaderNotes.trim() && <M key="note" label="Note" tone="note"><Blocks text={part.leaderNotes} /></M>,
  ].filter(Boolean);
  // Text flows to fill each page; CSS keeps headings attached to the first lines under them.
  return (
    <>
      {lead}
      <article data-part={part.id} className={`pr-p ${part.optional ? 'deeper' : ''} ${point ? 'point' : ''} ${lead ? 'first' : ''} ${part.pageBreak ? 'pr-break-after' : ''}`}>
        {head}
        {rows}
      </article>
    </>
  );
};

// ---------- Take-home cards ----------

const TakeHome: React.FC<{ service: Service; series?: Series }> = ({ service, series }) => {
  const parts = service.sections.filter((s) => !s.hidden).flatMap(visibleParts);
  const questions = parts.filter((p) => p.type === 'discussion' && p.script.trim()).flatMap((p) => listItems(p.script)).slice(0, 3);
  const prayer = parts.find((p) => p.type === 'prayer' && p.script.trim())?.script.trim();
  const challenge = stripCues(parts.find((p) => /challenge/i.test(p.title) && p.script.trim())?.script ?? '');
  const verse = service.keyVerse || series?.memoryVerse;
  const card = (
    <div className="pr-card">
      <div>
        <p className="pr-eyebrow">Take it home{series && service.week ? ` · ${series.title}, week ${service.week}` : ''}</p>
        <h2>{service.title}</h2>
        {service.bigIdea && <p className="idea pr-serif">{service.bigIdea}</p>}
        {verse && <div className="verse pr-serif"><p className="pr-label">Memory verse</p>{verse}</div>}
      </div>
      <div className="right">
        {questions.length > 0 && <div><p className="pr-label">Talk about it</p><ol>{questions.map((q, i) => <li key={i}>{q}</li>)}</ol></div>}
        {challenge && <div><p className="pr-label">Try this week</p><p className="pray">{clip(challenge, 260)}</p></div>}
        {prayer && <div><p className="pr-label">Pray together</p><p className="pray pr-serif">{clip(prayer, 260)}</p></div>}
        {!questions.length && !challenge && !prayer && (
          <div><p className="pr-label">Talk about it</p><ol><li>What was your favorite part of today?</li><li>What did you learn about God?</li><li>How can we remember this together this week?</li></ol></div>
        )}
      </div>
    </div>
  );
  return (
    <section className="pr-takehome pr-page">
      {card}
      <div className="pr-cut">Cut here</div>
      {card}
    </section>
  );
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, '')}…` : s);

// ---------- Compact documents ----------

const MiniHeader: React.FC<{ service: Service; series?: Series; title: string; eyebrow?: string }> = ({ service, series, title, eyebrow }) => (
  <header className="pr-mini">
    <div>
      <p className="pr-eyebrow">{eyebrow ?? (series ? `${series.title} · Week ${service.week}` : service.title)}</p>
      <h1>{title}</h1>
    </div>
    <div className="r">{service.date && <b>{formatWhen(service.date)}</b>}{clockRange(service) || formatDuration(serviceMinutes(service))}</div>
  </header>
);

const RunSheet: React.FC<{ service: Service; series?: Series; schedule: Record<string, string> }> = ({ service, series, schedule }) => (
  <>
    <MiniHeader service={service} series={series} title={`Run sheet: ${service.title}`} />
    <table className="pr-table">
      <tbody>
        {service.sections.filter((s) => !s.hidden).map((section) => (
          <React.Fragment key={section.id}>
            <tr className="sec">
              <td className="time">{schedule[section.id]}</td>
              <td colSpan={2}>{section.title}</td>
              <td className="who">Leader</td>
              <td className="min">{sectionMinutes(section)}′</td>
            </tr>
            {visibleParts(section).map((p) => (
              <tr key={p.id}>
                <td className="time">{schedule[p.id]}</td>
                <td>{p.title}</td>
                <td style={{ color: '#64748B', width: '1.2in' }}>{PART_TYPES[p.type].label}</td>
                <td className="who"><span className="line" /></td>
                <td className="min">{p.minutes}′</td>
              </tr>
            ))}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  </>
);

const SupplyList: React.FC<{ service: Service; series?: Series }> = ({ service, series }) => (
  <>
    <MiniHeader service={service} series={series} title="Supply list" eyebrow={`${service.title} · ${service.classSize} kids · ${service.groupCount} groups`} />
    <ul className="pr-checklist pr-supply-grid">
      {aggregateSupplies(service).map((l) => (
        <li key={l.key}>
          <span className="pr-box" />
          <span>{l.name}<span className="src">{l.sources.join(', ')}</span></span>
          <span className="qty">{fmtQty(l.total)}</span>
        </li>
      ))}
    </ul>
  </>
);
