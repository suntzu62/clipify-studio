# Robert C. Martin (Uncle Bob) — Clean Code

**Background:** Autor de *Clean Code* (2008), *Clean Architecture* (2017), co-autor do *Agile Manifesto*
**Contribuição central:** Clean Code principles, SOLID, Clean Architecture

---

## 1. Clean Code Principles (Aplicados ao CortAI)

### Nomes que Revelam Intenção
```typescript
// RUIM
const d = 86400
function proc(v: string) { return v.trim() }
const arr = await q('SELECT * FROM j WHERE s = $1', ['running'])

// BOM
const SECONDS_PER_DAY = 86400
function sanitizeVideoTitle(rawTitle: string) { return rawTitle.trim() }
const runningJobs = await getJobsByStatus('running')
```

### Funções Pequenas e com Uma Responsabilidade
```typescript
// RUIM: Função que faz tudo
async function handleVideoUpload(req: FastifyRequest, reply: FastifyReply) {
  // 200 linhas de validação, upload, processamento, resposta...
}

// BOM: Funções pequenas e compostas
async function handleVideoUpload(req: FastifyRequest, reply: FastifyReply) {
  const video = await validateUpload(req)
  const uploadedPath = await uploadToStorage(video)
  const job = await enqueueProcessingJob(uploadedPath, req.user.id)
  return reply.send({ jobId: job.id })
}
```

### Comentários: Quando Usar
```typescript
// RUIM: Comentário que explica o óbvio
// Incrementa o contador
counter++

// RUIM: Código comentado (use git!)
// const oldLogic = doSomething()

// BOM: Comentário que explica o POR QUÊ não-óbvio
// FFmpeg falha silenciosamente em vídeos >4GB no ARM.
// Dividimos em chunks de 2GB para evitar o bug.
const CHUNK_SIZE_BYTES = 2 * 1024 * 1024 * 1024
```

### Error Handling
```typescript
// RUIM: Retornar null, ignorar erros
const result = await transcribe(videoPath)
if (!result) return // silently fails

// BOM: Errors explícitos e informativos
try {
  const transcript = await transcriptionService.transcribe(videoPath)
  return transcript
} catch (error) {
  if (error instanceof WhisperQuotaError) {
    throw new AppError('TRANSCRIPTION_QUOTA_EXCEEDED', {
      message: 'OpenAI Whisper quota exceeded',
      jobId,
      retryAfter: error.resetAt
    })
  }
  Sentry.captureException(error, { extra: { videoPath, jobId } })
  throw error
}
```

---

## 2. Clean Architecture (aplicada ao Backend CortAI)

### As Camadas (de dentro para fora)
```
┌─────────────────────────────────────────┐
│  Frameworks (Fastify, BullMQ, OpenAI)   │ ← Mais externo
├─────────────────────────────────────────┤
│  Interface Adapters (routes, jobs)      │
├─────────────────────────────────────────┤
│  Use Cases (services: análise, render)  │
├─────────────────────────────────────────┤
│  Entities (Clip, Job, User, Transcript) │ ← Mais interno
└─────────────────────────────────────────┘
```

**Regra de Dependência:** Código interno não sabe que o externo existe.
- `clipService.ts` não importa `fastify`
- `highlightDetector.ts` não importa `openai` diretamente

### Para CortAI — Estrutura Recomendada
```
backend-v2/src/
├── entities/           ← Regras de negócio puras
│   ├── Clip.ts         ← O que é um Clip?
│   ├── Job.ts          ← Ciclo de vida do Job
│   └── Transcript.ts   ← O que é uma Transcrição?
├── usecases/           ← O que o sistema faz
│   ├── generate-clips.ts
│   └── transcribe-video.ts
├── services/           ← Implementações dos use cases
│   ├── transcription.ts
│   └── highlight-detector.ts
└── api/                ← Adapters (Fastify routes)
    └── clips.routes.ts
```

---

## 3. Testes como Documentação (TDD Mindset)

### Uncle Bob: "O Teste É a Documentação"
Se você tem bons testes, o código se documenta sozinho.

### Estrutura de Teste AAA (Arrange-Act-Assert)
```typescript
// src/services/highlight-detector.test.ts
describe('HighlightDetector', () => {
  describe('detectHighlights', () => {
    it('should return highlights above virality threshold', async () => {
      // ARRANGE
      const transcript = createMockTranscript({
        segments: [
          { text: 'Momento de alto engajamento', timestamp: 30, viralityScore: 0.9 },
          { text: 'Conteúdo comum', timestamp: 60, viralityScore: 0.2 },
        ]
      })

      // ACT
      const highlights = await highlightDetector.detect(transcript, { threshold: 0.7 })

      // ASSERT
      expect(highlights).toHaveLength(1)
      expect(highlights[0].timestamp).toBe(30)
    })

    it('should handle empty transcript gracefully', async () => {
      const transcript = createMockTranscript({ segments: [] })
      const highlights = await highlightDetector.detect(transcript)
      expect(highlights).toEqual([])
    })
  })
})
```

### Test Coverage no CortAI
- Services: ≥ 80% coverage
- Utils/helpers: ≥ 90% coverage
- Routes: Integration tests cobrem happy path + error cases
- Não testar: Infrastructure code (database queries, external API calls) — use mocks

---

## 4. DRY — Don't Repeat Yourself

### Onde o DRY Mais Importa no CortAI

**Queries SQL repetidas:**
```typescript
// RUIM: Mesma query em 3 routes
const job = await pool.query('SELECT * FROM jobs WHERE id = $1 AND user_id = $2', [jobId, userId])

// BOM: Centralizado em repository
class JobRepository {
  async findByIdAndUser(jobId: string, userId: string) {
    const { rows } = await pool.query(
      'SELECT * FROM jobs WHERE id = $1 AND user_id = $2',
      [jobId, userId]
    )
    return rows[0] ?? null
  }
}
```

**Middleware de Auth:**
```typescript
// RUIM: Verificar token em cada route
fastify.get('/clips', async (req) => {
  const token = req.headers.authorization
  const user = jwt.verify(token) // repetido em 20 routes
})

// BOM: Middleware reutilizável
fastify.addHook('preHandler', authenticate) // aplicado globalmente
// ou
fastify.get('/clips', { preHandler: [authenticate] }, handler)
```

---

## Citações Chave de Uncle Bob

> "Clean code always looks like it was written by someone who cares."

> "The only way to go fast is to go well."

> "Truth can only be found in one place: the code."

> "A comment is a failure to express yourself in code."

> "Functions should do one thing. They should do it well. They should do it only."
