// A sessão do Instagram (cookies) fica gravada cifrada (AES-GCM) com uma
// chave derivada do TOSO_SERVER_SECRET. Quem abrir o painel ou um export do
// Convex vê só texto embaralhado.

async function key(): Promise<CryptoKey> {
  const secret = process.env.TOSO_SERVER_SECRET;
  if (!secret || secret.length < 32) throw new Error("TOSO_SERVER_SECRET não configurado no Convex.");
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`instagram-vault:${secret}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function seal(value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(JSON.stringify(value))));
  return `${b64(iv)}.${b64(ct)}`;
}

export async function open<T>(sealed: string): Promise<T> {
  const [iv, ct] = sealed.split(".");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(), unb64(ct));
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}
