'use strict';
// QC catalog: PBI → user story → acceptance criteria → test cases (with manual steps + automation).
const stories = [
  ...require('./rf-06'),
  ...require('./rf-07'),
  ...require('./rf-08'),
  ...require('./rf-09'),
  ...require('./rf-10'),
];

// Sanity checks so a broken catalog fails loudly instead of producing a wrong workbook.
const seen = new Set();
for (const s of stories) {
  const acIds = new Set(s.acs.map((a) => a.id));
  for (const c of s.cases) {
    if (seen.has(c.id)) throw new Error(`duplicate test case id ${c.id}`);
    seen.add(c.id);
    if (!acIds.has(c.ac)) throw new Error(`${c.id}: unknown AC ${c.ac} for ${s.id}`);
    if (!c.steps || !c.steps.length) throw new Error(`${c.id}: no steps`);
  }
}

module.exports = stories;
