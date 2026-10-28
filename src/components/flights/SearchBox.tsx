"use client";

import Link from "next/link";
import { useState } from "react";
import { AirportPicker } from "@/components/AirportPicker";
import { Icon } from "@/components/Icon";
import { TripList } from "@/components/flights/TripList";
import type { Airport } from "@/lib/airports";
import { fareStatus, type Targets } from "@/lib/fare-status";
import { brl, dayShort, daysBetween } from "@/lib/flight-format";
import type { Trip } from "@/lib/flights";
import { googleFlightsUrl } from "@/lib/gflights";

type Result =
  | { kind: "link"; url: string }
  | { kind: "live"; trips: Trip[]; returns: { ret: string; price: number }[]; ret: string; url: string }
  | { kind: "failed"; error: string; url: string };

const COLOR = { below: "var(--up)", between: "var(--sand)", above: "var(--down)", none: "var(--ink-3)" } as const;
const plusDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

// Barra de busca: destino, ida, volta e origem (GRU por padrão). Com sessão,
// pergunta ao Google Flights na hora (pelo servidor) e oferece monitorar as
// datas; sem sessão, só monta o link da mesma busca no Google Flights.
export function SearchBox({
  signedIn,
  defaultOrigin,
  routes,
  defaults,
}: {
  signedIn: boolean;
  defaultOrigin: Airport | null;
  routes: { id: string; targets: Targets }[];
  defaults: Targets;
}) {
  const tomorrow = plusDays(new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }), 1);
  const [origin, setOrigin] = useState<Airport | null>(defaultOrigin);
  const [dest, setDest] = useState<Airport | null>(null);
  const [depart, setDepart] = useState("");
  const [retInput, setRet] = useState("");
  const [busy, setBusy] = useState<"search" | "monitor" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [monitor, setMonitor] = useState<{ ok: boolean; text: string } | null>(null);
  const [all, setAll] = useState(false);

  const id = origin && dest ? `${origin.i}-${dest.i}` : null;
  const known = routes.find((r) => r.id === id);
  const targets = known?.targets ?? defaults;

  async function search(e: React.FormEvent | null, retOverride?: string) {
    e?.preventDefault();
    const ret = retOverride ?? retInput;
    if (retOverride) setRet(retOverride);
    setError(null);
    setMonitor(null);
    setAll(false);
    if (!origin || !dest) return setError("Escolha a origem e o destino.");
    if (origin.i === dest.i) return setError("Origem e destino iguais.");
    if (!depart || depart < tomorrow) return setError("A ida precisa ser a partir de amanhã.");
    if (ret && ret <= depart) return setError("A volta precisa ser depois da ida.");
    const url = googleFlightsUrl(origin.i, dest.i, depart, ret || null);
    if (!signedIn) return setResult({ kind: "link", url });
    setBusy("search");
    setResult(null);
    try {
      const res = await fetch("/api/voos/buscar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: origin.i, destination: dest.i, depart, return: ret || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? "Não foi possível buscar.");
      else if (data.ok && data.trips?.length) {
        setResult({ kind: "live", trips: data.trips, returns: data.returns ?? [], ret: data.return ?? ret, url: data.bookingUrl ?? url });
        // Sem volta informada, a busca escolheu a mais barata de 8 a 12 dias:
        // é ela que "Monitorar estas datas" vai usar.
        if (!ret && data.return) setRet(data.return);
      } else setResult({ kind: "failed", error: data.error ?? "O Google não trouxe voos para essas datas.", url: data.bookingUrl ?? url });
    } catch {
      setResult({ kind: "failed", error: "Sem conexão com o servidor.", url });
    } finally {
      setBusy(null);
    }
  }

  async function startMonitor() {
    if (!origin || !dest) return;
    setBusy("monitor");
    setMonitor(null);
    try {
      const res = await fetch("/api/voos/monitorar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: origin.i, destination: dest.i, depart, return: retInput }),
      });
      const data = await res.json().catch(() => ({}));
      setMonitor(res.ok ? { ok: data.collect?.ok !== false, text: `${data.summary} ${data.collectText ?? ""}`.trim() } : { ok: false, text: data.error ?? "Não foi possível monitorar." });
    } catch {
      setMonitor({ ok: false, text: "Sem conexão com o servidor." });
    } finally {
      setBusy(null);
    }
  }

  const ret = retInput;

  return (
    <section className="srch card" aria-label="Buscar voos em executiva">
      <form className="srch-form" onSubmit={search}>
        <AirportPicker label="Destino" value={dest} onChange={setDest} placeholder="Para onde? cidade ou código" compact />
        <label className="ed-field">
          Ida
          <input className="ed-input" type="date" min={tomorrow} value={depart} onChange={(e) => setDepart(e.target.value)} />
        </label>
        <label className="ed-field">
          Volta
          <input className="ed-input" type="date" min={depart || tomorrow} value={retInput} onChange={(e) => setRet(e.target.value)} />
        </label>
        <AirportPicker label="Origem" value={origin} onChange={setOrigin} placeholder="GRU" compact />
        <button className="btn btn-primary btn-sm srch-go" type="submit" disabled={busy !== null}>
          <Icon name="search" size={15} />
          {busy === "search" ? "Buscando…" : "Buscar"}
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}

      {busy === "search" && (
        <p className="srch-wait">Buscando idas e voltas em executiva… pode levar até 40 segundos.{!ret && " Sem volta, a busca compara as voltas de 8 a 12 dias."}</p>
      )}

      {result && (
        <div className="srch-out" aria-live="polite">
          {result.kind === "live" && (
            <>
              <p className="srch-head">
                <b>
                  ida {dayShort(depart)} → volta {dayShort(result.ret)} · {daysBetween(depart, result.ret)} dias
                </b>
                <span>executiva, 1 adulto, preço total de ida e volta</span>
                <span className="srch-targets">
                  alvo {brl(targets.buy)} · teto {brl(targets.max)}
                </span>
              </p>
              {result.returns.length > 1 && (
                <div className="srch-returns" role="group" aria-label="Outras voltas">
                  <span className="fx-muted">outras voltas:</span>
                  {result.returns.map((r) => (
                    <button
                      key={r.ret}
                      type="button"
                      className={`chip${r.ret === result.ret ? " on" : ""}`}
                      onClick={() => search(null, r.ret)}
                      disabled={busy !== null}
                      style={{ color: COLOR[fareStatus(r.price, targets)] }}
                    >
                      {dayShort(r.ret)} · {daysBetween(depart, r.ret)}d · {brl(r.price)}
                    </button>
                  ))}
                </div>
              )}
              <TripList trips={result.trips} targets={targets} limit={all ? undefined : 5} />
              {result.trips.length > 5 && (
                <button type="button" className="link-btn" onClick={() => setAll((v) => !v)}>
                  {all ? "mostrar menos" : `mostrar todas as ${result.trips.length} combinações`}
                </button>
              )}
            </>
          )}
          {result.kind === "failed" && <p className="srch-fail">{result.error} O link abaixo abre a mesma busca no Google Flights.</p>}
          {result.kind === "link" && (
            <p className="srch-fail">
              <Link href="/entrar?de=%2Fvoos">Entre</Link> para ver os voos aqui e monitorar as datas. Sem entrar, a busca abre no Google Flights.
            </p>
          )}

          <div className="srch-actions">
            <a className="btn btn-ghost btn-sm" href={result.url} target="_blank" rel="noopener noreferrer">
              Abrir no Google Flights <Icon name="external" size={14} />
            </a>
            {signedIn && (
              <button className="btn btn-primary btn-sm" type="button" onClick={startMonitor} disabled={busy !== null || !ret} title={ret ? undefined : "Informe a volta para monitorar"}>
                <Icon name="plus" size={14} />
                {busy === "monitor" ? "Criando monitor…" : "Monitorar estas datas"}
              </button>
            )}
            {signedIn && !ret && <span className="fx-muted">para monitorar, informe a volta</span>}
            {signedIn && ret && (
              <span className="fx-muted">{known ? `${id} já é monitorada: a janela cresce para incluir estas datas` : `cria a rota ${id} em volta destas datas`}</span>
            )}
          </div>
          {monitor && <p className={`dates-msg ${monitor.ok ? "ok" : "bad"}`}>{monitor.text}</p>}
        </div>
      )}
    </section>
  );
}
