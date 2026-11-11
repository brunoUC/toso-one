import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { requireSession } from "@/lib/auth";
import { convexConfigured } from "@/lib/convex";
import { getHighlights, getShelf, highlightOfTheDay, type ShelfItem } from "@/lib/estante";
import { KIND_LABEL, TABS, statusLabel, type TabId } from "@/lib/estante-labels";
import { todayInSp } from "@/lib/semana";
import { AddBox } from "./AddBox";
import { Highlights, Importer, ItemActions } from "./client";

export const metadata: Metadata = { title: "Estante" };

const MONTH = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const dmy = (d: string) => `${Number(d.slice(8, 10))} ${MONTH[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

function Stars({ value }: { value: number }) {
  return (
    <span className="stars" aria-label={`${value} de 5`}>
      {"★".repeat(Math.floor(value))}
      {value % 1 >= 0.5 ? "½" : ""}
    </span>
  );
}

function Item({ it }: { it: ShelfItem }) {
  const meta = [it.kind !== "book" ? KIND_LABEL[it.kind] : null, it.creator, it.year].filter(Boolean).join(" · ");
  return (
    <li className="shelf-item">
      <span className="cover" data-initial={it.title.charAt(0).toUpperCase()}>
        {it.cover && <img src={it.cover} alt="" loading="lazy" />}
      </span>
      <span className="shelf-text">
        <b>{it.title}</b>
        {meta && <span className="muted">{meta}</span>}
        <span className="shelf-tags">
          {it.recommendedBy && (
            <span className="tag">
              indicado por <b>{it.recommendedBy}</b>
            </span>
          )}
          {it.rating != null && <Stars value={it.rating} />}
          {it.status === "done" && it.finishedOn && <span className="tag plain">{dmy(it.finishedOn)}</span>}
          {it.status !== "done" && <span className="tag plain">desde {dmy(new Date(it.addedAt - 3 * 3600_000).toISOString().slice(0, 10))}</span>}
        </span>
        {it.note && <span className="shelf-note">{it.note}</span>}
      </span>
      <ItemActions id={it.id} kind={it.kind} status={it.status} title={it.title} />
    </li>
  );
}

function Group({ title, items, empty, count = true }: { title: string; items: ShelfItem[]; empty?: string; count?: boolean }) {
  if (!items.length && !empty) return null;
  return (
    <section className="shelf-group">
      <h3>
        {title} {count && <span className="count">{items.length}</span>}
      </h3>
      {items.length ? (
        <ul className="shelf-list">
          {items.map((it) => (
            <Item key={it.id} it={it} />
          ))}
        </ul>
      ) : (
        <p className="feed-empty">{empty}</p>
      )}
    </section>
  );
}

// Lidos/vistos agrupados pelo ano em que terminou.
function ByYear({ items, noun }: { items: ShelfItem[]; noun: [string, string] }) {
  const years = new Map<string, ShelfItem[]>();
  for (const it of items) {
    const y = it.finishedOn?.slice(0, 4) ?? "Sem data";
    years.set(y, [...(years.get(y) ?? []), it]);
  }
  const sorted = [...years.entries()].sort((a, b) => (a[0] === "Sem data" ? 1 : b[0] === "Sem data" ? -1 : b[0].localeCompare(a[0])));
  return (
    <>
      {sorted.map(([y, list]) => (
        <Group
          key={y}
          title={`${y} · ${list.length} ${list.length === 1 ? noun[0] : noun[1]}`}
          count={false}
          items={list.sort((a, b) => (b.finishedOn ?? "").localeCompare(a.finishedOn ?? "") || b.addedAt - a.addedAt)}
        />
      ))}
    </>
  );
}

export default async function EstantePage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  await requireSession("/estante");
  const sp = await searchParams;
  const tab: TabId = TABS.some((t) => t.id === sp.aba) ? (sp.aba as TabId) : "ler";

  if (!convexConfigured()) {
    return (
      <main className="page">
        <h1 className="page-h1">Estante</h1>
        <p className="form-error">Convex não configurado: a Estante guarda tudo lá.</p>
      </main>
    );
  }

  const { today } = todayInSp();
  const [shelf, highlights, hod] = await Promise.all([getShelf(), tab === "destaques" ? getHighlights() : Promise.resolve([]), highlightOfTheDay(today)]);
  const books = shelf.filter((i) => i.kind === "book");
  const screen = shelf.filter((i) => i.kind !== "book");
  const counts: Record<TabId, number> = {
    ler: books.filter((i) => i.status === "want" || i.status === "doing").length,
    assistir: screen.filter((i) => i.status === "want" || i.status === "doing").length,
    lidos: books.filter((i) => i.status === "done").length,
    vistos: screen.filter((i) => i.status === "done").length,
    destaques: hod?.total ?? highlights.length,
  };

  return (
    <main className="page estante">
      <header className="estante-head">
        <div>
          <p className="eyebrow">Livros, filmes e séries</p>
          <h1 className="page-h1">Estante</h1>
        </div>
        {hod && tab !== "destaques" && (
          <Link href="/estante?aba=destaques" className="hod">
            <Icon name="quote" size={16} />
            <span>
              <span className="hod-text">{hod.text}</span>
              <span className="muted">— {hod.book}</span>
            </span>
          </Link>
        )}
      </header>

      <AddBox initialType={tab === "assistir" || tab === "vistos" ? "tela" : "livro"} />

      <nav className="seg estante-tabs" aria-label="Estante">
        {TABS.map((t) => (
          <Link key={t.id} href={t.id === "ler" ? "/estante" : `/estante?aba=${t.id}`} aria-current={tab === t.id ? "page" : undefined}>
            <Icon name={t.icon} size={14} />
            {t.label}
            <span className="count">{counts[t.id]}</span>
          </Link>
        ))}
      </nav>

      {tab === "ler" && (
        <>
          <Group title={statusLabel("book", "doing")} items={books.filter((i) => i.status === "doing")} />
          <Group title="Quero ler" items={books.filter((i) => i.status === "want")} empty="Busque um livro acima e toque em “Quero ler”." />
        </>
      )}
      {tab === "assistir" && (
        <>
          <Group title="Vendo" items={screen.filter((i) => i.status === "doing")} />
          <Group title="Quero ver" items={screen.filter((i) => i.status === "want")} empty="Quando alguém indicar um filme ou série, busque acima e anote quem indicou." />
        </>
      )}
      {tab === "lidos" && (
        <>
          <div className="import-row">
            <Importer mode="storygraph" />
            <span className="muted small">StoryGraph → Manage Account → Export StoryGraph Library. Reimportar não duplica.</span>
          </div>
          {books.some((i) => i.status === "done") ? <ByYear items={books.filter((i) => i.status === "done")} noun={["livro", "livros"]} /> : <p className="feed-empty">Nenhum livro lido ainda. Importe do StoryGraph ou marque “Já li” na busca.</p>}
          <Group title="Larguei" items={books.filter((i) => i.status === "dropped")} />
        </>
      )}
      {tab === "vistos" && (
        <>
          {screen.some((i) => i.status === "done") ? <ByYear items={screen.filter((i) => i.status === "done")} noun={["título", "títulos"]} /> : <p className="feed-empty">Nada visto ainda. Marque “Já vi” na busca ou mude a situação na lista.</p>}
          <Group title="Larguei" items={screen.filter((i) => i.status === "dropped")} />
        </>
      )}
      {tab === "destaques" && (
        <>
          <div className="import-row">
            <Importer mode="kindle" />
            <span className="muted small">
              Kindle pelo cabo: <code>documents/My Clippings.txt</code>. App do Kindle: no livro, Anotações → Exportar → HTML. Reimportar não duplica.
            </span>
          </div>
          {hod && (
            <figure className="hod-big">
              <p className="eyebrow">Highlight do dia</p>
              <blockquote>{hod.text}</blockquote>
              <figcaption>
                {hod.book}
                {hod.author ? ` · ${hod.author}` : ""}
              </figcaption>
            </figure>
          )}
          {highlights.length ? <Highlights list={highlights} /> : <p className="feed-empty">Nenhum highlight ainda. Importe o arquivo do Kindle acima.</p>}
        </>
      )}
    </main>
  );
}
