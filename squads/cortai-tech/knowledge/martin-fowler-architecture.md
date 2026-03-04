# Martin Fowler — Refactoring & Software Architecture

**Background:** Chief Scientist na Thoughtworks, autor de *Refactoring* (1999, 2018), *Patterns of Enterprise Application Architecture*, *Microservices*
**Contribuição central:** Refactoring, padrões de arquitetura, microservices, event-driven architecture

---

## 1. Refactoring: Melhorar o Código Sem Mudar Comportamento

### Definição
"Refactoring é a técnica de reestruturar código existente, alterando sua estrutura interna sem mudar seu comportamento externo."

### Quando Refatorar no CortAI
1. **Antes de adicionar features:** Limpe antes de construir
2. **Quando você tem testes:** Nunca refatore sem cobertura de testes
3. **Rule of Three:** Se você escreve código similar 3 vezes → abstraia

### Bad Smells mais Comuns (Fowler) e Como Resolver

| Bad Smell | Sintoma no CortAI | Refactoring |
|-----------|-------------------|-------------|
| **Long Method** | `processor.ts` com 500 linhas | Extract Method |
| **Large Class** | `analysis.ts` fazendo tudo | Extract Class |
| **Duplicate Code** | Mesma query SQL em 3 services | Extract Function |
| **Long Parameter List** | `generateClip(a, b, c, d, e, f)` | Introduce Parameter Object |
| **Feature Envy** | Service acessando dados de outro diretamente | Move Method |
| **Primitive Obsession** | `status: string` em vez de enum | Replace Primitive with Object |

### Extract Method (o mais útil)
```typescript
// ANTES (Long Method)
async function processJob(jobId: string) {
  const job = await getJob(jobId)
  // 50 linhas de lógica de transcrição
  // 40 linhas de lógica de highlight detection
  // 30 linhas de lógica de export
}

// DEPOIS (Extract Method)
async function processJob(jobId: string) {
  const job = await getJob(jobId)
  const transcript = await transcribeJob(job)
  const highlights = await detectHighlights(transcript)
  await exportClips(highlights)
}
```

---

## 2. Padrões de Arquitetura Relevantes para CortAI

### Pipeline Pattern (já usado no CortAI)
O pipeline de 7 estágios do CortAI já segue este padrão.

**Melhorias baseadas em Fowler:**
- Cada stage deve ser **stateless** (não guardar estado entre runs)
- Falha em um stage não deve corromper outros
- Cada stage deve ter interface clara: `input → process → output`

```typescript
// Interface ideal para cada stage
interface PipelineStage<TInput, TOutput> {
  name: string
  process(input: TInput, job: BullMQ.Job): Promise<TOutput>
}
```

### Repository Pattern (para o PostgreSQL do CortAI)
```typescript
// EVITAR: SQL direto espalhado pelo código
const result = await pool.query('SELECT * FROM clips WHERE user_id = $1', [userId])

// PREFERIR: Repository Pattern
class ClipRepository {
  async findByUserId(userId: string): Promise<Clip[]> {
    const { rows } = await pool.query(
      'SELECT * FROM clips WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    )
    return rows.map(row => new Clip(row))
  }

  async save(clip: Clip): Promise<Clip> {
    // upsert logic
  }
}
```

### Event-Driven Architecture (para o BullMQ do CortAI)
O BullMQ já é event-driven. Seguir estes princípios:
1. **Events are immutable:** Nunca mude um evento já publicado
2. **Consumers são idempotentes:** Processar o mesmo job duas vezes = mesmo resultado
3. **Dead Letter Queue:** Jobs que falham 3x vão para fila de revisão manual

---

## 3. SOLID Principles (Aplicados ao Backend CortAI)

### S — Single Responsibility
"Uma classe/função deve ter apenas uma razão para mudar."

```typescript
// ERRADO: AnalysisService faz análise + salva no banco + notifica
class AnalysisService {
  async analyze(jobId: string) {
    const result = await this.runAI() // análise
    await pool.query('UPDATE...') // salvar
    await sendEmail() // notificar
  }
}

// CERTO: Cada responsabilidade separada
class AnalysisService { async analyze() {} }
class ClipRepository { async save() {} }
class NotificationService { async notify() {} }
```

### O — Open/Closed
"Aberto para extensão, fechado para modificação."

Para CortAI: Novos estágios do pipeline não devem mudar o código existente.
```typescript
// CERTO: Adicionar novo stage sem mudar processor.ts
const stages: PipelineStage[] = [
  new IngestStage(),
  new TranscribeStage(),
  new NewCustomStage(), // adiciona aqui
  new ExportStage(),
]
```

### D — Dependency Inversion
"Dependa de abstrações, não de implementações concretas."

```typescript
// ERRADO: Service acoplado ao OpenAI diretamente
class HighlightDetector {
  async detect(transcript: string) {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    return openai.chat.completions.create({...})
  }
}

// CERTO: Injeção de dependência
interface AIProvider {
  complete(prompt: string): Promise<string>
}

class HighlightDetector {
  constructor(private ai: AIProvider) {}
  async detect(transcript: string) {
    return this.ai.complete(prompt)
  }
}
// Fácil de trocar de OpenAI para Anthropic sem mudar o detector
```

---

## 4. Strangler Fig Pattern (para Refactoring Incremental)

### O Problema
Como refatorar o `processor.ts` enorme sem quebrar produção?

### A Solução (Fowler's Strangler Fig)
```
1. Identifique um sub-componente do código legado
2. Crie o novo código ao lado
3. Redirecione tráfego para o novo código
4. Delete o código antigo

Repita até o código antigo ter sido completamente "estrangulado"
```

### Para CortAI
```typescript
// Fase 1: Novo TranscriptionService ao lado do código antigo
// processor.ts ainda chama o código legado
// TranscriptionService.test.ts cobre o novo código

// Fase 2: Feature flag
if (process.env.USE_NEW_TRANSCRIPTION) {
  return await newTranscriptionService.transcribe(videoPath)
} else {
  return await legacyTranscribe(videoPath) // código antigo
}

// Fase 3: Remove feature flag, deleta código antigo
```

---

## Citações Chave de Martin Fowler

> "Any fool can write code that a computer can understand. Good programmers write code that humans can understand."

> "If it's hard to change, it's wrong."

> "Whenever you have to figure out what code is doing, ask yourself if you could refactor the code so that anyone could see what it's doing."

> "Microservices are not for everyone. If you can't build a well-structured monolith, microservices won't save you."
