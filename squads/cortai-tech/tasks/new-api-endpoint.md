# Task: new-api-endpoint

Cria um novo endpoint Fastify completo com Zod schema, auth middleware e testes.

## Elicitação

1. Qual o nome/path do endpoint? (ex: `/api/v1/clips/:id/publish`)
2. Qual o método HTTP? (GET | POST | PUT | DELETE | PATCH)
3. Requer autenticação? (sim/não)
4. Qual o request body/params/query?
5. Qual o response esperado?
6. Há mudanças de banco de dados necessárias?

## Passos

1. **Criar/atualizar arquivo de rotas** em `clipify-studio/backend-v2/src/api/[feature].routes.ts`
   - Importar e usar `authenticate` middleware se necessário
   - Definir schema Fastify com `schema: { body: ..., params: ..., response: ... }`

2. **Criar/atualizar service** em `clipify-studio/backend-v2/src/services/[feature].ts`
   - Lógica de negócio separada da rota
   - Usar `pg` pool diretamente para queries SQL
   - try/catch com Sentry.captureException

3. **Adicionar Zod schema** em `clipify-studio/backend-v2/src/types/index.ts`

4. **Registrar rota** no arquivo principal de rotas (fastify.register)

5. **Criar teste** em `clipify-studio/backend-v2/src/services/[feature].test.ts`
   - Testar happy path
   - Testar validação de input inválido
   - Testar error handling

6. **Verificar pre-PR checklist**

## Padrão de Referência
```typescript
// Exemplo de rota Fastify com auth
export async function clipsRoutes(fastify: FastifyInstance) {
  fastify.post('/api/v1/clips/:id/action',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { userId } = request.user
      try {
        const result = await clipService.doAction(id, userId)
        return reply.code(200).send(result)
      } catch (error) {
        Sentry.captureException(error)
        throw error
      }
    }
  )
}
```
