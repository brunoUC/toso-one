// Categorias, e como uma movimentação ganha uma delas sem ninguém mexer.
// Arquivo puro (sem banco): o Convex usa para classificar e o Next para
// mostrar nomes e grupos.

// expense: conta como gasto (um valor positivo nela é estorno e abate o gasto)
// income:  conta como receita
// internal: dinheiro que só mudou de lugar (entre contas, fatura, aplicação).
//           Fica fora de gastos e receitas, senão a fatura do cartão contaria
//           as compras pela segunda vez.
export type Kind = "expense" | "income" | "internal";

export type Category = { slug: string; name: string; group: string; kind: Kind; tax?: boolean };

export const GROUPS = [
  "Moradia",
  "Alimentação",
  "Transporte",
  "Saúde",
  "Contas e assinaturas",
  "Compras",
  "Lazer e viagens",
  "Educação",
  "Cuidados pessoais",
  "Impostos",
  "Custos financeiros",
  "Pessoas",
  "Outros gastos",
  "Receitas",
  "Movimentações internas",
] as const;

const c = (group: string, kind: Kind, list: [string, string, true?][]): Category[] =>
  list.map(([slug, name, tax]) => ({ slug, name, group, kind, ...(tax ? { tax } : {}) }));

export const CATEGORIES: Category[] = [
  ...c("Moradia", "expense", [
    ["aluguel", "Aluguel ou financiamento"],
    ["condominio", "Condomínio"],
    ["iptu", "IPTU", true],
    ["energia", "Energia"],
    ["agua", "Água"],
    ["gas", "Gás"],
    ["internet-tv", "Internet e TV"],
    ["manutencao-casa", "Manutenção e reforma"],
    ["casa-utilidades", "Móveis e utilidades"],
    ["servicos-domesticos", "Diarista e serviços"],
  ]),
  ...c("Alimentação", "expense", [
    ["mercado", "Mercado"],
    ["restaurantes", "Restaurantes"],
    ["delivery", "Delivery"],
    ["padaria-cafe", "Padaria e café"],
    ["bares", "Bares"],
  ]),
  ...c("Transporte", "expense", [
    ["combustivel", "Combustível"],
    ["apps-transporte", "Uber, 99 e táxi"],
    ["transporte-publico", "Transporte público"],
    ["estacionamento-pedagio", "Estacionamento e pedágio"],
    ["manutencao-veiculo", "Manutenção do carro"],
    ["ipva", "IPVA e licenciamento", true],
    ["seguro-veiculo", "Seguro do carro"],
    ["aluguel-carro", "Aluguel de carro"],
    ["multas", "Multas de trânsito"],
  ]),
  ...c("Saúde", "expense", [
    ["plano-saude", "Plano de saúde"],
    ["farmacia", "Farmácia"],
    ["consultas-exames", "Consultas e exames"],
    ["dentista", "Dentista"],
    ["academia-esportes", "Academia e esportes"],
    ["bem-estar", "Terapia e bem-estar"],
  ]),
  ...c("Contas e assinaturas", "expense", [
    ["celular", "Celular"],
    ["streaming", "Streaming"],
    ["apps-software", "Apps e software"],
    ["outras-assinaturas", "Outras assinaturas"],
  ]),
  ...c("Compras", "expense", [
    ["compras-online", "Compras online"],
    ["roupas", "Roupas e calçados"],
    ["eletronicos", "Eletrônicos"],
    ["presentes", "Presentes"],
    ["pet", "Pet"],
    ["livros", "Livros"],
    ["outras-compras", "Outras compras"],
  ]),
  ...c("Lazer e viagens", "expense", [
    ["viagens-passagens", "Passagens"],
    ["viagens-hospedagem", "Hospedagem"],
    ["viagens-outros", "Viagem: outros"],
    ["eventos-cultura", "Shows, cinema e eventos"],
    ["hobbies", "Hobbies"],
    ["apostas", "Apostas"],
  ]),
  ...c("Educação", "expense", [
    ["cursos", "Cursos"],
    ["escola-faculdade", "Escola e faculdade"],
  ]),
  ...c("Cuidados pessoais", "expense", [["beleza", "Cabelo e beleza"]]),
  ...c("Impostos", "expense", [
    ["imposto-renda", "Imposto de renda", true],
    ["iof", "IOF", true],
    ["inss-das", "INSS e DAS", true],
    ["outros-impostos", "Outros impostos e taxas", true],
  ]),
  ...c("Custos financeiros", "expense", [
    ["tarifas-bancarias", "Tarifas bancárias"],
    ["juros-multas", "Juros e encargos"],
    ["anuidade-cartao", "Anuidade do cartão"],
    ["seguros", "Seguros"],
    ["emprestimos", "Empréstimos"],
  ]),
  ...c("Pessoas", "expense", [
    ["pix-pessoas", "Transferências para pessoas"],
    ["doacoes", "Doações"],
  ]),
  ...c("Outros gastos", "expense", [
    ["saque", "Saque"],
    ["outros", "Outros"],
    ["a-classificar", "A classificar"],
  ]),
  ...c("Receitas", "income", [
    ["salario", "Salário"],
    ["renda-servicos", "Serviços e pró-labore"],
    ["rendimentos", "Rendimentos"],
    ["reembolsos", "Reembolsos e estornos"],
    ["outras-receitas", "Outras receitas"],
  ]),
  ...c("Movimentações internas", "internal", [
    ["entre-contas", "Entre minhas contas"],
    ["pagamento-fatura", "Pagamento de fatura"],
    ["investimento-aplicacao", "Aplicação"],
    ["investimento-resgate", "Resgate"],
  ]),
];

export const CATEGORY = new Map(CATEGORIES.map((x) => [x.slug, x]));

export type Custom = { slug: string; name: string; group: string; kind: Kind };

export function categoryOf(slug: string, custom: Custom[] = []): Category {
  return CATEGORY.get(slug) ?? custom.find((x) => x.slug === slug) ?? CATEGORY.get("outros")!;
}

// ── Normalização ────────────────────────────────────────────────────────────

export function norm(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9&]+/g, " ")
    .trim();
}

// Tira o que muda de uma compra para outra (datas, números de parcela,
// códigos) para que "IFOOD *RESTAURANTE 123" e "IFOOD *RESTAURANTE 456"
// virem a mesma chave.
export function descriptionKey(s: string | null | undefined): string {
  return norm(s)
    .replace(/\b\d+\b/g, " ")
    .replace(/\b(PARC|PARCELA)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

export const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

// CPF/CNPJ às vezes chegam mascarados (***.123.456-**). Compara só as
// posições que os dois lados mostram.
export function sameDocument(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = (a ?? "").replace(/[^0-9*]/g, "");
  const y = (b ?? "").replace(/[^0-9*]/g, "");
  if (!x || !y) return false;
  if (x.length !== y.length) return digits(x).length >= 11 && digits(x) === digits(y);
  let shown = 0;
  for (let i = 0; i < x.length; i++) {
    if (x[i] === "*" || y[i] === "*") continue;
    if (x[i] !== y[i]) return false;
    shown++;
  }
  return shown >= 5;
}

// ── Camada 1: nomes conhecidos ──────────────────────────────────────────────
// A ordem importa: a primeira que casar vence (UBER EATS antes de UBER).

const KEYWORDS: [RegExp, string][] = [
  // dinheiro que só muda de lugar
  // XP: conta digital ↔ conta investimento são duas contas correntes dele.
  [/\bTRANSFERENCIA (ENVIADA PARA|RECEBIDA DA) (A )?CONTA (DIGITAL|INVESTIMENTO)\b/, "entre-contas"],
  [/\bGASTOS CARTAO DE CREDITO\b/, "pagamento-fatura"],
  [/\b(PAG(AMENTO|TO|T)?\.? ?(DE )?FAT(URA)?|PGTO FAT|PAG(AMENTO)? CARTAO|PAGTO POR DEB|DEB(ITO)? AUTOMATICO FATURA)\b/, "pagamento-fatura"],
  [/\b(APLICACAO|APLIC|APL (CDB|LCI|LCA|FUNDO|TESOURO)|INVEST(IMENTO)? AUTOMATICO|COMPRA (TITULO|TESOURO|CDB))\b/, "investimento-aplicacao"],
  [/\b(RESGATE|RESG|VENC(IMENTO)? (CDB|LCI|LCA|TITULO))\b/, "investimento-resgate"],
  // receitas
  [/\b(SALARIO|PAGTO SALARIO|PAG SALARIO|FOLHA( DE)? PAGAMENTO|PROVENTOS|ADIANTAMENTO SALARIAL|13 SALARIO|FERIAS)\b/, "salario"],
  [/\b(RENDIMENTO|RENDIMENTOS|DIVIDENDO|DIVIDENDOS|JCP|JUROS SOBRE CAPITAL|REMUNERACAO (DA )?CONTA)\b/, "rendimentos"],
  [/\b(ESTORNO|REEMBOLSO|CASHBACK|DEVOLUCAO|CREDITO DE AJUSTE)\b/, "reembolsos"],
  // impostos (antes das contas da casa: "IPTU" pode vir com o nome da prefeitura)
  [/\bIPTU\b/, "iptu"],
  [/\b(PREFEITURA|MUNICIPIO DE)\b/, "outros-impostos"],
  [/\b(IPVA|LICENCIAMENTO|DETRAN|DPVAT)\b/, "ipva"],
  [/\b(DARF|RECEITA FEDERAL|IRPF|IMPOSTO DE RENDA|CARNE LEAO)\b/, "imposto-renda"],
  [/\bIOF\b/, "iof"],
  [/\b(DAS SIMPLES|DAS MEI|PGTO DAS|PAGAMENTO DAS|SIMPLES NACIONAL|INSS|GPS INSS|PREVIDENCIA SOCIAL)\b/, "inss-das"],
  [/\b(MULTA DE TRANSITO|AUTO DE INFRACAO)\b/, "multas"],
  // custos financeiros
  [/\bANUIDADE\b/, "anuidade-cartao"],
  [/\b(JUROS|ENCARGOS|MORA|MULTA|ROTATIVO|CHEQUE ESPECIAL)\b/, "juros-multas"],
  [/\b(TARIFA|TAR|CESTA (DE )?SERV|PACOTE (DE )?SERV|MENSALIDADE PACOTE)\b/, "tarifas-bancarias"],
  [/\bSEGURO AUTO\b/, "seguro-veiculo"],
  [/\b(SEGURO|SEGUROS|PORTO SEGURO|MAPFRE|TOKIO MARINE|ALLIANZ|AZUL SEGUROS|YOUSE)\b/, "seguros"],
  [/\bSAQUE\b/, "saque"],
  // moradia
  [/\b(CONDOMINIO|COND\b|ADMINISTRADORA DE CONDOMINIOS|LELLO|HUBERT|ADM CONDOMINIO)/, "condominio"],
  [/\b(ALUGUEL|QUINTOANDAR|QUINTO ANDAR|IMOBILIARIA|LOFT ALUGUEL)\b/, "aluguel"],
  [/\b(ENEL|LIGHT SESA|CEMIG|COPEL|CPFL|ELETROPAULO|CELESC|EQUATORIAL|NEOENERGIA|COELBA|CELPE|ENERGISA|RGE|EDP)\b/, "energia"],
  [/\b(SABESP|CEDAE|COPASA|SANEPAR|EMBASA|COMPESA|CORSAN|CASAN|AGUAS DO|AGUAS DE|SANASA)\b/, "agua"],
  [/\b(COMGAS|NATURGY|ULTRAGAZ|LIQUIGAS|SUPERGASBRAS|COPAGAZ)\b/, "gas"],
  [/\b(NET SERVICOS|CLARO NET|SKY|VIVO FIBRA|OI FIBRA|TIM LIVE|DESKTOP|ALGAR|BRISANET|GIGA)\b/, "internet-tv"],
  [/\b(ELETRICA|ELETRICISTA|ENCANADOR|HIDRAULICA|SERRALHERIA|VIDRACARIA|CHAVEIRO|MARCENARIA|PINTOR)\b/, "manutencao-casa"],
  [/\b(BRASTEMP|CULLIGAN)\b/, "outras-assinaturas"],
  [/\b(LEROY MERLIN|TELHANORTE|C&C|TOK ?STOK|ETNA|CAMICADO|MOBLY|WESTWING|MADEIRA MADEIRA|CASAS BAHIA|PONTO FRIO|IKEA)\b/, "casa-utilidades"],
  [/\b(DIARISTA|FAXINA|PARAFUZO|DONA DE CASA|LIMPEZA)\b/, "servicos-domesticos"],
  // alimentação
  [/\b(UBER ?EATS|IFOOD|IFD|RAPPI|ZE DELIVERY|AIQFOME|JAMES DELIVERY|DAKI|JOKR)\b/, "delivery"],
  [/\b(STARBUCKS|CAFE|CAFETERIA|COFFEE|PADARIA|PANIFICADORA|PANIFICACAO|CONFEITARIA|DOCERIA|SUPLICY|FRAN S CAFE|OFNER)\b/, "padaria-cafe"],
  [/\b(CARREFOUR|PAO DE ACUCAR|EXTRA|ASSAI|ATACADAO|ZAFFARI|SAMS CLUB|ST MARCHE|SONDA|MAMBO|OBA HORTIFRUTI|HORTIFRUTI|SUPERMERCADO|SUPERMERCADOS|MERCADO(?! ?LIVRE| ?PAGO)|MERCADINHO|MINUTO PA|OXXO|DIA BRASIL|ATACADISTA|SACOLAO|EMPORIO|MAKRO|GUANABARA|PREZUNIC|MUFFATO|ANGELONI|CONDOR|SAVEGNAGO|NATURAL DA TERRA|QUITANDA)\b/, "mercado"],
  [/\b(BAR|BOTECO|CHOPERIA|CERVEJARIA|PUB|ADEGA|EMPORIO DA CERVEJA)\b/, "bares"],
  [/\b(MC ?DONALDS|BURGER KING|BK BRASIL|SUBWAY|OUTBACK|MADERO|COCO BAMBU|SPOLETO|HABIBS|GIRAFFAS|BOBS|KFC|POPEYES|RESTAURANTE|RESTAURANT|CHURRASCARIA|PIZZARIA|PIZZA|SUSHI|LANCHONETE|HAMBURGUERIA|BURGER|TEMAKERIA|CANTINA|BISTRO|GRILL|STEAKHOUSE|POKE)\b/, "restaurantes"],
  // transporte
  [/\b(UBER|99 ?APP|99 ?TECNOLOGIA|99 ?POP|99 ?TAXI|CABIFY|INDRIVE|TAXI)\b/, "apps-transporte"],
  [/\b(SHELL|IPIRANGA|PETROBRAS|POSTO|AUTO POSTO|BR MANIA|ALE COMBUSTIVEIS|RAIZEN|COMBUSTIVEL)\b/, "combustivel"],
  [/\b(SEM PARAR|CONECTCAR|VELOE|ESTAPAR|ESTACIONAMENTO|ESTACIONAMENTOS|PARKING|MULTIPARK|INDIGO|ZUL DIGITAL|AUTOPASS|PEDAGIO|ARTERIS|CCR|ECORODOVIAS)\b/, "estacionamento-pedagio"],
  [/\b(METRO|SPTRANS|BILHETE UNICO|TOP TRANSPORTE|CPTM|RIOCARD|BRT|ONIBUS)\b/, "transporte-publico"],
  [/\b(LOCALIZA|MOVIDA|UNIDAS|HERTZ|AVIS|RENTCARS|FOCO ALUGUEL)\b/, "aluguel-carro"],
  [/\b(OFICINA|AUTO CENTER|PNEUS|PNEU|LAVA RAPIDO|AUTOPECAS|AUTO PECAS|CONCESSIONARIA|REVISAO)\b/, "manutencao-veiculo"],
  // saúde
  [/\b(UNIMED|AMIL|SULAMERICA SAUDE|SUL AMERICA SAUDE|BRADESCO SAUDE|HAPVIDA|NOTREDAME|NOTRE DAME|PORTO SAUDE|PREVENT SENIOR|SEGUROS UNIMED|OMINT|CARE PLUS|ALICE OPERADORA|QSAUDE)\b/, "plano-saude"],
  [/\b(DROGASIL|DROGA RAIA|RAIA|DROGARIA|DROGARIAS|PAGUE MENOS|PANVEL|FARMACIA|FARMACIAS|ULTRAFARMA|DROGAO|ONOFRE|NISSEI|SAO JOAO FARMACIAS|EXTRAFARMA)\b/, "farmacia"],
  [/\b(ODONTO|ODONTOLOGIA|DENTISTA|ORTODONTIA)\b/, "dentista"],
  [/\b(FLEURY|DASA|DELBONI|LAVOISIER|A\+ ?MEDICINA|SABIN|HERMES PARDINI|LABORATORIO|HOSPITAL|CLINICA|CONSULTORIO|MEDICO|EINSTEIN|SIRIO LIBANES|OFTALMO|DR CONSULTA)\b/, "consultas-exames"],
  [/\b(SMART ?FIT|BLUEFIT|BLUE FIT|BODYTECH|BIO RITMO|SELFIT|GYMPASS|WELLHUB|TOTALPASS|TOTAL PASS|ACADEMIA|CROSSFIT|PILATES|YOGA|BEACH TENNIS|TENIS|PADEL)\b/, "academia-esportes"],
  [/\b(PSICOLOG|TERAPIA|ZENKLUB|PSICANAL|MASSAGEM|SPA)\b/, "bem-estar"],
  // contas e assinaturas
  [/\b(NETFLIX|SPOTIFY|DISNEY|HBO|MAX COM|PRIME VIDEO|AMAZON PRIME|AMAZONPRIME|GLOBOPLAY|YOUTUBE|DEEZER|PARAMOUNT|STAR PLUS|CRUNCHYROLL|APPLE TV|DAZN|TELECINE|MUBI|TIDAL)\b/, "streaming"],
  [/\b(APPLE COM BILL|APPLE COM|ITUNES|GOOGLE PLAY|GOOGLE ONE|GOOGLE WORKSPACE|GOOGLE CLOUD|GSUITE|MICROSOFT|MSFT|ADOBE|OPENAI|CHATGPT|ANTHROPIC|CLAUDE AI|NOTION|DROPBOX|ICLOUD|GITHUB|VERCEL|CONVEX|CANVA|FIGMA|1PASSWORD|LINKEDIN|ZOOM|SLACK|CURSOR|AWS|AMAZON WEB SERVICES|DIGITALOCEAN|NAMECHEAP|GODADDY|REGISTRO BR)\b/, "apps-software"],
  [/\b(VIVO|CLARO|TIM|OI MOVEL|NEXTEL|CORREIOS CELULAR)\b/, "celular"],
  // compras
  [/\b(AMAZON|AMZN|MERCADO ?LIVRE|MERCADOLIVRE|SHOPEE|ALIEXPRESS|MAGALU|MAGAZINE LUIZA|SHEIN|AMERICANAS|SUBMARINO|TEMU|NETSHOES|DAFITI|ZATTINI)\b/, "compras-online"],
  [/\b(ZARA|RENNER|C&A|CEA|RIACHUELO|HERING|NIKE|ADIDAS|CENTAURO|DECATHLON|AREZZO|SCHUTZ|OSKLEN|FARM RIO|LEVIS|TOMMY|LACOSTE|UNIQLO|H&M|MARISA|PERNAMBUCANAS|YOUCOM|AMARO|VANS|OLYMPIKUS|MIZUNO|ASICS)\b/, "roupas"],
  [/\b(FAST SHOP|KABUM|APPLE STORE|SAMSUNG|DELL|LENOVO|MI STORE|XIAOMI|IPLACE|PICHAU|TERABYTE)\b/, "eletronicos"],
  [/\b(PETZ|COBASI|PET ?SHOP|PETLOVE|VETERINARI\w*|DOGHERO|PETCENTER|DOGS? CLUB|CAES|PET CENTER)\b/, "pet"],
  [/\b(CORREIOS|EMPRESA BRASILEIRA DE CORREIOS)\b/, "outras-compras"],
  [/\b(LIVRARIA|SARAIVA|CULTURA|KINDLE|ESTANTE VIRTUAL|AUDIBLE)\b/, "livros"],
  [/\b(FLORICULTURA|PRESENTE|GIULIANA FLORES|CACAU SHOW|KOPENHAGEN|LINDT|VIVARA|PANDORA)\b/, "presentes"],
  // lazer e viagens
  [/\b(LATAM|TAM LINHAS|GOL LINHAS|VOEGOL|AZUL LINHAS|VOEAZUL|TAP AIR|TAP PORTUGAL|AIR FRANCE|KLM|IBERIA|LUFTHANSA|EMIRATES|QATAR|TURKISH|AMERICAN AIRLINES|UNITED|DELTA|COPA AIRLINES|AVIANCA|AEROLINEAS|ITA AIRWAYS|BRITISH AIRWAYS|SWISS|RYANAIR|EASYJET|SMILES|LATAM PASS|TUDOAZUL|DECOLAR|MAX MILHAS|123MILHAS|CLICKBUS|BUSER)\b/, "viagens-passagens"],
  [/\b(AIRBNB|BOOKING|HOTEL|HOTEIS|POUSADA|HOSTEL|ACCOR|IBIS|MARRIOTT|HILTON|HYATT|EXPEDIA|HOTELS COM|RESORT)\b/, "viagens-hospedagem"],
  [/\b(DUTY FREE|DUFRY|SEGURO VIAGEM|ASSIST CARD|WISE|NOMAD|REMESSA ONLINE|CAMBIO|CAMBIOREAL)\b/, "viagens-outros"],
  [/\b(INGRESSO|INGRESSOS|SYMPLA|EVENTIM|TICKETMASTER|TICKET 360|CINEMARK|CINEMA|CINEPOLIS|KINOPLEX|UCI|TEATRO|MUSEU|SHOW|IMAX|ZIG|BILHETERIA)\b/, "eventos-cultura"],
  [/\b(BET|BETANO|BLAZE|SPORTINGBET|BET365|BETFAIR|ESTRELABET|LOTERIA|LOTERICA|MEGA SENA|CAIXA LOTERIAS)\b/, "apostas"],
  [/\b(STEAM|PLAYSTATION|XBOX|NINTENDO|EPIC GAMES|RIOT|BLIZZARD)\b/, "hobbies"],
  // educação e cuidados
  [/\b(UDEMY|ALURA|COURSERA|HOTMART|EDUZZ|KIWIFY|DUOLINGO|ROCKETSEAT|DOMESTIKA|MASTERCLASS|CURSO|CURSOS)\b/, "cursos"],
  [/\b(ESCOLA|COLEGIO|FACULDADE|UNIVERSIDADE|MENSALIDADE ESCOLAR|INSPER|FGV|USP|PUC|MACKENZIE|ESPM|IBMEC)\b/, "escola-faculdade"],
  [/\b(BARBEARIA|BARBER|SALAO|CABELEIREIRO|CABELO|MANICURE|ESTETICA|DEPILACAO|SEPHORA|BOTICARIO|NATURA|AVON|EUDORA|QUEM DISSE BERENICE|MAC COSMETICOS)\b/, "beleza"],
  [/\b(DOACAO|DOACOES|VAKINHA|IGREJA|DIZIMO|UNICEF|MSF|MEDICOS SEM FRONTEIRAS|GREENPEACE|APOIA SE)\b/, "doacoes"],
];

export function keywordCategory(text: string): string | null {
  const t = norm(text);
  if (!t) return null;
  for (const [re, slug] of KEYWORDS) if (re.test(t)) return slug;
  return null;
}

// ── Camada 2: tipo de estabelecimento (MCC) ─────────────────────────────────

const MCC_RANGES: [number, number, string][] = [
  [3000, 3299, "viagens-passagens"],
  [3351, 3500, "aluguel-carro"],
  [3501, 3999, "viagens-hospedagem"],
];

const MCC: Record<number, string> = {
  742: "pet",
  4111: "transporte-publico", 4112: "transporte-publico", 4131: "transporte-publico", 4121: "apps-transporte",
  4411: "viagens-outros", 4511: "viagens-passagens", 4582: "viagens-outros", 4722: "viagens-outros",
  4784: "estacionamento-pedagio", 7523: "estacionamento-pedagio", 7512: "aluguel-carro",
  4812: "celular", 4814: "celular", 4816: "apps-software", 4899: "internet-tv", 4900: "energia",
  5045: "eletronicos", 5732: "eletronicos", 5734: "apps-software", 5946: "eletronicos",
  5122: "farmacia", 5912: "farmacia",
  5200: "casa-utilidades", 5211: "manutencao-casa", 5231: "manutencao-casa", 5251: "manutencao-casa", 5261: "casa-utilidades",
  5712: "casa-utilidades", 5713: "casa-utilidades", 5714: "casa-utilidades", 5718: "casa-utilidades", 5719: "casa-utilidades", 5722: "casa-utilidades",
  5300: "mercado", 5411: "mercado", 5422: "mercado", 5441: "mercado", 5451: "mercado", 5499: "mercado", 5462: "padaria-cafe",
  5811: "restaurantes", 5812: "restaurantes", 5813: "bares", 5814: "restaurantes",
  5541: "combustivel", 5542: "combustivel", 5983: "combustivel", 5172: "combustivel",
  5531: "manutencao-veiculo", 5532: "manutencao-veiculo", 5533: "manutencao-veiculo", 7531: "manutencao-veiculo",
  7534: "manutencao-veiculo", 7535: "manutencao-veiculo", 7538: "manutencao-veiculo", 7542: "manutencao-veiculo", 7549: "manutencao-veiculo",
  5511: "manutencao-veiculo", 5521: "manutencao-veiculo",
  5310: "outras-compras", 5311: "outras-compras", 5331: "outras-compras", 5399: "outras-compras", 5999: "outras-compras",
  5941: "outras-compras", 5655: "roupas", 5940: "outras-compras",
  5611: "roupas", 5621: "roupas", 5631: "roupas", 5641: "roupas", 5651: "roupas", 5661: "roupas", 5691: "roupas", 5699: "roupas", 5137: "roupas",
  5942: "livros", 5994: "livros", 5192: "livros",
  5947: "presentes", 5945: "presentes", 5992: "presentes", 5944: "presentes",
  5995: "pet",
  5964: "compras-online", 5965: "compras-online", 5969: "compras-online",
  5815: "streaming", 5816: "hobbies", 5817: "apps-software", 5818: "apps-software", 5968: "outras-assinaturas",
  7832: "eventos-cultura", 7922: "eventos-cultura", 7929: "eventos-cultura", 7991: "eventos-cultura", 7996: "eventos-cultura", 7998: "eventos-cultura", 7999: "eventos-cultura",
  7941: "academia-esportes", 7992: "academia-esportes", 7997: "academia-esportes", 7932: "hobbies", 7993: "hobbies", 7994: "hobbies",
  7995: "apostas", 9406: "apostas",
  7011: "viagens-hospedagem", 7012: "viagens-hospedagem", 7033: "viagens-hospedagem",
  7230: "beleza", 7297: "bem-estar", 7298: "bem-estar", 5977: "beleza",
  7349: "servicos-domesticos", 7342: "servicos-domesticos", 7210: "servicos-domesticos", 7211: "servicos-domesticos", 7216: "servicos-domesticos",
  8011: "consultas-exames", 8031: "consultas-exames", 8041: "consultas-exames", 8042: "consultas-exames", 8043: "consultas-exames",
  8049: "consultas-exames", 8050: "consultas-exames", 8062: "consultas-exames", 8071: "consultas-exames", 8099: "consultas-exames", 8021: "dentista",
  8211: "escola-faculdade", 8220: "escola-faculdade", 8241: "cursos", 8244: "cursos", 8249: "cursos", 8299: "cursos", 8351: "escola-faculdade",
  8398: "doacoes", 8661: "doacoes",
  6300: "seguros", 6381: "seguros", 5960: "seguros",
  6011: "saque",
  9211: "outros-impostos", 9222: "multas", 9311: "outros-impostos", 9399: "outros-impostos", 9402: "outros-impostos",
};

export function mccCategory(mcc: number | null | undefined): string | null {
  if (!mcc) return null;
  if (MCC[mcc]) return MCC[mcc];
  for (const [a, b, slug] of MCC_RANGES) if (mcc >= a && mcc <= b) return slug;
  return null;
}

// ── Camada 3: categoria que o banco/Pluggy mandou ───────────────────────────
// Só as que dizem alguma coisa. "Transfer - PIX" não diz para quê, então não
// entra: vira "a classificar" e espera uma regra.

const PLUGGY: Record<string, string> = {
  "salary": "salario",
  "retirement": "salario",
  "entrepreneurial activities": "renda-servicos",
  "government aid": "outras-receitas",
  "non-recurring income": "outras-receitas",
  "proceeds interests and dividends": "rendimentos",
  "cashback": "reembolsos",
  "loans and financing": "emprestimos",
  "loans": "emprestimos",
  "financing": "emprestimos",
  "real estate financing": "aluguel",
  "vehicle financing": "emprestimos",
  "student loan": "emprestimos",
  "late payment and overdraft costs": "juros-multas",
  "interests charged": "juros-multas",
  "investments": "investimento-aplicacao",
  "automatic investment": "investimento-aplicacao",
  "fixed income": "investimento-aplicacao",
  "mutual funds": "investimento-aplicacao",
  "variable income": "investimento-aplicacao",
  "pension": "investimento-aplicacao",
  "same person transfer": "entre-contas",
  "same person transfer - pix": "entre-contas",
  "same person transfer - ted": "entre-contas",
  "same person transfer - cash": "entre-contas",
  "credit card payment": "pagamento-fatura",
  "telecommunications": "celular",
  "internet": "internet-tv",
  "mobile": "celular",
  "tv": "internet-tv",
  "education": "cursos",
  "online courses": "cursos",
  "university": "escola-faculdade",
  "school": "escola-faculdade",
  "kindergarten": "escola-faculdade",
  "wellness and fitness": "academia-esportes",
  "gyms and fitness centers": "academia-esportes",
  "sports practice": "academia-esportes",
  "wellness": "bem-estar",
  "tickets": "eventos-cultura",
  "stadiums and arenas": "eventos-cultura",
  "landmarks and museums": "eventos-cultura",
  "cinema, theater and concerts": "eventos-cultura",
  "leisure": "hobbies",
  "online shopping": "compras-online",
  "electronics": "eletronicos",
  "pet supplies and vet": "pet",
  "clothing": "roupas",
  "kids and toys": "presentes",
  "bookstore": "livros",
  "sports goods": "outras-compras",
  "office supplies": "outras-compras",
  "shopping": "outras-compras",
  "digital services": "apps-software",
  "gaming": "hobbies",
  "video streaming": "streaming",
  "music streaming": "streaming",
  "groceries": "mercado",
  "eating out": "restaurantes",
  "food delivery": "delivery",
  "airport and airlines": "viagens-passagens",
  "accomodation": "viagens-hospedagem",
  "accommodation": "viagens-hospedagem",
  "mileage programs": "viagens-passagens",
  "bus tickets": "viagens-passagens",
  "travel": "viagens-outros",
  "donations": "doacoes",
  "gambling": "apostas",
  "lottery": "apostas",
  "online bet": "apostas",
  "income taxes": "imposto-renda",
  "taxes on investments": "imposto-renda",
  "tax on financial operations": "iof",
  "taxes": "outros-impostos",
  "account fees": "tarifas-bancarias",
  "wire transfer fees and atm fees": "tarifas-bancarias",
  "bank fees": "tarifas-bancarias",
  "credit card fees": "anuidade-cartao",
  "rent": "aluguel",
  "water": "agua",
  "electricity": "energia",
  "gas": "gas",
  "houseware": "casa-utilidades",
  "urban land and building tax": "iptu",
  "dentist": "dentista",
  "pharmacy": "farmacia",
  "optometry": "consultas-exames",
  "hospital clinics and labs": "consultas-exames",
  "healthcare": "consultas-exames",
  "taxi and ride-hailing": "apps-transporte",
  "public transportation": "transporte-publico",
  "car rental": "aluguel-carro",
  "bicycle": "apps-transporte",
  "gas stations": "combustivel",
  "parking": "estacionamento-pedagio",
  "tolls and in vehicle payment": "estacionamento-pedagio",
  "vehicle ownership taxes and fees": "ipva",
  "vehicle maintenance": "manutencao-veiculo",
  "traffic tickets": "multas",
  "life insurance": "seguros",
  "home insurance": "seguros",
  "health insurance": "plano-saude",
  "vehicle insurance": "seguro-veiculo",
  "insurance": "seguros",
  "transfer - cash": "saque",
  "alimony": "pix-pessoas",
};

export function pluggyCategory(name: string | null | undefined): string | null {
  if (!name) return null;
  return PLUGGY[name.trim().toLowerCase()] ?? null;
}

// ── Juntando as camadas ─────────────────────────────────────────────────────

export type TxFacts = {
  amount: number; // negativo = saiu dinheiro
  accountType: string; // BANK | CREDIT
  description: string;
  merchantName: string | null;
  counterpartName: string | null;
  counterpartDoc: string | null;
  ownerDocs: string[];
  ownerNames: string[]; // nomes do titular, já normalizados
  mcc: number | null;
  pluggyCategory: string | null;
  paymentMethod: string | null;
};

export type Rule = {
  _id?: string;
  field: "counterpartDoc" | "counterpartName" | "merchant" | "description";
  value: string;
  category: string;
};

export type Source = "user" | "rule" | "auto" | "mcc" | "pluggy" | "ai" | "none";

export function ruleKey(f: TxFacts, field: Rule["field"]): string {
  switch (field) {
    case "counterpartDoc":
      return digits(f.counterpartDoc);
    case "counterpartName":
      return norm(f.counterpartName);
    case "merchant":
      return norm(f.merchantName);
    case "description":
      return descriptionKey(f.description);
  }
}

// Qual chave usar quando o Bruno corrige uma movimentação e pede para as
// parecidas seguirem: a pessoa/empresa do PIX, senão a loja, senão a
// descrição sem números.
export function bestRuleFor(f: TxFacts): { field: Rule["field"]; value: string } | null {
  // O nome antes do CPF/CNPJ: nem todo banco manda o documento, e o mesmo
  // destinatário aparece em bancos diferentes.
  if (norm(f.counterpartName)) return { field: "counterpartName", value: norm(f.counterpartName) };
  if (digits(f.counterpartDoc).length >= 11) return { field: "counterpartDoc", value: digits(f.counterpartDoc) };
  if (norm(f.merchantName)) return { field: "merchant", value: norm(f.merchantName) };
  const d = descriptionKey(f.description);
  return d.length >= 3 ? { field: "description", value: d } : null;
}

const fixSign = (slug: string, amount: number, accountType: string): string => {
  const cat = CATEGORY.get(slug);
  if (!cat) return slug;
  // Dinheiro entrando na conta numa categoria de gasto (ex.: PIX de volta de
  // um restaurante) é estorno: fica na categoria e abate o gasto. Já uma
  // "receita" saindo não existe; cai para a classificar.
  if (cat.kind === "income" && amount < 0 && accountType === "BANK") return "a-classificar";
  return slug;
};

// Nomes de pessoa chegam cortados ("GUILHERME PEIXOTO NEV" num banco,
// "GUILHERME PEIXOTO NEVES" no outro): casa se um começa com o outro.
export function sameName(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.length >= 12 && long.startsWith(short);
}

export function ruleMatches(f: TxFacts, r: Rule): boolean {
  if (!r.value) return false;
  const key = ruleKey(f, r.field);
  return r.field === "counterpartName" ? sameName(key, r.value) : key === r.value;
}

// PIX/TED para mim mesmo: mesmo CPF, ou todas as palavras do meu nome em
// quem recebeu/enviou ("TOSO BRUNO NUNES" e "BRUNO NUNES TOSO" contam).
export function isOwner(f: TxFacts): boolean {
  if (f.accountType === "CREDIT") return false;
  if (f.counterpartDoc && f.ownerDocs.some((d) => sameDocument(d, f.counterpartDoc))) return true;
  const words = new Set(norm(f.counterpartName || f.description).split(" "));
  return f.ownerNames.some((n) => {
    const parts = n.split(" ").filter((w) => w.length > 2);
    return parts.length >= 2 && parts.every((w) => words.has(w));
  });
}

export function classify(f: TxFacts, rules: Rule[]): { category: string; source: Source } {
  // Regras do Bruno vencem tudo.
  for (const r of rules) if (ruleMatches(f, r)) return { category: r.category, source: "rule" };

  if (isOwner(f)) return { category: "entre-contas", source: "auto" };

  // No cartão, o crédito do pagamento da fatura (o débito correspondente
  // está na conta corrente).
  if (f.accountType === "CREDIT" && f.amount > 0 && /\b(PAGAMENTO|PGTO|PAGTO|PAG)\b/.test(norm(f.description))) {
    return { category: "pagamento-fatura", source: "auto" };
  }

  const text = [f.merchantName, f.description, f.counterpartName].filter(Boolean).join(" ");
  const kw = keywordCategory(text);
  if (kw) return { category: fixSign(kw, f.amount, f.accountType), source: "auto" };

  const mc = mccCategory(f.mcc);
  if (mc) return { category: fixSign(mc, f.amount, f.accountType), source: "mcc" };

  const pc = pluggyCategory(f.pluggyCategory);
  if (pc) return { category: fixSign(pc, f.amount, f.accountType), source: "pluggy" };

  if (f.amount > 0) return { category: f.accountType === "CREDIT" ? "reembolsos" : "outras-receitas", source: "none" };
  return { category: "a-classificar", source: "none" };
}
