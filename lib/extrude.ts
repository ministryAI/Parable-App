import opentype from 'opentype.js';
import anton from '@fontsource/anton/files/anton-latin-400-normal.woff?url';
import bebas from '@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff?url';
import archivoBlack from '@fontsource/archivo-black/files/archivo-black-latin-400-normal.woff?url';
import oswald from '@fontsource/oswald/files/oswald-latin-700-normal.woff?url';
import spaceGrotesk from '@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff?url';
import leagueGothic from '@fontsource/league-gothic/files/league-gothic-latin-400-normal.woff?url';
import fjalla from '@fontsource/fjalla-one/files/fjalla-one-latin-400-normal.woff?url';
import bungee from '@fontsource/bungee/files/bungee-latin-400-normal.woff?url';
import bowlby from '@fontsource/bowlby-one-sc/files/bowlby-one-sc-latin-400-normal.woff?url';
import rubikMono from '@fontsource/rubik-mono-one/files/rubik-mono-one-latin-400-normal.woff?url';
import ultra from '@fontsource/ultra/files/ultra-latin-400-normal.woff?url';
import shrikhand from '@fontsource/shrikhand/files/shrikhand-latin-400-normal.woff?url';

// 3D type: text becomes real outlines (so it can be warped and exported as vector), then the
// outline is stacked along a direction to fake depth, with a face, strokes and a shadow on top.

export const TYPE_FONTS: { name: string; weight: number; url: string }[] = [
  { name: 'Anton', weight: 400, url: anton },
  { name: 'Bebas Neue', weight: 400, url: bebas },
  { name: 'Archivo Black', weight: 400, url: archivoBlack },
  { name: 'Oswald', weight: 700, url: oswald },
  { name: 'Space Grotesk', weight: 700, url: spaceGrotesk },
  { name: 'League Gothic', weight: 400, url: leagueGothic },
  { name: 'Fjalla One', weight: 400, url: fjalla },
  { name: 'Bungee', weight: 400, url: bungee },
  { name: 'Bowlby One SC', weight: 400, url: bowlby },
  { name: 'Rubik Mono One', weight: 400, url: rubikMono },
  { name: 'Ultra', weight: 400, url: ultra },
  { name: 'Shrikhand', weight: 400, url: shrikhand },
];

const fonts = new Map<string, Promise<opentype.Font>>();
export const loadTypeFont = (name: string): Promise<opentype.Font> => {
  const entry = TYPE_FONTS.find((f) => f.name === name) ?? TYPE_FONTS[0];
  if (!fonts.has(entry.name)) {
    fonts.set(entry.name, fetch(entry.url).then((r) => r.arrayBuffer()).then((buf) => opentype.parse(buf)));
  }
  return fonts.get(entry.name)!;
};

export type Warp = 'none' | 'arch' | 'bulge' | 'wave' | 'rise';

export interface TypeSettings {
  text: string;
  font: string;
  scale: number; // 0.3–1.8, relative to "fits the canvas"
  tracking: number; // in em/1000
  leading: number; // line height, 0.7–1.6
  align: 'left' | 'center' | 'right';
  x: number; // offset from center, canvas px
  y: number;
  depth: number; // canvas px at a 1080-wide canvas
  angle: number; // degrees, 0 = right, 90 = down
  shading: 'solid' | 'shaded' | 'lines';
  face: string;
  face2: string; // gradient end; same as face for flat
  side: string;
  stroke: number;
  strokeColor: string;
  outer: number; // stroke around the whole object
  outerColor: string;
  shadow: boolean;
  shadowColor: string;
  warp: Warp;
  bend: number; // -100–100
  canvas: string; // CANVASES key
  background: string;
  transparent: boolean;
}

export const CANVASES: Record<string, { label: string; w: number; h: number }> = {
  square: { label: 'Square', w: 1080, h: 1080 },
  portrait: { label: '4:5', w: 1080, h: 1350 },
  story: { label: '9:16', w: 1080, h: 1920 },
  slide: { label: '16:9', w: 1920, h: 1080 },
  letter: { label: 'Letter', w: 2550, h: 3300 },
};

export const DEFAULT_TYPE: TypeSettings = {
  text: 'BEGIN WITH\nPRAYER',
  font: 'Anton',
  scale: 1,
  tracking: 0,
  leading: 1,
  align: 'center',
  x: 0,
  y: 0,
  depth: 70,
  angle: 45,
  shading: 'shaded',
  face: '#FF3B30',
  face2: '#FF3B30',
  side: '#1D1D1F',
  stroke: 6,
  strokeColor: '#1D1D1F',
  outer: 0,
  outerColor: '#FFFFFF',
  shadow: true,
  shadowColor: '#000000',
  warp: 'none',
  bend: 25,
  canvas: 'square',
  background: '#FFFFFF',
  transparent: false,
};

type Pt = { x: number; y: number };
type Ring = Pt[];

// Curves become short straight segments so warps can move every point smoothly.
const flatten = (commands: opentype.PathCommand[], steps = 10): Ring[] => {
  const rings: Ring[] = [];
  let ring: Ring = [];
  let cx = 0;
  let cy = 0;
  for (const c of commands) {
    if (c.type === 'M') {
      if (ring.length) rings.push(ring);
      ring = [{ x: c.x, y: c.y }];
      cx = c.x; cy = c.y;
    } else if (c.type === 'L') {
      ring.push({ x: c.x, y: c.y });
      cx = c.x; cy = c.y;
    } else if (c.type === 'Q') {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const k = 1 - t;
        ring.push({ x: k * k * cx + 2 * k * t * c.x1 + t * t * c.x, y: k * k * cy + 2 * k * t * c.y1 + t * t * c.y });
      }
      cx = c.x; cy = c.y;
    } else if (c.type === 'C') {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const k = 1 - t;
        ring.push({
          x: k * k * k * cx + 3 * k * k * t * c.x1 + 3 * k * t * t * c.x2 + t * t * t * c.x,
          y: k * k * k * cy + 3 * k * k * t * c.y1 + 3 * k * t * t * c.y2 + t * t * t * c.y,
        });
      }
      cx = c.x; cy = c.y;
    } else if (c.type === 'Z') {
      if (ring.length) rings.push(ring);
      ring = [];
    }
  }
  if (ring.length) rings.push(ring);
  return rings;
};

const bounds = (rings: Ring[]) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const p of r) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  if (!isFinite(x0)) return { x: 0, y: 0, w: 1, h: 1 };
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
};

// Lines laid out at a nominal size; the caller scales the result to the canvas.
const layout = (font: opentype.Font, s: TypeSettings): Ring[] => {
  const size = 200;
  const lines = (s.text || ' ').split(/\r?\n/).slice(0, 8);
  const gap = size * s.leading * 1.05;
  const track = (s.tracking / 1000) * size;
  const widths = lines.map((line) => {
    const glyphs = font.stringToGlyphs(line);
    return glyphs.reduce((w, g, i) => w + (g.advanceWidth ?? 0) * (size / font.unitsPerEm) + (i < glyphs.length - 1 ? track : 0), 0);
  });
  const widest = Math.max(...widths, 1);
  const rings: Ring[] = [];
  lines.forEach((line, li) => {
    const lead = s.align === 'left' ? 0 : s.align === 'right' ? widest - widths[li] : (widest - widths[li]) / 2;
    let x = lead;
    const glyphs = font.stringToGlyphs(line);
    glyphs.forEach((g, i) => {
      rings.push(...flatten(g.getPath(x, li * gap, size).commands));
      x += (g.advanceWidth ?? 0) * (size / font.unitsPerEm);
      if (i < glyphs.length - 1) x += track + font.getKerningValue(g, glyphs[i + 1]) * (size / font.unitsPerEm);
    });
  });
  return rings;
};

const warpRings = (rings: Ring[], mode: Warp, bend: number): Ring[] => {
  if (mode === 'none' || !bend) return rings;
  const b = bounds(rings);
  const a = Math.max(-1, Math.min(1, bend / 100));
  const cy = b.y + b.h / 2;
  return rings.map((r) => r.map((p) => {
    const u = (p.x - b.x) / b.w;
    const sx = u * 2 - 1;
    const hump = 1 - sx * sx;
    switch (mode) {
      case 'arch': return { x: p.x, y: p.y - a * b.h * 0.5 * hump };
      case 'bulge': return { x: p.x, y: cy + (p.y - cy) * Math.max(0.2, 1 + a * 0.8 * hump) };
      case 'wave': return { x: p.x, y: p.y + a * b.h * 0.35 * Math.sin(u * Math.PI * 2) };
      case 'rise': return { x: p.x, y: cy + (p.y - cy) * Math.max(0.2, 1 + a * 0.9 * (u - 0.5)) };
      default: return p;
    }
  }));
};

const ringsToD = (rings: Ring[]) =>
  rings.map((r) => r.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('') + 'Z').join('');

// The outline path in canvas coordinates, plus its box (for the drag target).
export const buildOutline = (font: opentype.Font, s: TypeSettings) => {
  const canvas = CANVASES[s.canvas] ?? CANVASES.square;
  const raw = warpRings(layout(font, s), s.warp, s.bend);
  const b = bounds(raw);
  const k = Math.min((canvas.w * 0.78) / b.w, (canvas.h * 0.6) / b.h) * s.scale;
  const cx = canvas.w / 2 + s.x;
  const cy = canvas.h / 2 + s.y;
  const rings = raw.map((r) => r.map((p) => ({ x: cx + (p.x - b.x - b.w / 2) * k, y: cy + (p.y - b.y - b.h / 2) * k })));
  return { d: ringsToD(rings), box: { x: cx - (b.w * k) / 2, y: cy - (b.h * k) / 2, w: b.w * k, h: b.h * k }, canvas };
};

const hex = (h: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h);
  const n = m ? parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const mixHex = (a: string, b: string, t: number) => {
  const A = hex(a);
  const B = hex(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};

// Depth and stroke sizes are tuned on a 1080-wide canvas and grow with bigger canvases.
export const unit = (s: TypeSettings) => Math.min((CANVASES[s.canvas] ?? CANVASES.square).w, (CANVASES[s.canvas] ?? CANVASES.square).h) / 1080;
