export function toISO(unixSec: number | null): string | null {
  if (unixSec == null) return null;
  return new Date(unixSec * 1000).toISOString();
}

/**
 * Converte o amount da Stripe (ex.: 35000) para decimal (ex.: 350.00).
 *
 * @param amountCents   Valor em centavos/unidade mínima (integer).
 * @returns             Número já convertido (ex.: 350.00) ou `null` se input inválido.
 */
export function stripeAmountToDecimal(amountCents: number | null | undefined): number | null {
  if (amountCents == null || isNaN(amountCents)) return null;

  // Divide por 100 e mantém a precisão desejada
  return parseFloat((amountCents / 100).toFixed(2));
}
