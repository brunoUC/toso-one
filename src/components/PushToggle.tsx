"use client";

import { useEffect, useState } from "react";

// Ativa as notificações neste aparelho: registra o service worker, pede a
// permissão e manda a assinatura para o servidor. No iPhone só existe com o
// toso one aberto pela Tela de Início (iOS 16.4+).

type Device = { endpoint: string; deviceName: string; createdAt: number; lastOkAt: number | null };
type State = "loading" | "unsupported" | "ios-browser" | "denied" | "off" | "on";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "America/Sao_Paulo" });

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function deviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android";
  return "Navegador";
}

async function api(body?: Record<string, unknown>) {
  const res = await fetch("/api/push", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? "Não deu certo.");
  return out;
}

export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [devices, setDevices] = useState<Device[]>([]);
  const [mine, setMine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const ios = /iPhone|iPad/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(ios && !standalone ? "ios-browser" : "unsupported");
        return;
      }
      try {
        const { devices } = (await api()) as { devices: Device[] };
        setDevices(devices);
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = await reg?.pushManager.getSubscription();
        setMine(sub?.endpoint ?? null);
        if (Notification.permission === "denied") setState("denied");
        else setState(sub && devices.some((d) => d.endpoint === sub.endpoint) ? "on" : "off");
      } catch (err) {
        setMsg((err as Error).message);
        setState("off");
      }
    })();
  }, []);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const { publicKey } = (await api()) as { publicKey: string };
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await api({ action: "subscribe", endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, deviceName: deviceName() });
      const { devices } = (await api()) as { devices: Device[] };
      setDevices(devices);
      setMine(json.endpoint);
      setState("on");
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disable(endpoint: string) {
    setBusy(true);
    setMsg(null);
    try {
      if (endpoint === mine) {
        const reg = await navigator.serviceWorker.getRegistration("/");
        await (await reg?.pushManager.getSubscription())?.unsubscribe();
        setMine(null);
        setState("off");
      }
      await api({ action: "unsubscribe", endpoint });
      setDevices((d) => d.filter((x) => x.endpoint !== endpoint));
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    try {
      const r = (await api({ action: "test" })) as { sent: number; devices: number; failed: string[] };
      setMsg(r.sent ? `Enviado para ${r.sent} de ${r.devices} aparelho${r.devices === 1 ? "" : "s"}.` : `Não chegou a nenhum aparelho. ${r.failed.join(" ")}`);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {devices.length > 0 && (
        <ul className="keys">
          {devices.map((d) => (
            <li key={d.endpoint}>
              <span className="grow">
                {d.deviceName}
                {d.endpoint === mine ? " (este)" : ""}
                <span className="meta">
                  {" "}
                  · desde {dateFmt.format(d.createdAt)}
                  {d.lastOkAt ? ` · última entrega ${dateFmt.format(d.lastOkAt)}` : ""}
                </span>
              </span>
              <button className="btn btn-danger btn-sm" type="button" onClick={() => disable(d.endpoint)} disabled={busy}>
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
      {state === "ios-browser" && (
        <p className="form-note">
          No iPhone, as notificações só funcionam com o toso one na Tela de Início: no Safari, toque em Compartilhar → Adicionar à Tela de Início, abra por
          lá e volte aqui.
        </p>
      )}
      {state === "unsupported" && <p className="form-note">Este navegador não recebe notificações.</p>}
      {state === "denied" && <p className="form-note">As notificações estão bloqueadas para o toso one. Libere nos ajustes do aparelho e volte aqui.</p>}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: devices.length ? 12 : 0 }}>
        {state === "off" && (
          <button className="btn btn-primary btn-sm" type="button" onClick={enable} disabled={busy}>
            {busy ? "Ativando…" : "Ativar notificações neste aparelho"}
          </button>
        )}
        {devices.length > 0 && (
          <button className="btn btn-ghost btn-sm" type="button" onClick={test} disabled={busy}>
            Mandar um teste
          </button>
        )}
      </div>
      {msg && <p className="form-note">{msg}</p>}
    </>
  );
}
