import Link from "next/link";
import { Icon } from "@/components/Icon";

// Cabeçalho comum do Feed: voltar ao feed e a busca (perfis, lugares,
// hashtags). A busca é um formulário simples: funciona sem JavaScript.
export function FeedTop({ q = "", back = false }: { q?: string; back?: boolean }) {
  return (
    <div className="ig-top">
      {back ? (
        <Link href="/feed" className="ig-back" aria-label="Voltar ao feed">
          <Icon name="back" size={16} />
        </Link>
      ) : (
        <h1 className="ig-title">Feed</h1>
      )}
      <form action="/feed/buscar" className="ig-search" role="search">
        <Icon name="search" size={15} />
        <input name="q" type="search" defaultValue={q} placeholder="Buscar perfis, lugares, restaurantes…" enterKeyHint="search" autoCapitalize="none" />
      </form>
    </div>
  );
}

export function LiveError({ error, kind }: { error: string; kind?: string }) {
  return (
    <div className="notice">
      <span className="ic">
        <Icon name="lock" size={18} />
      </span>
      <span className="grow">{error}</span>
      {(kind === "login" || kind === "checkpoint") && (
        <Link className="btn btn-ghost btn-sm" href="/feed">
          Conectar
        </Link>
      )}
    </div>
  );
}
