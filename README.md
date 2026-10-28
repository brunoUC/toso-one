# toso one

Hub pessoal de ferramentas. Hoje tem dois apps:

| App | Acesso | O que é |
|---|---|---|
| **Voos** | aberto (editor privado) | Tarifas do [Flight Tracker](https://github.com/brunoUC/Flight_Tracker), com datas, link de compra e editor de rotas |
| **Finanças** | privado | Patrimônio, metas e carteira. Por enquanto com **dados de exemplo** |

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
