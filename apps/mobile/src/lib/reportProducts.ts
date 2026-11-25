export type ProductDraft = { id: string; product: string; quantity: string; expiryDate: string };
export type ReportProduct = { product: string; quantity: number | null; expiry_date: string | null; sort_order: number };

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateProducts(rows: ProductDraft[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const row of rows) {
    const messages: string[] = [];
    if (!row.product.trim()) messages.push('Product name is required.');
    if (row.quantity.trim() && (!/^\d+(\.\d{1,2})?$/.test(row.quantity.trim()) || Number(row.quantity) > 9999999999.99)) {
      messages.push('Quantity must be non-negative, at most 9999999999.99, with up to two decimal places.');
    }
    if (row.expiryDate.trim() && !isCalendarDate(row.expiryDate.trim())) messages.push('Expiry must be a valid YYYY-MM-DD date.');
    if (messages.length) errors[row.id] = messages.join(' ');
  }
  return errors;
}

export function serializeProducts(rows: ProductDraft[]): ReportProduct[] {
  if (Object.keys(validateProducts(rows)).length) throw new Error('Please fix the product rows.');
  return rows.map((row, sort_order) => ({
    product: row.product.trim(), quantity: row.quantity.trim() ? Number(row.quantity) : null,
    expiry_date: row.expiryDate.trim() || null, sort_order,
  }));
}

// Legacy queued reports had no products. Never silently discard a present, malformed array.
export function queuedProducts(products: unknown): ReportProduct[] {
  if (products === undefined) return [];
  if (!Array.isArray(products)) throw new Error('Invalid queued product data; report retained.');
  return products.map((row, index) => {
    if (!row || typeof row.product !== 'string' || !row.product.trim()
      || (row.quantity != null && (typeof row.quantity !== 'number' || !Number.isFinite(row.quantity) || row.quantity < 0 || row.quantity > 9999999999.99))
      || (row.expiry_date != null && !isCalendarDate(row.expiry_date))) {
      throw new Error('Invalid queued product data; report retained.');
    }
    return { product: row.product.trim(), quantity: row.quantity ?? null, expiry_date: row.expiry_date ?? null, sort_order: row.sort_order ?? index };
  });
}

export function productExportRows(products: ReportProduct[] = []): [string, string][] {
  return products.map((row, index) => [`PRODUCT ${index + 1}`, `${row.product} | Quantity: ${row.quantity ?? '—'} | Expiry: ${row.expiry_date ?? '—'}`]);
}
