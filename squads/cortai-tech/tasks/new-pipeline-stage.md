# Task: new-pipeline-stage

Adiciona um novo estágio ao pipeline BullMQ de 7 estágios.

## Contexto do Pipeline Atual
```
Stage 1: ingest     → Stage 2: transcribe  → Stage 3: scenes
Stage 4: rank       → Stage 5: render      → Stage 6: texts
Stage 7: export
```

## Elicitação
1. Nome do novo estágio? (ex: `tts-generation`)
2. Onde se encaixa no pipeline? (após qual estágio?)
3. O que o estágio recebe como input?
4. O que produz como output?
5. Precisa de novas dependências (APIs, bibliotecas)?
6. Qual o tempo estimado de execução?

## Passos

1. **Criar o processor do novo estágio**
   `clipify-studio/backend-v2/src/services/[stage-name].ts`
   - Seguir o padrão dos stages existentes em `src/services/`
   - Input: `jobId`, `projectId`, dados do stage anterior
   - Output: dados para o próximo stage
   - Sempre reportar progresso via BullMQ job.updateProgress()
   - Sempre capturar erros com Sentry

2. **Registrar no processor principal**
   `clipify-studio/backend-v2/src/jobs/processor.ts`
   - Adicionar case para o novo stage
   - Conectar ao stage anterior e posterior

3. **Criar migration** se o stage precisar armazenar dados
   - Usar a task `migration-create`

4. **Adicionar ao frontend** (se o stage precisar de UI)
   - Progress indicator no `clipify-studio/src/pages/ProjectDetail.tsx`
   - Status label para o novo stage

5. **Escrever teste**
   `clipify-studio/backend-v2/src/services/[stage-name].test.ts`

## Padrão de Stage (referência)
```typescript
// src/services/[stage-name].ts
export async function processNewStage(
  job: Job,
  projectId: string,
  inputData: StageInputType
): Promise<StageOutputType> {
  try {
    await job.updateProgress(10)
    // ... lógica
    await job.updateProgress(100)
    return output
  } catch (error) {
    Sentry.captureException(error, { extra: { projectId, stage: '[stage-name]' } })
    throw error
  }
}
```
