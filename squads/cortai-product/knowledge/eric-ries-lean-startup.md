# Eric Ries — The Lean Startup

**Background:** Autor de *The Lean Startup* (2011), conceito de MVP e Build-Measure-Learn
**Contribuição central:** MVP, validated learning, pivot vs. persevere, innovation accounting

---

## 1. Build-Measure-Learn Loop

### O Ciclo Fundamental
```
         LEARN
        ↗      ↘
   MEASURE    BUILD
        ↖      ↙
         (IDEA)
```

**O objetivo:** Minimizar o tempo de cada ciclo, não maximizar features.

### Para CortAI — Aplicando o Loop
```
Ideia: "Usuários querem publicar clips diretamente no TikTok"

BUILD: Landing page com botão "Publicar no TikTok" (fake feature)
MEASURE: Quantas pessoas clicam? (antes de construir)
LEARN: 60% clicam? Build. 5% clicam? Não build.
```

---

## 2. MVP (Minimum Viable Product)

### O Que é um MVP REAL
"O MVP não é o menor produto que você consegue construir. É o menor experimento que valida uma hipótese de negócio."

### Tipos de MVP
| Tipo | Descrição | Quando Usar |
|------|-----------|-------------|
| **Concierge MVP** | Serviço manual que simula o produto | Validar demanda antes de automatizar |
| **Wizard of Oz MVP** | Parece automático mas é manual por trás | Validar que usuários usariam |
| **Landing Page MVP** | Página de vendas sem produto | Validar interesse |
| **Fake Door MVP** | Botão/feature que redireciona para lista | Validar intenção |
| **Protótipo clicável** | Design navegável sem código | Validar UX |

### Para CortAI — MVPs Históricos por Feature

**TikTok Direct Publishing:**
1. Concierge MVP: Você baixa o clip e publica manualmente no TikTok do usuário
2. Fake Door: Botão "Publicar no TikTok" que mostra "Em breve — entre na lista"
3. Se validado: Construir integração real

**Virality Score:**
1. Wizard of Oz: Você analisa manualmente os clips e posta score
2. Se validado: Automatizar com GPT-4

---

## 3. Validated Learning

### O Que NÃO é Learning
- "Construímos a feature e lançamos" — sem dados = sem learning
- "Os usuários adoraram" — anedota ≠ learning
- "Tivemos 1000 cadastros" — sem conversão = sem learning

### O Que É Learning
- "Testamos 2 versões do onboarding. A versão B teve 35% mais ativação. Validamos que simplificar o primeiro passo aumenta conversão."
- Hipótese + Métrica + Resultado = Aprendizado validado

### Innovation Accounting (Métricas de Aprendizado)
```
Ao invés de métricas de vaidade (cadastros totais, pageviews):
Usar métricas acionáveis:

Funil de Ativação:
  Cadastros → Vídeo submetido → Pipeline completo → Clip baixado → Publicado

Taxa de conversão em cada step → onde o funil está quebrado?
```

---

## 4. Pivot vs. Persevere

### Quando Pivotar?
Ries define pivot como "mudança estruturada projetada para testar uma nova hipótese fundamental."

### Tipos de Pivot Relevantes para CortAI
| Tipo de Pivot | Descrição | Sinal para Pivotar |
|--------------|-----------|-------------------|
| **Customer Segment** | Mesmo produto, cliente diferente | Criadores não convertem, mas agências adoram |
| **Problem** | Mesmo cliente, problema diferente | Clips não é a dor, legenda é |
| **Channel** | Mesmo produto, canal diferente | SEO não funciona, community funciona |
| **Feature** | Focar em uma feature específica | Usuários só usam a transcrição |
| **Platform** | Mudar de web para mobile | Usuários pedem app nativo |

### Sinais de Que É Hora de Pivotar
- Must Have Survey < 20% (muito abaixo de 40%)
- D30 retention < 10%
- CAC > LTV (unsustainable)
- Usuários usam diferente do esperado consistentemente

### Sinais de Que Deve Perseverar
- Must Have Survey 30-40% (próximo do threshold)
- Pequeno grupo de usuários muito engajados
- Retention curve achatando (não vai a zero)
- Usuários indicando organicamente

---

## 5. Five Whys (5 Porquês)

### O Framework de Root Cause Analysis
Para cada problema recorrente, pergunte "por que?" 5 vezes.

**Exemplo CortAI:**
```
Problema: Taxa de ativação está baixa (20%)

Por quê? → Usuários não completam o primeiro vídeo
Por quê? → O upload demora muito
Por quê? → Estão tentando fazer upload de vídeos > 5GB
Por quê? → Não há limite claro no UI
Por quê? → Não testamos o caso de vídeos grandes

Solução real: Mostrar limite de tamanho antes do upload + orientar compressão
Solução aparente (errada): Reescrever o onboarding
```

---

## Citações Chave de Eric Ries

> "The goal of a startup is to figure out the right thing to build—the thing customers want and will pay for—as quickly as possible."

> "A pivot is a structured course correction designed to test a new fundamental hypothesis about the product, strategy, and engine of growth."

> "If we do not know who the customer is, we do not know what quality is."

> "Startup success can be engineered by following the right process, which means it can be learned, which means it can be taught."

> "The only way to win is to learn faster than anyone else."
