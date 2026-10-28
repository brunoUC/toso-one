import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DateGrid } from "@/components/flights/DateGrid";
import { LegView } from "@/components/flights/LegView";
import { PriceHistory } from "@/components/flights/PriceHistory";
import { Icon } from "@/components/Icon";
import airports from "@/data/airports.json";
import { countryName, type Airport } from "@/lib/airports";
import { getSession } from "@/lib/auth";
import { fetchRoute, fetchRouteGrid, stayDays, type FlightRoute } from "@/lib/flights";
import { brl } from "@/lib/format";

const BY_CODE = new Map((airports as Airport[]).map((a) => [a.i, a]));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: id.replace("-", " → ") };
}

function Ticket({ route }: { route: FlightRoute }) {
  const b = route.best!;
  const o = BY_CODE.get(route.origin);
  const d = BY_CODE.get(route.destination);
  const days = stayDays(b);
  return (
    <section className={`ticket ${route.verdict.key}`}>
      <div className="ticket-main">
        <div className="ticket-top">
          <span className={`fl-tag ${route.verdict.key}`}>{route.verdict.label}</span>
          {b.googleLevel && <span className={`fx-level ${b.googleLevel}`}>Google: preço {b.googleLevel}</span>}
          <span className="fx-muted">visto em {b.asOf.slice(8, 10)}/{b.asOf.slice(5, 7)}</span>
        </div>
        <div className="ticket-price">{brl(b.price)}</div>
        <p className="ticket-why">
          ida e volta, executiva, 1 adulto · {route.verdict.why}
        </p>

        <LegView
          kind="ida"
          date={b.departDate}
          leg={b.out ?? (b.departTime ? { ...b, from: route.origin, to: route.destination, flights: [] } : null)}
          fromLabel={o?.c}
          toLabel={d?.c ?? route.city}
          note={`${route.origin} → ${route.destination} · ${b.airline ?? "companhia não informada"}`}
        />
        {b.returnDate && (
          <LegView
            kind="volta"
            date={b.returnDate}
            leg={b.back}
            fromLabel={d?.c ?? route.city}
            toLabel={o?.c}
            note={`${days} dias depois · ${route.destination} → ${route.origin}. Os voos da volta aparecem na grade abaixo depois da próxima coleta.`}
          />
        )}
      </div>
      <div className="ticket-actions">
        <a className="btn btn-primary" href={b.bookingUrl} target="_blank" rel="noopener noreferrer">
          Conferir este voo no Google Flights <Icon name="external" size={15} />
        </a>
        <p className="fx-muted">
          Abre a mesma busca que achou este preço: mesmas datas, executiva, 1 adulto, em reais. Lá aparecem o preço de agora e onde comprar.
        </p>
      </div>
    </section>
  );
}

export default async function RouteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ data, route, error }, session, grid] = await Promise.all([fetchRoute(id), getSession(), fetchRouteGrid(id)]);
  if (!data) {
    return (
      <main className="page">
        <div className="card empty">{error}</div>
      </main>
    );
  }
  if (!route) notFound();

  const o = BY_CODE.get(route.origin);
  const d = BY_CODE.get(route.destination);
  const fares = grid?.fares ?? route.fares;
  // Outras origens para a mesma cidade: a página troca de origem sem voltar.
  const siblings = data.routes.filter((r) => r.id !== route.id && (r.destination === route.destination || (route.city && r.city === route.city)));

  return (
    <main className="page">
      <nav className="crumbs" aria-label="Caminho">
        <Link href="/voos">Voos</Link>
        <span>/</span>
        <span>
          {route.origin} → {route.destination}
        </span>
      </nav>
      <div className="fl-head">
        <div>
          <p className="eyebrow">
            {o ? `${o.c} · ${countryName(o.k)}` : route.origin} → {d ? `${d.c} · ${countryName(d.k)}` : route.city}
          </p>
          <h1>
            {o?.c ?? route.origin} <em>→</em> {route.city || d?.c}
          </h1>
        </div>
        <span className="grow" />
        <div className="actions">
          <Link className="btn btn-ghost btn-sm" href={session ? "/voos/rotas" : "/entrar?de=%2Fvoos%2Frotas"}>
            <Icon name={session ? "edit" : "lock"} size={15} />
            Editar rota
          </Link>
        </div>
      </div>

      {siblings.length > 0 && (
        <nav className="origin-tabs" aria-label={`Origens para ${route.city || d?.c}`}>
          <span className="fx-muted">saindo de</span>
          <span className="origin-tab on" aria-current="page">
            <b>{route.origin}</b> {route.best ? brl(route.best.price) : "—"}
          </span>
          {siblings.map((r) => (
            <Link key={r.id} className="origin-tab" href={`/voos/${r.id}`}>
              <b>{r.origin}</b>
              {r.destination !== route.destination ? <span className="mono">→{r.destination}</span> : null} {r.best ? brl(r.best.price) : "—"}
            </Link>
          ))}
        </nav>
      )}

      {route.best ? (
        <Ticket route={route} />
      ) : (
        <section className="ticket none">
          <div className="ticket-main">
            <span className="fl-tag none">{route.verdict.label}</span>
            <p className="ticket-why" style={{ marginTop: 12 }}>
              Ainda não há tarifa coletada com ida entre {route.window[0].split("-").reverse().join("/")} e{" "}
              {route.window[1].split("-").reverse().join("/")}. A próxima coleta preenche esta página.
            </p>
          </div>
          <div className="ticket-actions">
            <a className="btn btn-primary" href={route.searchUrl} target="_blank" rel="noopener noreferrer">
              Pesquisar esta rota no Google Flights <Icon name="external" size={15} />
            </a>
          </div>
        </section>
      )}

      <div className="detail-facts">
        <div>
          <span>Monitorando ida entre</span>
          <b>
            {route.window[0].split("-").reverse().slice(0, 2).join("/")} e {route.window[1].split("-").reverse().slice(0, 2).join("/")}
          </b>
        </div>
        <div>
          <span>Ficando</span>
          <b>
            {route.stay[0]} a {route.stay[1]} dias
          </b>
        </div>
        <div>
          <span>Alvo · teto</span>
          <b>
            {brl(route.targets.buy)} · {brl(route.targets.max)}
          </b>
        </div>
        {route.stats && (
          <div>
            <span>Faixa já vista</span>
            <b>
              {brl(route.stats.min)} a {brl(route.stats.max)}
            </b>
          </div>
        )}
        <div>
          <span>Histórico</span>
          <b>
            {route.nDays} {route.nDays === 1 ? "dia" : "dias"}
            {route.nDays < data.minDays ? ` de ${data.minDays} para os percentis` : ""}
          </b>
        </div>
      </div>

      {fares.length > 0 && (
        <section className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">
            <h3>Todas as datas de ida e volta</h3>
          </div>
          <p className="card-sub">
            Preço total de ida e volta em executiva para cada dia de ida (linhas) e cada duração de viagem (colunas), como a grade de
            datas do Google Flights. Escolha um preço para ver os voos da ida e da volta.
          </p>
          <DateGrid
            fares={fares}
            window={route.window}
            stay={route.stay}
            origin={route.origin}
            destination={route.destination}
            originCity={o?.c ?? route.origin}
            destinationCity={d?.c ?? route.city}
            targets={route.targets}
            initial={route.best?.returnDate ? { depart: route.best.departDate, ret: route.best.returnDate } : null}
            signedIn={Boolean(session)}
          />
        </section>
      )}

      {route.series.length >= 2 && (
        <section className="card">
          <div className="card-title">
            <h3>Histórico do menor preço</h3>
          </div>
          <p className="card-sub">Menor tarifa de cada dia de coleta, com ida dentro da janela atual.</p>
          <PriceHistory series={route.series} target={route.targets.buy} ceiling={route.targets.max} />
        </section>
      )}
    </main>
  );
}
