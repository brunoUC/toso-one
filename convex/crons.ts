import { cronJobs, makeFunctionReference } from "convex/server";

const crons = cronJobs();

// Finanças: busca movimentações, saldos e investimentos duas vezes por dia
// (06:17 e 18:17 em Brasília). A Pluggy atualiza cada banco sozinha uma vez
// por dia; a segunda passada pega o que chegou depois da primeira.
crons.cron("financas-sync", "17 9,21 * * *", makeFunctionReference<"action">("financas/sync:syncAll"), {});

// Cartões: às 08:23, depois da leitura da manhã, avisa (push) quando uma
// fatura fecha em até 3 dias e a conta do banco não cobre.
crons.cron("financas-cartoes", "23 11 * * *", makeFunctionReference<"action">("financas/cards:check"), {});

// XP: análise da semana no sábado às 08:47, com os dados de sexta já lidos.
crons.cron("financas-semana-xp", "47 11 * * 6", makeFunctionReference<"action">("financas/weeklyRun:run"), {});

export default crons;
