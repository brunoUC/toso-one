# toso one

Hub pessoal de ferramentas. Hoje tem dois apps:

| App | Acesso | O que é |
|---|---|---|
| **Voos** | aberto | O [Flight Tracker](https://github.com/brunoUC/Flight_Tracker) incorporado, servido sob o mesmo domínio |
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

O `vercel.json` já cuida do resto: com `CONVEX_DEPLOY_KEY` presente, o build
publica as funções do Convex e depois compila o Next com a URL certa.

`FLIGHTS_URL` vira um rewrite no build: depois de mudar o valor, faça um
**Redeploy**.

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
