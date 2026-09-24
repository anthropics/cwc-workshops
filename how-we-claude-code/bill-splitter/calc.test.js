// Run with: node calc.test.js
const assert = require('assert');
global.document = { getElementById: () => ({ addEventListener() {}, classList: { toggle() {} }, focus() {} }), querySelectorAll: () => [], activeElement: null };
global.navigator = {};
global.location = { protocol: 'file:' };
const { calculate } = require('./app.js');

let r = calculate('212.47', 22, 7);
assert.deepStrictEqual(r, { bill: 21247, tip: 4674, total: 25921, perPerson: 3703, extra: 0 + 3703 * 7 - 25921 });
r = calculate('100', 20, 3);
assert.strictEqual(r.perPerson, 4000); // 120.00 / 3 exact
assert.strictEqual(r.extra, 0);
r = calculate('100', 18, 3);
assert.strictEqual(r.perPerson, 3934); // 118.00 / 3 = 39.333 -> 39.34
assert.strictEqual(r.extra, 2);
assert.strictEqual(calculate('', 18, 4).perPerson, 0);
assert.strictEqual(calculate('0.10', 18, 1).total, 12); // 10c + 2c tip
console.log('all tests passed');
