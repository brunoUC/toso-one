// Tipos e utilidades do Feed que servem tanto ao servidor quanto às telas.

export type FeedMedia = { type: "image" | "video" | string; url: string; video?: string; w: number; h: number };
export type FeedPost = {
  mediaId: string;
  code: string;
  ownerPk: string;
  username: string;
  fullName: string;
  pic: string;
  takenAt: number;
  kind: "photo" | "video" | "carousel" | "reel" | string;
  caption: string;
  items: FeedMedia[];
  location?: { pk: string; name: string };
  likes?: number;
  comments?: number;
};
export type FeedUser = { pk: string; username: string; fullName: string; pic: string; isPrivate: boolean; isVerified: boolean };
export type FeedProfile = FeedUser & {
  bio: string;
  link?: string;
  category?: string;
  followers?: number;
  following?: number;
  posts?: number;
  followedByMe: boolean;
};
export type FeedSearch = {
  users: FeedUser[];
  places: { pk: string; name: string; address: string }[];
  tags: { name: string; count: number }[];
};

// As fotos do Instagram não abrem embutidas em outro site, então passam
// pelo nosso servidor (/api/feed/midia, só para quem está logado).
export const media = (url: string) => (url ? `/api/feed/midia?u=${encodeURIComponent(url)}` : "");

export const igLink = (code: string) => `https://www.instagram.com/p/${code}/`;

const TZ = "America/Sao_Paulo";
export function postAge(ms: number, now = Date.now()): string {
  const min = Math.round((now - ms) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return d === 1 ? "ontem" : `${d} dias`;
  const sameYear = new Date(ms).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: TZ })
    .format(ms)
    .replace(".", "")
    .replace(/ de /g, " ");
}

export const count = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi` : n >= 1e4 ? `${(n / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : n.toLocaleString("pt-BR");
