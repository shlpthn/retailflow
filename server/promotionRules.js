// ============================================================================
// PROMOTION RULES (BA D-02, BR-16, BR-17, ST-04)
// One percentage promotion on all active products, chain-wide. Its status is
// derived from the clock: SCHEDULED → ACTIVE → EXPIRED, or INACTIVE once ended
// early. Validity is checked against the exact payment time.
// ============================================================================

/** Start / end instants. Promotions created before start/end times existed use whole days. */
function windowOf(p) {
  const start = p.startAt ? Date.parse(p.startAt) : Date.parse(`${p.validFrom}T00:00:00.000Z`);
  const end = p.endAt ? Date.parse(p.endAt) : Date.parse(`${p.validTo}T23:59:59.999Z`);
  return { start, end };
}

function statusOf(p, now = Date.now()) {
  if (!p.active) return 'INACTIVE';
  const { start, end } = windowOf(p);
  if (now < start) return 'SCHEDULED';
  if (now > end) return 'EXPIRED';
  return 'ACTIVE';
}

/** Promotion as returned by the API, with its current status. */
const withStatus = (p, now = Date.now()) => ({ ...p, status: statusOf(p, now) });

/** The promotion with this code if it is effective at `now`. */
function effectiveByCode(promotions, code, now = Date.now()) {
  if (!code) return null;
  const p = promotions.find((x) => x.code === code);
  return p && statusOf(p, now) === 'ACTIVE' ? p : null;
}

/** First Scheduled / Active promotion (other than `exceptId`) whose window overlaps [start, end]. */
function overlapping(promotions, start, end, exceptId) {
  return promotions.find((p) => {
    if (p.id === exceptId) return false;
    if (!['SCHEDULED', 'ACTIVE'].includes(statusOf(p))) return false;
    const w = windowOf(p);
    return start <= w.end && w.start <= end;
  });
}

module.exports = { windowOf, statusOf, withStatus, effectiveByCode, overlapping };
