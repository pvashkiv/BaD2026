'use strict';


const fs = require('fs');

const dataPath = process.argv[2] || 'data.txt';
const resultPath = process.argv[3] || 'result.txt';

function fail(msg) {
  console.log('ERROR: ' + msg);
  process.exit(1);
}

let dataRaw, resultRaw;
try { dataRaw = fs.readFileSync(dataPath, 'utf8'); }
catch (e) { fail('cannot read ' + dataPath + ': ' + e.message); }
try { resultRaw = fs.readFileSync(resultPath, 'utf8'); }
catch (e) { fail('cannot read ' + resultPath + ': ' + e.message); }

const avail = new Map();
let dataCount = 0;
const lengths = new Set();
for (const line of dataRaw.split(/\r?\n/)) {
  const s = line.trim();
  if (s.length === 0) continue;
  if (!/^[0-9]+$/.test(s) || s.length < 3) continue;
  avail.set(s, (avail.get(s) || 0) + 1);
  lengths.add(s.length);
  dataCount++;
}
if (dataCount === 0) fail('no valid fragments in ' + dataPath);

const result = resultRaw.trim();
if (!/^[0-9]+$/.test(result)) fail(resultPath + ' contains non-digit characters');
const N = result.length;
const lenList = Array.from(lengths).sort((a, b) => b - a);

const chain = [];
let steps = 0;
const STEP_CAP = 5000000;

function parse(pos) {
  if (++steps > STEP_CAP) fail('parsing did not finish within ' + STEP_CAP + ' steps');
  for (const L of lenList) {
    if (pos + L > N) continue;
    const frag = result.slice(pos, pos + L);
    const left = avail.get(frag);
    if (!left) continue;
    avail.set(frag, left - 1);
    chain.push(frag);
    if (pos + L === N) return true;
    if (parse(pos + L - 2)) return true;
    chain.pop();
    avail.set(frag, left);
  }
  return false;
}

if (!parse(0)) {
  fail('the string cannot be split into fragments from ' + dataPath +
    ' (no covering exists without reusing a fragment)');
}

for (let i = 1; i < chain.length; i++) {
  const a = chain[i - 1], b = chain[i];
  if (a.slice(-2) !== b.slice(0, 2)) {
    fail('junction #' + i + ': "' + a + '" -> "' + b + '" (' + a.slice(-2) + ' != ' + b.slice(0, 2) + ')');
  }
}

const usedCount = new Map();
for (const f of chain) usedCount.set(f, (usedCount.get(f) || 0) + 1);
const origCount = new Map();
for (const line of dataRaw.split(/\r?\n/)) {
  const s = line.trim();
  if (/^[0-9]+$/.test(s) && s.length >= 3) origCount.set(s, (origCount.get(s) || 0) + 1);
}
for (const [f, c] of usedCount) {
  const have = origCount.get(f) || 0;
  if (have === 0) fail('fragment "' + f + '" is not present in ' + dataPath);
  if (c > have) fail('fragment "' + f + '" used ' + c + ' time(s), but the file has only ' + have + ' copies');
}

let rebuilt = '';
for (let i = 0; i < chain.length; i++) rebuilt += i === 0 ? chain[i] : chain[i].slice(2);
if (rebuilt !== result) {
  fail('re-joined chain does not match ' + resultPath + ' (' + rebuilt.length + ' digits vs ' + N + ')');
}

console.log('OK: ' + chain.length + ' fragments, ' + N + ' digits');
console.log('  all fragments come from ' + dataPath + ' (' + dataCount + ' available), none reused, every junction matches,');
console.log('  re-joining the chain reproduces ' + resultPath + ' byte for byte');
