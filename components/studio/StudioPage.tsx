import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import opentype from 'opentype.js';
import '@fontsource/anton';
import '@fontsource/bebas-neue';
import '@fontsource/archivo-black';
import '@fontsource/oswald/700.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/league-gothic';
import '@fontsource/fjalla-one';
import '@fontsource/bungee';
import '@fontsource/bowlby-one-sc';
import '@fontsource/rubik-mono-one';
import '@fontsource/ultra';
import '@fontsource/shrikhand';
import { Copy, Download, FileCode2, Loader2, Minus, Plus, Redo2, RotateCcw, Undo2 } from 'lucide-react';
import { useStore } from '../../store/StoreContext';
import { designOf, resolvePalette } from '../../lib/design';
import { buildOutline, CANVASES, DEFAULT_TYPE, loadTypeFont, TYPE_FONTS, TypeSettings, unit, Warp } from '../../lib/extrude';
import { Button } from '../ui';
import { TypeArt } from './TypeArt';

const SAVED = 'parable.studio.type';

const STYLES: { name: string; set: Partial<TypeSettings> }[] = [
  { name: 'Classic', set: { face: '#FF3B30', face2: '#FF3B30', side: '#1D1D1F', shading: 'solid', stroke: 6, strokeColor: '#1D1D1F', outer: 0 } },
  { name: 'Sunset', set: { face: '#FFD60A', face2: '#FF9F0A', side: '#FF375F', shading: 'shaded', stroke: 0, outer: 0 } },
  { name: 'Ice', set: { face: '#FFFFFF', face2: '#D6E9FF', side: '#0071E3', shading: 'shaded', stroke: 4, strokeColor: '#003F7F', outer: 0 } },
  { name: 'Retro', set: { face: '#FFB340', face2: '#FFB340', side: '#7A2E0E', shading: 'lines', stroke: 7, strokeColor: '#2B1406', outer: 10, outerColor: '#FFF4DE' } },
  { name: 'Mono', set: { face: '#FFFFFF', face2: '#FFFFFF', side: '#1D1D1F', shading: 'solid', stroke: 5, strokeColor: '#1D1D1F', outer: 0 } },
  { name: 'Neon', set: { face: '#30D158', face2: '#64D2FF', side: '#0A2540', shading: 'shaded', stroke: 0, outer: 8, outerColor: '#1D1D1F' } },
];

const load = (): TypeSettings => {
  try {
    return { ...DEFAULT_TYPE, ...JSON.parse(localStorage.getItem(SAVED) || '{}') };
  } catch {
    return DEFAULT_TYPE;
  }
};

const fileName = (s: TypeSettings, ext: string) =>
  `${(s.text.split('\n').join(' ').trim() || 'type').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'type'}.${ext}`;

const download = (blob: Blob, name: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

// ---------- Inspector parts (Keynote-style: grouped sections, label on the left, control on the right) ----------

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="py-4 border-b border-black/[0.06] last:border-0">
    <h3 className="text-[13px] font-semibold text-ink mb-3">{title}</h3>
    <div className="space-y-3">{children}</div>
  </section>
);

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid grid-cols-[84px_1fr] items-center gap-3">
    <span className="text-[13px] text-gray-600">{label}</span>
    <div className="min-w-0">{children}</div>
  </div>
);

const Slider: React.FC<{ value: number; min: number; max: number; step?: number; onChange: (v: number) => void; suffix?: string }> = ({ value, min, max, step = 1, onChange, suffix = '' }) => (
  <div className="flex items-center gap-2.5">
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 min-w-0" />
    <span className="w-11 text-right text-[12px] tabular-nums text-gray-500">{Number.isInteger(step) ? value : value.toFixed(2)}{suffix}</span>
  </div>
);

const Swatch: React.FC<{ value: string; onChange: (v: string) => void; label: string }> = ({ value, onChange, label }) => (
  <label className="relative inline-flex w-7 h-7 rounded-full cursor-pointer shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]" style={{ background: value }} title={label}>
    <input type="color" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
  </label>
);

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="segmented w-full">
      {options.map(([v, label]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)} className="flex-1 justify-center !px-1.5">{label}</button>
      ))}
    </div>
  );
}

// ---------- The page ----------

export const StudioPage: React.FC = () => {
  const { db, toast } = useStore();
  const [s, setS] = useState<TypeSettings>(load);
  const [font, setFont] = useState<opentype.Font | null>(null);
  const [zoom, setZoom] = useState(1);
  const history = useRef<{ past: TypeSettings[]; future: TypeSettings[] }>({ past: [], future: [] });
  const [, bump] = useState(0);
  const artRef = useRef<SVGSVGElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const id = useId().replace(/:/g, '');

  useEffect(() => {
    let live = true;
    setFont(null);
    loadTypeFont(s.font).then((f) => live && setFont(f));
    return () => { live = false; };
  }, [s.font]);

  useEffect(() => {
    try { localStorage.setItem(SAVED, JSON.stringify(s)); } catch { /* convenience only */ }
  }, [s]);

  // Every change is undoable; drags and slider runs collapse into one step.
  const lastPush = useRef(0);
  const update = useCallback((patch: Partial<TypeSettings>) => {
    setS((cur) => {
      const now = Date.now();
      if (now - lastPush.current > 400) {
        history.current.past.push(cur);
        if (history.current.past.length > 80) history.current.past.shift();
        history.current.future = [];
      }
      lastPush.current = now;
      return { ...cur, ...patch };
    });
    bump((n) => n + 1);
  }, []);
  const undo = useCallback(() => {
    const prev = history.current.past.pop();
    if (!prev) return;
    setS((cur) => { history.current.future.push(cur); return prev; });
    lastPush.current = 0;
    bump((n) => n + 1);
  }, []);
  const redo = useCallback(() => {
    const next = history.current.future.pop();
    if (!next) return;
    setS((cur) => { history.current.past.push(cur); return next; });
    lastPush.current = 0;
    bump((n) => n + 1);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const art = useMemo(() => (font ? buildOutline(font, s) : null), [font, s]);
  const canvas = CANVASES[s.canvas] ?? CANVASES.square;

  // Colors from the leader's own books, so a title can match a series.
  const bookColors = useMemo(() => db.series.slice(0, 6).map((series) => {
    const p = resolvePalette(designOf(series));
    return { name: series.title, set: { face: p.accent, face2: p.accent, side: p.deep, strokeColor: p.deep, background: p.paper } as Partial<TypeSettings> };
  }), [db.series]);

  // ---------- Dragging: the text moves; the handle sets depth and direction ----------
  const drag = useRef<{ kind: 'move' | 'depth'; px: number; py: number; x: number; y: number } | null>(null);
  const toCanvas = (e: React.PointerEvent) => {
    const svg = overlayRef.current!;
    const r = svg.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * canvas.w, y: ((e.clientY - r.top) / r.height) * canvas.h };
  };
  const onDown = (kind: 'move' | 'depth') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = toCanvas(e);
    drag.current = { kind, px: p.x, py: p.y, x: s.x, y: s.y };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !art) return;
    const p = toCanvas(e);
    if (d.kind === 'move') {
      update({ x: Math.round(d.x + p.x - d.px), y: Math.round(d.y + p.y - d.py) });
    } else {
      const cx = art.box.x + art.box.w / 2;
      const cy = art.box.y + art.box.h / 2;
      const len = Math.hypot(p.x - cx, p.y - cy) / unit(s);
      update({ depth: Math.round(Math.min(220, len)), angle: (Math.round((Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI) + 360) % 360 });
    }
  };
  const onUp = () => { drag.current = null; };

  // ---------- Export ----------
  const svgText = () => {
    const el = artRef.current;
    if (!el) return '';
    return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(el)}`;
  };
  const [busy, setBusy] = useState(false);
  const exportPng = async () => {
    setBusy(true);
    try {
      const url = URL.createObjectURL(new Blob([svgText()], { type: 'image/svg+xml' }));
      const img = new Image();
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('render')); img.src = url; });
      const c = document.createElement('canvas');
      c.width = canvas.w;
      c.height = canvas.h;
      c.getContext('2d')!.drawImage(img, 0, 0, canvas.w, canvas.h);
      URL.revokeObjectURL(url);
      await new Promise<void>((res) => c.toBlob((b) => { if (b) download(b, fileName(s, 'png')); res(); }, 'image/png'));
    } finally {
      setBusy(false);
    }
  };
  const exportSvg = () => download(new Blob([svgText()], { type: 'image/svg+xml' }), fileName(s, 'svg'));
  const [copied, setCopied] = useState(false);
  const copySvg = async () => {
    try {
      await navigator.clipboard.writeText(svgText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast('Copying is blocked in this browser. Use Download SVG instead.');
    }
  };

  const ratio = canvas.w / canvas.h;
  const handle = art && {
    cx: art.box.x + art.box.w / 2,
    cy: art.box.y + art.box.h / 2,
    hx: art.box.x + art.box.w / 2 + Math.cos((s.angle * Math.PI) / 180) * s.depth * unit(s),
    hy: art.box.y + art.box.h / 2 + Math.sin((s.angle * Math.PI) / 180) * s.depth * unit(s),
  };
  const hs = Math.max(canvas.w, canvas.h) / 90;

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[34px] leading-tight font-display">Studio</h1>
          <p className="text-[15px] text-gray-500 mt-1">3D Type: make titles for your series, slides and handouts.</p>
        </div>
      </header>

      <div className="grid lg:grid-cols-[1fr_340px] gap-5 items-start">
        {/* Canvas */}
        <div className="bg-white rounded-2xl shadow-card overflow-hidden">
          <div className="flex items-center gap-1 px-3 h-11 border-b border-black/[0.06]">
            <button type="button" className="p-1.5 rounded-full text-gray-600 hover:bg-black/[0.05] disabled:opacity-30" onClick={undo} disabled={!history.current.past.length} aria-label="Undo" title="Undo (⌘Z)"><Undo2 className="w-4 h-4" /></button>
            <button type="button" className="p-1.5 rounded-full text-gray-600 hover:bg-black/[0.05] disabled:opacity-30" onClick={redo} disabled={!history.current.future.length} aria-label="Redo" title="Redo (⇧⌘Z)"><Redo2 className="w-4 h-4" /></button>
            <span className="mx-2 h-4 w-px bg-black/10" />
            <span className="text-[12px] text-gray-500 tabular-nums">{canvas.w} × {canvas.h}</span>
            <div className="flex-1" />
            <button type="button" className="p-1.5 rounded-full text-gray-600 hover:bg-black/[0.05]" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Zoom out"><Minus className="w-4 h-4" /></button>
            <button type="button" className="px-2 py-1 rounded-full text-[12px] tabular-nums text-gray-600 hover:bg-black/[0.05]" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
            <button type="button" className="p-1.5 rounded-full text-gray-600 hover:bg-black/[0.05]" onClick={() => setZoom((z) => Math.min(2, z + 0.25))} aria-label="Zoom in"><Plus className="w-4 h-4" /></button>
          </div>
          <div className="relative h-[min(70vh,720px)] overflow-auto flex items-center justify-center p-6 bg-[#ECECEF]" style={{ backgroundImage: 'radial-gradient(rgb(0 0 0 / 0.07) 1px, transparent 1px)', backgroundSize: '16px 16px' }}>
            <div
              className="relative shrink-0 shadow-[0_0_0_0.5px_rgb(0_0_0/0.1),0_20px_50px_-20px_rgb(0_0_0/0.35)] rounded-[4px] overflow-hidden"
              style={{
                width: `min(${100 * zoom}%, calc(${(Math.min(70, 72) * zoom).toFixed(1)}vh * ${ratio.toFixed(4)}))`,
                aspectRatio: `${canvas.w} / ${canvas.h}`,
                backgroundImage: s.transparent ? 'conic-gradient(#ddd 25%, #fff 0 50%, #ddd 0 75%, #fff 0)' : undefined,
                backgroundSize: '20px 20px',
              }}
            >
              {art ? (
                <TypeArt ref={artRef} d={art.d} w={canvas.w} h={canvas.h} s={s} id={id} />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
              )}
              {art && handle && (
                <svg ref={overlayRef} viewBox={`0 0 ${canvas.w} ${canvas.h}`} className="absolute inset-0 w-full h-full touch-none" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
                  <rect x={art.box.x} y={art.box.y} width={art.box.w} height={art.box.h} fill="transparent" className="cursor-move" onPointerDown={onDown('move')} onDoubleClick={() => update({ x: 0, y: 0 })} />
                  <line x1={handle.cx} y1={handle.cy} x2={handle.hx} y2={handle.hy} stroke="#0071E3" strokeWidth={hs / 4} strokeDasharray={`${hs / 1.5} ${hs / 1.5}`} pointerEvents="none" />
                  <circle cx={handle.hx} cy={handle.hy} r={hs} fill="#0071E3" stroke="white" strokeWidth={hs / 3} className="cursor-crosshair" onPointerDown={onDown('depth')}>
                    <title>Drag to set depth and direction</title>
                  </circle>
                </svg>
              )}
            </div>
          </div>
          <p className="px-4 py-2.5 text-[12px] text-gray-500 border-t border-black/[0.06]">Drag the text to move it, double-click to center it. Drag the blue dot to set depth and direction.</p>
        </div>

        {/* Inspector */}
        <aside className="bg-white rounded-2xl shadow-card px-5 lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-88px)] overflow-y-auto">
          <Section title="Text">
            <textarea
              value={s.text}
              onChange={(e) => update({ text: e.target.value })}
              rows={2}
              spellCheck={false}
              className="w-full bg-black/[0.04] rounded-lg px-3 py-2 text-[15px] font-semibold resize-none focus:outline-none focus:ring-[3px] focus:ring-accent/25 focus:bg-white"
            />
            <div className="grid grid-cols-3 gap-1.5">
              {TYPE_FONTS.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => update({ font: f.name })}
                  title={f.name}
                  className={`h-11 rounded-lg text-[17px] leading-none truncate px-1 transition-colors ${s.font === f.name ? 'bg-accent text-white' : 'bg-black/[0.04] hover:bg-black/[0.07] text-ink'}`}
                  style={{ fontFamily: `"${f.name}"`, fontWeight: f.weight }}
                >
                  Aa
                  <span className="sr-only">{f.name}</span>
                </button>
              ))}
            </div>
            <p className="text-[12px] text-gray-500 -mt-1">{s.font}</p>
            <Row label="Align"><Segmented value={s.align} options={[['left', 'Left'], ['center', 'Center'], ['right', 'Right']]} onChange={(align) => update({ align })} /></Row>
            <Row label="Size"><Slider value={s.scale} min={0.3} max={1.8} step={0.01} onChange={(scale) => update({ scale })} /></Row>
            <Row label="Spacing"><Slider value={s.tracking} min={-80} max={300} onChange={(tracking) => update({ tracking })} /></Row>
            <Row label="Line height"><Slider value={s.leading} min={0.7} max={1.6} step={0.01} onChange={(leading) => update({ leading })} /></Row>
          </Section>

          <Section title="Style">
            <div className="grid grid-cols-3 gap-1.5">
              {STYLES.map((st) => (
                <button key={st.name} type="button" onClick={() => update(st.set)} className="group rounded-lg bg-black/[0.04] hover:bg-black/[0.07] p-2 text-left">
                  <span className="flex gap-1 mb-1.5">
                    {[st.set.face, st.set.side, st.set.strokeColor ?? st.set.outerColor].filter(Boolean).map((c, i) => (
                      <span key={i} className="w-3.5 h-3.5 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]" style={{ background: c }} />
                    ))}
                  </span>
                  <span className="text-[12px] font-medium text-gray-700">{st.name}</span>
                </button>
              ))}
            </div>
            {bookColors.length > 0 && (
              <div>
                <p className="text-[12px] text-gray-500 mb-1.5">From your books</p>
                <div className="flex flex-wrap gap-1.5">
                  {bookColors.map((b) => (
                    <button key={b.name} type="button" onClick={() => update(b.set)} className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] hover:bg-black/[0.07] pl-1 pr-2.5 py-1 text-[12px] text-gray-700 max-w-full">
                      <span className="w-4 h-4 rounded-full shrink-0" style={{ background: `linear-gradient(135deg, ${b.set.face} 50%, ${b.set.side} 50%)` }} />
                      <span className="truncate">{b.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Section>

          <Section title="Depth">
            <Row label="Depth"><Slider value={s.depth} min={0} max={220} onChange={(depth) => update({ depth })} /></Row>
            <Row label="Direction"><Slider value={s.angle} min={0} max={359} onChange={(angle) => update({ angle })} suffix="°" /></Row>
            <Row label="Sides"><Segmented value={s.shading} options={[['solid', 'Solid'], ['shaded', 'Shaded'], ['lines', 'Lines']]} onChange={(shading) => update({ shading })} /></Row>
          </Section>

          <Section title="Color">
            <Row label="Face">
              <div className="flex items-center gap-2">
                <Swatch label="Face top" value={s.face} onChange={(face) => update({ face })} />
                <Swatch label="Face bottom" value={s.face2} onChange={(face2) => update({ face2 })} />
                <span className="text-[12px] text-gray-400">top · bottom</span>
              </div>
            </Row>
            <Row label="Sides"><Swatch label="Sides" value={s.side} onChange={(side) => update({ side })} /></Row>
            <Row label="Outline">
              <div className="flex items-center gap-2.5"><Swatch label="Outline color" value={s.strokeColor} onChange={(strokeColor) => update({ strokeColor })} /><div className="flex-1"><Slider value={s.stroke} min={0} max={24} onChange={(stroke) => update({ stroke })} /></div></div>
            </Row>
            <Row label="Outer edge">
              <div className="flex items-center gap-2.5"><Swatch label="Outer edge color" value={s.outerColor} onChange={(outerColor) => update({ outerColor })} /><div className="flex-1"><Slider value={s.outer} min={0} max={30} onChange={(outer) => update({ outer })} /></div></div>
            </Row>
            <Row label="Shadow">
              <div className="flex items-center gap-2.5">
                <Swatch label="Shadow color" value={s.shadowColor} onChange={(shadowColor) => update({ shadowColor })} />
                <label className="inline-flex items-center gap-2 text-[13px] text-gray-700 cursor-pointer">
                  <input type="checkbox" role="switch" className="sr-only peer" checked={s.shadow} onChange={(e) => update({ shadow: e.target.checked })} />
                  <span aria-hidden="true" className="relative w-[34px] h-5 rounded-full bg-gray-300 transition-colors peer-checked:bg-[#34C759] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-[14px]" />
                  {s.shadow ? 'On' : 'Off'}
                </label>
              </div>
            </Row>
          </Section>

          <Section title="Shape">
            <Row label="Warp">
              <select value={s.warp} onChange={(e) => update({ warp: e.target.value as Warp })} className="w-full bg-black/[0.04] rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-[3px] focus:ring-accent/25">
                <option value="none">None</option>
                <option value="arch">Arch</option>
                <option value="bulge">Bulge</option>
                <option value="wave">Wave</option>
                <option value="rise">Rise</option>
              </select>
            </Row>
            {s.warp !== 'none' && <Row label="Bend"><Slider value={s.bend} min={-100} max={100} onChange={(bend) => update({ bend })} /></Row>}
          </Section>

          <Section title="Canvas">
            <Segmented value={s.canvas} options={Object.entries(CANVASES).map(([k, c]) => [k, c.label] as [string, string])} onChange={(c) => update({ canvas: c })} />
            <Row label="Background">
              <div className="flex items-center gap-2.5">
                <Swatch label="Background" value={s.background} onChange={(background) => update({ background, transparent: false })} />
                <label className="inline-flex items-center gap-2 text-[13px] text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={s.transparent} onChange={(e) => update({ transparent: e.target.checked })} />
                  Transparent
                </label>
              </div>
            </Row>
          </Section>

          <Section title="Export">
            <div className="grid grid-cols-2 gap-2">
              <Button icon={Download} onClick={exportPng} loading={busy} disabled={!art}>PNG</Button>
              <Button variant="outline" icon={Download} onClick={exportSvg} disabled={!art}>SVG</Button>
              <Button variant="outline" icon={copied ? FileCode2 : Copy} onClick={copySvg} disabled={!art} className="col-span-2">{copied ? 'Copied' : 'Copy SVG code'}</Button>
            </div>
            <button type="button" onClick={() => update(DEFAULT_TYPE)} className="inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline"><RotateCcw className="w-3.5 h-3.5" />Start over</button>
          </Section>
        </aside>
      </div>
    </div>
  );
};
