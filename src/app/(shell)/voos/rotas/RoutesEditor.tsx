"use client";

import { useMemo, useState } from "react";
import { AirportPicker } from "@/components/AirportPicker";
import { Icon } from "@/components/Icon";
import type { Airport } from "@/lib/airports";

type Targets = { buy: number; max: number };
type Route = {
  id: string;
  origin: string;
  destination: string;
  city: string;
  window: [string, string];
  stay: [number, number];
  active: boolean;
  targets?: Targets;
};
type Editable = { targets: Targets; samples_per_run: number; routes: Route[] };

function pickEditable(config: Record<string, unknown>): Editable {
  const c = config as Partial<Editable>;
  return {
    targets: c.targets ?? { buy: 11000, max: 13000 },
    samples_per_run: c.samples_per_run ?? 2,
    routes: (c.routes ?? []).map((r) => ({ ...r, active: r.active !== false })),
  };
}

const num = (v: string) => (v.trim() === "" ? Number.NaN : Number(v));

export function RoutesEditor({ initialConfig, initialSha }: { initialConfig: Record<string, unknown>; initialSha: string }) {
  const [saved, setSaved] = useState(() => pickEditable(initialConfig));
  const [state, setState] = useState(saved);
  const [sha, setSha] = useState(initialSha);
  const [busy, setBusy] = useState<"save" | "collect" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string; link?: string; details?: string[] } | null>(null);
  const [origin, setOrigin] = useState<Airport | null>(null);
  const [destination, setDestination] = useState<Airport | null>(null);

  const dirty = useMemo(() => JSON.stringify(state) !== JSON.stringify(saved), [state, saved]);

  function updateRoute(id: string, patch: Partial<Route>) {
    setState((s) => ({ ...s, routes: s.routes.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  }

  function addRoute() {
    if (!origin || !destination) return;
    const id = `${origin.i}-${destination.i}`;
    if (origin.i === destination.i) return setMessage({ ok: false, text: "Origem e destino iguais." });
    if (state.routes.some((r) => r.id === id)) return setMessage({ ok: false, text: `${origin.i}→${destination.i} já está na lista.` });
    // Herda janela e permanência da primeira rota: quase sempre é a mesma temporada.
    const base = state.routes[0];
    const today = new Date();
    const next = (d: number) => new Date(today.getFullYear(), today.getMonth() + d, 1).toISOString().slice(0, 10);
    setState((s) => ({
      ...s,
      routes: [
        ...s.routes,
        {
          id,
          origin: origin.i,
          destination: destination.i,
          city: destination.c,
          window: base ? [...base.window] : [next(2), next(3)],
          stay: base ? [...base.stay] : [12, 16],
          active: true,
        },
      ],
    }));
    setOrigin(null);
    setDestination(null);
    setMessage(null);
  }

  async function save() {
    setBusy("save");
    setMessage(null);
    try {
      const res = await fetch("/api/voos/rotas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: state, sha }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ ok: false, text: data.error ?? "Não foi possível salvar.", details: data.details });
        return;
      }
      const fresh = pickEditable(data.config);
      setSaved(fresh);
      setState(fresh);
      setSha(data.sha);
      setMessage({
        ok: true,
        text: "Salvo no GitHub. A próxima coleta já usa a configuração nova.",
        link: data.commitUrl,
      });
    } finally {
      setBusy(null);
    }
  }

  async function collect() {
    setBusy("collect");
    setMessage(null);
    try {
      const res = await fetch("/api/voos/coletar", { method: "POST" });
      const data = await res.json();
      setMessage(
        res.ok
          ? { ok: true, text: "Coleta iniciada. Leva de 10 a 30 minutos; a página de Voos atualiza quando terminar.", link: data.actionsUrl }
          : { ok: false, text: data.error ?? "Não foi possível iniciar a coleta." },
      );
    } finally {
      setBusy(null);
    }
  }

  const active = state.routes.filter((r) => r.active).length;

  return (
    <div className="ed">
      <div className="ed-bar" role="status">
        <span className="grow">
          {message ? (
            <span style={{ color: message.ok ? "var(--up)" : "var(--down)" }}>
              {message.text}{" "}
              {message.link && (
                <a href={message.link} target="_blank" rel="noreferrer">
                  ver no GitHub
                </a>
              )}
            </span>
          ) : dirty ? (
            "Alterações não salvas."
          ) : (
            `${state.routes.length} rotas · ${active} ativas · tudo salvo`
          )}
        </span>
        {dirty && (
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setState(saved)} disabled={busy !== null}>
            Descartar
          </button>
        )}
        <button className="btn btn-ghost btn-sm" type="button" onClick={collect} disabled={busy !== null || dirty} title={dirty ? "Salve antes de coletar" : undefined}>
          <Icon name="refresh" size={15} />
          {busy === "collect" ? "Iniciando…" : "Coletar agora"}
        </button>
        <button className="btn btn-primary btn-sm" type="button" onClick={save} disabled={!dirty || busy !== null}>
          <Icon name="check" size={15} />
          {busy === "save" ? "Salvando…" : "Salvar"}
        </button>
      </div>
      {message?.details && (
        <ul className="card form-error" style={{ margin: 0, paddingLeft: 36 }}>
          {message.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}

      <section className="card">
        <div className="card-title">
          <h3>Adicionar rota</h3>
        </div>
        <p className="card-sub">Busque por cidade em português, nome do aeroporto ou código: “milão”, “guarulhos”, “LIS”.</p>
        <div className="ed-add">
          <AirportPicker label="Origem" value={origin} onChange={setOrigin} />
          <AirportPicker label="Destino" value={destination} onChange={setDestination} />
          <button className="btn btn-primary btn-sm" type="button" onClick={addRoute} disabled={!origin || !destination}>
            <Icon name="plus" size={15} />
            Adicionar
          </button>
        </div>
      </section>

      <section className="card">
        <div className="card-title">
          <h3>Padrões</h3>
        </div>
        <p className="card-sub">Valem para toda rota sem alvo próprio.</p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <label className="ed-field">
            Alvo de compra (R$)
            <input className="ed-input money" inputMode="numeric" value={Number.isNaN(state.targets.buy) ? "" : state.targets.buy}
              onChange={(e) => setState((s) => ({ ...s, targets: { ...s.targets, buy: num(e.target.value) } }))} />
          </label>
          <label className="ed-field">
            Teto (R$)
            <input className="ed-input money" inputMode="numeric" value={Number.isNaN(state.targets.max) ? "" : state.targets.max}
              onChange={(e) => setState((s) => ({ ...s, targets: { ...s.targets, max: num(e.target.value) } }))} />
          </label>
          <label className="ed-field">
            Consultas por rota por dia
            <input className="ed-input num" inputMode="numeric" value={Number.isNaN(state.samples_per_run) ? "" : state.samples_per_run}
              onChange={(e) => setState((s) => ({ ...s, samples_per_run: num(e.target.value) }))} />
          </label>
        </div>
      </section>

      <div className="section-title" style={{ marginTop: 12 }}>
        <span className="ti">
          <Icon name="plane" size={16} />
        </span>
        <h2>Rotas</h2>
        <span className="count">{String(state.routes.length).padStart(2, "0")}</span>
      </div>
      <ul className="ed-routes">
        {state.routes.map((r) => (
          <li key={r.id} className={`ed-route${r.active ? "" : " off"}`}>
            <div className="who">
              <b>
                {r.origin} → {r.destination}
              </b>
              <span>{r.city}</span>
              <label className="toggle" style={{ marginTop: 8 }}>
                <input type="checkbox" checked={r.active} onChange={(e) => updateRoute(r.id, { active: e.target.checked })} />
                {r.active ? "ativa" : "desligada"}
              </label>
            </div>
            <div className="ed-field">
              Janela de ida (primeira e última data)
              <span className="pair2">
                <input className="ed-input" type="date" value={r.window[0]} onChange={(e) => updateRoute(r.id, { window: [e.target.value, r.window[1]] })} />
                <input className="ed-input" type="date" value={r.window[1]} onChange={(e) => updateRoute(r.id, { window: [r.window[0], e.target.value] })} />
              </span>
            </div>
            <div className="ed-field">
              Permanência (dias)
              <span className="pair2">
                <input className="ed-input num" inputMode="numeric" value={Number.isNaN(r.stay[0]) ? "" : r.stay[0]} onChange={(e) => updateRoute(r.id, { stay: [num(e.target.value), r.stay[1]] })} />
                a
                <input className="ed-input num" inputMode="numeric" value={Number.isNaN(r.stay[1]) ? "" : r.stay[1]} onChange={(e) => updateRoute(r.id, { stay: [r.stay[0], num(e.target.value)] })} />
              </span>
            </div>
            <div className="ed-field">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={Boolean(r.targets)}
                  onChange={(e) => updateRoute(r.id, { targets: e.target.checked ? { ...state.targets } : undefined })}
                />
                Alvo próprio (alvo / teto)
              </label>
              {r.targets ? (
                <span className="pair2">
                  <input className="ed-input money" inputMode="numeric" value={Number.isNaN(r.targets.buy) ? "" : r.targets.buy}
                    onChange={(e) => updateRoute(r.id, { targets: { ...r.targets!, buy: num(e.target.value) } })} />
                  <input className="ed-input money" inputMode="numeric" value={Number.isNaN(r.targets.max) ? "" : r.targets.max}
                    onChange={(e) => updateRoute(r.id, { targets: { ...r.targets!, max: num(e.target.value) } })} />
                </span>
              ) : (
                <span style={{ fontSize: 12.5, color: "var(--ink-3)", height: 36, display: "flex", alignItems: "center" }}>
                  usa o padrão
                </span>
              )}
            </div>
            <div className="ed-actions">
              <button
                className="btn btn-danger btn-sm"
                type="button"
                aria-label={`Remover ${r.origin}→${r.destination}`}
                onClick={() => {
                  if (confirm(`Remover ${r.origin}→${r.destination}? O histórico de preços fica guardado; para só pausar, desligue a rota.`)) {
                    setState((s) => ({ ...s, routes: s.routes.filter((x) => x.id !== r.id) }));
                  }
                }}
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="form-note">
        Salvar faz um commit no routes.json do Flight Tracker. Mudanças aparecem na página de Voos depois da próxima coleta
        (todo dia às 05:13, ou agora com “Coletar agora”).
      </p>
    </div>
  );
}
