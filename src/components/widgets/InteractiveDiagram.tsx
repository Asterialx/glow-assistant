import { calculateFormula, type DiagramBlock } from "../../lib/genUi";

/** Declarative geometry only: model data cannot introduce markup, scripts or styles. */
export function InteractiveDiagram({ block, values, locale }: {
  block: DiagramBlock;
  values: Record<string, number>;
  locale: "ru" | "en";
}) {
  const points = block.points.map((point) => ({
    ...point, x: calculateFormula(point.x, values), y: calculateFormula(point.y, values),
  }));
  if (points.some((point) => point.x === null || point.y === null)) {
    return <p role="status" className="text-sm text-[var(--fg-muted)]">
      {locale === "ru" ? "Схема не определена для этих значений." : "The diagram is undefined for these values."}
    </p>;
  }
  const xs = points.map((point) => point.x!), ys = points.map((point) => point.y!);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min(328 / (maxX - minX || 1), 168 / (maxY - minY || 1));
  const left = (400 - (maxX - minX) * scale) / 2, top = (240 - (maxY - minY) * scale) / 2;
  const projected = points.map((point) => ({ ...point, sx: left + (point.x! - minX) * scale, sy: 240 - top - (point.y! - minY) * scale }));
  const byId = new Map(projected.map((point) => [point.id, point]));
  return <svg viewBox="0 0 400 240" role="img" aria-label={block.title} className="block w-full max-h-64 text-[var(--fg-muted)]">
    <title>{block.title}</title>
    {block.lines.map((line, index) => {
      const from = byId.get(line.from)!, to = byId.get(line.to)!;
      return <line key={index} x1={from.sx} y1={from.sy} x2={to.sx} y2={to.sy}
        stroke={line.accent ? "var(--accent)" : "var(--fg-muted)"} strokeWidth="2" vectorEffect="non-scaling-stroke" />;
    })}
    {projected.map((point) => <g key={point.id}>
      <circle cx={point.sx} cy={point.sy} r="3" fill="var(--accent)" />
      {point.label && <text x={point.sx} y={point.sy < 120 ? point.sy - 12 : point.sy + 20}
        textAnchor="middle" fill="var(--fg-muted)" fontSize="12">{point.label}</text>}
    </g>)}
  </svg>;
}
