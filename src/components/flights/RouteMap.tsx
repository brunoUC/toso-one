import { geoMercator, geoNaturalEarth1, geoPath, type GeoProjection } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import world from "world-atlas/countries-110m.json";
import { STATUS_LABEL, distanceText, type FareStatus } from "@/lib/fare-status";
import { airportCoords, type DestinationGroup } from "@/lib/flight-groups";
import { brl } from "@/lib/format";

// Mapa do Brasil à Europa, com o Japão num recorte no canto. Desenhado no
// servidor (SVG puro, sem JavaScript no navegador): países do world-atlas
// 1:110m, rotas em arco de círculo máximo e um ponto por destino na cor do
// melhor preço contra o alvo da rota. Cor sempre com texto: rótulo no mapa,
// título no ponto e a lista ao lado.

const W = 1000;
const H = 900;
const BRAZIL = "076";
const JAPAN = "392";

const countries = feature(world as unknown as Topology, (world as unknown as Topology).objects.countries as GeometryCollection) as FeatureCollection<
  Geometry,
  { name: string }
>;

// Enquadra do oeste do Brasil ao leste da Grécia, do sul do RS ao norte da Alemanha.
const extent = { type: "MultiPoint", coordinates: [[-74, -34], [31, 56], [-74, 56], [31, -34]] } as const;
const projection = geoNaturalEarth1().fitExtent([[10, 10], [W - 10, H - 10]], extent as never);
const path = geoPath(projection);

// Recorte do Japão: caixa no canto superior esquerdo, sobre o Atlântico Norte.
const INSET = { x: 18, y: 18, w: 230, h: 200 };
const japan = countries.features.find((f) => f.id === JAPAN) as Feature<Geometry> | undefined;
const insetProjection: GeoProjection = geoMercator().fitExtent(
  [[INSET.x + 14, INSET.y + 34], [INSET.x + INSET.w - 14, INSET.y + INSET.h - 12]],
  { type: "MultiPoint", coordinates: [[129, 31], [146, 45.5]] } as never,
);
const insetPath = geoPath(insetProjection);

// Calculados uma vez por processo: o contorno não muda entre pedidos.
const LAND = countries.features
  .filter((f) => f.id !== BRAZIL)
  .map((f) => path(f))
  .filter(Boolean)
  .join("");
const BRAZIL_PATH = path(countries.features.find((f) => f.id === BRAZIL)!) ?? "";
const JAPAN_PATH = japan ? (insetPath(japan) ?? "") : "";

// Onde fica o rótulo de cada destaque, para não encavalar na Europa.
const LABEL: Record<string, { dx: number; dy: number; anchor: "start" | "middle" | "end" }> = {
  LIS: { dx: -14, dy: 6, anchor: "end" },
  MAD: { dx: 4, dy: 34, anchor: "middle" },
  FCO: { dx: 14, dy: 28, anchor: "start" },
  ATH: { dx: 0, dy: 36, anchor: "middle" },
  VIE: { dx: 0, dy: -20, anchor: "middle" },
  HND: { dx: -14, dy: 6, anchor: "end" },
};

const COLOR: Record<FareStatus, string> = { below: "var(--up)", between: "var(--sand)", above: "var(--down)", none: "var(--ink-3)" };

type Dest = { group: DestinationGroup; code: string; xy: [number, number]; inset: boolean };

export function RouteMap({ groups }: { groups: DestinationGroup[] }) {
  // Um ponto por destino (o aeroporto da rota mais barata do grupo).
  const dests: Dest[] = [];
  for (const g of groups) {
    const code = g.best?.destination ?? g.routes[0]?.destination ?? g.codes[0];
    const c = airportCoords(code);
    if (!c) continue;
    const inset = code === "HND" || code === "NRT";
    const xy = (inset ? insetProjection(c) : projection(c)) as [number, number] | null;
    if (xy) dests.push({ group: g, code, xy, inset });
  }
  const origins = [...new Set(groups.flatMap((g) => g.routes.map((r) => r.origin)))]
    .map((code) => ({ code, c: airportCoords(code) }))
    .filter((o): o is { code: string; c: [number, number] } => Boolean(o.c))
    .map((o) => ({ code: o.code, xy: projection(o.c) as [number, number] }));

  // Arcos: todas as rotas ativas no mapa; a mais barata de cada destino leva a
  // cor do status, as demais ficam em cinza.
  const arcs: { d: string; best: boolean; status: FareStatus; key: string }[] = [];
  for (const { group: g, inset } of dests) {
    for (const r of g.routes) {
      const a = airportCoords(r.origin);
      if (!a) continue;
      const isBest = g.best?.id === r.id;
      if (inset) {
        // Para o recorte, um arco simples até a borda da caixa.
        const [x0, y0] = projection(a) as [number, number];
        const x1 = INSET.x + INSET.w / 2;
        const y1 = INSET.y + INSET.h;
        arcs.push({ d: `M${x0.toFixed(1)} ${y0.toFixed(1)} Q${(x0 - 40).toFixed(1)} ${((y0 + y1) / 2).toFixed(1)} ${x1} ${y1}`, best: isBest, status: g.status, key: r.id });
        continue;
      }
      const b = airportCoords(r.destination);
      if (!b) continue;
      const d = path({ type: "LineString", coordinates: [a, b] });
      if (d) arcs.push({ d, best: isBest, status: g.status, key: r.id });
    }
  }
  arcs.sort((x, y) => Number(x.best) - Number(y.best));

  return (
    <svg className="rmap" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Mapa das rotas monitoradas: origens no Brasil e destinos coloridos pelo melhor preço">
      <path d={LAND} className="rmap-land" />
      <path d={BRAZIL_PATH} className="rmap-brazil" />

      <g className="rmap-arcs" aria-hidden="true">
        {arcs.map((a) => (
          <path key={a.key} d={a.d} className={a.best ? "best" : undefined} style={a.best ? { stroke: COLOR[a.status] } : undefined} />
        ))}
      </g>

      <g className="rmap-inset">
        <rect x={INSET.x} y={INSET.y} width={INSET.w} height={INSET.h} rx={14} />
        <text x={INSET.x + 14} y={INSET.y + 24} className="rmap-inset-t">
          JAPÃO
        </text>
        <path d={JAPAN_PATH} className="rmap-land" />
      </g>

      {origins.map((o) => (
        <g key={o.code} className="rmap-origin" transform={`translate(${o.xy[0].toFixed(1)} ${o.xy[1].toFixed(1)})`}>
          <circle r={7} />
          <text x={o.code === "REC" || o.code === "FOR" ? 13 : -13} y={5} textAnchor={o.code === "REC" || o.code === "FOR" ? "start" : "end"}>
            {o.code}
          </text>
        </g>
      ))}

      {dests.map(({ group: g, xy }) => {
        const p = g.best?.best?.price;
        const label = LABEL[g.key];
        const title = `${g.city}: ${p ? `${brl(p)}, ${distanceText(p, g.targets)}` : STATUS_LABEL.none}`;
        return (
          <a key={g.key} href={`#dest-${g.key}`} aria-label={title} className={`rmap-dest${g.featured ? " featured" : ""}`}>
            <title>{title}</title>
            <circle cx={xy[0]} cy={xy[1]} r={g.featured ? 11 : 8} style={{ fill: COLOR[g.status] }} />
            {g.featured && label && (
              <text x={xy[0] + label.dx} y={xy[1] + label.dy} textAnchor={label.anchor} className="rmap-label">
                {g.city}
              </text>
            )}
          </a>
        );
      })}
    </svg>
  );
}

export function MapLegend() {
  return (
    <div className="legend rmap-legend">
      {(["below", "between", "above", "none"] as FareStatus[]).map((s) => (
        <span key={s}>
          <i className="dot" style={{ background: COLOR[s] }} />
          {STATUS_LABEL[s]}
        </span>
      ))}
      <span>
        <i className="dot ring" />
        origem
      </span>
    </div>
  );
}
