// As funções do Convex são públicas por natureza: qualquer um com a URL do
// deployment pode chamá-las. Por isso toda função exige o segredo que só o
// servidor do Next conhece (TOSO_SERVER_SECRET, cadastrado nos dois lados).
export function assertServer(secret: string): void {
  const expected = process.env.TOSO_SERVER_SECRET;
  if (!expected || expected.length < 32) {
    throw new Error("TOSO_SERVER_SECRET não configurado no Convex.");
  }
  if (secret.length !== expected.length) throw new Error("Acesso negado.");
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= secret.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) throw new Error("Acesso negado.");
}
