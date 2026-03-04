# Task: staging-deploy

Deploy para o ambiente de staging no Render.com.

## Pré-requisitos
- [ ] Pre-PR checklist completo
- [ ] Todos os testes passando localmente

## Passos

1. **Commit e push do submodule** (se houve mudanças em clipify-studio/)
   ```bash
   cd /home/usuario/Documentos/cortai/clipify-studio
   git add -p
   git commit -m "feat/fix: [descrição]"
   git push origin staging
   ```

2. **Commit na raiz** (submodule pointer + outros arquivos)
   ```bash
   cd /home/usuario/Documentos/cortai
   git add clipify-studio  # pointer do submodule
   git add migrations/     # se há migrations novas
   git commit -m "chore: sync submodule + [outras mudanças]"
   git push origin staging
   ```

3. **Monitorar Render Dashboard**
   - Verificar que o deploy foi triggado automaticamente
   - Aguardar build completar (normalmente 3-5 minutos)
   - Verificar logs por erros

4. **Verificar saúde**
   - Health check: `curl https://cortai-staging.onrender.com/health`
   - Verificar Sentry por novos erros

5. **Teste manual da feature** no ambiente staging

## Após Verificar Staging OK
- Criar PR: `staging → main` para deploy em produção
- Usar task `production-deploy` como referência
