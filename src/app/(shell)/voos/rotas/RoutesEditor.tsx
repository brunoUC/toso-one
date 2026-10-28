"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { AirportPicker, useAirports } from "@/components/AirportPicker";
import { Icon } from "@/components/Icon";
import { countryName, type Airport } from "@/lib/airports";

type Targets = { buy?: number; max?: number };
type Route = {
  key: string; // só no navegador: estável mesmo quando origem/destino mudam
  origin: string;
  destination: string;
  city: string;
  window: [string, string];
  stay: [number, number];
  active: boolean;
  targets?: Targets;
};
type State = { targets: { buy: number; max: number }; samples_per_run: number; routes: Route[] };
type Config = Record<string, unknown> & {
  targets: { buy: number; max: number };
  samples_per_run: number;
  routes: (Omit<Route, "key"> & { id: string })[];
};
type Run = { id: number; event: string; status: string; conclusion: string | null; createdAt: string; url: string };
type FieldErrors = Record<string, string>;

let seq = 0;
const newKey = () => `r${++seq}`;
const num = (v: string) => (v.trim() === "" ? Number.NaN : Number(v));
const show = (n: number | undefined) => (n === undefined || Number.isNaN(n) ? "" : String(n));

function fromConfig(config: Config): State {
  return {
    targets: config.targets,
    samples_per_run: config.samples_per_run,
    routes: config.routes.map(({ id: _id, ...r }) => ({ ...r, key: newKey(), active: r.active !== false })),
  };
}

function toConfig(base: Config, state: State): Config {
  return {
    ...base,
    targets: state.targets,
    samples_per_run: state.samples_per_run,
    routes: state.routes.map(({ key: _k, ...r }) => ({ id: `${r.origin}-${r.destination}`, ...r })),
  };
}

const strip = (s: State) => JSON.stringify({ ...s, routes: s.routes.map(({ key: _k, ...r }) => r) });

function nextMonthWindow(): [string, string] {
  const now = new Date();
  const a = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1));
  const b = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 0));
  return [a.toISOString().slice(0, 10), b.toISOString().slice(0, 10)];
}

const RUN_LABEL: Record<string, string> = { queued: "na fila", in_progress: "coletando", completed: "concluída" };

export function RoutesEditor({
  initialConfig,
  initialSha,
  initialTimes,
  scheduleSha,
}: {
  initialConfig: Config;
  initialSha: string;
  initialTimes: string[] | null;
  scheduleSha: string | null;
}) {
  const airports = useAirports();
  const byCode = useMemo(() => new Map((airports ?? []).map((a) => [a.i, a])), [airports]);

  const [base, setBase] = useState(initialConfig);
  const [saved, setSaved] = useState(() => fromConfig(initialConfig));
  const [state, setState] = useState(saved);
  const [sha, setSha] = useState(initialSha);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [errors, setErrors] = useState<{ defaults: FieldErrors; routes: Record<string, FieldErrors> }>({ defaults: {}, routes: {} });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null); // "dest:LIS" | "orig:<key>" | "add:LIS"

  // Adicionar várias rotas de uma vez
  const [newOrigins, setNewOrigins] = useState<Airport[]>([]);
  const [newDests, setNewDests] = useState<Airport[]>([]);
  const [newWindow, setNewWindow] = useState<[string, string]>(() => saved.routes[0]?.window ?? nextMonthWindow());
  const [newStay, setNewStay] = useState<[number, number]>(() => saved.routes[0]?.stay ?? [8, 12]);

  // Lote
  const [bulkWindow, setBulkWindow] = useState<[string, string]>(["", ""]);
  const [bulkStay, setBulkStay] = useState<[number, number]>([Number.NaN, Number.NaN]);

  // Horários e execuções
  const [times, setTimes] = useState<string[] | null>(initialTimes);
  const [savedTimes, setSavedTimes] = useState(initialTimes);
  const [timesSha, setTimesSha] = useState(scheduleSha);
  const [runs, setRuns] = useState<Run[] | null>(null);

  const dirty = useMemo(() => strip(state) !== strip(saved), [state, saved]);
  const timesDirty = JSON.stringify(times) !== JSON.stringify(savedTimes);

  async function loadRuns() {
    const res = await fetch("/api/voos/coletar");
    if (res.ok) setRuns((await res.json()).runs);
  }
  useEffect(() => {
    loadRuns();
  }, []);
  const running = runs?.some((r) => r.status !== "completed");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(loadRuns, 15000);
    return () => clearInterval(t);
  }, [running]);

  // ── helpers de estado ───────────────────────────────────────────────
  const patch = (key: string, p: Partial<Route>) =>
    setState((s) => ({ ...s, routes: s.routes.map((r) => (r.key === key ? { ...r, ...p } : r)) }));
  const exists = (o: string, d: string, ignoreKey?: string) =>
    state.routes.some((r) => r.origin === o && r.destination === d && r.key !== ignoreKey);
  const cityOf = (code: string) => byCode.get(code)?.c ?? "";

  const groups = useMemo(() => {
    const map = new Map<string, Route[]>();
    for (const r of state.routes) map.set(r.destination, [...(map.get(r.destination) ?? []), r]);
    return [...map.entries()].sort((a, b) => (a[1][0].city || a[0]).localeCompare(b[1][0].city || b[0]));
  }, [state.routes]);

  function addCombos() {
    const fresh: Route[] = [];
    let skipped = 0;
    for (const o of newOrigins)
      for (const d of newDests) {
        if (o.i === d.i || exists(o.i, d.i) || fresh.some((r) => r.origin === o.i && r.destination === d.i)) {
          skipped++;
          continue;
        }
        fresh.push({ key: newKey(), origin: o.i, destination: d.i, city: d.c, window: [...newWindow], stay: [...newStay], active: true });
      }
    setState((s) => ({ ...s, routes: [...s.routes, ...fresh] }));
    setNewOrigins([]);
    setNewDests([]);
    setMessage({
      ok: true,
      text: `${fresh.length} rota${fresh.length === 1 ? "" : "s"} adicionada${fresh.length === 1 ? "" : "s"}${skipped ? ` (${skipped} já existia${skipped === 1 ? "" : "m"} ou repetia origem)` : ""}. Falta salvar.`,
    });
  }

  function changeDestination(from: string, to: Airport) {
    const clash = state.routes.filter((r) => r.destination === from && exists(r.origin, to.i));
    if (clash.length) return setMessage({ ok: false, text: `Já existe ${clash.map((r) => `${r.origin}→${to.i}`).join(", ")}.` });
    setState((s) => ({
      ...s,
      routes: s.routes.map((r) => (r.destination === from ? { ...r, destination: to.i, city: to.c } : r)),
    }));
    setEditing(null);
  }

  function changeOrigin(key: string, to: Airport) {
    const r = state.routes.find((x) => x.key === key)!;
    if (to.i === r.destination) return setMessage({ ok: false, text: "Origem igual ao destino." });
    if (exists(to.i, r.destination, key)) return setMessage({ ok: false, text: `${to.i}→${r.destination} já existe.` });
    patch(key, { origin: to.i });
    setEditing(null);
  }

  function addOrigin(dest: string, to: Airport) {
    const sibling = state.routes.find((r) => r.destination === dest)!;
    if (to.i === dest) return setMessage({ ok: false, text: "Origem igual ao destino." });
    if (exists(to.i, dest)) return setMessage({ ok: false, text: `${to.i}→${dest} já existe.` });
    setState((s) => ({
      ...s,
      routes: [...s.routes, { ...sibling, key: newKey(), origin: to.i, targets: undefined, active: true }],
    }));
    setEditing(null);
  }

  function bulk(fn: (r: Route) => Route) {
    setState((s) => ({ ...s, routes: s.routes.map((r) => (selected.has(r.key) ? fn(r) : r)) }));
  }

  // ── servidor ────────────────────────────────────────────────────────
  async function save() {
    setBusy("save");
    setMessage(null);
    setErrors({ defaults: {}, routes: {} });
    const config = toConfig(base, state);
    try {
      const res = await fetch("/api/voos/rotas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, sha, before: base.routes }),
      });
      const data = await res.json();
      if (!res.ok) {
        // A API do Flight Tracker devolve os erros por índice de rota.
        const d = data.details as { defaults?: FieldErrors; routes?: FieldErrors[] } | undefined;
        const routes: Record<string, FieldErrors> = {};
        d?.routes?.forEach((e, i) => {
          if (e && Object.keys(e).length) routes[state.routes[i].key] = e;
        });
        setErrors({ defaults: d?.defaults ?? {}, routes });
        setMessage({ ok: false, text: data.error ?? "Não foi possível salvar." });
        return;
      }
      setBase(config);
      setSaved(state);
      setSha(data.sha);
      setSelected(new Set());
      setMessage({
        ok: data.collect?.ok !== false,
        text: data.collectText ? `Salvo. ${data.collectText}` : "Salvo. A próxima coleta já usa a configuração nova.",
      });
      if (data.collect?.routes?.length) setTimeout(loadRuns, 4000);
    } finally {
      setBusy(null);
    }
  }

  async function saveTimes() {
    if (!times || !timesSha) return;
    setBusy("times");
    try {
      const res = await fetch("/api/voos/horarios", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ times, sha: timesSha }),
      });
      const data = await res.json();
      if (!res.ok) return setMessage({ ok: false, text: data.error ?? "Não foi possível salvar os horários." });
      setTimes(data.times);
      setSavedTimes(data.times);
      setTimesSha(data.sha);
      setMessage({ ok: true, text: "Horários salvos." });
    } finally {
      setBusy(null);
    }
  }

  async function collect() {
    setBusy("collect");
    try {
      const res = await fetch("/api/voos/coletar", { method: "POST" });
      const data = await res.json();
      setMessage(
        res.ok
          ? { ok: true, text: "Coleta iniciada. Leva de 5 a 30 minutos; a página de Voos atualiza sozinha quando terminar." }
          : { ok: false, text: data.error ?? "Não foi possível iniciar a coleta." },
      );
      setTimeout(loadRuns, 4000);
    } finally {
      setBusy(null);
    }
  }

  const activeCount = state.routes.filter((r) => r.active).length;
  const combos = newOrigins.length * newDests.length;
  const err = (key: string, field: string) => errors.routes[key]?.[field];

  return (
    <div className="ed">
      {/* Barra fixa: estado e ações principais */}
      <div className="ed-bar" role="status">
        <span className="grow">
          {message ? (
            <span style={{ color: message.ok ? "var(--up)" : "var(--down)" }}>{message.text}</span>
          ) : dirty ? (
            <b style={{ fontWeight: 500, color: "var(--ink-1)" }}>Alterações não salvas</b>
          ) : (
            `${groups.length} destinos · ${state.routes.length} rotas · ${activeCount} ativas`
          )}
        </span>
        {dirty && (
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setState(saved); setErrors({ defaults: {}, routes: {} }); setMessage(null); }} disabled={busy !== null}>
            Descartar
          </button>
        )}
        <button className="btn btn-primary btn-sm" type="button" onClick={save} disabled={!dirty || busy !== null}>
          <Icon name="check" size={15} />
          {busy === "save" ? "Salvando…" : "Salvar rotas"}
        </button>
      </div>

      {/* Adicionar: várias origens × vários destinos */}
      <section className="card ed-add-card">
        <div className="card-title">
          <h3>Adicionar destinos</h3>
        </div>
        <p className="card-sub">
          Escolha uma ou mais origens e um ou mais destinos: cada combinação vira uma rota. Busque por cidade em português, nome do
          aeroporto ou código (“milão”, “guarulhos”, “LIS”).
        </p>
        <div className="ed-add2">
          <div className="ed-multi">
            <AirportPicker label="Origens" value={null} onChange={(a) => a && !newOrigins.some((x) => x.i === a.i) && setNewOrigins([...newOrigins, a])} placeholder="De onde: São Paulo, POA…" />
            <div className="chips">
              {newOrigins.map((a) => (
                <button key={a.i} type="button" className="chip chip-x" onClick={() => setNewOrigins(newOrigins.filter((x) => x.i !== a.i))} aria-label={`Tirar ${a.i}`}>
                  <b>{a.i}</b> {a.c} ×
                </button>
              ))}
            </div>
          </div>
          <div className="ed-multi">
            <AirportPicker label="Destinos" value={null} onChange={(a) => a && !newDests.some((x) => x.i === a.i) && setNewDests([...newDests, a])} placeholder="Para onde: Lisboa, Tóquio…" />
            <div className="chips">
              {newDests.map((a) => (
                <button key={a.i} type="button" className="chip chip-x" onClick={() => setNewDests(newDests.filter((x) => x.i !== a.i))} aria-label={`Tirar ${a.i}`}>
                  <b>{a.i}</b> {a.c} ×
                </button>
              ))}
            </div>
          </div>
          <label className="ed-field">
            Ida entre
            <span className="pair2">
              <input className="ed-input" type="date" value={newWindow[0]} onChange={(e) => setNewWindow([e.target.value, newWindow[1]])} />
              <input className="ed-input" type="date" value={newWindow[1]} onChange={(e) => setNewWindow([newWindow[0], e.target.value])} />
            </span>
          </label>
          <label className="ed-field">
            Ficar (dias)
            <span className="pair2">
              <input className="ed-input num" inputMode="numeric" value={show(newStay[0])} onChange={(e) => setNewStay([num(e.target.value), newStay[1]])} />
              a
              <input className="ed-input num" inputMode="numeric" value={show(newStay[1])} onChange={(e) => setNewStay([newStay[0], num(e.target.value)])} />
            </span>
          </label>
          <button className="btn btn-primary btn-sm ed-add-btn" type="button" onClick={addCombos} disabled={combos === 0}>
            <Icon name="plus" size={15} />
            {combos ? `Adicionar ${combos} rota${combos === 1 ? "" : "s"}` : "Adicionar"}
          </button>
        </div>
      </section>

      {/* Lote */}
      {selected.size > 0 && (
        <section className="card ed-bulk">
          <b>{selected.size} selecionada{selected.size === 1 ? "" : "s"}</b>
          <label className="ed-field">
            Ida entre
            <span className="pair2">
              <input className="ed-input" type="date" value={bulkWindow[0]} onChange={(e) => setBulkWindow([e.target.value, bulkWindow[1]])} />
              <input className="ed-input" type="date" value={bulkWindow[1]} onChange={(e) => setBulkWindow([bulkWindow[0], e.target.value])} />
            </span>
          </label>
          <label className="ed-field">
            Ficar (dias)
            <span className="pair2">
              <input className="ed-input num" inputMode="numeric" value={show(bulkStay[0])} onChange={(e) => setBulkStay([num(e.target.value), bulkStay[1]])} />
              a
              <input className="ed-input num" inputMode="numeric" value={show(bulkStay[1])} onChange={(e) => setBulkStay([bulkStay[0], num(e.target.value)])} />
            </span>
          </label>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            disabled={!bulkWindow[0] && !bulkWindow[1] && Number.isNaN(bulkStay[0]) && Number.isNaN(bulkStay[1])}
            onClick={() =>
              bulk((r) => ({
                ...r,
                window: [bulkWindow[0] || r.window[0], bulkWindow[1] || r.window[1]],
                stay: [Number.isNaN(bulkStay[0]) ? r.stay[0] : bulkStay[0], Number.isNaN(bulkStay[1]) ? r.stay[1] : bulkStay[1]],
              }))
            }
          >
            Aplicar datas
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => bulk((r) => ({ ...r, active: true }))}>
            Ligar
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => bulk((r) => ({ ...r, active: false }))}>
            Desligar
          </button>
          <button
            className="btn btn-danger btn-sm"
            type="button"
            onClick={() => {
              if (!confirm(`Remover ${selected.size} rota(s)? O histórico de preços fica guardado.`)) return;
              setState((s) => ({ ...s, routes: s.routes.filter((r) => !selected.has(r.key)) }));
              setSelected(new Set());
            }}
          >
            Remover
          </button>
          <button className="link-btn" type="button" onClick={() => setSelected(new Set())}>
            limpar seleção
          </button>
        </section>
      )}

      {/* Destinos */}
      <div className="section-title" style={{ marginTop: 8 }}>
        <span className="ti">
          <Icon name="plane" size={16} />
        </span>
        <h2>Destinos</h2>
        <span className="count">{String(groups.length).padStart(2, "0")}</span>
        <span className="grow" />
        <button
          className="link-btn"
          type="button"
          onClick={() => setSelected(selected.size === state.routes.length ? new Set() : new Set(state.routes.map((r) => r.key)))}
        >
          {selected.size === state.routes.length ? "desmarcar todas" : "selecionar todas"}
        </button>
      </div>

      <div className="ed-groups">
        {groups.map(([dest, routes]) => {
          const a = byCode.get(dest);
          return (
            <section key={dest} className="card ed-group">
              <header className="ed-group-head">
                <div>
                  <h3>{routes[0].city || a?.c || dest}</h3>
                  <span className="ed-group-sub">
                    <b>{dest}</b> {a ? `· ${a.n} · ${countryName(a.k)}` : ""}
                  </span>
                </div>
                <span className="grow" />
                {editing === `dest:${dest}` ? (
                  <div className="ed-inline-pick">
                    <AirportPicker label="Novo destino" value={null} onChange={(x) => x && changeDestination(dest, x)} autoFocus compact />
                    <button className="link-btn" type="button" onClick={() => setEditing(null)}>
                      cancelar
                    </button>
                  </div>
                ) : (
                  <>
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditing(`dest:${dest}`)}>
                      <Icon name="edit" size={14} />
                      Trocar destino
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      type="button"
                      aria-label={`Remover ${dest}`}
                      onClick={() => {
                        if (confirm(`Remover todas as rotas para ${routes[0].city || dest}? O histórico de preços fica guardado.`))
                          setState((s) => ({ ...s, routes: s.routes.filter((r) => r.destination !== dest) }));
                      }}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </>
                )}
              </header>

              <ul className="ed-rows">
                {routes.map((r) => (
                  <Fragment key={r.key}>
                    <li className={`ed-row${r.active ? "" : " off"}${errors.routes[r.key] ? " has-error" : ""}`}>
                      <input
                        type="checkbox"
                        className="ed-check"
                        aria-label={`Selecionar ${r.origin}→${r.destination}`}
                        checked={selected.has(r.key)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(r.key);
                          else next.delete(r.key);
                          setSelected(next);
                        }}
                      />
                      <div className="ed-origin">
                        {editing === `orig:${r.key}` ? (
                          <div className="ed-inline-pick">
                            <AirportPicker label="Nova origem" value={null} onChange={(x) => x && changeOrigin(r.key, x)} autoFocus compact />
                            <button className="link-btn" type="button" onClick={() => setEditing(null)}>
                              cancelar
                            </button>
                          </div>
                        ) : (
                          <button type="button" className="ed-origin-btn" onClick={() => setEditing(`orig:${r.key}`)} title="Trocar origem">
                            <b>{r.origin}</b>
                            <span>{cityOf(r.origin) || "origem"}</span>
                            <Icon name="edit" size={12} />
                          </button>
                        )}
                        <label className="toggle">
                          <input type="checkbox" checked={r.active} onChange={(e) => patch(r.key, { active: e.target.checked })} />
                          {r.active ? "ativa" : "pausada"}
                        </label>
                      </div>
                      <label className="ed-field">
                        Ida entre
                        <span className="pair2">
                          <input className={`ed-input${err(r.key, "windowStart") ? " bad" : ""}`} type="date" value={r.window[0]} onChange={(e) => patch(r.key, { window: [e.target.value, r.window[1]] })} />
                          <input className={`ed-input${err(r.key, "windowEnd") ? " bad" : ""}`} type="date" value={r.window[1]} onChange={(e) => patch(r.key, { window: [r.window[0], e.target.value] })} />
                        </span>
                      </label>
                      <label className="ed-field">
                        Ficar (dias)
                        <span className="pair2">
                          <input className={`ed-input num${err(r.key, "stayMin") ? " bad" : ""}`} inputMode="numeric" value={show(r.stay[0])} onChange={(e) => patch(r.key, { stay: [num(e.target.value), r.stay[1]] })} />
                          a
                          <input className={`ed-input num${err(r.key, "stayMax") ? " bad" : ""}`} inputMode="numeric" value={show(r.stay[1])} onChange={(e) => patch(r.key, { stay: [r.stay[0], num(e.target.value)] })} />
                        </span>
                      </label>
                      <div className="ed-field">
                        <label className="toggle">
                          <input type="checkbox" checked={Boolean(r.targets)} onChange={(e) => patch(r.key, { targets: e.target.checked ? { ...state.targets } : undefined })} />
                          Alvo próprio
                        </label>
                        {r.targets ? (
                          <span className="pair2">
                            <input className={`ed-input money${err(r.key, "targetBuy") ? " bad" : ""}`} inputMode="numeric" aria-label="Alvo" value={show(r.targets.buy)} onChange={(e) => patch(r.key, { targets: { ...r.targets, buy: num(e.target.value) } })} />
                            <input className={`ed-input money${err(r.key, "targetMax") ? " bad" : ""}`} inputMode="numeric" aria-label="Teto" value={show(r.targets.max)} onChange={(e) => patch(r.key, { targets: { ...r.targets, max: num(e.target.value) } })} />
                          </span>
                        ) : (
                          <span className="ed-muted">
                            padrão: {state.targets.buy.toLocaleString("pt-BR")} / {state.targets.max.toLocaleString("pt-BR")}
                          </span>
                        )}
                      </div>
                      <button
                        className="btn btn-danger btn-sm"
                        type="button"
                        aria-label={`Remover ${r.origin}→${r.destination}`}
                        onClick={() => setState((s) => ({ ...s, routes: s.routes.filter((x) => x.key !== r.key) }))}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </li>
                    {errors.routes[r.key] && (
                      <li className="ed-row-error">
                        {r.origin}→{r.destination}: {Object.values(errors.routes[r.key]).join(" · ")}
                      </li>
                    )}
                  </Fragment>
                ))}
              </ul>
              <footer className="ed-group-foot">
                {editing === `add:${dest}` ? (
                  <div className="ed-inline-pick">
                    <AirportPicker label="Nova origem para este destino" value={null} onChange={(x) => x && addOrigin(dest, x)} autoFocus compact />
                    <button className="link-btn" type="button" onClick={() => setEditing(null)}>
                      cancelar
                    </button>
                  </div>
                ) : (
                  <button className="link-btn" type="button" onClick={() => setEditing(`add:${dest}`)}>
                    + outra origem para {routes[0].city || dest}
                  </button>
                )}
              </footer>
            </section>
          );
        })}
      </div>

      {/* Padrões */}
      <section className="card">
        <div className="card-title">
          <h3>Padrões</h3>
        </div>
        <p className="card-sub">Valem para toda rota sem alvo próprio. Abaixo do alvo, a página diz “comprar”; até o teto, “avaliar”.</p>
        <div className="ed-defaults">
          <label className="ed-field">
            Alvo de compra (R$)
            <input className={`ed-input money${errors.defaults.buy ? " bad" : ""}`} inputMode="numeric" value={show(state.targets.buy)} onChange={(e) => setState((s) => ({ ...s, targets: { ...s.targets, buy: num(e.target.value) } }))} />
          </label>
          <label className="ed-field">
            Teto (R$)
            <input className={`ed-input money${errors.defaults.max ? " bad" : ""}`} inputMode="numeric" value={show(state.targets.max)} onChange={(e) => setState((s) => ({ ...s, targets: { ...s.targets, max: num(e.target.value) } }))} />
          </label>
          <label className="ed-field">
            Pares de datas por rota, por coleta
            <input className={`ed-input num${errors.defaults.samples ? " bad" : ""}`} inputMode="numeric" value={show(state.samples_per_run)} onChange={(e) => setState((s) => ({ ...s, samples_per_run: num(e.target.value) }))} />
          </label>
        </div>
        {Object.keys(errors.defaults).length > 0 && <p className="form-error">{Object.values(errors.defaults).join(" · ")}</p>}
      </section>

      {/* Coleta automática */}
      <section className="card">
        <div className="card-title">
          <h3>Coleta</h3>
          <button className="btn btn-ghost btn-sm" type="button" onClick={collect} disabled={busy !== null || dirty} title={dirty ? "Salve as rotas antes" : undefined}>
            <Icon name="refresh" size={15} />
            {busy === "collect" ? "Iniciando…" : "Coletar agora"}
          </button>
        </div>
        <p className="card-sub">Horários de Brasília, até 4 por dia. O GitHub costuma atrasar coletas agendadas; “coletar agora” roda na hora.</p>
        {times && (
          <div className="ed-times">
            {times.map((t, i) => (
              <span key={i} className="pair2">
                <input className="ed-input" type="time" value={t} onChange={(e) => setTimes(times.map((x, j) => (j === i ? e.target.value : x)))} />
                <button className="link-btn" type="button" onClick={() => setTimes(times.filter((_, j) => j !== i))} aria-label="Tirar horário">
                  ×
                </button>
              </span>
            ))}
            {times.length < 4 && (
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setTimes([...times, "12:13"])}>
                <Icon name="plus" size={14} /> horário
              </button>
            )}
            {timesDirty && (
              <button className="btn btn-primary btn-sm" type="button" onClick={saveTimes} disabled={busy !== null}>
                {busy === "times" ? "Salvando…" : "Salvar horários"}
              </button>
            )}
          </div>
        )}
        {runs && runs.length > 0 && (
          <ul className="ed-runs">
            {runs.slice(0, 5).map((r) => (
              <li key={r.id}>
                <span className={`status-dot${r.status !== "completed" ? " live" : r.conclusion === "success" ? "" : " off"}`} />
                {r.status === "completed" ? (r.conclusion === "success" ? "concluída" : "com falha") : RUN_LABEL[r.status]} · {r.event}
                <time>
                  {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(r.createdAt))}
                </time>
                <a href={r.url} target="_blank" rel="noreferrer">
                  ver
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
