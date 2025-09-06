const HOOK_PATTERNS = [
  /\b(como|por que|qual|quando|onde)\b/i,  // questions
  /\b\d+\b/,                               // numbers/lists
  /\b(você|seu|sua)\b/i,                   // 2nd person
  /\b(segredo|truque|erro)\b/i,            // curiosity/negative
];

const CTA_PATTERNS = /(inscreva|deixa.*like|segue|canal)/i;

export function hookScore(textFirst10s: string): number {
  let score = 0;
  
  // Count pattern matches
  HOOK_PATTERNS.forEach(pattern => {
    if (pattern.test(textFirst10s)) {
      score += 1;
    }
  });
  
  // Penalize early CTAs
  if (CTA_PATTERNS.test(textFirst10s)) {
    score -= 1;
  }
  
  // Normalize to 0..1 range, ensuring minimum of 0
  return Math.max(0, score) / HOOK_PATTERNS.length;
}