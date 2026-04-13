// FX row formatting (en-US, tabular-friendly)

export type FxPairFormat = 'per_usd' | 'usd_per_unit';

export function formatFxRateCaption(
  price: number,
  quoteLabel: string,
  format: FxPairFormat
): string {
  if (!Number.isFinite(price)) return '—';
  if (format === 'usd_per_unit') {
    const p = price.toLocaleString('en-US', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 5,
    });
    return `1 ${quoteLabel} = ${p} USD`;
  }
  const p = price.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
  return `1 USD = ${p} ${quoteLabel}`;
}

export function formatCryptoUsd(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}
