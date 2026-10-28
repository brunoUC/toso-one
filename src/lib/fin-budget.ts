// Orçamento pessoal: cada linha junta categorias do extrato e tem um limite
// mensal. Os limites saíram do histórico das contas (out/25–out/26) cruzado
// com os valores fixos que o Bruno informou; dá para mudar cada um na
// própria página (ficam guardados no Convex, finBudget).

export type BudgetKind = "fixo" | "variável" | "reserva";

export type BudgetLine = {
  id: string;
  name: string;
  section: string;
  kind: BudgetKind;
  categories: string[];
  limit: number;
  note: string;
};

export const BUDGET_TARGET = { min: 14_000, max: 17_000 };

export const BUDGET: BudgetLine[] = [
  // Casa
  { id: "condominio", section: "Casa", kind: "fixo", name: "Condomínio e imobiliária", categories: ["condominio", "aluguel"], limit: 2_150, note: "Condomínio de R$ 1.800 mais o que a imobiliária cobra junto; o boleto da Vila Rica tem ficado em R$ 2,1 mil." },
  { id: "faxina", section: "Casa", kind: "fixo", name: "Faxina", categories: ["servicos-domesticos"], limit: 1_800, note: "Valor informado. Os PIX para a diarista entram aqui depois de classificados." },
  { id: "energia", section: "Casa", kind: "fixo", name: "Energia e gás", categories: ["energia", "gas"], limit: 500, note: "Energia R$ 400 informada; RGE tem dado R$ 360–580 e o gás uns R$ 100." },
  { id: "internet", section: "Casa", kind: "fixo", name: "Internet e celular", categories: ["internet-tv", "celular"], limit: 350, note: "Internet R$ 150 mais a Claro (cerca de R$ 195)." },
  { id: "casa", section: "Casa", kind: "variável", name: "Casa: manutenção e utilidades", categories: ["manutencao-casa", "casa-utilidades"], limit: 200, note: "Eletricista, reparos, utensílios." },

  // Comida
  { id: "mercado", section: "Alimentação", kind: "variável", name: "Supermercado e rancho", categories: ["mercado"], limit: 1_500, note: "Valor informado; nos últimos 6 meses a média foi R$ 1 mil." },
  { id: "fora", section: "Alimentação", kind: "variável", name: "Restaurantes, bares e delivery", categories: ["restaurantes", "bares", "delivery", "padaria-cafe"], limit: 1_800, note: "O maior gasto variável: R$ 2,6 mil/mês no ano e R$ 4,1 mil nos últimos 6 meses (com viagem). O limite é o que você propôs." },

  // Vida
  { id: "pet", section: "Pessoal", kind: "variável", name: "Cachorro", categories: ["pet"], limit: 700, note: "R$ 600 informados; ração e pet shop têm dado R$ 460–690." },
  { id: "esporte", section: "Pessoal", kind: "fixo", name: "Clube, tênis e saúde", categories: ["academia-esportes", "bem-estar", "farmacia", "consultas-exames", "dentista", "plano-saude"], limit: 600, note: "Clube e aulas R$ 350 mais farmácia e consultas." },
  { id: "pessoal", section: "Pessoal", kind: "variável", name: "Cuidados, cursos e livros", categories: ["beleza", "cursos", "escola-faculdade", "livros"], limit: 200, note: "" },

  // Carro
  { id: "seguros", section: "Carro e seguros", kind: "fixo", name: "Seguros (carro e vida)", categories: ["seguro-veiculo", "seguros"], limit: 1_300, note: "Carro R$ 9 mil/ano (R$ 750) mais o seguro de vida da Prudential (R$ 6,6 mil/ano)." },
  { id: "carro", section: "Carro e seguros", kind: "variável", name: "Combustível, estacionamento e Uber", categories: ["combustivel", "estacionamento-pedagio", "apps-transporte", "transporte-publico"], limit: 650, note: "Histórico de R$ 640/mês somando tudo." },
  { id: "reserva-carro", section: "Carro e seguros", kind: "reserva", name: "Reserva: IPVA e manutenção", categories: ["ipva", "manutencao-veiculo", "multas"], limit: 400, note: "Guardar todo mês para não pesar quando vier. Manutenção custou R$ 7 mil no ano." },

  // Variáveis grandes
  { id: "viagens", section: "Viagens, compras e lazer", kind: "reserva", name: "Viagens", categories: ["viagens-passagens", "viagens-hospedagem", "viagens-outros", "aluguel-carro", "iof"], limit: 2_000, note: "R$ 24 mil/ano. No último ano foram cerca de R$ 115 mil com hotéis, câmbio e carro (inclui o IOF das compras fora)." },
  { id: "compras", section: "Viagens, compras e lazer", kind: "variável", name: "Compras", categories: ["compras-online", "roupas", "eletronicos", "outras-compras", "presentes"], limit: 1_300, note: "R$ 7,5 mil/mês no ano, puxado por viagem e por peças que parecem da stemOS. Classifique as da equipe como stemOS e elas saem daqui." },
  { id: "lazer", section: "Viagens, compras e lazer", kind: "variável", name: "Festas, shows e hobbies", categories: ["eventos-cultura", "hobbies", "apostas"], limit: 400, note: "Planilha: festas R$ 910 e lazer R$ 313." },
  { id: "assinaturas", section: "Viagens, compras e lazer", kind: "fixo", name: "Assinaturas e software pessoal", categories: ["streaming", "apps-software", "outras-assinaturas"], limit: 500, note: "As do cartão somam R$ 1,4–1,65 mil, mas parte é da stemOS (Vercel, Anthropic...). Marque essas como stemOS." },

  // Resto
  { id: "financeiro", section: "Outros", kind: "fixo", name: "Tarifas e impostos", categories: ["tarifas-bancarias", "anuidade-cartao", "juros-multas", "iptu", "imposto-renda", "inss-das", "outros-impostos"], limit: 200, note: "Tarifa do Santander R$ 100. Juros e encargos (R$ 1,7 mil no ano) deveriam ser zero." },
  { id: "outros", section: "Outros", kind: "variável", name: "Pessoas, doações e imprevistos", categories: ["pix-pessoas", "doacoes", "saque", "outros", "emprestimos"], limit: 350, note: "" },
];

// Categoria → linha (as que não estão em nenhuma linha aparecem em "fora do
// orçamento", como "a classificar" e as categorias criadas por você).
export const LINE_OF = new Map(BUDGET.flatMap((l) => l.categories.map((c) => [c, l.id] as const)));
