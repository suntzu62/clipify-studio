# 📱 Instagram Reels Integration Setup Guide

Este guia explica como configurar a integração com Instagram Reels no Clipify Studio.

## 🎯 Overview

A integração permite que usuários publiquem clipes diretamente como Instagram Reels através do Clipify Studio.

**Tecnologias:**
- Meta Graph API v18.0
- Instagram Content Publishing API
- OAuth 2.0 Authentication

---

## 📋 Pré-requisitos

1. **Conta Meta for Developers:**
   - Criar em: https://developers.facebook.com/

2. **Página do Facebook:**
   - Necessária para vincular conta Instagram Business

3. **Conta Instagram Business:**
   - Converter sua conta para Business/Creator
   - Vincular à Página do Facebook

---

## 🔧 Passo 1: Criar App no Meta for Developers

### 1.1 Criar Novo App

1. Acesse https://developers.facebook.com/apps/
2. Clique em **"Create App"**
3. Selecione **"Business"** como tipo
4. Preencha os detalhes:
   - **App Name:** Clipify Studio (ou seu nome)
   - **Contact Email:** seu-email@exemplo.com
   - **Business Account:** Selecione ou crie uma

### 1.2 Adicionar Produtos

No dashboard do app, adicione os produtos:

1. **Instagram Graph API**
   - Clique em "Set Up" no card do Instagram

2. **Facebook Login**
   - Necessário para OAuth flow

---

## 🔐 Passo 2: Configurar Instagram Graph API

### 2.1 Configurações Básicas

1. Vá para **Dashboard > Settings > Basic**

2. Anote os valores:
   ```
   App ID: 123456789
   App Secret: abc123def456...
   ```

3. Adicione o **App Domain:**
   ```
   localhost (para desenvolvimento)
   seu-dominio.com (para produção)
   ```

### 2.2 Configurar OAuth Redirect URIs

1. Vá para **Facebook Login > Settings**

2. Adicione **Valid OAuth Redirect URIs:**
   ```
   http://localhost:3001/auth/instagram/callback
   https://seu-dominio.com/auth/instagram/callback
   ```

3. Salve as alterações

---

## 🎨 Passo 3: Vincular Instagram Business Account

### 3.1 Adicionar Instagram Tester

1. Vá para **Instagram Graph API > Settings**
2. Clique em **"Add Instagram Business Account"**
3. Conecte sua conta Instagram Business
4. Adicione usuários de teste se necessário

### 3.2 Verificar Permissões

Certifique-se de ter as permissões:
- ✅ `instagram_basic`
- ✅ `instagram_content_publish`
- ✅ `pages_show_list`
- ✅ `pages_read_engagement`

---

## ⚙️ Passo 4: Configurar Variáveis de Ambiente

### 4.1 Adicionar Credenciais ao `.env`

Edite `backend-v2/.env`:

```bash
# Instagram API (para publicação de Reels)
INSTAGRAM_CLIENT_ID=123456789                    # App ID do Meta
INSTAGRAM_CLIENT_SECRET=abc123def456...          # App Secret do Meta
INSTAGRAM_REDIRECT_URI=http://localhost:3001/auth/instagram/callback
```

### 4.2 Reiniciar Backend

```bash
cd backend-v2
npm run dev
```

---

## 🚀 Passo 5: Testar Autenticação

### 5.1 Iniciar OAuth Flow

**Request:**
```bash
GET http://localhost:3001/auth/instagram/authorize?userId=user123
```

**Response:**
```json
{
  "authorizationUrl": "https://www.facebook.com/v18.0/dialog/oauth?client_id=...",
  "state": "uuid-here"
}
```

### 5.2 Abrir URL de Autorização

1. Abra a `authorizationUrl` no navegador
2. Faça login com Facebook
3. Autorize as permissões
4. Você será redirecionado para `/auth/instagram/callback`

### 5.3 Verificar Conexão

**Request:**
```bash
GET http://localhost:3001/social/accounts/user123
Headers:
  X-API-Key: 93560857g
```

**Response:**
```json
{
  "accounts": [
    {
      "platform": "instagram",
      "accountId": "17841...",
      "accountName": "MinhaConta",
      "connected": true,
      "expiresAt": "2025-01-05T..."
    }
  ]
}
```

---

## 📤 Passo 6: Publicar Reel

### 6.1 Preparar Metadata

```json
{
  "jobId": "job_abc123",
  "userId": "user123",
  "metadata": {
    "title": "",
    "description": "Confira este vídeo incrível!",
    "hashtags": ["shorts", "viral", "trending"],
    "visibility": "public"
  }
}
```

### 6.2 Fazer Request de Publicação

**Request:**
```bash
POST http://localhost:3001/clips/clip-0/publish-instagram
Headers:
  X-API-Key: 93560857g
  Content-Type: application/json
Body: (metadata acima)
```

**Response Success:**
```json
{
  "success": true,
  "platform": "instagram",
  "url": "https://www.instagram.com/reel/ABC123/",
  "platformId": "17841..."
}
```

**Response Error:**
```json
{
  "error": "NOT_AUTHENTICATED",
  "message": "Instagram account not connected. Please authenticate first."
}
```

---

## 🔍 Troubleshooting

### Erro: "Invalid OAuth Redirect URI"

**Solução:**
- Verifique se a URI no `.env` está exatamente igual à configurada no Meta
- Certifique-se de salvar as alterações no Meta Dashboard

### Erro: "Insufficient Permissions"

**Solução:**
- Revogue e reconecte a conta
- Certifique-se de que todas as permissões foram concedidas
- Verifique se a conta Instagram é Business/Creator

### Erro: "Invalid Video URL"

**Problema:** Instagram precisa de URL pública para o vídeo

**Solução Temporária:**
- Fazer upload do vídeo para CDN/S3
- Passar URL pública para a API

**Solução Permanente (TODO):**
1. Upload automático para S3/CloudFlare
2. Gerar URL pública temporária
3. Passar para Instagram API

### Erro: "Video Processing Failed"

**Possíveis causas:**
- Vídeo muito longo (>90s)
- Arquivo muito grande (>1GB)
- Formato não suportado
- Aspect ratio incorreto (deve ser 9:16)

---

## 📊 Limites da API do Instagram

| Limite | Valor |
|--------|-------|
| Duração máxima | 90 segundos |
| Tamanho máximo | 1GB |
| Formatos aceitos | MP4, MOV |
| Aspect ratio | 9:16 (vertical) |
| Caption máximo | 2.200 caracteres |
| Hashtags máximas | 30 |

---

## 🔒 Segurança

### Tokens

- **Short-lived tokens:** Válidos por 1 hora
- **Long-lived tokens:** Válidos por 60 dias
- **Auto-refresh:** Implementado para renovar tokens automaticamente

### Armazenamento

Atualmente os tokens são armazenados no **Redis**.

**Para produção, recomenda-se:**
1. Criar tabela `social_accounts` no Supabase
2. Criptografar tokens antes de salvar
3. Implementar rotação automática de tokens

---

## 📚 Referências

- [Instagram Content Publishing API](https://developers.facebook.com/docs/instagram-api/guides/content-publishing)
- [Instagram Reels Publishing](https://developers.facebook.com/docs/instagram-api/guides/reels-publishing)
- [Meta Graph API](https://developers.facebook.com/docs/graph-api)
- [OAuth 2.0 Guide](https://developers.facebook.com/docs/facebook-login/manually-build-a-login-flow)

---

## 🎯 Próximos Passos

- [ ] Implementar upload automático para CDN
- [ ] Criar interface de gerenciamento de contas no frontend
- [ ] Adicionar agendamento de publicações
- [ ] Implementar analytics de publicações
- [ ] Adicionar suporte para Stories
- [ ] Implementar YouTube Shorts
- [ ] Implementar TikTok

---

## 💡 Dicas

1. **Teste em Modo Sandbox primeiro**
2. **Use contas de teste** antes de conectar contas reais
3. **Monitore os logs** para debugging
4. **Verifique limites de rate** da API

---

## 🆘 Suporte

- **Documentação:** [Instagram API Docs](https://developers.facebook.com/docs/instagram-api)
- **Community:** [Meta Developer Community](https://developers.facebook.com/community/)
- **Status:** [Meta API Status](https://developers.facebook.com/status/)
