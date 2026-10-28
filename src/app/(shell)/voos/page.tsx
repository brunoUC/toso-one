import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { InlineDates } from "@/components/flights/InlineDates";
import { MapLegend, RouteMap } from "@/components/flights/RouteMap";
import { SearchBox } from "@/components/flights/SearchBox";
import { Icon } from "@/components/Icon";
import { getSession } from "@/lib/auth";
import { STATUS_LABEL, distanceShort, distanceText, fareStatus, type FareStatus, type Targets } from "@/lib/fare-status";
import { airportByCode, airportCity, groupByDestination, type DestinationGroup } from "@/lib/flight-groups";
import { fetchFlights, flightsUrl, fmtDay, stayDays, type FlightRoute } from "@/lib/flights";
import { brl } from "@/lib/format";
import { THEME_COOKIE } from "@/lib/theme";

export const metadata: Metadata = { title: "Voos" };

const COLOR: Record<FareStatus, string> = { below: "var(--up)", between: "var(--sand)", above: "var(--down)", none: "var(--ink-3)" };
const thousand = (v: number) => (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";

// Régua do melhor preço contra alvo e teto: faixa verde até o alvo, âmbar até
// o teto, vermelha acima. As faixas são escritas embaixo, a cor não fala sozinha.
function TargetMeter({ price, targets }: { price: number; targets: Targets }) {
  const lo = Math.min(price, targets.buy) * 0.85;
  const hi = Math.max(price * 1.04, targets.max * 1.15);
  const at = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const status = fareStatus(price, targets);
  return (
    <div className="tmeter" role="img" aria-label={`${brl(price)}: ${distanceText(price, targets)}. Alvo ${brl(targets.buy)}, teto ${brl(targets.max)}.`}>
      <div className="tmeter-track">
        <span className="z below" style={{ width: `${at(targets.buy)}%` }} />
        <span className="z between" style={{ left: `${at(targets.buy)}%`, width: `${at(targets.max) - at(targets.buy)}%` }} />
        <span className="z above" style={{ left: `${at(targets.max)}%`, right: 0 }} />
        <span className="tmeter-dot" style={{ left: `${at(price)}%`, background: COLOR[status] }} />
      </div>
      <div className="tmeter-labels" aria-hidden="true">
        <span style={{ left: `${at(targets.buy)}%` }}>alvo {thousand(targets.buy)}</span>
        <span style={{ left: `${at(targets.max)}%` }}>teto {thousand(targets.max)}</span>
      </div>
    </div>
  );
}

function OriginRow({ route, showDest }: { route: FlightRoute; showDest: boolean }) {
  const b = route.best;
  const status = fareStatus(b?.price, route.targets);
  return (
    <li>
      <Link href={`/voos/${route.id}`} className="orow">
        <span className="dot" style={{ background: COLOR[status] }} aria-hidden="true" />
        <span className="orow-who">
          <b>{route.origin}</b> {airportCity(route.origin)}
          {showDest && <span className="mono"> → {route.destination}</span>}
        </span>
        <span className="orow-trip">
          {b ? `${fmtDay(b.departDate)}${b.returnDate ? ` · ${stayDays(b)} dias` : ""}` : "sem preço ainda"}
        </span>
        <span className="orow-price">
          {b ? <b>{brl(b.price)}</b> : <span className="sr-only">{STATUS_LABEL.none}</span>}
          {b && <span className="sr-only">, {STATUS_LABEL[status]}</span>}
        </span>
        <Icon name="arrow" size={13} />
      </Link>
    </li>
  );
}

function DestinationCard({ g, canEdit }: { g: DestinationGroup; canEdit: boolean }) {
  const b = g.best?.best ?? null;
  const multiAirport = new Set(g.routes.map((r) => r.destination)).size > 1;
  return (
    <article id={`dest-${g.key}`} className={`dest ${g.status}`}>
      <header className="dest-head">
        <div>
          <p className="eyebrow">{g.country || " "}</p>
          <h3>{g.city}</h3>
        </div>
        <span className={`dest-tag ${g.status}`}>
          <i style={{ background: COLOR[g.status] }} aria-hidden="true" />
          {STATUS_LABEL[g.status]}
        </span>
      </header>

      {b && g.best ? (
        <>
          <div className="dest-price">
            <b>{brl(b.price)}</b>
            <span>
              de <b className="mono">{g.best.origin}</b>
              {multiAirport ? <> para <b className="mono">{g.best.destination}</b></> : null} · ida {fmtDay(b.departDate)}
              {b.returnDate ? `, ${stayDays(b)} dias` : ""}
            </span>
          </div>
          <p className="dest-dist" style={{ color: COLOR[g.status] }}>
            {distanceText(b.price, g.targets)}
          </p>
          <TargetMeter price={b.price} targets={g.targets} />
        </>
      ) : (
        <p className="dest-empty">
          {g.routes.length
            ? "Ainda sem preço: a primeira coleta destas rotas preenche aqui."
            : `Nenhuma rota para ${g.city}. Busque as datas acima e use “Monitorar estas datas”.`}
        </p>
      )}

      {g.routes.length > 0 && (
        <ul className="dest-origins" aria-label={`Origens para ${g.city}`}>
          {g.routes.map((r) => (
            <OriginRow key={r.id} route={r} showDest={multiAirport} />
          ))}
        </ul>
      )}

      {g.window && g.stay && (
        <InlineDates codes={g.codes} city={g.city} window={g.window} stay={g.stay} varies={g.datesVary} canEdit={canEdit} />
      )}
      {g.coverage && g.coverage.total > 0 && (
        <p className="dest-cov">
          {g.coverage.seen} de {g.coverage.total} combinações de ida e volta já consultadas
        </p>
      )}
    </article>
  );
}

function MapSide({ groups, all, stale }: { groups: DestinationGroup[]; all: DestinationGroup[]; stale: boolean }) {
  // A melhor oportunidade é a mais abaixo do próprio alvo (ou a menos acima).
  const top = all
    .filter((g) => g.best?.best)
    .sort((a, b) => a.best!.best!.price / a.targets.buy - b.best!.best!.price / b.targets.buy)[0];
  const p = top?.best?.best?.price;
  return (
    <aside className="vmap-side">
      {top && p ? (
        <div className={`vmap-deal ${top.status}`}>
          <p className="eyebrow">melhor oportunidade agora</p>
          <p className="vmap-deal-city">
            {top.city} <span className="mono">{top.best!.origin}→{top.best!.destination}</span>
          </p>
          <p className="vmap-deal-price">{brl(p)}</p>
          <p className="vmap-deal-dist" style={{ color: COLOR[top.status] }}>
            {distanceText(p, top.targets)}
          </p>
          <Link className="fl-buy" href={`/voos/${top.best!.id}`}>
            Ver datas e detalhes <Icon name="arrow" size={13} />
          </Link>
        </div>
      ) : (
        <div className="vmap-deal none">
          <p className="eyebrow">monitor de tarifas</p>
          <p className="vmap-deal-city">Aguardando a primeira coleta</p>
        </div>
      )}
      {stale && <p className="vmap-stale">Nenhuma rota tem preço recente: veja a aba Actions do Flight Tracker.</p>}
      <ol className="vmap-rank">
        {groups.map((g) => {
          const price = g.best?.best?.price;
          return (
            <li key={g.key}>
              <a href={`#dest-${g.key}`}>
                <span className="dot" style={{ background: COLOR[g.status] }} aria-hidden="true" />
                <span className="vmap-rank-city">{g.city}</span>
                <span className="vmap-rank-price">{price ? brl(price) : "—"}</span>
                <span className="vmap-rank-dist" style={{ color: price ? COLOR[g.status] : undefined }}>
                  {distanceShort(price, g.targets)}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

export default async function VoosPage() {
  const [session, { data, error }] = await Promise.all([getSession(), fetchFlights()]);
  const source = flightsUrl();
  const grafite = (await cookies()).get(THEME_COOKIE)?.value === "grafite";
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(iso));
  const groups = data ? groupByDestination(data.routes, data.targets) : null;

  return (
    <main className="page">
      <div className="fl-head">
        <div>
          <p className="eyebrow">executiva · brasil → europa e japão{data ? ` · atualizado ${fmt(data.generatedAt)}` : ""}</p>
          <h1>Voos</h1>
        </div>
        <span className="grow" />
        <div className="actions">
          <Link className="btn btn-primary btn-sm" href={session ? "/voos/rotas" : "/entrar?de=%2Fvoos%2Frotas"}>
            <Icon name={session ? "edit" : "lock"} size={15} />
            Editar rotas
          </Link>
          {source && (
            <a className="btn btn-ghost btn-sm" href={`${source}/${grafite ? "?tema=grafite" : ""}`} target="_blank" rel="noreferrer">
              <Icon name="external" size={15} />
              Página própria
            </a>
          )}
        </div>
      </div>

      <SearchBox
        signedIn={Boolean(session)}
        defaultOrigin={airportByCode("GRU")}
        routes={data?.routes.map((r) => ({ id: r.id, targets: r.targets })) ?? []}
        defaults={data?.targets ?? { buy: 11000, max: 13000 }}
      />

      {!data || !groups ? (
        <div className="card empty">{error}</div>
      ) : (
        <>
          <section className="vmap card rise" aria-label="Mapa das rotas">
            <div className="vmap-map">
              <RouteMap groups={[...groups.featured, ...groups.others]} />
              <MapLegend />
            </div>
            <MapSide groups={groups.featured} all={[...groups.featured, ...groups.others]} stale={data.hero.state === "stale"} />
          </section>

          <div className="section-title">
            <span className="ti">
              <Icon name="plane" size={16} />
            </span>
            <h2>Destinos</h2>
            <span className="count">{String(groups.featured.length).padStart(2, "0")}</span>
          </div>
          <div className="dest-grid">
            {groups.featured.map((g) => (
              <DestinationCard key={g.key} g={g} canEdit={Boolean(session)} />
            ))}
          </div>

          {groups.others.length > 0 && (
            <>
              <div className="section-title" id="outros">
                <span className="ti">
                  <Icon name="list" size={16} />
                </span>
                <h2>Outros destinos</h2>
                <span className="count">{String(groups.others.length).padStart(2, "0")}</span>
              </div>
              <div className="dest-grid">
                {groups.others.map((g) => (
                  <DestinationCard key={g.key} g={g} canEdit={Boolean(session)} />
                ))}
              </div>
            </>
          )}

          <footer className="fl-note">
            <p>
              Cada destino junta todas as origens monitoradas; o preço do destino é o menor entre elas, na última coleta. Verde: até o
              alvo. Âmbar: entre o alvo e o teto. Vermelho: acima do teto. Cinza: ainda sem preço. A distância é contra o alvo e o teto
              da rota mais barata (padrão {brl(data.targets.buy)} e {brl(data.targets.max)}).
            </p>
            <p>
              Ajustar as datas de um destino vale para todas as origens dele e já dispara uma coleta só dessas rotas, priorizando as
              combinações de ida e volta que ainda não foram consultadas.
            </p>
            {data.lastRun && (
              <p>
                Última coleta {fmt(data.lastRun.started_at)}: {data.lastRun.ok} consultas com resultado · {data.lastRun.failed} sem.
                {data.lastRun.expired.length > 0 && (
                  <>
                    {" "}
                    <strong>Janela vencida em {data.lastRun.expired.join(", ")}.</strong> Ajuste as datas do destino.
                  </>
                )}
              </p>
            )}
          </footer>
        </>
      )}
    </main>
  );
}
