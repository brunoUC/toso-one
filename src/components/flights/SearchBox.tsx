"use client";

import Link from "next/link";
import { useState } from "react";
import { AirportPicker } from "@/components/AirportPicker";
import { Icon } from "@/components/Icon";
import type { Airport } from "@/lib/airports";
import { STATUS_LABEL, fareStatus, type Targets } from "@/lib/fare-status";
import { googleFlightsUrl } from "@/lib/gflights";

type LiveFlight = {
  price: number;
  airline: string | null;
  stops: number | null;
  duration: string | null;
  departTime: string | null;
  arriveTime: string | null;
  arriveAhead: number;
  best: boolean;
};

type Result =
  | { kind: "link"; url: string }
  | { kind: "live"; flights: LiveFlight[]; level: string | null; url: string }
  | { kind: "failed"; error: string; url: string };

const brl = (v: number) => "R$ " + Math.round(v).toLocaleString("pt-BR");
const stopsTxt = (n: number | null) => (n === null ? null : n === 0 ? "direto" : n === 1 ? "1 conexão" : `${n} conexões`);
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
  const [ret, setRet] = useState("");
  const [busy, setBusy] = useState<"search" | "monitor" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [monitor, setMonitor] = useState<{ ok: boolean; text: string } | null>(null);
  const [all, setAll] = useState(false);

  const id = origin && dest ? `${origin.i}-${dest.i}` : null;
  const known = routes.find((r) => r.id === id);
  const targets = known?.targets ?? defaults;

  async function search(e: React.FormEvent) {
    e.preventDefault();
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
      else if (data.ok && data.flights?.length) setResult({ kind: "live", flights: data.flights, level: data.googleLevel, url: data.bookingUrl ?? url });
      else setResult({ kind: "failed", error: data.error ?? "O Google não trouxe voos para essas datas.", url: data.bookingUrl ?? url });
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
        body: JSON.stringify({ origin: origin.i, destination: dest.i, depart, return: ret }),
      });
      const data = await res.json().catch(() => ({}));
      setMonitor(res.ok ? { ok: data.collect?.ok !== false, text: `${data.summary} ${data.collectText ?? ""}`.trim() } : { ok: false, text: data.error ?? "Não foi possível monitorar." });
    } catch {
      setMonitor({ ok: false, text: "Sem conexão com o servidor." });
    } finally {
      setBusy(null);
    }
  }

  const flights = result?.kind === "live" ? (all ? result.flights : result.flights.slice(0, 6)) : [];

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
          <input className="ed-input" type="date" min={depart || tomorrow} value={ret} onChange={(e) => setRet(e.target.value)} />
        </label>
        <AirportPicker label="Origem" value={origin} onChange={setOrigin} placeholder="GRU" compact />
        <button className="btn btn-primary btn-sm srch-go" type="submit" disabled={busy !== null}>
          <Icon name="search" size={15} />
          {busy === "search" ? "Buscando…" : "Buscar"}
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}

      {busy === "search" && <p className="srch-wait">Consultando o Google Flights em executiva… pode levar até 30 segundos.</p>}

      {result && (
        <div className="srch-out" aria-live="polite">
          {result.kind === "live" && (
            <>
              <p className="srch-head">
                <b>{result.flights.length} voos</b> em executiva, 1 adulto, {ret ? "ida e volta" : "só ida"}
                {result.level && <span className={`fx-level ${result.level}`}>Google: preço {result.level}</span>}
                <span className="srch-targets">
                  alvo {brl(targets.buy)} · teto {brl(targets.max)}
                </span>
              </p>
              <ul className="srch-list">
                {flights.map((f, i) => {
                  const s = fareStatus(f.price, targets);
                  return (
                    <li key={i}>
                      <b style={{ color: COLOR[s] }}>{brl(f.price)}</b>
                      <span className="srch-status" style={{ color: COLOR[s] }}>
                        {STATUS_LABEL[s]}
                      </span>
                      <span className="srch-times">
                        {f.departTime && f.arriveTime ? (
                          <>
                            {f.departTime} → {f.arriveTime}
                            {f.arriveAhead ? <sup>+{f.arriveAhead}</sup> : null}
                          </>
                        ) : (
                          "horário no Google"
                        )}
                      </span>
                      <span className="srch-meta">{[f.airline, stopsTxt(f.stops), f.duration].filter(Boolean).join(" · ")}</span>
                    </li>
                  );
                })}
              </ul>
              {result.flights.length > 6 && (
                <button type="button" className="link-btn" onClick={() => setAll((v) => !v)}>
                  {all ? "mostrar menos" : `mostrar todos os ${result.flights.length}`}
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
