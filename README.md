# PAUSA 2.0 — GitHub Pages + Supabase

Aplicação estática em tema escuro. Cadastro de pessoas, cronômetros independentes, histórico dividido por dias e painel de indicadores. Dados persistidos no Supabase, não no navegador (somente a sessão de login é lembrada no dispositivo pelo SDK).

## Arquivos

- `index.html` — estrutura HTML e tela de login.
- `style.css` — aparência, incluindo dark mode e responsividade.
- `app.js` — lógica, cálculos, gráficos e chamadas ao Supabase.
- `config.js` — configurações públicas do Supabase, que você preencherá.
- `supabase.sql` — criação das tabelas, índices e políticas RLS.
- `.nojekyll` — evita processamento desnecessário pelo GitHub Pages.

## Passo 1 — criar um projeto Supabase

1. Entre em https://supabase.com/dashboard e escolha **New project**. Recomenda-se criar um projeto chamado `pausa-banheiro` separado da loja GVolt3D.
2. Selecione organização e região de sua preferência, escolha uma senha forte **para o banco** (guarde-a; não a coloque no código do site) e crie o projeto.
3. Aguarde ficar disponível. Vá em **SQL Editor** > **New query**.
4. Abra `supabase.sql` em um editor, copie seu conteúdo para o SQL Editor e clique em **Run**. O retorno deve ser concluído sem erros.
5. No **Table Editor**, confirme que existem `bathroom_people` e `bathroom_sessions`. Ambas devem ter RLS habilitado.

> **Importante:** faça esse procedimento apenas no projeto novo, pois o SQL cria tabelas no schema `public`. Não é necessário criar buckets no Storage.

## Passo 2 — criar o usuário para login

1. Vá em **Authentication** > **Providers** > **Email** e mantenha o provedor de e-mail habilitado.
2. Em **Authentication** > **Sign In / Providers / Email** (a nomenclatura pode variar), **desative cadastro público** (`Allow new users to sign up`, normalmente em Authentication > Settings), se o site for usado apenas por quem você autorizar.
3. Em **Authentication** > **Users**, escolha **Add user** e **Create new user**, informe seu e-mail e uma senha forte; use a opção de confirmação/ativação de e-mail quando exibida.
4. Este projeto não tem botão público de cadastro. Usuários adicionais são criados pelo administrador no Supabase.

Cada usuário autenticado **vê apenas suas próprias pessoas e sessões**. O acesso da mesma conta em mais de um aparelho consulta os mesmos dados. Contas distintas **não compartilham dados** por padrão. Não compartilhe senha: se precisar de uma equipe usando registros comuns, peça uma versão com organizações e permissões de equipe.

## Passo 3 — configurar a chave pública

1. No painel do projeto, abra **Project Settings** > **API Keys** (ou botão **Connect**).
2. Copie a **Project URL**, no formato `https://abcdefgh.supabase.co`.
3. Copie a **Publishable key**, que começa com `sb_publishable_`.
4. Abra `config.js` e substitua os dois valores de exemplo:

```js
window.PAUSA_CONFIG = {
  supabaseUrl: 'https://abcdefgh.supabase.co',
  supabasePublishableKey: 'sb_publishable_SUA_CHAVE_PUBLICA'
};
```

**JAMAIS** coloque a senha do banco, uma chave `sb_secret_...` ou a chave `service_role` no projeto do GitHub. A chave **publishable** foi feita para ficar pública no frontend; a segurança é feita por login + RLS.

## Passo 4 — publicar no GitHub Pages

1. Acesse https://github.com/new e crie um repositório, por exemplo `pausa-banheiro`.
2. Na raiz dele, envie (`Add file` > `Upload files`) os arquivos `index.html`, `style.css`, `app.js`, `config.js`, `supabase.sql`, `README.md` e `.nojekyll`.
3. Commit nas alterações (branch `main`).
4. Entre em **Settings** > **Pages** > **Build and deployment**.
5. Em **Source** selecione **Deploy from a branch**; selecione `main` e `/ (root)`; clique em **Save**.
6. Acesse o endereço informado pelo Pages, normalmente `https://SEU-USUARIO.github.io/pausa-banheiro/`.

**Atenção:** o GitHub Pages serve o site publicamente, mas **não** permite consultar a base sem autenticação conforme as políticas RLS instaladas.

## Passo 5 — configurar URLs do Supabase Auth

Em **Authentication** > **URL Configuration** no Supabase:

- **Site URL**: `https://SEU-USUARIO.github.io/pausa-banheiro/`
- **Redirect URLs**: adicione `https://SEU-USUARIO.github.io/pausa-banheiro/**` (ou o endereço exato do site se não usar fluxo de confirmação/recuperação).

Essas URLs são especialmente relevantes caso você habilite mensagens de confirmação, recuperação de senha ou outros fluxos com redirecionamento por e-mail. Para login com e-mail e senha, o formulário não depende de um redirecionamento.

## Passo 6 — testar

1. Abra o endereço do site no GitHub Pages e faça login.
2. Entre em **Pessoas** e cadastre alguém. Confirme em **Supabase** > **Table Editor** > `bathroom_people`.
3. Clique **Iniciar contagem** e veja uma linha com `ended_at` vazio em `bathroom_sessions`.
4. Recarregue o site: o cronômetro deve continuar rodando (data de início vem do banco).
5. Clique em **Parar**, confira `ended_at` preenchido e acesse o **Histórico** e os **Relatórios**.
6. Entre na mesma conta pelo celular e confirme que os dados aparecem. O sistema também atualiza automaticamente em até cerca de 30 segundos se estiver aberto em dois aparelhos (ou clique no ícone ↻).
7. Teste **Sair** e confira que os dados não aparecem sem login.

## Para testar localmente

Como o projeto depende da biblioteca JavaScript CDN e autenticação Supabase, sirva os arquivos por HTTP com, por exemplo:

```bash
python -m http.server 8000
```

Abra `http://localhost:8000/` e adicione `http://localhost:8000/**` às Redirect URLs se precisar testar fluxos de e-mail localmente. Você também pode usar a extensão Live Server do VS Code.

## Notas importantes

- Este projeto **não importa automaticamente** backups JSON da versão local anterior. Se você já tiver dados reais nessa versão, será necessária uma rotina de migração para preservar os registros.
- O backup JSON e o CSV exportados contêm dados pessoais; guarde-os com cuidado.
- Excluir uma pessoa exclui suas sessões do Supabase permanentemente (cascade). Utilize backups para recuperação.
- O cronômetro grava início e fim no Supabase, com as sessões abertas preservadas mesmo se você fechar o navegador; os dados em relatórios consideram apenas sessões encerradas.
- Ranking e histórico de uso de banheiro envolvem **privacidade**. Use com ciência e consentimento das pessoas envolvidas e evite utilizar como mecanismo de vigilância, avaliação de produtividade ou punição.
- Caso o projeto fique pausado por políticas de inatividade do plano Supabase, reative-o pelo painel para voltar a sincronizar.
