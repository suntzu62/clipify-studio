# 🛠️ Guia de Correção: Cortaí Production Issues

## 📋 Resumo dos Problemas

Baseado na análise dos logs e screenshots, identificamos **3 problemas críticos**:

1. **Workers API não configurada** - `workers_api_not_configured`
2. **SSE retornando `jobResult undefined`** - Conexão falha
3. **Jobs em loop infinito** - "Creating placeholder clips"

## 🚀 Soluções Passo a Passo

### **ETAPA 1: Configurar Workers API no Render/Railway**

#### 1.1 Verificar Deploy dos Workers
```bash
# No seu terminal local, verificar se os workers estão buildando
cd /home/usuario/Documentos/cortai/clipify-studio/workers
npm run build

# Se OK, fazer deploy para produção
git add .
git commit -m "fix: production issues - workers ready"
git push origin main
```

#### 1.2 Configurar Environment Variables no Supabase
No **Supabase Dashboard** → **Edge Functions** → **Settings**, adicionar:

```env
WORKERS_API_URL=https://SEU-APP-NAME.onrender.com
WORKERS_API_KEY=sua-chave-secreta-workers
```

**❗ IMPORTANTE**: Substitua `SEU-APP-NAME` pela URL real do seu deploy no Render.

#### 1.3 Verificar no Render Dashboard
1. Acesse seu app no Render
2. Verifique se está **deployado** e **rodando**
3. Anote a URL (ex: `https://cortai-workers.onrender.com`)
4. Configure environment variables no Render:
   ```env
   WORKERS_API_KEY=uma-chave-secreta-forte
   REDIS_URL=sua-url-redis
   SUPABASE_URL=https://qibjqqucmbrtuirysexl.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
   ```

---

### **ETAPA 2: Corrigir Workers Endpoint**

#### 2.1 Adicionar Health Check Endpoint
O script de diagnóstico precisa de um endpoint `/health`. Vou adicionar:

```typescript
// Em workers/src/server.ts, adicione este endpoint:
app.get('/health', async (req: any, res: any) => {
  res.send({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    redis: connection.status === 'ready' ? 'connected' : 'disconnected'
  });
});
```

#### 2.2 Adicionar Queue Health Check
```typescript
// Também em workers/src/server.ts:
app.get('/api/health/queue', { preHandler: apiKeyGuard }, async (req: any, res: any) => {
  try {
    const ingestQueue = getQueue(QUEUES.INGEST);
    const waiting = await ingestQueue.getWaiting();
    const active = await ingestQueue.getActive();
    
    res.send({
      status: 'healthy',
      queues: {
        ingest: { waiting: waiting.length, active: active.length }
      },
      redis: connection.status
    });
  } catch (error) {
    res.code(500).send({ status: 'unhealthy', error: error.message });
  }
});
```

---

### **ETAPA 3: Testar e Diagnosticar**

#### 3.1 Executar Script de Diagnóstico
```bash
# Configure as URLs no script primeiro
cd /home/usuario/Documentos/cortai/clipify-studio
node debug-production.js
```

#### 3.2 Se Falhar: Debug Manual
```bash
# Teste direto a URL dos workers
curl https://SEU-APP-NAME.onrender.com/health

# Teste o Supabase
curl -X POST https://qibjqqucmbrtuirysexl.supabase.co/functions/v1/enqueue-pipeline \
  -H "Content-Type: application/json" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{"youtubeUrl":"https://youtube.com/watch?v=test"}'
```

---

### **ETAPA 4: Resolver Problemas Específicos**

#### 4.1 Se "workers_api_not_configured"
✅ **Solução**: Configure `WORKERS_API_URL` e `WORKERS_API_KEY` no Supabase

#### 4.2 Se "jobResult undefined"
✅ **Solução**: Workers não estão retornando dados corretos
- Verificar se Redis está conectado
- Verificar se jobs estão sendo criados
- Verificar logs do workers no Render

#### 4.3 Se "Creating placeholder clips" em loop
✅ **Solução**: Já corrigimos isso nos workers
- Verificar se a versão mais recente está deployada
- Verificar se `hasExistingClips` está funcionando

---

### **ETAPA 5: Validação Final**

#### 5.1 Teste End-to-End
1. Cole uma URL do YouTube no frontend
2. Verificar se o job é criado (sem erro)
3. Verificar se o progresso aparece
4. Verificar se clips são gerados

#### 5.2 Monitoramento
- Verificar logs no Render Dashboard
- Verificar logs no Supabase Edge Functions
- Verificar se Redis está funcionando

---

## 🔧 Comandos de Emergência

### Deploy Rápido dos Workers
```bash
cd workers
npm run build
git add . && git commit -m "fix: production hotfix"
git push origin main
```

### Restart do Render
No Render Dashboard:
1. Clique em "Manual Deploy"
2. Ou "Restart Service"

### Verificar Logs
```bash
# Render Dashboard → Logs
# Supabase Dashboard → Edge Functions → Logs
```

---

## 📋 Checklist de Verificação

- [ ] Workers deployados no Render/Railway
- [ ] `WORKERS_API_URL` configurado no Supabase
- [ ] `WORKERS_API_KEY` configurado no Supabase  
- [ ] Redis conectado nos workers
- [ ] Health endpoints funcionando
- [ ] Script de diagnóstico passando
- [ ] Teste end-to-end funcionando

---

## 🆘 Se Ainda Não Funcionar

1. **Execute o script de diagnóstico** com as URLs reais
2. **Compartilhe os logs** do Render e Supabase
3. **Verifique se todas as environment variables** estão corretas
4. **Considere usar Railway** se Render está dando problemas

**O script de diagnóstico vai identificar exatamente onde está o problema!** 🎯
