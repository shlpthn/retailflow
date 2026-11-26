'use strict';
// Print the catalog (without automation code) as JSON — consumed by qc/build_excel.py.
const stories = require('./index');

const out = stories.map(({ cases, ...s }) => ({
  ...s,
  cases: cases.map(({ auto, ...c }) => ({ ...c, automated: !!auto })),
}));
process.stdout.write(JSON.stringify(out));
