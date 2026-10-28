"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// Busca do extrato que filtra enquanto digita (sem apertar Filtrar).
export function LiveSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(initial);

  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (q.trim()) next.set("q", q.trim());
      else next.delete("q");
      router.replace(`${pathname}?${next}`, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [q, params, pathname, router]);

  return <input className="ed-input" name="q" type="search" placeholder="Buscar loja, pessoa ou descrição" value={q} onChange={(e) => setQ(e.target.value)} />;
}
