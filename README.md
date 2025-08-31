# 🎬 Cortaí - SaaS de Reaproveitamento de Conteúdo

> **Transforme seus vídeos longos do YouTube em conteúdo viral**  
> Plataforma de IA que converte vídeos ≥10 min em 8-12 clipes otimizados + blog posts automáticos

## 🚀 Visão Geral

Cortaí é uma plataforma SaaS que utiliza IA avançada para:

- ✨ **Converter vídeos longos** do YouTube em 8-12 clipes de 30-90s (1080×1920)
- 📝 **Gerar textos automáticos**: títulos, descrições, hashtags otimizadas
- 📰 **Criar blog posts** de 800-1200 palavras automaticamente
- 🚀 **Upload direto** para YouTube Shorts e outras redes sociais
- 🔥 **IA otimizada** para identificar trechos com potencial viral

## 🛠 Stack Tecnológica

### Frontend
- **React 18** + **TypeScript** + **Vite**
- **Tailwind CSS** + **shadcn/ui** (design system)
- **Supabase** (database + auth + storage)

### Backend (Planejado)
- **Supabase Edge Functions** (serverless)
- **PostgreSQL** (Supabase)
- **Whisper large-v3** (transcrição)
- **FFmpeg + libass** (renderização de vídeos)
- **YouTube Data API** (upload de Shorts)
- **Redis + BullMQ** (filas de processamento)
- **Cloudflare R2** (armazenamento de mídia)

### Integrações
- **Stripe** (pagamentos por minutos processados)
- **PostHog** (analytics)
- **Clerk/NextAuth** (autenticação)

## 🏗 Estrutura do Projeto

```
cortai/
├── src/
│   ├── components/          # Componentes React
│   │   ├── ui/             # shadcn/ui components
│   │   ├── Hero.tsx        # Seção hero da landing
│   │   ├── Features.tsx    # Grid de recursos
│   │   ├── Pricing.tsx     # Planos de preço
│   │   └── ...
│   ├── pages/              # Páginas da aplicação
│   ├── assets/             # Imagens e recursos
│   └── integrations/       # Supabase config
├── supabase/               # Database schema & functions
└── README.md              # Este arquivo
```

## 🎯 Fluxo do Usuário

1. **Input**: Usuário fornece link do YouTube + confirma direitos
2. **Processamento**: 
   - Transcrição com Whisper
   - Análise e ranking de trechos
   - Renderização de clipes com legendas
   - Geração de textos otimizados
3. **Review**: Usuário revisa clipes + textos + blog
4. **Publicação**: Upload automático para YouTube Shorts

## 🏁 Quick Start

```bash
# Clone o repositório
git clone <repository-url>
cd cortai

# Instale dependências
npm install

# Configure variáveis de ambiente
cp .env.example .env.local
# Edite .env.local com suas credenciais

# Execute em desenvolvimento
npm run dev
```

## 📋 TODO List

### Fase 1 - MVP Frontend ✅
- [x] Design system + componentes UI
- [x] Landing page responsiva
- [x] Seções: Hero, Features, Pricing, How it Works
- [x] Integração Supabase básica

### Fase 2 - Autenticação & Dashboard
- [ ] Sistema de auth (Clerk ou Supabase Auth)
- [ ] Dashboard do usuário
- [ ] Upload de vídeos
- [ ] Histórico de processamentos

### Fase 3 - Pipeline de Processamento
- [ ] Edge Functions para processamento
- [ ] Integração Whisper API
- [ ] Sistema de filas (Redis + BullMQ)
- [ ] Renderização de vídeos (FFmpeg)

### Fase 4 - IA & Automação
- [ ] IA para ranking de trechos
- [ ] Geração automática de textos
- [ ] Integração YouTube Data API
- [ ] Upload automático

### Fase 5 - Monetização
- [ ] Integração Stripe
- [ ] Sistema de planos por minutos
- [ ] Analytics avançados
- [ ] API para desenvolvedores

## 🔧 Configuração de Desenvolvimento

### Variáveis de Ambiente Necessárias

```bash
# Supabase
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Autenticação (escolha uma)
CLERK_PUBLISHABLE_KEY=your_clerk_key
# ou
NEXTAUTH_URL=your_app_url
NEXTAUTH_SECRET=your_secret

# APIs Externas
OPENAI_API_KEY=your_openai_key
YOUTUBE_CLIENT_ID=your_youtube_client_id
YOUTUBE_CLIENT_SECRET=your_youtube_client_secret

# Stripe
STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_webhook_secret

# Storage
CLOUDFLARE_R2_ACCESS_KEY=your_r2_access_key
CLOUDFLARE_R2_SECRET_KEY=your_r2_secret_key
CLOUDFLARE_R2_BUCKET=your_bucket_name

# Analytics
POSTHOG_KEY=your_posthog_key

# Redis (produção)
REDIS_URL=your_redis_url
```

## 📊 Logs & Monitoramento

O sistema inclui logging detalhado em cada etapa:

- **Transcribing** → Whisper processando áudio
- **Ranking** → IA analisando melhores trechos  
- **Rendering** → FFmpeg gerando clipes
- **Exporting** → Upload para redes sociais

## 🔐 Segurança & Compliance

- ✅ Confirmação de direitos autorais no onboarding
- ✅ Validação de URLs do YouTube
- ✅ Limpeza automática de arquivos temporários
- ✅ Versionamento de mídia no S3
- ✅ Jobs idempotentes com retry automático

## 🚀 Deploy

### Supabase (Database)
```bash
npx supabase deploy
```

### Vercel/Netlify (Frontend)
```bash
npm run build
```

### Cloudflare Workers (Edge Functions)
```bash
npm run deploy:workers
```

## 📈 Métricas de Sucesso

- **Performance**: Processamento < 5 min para vídeos de 1h
- **Qualidade**: Taxa de viral > 15% dos clipes gerados
- **Retenção**: Usuários ativos mensais 80%+
- **Revenue**: $50k MRR em 6 meses

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -m 'Add nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## 📝 Licença

Este projeto está sob a licença MIT. Veja `LICENSE` para mais detalhes.

## 📞 Contato

- **Website**: [cortai.com](https://cortai.com)
- **Email**: contato@cortai.com
- **Twitter**: [@cortai_oficial](https://twitter.com/cortai_oficial)

---

**💡 Dica**: Este é um projeto ambicioso! Comece com o MVP e evolua iterativamente. A IA e automação podem ser implementadas gradualmente.
