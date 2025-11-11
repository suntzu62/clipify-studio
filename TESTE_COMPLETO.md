# ✅ Guia de Teste Completo - Clipify Studio

Este guia ajuda a testar **todas as funcionalidades** implementadas no Clipify Studio.

---

## 🚀 Fase 4: Teste End-to-End

### 📋 **Pré-requisitos**

**Backend:**
```bash
cd clipify-studio/backend-v2
npm run dev
```

**Frontend:**
```bash
cd clipify-studio
npm run dev
```

**Acesse:**
- Frontend: http://localhost:8080
- Backend: http://localhost:3001

---

## 🎬 Teste 1: Geração de Clipes com Novas Legendas

### **Objetivo:**
Verificar se os clipes são gerados com legendas **grandes (32px)**, **posicionadas na parte inferior**, com **sombra e contorno**.

### **Passos:**

#### 1. Criar Novo Job
1. Acesse http://localhost:8080
2. Cole URL do YouTube (escolha um vídeo com falas claras)
   ```
   Exemplo: https://www.youtube.com/watch?v=dQw4w9WgXcQ
   ```
3. Clique em **"Gerar Clipes"**

#### 2. Acompanhar Processamento
- ⏳ **Downloading:** Download do vídeo do YouTube
- ⏳ **Transcribing:** Transcrição com Whisper
- ⏳ **Analyzing:** Análise de highlights
- ⏳ **Rendering:** **AQUI AS LEGENDAS SÃO APLICADAS!**
- ⏳ **Uploading:** Upload para Supabase

**Tempo esperado:** 2-4 minutos (dependendo do vídeo)

#### 3. Verificar Clipes Gerados
Quando o status mudar para **"Completed"**:

✅ **Ver os cards dos clipes:**
- Badge **"Pronto"** em verde
- Thumbnail do vídeo
- Título do clipe
- Descrição
- Hashtags

✅ **Verificar botões:**
- **"Baixar Vídeo"** - Habilitado
- **"Legendas"** - Habilitado (ícone de engrenagem)
- **"YT"** - YouTube (habilitado)
- **"TT"** - TikTok (habilitado, mas mostra "Em breve")
- **"IG"** - Instagram (habilitado, mas mostra "Em breve")

#### 4. Reproduzir Vídeo
1. Clique no **card do clipe**
2. Modal se abre com o player
3. Vídeo deve começar a tocar

**O QUE VERIFICAR:**
- ✅ Vídeo carrega sem erros
- ✅ **Legendas aparecem na PARTE INFERIOR**
- ✅ **Tamanho da fonte é GRANDE (32px)**
- ✅ Legendas têm **CONTORNO PRETO (3px)**
- ✅ Legendas têm **SOMBRA**
- ✅ **Fundo preto semi-transparente** (85% opacidade)
- ✅ Texto **BRANCO**
- ✅ **Linhas curtas** (máx. 28 caracteres por linha)
- ✅ **Espaço adequado** da borda inferior (80px)

**Console sem erros:**
- ❌ Sem `aria-describedby` warnings
- ❌ Sem erros 401/403
- ✅ Video load started
- ✅ Video data loaded

---

## 🎨 Teste 2: Personalização de Legendas

### **Objetivo:**
Verificar se o usuário consegue personalizar legendas e salvar preferências.

### **Passos:**

#### 1. Abrir Personalizador
1. Em um clipe pronto, clique no botão **"Legendas"** (ícone de engrenagem)
2. Modal **"Personalizar Legendas"** deve abrir

#### 2. Verificar Interface
A interface deve ter:

**Seção 1: Posicionamento**
- Dropdown com opções: Topo / Centro / Inferior
- Default: **Inferior** ✅

**Seção 2: Formato de Exibição**
- Linha Única
- Múltiplas Linhas ✅ (default)
- Efeito Karaokê
- Animação Progressiva

**Seção 3: Fonte**
- Dropdown: Arial, Inter ✅, Roboto, Montserrat, Poppins
- Slider de tamanho: 16-48px (default: **32px** ✅)

**Seção 4: Cores**
- Cor do Texto (picker + hex input)
- Cor do Fundo (picker + hex input)
- Opacidade do fundo (slider 0-100%)

**Seção 5: Estilo**
- Switch: Negrito ✅
- Switch: Itálico
- Switch: Contorno ✅ (com cor e largura)
- Switch: Sombra ✅ (com cor)

**Seção 6: Avançado**
- Máx. caracteres por linha (slider)
- Margem vertical (slider)

**Botões:**
- **"Aplicar Legendas"** - Salvar
- **"Resetar"** - Voltar ao padrão
- **"Cancelar"** - Fechar sem salvar

#### 3. Testar Mudanças
1. Mude o posicionamento para **"Topo"**
2. Mude o tamanho da fonte para **40px**
3. Mude a cor do texto para **Amarelo (#FFFF00)**
4. Clique em **"Aplicar Legendas"**

**Esperado:**
- Toast: "Preferências salvas! Regere o vídeo para aplicar"
- Modal fecha
- Preferências salvas no Redis (expiram em 7 dias)

#### 4. Verificar Salvamento
```bash
# Verificar no backend (opcional)
curl -H "X-API-Key: 93560857g" \
  http://localhost:3001/jobs/JOB_ID/clips/CLIP_ID/subtitle-settings
```

**Nota:** Para aplicar as mudanças, seria necessário **re-renderizar** o clipe, que ainda não está implementado.

---

## 🔽 Teste 3: Download de Vídeos

### **Objetivo:**
Verificar se o download funciona corretamente.

### **Passos:**

#### 1. Clicar em "Baixar Vídeo"
1. Em um clipe pronto, clique em **"Baixar Vídeo"**
2. Deve abrir em nova aba ou iniciar download

**Esperado:**
- ✅ Vídeo baixa corretamente
- ✅ Toast: "Download iniciado!"
- ✅ Arquivo .mp4 válido
- ✅ Legendas **embarcadas** no vídeo (não é SRT separado!)

#### 2. Reproduzir Vídeo Baixado
1. Abra o arquivo .mp4 no VLC ou player de sua preferência
2. Verifique se as legendas aparecem
3. Verifique posição, tamanho e estilo

---

## 📋 Teste 4: Copiar Metadados

### **Objetivo:**
Verificar se copiar título/descrição/hashtags funciona.

### **Passos:**

#### 1. Copiar Título
1. Clique no botão **"Título"**
2. Toast: "Título copiado!"
3. Cole em qualquer lugar (Ctrl+V)
4. Verificar se o texto colado é o título do clipe

#### 2. Copiar Descrição
1. Clique no botão **"Desc"**
2. Toast: "Descrição copiado!"
3. Verificar clipboard

#### 3. Copiar Hashtags
1. Clique no botão **"Tags"**
2. Toast: "Hashtags copiado!"
3. Cole e verifique formato: `#tag1 #tag2 #tag3`

---

## ⏱️ Teste 5: Estados de Loading

### **Objetivo:**
Verificar feedback visual durante ações.

### **Passos:**

#### 1. Loading no Download
1. Clique em **"Baixar Vídeo"**
2. Durante o download, botão deve mostrar:
   - Spinner no lugar do ícone
   - Desabilitado (não pode clicar novamente)

#### 2. Loading na Publicação
1. Clique em **"YT"** (YouTube)
2. Durante publicação (simulada):
   - Spinner animado
   - Botão desabilitado
   - Toast de progresso

#### 3. Estados de Processamento
- **"Em processamento"** → Card cinza com loader
- **"Pronto"** → Card normal com badge verde
- **"Falhou"** → Card vermelho com mensagem de erro

---

## 🔍 Teste 6: Tooltips e Acessibilidade

### **Objetivo:**
Verificar que todos os elementos têm feedback adequado.

### **Passos:**

#### 1. Passar Mouse nos Botões
Ao passar o mouse, tooltip deve aparecer com:
- **"Baixar"** → Tooltip explicativo
- **"Legendas"** → "Personalizar legendas"
- **"YT"** → "Publicar no YouTube" ou "Já publicado no YouTube"
- **"TT"** → "Em breve: TikTok"
- **"IG"** → "Em breve: Instagram"

#### 2. Verificar Console (F12)
Não deve haver:
- ❌ Warnings de `aria-describedby`
- ❌ Erros de props
- ❌ Erros de network (exceto se não autenticado em redes sociais)

---

## 🎯 Teste 7: Status e Validações

### **Objetivo:**
Verificar que botões são desabilitados quando apropriado.

### **Passos:**

#### 1. Clipe em Processamento
Quando o clipe está sendo renderizado:
- ❌ **"Baixar"** - DESABILITADO
- ❌ **"Legendas"** - DESABILITADO
- ❌ **"YT/TT/IG"** - DESABILITADOS
- ❌ **"Copiar"** - HABILITADOS (funcionam)

**Tooltip ao passar mouse:** "Aguardando processamento..."

#### 2. Clipe Pronto
Quando o clipe está pronto:
- ✅ **Todos os botões** - HABILITADOS
- ✅ Badges de status - "Pronto" em verde

---

## 📊 Teste 8: Performance e Velocidade

### **Objetivo:**
Verificar se o sistema é mais rápido que OpusClip (~2 minutos).

### **Passos:**

#### 1. Medir Tempo Total
1. Anotar timestamp ao clicar em "Gerar Clipes"
2. Anotar timestamp quando o primeiro clipe ficar "Pronto"
3. Calcular diferença

**Meta:** ≤ 2 minutos para vídeo de 10-15 minutos

#### 2. Verificar Logs
No terminal do backend, verificar:
```
[useClipList] Processing JobResult...
[rendering] Rendering all clips in parallel
[rendering] Clip rendering completed
```

**Esperado:**
- ✅ Renderização em **paralelo** (todos os clipes ao mesmo tempo)
- ✅ Preset **ultrafast** sendo usado
- ✅ Sem erros ou retries desnecessários

---

## 🐛 Troubleshooting

### Problema: Vídeo não carrega
**Sintomas:** Player mostra "Vídeo não disponível"

**Soluções:**
1. Verificar console: deve ter URL do vídeo
2. Verificar bucket do Supabase está público
3. Verificar proxy do backend: `GET /clips/JOB_ID/clip-0.mp4`
4. Verificar logs do backend para erros

### Problema: Legendas muito pequenas
**Sintomas:** Legendas aparecem mas são difíceis de ler

**Causa:** Backend não reiniciado após mudanças

**Solução:**
1. Parar backend (Ctrl+C)
2. `cd backend-v2 && npm run dev`
3. Criar **NOVO** job (vídeos antigos têm legendas antigas)

### Problema: Botões desabilitados
**Sintomas:** Não consigo clicar em nada

**Causa:** `clip.status !== 'ready'`

**Solução:**
1. Aguardar processamento completar
2. Verificar se job status é "completed"
3. Verificar logs para erros de renderização

### Problema: Download não funciona
**Sintomas:** Ao clicar em baixar, nada acontece

**Soluções:**
1. Verificar console para erros
2. Verificar se `clip.downloadUrl` existe
3. Testar URL diretamente no navegador
4. Verificar permissões CORS

### Problema: Erro 401 ao reproduzir vídeo
**Sintomas:** Console mostra `HEAD /clips/... 401 Unauthorized`

**Causa:** Middleware de autenticação bloqueando proxy

**Solução:**
Verificar `backend-v2/src/index.ts` linha 35:
```typescript
if (request.url === '/health' || request.url.startsWith('/clips/')) {
  return; // ✅ Deve permitir sem auth
}
```

---

## ✅ Checklist Final

Após todos os testes, verificar:

- [ ] ✅ Clipes são gerados com sucesso
- [ ] ✅ Legendas aparecem na parte inferior
- [ ] ✅ Legendas são grandes e legíveis (32px)
- [ ] ✅ Legendas têm contorno e sombra
- [ ] ✅ Vídeos reproduzem sem erros
- [ ] ✅ Download funciona corretamente
- [ ] ✅ Copiar metadados funciona
- [ ] ✅ Tooltips aparecem ao passar mouse
- [ ] ✅ Botões são desabilitados quando apropriado
- [ ] ✅ Loading states aparecem
- [ ] ✅ Console sem erros de acessibilidade
- [ ] ✅ Performance ≤ 2 minutos
- [ ] ✅ Interface de personalização abre
- [ ] ✅ Preferências são salvas

---

## 📝 Relatório de Testes

Após executar todos os testes, preencha:

```
Data: ___/___/2024
Testador: _____________

Teste 1 (Geração): [ ] PASS [ ] FAIL
Teste 2 (Personalização): [ ] PASS [ ] FAIL
Teste 3 (Download): [ ] PASS [ ] FAIL
Teste 4 (Metadados): [ ] PASS [ ] FAIL
Teste 5 (Loading): [ ] PASS [ ] FAIL
Teste 6 (Tooltips): [ ] PASS [ ] FAIL
Teste 7 (Validações): [ ] PASS [ ] FAIL
Teste 8 (Performance): [ ] PASS [ ] FAIL

Tempo total de processamento: ___ min ___ seg

Observações:
_________________________________
_________________________________
_________________________________
```

---

## 🎯 Próximos Testes (Futuro)

Quando implementar:
- [ ] Teste de OAuth do Instagram
- [ ] Teste de publicação no Instagram
- [ ] Teste de upload para CDN
- [ ] Teste de múltiplas contas
- [ ] Teste de agendamento
- [ ] Teste de analytics

---

## 📚 Referências

- [Guia de Setup do Instagram](backend-v2/INSTAGRAM_SETUP.md)
- [TODO Instagram](TODO_INSTAGRAM.md)
- [Documentação do Clipify Studio](README.md)
