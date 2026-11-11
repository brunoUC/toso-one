// Cliente mínimo do Instagram pela API web (a mesma que o instagram.com usa
// no navegador), com a sessão da conta dele. Não existe API oficial que
// devolva o feed de quem você segue, então o toso one monta o próprio feed:
// lê a lista de quem ele segue e, aos poucos, os posts recentes de cada um.
// Nada de sugeridos, anúncios ou algoritmo: só quem ele segue, por data.
//
// Ritmo de propósito lento (ver sync.ts): o Instagram derruba sessões que
// fazem pedidos demais. Curtir e comentar só acontecem quando ele toca no
// botão; nada aqui segue ninguém nem age sozinho.

export const IG = "https://www.instagram.com";
const APP_ID = "936619743392459"; // app web do Instagram
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";

export type Jar = Record<string, string>;

// ── Cookies ────────────────────────────────────────────────────────────────

function setCookies(res: Response): string[] {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === "function") return h.getSetCookie();
  const raw = res.headers.get("set-cookie");
  // Sem getSetCookie, os cookies chegam colados por vírgula; a data do
  // "expires" também tem vírgula, então só corta antes de "nome=".
  return raw ? raw.split(/,(?=\s*[A-Za-z0-9_.-]+=)/) : [];
}

export function mergeCookies(jar: Jar, res: Response): boolean {
  let changed = false;
  for (const line of setCookies(res)) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    // O valor volta exatamente como veio (o "rur" vem entre aspas, com barras).
    const value = pair.slice(eq + 1).trim();
    const expired = !value || value === '""' || /max-age=0\b/i.test(line) || /expires=Thu, 01[- ]Jan[- ]1970/i.test(line);
    if (expired) {
      if (name in jar && name !== "sessionid") {
        delete jar[name];
        changed = true;
      }
      continue;
    }
    if (jar[name] !== value) {
      jar[name] = value;
      changed = true;
    }
  }
  return changed;
}

const cookieHeader = (jar: Jar) =>
  Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

function randomToken(len = 32): string {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

// O sessionid começa com o id da conta ("12345%3Aabc…").
export function jarFromSessionId(sessionid: string): Jar {
  const clean = decodeURIComponent(sessionid.trim().replace(/^sessionid=/, "").replace(/;.*$/, "").replace(/^"|"$/g, ""));
  const uid = clean.split(":")[0];
  if (!/^\d{3,}$/.test(uid)) throw new Error("Isso não parece um sessionid do Instagram (ele começa com números e dois-pontos).");
  return { sessionid: encodeURIComponent(clean), ds_user_id: uid, csrftoken: randomToken() };
}

export const userIdOf = (jar: Jar) => jar.ds_user_id ?? decodeURIComponent(jar.sessionid ?? "").split(":")[0];

// ── Pedidos ────────────────────────────────────────────────────────────────

export class IgError extends Error {
  constructor(
    message: string,
    public kind: "login" | "checkpoint" | "rate" | "notfound" | "other",
  ) {
    super(message);
  }
}

function headers(jar: Jar, extra: Record<string, string> = {}): Record<string, string> {
  return {
    "User-Agent": UA,
    Accept: "*/*",
    "Accept-Language": "pt-BR,pt;q=0.9",
    "X-IG-App-ID": APP_ID,
    "X-Requested-With": "XMLHttpRequest",
    "X-ASBD-ID": "129477",
    "X-IG-WWW-Claim": "0",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
    Referer: `${IG}/`,
    Origin: IG,
    ...(jar.csrftoken ? { "X-CSRFToken": jar.csrftoken } : {}),
    ...(Object.keys(jar).length ? { Cookie: cookieHeader(jar) } : {}),
    ...extra,
  };
}

type Body = Record<string, unknown> & { message?: string; status?: string; checkpoint_url?: string; spam?: boolean; require_login?: boolean };

// Onde e o que o Instagram respondeu, para o aviso dizer o motivo real.
const detail = (status: number, path: string, extra = "") => ` (${status} em ${path.split("?")[0].replace(/\/\d{4,}\//g, "/…/")}${extra ? `: ${extra.slice(0, 80)}` : ""})`;

function classify(status: number, body: Body | null, path = ""): IgError | null {
  const msg = String(body?.message ?? "");
  const where = detail(status, path, msg);
  if (status === 429 || /wait a few minutes|try again later|rate limit/i.test(msg) || body?.spam) {
    return new IgError("O Instagram pediu uma pausa (muitos pedidos). O toso one espera e tenta de novo sozinho.", "rate");
  }
  if (msg === "checkpoint_required" || msg === "challenge_required" || body?.checkpoint_url) {
    return new IgError(`O Instagram quer confirmar que é você. Abra o app do Instagram, toque em “Fui eu” e conecte de novo${where}.`, "checkpoint");
  }
  if (status === 401 || msg === "login_required" || body?.require_login === true || (status === 403 && /login|session/i.test(msg))) {
    return new IgError(`A sessão do Instagram expirou. Conecte de novo${where}.`, "login");
  }
  if (status === 404 || /not authorized to view|user not found|no longer available/i.test(msg)) return new IgError(`Não encontrado no Instagram${where}.`, "notfound");
  if (status >= 400 || body?.status === "fail") return new IgError(`O Instagram recusou o pedido${where}.`, "other");
  return null;
}

export async function igGet<T>(jar: Jar, path: string): Promise<T> {
  const res = await fetch(`${IG}${path}`, { headers: headers(jar), redirect: "manual" });
  mergeCookies(jar, res);
  if (res.status >= 300 && res.status < 400) {
    const to = res.headers.get("location") ?? "";
    const short = to.replace(/^https:\/\/www\.instagram\.com/, "").split("?")[0];
    if (/challenge|checkpoint/.test(to)) throw new IgError(`O Instagram quer confirmar que é você. Abra o app do Instagram e conecte de novo${detail(res.status, path, `→ ${short}`)}.`, "checkpoint");
    if (/accounts\/login/.test(to)) throw new IgError(`A sessão do Instagram expirou. Conecte de novo${detail(res.status, path, `→ ${short}`)}.`, "login");
    throw new IgError(`O Instagram redirecionou o pedido${detail(res.status, path, `→ ${short}`)}.`, "other");
  }
  if (res.status === 429) {
    throw new IgError(`O Instagram pediu uma pausa (muitos pedidos). Espere alguns minutos e tente de novo${detail(429, path)}.`, "rate");
  }
  const text = await res.text();
  let body: Body | null = null;
  try {
    body = JSON.parse(text) as Body;
  } catch {
    // HTML no lugar de JSON: só é "deslogado" se a página diz isso (toda
    // página do Instagram tem links para /accounts/login, logado ou não).
    throw /class="[^"]*\bnot-logged-in\b/.test(text.slice(0, 6000))
      ? new IgError(`A sessão do Instagram expirou. Conecte de novo${detail(res.status, path, "página de deslogado")}.`, "login")
      : new IgError(`Resposta inesperada do Instagram${detail(res.status, path, "HTML no lugar de JSON")}.`, "other");
  }
  const err = classify(res.status, body, path);
  if (err) throw err;
  return body as T;
}

async function igPost<T>(jar: Jar, path: string, form: Record<string, string>, referer = `${IG}/accounts/login/`): Promise<{ status: number; body: T & Body }> {
  const res = await fetch(`${IG}${path}`, {
    method: "POST",
    headers: headers(jar, { "Content-Type": "application/x-www-form-urlencoded", Referer: referer }),
    body: new URLSearchParams(form).toString(),
    redirect: "manual",
  });
  mergeCookies(jar, res);
  const body = (await res.json().catch(() => ({}))) as T & Body;
  return { status: res.status, body };
}

// ── Login ──────────────────────────────────────────────────────────────────

export type LoginResult =
  | { kind: "ok"; jar: Jar }
  | { kind: "twoFactor"; jar: Jar; identifier: string; username: string; method: string }
  | { kind: "error"; message: string };

type LoginBody = {
  authenticated?: boolean;
  user?: boolean;
  userId?: string;
  two_factor_required?: boolean;
  two_factor_info?: { two_factor_identifier: string; username: string; sms_two_factor_on?: boolean; totp_two_factor_on?: boolean; obfuscated_phone_number?: string };
  error_type?: string;
};

function loginOutcome(status: number, body: LoginBody & Body, jar: Jar): LoginResult {
  if (body.authenticated && jar.sessionid) {
    if (!jar.ds_user_id && body.userId) jar.ds_user_id = String(body.userId);
    return { kind: "ok", jar };
  }
  if (body.two_factor_required && body.two_factor_info) {
    const info = body.two_factor_info;
    return {
      kind: "twoFactor",
      jar,
      identifier: info.two_factor_identifier,
      username: info.username,
      method: info.totp_two_factor_on ? "o app autenticador" : info.obfuscated_phone_number ? `o SMS para ${info.obfuscated_phone_number}` : "o código de confirmação",
    };
  }
  if (body.message === "checkpoint_required" || body.checkpoint_url) {
    return {
      kind: "error",
      message: "O Instagram quer confirmar que é você. Abra o app do Instagram, toque em “Fui eu” e tente de novo em alguns minutos. Se insistir, use o plano B (sessionid).",
    };
  }
  if (body.authenticated === false) return { kind: "error", message: body.user === false ? "Usuário não encontrado." : "Senha incorreta." };
  if (status === 429 || /wait/i.test(String(body.message ?? ""))) return { kind: "error", message: "O Instagram pediu para esperar alguns minutos antes de tentar de novo." };
  return { kind: "error", message: String(body.message || `O Instagram recusou a entrada (${status}). Tente o plano B (sessionid).`) };
}

export async function login(username: string, password: string): Promise<LoginResult> {
  const jar: Jar = {};
  // Primeira visita: o Instagram entrega csrftoken, mid e ig_did.
  const first = await fetch(`${IG}/accounts/login/`, { headers: { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9" }, redirect: "manual" });
  mergeCookies(jar, first);
  jar.csrftoken ??= randomToken();
  const now = Math.floor(Date.now() / 1000);
  const { status, body } = await igPost<LoginBody>(jar, "/api/v1/web/accounts/login/ajax/", {
    username,
    enc_password: `#PWD_INSTAGRAM_BROWSER:0:${now}:${password}`,
    queryParams: "{}",
    optIntoOneTap: "false",
    trustedDeviceRecords: "{}",
  });
  return loginOutcome(status, body, jar);
}

export async function twoFactor(jar: Jar, username: string, identifier: string, code: string): Promise<LoginResult> {
  const { status, body } = await igPost<LoginBody>(jar, "/api/v1/web/accounts/login/ajax/two_factor/", {
    username,
    identifier,
    verificationCode: code.replace(/\D/g, ""),
    queryParams: "{}",
    trust_signal: "true",
  });
  return loginOutcome(status, body, jar);
}

// ── Formatos ───────────────────────────────────────────────────────────────

export type IgUser = { pk: string; username: string; fullName: string; pic: string; isPrivate: boolean; isVerified: boolean };

export type MediaItem = { type: "image" | "video"; url: string; video?: string; w: number; h: number };
export type Post = {
  mediaId: string;
  code: string;
  ownerPk: string;
  username: string;
  fullName: string;
  pic: string;
  takenAt: number; // ms
  kind: "photo" | "video" | "carousel" | "reel";
  caption: string;
  items: MediaItem[];
  location?: { pk: string; name: string };
  likes?: number;
  comments?: number;
  liked?: boolean;
};

type RawCandidate = { url: string; width: number; height: number };
type RawMedia = {
  pk?: string | number;
  id?: string;
  code?: string;
  taken_at?: number;
  media_type?: number;
  product_type?: string;
  caption?: { text?: string } | null;
  image_versions2?: { candidates?: RawCandidate[] };
  video_versions?: RawCandidate[];
  carousel_media?: RawMedia[];
  original_width?: number;
  original_height?: number;
  location?: { pk?: string | number; name?: string } | null;
  like_count?: number;
  has_liked?: boolean;
  comment_count?: number;
  like_and_view_counts_disabled?: boolean;
  user?: RawUser;
  owner?: RawUser;
  is_paid_partnership?: boolean;
  ad_id?: string;
};
type RawUser = { pk?: string | number; pk_id?: string; id?: string; username?: string; full_name?: string; profile_pic_url?: string; is_private?: boolean; is_verified?: boolean };

export function toUser(u: RawUser): IgUser {
  return {
    pk: String(u.pk ?? u.pk_id ?? u.id ?? ""),
    username: u.username ?? "",
    fullName: u.full_name ?? "",
    pic: u.profile_pic_url ?? "",
    isPrivate: Boolean(u.is_private),
    isVerified: Boolean(u.is_verified),
  };
}

// A menor imagem com pelo menos 1080 de largura (ou a maior que houver):
// nítida no iPhone sem baixar o arquivo gigante.
function bestImage(cands: RawCandidate[] | undefined): RawCandidate | null {
  if (!cands?.length) return null;
  const sorted = [...cands].sort((a, b) => a.width - b.width);
  return sorted.find((c) => c.width >= 1080) ?? sorted[sorted.length - 1];
}

function mediaItem(m: RawMedia): MediaItem | null {
  const img = bestImage(m.image_versions2?.candidates);
  if (!img) return null;
  const video = m.video_versions?.length ? [...m.video_versions].sort((a, b) => a.width - b.width).find((v) => v.width >= 720) ?? m.video_versions[0] : null;
  return {
    type: video ? "video" : "image",
    url: img.url,
    ...(video ? { video: video.url } : {}),
    w: m.original_width ?? img.width,
    h: m.original_height ?? img.height,
  };
}

export function toPost(m: RawMedia, fallbackUser?: RawUser): Post | null {
  if (!m.code || !m.taken_at || m.ad_id) return null;
  const u = toUser(m.user ?? m.owner ?? fallbackUser ?? {});
  const items = m.carousel_media?.length ? m.carousel_media.map(mediaItem).filter((x): x is MediaItem => x !== null) : [mediaItem(m)].filter((x): x is MediaItem => x !== null);
  if (items.length === 0) return null;
  const kind: Post["kind"] = m.product_type === "clips" ? "reel" : m.media_type === 8 ? "carousel" : m.media_type === 2 ? "video" : "photo";
  const hide = m.like_and_view_counts_disabled;
  return {
    mediaId: String(m.pk ?? (String(m.id ?? "").split("_")[0] || m.code)),
    code: m.code,
    ownerPk: u.pk,
    username: u.username,
    fullName: u.fullName,
    pic: u.pic,
    takenAt: m.taken_at * 1000,
    kind,
    caption: (m.caption?.text ?? "").slice(0, 2200),
    items: items.slice(0, 20),
    ...(m.location?.name ? { location: { pk: String(m.location.pk ?? ""), name: m.location.name } } : {}),
    ...(!hide && typeof m.like_count === "number" ? { likes: m.like_count } : {}),
    ...(typeof m.comment_count === "number" ? { comments: m.comment_count } : {}),
    ...(typeof m.has_liked === "boolean" ? { liked: m.has_liked } : {}),
  };
}

// Respostas de local e hashtag vêm em "seções" com formatos que mudam; em
// vez de seguir um caminho fixo, recolhe toda mídia que aparecer.
export function collectMedia(node: unknown, out: RawMedia[] = [], depth = 0): RawMedia[] {
  if (depth > 12 || node === null || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const x of node) collectMedia(x, out, depth + 1);
    return out;
  }
  const o = node as Record<string, unknown>;
  if (typeof o.code === "string" && typeof o.taken_at === "number" && (o.image_versions2 || o.carousel_media)) {
    out.push(o as RawMedia);
    return out;
  }
  for (const v of Object.values(o)) collectMedia(v, out, depth + 1);
  return out;
}

// ── Endpoints ──────────────────────────────────────────────────────────────

// Quem é a conta conectada. Usa as rotas da própria página web (as do app
// de celular respondem 429 a quem chama como navegador). Se o Instagram
// recusar por excesso de pedidos, devolve só o id e o usuário que já se
// sabe: a sessão vale do mesmo jeito e o resto se completa depois.
export async function me(jar: Jar, usernameHint?: string): Promise<IgUser> {
  const pk = userIdOf(jar);
  let username = usernameHint ?? "";
  try {
    if (!username) {
      const r = await igGet<{ form_data?: { username?: string } }>(jar, "/api/v1/accounts/edit/web_form_data/");
      username = r.form_data?.username ?? "";
    }
    if (username) {
      const p = await profile(jar, username);
      return { pk: p.pk || pk, username: p.username, fullName: p.fullName, pic: p.pic, isPrivate: p.isPrivate, isVerified: p.isVerified };
    }
  } catch (err) {
    // Só o pedido de confirmação ("Fui eu") barra a conexão. Qualquer outra
    // recusa aqui não descarta uma sessão recém-criada: se ela não valer
    // mesmo, a primeira leitura mostra o motivo exato.
    if (err instanceof IgError && err.kind === "checkpoint") throw err;
    console.warn("Feed: não deu para ler o perfil da conta conectada:", (err as Error).message);
  }
  return { pk, username: username || pk, fullName: "", pic: "", isPrivate: false, isVerified: false };
}

// Segunda opinião antes de dar a sessão por perdida: uma recusa num perfil
// ou numa rota específica não pode derrubar tudo.
export async function stillLoggedIn(jar: Jar): Promise<boolean> {
  try {
    const r = await igGet<{ form_data?: { username?: string } }>(jar, "/api/v1/accounts/edit/web_form_data/");
    return Boolean(r.form_data);
  } catch (err) {
    return !(err instanceof IgError && err.kind === "login");
  }
}

export async function followingPage(jar: Jar, maxId?: string): Promise<{ users: IgUser[]; next?: string }> {
  const uid = userIdOf(jar);
  const q = new URLSearchParams({ count: "50" });
  if (maxId) q.set("max_id", maxId);
  const r = await igGet<{ users?: RawUser[]; next_max_id?: string | number | null }>(jar, `/api/v1/friendships/${uid}/following/?${q}`);
  return { users: (r.users ?? []).map(toUser).filter((u) => u.pk && u.username), next: r.next_max_id ? String(r.next_max_id) : undefined };
}

export async function userFeed(jar: Jar, pk: string, maxId?: string, count = 12): Promise<{ posts: Post[]; next?: string; user?: IgUser }> {
  const q = new URLSearchParams({ count: String(count) });
  if (maxId) q.set("max_id", maxId);
  const r = await igGet<{ items?: RawMedia[]; next_max_id?: string | null; more_available?: boolean; user?: RawUser }>(jar, `/api/v1/feed/user/${pk}/?${q}`);
  return {
    posts: (r.items ?? []).map((m) => toPost(m, r.user)).filter((p): p is Post => p !== null),
    next: r.more_available && r.next_max_id ? String(r.next_max_id) : undefined,
    ...(r.user ? { user: toUser(r.user) } : {}),
  };
}

export type Profile = IgUser & {
  bio: string;
  link?: string;
  category?: string;
  followers?: number;
  following?: number;
  posts?: number;
  followedByMe: boolean;
};

export async function profile(jar: Jar, username: string): Promise<Profile> {
  type R = {
    data?: {
      user?: RawUser & {
        biography?: string;
        external_url?: string | null;
        category_name?: string | null;
        profile_pic_url_hd?: string;
        followed_by_viewer?: boolean;
        edge_followed_by?: { count: number };
        edge_follow?: { count: number };
        edge_owner_to_timeline_media?: { count: number };
      } | null;
    };
  };
  const r = await igGet<R>(jar, `/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`);
  const u = r.data?.user;
  if (!u) throw new IgError("Perfil não encontrado.", "notfound");
  return {
    ...toUser(u),
    pic: u.profile_pic_url_hd ?? u.profile_pic_url ?? "",
    bio: u.biography ?? "",
    ...(u.external_url ? { link: u.external_url } : {}),
    ...(u.category_name ? { category: u.category_name } : {}),
    followers: u.edge_followed_by?.count,
    following: u.edge_follow?.count,
    posts: u.edge_owner_to_timeline_media?.count,
    followedByMe: Boolean(u.followed_by_viewer),
  };
}

export type SearchResult = {
  users: IgUser[];
  places: { pk: string; name: string; address: string }[];
  tags: { name: string; count: number }[];
};

export async function search(jar: Jar, query: string): Promise<SearchResult> {
  type R = {
    users?: { user: RawUser }[];
    places?: { place: { title?: string; subtitle?: string; location?: { pk?: string | number; name?: string; address?: string; city?: string } } }[];
    hashtags?: { hashtag: { name: string; media_count?: number } }[];
  };
  const q = new URLSearchParams({ context: "blended", query, include_reel: "false" });
  const r = await igGet<R>(jar, `/api/v1/web/search/topsearch/?${q}`);
  return {
    users: (r.users ?? []).map((x) => toUser(x.user)).filter((u) => u.username),
    places: (r.places ?? [])
      .map(({ place }) => ({
        pk: String(place.location?.pk ?? ""),
        name: place.title || place.location?.name || "",
        address: place.subtitle || [place.location?.address, place.location?.city].filter(Boolean).join(", "),
      }))
      .filter((p) => p.pk && p.name),
    tags: (r.hashtags ?? []).map(({ hashtag }) => ({ name: hashtag.name, count: hashtag.media_count ?? 0 })),
  };
}

export async function place(jar: Jar, pk: string): Promise<{ name: string; address: string; posts: Post[] }> {
  type R = { native_location_data?: { location_info?: { name?: string; location_address?: string; location_city?: string } } };
  const r = await igGet<R>(jar, `/api/v1/locations/web_info/?location_id=${encodeURIComponent(pk)}&show_nearby=false`);
  const info = r.native_location_data?.location_info;
  return {
    name: info?.name ?? "",
    address: [info?.location_address, info?.location_city].filter(Boolean).join(", "),
    posts: uniquePosts(collectMedia(r)),
  };
}

export async function tag(jar: Jar, name: string): Promise<{ name: string; count: number; posts: Post[] }> {
  type R = { data?: { name?: string; media_count?: number } };
  const r = await igGet<R>(jar, `/api/v1/tags/web_info/?tag_name=${encodeURIComponent(name)}`);
  return { name: r.data?.name ?? name, count: r.data?.media_count ?? 0, posts: uniquePosts(collectMedia(r)) };
}

function uniquePosts(raw: RawMedia[]): Post[] {
  const seen = new Set<string>();
  const out: Post[] = [];
  for (const m of raw) {
    const p = toPost(m);
    if (!p || seen.has(p.code)) continue;
    seen.add(p.code);
    out.push(p);
  }
  return out.sort((a, b) => b.takenAt - a.takenAt);
}

// ── Curtir e comentar (só quando ele toca no botão) ─────────────────────────

async function igAct<T>(jar: Jar, path: string, form: Record<string, string>, code?: string): Promise<T> {
  const { status, body } = await igPost<T>(jar, path, form, code ? `${IG}/p/${code}/` : `${IG}/`);
  const err = classify(status, body, path);
  if (err) throw err;
  return body;
}

const mediaPath = (mediaId: string) => {
  if (!/^\d+$/.test(mediaId)) throw new IgError("Post inválido.", "other");
  return mediaId;
};

export async function like(jar: Jar, mediaId: string, on: boolean, code?: string): Promise<void> {
  await igAct(jar, `/api/v1/web/likes/${mediaPath(mediaId)}/${on ? "like" : "unlike"}/`, {}, code);
}

export type Comment = {
  pk: string;
  text: string;
  at: number; // ms
  username: string;
  pic: string;
  likes: number;
  replies: number;
  liked: boolean;
};

type RawComment = {
  pk?: string | number;
  id?: string | number;
  text?: string;
  created_at?: number;
  created_at_utc?: number;
  created_time?: number;
  user?: RawUser;
  from?: RawUser;
  comment_like_count?: number;
  child_comment_count?: number;
  has_liked_comment?: boolean;
};

function toComment(c: RawComment): Comment {
  const u = toUser(c.user ?? c.from ?? {});
  const t = c.created_at_utc ?? c.created_at ?? c.created_time ?? Date.now() / 1000;
  return {
    pk: String(c.pk ?? c.id ?? ""),
    text: c.text ?? "",
    at: t * 1000,
    username: u.username,
    pic: u.pic,
    likes: c.comment_like_count ?? 0,
    replies: c.child_comment_count ?? 0,
    liked: Boolean(c.has_liked_comment),
  };
}

// Comentários do post, dos mais relevantes para baixo como no app (o
// Instagram não deixa ordenar por data nesta rota). `cursor` = próxima página.
export async function comments(jar: Jar, mediaId: string, cursor?: string): Promise<{ comments: Comment[]; next?: string }> {
  const q = new URLSearchParams({ can_support_threading: "true", permalink_enabled: "false" });
  if (cursor) q.set("min_id", cursor);
  const r = await igGet<{ comments?: RawComment[]; next_min_id?: string | null; has_more_headload_comments?: boolean }>(
    jar,
    `/api/v1/media/${mediaPath(mediaId)}/comments/?${q}`,
  );
  return { comments: (r.comments ?? []).map(toComment).filter((c) => c.pk), ...(r.next_min_id ? { next: String(r.next_min_id) } : {}) };
}

export async function replies(jar: Jar, mediaId: string, commentPk: string): Promise<Comment[]> {
  if (!/^\d+$/.test(commentPk)) throw new IgError("Comentário inválido.", "other");
  const r = await igGet<{ child_comments?: RawComment[] }>(jar, `/api/v1/media/${mediaPath(mediaId)}/comments/${commentPk}/child_comments/?max_id=`);
  return (r.child_comments ?? []).map(toComment).filter((c) => c.pk);
}

export async function addComment(jar: Jar, mediaId: string, text: string, replyTo?: string, code?: string): Promise<Comment> {
  const form: Record<string, string> = { comment_text: text };
  if (replyTo && /^\d+$/.test(replyTo)) form.replied_to_comment_id = replyTo;
  const r = await igAct<RawComment & { status?: string }>(jar, `/api/v1/web/comments/${mediaPath(mediaId)}/add/`, form, code);
  return toComment(r);
}

export async function likeComment(jar: Jar, commentPk: string, on: boolean): Promise<void> {
  if (!/^\d+$/.test(commentPk)) throw new IgError("Comentário inválido.", "other");
  await igAct(jar, `/api/v1/web/comments/${on ? "like" : "unlike"}/${commentPk}/`, {});
}
