import React from 'react';
import { mixHex, TypeSettings, unit } from '../../lib/extrude';

// The finished artwork as one self-contained SVG: what you see on the canvas is exactly what exports.
export const TypeArt = React.forwardRef<SVGSVGElement, { d: string; w: number; h: number; s: TypeSettings; id: string }>(({ d, w, h, s, id }, ref) => {
  const u = unit(s);
  const depth = s.depth * u;
  const rad = (s.angle * Math.PI) / 180;
  const dx = Math.cos(rad) * depth;
  const dy = Math.sin(rad) * depth;
  // Enough copies that the side reads as one solid surface.
  const steps = depth < 1 ? 0 : Math.min(160, Math.max(2, Math.ceil(depth / (1.4 * u))));
  const href = `#${id}-glyphs`;
  const layers: React.ReactNode[] = [];
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    const fill = s.shading === 'shaded' ? mixHex(s.side, '#000000', t * 0.45) : s.side;
    const line = s.shading === 'lines' && i % Math.max(2, Math.round(steps / 8)) === 0;
    layers.push(
      <use key={i} href={href} transform={`translate(${(dx * t).toFixed(2)} ${(dy * t).toFixed(2)})`} fill={line ? s.strokeColor : fill} stroke={line ? s.strokeColor : fill} strokeWidth={2 * u} strokeLinejoin="round" />,
    );
  }
  const faceFill = s.face2 && s.face2.toLowerCase() !== s.face.toLowerCase() ? `url(#${id}-face)` : s.face;
  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="block w-full h-full">
      <defs>
        <path id={`${id}-glyphs`} d={d} />
        <linearGradient id={`${id}-face`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={s.face} />
          <stop offset="1" stopColor={s.face2} />
        </linearGradient>
        <filter id={`${id}-blur`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation={14 * u} /></filter>
      </defs>
      {!s.transparent && <rect width={w} height={h} fill={s.background} />}
      {s.shadow && (
        <use href={href} transform={`translate(${(dx + 22 * u).toFixed(1)} ${(dy + 30 * u).toFixed(1)})`} fill={s.shadowColor} opacity={0.28} filter={`url(#${id}-blur)`} />
      )}
      {s.outer > 0 && (
        <g stroke={s.outerColor} strokeWidth={(s.outer + s.stroke) * 2 * u} strokeLinejoin="round" fill={s.outerColor}>
          <use href={href} />
          {steps > 0 && <use href={href} transform={`translate(${dx.toFixed(2)} ${dy.toFixed(2)})`} />}
          {Array.from({ length: Math.min(steps, 24) }, (_, i) => {
            const t = (i + 1) / Math.min(steps, 24);
            return <use key={i} href={href} transform={`translate(${(dx * t).toFixed(2)} ${(dy * t).toFixed(2)})`} />;
          })}
        </g>
      )}
      {layers}
      {s.stroke > 0 && <use href={href} fill={faceFill} stroke={s.strokeColor} strokeWidth={s.stroke * 2 * u} strokeLinejoin="round" />}
      <use href={href} fill={faceFill} />
    </svg>
  );
});
TypeArt.displayName = 'TypeArt';
