# Pausa 3.0 — Dark Mode + Supabase compartilhado em tempo real

Aplicação web estática para GitHub Pages. Pessoas, cronômetros, históricos e relatórios são **compartilhados por todos os integrantes autorizados da equipe**. Ao iniciar ou parar uma contagem, os dados são gravados no Supabase e atualizados nos outros navegadores via Supabase Realtime (com atualização automática de segurança a cada 30 segundos se a conexão Realtime falhar).

> **Privacidade**: dados de utilização de banheiro podem ser sensíveis. Restrinja o acesso, informe as pessoas envolvidas, estabeleça prazo de retenção e evite métricas como instrumento de vigilância ou punição. Um repositório GitHub público não torna os registros públicos: as tabelas usam autenticação e RLS.

## Qual SQL devo executar? (IMPORTANTE)

| Situação | Arquivo SQL a executar no Supabase SQL Editor |
|---|---|
| **Já usou a versão anterior** (`bathroom_people` e `bathroom_sessions` existem) | `02_ativar_compartilhamento.sql` **somente** |
| **Projeto Supabase novo, sem tabelas** | `supabase.sql` (instalação completa) **somente** |

Os dois caminhos preservam dados existentes e podem ser executados novamente. O arquivo `01_criar_tabelas.sql` é a estrutura original e está incluído apenas para referência.

**ATENÇÃO**: o script de migração considera **todas as contas de e-mail já existentes em Authentication → Users no projeto escolhido** como integrantes autorizados. Confira essas contas antes de executar. Prefira um projeto Supabase exclusivo do Pausa, separado de outros sistemas.

### 1. Fazer a alteração no Supabase

1. Faça um **backup** do projeto Supabase (ou exporte `bathroom_people` e `bathroom_sessions` pelo Table Editor) antes de qualquer migração.
2. Acesse https://supabase.com/dashboard, escolha o projeto **onde o site está conectado** e entre em **SQL Editor → New query**.
3. Cole todo o conteúdo de **`02_ativar_compartilhamento.sql`** (se já possui dados), ou **`supabase.sql`** (projeto novo).
4. Clique em **Run** e confira se a operação foi concluída sem erros.
5. Verifique em **Table Editor** as tabelas `bathroom_people`, `bathroom_sessions` e `bathroom_team_members`. As três devem estar com **RLS habilitado**.
6. Em **Database → Publications → supabase_realtime**, confirme que `bathroom_people` e `bathroom_sessions` estão habilitadas. O script ativa automaticamente, mas essa tela permite conferir.

Esse script **não exclui registros antigos**. Os registros de pessoas criadas por contas diferentes passam a ser visíveis a todos os integrantes da equipe. Se contas distintas já haviam cadastrado pessoas com nomes iguais, os cadastros continuarão separados (mesmo nome, IDs diferentes).

### 2. Autorizar novos usuários da equipe

**O login é individual.** Criar uma conta no Supabase Auth **não a autoriza automaticamente**: depois de criar o usuário, o administrador inclui a conta na tabela de membros.

1. No Supabase, abra **Authentication → Users → Add user** e crie o usuário com e-mail e senha (confirme o e-mail, se necessário).
2. Abra **SQL Editor → New query** e execute o SQL abaixo, substituindo o e-mail:

```sql
insert into public.bathroom_team_members (user_id)
select id from auth.users where email = 'colega@exemplo.com'
on conflict (user_id) do nothing;
```

A consulta só adiciona uma conta que **já existe** em `Authentication → Users`. Se o e-mail estiver errado, nenhuma linha será adicionada.

Para verificar quem está autorizado:

```sql
select u.email, m.added_at
from public.bathroom_team_members m
join auth.users u on u.id = m.user_id
order by u.email;
```

Para retirar o acesso de alguém **sem excluir o histórico**:

```sql
delete from public.bathroom_team_members
where user_id = (select id from auth.users where email = 'colega@exemplo.com');
```

**Não desative a lista de membros nem altere as políticas RLS para `using (true)`.** Em Authentication, mantenha o cadastro público de usuários desativado se o sistema for exclusivo de uma equipe. O integrante removido deixa de poder consultar as tabelas, embora o token de autenticação dele ainda possa existir até expirar.

### 3. Substituir os arquivos no seu repositório GitHub

No VS Code, com o projeto que já foi publicado aberto:

1. Substitua `index.html`, `app.js`, `style.css` e `README.md` pelos novos arquivos do ZIP. Copie também os arquivos SQL para manter a documentação.
2. **Preserve seu `config.js` atual, caso já esteja preenchido!** O ZIP inclui um `config.js` de exemplo, que não deve sobrescrever o que já aponta para seu projeto real.
3. Pressione `Ctrl + Shift + G` → prepare as alterações (`+`) → escreva um commit como `Compartilhamento e sincronização em tempo real` → **Commit** → **Sync Changes / Push**.
4. O GitHub Pages republicará o site. Atualize a página com `Ctrl + F5` para descartar arquivos antigos em cache.

Se ainda não publicou o site, envie os arquivos para a **raiz do repositório** e ative **Settings → Pages → Deploy from a branch → main → /(root)**. Seu endereço será semelhante a `https://SEU-USUARIO.github.io/pausa-banheiro/`.

### 4. Configuração `config.js`

O arquivo precisa conter a URL e a **chave pública** do projeto Supabase usado no SQL:

```js
window.PAUSA_CONFIG = {
  supabaseUrl: 'https://SEU-PROJETO.supabase.co',
  supabasePublishableKey: 'sb_publishable_SUA_CHAVE_PUBLICA'
};
```

Encontre esses valores no dashboard Supabase em **Project Settings → Data API** (URL) e **Project Settings → API Keys** (chave publishable). **Nunca envie chave secreta (`sb_secret_`) ou `service_role` para o GitHub.**

### 5. Teste em dois dispositivos / navegadores

1. Faça login na aplicação com **Conta A** e com **Conta B** (ambas devem estar em `bathroom_team_members`).
2. Na Conta A, cadastre uma pessoa. Ela deverá aparecer automaticamente na Conta B.
3. Na Conta B, clique **Iniciar**. O cronômetro ficará visível na Conta A e continuará contando com base no horário salvo no banco.
4. Na Conta A, clique **Parar**. O histórico e os gráficos devem atualizar na Conta B.
5. Tente iniciar a contagem da **mesma pessoa** simultaneamente nas duas contas. O banco mantém o índice de uma sessão ativa por pessoa e rejeita o segundo início.
6. Teste uma **Conta C não autorizada**. Em vez dos registros, ela deverá ver a mensagem “Conta sem acesso à equipe”.
7. Confirme que **Relatórios** mostram o conjunto completo de pessoas e sessões, não somente os registros do usuário que fez login.

## O que mudou por dentro?

- A tabela `bathroom_team_members` identifica quem está autorizado a acessar os registros da equipe.
- As políticas RLS de `bathroom_people` e `bathroom_sessions` agora permitem operações a **qualquer membro autorizado**, mas não a visitantes nem a contas fora da equipe.
- O campo original `owner_id` foi preservado para não perder dados e cumprir a chave estrangeira. Ao iniciar a contagem de uma pessoa cadastrada por outro membro, o app agora envia **o owner_id da pessoa**. Isso evita o erro de chave estrangeira da versão anterior.
- As novas sessões armazenam `started_by` e `ended_by`. Nas anteriores, o iniciador é inferido do proprietário original da sessão e o encerrador fica desconhecido; o banco não consegue recuperar a identidade de quem clicou no passado. A interface mostra “Você” ou “Outro membro da equipe” para proteger as informações pessoais das contas.
- Supabase Realtime notifica navegadores abertos quando alguém cadastra, altera, exclui, inicia ou encerra registros. Uma leitura a cada 30 segundos e ao voltar para a aba funciona como alternativa quando o Realtime está indisponível.
- A contagem não depende da aba estar aberta; o início e o fim continuam gravados no banco. Gráficos usam somente contagens encerradas.

## Observações importantes

- Um integrante autorizado pode cadastrar, editar e **excluir** pessoas e sessões de toda a equipe. A exclusão de uma pessoa apaga também suas sessões. Para perfis com permissões diferentes (somente leitura/administração), seria necessária uma melhoria específica.
- Ao excluir no Supabase Auth um usuário que **criou pessoas ou sessões**, o banco poderá impedir a exclusão para preservar dados compartilhados. Transfira a titularidade pelo SQL antes de remover esse usuário do Auth, ou apenas revogue a autorização da equipe.
- O sistema não envia registros diretamente ao GitHub; só o código está lá. Os dados residem no Supabase.
- Se o projeto ainda possui arquivos da versão antiga em cache, force a atualização da página (`Ctrl + F5`).
- **Não rode scripts SQL em outros projetos**: certifique-se de estar no projeto do Pausa, não em sistemas ou lojas que também usam Supabase.

Documentação: https://supabase.com/docs/guides/realtime/postgres-changes e https://supabase.com/docs/guides/database/postgres/row-level-security
