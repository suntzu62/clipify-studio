# 📝 TODO: Instagram Integration

## 🚨 Crítico (Bloqueante)

### 1. Upload de Vídeos para CDN ⚠️
**Prioridade:** ALTA

**Problema:**
Instagram Graph API requer URL pública para o vídeo. Atualmente estamos tentando usar arquivo local.

**Solução:**
```typescript
// Opção 1: Upload para Supabase Storage (Public Bucket)
const { data, error } = await supabase.storage
  .from('public-videos')  // Bucket público
  .upload(`tmp/${clipId}.mp4`, videoFile, {
    contentType: 'video/mp4',
    cacheControl: '3600',
  });

const publicUrl = supabase.storage
  .from('public-videos')
  .getPublicUrl(`tmp/${clipId}.mp4`).data.publicUrl;

// Passar publicUrl para Instagram API
```

**Tarefas:**
- [ ] Criar bucket público `public-videos` no Supabase
- [ ] Implementar upload temporário (TTL 24h)
- [ ] Atualizar `InstagramPlatform.createMediaContainer()`
- [ ] Adicionar limpeza automática de arquivos temporários

---

### 2. Frontend - Modal de Conexão de Contas 🎨
**Prioridade:** ALTA

**O Que Criar:**
```tsx
// src/components/social/ConnectAccountModal.tsx
- Modal para conectar contas sociais
- Botões para Instagram, YouTube, TikTok
- Exibir contas já conectadas
- Botão para desconectar

// src/components/social/SocialAccountButton.tsx
- Botão individual para cada plataforma
- Status (conectado/desconectado)
- Ícone da plataforma
```

**Tarefas:**
- [ ] Criar `ConnectAccountModal.tsx`
- [ ] Criar `SocialAccountButton.tsx`
- [ ] Integrar com API `/auth/instagram/authorize`
- [ ] Adicionar no menu ou settings do app

---

### 3. Atualizar useClipActions Hook 🔌
**Prioridade:** MÉDIA

**Modificações:**
```typescript
// src/hooks/useClipActions.ts

const handlePublish = async (platform: SocialPlatform) => {
  // Verificar se está conectado
  const accounts = await fetchSocialAccounts(userId);
  const account = accounts.find(a => a.platform === platform);

  if (!account?.connected) {
    // Abrir modal de conexão
    openConnectAccountModal(platform);
    return;
  }

  // Publicar
  const response = await fetch(
    `http://localhost:3001/clips/${clipId}/publish-${platform}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        jobId,
        userId,
        metadata: {
          description,
          hashtags,
        },
      }),
    }
  );

  // Atualizar histórico
  if (response.ok) {
    const result = await response.json();
    toast.success(`Publicado no ${platform}!`, {
      action: {
        label: 'Ver Reel',
        onClick: () => window.open(result.url, '_blank'),
      },
    });
  }
};
```

**Tarefas:**
- [ ] Adicionar `fetchSocialAccounts()`
- [ ] Atualizar `handlePublish()`
- [ ] Adicionar verificação de conexão
- [ ] Implementar modal de conexão
- [ ] Melhorar feedback de publicação

---

## 🎯 Importante (Não Bloqueante)

### 4. Migrar Armazenamento para Banco de Dados 💾
**Prioridade:** MÉDIA

**Criar Tabela:**
```sql
CREATE TABLE social_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  platform VARCHAR(20) NOT NULL,
  account_id VARCHAR(255),
  account_name VARCHAR(255),
  access_token TEXT NOT NULL,  -- Criptografar!
  refresh_token TEXT,
  expires_at TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

CREATE TABLE publications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clip_id VARCHAR(255) NOT NULL,
  job_id VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  platform VARCHAR(20) NOT NULL,
  platform_id VARCHAR(255),
  url TEXT,
  metadata JSONB,
  published_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'published'
);
```

**Tarefas:**
- [ ] Criar migrations no Supabase
- [ ] Implementar criptografia de tokens
- [ ] Migrar código do Redis para Supabase
- [ ] Adicionar índices para performance

---

### 5. Implementar Agendamento de Publicações ⏰
**Prioridade:** BAIXA

**Features:**
- Agendar publicação para data/hora específica
- Fila de publicações
- Retry automático em caso de falha

**Tarefas:**
- [ ] Criar tabela `scheduled_publications`
- [ ] Implementar worker de agendamento
- [ ] Adicionar UI de agendamento
- [ ] Notificar usuário quando publicado

---

### 6. Analytics de Publicações 📊
**Prioridade:** BAIXA

**Features:**
- Visualizações, likes, comentários
- Gráficos de performance
- Comparação entre plataformas

**Tarefas:**
- [ ] Integrar com Instagram Insights API
- [ ] Criar dashboard de analytics
- [ ] Implementar cron job para atualizar dados
- [ ] Adicionar exportação de relatórios

---

## 🔮 Futuro

### 7. YouTube Shorts
- [ ] Implementar `YouTubePlatform`
- [ ] OAuth com Google
- [ ] Upload de Shorts via YouTube Data API

### 8. TikTok
- [ ] Implementar `TikTokPlatform`
- [ ] OAuth com TikTok
- [ ] Upload via TikTok Content Posting API

### 9. Stories no Instagram
- [ ] Adicionar suporte para Stories
- [ ] Formato 9:16 específico
- [ ] Duração máxima 15s

### 10. Múltiplas Contas
- [ ] Permitir conectar múltiplas contas da mesma plataforma
- [ ] Selector de conta ao publicar
- [ ] Gerenciamento de contas no dashboard

---

## ✅ Checklist para Deploy

Antes de fazer deploy em produção:

- [ ] Variáveis de ambiente configuradas
- [ ] Credenciais do Instagram obtidas e testadas
- [ ] Bucket público criado no Supabase
- [ ] Upload para CDN implementado
- [ ] Migrations do banco executadas
- [ ] Tokens criptografados
- [ ] Rate limiting implementado
- [ ] Monitoring configurado (Sentry, DataDog, etc.)
- [ ] Logs estruturados
- [ ] Testes E2E das integrações
- [ ] Documentação atualizada
- [ ] Termos de uso das APIs aceitos
- [ ] App em modo de produção no Meta

---

## 🆘 Troubleshooting Comum

### Erro: "The media_url provided is not available"
**Causa:** URL do vídeo não é pública ou está inacessível

**Solução:**
1. Verificar se o bucket é público
2. Testar se a URL abre no navegador
3. Verificar permissões CORS

### Erro: "Upload timeout"
**Causa:** Vídeo muito grande ou conexão lenta

**Solução:**
1. Otimizar vídeo antes do upload
2. Aumentar timeout da requisição
3. Usar CDN mais próximo

### Erro: "Invalid access token"
**Causa:** Token expirado ou inválido

**Solução:**
1. Implementar refresh automático
2. Forçar reconexão do usuário
3. Verificar se token está correto no banco

---

## 📚 Recursos

- [Instagram Content Publishing](https://developers.facebook.com/docs/instagram-api/guides/content-publishing)
- [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
- [Meta Status Dashboard](https://developers.facebook.com/status/)
