"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

// Mantém o tempo na cidade em que ele está. Quando o aparelho já deu
// permissão de localização, atualiza sozinho ao abrir o toso one (se andou
// mais de ~3 km ou faz mais de 3 horas). Sem permissão, nada acontece até
// ele tocar em "Usar minha localização".

const KEY = "toso-local";
type Saved = { lat: number; lon: number; at: number };

const km = (a: Saved, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180;
  const x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
};

function readSaved(): Saved | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
  } catch {
    return null;
  }
}

function usePlaceUpdate() {
  const router = useRouter();
  return useCallback(
    (force: boolean) =>
      new Promise<"ok" | "same" | "denied" | "error">((resolve) => {
        if (!("geolocation" in navigator)) return resolve("error");
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const lat = Math.round(pos.coords.latitude * 100) / 100;
            const lon = Math.round(pos.coords.longitude * 100) / 100;
            const saved = readSaved();
            if (!force && saved && km(saved, { lat, lon }) < 3 && Date.now() - saved.at < 3 * 3600_000) return resolve("same");
            const res = await fetch("/api/local", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat, lon }) }).catch(() => null);
            if (!res?.ok) return resolve("error");
            try {
              localStorage.setItem(KEY, JSON.stringify({ lat, lon, at: Date.now() }));
            } catch {}
            // Só recarrega a página se a cidade mudou de verdade.
            if (force || !saved || km(saved, { lat, lon }) >= 3) router.refresh();
            resolve("ok");
          },
          (err) => resolve(err.code === err.PERMISSION_DENIED ? "denied" : "error"),
          { maximumAge: 10 * 60_000, timeout: 15_000, enableHighAccuracy: false },
        );
      }),
    [router],
  );
}

// Fica no layout: atualização silenciosa quando a permissão já existe.
export function LocationSync() {
  const update = usePlaceUpdate();
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const st = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
        if (alive && st?.state === "granted") await update(false);
      } catch {
        // Navegador sem a API de permissões: espera o botão.
      }
    })();
    return () => {
      alive = false;
    };
  }, [update]);
  return null;
}

// Botão junto do tempo quando ainda não é o GPS do aparelho.
export function UseLocationButton({ label = "Usar minha localização" }: { label?: string }) {
  const update = usePlaceUpdate();
  const [state, setState] = useState<"idle" | "busy" | "denied" | "error">("idle");
  return (
    <button
      type="button"
      className="loc-btn"
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        const r = await update(true);
        setState(r === "denied" ? "denied" : r === "error" ? "error" : "idle");
      }}
    >
      <Icon name="pin" size={13} />
      {state === "busy" ? "Localizando…" : state === "denied" ? "Permissão negada nos ajustes do navegador" : state === "error" ? "Não deu, tente de novo" : label}
    </button>
  );
}
