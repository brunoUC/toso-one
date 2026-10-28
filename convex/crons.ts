import { cronJobs, makeFunctionReference } from "convex/server";

const crons = cronJobs();

// Finanças: busca movimentações, saldos e investimentos duas vezes por dia
// (06:17 e 18:17 em Brasília). A Pluggy atualiza cada banco sozinha uma vez
// por dia; a segunda passada pega o que chegou depois da primeira.
crons.cron("financas-sync", "17 9,21 * * *", makeFunctionReference<"action">("financas/sync:syncAll"), {});

export default crons;
