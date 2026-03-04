# CortAI Pre-Production Checklist

Use este checklist antes de criar o PR staging → main.

## Pré-requisitos
- [ ] Pre-PR Checklist completo
- [ ] Deploy em staging está há pelo menos 1 hora sem erros no Render logs
- [ ] Feature testada manualmente em staging por você

## Banco de Dados
- [ ] Migrations novas testadas em staging (schema aplicado corretamente)
- [ ] Nenhum dado de usuário de staging vazou (confirmado via pgAdmin staging)

## MercadoPago
- [ ] Fluxo de pagamento testado em modo sandbox (MERCADOPAGO_SANDBOX_MODE=true)
- [ ] Webhook de confirmação de pagamento recebido e processado

## Feature Flags
- [ ] Flags estão configuradas corretamente para produção no Render.com
- [ ] Features não finalizadas estão com flag = false em produção

## Rollback Plan
- [ ] Documentado o que fazer se a feature quebrar em produção
- [ ] Migration rollback preparada (se aplicável)

## Após Deploy em Produção
- [ ] Monitor Render dashboard por 15 minutos após deploy
- [ ] `curl https://[prod-url]/health` retorna 200
- [ ] Nenhum aumento anormal de erros no Sentry
- [ ] Marcar todas as stories relacionadas como [x] Done
