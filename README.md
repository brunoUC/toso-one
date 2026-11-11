# toso one

Hub pessoal de ferramentas. A página inicial tem os apps no alto e, abaixo,
a seção **Sua semana** (agenda, rotinas, tempo, feriados e contas). Hoje tem
quatro apps:

| App | Acesso | O que é |
|---|---|---|
| **Voos** | aberto (editor privado) | Tarifas do [Flight Tracker](https://github.com/brunoUC/Flight_Tracker), com datas, link de compra e editor de rotas |
| **Finanças** | privado | Patrimônio, extrato de todos os bancos, gastos por categoria, metas e investimentos, via Open Finance |
| **Estante** | privado | Quero ler / quero ver (com quem indicou), lidos e vistos, highlights do Kindle e importação do StoryGraph |
| **Feed** | privado | Instagram só de quem você segue, em ordem cronológica, com busca, curtir e comentar. Sem Reels, Stories ou sugeridos |

Next.js 16 + Convex. Login com **Face ID / Touch ID (passkey)** e senha de reserva.

---

## Como funciona o login

Só existe um usuário, então não há cadastro nem e-mail.

1. **No primeiro acesso de cada aparelho**, entre com a senha (`TOSO_PASSWORD`).
2. O hub mostra **"Ativar Face ID"**. Um toque cadastra a passkey deste aparelho.
3. **Daí em diante**, "Entrar com Face ID" e pronto. A sessão dura 90 dias por aparelho.

| Peça | Papel |
|---|---|
| `src/proxy.ts` | Barra os apps privados antes de renderizar (redireciona para `/entrar`) |
| `src/lib/session.ts` | Sessão = JWT assinado num cookie HttpOnly. Sem tabela de sessões |
| `src/app/api/auth/**` | Senha, cadastro e entrada com passkey (`@simplewebauthn`), sair |
| `convex/` | Passkeys cadastradas, trava de senha e a lista de atividade |

Cada página e rota privada confere a sessão de novo, para não depender só do
proxy. A senha trava por 15 minutos depois de 5 erros. O Face ID não passa
por essa trava, então errar a senha nunca te tranca para fora.

As funções do Convex são públicas por natureza (qualquer um com a URL pode
chamá-las). Por isso todas exigem `TOSO_SERVER_SECRET`, que só o servidor do
Next conhece. O navegador nunca fala com o Convex direto.

**Perdeu um aparelho?** Ajustes → Face ID e passkeys → Remover.

---

## Publicar (uma vez)

### 1. Convex

1. Crie a conta em [convex.dev](https://convex.dev) e, nesta pasta, rode
   `npx convex dev`. Ele cria o projeto e grava `NEXT_PUBLIC_CONVEX_URL` no
   `.env.local`.
2. No painel do Convex, abra o deployment **Production** → Settings →
   Environment Variables e crie `TOSO_SERVER_SECRET` (gere com
   `openssl rand -base64 48`). Faça o mesmo no deployment de dev.
3. Ainda em Production → Settings, gere uma **Production Deploy Key**.

### 2. Vercel

Em [vercel.com/new](https://vercel.com/new), importe `brunoUC/toso-one` e
cadastre as variáveis de ambiente:

| Variável | Valor |
|---|---|
| `CONVEX_DEPLOY_KEY` | A deploy key do passo 1.3 |
| `TOSO_SERVER_SECRET` | **O mesmo** valor cadastrado no Convex |
| `TOSO_SESSION_SECRET` | Outro segredo: `openssl rand -base64 48` |
| `TOSO_PASSWORD` | Sua senha de reserva. Use uma frase longa |
| `FLIGHTS_URL` | Endereço do Flight Tracker na Vercel, sem barra no fim |
| `FLIGHTS_EDIT_PASSWORD` | O mesmo valor de `MONITOR_EDIT_PASSWORD` do projeto do Flight Tracker |

O `vercel.json` já cuida do resto: com `CONVEX_DEPLOY_KEY` presente, o build
publica as funções do Convex e depois compila o Next com a URL certa.
Cadastre a `CONVEX_DEPLOY_KEY` **só no ambiente Production**: se ela valer
também para Preview, cada branch publicado manda as funções *dele* para o
Convex de produção e apaga as que só existem no `main`.

**Editor de rotas.** Quem grava no GitHub é a API do próprio Flight
Tracker (`api/` daquele repositório), que já tem o token. O toso one só
repassa os pedidos com a senha dela. Sem `FLIGHTS_EDIT_PASSWORD`, a página
de Voos funciona normalmente e o editor mostra o que falta.

### 3. Primeiro acesso

Abra o site no iPhone → Entrar → senha → **Ativar Face ID**. Repita no Mac
(Touch ID). Pronto.

Passkeys ficam presas ao domínio. Se depois você ligar um domínio próprio
(ex. `one.toso.dev`), cadastre o Face ID de novo nele.

---

## Desenvolvimento

```bash
npm install
cp .env.example .env.local   # preencha TOSO_PASSWORD e os segredos
npx convex dev               # em um terminal: banco + funções
npm run dev                  # em outro: http://localhost:3000
```

Sem Convex configurado o app funciona só com senha: o Face ID aparece como
indisponível em Ajustes.

---

## Voos

O Flight Tracker continua coletando sozinho no GitHub Actions e publicando
um `data.json` na Vercel. O toso one lê esse arquivo (cache de 10 min).

- **`/voos`**: na frente, a busca e o mapa (Brasil, Europa e o Japão num
  recorte), desenhado no servidor com `d3-geo` sobre o `world-atlas`
  1:110m. Cada destino é um ponto na cor do melhor preço contra a rota:
  verde até o alvo, âmbar até o teto, vermelho acima, cinza sem dados.
  Abaixo, um card por destino (Lisboa, Madri, Roma, Atenas, Viena e Tóquio
  em destaque; os outros em "Outros destinos") com o menor preço entre as
  origens, a distância até o alvo/teto em R$ e %, as origens com link para o
  detalhe e as datas do destino, que dá para ajustar ali mesmo com sessão.
  - **Busca** (destino, ida, volta, origem GRU por padrão): com sessão,
    pergunta ao Google Flights na hora pelo `api/search.py` do Flight
    Tracker; sempre oferece o link da mesma busca no Google Flights
    (`src/lib/gflights.ts` monta o `tfs` igual à fast-flights). "Monitorar
    estas datas" cria a rota (ida de 3 dias antes a 3 depois, estadia ±2
    dias) ou alarga a janela da que já existe. Sem sessão, só o link.
  - **Coleta direcionada**: salvar rotas no editor, ajustar as datas de um
    destino ou monitorar uma busca dispara na hora uma coleta só das rotas
    novas ou alteradas (6 combinações de datas por rota, priorizando as
    nunca consultadas), sem esperar a coleta agendada.
- **`/voos/ORIGEM-DESTINO`**: o "bilhete" da melhor tarifa, calendário com o
  menor preço visto para cada dia de ida, as voltas consultadas de cada dia
  com preço, horário e a avaliação do próprio Google (baixo/típico/alto),
  a tabela de todas as tarifas vistas nos últimos 45 dias e o histórico.
  Cada tarifa tem um link que reabre exatamente aquela busca no Google
  Flights (mesmas datas, executiva, 1 adulto, BRL) para conferir o preço de
  agora e comprar.
- **`/voos/rotas`** (privado): rotas agrupadas por destino. Adicionar várias
  origens × vários destinos de uma vez, trocar o destino de um grupo ou a
  origem de uma rota, aplicar datas em lote, pausar, horários da coleta e
  "coletar agora" com o andamento das execuções.

A busca de aeroportos aceita cidade em português, nome ou código, sobre a
base do [OurAirports](https://ourairports.com/data/) (domínio público) em
`src/data/airports.json`. Para regerar: `scripts/build-airports.py` (gera
também `src/data/airport-coords.json`, as coordenadas usadas só no mapa).

O histórico de preços é indexado por `ORIGEM-DESTINO`: trocar a origem ou
o destino de uma rota começa um histórico novo (o antigo fica guardado).

O Google só mostra os voos de volta depois que se escolhe a ida, então a
coleta conhece o horário da ida, e da volta só a data. O link de cada
tarifa abre a busca com as duas datas.

## Finanças

Os dados vêm do Open Finance pela [Meu Pluggy](https://meu.pluggy.ai)
(gratuito). Nenhuma senha de banco passa por aqui: os bancos foram
conectados no Meu Pluggy, com consentimento de 12 meses, e o Convex lê pela
API da Pluggy com `PLUGGY_CLIENT_ID` / `PLUGGY_CLIENT_SECRET` (só nas
variáveis de ambiente do Convex).

- **Leitura** (`convex/financas/sync.ts`): duas vezes por dia (06:17 e
  18:17, `convex/crons.ts`) e no botão "Atualizar". Na primeira vez de cada
  banco busca o último ano; depois, os últimos 15 dias. Guarda contas,
  movimentações (com o JSON completo da Pluggy à parte), investimentos e
  uma fotografia diária do patrimônio.
- **Classificação** (`convex/financas/taxonomy.ts`), nesta ordem: regras
  suas → PIX/TED entre suas contas (CPF ou nome do titular) → nomes
  conhecidos → tipo de estabelecimento (MCC) → categoria do banco → Claude
  Haiku (`convex/financas/ai.ts`, só com `ANTHROPIC_API_KEY` no Convex).
  Corrigir uma movimentação com "sempre que for…" cria uma regra pela
  pessoa, loja ou descrição e reclassifica o passado na hora.
- **Gastos** contam cartão, PIX, boleto e débito. Pagamento de fatura,
  aplicação, resgate e transferência entre suas contas ficam de fora, para
  não contar a mesma compra duas vezes.
- **Telas**: `/financas` (painel), `/financas/extrato` (todos os bancos,
  com filtros), `/financas/m/<id>` (detalhe e tudo o que o banco mandou),
  `/financas/regras`.

- **Semana na XP** (`convex/financas/weekly.ts`, `/api/agente/semana`):
  todo sábado às 09:13 uma tarefa agendada do Claude Code (na assinatura,
  sem custo de API) lê os números da semana, pesquisa na web (Selic, Copom,
  CDI, o que a XP oferece) e devolve a análise. Os números são do código:
  saldo dos investimentos da XP hoje contra 7 dias atrás (`finInvSnap`, uma
  fotografia por investimento a cada leitura), menos aportes e mais
  resgates, e o CDI do mesmo período pela série 12 do Banco Central. O
  perfil é conservador: só liquidez D+0/D+1, tudo pela XP. A rota exige
  `TOSO_AGENT_TOKEN` (na Vercel e nas variáveis do ambiente do Claude Code)
  e só lê os números da semana e grava a análise. A primeira semana não tem
  base de 7 dias atrás, então só mostra a análise.
- **Aviso de fatura** (`convex/financas/cards.ts`): todo dia às 08:23, se a
  fatura de um banco fecha em até 3 dias e a conta dele não cobre, manda um
  push com quanto transferir (com 10% de folga, mínimo R$ 100) e de onde:
  XP primeiro, depois o banco com mais folga. Sem a data de fechamento da
  Pluggy, estima 7 dias antes do vencimento. Um aviso por banco e
  fechamento; as faturas dos próximos 5 dias também aparecem no painel e,
  quando falta dinheiro, no topo do Orçamento.
- **Notificações** (`convex/push.ts`, `public/sw.js`): Web Push. No iPhone,
  adicione o toso one à Tela de Início, abra por lá e ative em Ajustes →
  Notificações. As chaves VAPID nascem sozinhas no Convex na primeira vez
  (`PUSH_SUBJECT` no Convex troca o remetente, padrão
  `https://toso-one.vercel.app`).

Conectar outro banco: conecte no Meu Pluggy e rode
`npx convex run --prod financas/sync:addItems '{"itemIds":["<id>"]}'`.

## Sua semana (página inicial)

`src/lib/semana.ts` junta, para hoje e os próximos seis dias:

- **Agenda do Google Calendar** (`src/lib/calendar.ts`): sem OAuth, pelo
  endereço secreto iCal de cada agenda (Google Calendar → Configurações →
  a agenda → *Integrar agenda* → *Endereço secreto no formato iCal*).
  Cadastre na Vercel em `GCAL_ICS`, uma por linha ou separadas por vírgula,
  no formato `Nome|https://…/basic.ics`. Repetições, exceções e eventos
  cancelados são tratados pelo `ical.js`; cache de 10 minutos. Agenda de
  Google Workspace pode ter o endereço secreto desligado pelo administrador.
- **Rotinas** (Ajustes → Rotinas, tabela `routines`): o que se repete toda
  semana, como levar o Kobe na creche (ter, qui, sex). Não são tarefas:
  não se marcam como feitas. Podem sumir em feriado.
- **Feriados** (`src/lib/holidays.ts`): nacionais, estaduais e municipais
  de São Paulo, calculados aqui (inclusive Páscoa, Carnaval e Corpus
  Christi). O card mostra o próximo, o feriadão e a emenda possível.
- **Tempo** (`src/lib/weather.ts`): Open-Meteo, sem chave. São Paulo por
  padrão; `TOSO_LAT`, `TOSO_LON` e `TOSO_PLACE` trocam.
- **Contas e faturas**: as contas do mês que ainda não apareceram no
  extrato (no dia em que costumam ser pagas) e as faturas que fecham.
- **Highlight do dia** da Estante.

**Resumo da manhã**: o cron da Vercel (`vercel.json`) chama
`/api/semana/manha` às 07:07 com `CRON_SECRET` e manda por push o dia de hoje
(rotinas, agenda, feriado, chuva). Dia vazio não manda nada. Cadastre
`CRON_SECRET` na Vercel (a Vercel envia sozinha no cabeçalho).

## Estante

`/estante`, tabelas `shelf` e `highlights` (`convex/estante.ts`).

- **Adicionar pelo nome**: livros pelo Google Books (`GOOGLE_BOOKS_KEY`
  opcional; sem chave a cota é pequena) e Open Library; filmes e séries
  pelo TMDB com `TMDB_API_KEY` (chave v3 ou token v4, grátis em
  themoviedb.org, títulos em português). Sem chave do TMDB, usa a busca de
  sugestões do IMDb (título em inglês). "Indicado por" guarda quem
  recomendou. Não achou? Dá para adicionar só pelo nome.
- **StoryGraph**: Manage Account → Export StoryGraph Library → importar o
  CSV na aba Lidos. Lido, lendo, quero ler e larguei, com nota, data e
  resenha; capa pelo ISBN. Reimportar não duplica nem desfaz o que foi
  mudado aqui.
- **Kindle pela Amazon** (`src/lib/kindle-bookmarklet.ts`): a Amazon não
  tem API de highlights e o login dela não se automatiza do servidor
  (captcha, código no celular). Em Estante → Highlights fica o favorito
  "Enviar ao toso one": aberto em `ler.amazon.com.br/notebook` (ou
  `read.amazon.com/notebook`) com a conta logada, ele lê todos os livros e
  highlights da página, com paginação, abre `/estante/kindle` e entrega por
  `postMessage` (só aceito de domínios da Amazon). Nenhuma senha ou cookie
  da Amazon sai do navegador. Os seletores da página da Amazon podem mudar;
  se parar, o lugar para ajustar é esse arquivo.
- **Kindle por arquivo**: `documents/My Clippings.txt` (Kindle pelo cabo,
  pega também livros que não vieram da Amazon) ou o HTML de
  "Exportar anotações" do app. Notas vão junto do highlight; highlight
  esticado no Kindle atualiza o texto em vez de duplicar.
## Feed

Um Instagram reduzido: o feed de quem você segue, do mais novo para o mais
antigo, e a busca (perfis, lugares, hashtags). Não tem Reels, Stories,
Explorar, anúncios nem posts sugeridos. Curtir e comentar só acontecem
quando você toca no botão; o toso one nunca segue ninguém nem age sozinho.

O Instagram não tem API oficial para o feed de uma conta pessoal, então o
toso one usa a API web (a mesma do instagram.com) com a sua sessão e
**monta o próprio feed**: lê a lista de quem você segue e, aos poucos, os
posts recentes de cada perfil. Por isso não existe algoritmo nem sugerido:
só entra post de quem está na sua lista, ordenado pela data.

- **Conectar** (`/feed`): usuário e senha (e o código de dois fatores, se
  tiver). A senha vai direto ao Instagram e não é guardada; fica só a sessão
  (cookies), **cifrada** (AES-GCM, chave derivada do `TOSO_SERVER_SECRET`)
  na tabela `igAccount` do Convex. Se o Instagram barrar a entrada vinda de
  servidor, o plano B é colar o cookie `sessionid` de um navegador logado.
- **Leitura** (`convex/instagram/sync.ts`, cron a cada 10 min): relê a
  lista de quem você segue uma vez por dia e lê ~12 perfis por rodada (20
  enquanto ainda tem perfil nunca lido), com 2,5 a 6 s entre pedidos, e
  dorme das 02h às 07h. Quem posta mais é lido mais vezes (de 2 h em 2 h
  para quem postou nos últimos 3 dias, até 3 dias para quem está parado).
  Se o Instagram pedir pausa, espera 1 h, 2 h, 4 h, até 8 h. O botão
  "Atualizar" roda uma rodada na hora.
- **Guarda** só os posts dos últimos 60 dias (`igPosts`). Reels de quem
  você segue ficam guardados mas escondidos; "Com reels de quem sigo"
  mostra.
- **Fotos e vídeos** passam por `/api/feed/midia` (só logado, só os
  domínios do CDN do Instagram), porque o CDN deles não deixa embutir em
  outro site. Os links vencem em alguns dias; a próxima leitura do perfil
  traz links novos.
- **Curtir e comentar**: coração (ou dois toques na foto) e o balão de
  comentários em qualquer post, do feed, de um perfil, lugar ou hashtag.
  Os comentários abrem embaixo do post, com curtir, responder e "ver
  respostas". Vão direto ao Instagram com a sua conta, e o post guardado
  no feed já fica com o coração cheio e a contagem nova.
- **Busca** (`/feed/buscar`), **perfil** (`/feed/u/<usuário>`), **lugar**
  (`/feed/local/<id>`) e **hashtag** (`/feed/tag/<nome>`) perguntam ao
  Instagram na hora.

**Riscos.** Usar a conta fora do app oficial vai contra os termos do
Instagram. O ritmo lento existe para não parecer robô, mas o Instagram
pode pedir para confirmar a entrada ("Fui eu") ou derrubar a sessão; aí o
Feed mostra o aviso e pede para conectar de novo. Desconectar (no pé da
página) apaga a sessão e tudo o que foi guardado.

Os caminhos da API web do Instagram mudam sem aviso. Se uma parte parar,
o lugar para ajustar é `convex/instagram/client.ts`.

## Adicionar um app

1. Uma entrada em `src/lib/apps.ts` (nome, ícone, cor, `private`).
2. A página em `src/app/(shell)/<href>/page.tsx`. Se for privado, comece com
   `await requireSession("/<href>")`.

O card no hub, o item no menu e a proteção do proxy saem da entrada no
registro.

---

## Visual

- Temas **Claro** (padrão) e **Grafite**, escolhidos em Ajustes e lembrados
  num cookie, sem piscar na carga.
- Tokens em `src/app/globals.css`. As cores das séries dos gráficos foram
  validadas para daltonismo e contraste contra a superfície de cada tema;
  trocar uma cor exige validar de novo.
- Gráficos em `src/components/charts/`, em SVG próprio, sem biblioteca:
  linha com área e crosshair, colunas, barra de alocação, medidor de meta,
  sparkline e mapa de calor (com tabela alternativa).
