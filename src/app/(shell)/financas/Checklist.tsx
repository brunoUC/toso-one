"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { brl } from "@/lib/format";
import type { ChecklistItem } from "@/lib/financas";

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

// Contas do mês: marca sozinha quando o pagamento aparece no extrato.
// "Não é este?" deixa apontar qual pagamento é o item.
export function Checklist({ items, monthLabel, today }: { items: ChecklistItem[]; monthLabel: string; today: string }) {
  const done = items.filter((i) => i.paid.length).length;
  const day = Number(today.slice(8, 10));
  return (
    <div className="card span-12 chk-card">
      <div className="card-title">
        <h3>Contas de {monthLabel}</h3>
        <span className="card-sub" style={{ margin: 0 }}>
          {done} de {items.length} pagas · marca sozinho pelo extrato
        </span>
      </div>
      <ul className="chk">
        {items.map((i) => (
          <Item key={i.key} item={i} day={day} />
        ))}
      </ul>
    </div>
  );
}

function Item({ item, day }: { item: ChecklistItem; day: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLLIElement>(null);
  const paid = item.paid.length > 0;
  const late = !paid && item.typicalDay !== null && day > item.typicalDay + 3;
  const total = item.paid.reduce((s, p) => s + p.amount, 0);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  async function link(txId: string | null) {
    setBusy(true);
    await fetch("/api/financas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "checklist", key: item.key, txId }) });
    setBusy(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <li ref={box} className={`chk-item ${paid ? "ok" : late ? "late" : "wait"}`}>
      <span className="chk-mark" aria-hidden="true">
        {paid ? "✓" : late ? "!" : ""}
      </span>
      <div className="chk-body">
        <b>{item.name}</b>
        <small>
          {paid ? (
            <>
              pago {dm(item.paid[0].date)} · {brl(total)}
            </>
          ) : late ? (
            <>atrasado · costuma ser dia {item.typicalDay}</>
          ) : item.typicalDay ? (
            <>
              pendente · costuma ser dia {item.typicalDay}
              {item.lastAmount ? ` · ~${brl(item.lastAmount)}` : ""}
            </>
          ) : (
            <>pendente</>
          )}
        </small>
        <button type="button" className="chk-fix" onClick={() => setOpen((v) => !v)} disabled={busy}>
          {busy ? "salvando…" : paid ? "não é este?" : "já paguei"}
        </button>
      </div>
      <span className="sr-only">{paid ? "pago" : late ? "atrasado" : "pendente"}</span>
      {open && (
        <div className="chk-pop" role="dialog" aria-label={`Qual pagamento é ${item.name}?`}>
          <p>
            Qual pagamento deste mês é <b>{item.name}</b>? Daqui para frente ele reconhece pelo mesmo destinatário.
          </p>
          <ul>
            {item.candidates.map((c) => (
              <li key={c.txId}>
                <button type="button" onClick={() => link(c.txId)}>
                  <span>{c.who}</span>
                  <small>
                    {dm(c.date)} · {brl(c.amount)}
                  </small>
                </button>
              </li>
            ))}
          </ul>
          {item.payee && (
            <button type="button" className="link-btn" onClick={() => link(null)}>
              voltar a reconhecer pela categoria
            </button>
          )}
          {paid && (
            <Link className="link-btn" href={`/financas/m/${encodeURIComponent(item.paid[0].txId)}`}>
              ver o pagamento
            </Link>
          )}
        </div>
      )}
    </li>
  );
}
