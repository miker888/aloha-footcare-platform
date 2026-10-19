// Raked sand around a stone, after the zen-sand pattern on the clinic's
// current site. Lines draw in once on load (skipped with reduced motion).

const W = 640;
const H = 520;
const CX = 300;
const CY = 250;

function ring(i: number): string {
  const rx = 74 + i * 30;
  const ry = 52 + i * 22;
  const steps = 96;
  const pts: string[] = [];
  for (let s = 0; s <= steps; s++) {
    const t = (s / steps) * Math.PI * 2;
    // A slow wobble so the lines look raked by hand, not drawn by a compass.
    const wobble = 1 + 0.018 * Math.sin(t * 3 + i * 0.9) + 0.012 * Math.sin(t * 5 - i);
    const x = CX + rx * wobble * Math.cos(t);
    const y = CY + ry * wobble * Math.sin(t);
    pts.push(`${s === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return pts.join(" ") + " Z";
}

function rake(row: number): string {
  // Straight raked lines that bend away from the outermost ring.
  const y0 = 18 + row * 22;
  const pts: string[] = [];
  for (let x = -10; x <= W + 10; x += 10) {
    const dx = (x - CX) / 330;
    const dy = (y0 - CY) / 230;
    const d = Math.sqrt(dx * dx + dy * dy);
    const push = d < 1 ? (1 - d) * 40 * Math.sign(y0 - CY || 1) : 0;
    pts.push(`${x === -10 ? "M" : "L"}${x} ${(y0 + push).toFixed(1)}`);
  }
  return pts.join(" ");
}

export function SandRipples({ className = "" }: { className?: string }) {
  const rings = Array.from({ length: 7 }, (_, i) => i);
  const rakes = Array.from({ length: 24 }, (_, i) => i).filter((r) => {
    const y = 18 + r * 22;
    return y < CY - 230 || y > CY + 230; // only outside the rings
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid slice">
      <rect width={W} height={H} fill="var(--color-dune)" />
      <g fill="none" stroke="var(--color-gold)" strokeLinecap="round">
        {rakes.map((r, i) => (
          <path
            key={`rake-${r}`}
            d={rake(r)}
            pathLength={1}
            className="ripple-line"
            strokeWidth={1.4}
            strokeOpacity={0.45}
            style={{ animationDelay: `${0.5 + i * 0.05}s` }}
          />
        ))}
        {rings.map((i) => (
          <path
            key={`ring-${i}`}
            d={ring(i)}
            pathLength={1}
            className="ripple-line"
            strokeWidth={1.6}
            strokeOpacity={0.85 - i * 0.07}
            style={{ animationDelay: `${i * 0.09}s` }}
          />
        ))}
      </g>
      {/* The stone */}
      <ellipse cx={CX + 4} cy={CY + 10} rx={50} ry={30} fill="var(--color-dune-deep)" />
      <ellipse cx={CX} cy={CY} rx={48} ry={32} fill="var(--color-drift)" />
      <ellipse cx={CX - 12} cy={CY - 10} rx={20} ry={9} fill="var(--color-shell)" opacity={0.18} />
    </svg>
  );
}
