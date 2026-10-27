import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Sparkline } from "@/components/charts/Sparkline";
import { FlightArt } from "@/components/FlightArt";
import { Icon } from "@/components/Icon";
import { getSession } from "@/lib/auth";
import { detailsText, fetchFlights, flightsUrl, fmtDay, stayDays, type FlightData, type FlightRoute } from "@/lib/flights";
import { brl } from "@/lib/format";
import { THEME_COOKIE } from "@/lib/theme";

export const metadata: Metadata = { title: "Voos" };

function Ladder({ route }: { route: FlightRoute }) {
  const s = route.stats!;
  const price = route.best!.price;
  const span = Math.max(s.max - s.min, 1);
  const at = (v: number) => `${(((v - s.min) / span) * 100).toFixed(1)}%`;
  return (
    <div className="fl-ladder" role="img" aria-label={`preço de hoje ${brl(price)}, mínimo histórico ${brl(s.min)}, máximo ${brl(s.max)}`}>
      <span className="fl-tick" style={{ left: at(s.p25) }} />
      <span className="fl-tick med" style={{ left: at(s.median) }} />
      <span className="fl-dot" style={{ left: at(price) }} />
    </div>
  );
}

function Legs({ route }: { route: FlightRoute }) {
  const b = route.best!;
  return (
    <div className="fl-legs">
      <div className="fl-leg">
        <span className="fl-leg-k">ida</span>
        <b>{fmtDay(b.departDate)}</b>
        {b.departTime && b.arriveTime && (
          <span className="fl-time">
            {b.departTime} {route.origin} → {b.arriveTime}
            {b.arriveAhead ? <sup>+{b.arriveAhead}</sup> : null} {route.destination}
          </span>
        )}
      </div>
      {b.returnDate && (
        <div className="fl-leg">
          <span className="fl-leg-k">volta</span>
          <b>{fmtDay(b.returnDate)}</b>
          <span className="fl-time">{stayDays(b)} dias depois</span>
        </div>
      )}
    </div>
  );
}

function RouteCard({ route, minDays }: { route: FlightRoute; minDays: number }) {
  const b = route.best!;
  const v = route.verdict;
  return (
    <li className={`fl-card ${v.key}`}>
      <Link className="fl-card-link" href={`/voos/${route.id}`} aria-label={`${route.origin} para ${route.destination}: datas e detalhes`} />
      <div className="fl-card-head">
        <span className="fl-pair">
          <b>{route.origin}</b>
          <i>→</i>
          <b>{route.destination}</b>
        </span>
        <span className="fl-city">{route.city}</span>
        <span className={`fl-tag ${v.key}`}>{v.label}</span>
      </div>
      <div className="fl-price">{brl(b.price)}</div>
      <Legs route={route} />
      <div className="fl-meta">
        {detailsText(b)}
        {route.fares.length > 1 ? ` · ${route.fares.length} combinações de datas vistas` : ""}
      </div>
      {route.stats && <Ladder route={route} />}
      <div className="fl-foot">
        <span className="fl-why">
          {v.why}
          {route.nDays < minDays ? ` · ${route.nDays}/${minDays} dias` : ""}
        </span>
        {route.series.length >= 2 ? (
          <Sparkline values={route.series.map((p) => p.price)} />
        ) : (
          <span className="eyebrow" style={{ margin: 0 }}>histórico curto</span>
        )}
      </div>
      <div className="fl-links">
        <span className="fl-buy">
          Datas e detalhes <Icon name="arrow" size={13} />
        </span>
        <a className="fl-buy" href={b.bookingUrl} target="_blank" rel="noopener noreferrer">
          Conferir no Google <Icon name="external" size={13} />
        </a>
      </div>
    </li>
  );
}

function Hero({ data }: { data: FlightData }) {
  const { hero } = data;
  const deal = hero.state === "deal" ? data.routes.find((r) => r.id === hero.routeId) : undefined;
  if (deal?.best) {
    const b = deal.best;
    return (
      <section className="fl-hero rise">
        <FlightArt />
        <p className="eyebrow">melhor oportunidade agora</p>
        <h2 className={`fl-verdict ${deal.verdict.key}`}>{deal.verdict.label}</h2>
        <p className="fl-hero-route">
          <b>{deal.origin}</b> → <b>{deal.destination}</b> · {deal.city}
        </p>
        <p className="fl-hero-price">{brl(b.price)}</p>
        <Legs route={deal} />
        <p className="fl-hero-meta">
          {detailsText(b)} · {deal.verdict.why}
        </p>
        <div className="fl-hero-actions">
          <Link className="fl-hero-buy" href={`/voos/${deal.id}`}>
            Ver datas e detalhes <Icon name="arrow" size={14} />
          </Link>
          <a className="fl-hero-ghost" href={b.bookingUrl} target="_blank" rel="noopener noreferrer">
            Conferir no Google Flights <Icon name="external" size={14} />
          </a>
        </div>
      </section>
    );
  }
  const texts = {
    stale: ["sem coleta", "Nenhuma rota tem preço recente. Veja a aba Actions do repositório do Flight Tracker."],
    nothing: ["nada hoje", "Nenhuma tarifa entrou na faixa. O monitor segue rodando e atualiza amanhã de manhã."],
    waiting: ["aguardando", `Nenhuma coleta ainda com ida ${data.windowText}. A coleta automática roda toda manhã e preenche as rotas.`],
    deal: ["", ""],
  } as const;
  const [title, body] = texts[hero.state];
  return (
    <section className="fl-hero rise">
      <FlightArt />
      <p className="eyebrow">monitor de tarifas</p>
      <h2 className="fl-verdict none">{title}</h2>
      <p className="fl-hero-none">{body}</p>
    </section>
  );
}

export default async function VoosPage() {
  const [session, { data, error }] = await Promise.all([getSession(), fetchFlights()]);
  const source = flightsUrl();
  const grafite = (await cookies()).get(THEME_COOKIE)?.value === "grafite";
  const updated = data
    ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(data.generatedAt))
    : null;
  const withData = data?.routes.filter((r) => r.best) ?? [];
  const missing = data?.routes.filter((r) => !r.best) ?? [];

  return (
    <main className="page">
      <div className="fl-head">
        <div>
          <p className="eyebrow">executiva · brasil → europa{updated ? ` · atualizado ${updated}` : ""}</p>
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

      {!data ? (
        <div className="card empty">{error}</div>
      ) : (
        <>
          <Hero data={data} />

          {withData.length > 0 && (
            <>
              <div className="section-title">
                <span className="ti">
                  <Icon name="list" size={16} />
                </span>
                <h2>Todas as rotas</h2>
                <span className="count">{String(withData.length).padStart(2, "0")}</span>
              </div>
              <ul className="fl-grid">
                {withData.map((r) => (
                  <RouteCard key={r.id} route={r} minDays={data.minDays} />
                ))}
              </ul>
            </>
          )}

          {missing.length > 0 && (
            <div className="fl-missing">
              <p>Sem dados com ida {data.windowText}:</p>
              <div className="chips">
                {missing.map((r) => (
                  <Link key={r.id} className="chip" href={`/voos/${r.id}`}>
                    {r.origin}→{r.destination}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <footer className="fl-note">
            <p>
              A barra mostra onde o melhor preço de hoje cai entre o menor e o maior dos mínimos diários já registrados na rota;
              os traços marcam o percentil 25 e a mediana. Percentis só valem como critério a partir de {data.minDays} dias de
              histórico. Alvo padrão {brl(data.targets.buy)}, teto padrão {brl(data.targets.max)}.
            </p>
            <p>
              As datas de cada rota são as da tarifa mais barata da última coleta. O link abre essa mesma busca no Google Flights,
              onde aparecem as opções de compra.
            </p>
            {data.lastRun && (
              <p>
                Última coleta{" "}
                {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(data.lastRun.started_at))}
                : {data.lastRun.ok} consultas com resultado · {data.lastRun.failed} sem.
                {data.lastRun.expired.length > 0 && (
                  <>
                    {" "}
                    <strong>Janela vencida em {data.lastRun.expired.join(", ")}.</strong> Atualize as datas no editor.
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
