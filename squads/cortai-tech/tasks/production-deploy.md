# Task: production-deploy

Deploy para produção via PR staging → main.

## ⚠️ Atenção: Esta ação afeta usuários reais

## Pré-requisitos
- [ ] Staging deploy completo e estável (>1 hora sem erros)
- [ ] Pre-production checklist completo
- [ ] Qualquer feature beta: flag desativada em produção

## Passos

1. **Criar PR no GitHub**: `staging → main`
   ```bash
   gh pr create --base main --head staging \
     --title "feat: [feature name]" \
     --body "## Changes\n- [lista de mudanças]\n\n## Deploy Notes\n- [migrations: sim/não]\n- [feature flags: lista]"
   ```

2. **Review da PR**
   - Verificar diff cuidadosamente
   - Confirmar que nenhum arquivo sensível (.env) foi incluído

3. **Merge e monitoramento**
   - Fazer merge da PR
   - Render auto-deploy inicia automaticamente
   - Monitorar logs por 15 minutos

4. **Verificar produção**
   ```bash
   curl https://cortai.com.br/health  # ou URL de produção
   ```
   - Verificar Sentry por novos erros
   - Verificar que métricas MercadoPago estão normais

5. **Marcar stories como concluídas**
   - Atualizar checkboxes em `docs/stories/STORY-*.md`
   - Marcar como `[x] Done`

## Rollback de Emergência
Se produção quebrar:
```bash
# Reverter para commit anterior no Render dashboard
# OU fazer hotfix + deploy urgente:
git revert HEAD && git push origin main
```
