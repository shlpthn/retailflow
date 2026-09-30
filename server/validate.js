// ============================================================================
// SHARED INPUT VALIDATION HELPERS
// ----------------------------------------------------------------------------
// Small, dependency-free validators used across routes. Rule of thumb: never
// coerce a raw body value with Number() and trust the result — Number('1e309')
// is Infinity and Number('0x10') is 16. Accept only finite, whole, positive
// numbers for quantities and finite, non-negative numbers for money.
// ============================================================================

// Accept only JSON numbers or plain decimal strings — Number() coercion is too
// permissive on its own (Number('0x10') === 16, Number('1e309') === Infinity).
const DECIMAL_INT = /^[0-9]+$/;
const DECIMAL = /^[0-9]+(\.[0-9]+)?$/;

/** Coerce to a strictly positive integer (whole units of stock), else null. */
function positiveInt(value) {
  if (typeof value === 'number') {
    return (Number.isFinite(value) && Number.isInteger(value) && value > 0) ? value : null;
  }
  if (typeof value === 'string' && DECIMAL_INT.test(value)) {
    const n = Number(value);
    return (n > 0 && n <= Number.MAX_SAFE_INTEGER) ? n : null;
  }
  return null;
}

/** Coerce to a finite, non-negative number (prices, promo values), else null. */
function finiteNonNegative(value) {
  if (typeof value === 'number') {
    return (Number.isFinite(value) && value >= 0) ? value : null;
  }
  if (typeof value === 'string' && DECIMAL.test(value)) {
    const n = Number(value);
    return (Number.isFinite(n) && n >= 0) ? n : null;
  }
  return null;
}

module.exports = { positiveInt, finiteNonNegative };