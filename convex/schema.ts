import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Uma linha por aparelho com Face ID / Touch ID cadastrado.
  passkeys: defineTable({
    credentialId: v.string(), // base64url
    publicKey: v.string(), // base64url (COSE)
    counter: v.number(),
    transports: v.array(v.string()),
    deviceName: v.string(),
    backedUp: v.boolean(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  }).index("by_credential", ["credentialId"]),

  // Trava de tentativas de senha. Uma linha só (key = "senha"): existe um
  // usuário, então a contagem é global. O Face ID não passa por aqui.
  throttle: defineTable({
    key: v.string(),
    failures: v.number(),
    windowStart: v.number(),
    lockedUntil: v.number(),
  }).index("by_key", ["key"]),

  // Atividade mostrada no hub (entradas, aparelhos cadastrados/removidos).
  events: defineTable({
    kind: v.string(),
    detail: v.string(),
    at: v.number(),
  }).index("by_at", ["at"]),

  // ── Finanças (Open Finance via Pluggy) ────────────────────────────────────

  // Uma linha por conexão (banco) na Pluggy.
  finItems: defineTable({
    itemId: v.string(),
    bank: v.string(),
    status: v.string(), // UPDATED | OUTDATED | LOGIN_ERROR | ...
    executionStatus: v.optional(v.string()),
    bankUpdatedAt: v.optional(v.string()), // quando a Pluggy falou com o banco
    consentExpiresAt: v.optional(v.string()),
    ownerDocs: v.array(v.string()), // CPF do titular: PIX para si mesmo = entre contas
    ownerNames: v.optional(v.array(v.string())), // nomes do titular, normalizados
    lastSyncAt: v.optional(v.number()),
    lastSyncError: v.optional(v.string()),
    historyFrom: v.optional(v.string()), // AAAA-MM-DD do primeiro dia buscado
  }).index("by_itemId", ["itemId"]),

  finAccounts: defineTable({
    accountId: v.string(),
    itemId: v.string(),
    bank: v.string(),
    type: v.string(), // BANK | CREDIT
    subtype: v.optional(v.string()),
    name: v.string(),
    number: v.optional(v.string()),
    balance: v.number(), // no cartão: quanto está devendo
    creditLimit: v.optional(v.number()),
    availableCredit: v.optional(v.number()),
    dueDate: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_accountId", ["accountId"]),

  finTx: defineTable({
    txId: v.string(),
    accountId: v.string(),
    itemId: v.string(),
    bank: v.string(),
    accountType: v.string(), // BANK | CREDIT
    date: v.string(), // AAAA-MM-DD (horário de Brasília)
    at: v.string(), // data/hora original da Pluggy
    amount: v.number(), // negativo = saiu dinheiro
    description: v.string(),
    status: v.string(), // POSTED | PENDING
    method: v.string(), // PIX | TED | BOLETO | CARTAO | DEBITO | TARIFA | OUTRO
    counterpartName: v.optional(v.string()),
    counterpartDoc: v.optional(v.string()),
    merchantName: v.optional(v.string()),
    mcc: v.optional(v.number()),
    installment: v.optional(v.number()),
    installments: v.optional(v.number()),
    pluggyCategory: v.optional(v.string()),
    category: v.string(),
    categorySource: v.string(), // user | rule | auto | mcc | pluggy | ai | none
    note: v.optional(v.string()),
    aiTriedAt: v.optional(v.number()), // o Claude já olhou (e talvez não soube)
    syncedAt: v.number(),
  })
    .index("by_txId", ["txId"])
    .index("by_date", ["date"])
    .index("by_account_date", ["accountId", "date"])
    .index("by_category_date", ["category", "date"])
    .index("by_source", ["categorySource"]),

  // JSON completo de cada movimentação, à parte para as listas ficarem leves.
  finTxRaw: defineTable({ txId: v.string(), raw: v.string() }).index("by_txId", ["txId"]),

  finInvestments: defineTable({
    investmentId: v.string(),
    itemId: v.string(),
    bank: v.string(),
    name: v.string(),
    type: v.string(), // FIXED_INCOME | MUTUAL_FUND | SECURITY | EQUITY | ETF | COE | OTHER
    subtype: v.optional(v.string()),
    balance: v.number(), // valor bruto de hoje
    invested: v.optional(v.number()), // quanto foi aplicado
    profit: v.optional(v.number()),
    issuer: v.optional(v.string()),
    rate: v.optional(v.number()),
    rateType: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    lastMonthRate: v.optional(v.number()),
    lastTwelveMonthsRate: v.optional(v.number()),
    quantity: v.optional(v.number()), // cotas / títulos
    unitValue: v.optional(v.number()), // preço da cota hoje
    raw: v.string(),
    updatedAt: v.number(),
    gone: v.optional(v.boolean()), // resgatado (ou não veio mais da Pluggy)
  }).index("by_investmentId", ["investmentId"]),

  // Compras, resgates e juros de cada investimento, com o preço da cota na
  // data: é o que separa aporte de valorização.
  finInvTx: defineTable({
    investmentId: v.string(),
    txId: v.string(),
    date: v.string(),
    type: v.string(), // BUY | SELL | INTEREST | ...
    movementType: v.optional(v.string()), // CREDIT | DEBIT
    amount: v.number(),
    quantity: v.optional(v.number()),
    value: v.optional(v.number()), // preço da cota
  }).index("by_investment", ["investmentId"]),

  // Uma fotografia por dia: saldo das contas, investimentos e cartões.
  finNetWorth: defineTable({
    date: v.string(),
    cash: v.number(),
    investments: v.number(),
    cardDebt: v.number(),
    total: v.number(),
    invested: v.number(), // soma do "quanto foi aplicado" dos investimentos
  }).index("by_date", ["date"]),

  // "Movimentação com X vira categoria Y". Criadas quando ele corrige uma
  // movimentação e marca "aplicar às parecidas".
  finRules: defineTable({
    field: v.string(), // counterpartDoc | counterpartName | merchant | description
    value: v.string(),
    category: v.string(),
    label: v.string(), // como mostrar a regra (nome da pessoa/loja)
    createdAt: v.number(),
  }).index("by_field_value", ["field", "value"]),

  // Categorias criadas por ele, além das de taxonomy.ts.
  finCategories: defineTable({
    slug: v.string(),
    name: v.string(),
    group: v.string(),
    kind: v.string(),
  }).index("by_slug", ["slug"]),

  // Limite mensal de cada linha do orçamento (src/lib/fin-budget.ts) que ele
  // mudou na página; sem linha aqui vale o limite padrão do arquivo.
  finBudget: defineTable({ lineId: v.string(), limit: v.number() }).index("by_lineId", ["lineId"]),

  finGoals: defineTable({
    name: v.string(),
    target: v.number(),
    deadline: v.optional(v.string()), // AAAA-MM
    // networth: patrimônio total · investments: só investimentos ·
    // manual: valor digitado · spend: teto de gasto mensal numa categoria/grupo
    source: v.string(),
    manualValue: v.optional(v.number()),
    scope: v.optional(v.string()), // slug ou "grupo:Nome" quando source = spend
    createdAt: v.number(),
  }),
});
