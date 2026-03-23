/**
 * Sanitize error messages for user display.
 * Never show raw technical errors, stack traces, or internal details to users.
 */

const ERROR_MAP: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /quota|QUOTA_EXCEEDED|limit/i, message: 'Você atingiu o limite do seu plano. Faça upgrade para continuar.' },
  { pattern: /rate.?limit|429|too many/i, message: 'Muitas requisições. Aguarde alguns segundos e tente novamente.' },
  { pattern: /unauthorized|401|sessão|session/i, message: 'Sua sessão expirou. Faça login novamente.' },
  { pattern: /forbidden|403/i, message: 'Você não tem permissão para esta ação.' },
  { pattern: /not.?found|404/i, message: 'Recurso não encontrado.' },
  { pattern: /timeout|timed?.?out|ETIMEDOUT/i, message: 'A operação demorou muito. Tente novamente.' },
  { pattern: /network|fetch|ECONNREFUSED|ERR_NETWORK/i, message: 'Erro de conexão. Verifique sua internet e tente novamente.' },
  { pattern: /youtube.*blocked|YOUTUBE_BLOCKED|bot.*detect/i, message: 'Não foi possível acessar este vídeo do YouTube. Tente outro link.' },
  { pattern: /private.*video|video.*private/i, message: 'Este vídeo é privado e não pode ser processado.' },
  { pattern: /unavailable|indisponível/i, message: 'O vídeo está indisponível no momento.' },
  { pattern: /ffmpeg|render.*fail|encoding/i, message: 'Erro ao processar o vídeo. Tente novamente com um vídeo mais curto.' },
  { pattern: /memory|heap|out of memory|OOM/i, message: 'O vídeo é muito grande para processar. Tente um vídeo mais curto.' },
  { pattern: /mercadopago|payment|pagamento/i, message: 'Erro no sistema de pagamentos. Tente novamente em instantes.' },
  { pattern: /upload|storage/i, message: 'Erro ao enviar o arquivo. Tente novamente.' },
  { pattern: /500|internal.*error|server.*error/i, message: 'Erro interno do servidor. Tente novamente em instantes.' },
];

const GENERIC_MESSAGE = 'Algo deu errado. Tente novamente em instantes.';

export function friendlyErrorMessage(error: unknown): string {
  const raw = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '';

  if (!raw) return GENERIC_MESSAGE;

  for (const { pattern, message } of ERROR_MAP) {
    if (pattern.test(raw)) return message;
  }

  return GENERIC_MESSAGE;
}

export function toastError(toast: (opts: any) => void, error: unknown, title = 'Erro') {
  toast({
    title,
    description: friendlyErrorMessage(error),
    variant: 'destructive',
  });
}
