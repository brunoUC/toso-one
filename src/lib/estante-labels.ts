// Rótulos da Estante, usados no servidor e no navegador.

export type Kind = "book" | "movie" | "series";
export type Status = "want" | "doing" | "done" | "dropped";

export const KIND_LABEL: Record<Kind, string> = { book: "Livro", movie: "Filme", series: "Série" };

export function statusLabel(kind: Kind, status: Status): string {
  const book = kind === "book";
  switch (status) {
    case "want":
      return book ? "Quero ler" : "Quero ver";
    case "doing":
      return book ? "Lendo" : "Vendo";
    case "done":
      return book ? "Lido" : kind === "movie" ? "Visto" : "Vista";
    case "dropped":
      return "Larguei";
  }
}

export const STATUSES: Status[] = ["want", "doing", "done", "dropped"];

export const TABS = [
  { id: "ler", label: "Ler", icon: "book" },
  { id: "assistir", label: "Assistir", icon: "film" },
  { id: "lidos", label: "Lidos", icon: "check" },
  { id: "vistos", label: "Vistos", icon: "check" },
  { id: "destaques", label: "Highlights", icon: "quote" },
] as const;

export type TabId = (typeof TABS)[number]["id"];
