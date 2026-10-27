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
});
