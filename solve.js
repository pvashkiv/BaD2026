'use strict';

const fs = require('fs');

const dataPath = process.argv[2] || 'data.txt';
const timeLimitSec = process.argv[3] !== undefined ? Number(process.argv[3]) : 60;
if (!Number.isFinite(timeLimitSec) || timeLimitSec <= 0) {
  console.error('Invalid time limit: ' + process.argv[3]);
  process.exit(1);
}

let raw;
try {
  raw = fs.readFileSync(dataPath, 'utf8');
} catch (e) {
  console.error('Cannot read file ' + dataPath + ': ' + e.message);
  process.exit(1);
}

const rawLines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
const frags = [];
const rejected = [];
for (const line of rawLines) {
  const s = line.trim();
  if (!/^[0-9]+$/.test(s) || s.length < 3) rejected.push(s);
  else frags.push(s);
}

console.log('File: ' + dataPath);
console.log('Non-empty lines read: ' + rawLines.length);
console.log('Valid fragments: ' + frags.length + ', rejected: ' + rejected.length);
if (rejected.length) {
  const show = rejected.slice(0, 10).map((s) => JSON.stringify(s)).join(', ');
  console.log('  rejected (first 10): ' + show);
}
if (frags.length === 0) {
  console.error('No valid fragments found.');
  process.exit(1);
}
if (frags.length > 5000) {
  console.log('WARNING: more than 5000 fragments - recursion depth may approach the Node stack limit.');
  console.log('         If needed, run with --stack-size, e.g.: node --stack-size=20000 solve.js ...');
}

const V = 100;
const E = frags.length;
const eFrom = new Int32Array(E);
const eTo = new Int32Array(E);
const eGain = new Int32Array(E);
let totalGain = 0;
for (let i = 0; i < E; i++) {
  const f = frags[i];
  eFrom[i] = (f.charCodeAt(0) - 48) * 10 + (f.charCodeAt(1) - 48);
  eTo[i] = (f.charCodeAt(f.length - 2) - 48) * 10 + (f.charCodeAt(f.length - 1) - 48);
  eGain[i] = f.length - 2;
  totalGain += eGain[i];
}

const outDeg = new Int32Array(V);
const inDeg = new Int32Array(V);
for (let i = 0; i < E; i++) { outDeg[eFrom[i]]++; inDeg[eTo[i]]++; }
const off = new Int32Array(V + 1);
for (let v = 0; v < V; v++) off[v + 1] = off[v] + outDeg[v];
const adjEdge = new Int32Array(E);
{
  const cur = off.slice(0, V);
  for (let i = 0; i < E; i++) adjEdge[cur[eFrom[i]]++] = i;
}


function pad2(v) { return v < 0 ? '--' : String(v).padStart(2, '0'); }

let vertexCount = 0, zeroIn = 0;
for (let v = 0; v < V; v++) if (outDeg[v] || inDeg[v]) { vertexCount++; if (inDeg[v] === 0) zeroIn++; }
console.log('Graph vertices: ' + vertexCount + ', with zero in-degree: ' + zeroIn);

const used = new Uint8Array(E);
const visited = new Uint32Array(V);
let gen = 0;
const queue = new Int32Array(V);

function reachableGain(v) {
  gen++;
  let qh = 0, qt = 0;
  queue[qt++] = v;
  visited[v] = gen;
  let sum = 0;
  while (qh < qt) {
    const u = queue[qh++];
    const end = off[u + 1];
    for (let k = off[u]; k < end; k++) {
      const e = adjEdge[k];
      if (used[e]) continue;
      sum += eGain[e];
      const w = eTo[e];
      if (visited[w] !== gen) { visited[w] = gen; queue[qt++] = w; }
    }
  }
  return sum;
}

let bestReach = 0, bestReachV = -1;
for (let v = 0; v < V; v++) {
  if (!outDeg[v]) continue;
  const r = reachableGain(v);
  if (r > bestReach) { bestReach = r; bestReachV = v; }
}

let excess = 0;
for (let v = 0; v < V; v++) if (outDeg[v] > inDeg[v]) excess += outDeg[v] - inDeg[v];
const balanceBoundEdges = excess > 0 ? E - (excess - 1) : E;
console.log('Total fragments E = ' + E + ', total gain = ' + totalGain +
  ' (' + (totalGain + 2) + ' digits, if every fragment fit into one trail)');
console.log('Upper bound 1 (reachability): start ' + pad2(bestReachV) + ' -> gain <= ' + bestReach +
  ' (string <= ' + (bestReach + 2) + ' digits)');
console.log('Upper bound 2 (degree balance): excess = ' + excess +
  ' -> edges in trail <= ' + balanceBoundEdges + ' of ' + E);

let best = 0;
let bestPath = new Int32Array(E);
let bestLen = 0;
const path = new Int32Array(E);
let nodes = 0;

const t0 = Date.now();
const deadline = t0 + timeLimitSec * 1000;
let stop = false;
let nextReport = t0 + 3000;
let curStart = -1;

function record(depth, gain) {
  best = gain;
  bestLen = depth;
  bestPath.set(path.subarray(0, depth));
}

let rnd = 0x9e3779b9;
function rand() {
  rnd |= 0; rnd = (rnd + 0x6d2b79f5) | 0;
  let t = Math.imul(rnd ^ (rnd >>> 15), 1 | rnd);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const starts = [];
for (let v = 0; v < V; v++) if (outDeg[v]) starts.push(v);

function greedyRun(start) {
  let v = start, depth = 0, gain = 0;
  while (true) {
    const a = off[v], b = off[v + 1];
    if (b === a) break;
    let pick = -1, seen = 0;
    for (let k = a; k < b; k++) {
      const e = adjEdge[k];
      if (used[e]) continue;
      seen++;
      if (rand() * seen < 1) pick = e;
    }
    if (pick < 0) break;
    used[pick] = 1;
    path[depth++] = pick;
    gain += eGain[pick];
    v = eTo[pick];
  }
  if (gain > best) record(depth, gain);
  for (let i = 0; i < depth; i++) used[path[i]] = 0;
}

for (let it = 0; it < 1000; it++) greedyRun(starts[(rand() * starts.length) | 0]);
console.log('After greedy warm-up: gain ' + best + ' (' + bestLen + ' fragments, ' + (best + 2) + ' digits)');

function dfs(v, depth, gain) {
  nodes++;
  if ((nodes & 1023) === 0) {
    const now = Date.now();
    if (now >= deadline) stop = true;
    if (now >= nextReport) {
      nextReport = now + 3000;
      console.log('  [' + ((now - t0) / 1000).toFixed(1) + 's] start ' + pad2(curStart) +
        ' (' + (starts.indexOf(curStart) + 1) + '/' + starts.length + '), best: ' + bestLen +
        ' fragments, ' + (best + 2) + ' digits, nodes: ' + nodes);
    }
  }
  if (stop) return;
  if (gain > best) record(depth, gain);
  if (gain + reachableGain(v) <= best) return;

  const a = off[v], b = off[v + 1];
  for (let k = a; k < b; k++) {
    const e = adjEdge[k];
    if (used[e]) continue;
    used[e] = 1;
    path[depth] = e;
    dfs(eTo[e], depth + 1, gain + eGain[e]);
    used[e] = 0;
    if (stop) return;
  }
}

let startsDone = 0;
for (let si = 0; si < starts.length; si++) {
  curStart = starts[si];
  dfs(curStart, 0, 0);
  if (stop) break;
  startsDone++;
}
const proved = !stop;

const elapsed = (Date.now() - t0) / 1000;
console.log('Search nodes: ' + nodes + ' in ' + elapsed.toFixed(1) + 's = ' +
  Math.round(nodes / elapsed).toLocaleString('en-US') + ' nodes/s');
console.log('Start vertices completed: ' + startsDone + ' of ' + starts.length);

const chain = [];
for (let i = 0; i < bestLen; i++) chain.push(frags[bestPath[i]]);
let result = '';
for (let i = 0; i < chain.length; i++) result += i === 0 ? chain[i] : chain[i].slice(2);

console.log('');
if (proved) {
  console.log('OPTIMUM PROVEN: ' + chain.length + ' fragments (' + result.length + ' digits)');
  console.log('  search space exhausted: all ' + starts.length +
    ' start vertices traversed, no longer chain exists.');
} else {
  console.log('TIMEOUT (' + timeLimitSec + 's): search space NOT exhausted - this is the best found, not a proven optimum.');
  console.log('  stopped at start vertex ' + pad2(curStart) + ' (' + (startsDone + 1) +
    '/' + starts.length + '). Raise the time limit to prove optimality.');
}
console.log('Fragments in chain: ' + chain.length + ' of ' + E);
console.log('String length: ' + result.length + ' digits');
console.log(result);

fs.writeFileSync('result.txt', result + '\n');
fs.writeFileSync('chain.txt', chain.join('\n') + '\n');
console.log('');
console.log('Saved: result.txt (the string), chain.txt (fragments in order)');
