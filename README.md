# Digit Puzzle — Longest Chain of Fragments

## The task

A set of fragments, each consisting of digits only. Two fragments link together
when the **last two digits** of the first equal the **first two digits** of the
second. On linking, the two shared digits are written once:

```
248460 + 608017 + 177092  ->  24846080177092
```

Goal: find the **longest** chain. Each fragment may be used at most once, and
not all of them have to be used. The quantity being maximised is the length of
the final string: `sum(len(fragment) - 2) + 2`.

Input: `data.txt`, 142 fragments of 6 digits each.

## Answer

| | |
|---|---|
| **Fragments used** | **67** of 142 |
| **String length** | **270 digits** |
| **Status** | **Optimal — proven, not just the best found** |

```
716890565777794373556482064083064121343222972497868721751153303887119612013153750510417085100512022142771171781184759586758823141707943693917372699031562942007148831088658432465190816374922650246027977309775416923314139340173379890062028614605676733227368753511935367493
```

The chain of 67 fragments that produces it is in `chain.txt`, one per line,
in order. The string above is in `result.txt`.

### Why this is provably optimal

The solver does not stop at a good answer — it **exhausts the entire search
space**. It walks every start vertex in order and, for each, performs a full
depth-first search. The only branches it discards are those that provably
**cannot** beat the current record, so finishing the traversal is itself the
proof that no longer chain exists. When that happens the program prints:

```
OPTIMUM PROVEN: 67 fragments (270 digits)
  search space exhausted: all 92 start vertices traversed, no longer chain exists.
```

This was cross-checked four independent ways:

1. With pruning **switched off entirely** — a plain brute-force enumeration of
   the whole space (208,353,328 nodes) returns the same 67.
2. With the greedy warm-up removed (record starting from zero) — 67.
3. With weaker pruning (`<` instead of `<=`, discards strictly fewer
   branches) — 67.
4. Against a separate naive brute-force script on 300 randomly generated small
   instances — 300 matches, 0 mismatches.

## How to run

Requires Node.js only (built on v26.7.0, any modern version works).
**No dependencies, no `npm install`.**

```bash
node solve.js                 # solve data.txt, print and save the answer
node validate.js              # verify the saved answer
```

Full form with arguments:

```bash
node solve.js [data-file] [seconds]
node validate.js [data-file] [result-file]
```

- `data-file` — fragments, one per line, digits only (default `data.txt`)
- `seconds` — **a safety net, not a runtime**; the search ends by itself once
  the space is exhausted, which takes about 5 seconds on `data.txt`
  (default `60`)

To check it on a different set of fragments, just point it at another file:
`node solve.js my_fragments.txt`.

### Expected output

```
$ node solve.js
File: data.txt
Non-empty lines read: 142
Valid fragments: 142, rejected: 0
Graph vertices: 97, with zero in-degree: 23
Total fragments E = 142, total gain = 568 (570 digits, if every fragment fit into one trail)
Upper bound 1 (reachability): start 35 -> gain <= 416 (string <= 418 digits)
Upper bound 2 (degree balance): excess = 48 -> edges in trail <= 95 of 142
After greedy warm-up: gain 176 (44 fragments, 178 digits)
  [3.0s] start 61 (57/92), best: 66 fragments, 266 digits, nodes: 22387712
Search nodes: 35823929 in 4.8s = 7,480,461 nodes/s
Start vertices completed: 92 of 92

OPTIMUM PROVEN: 67 fragments (270 digits)
  search space exhausted: all 92 start vertices traversed, no longer chain exists.
Fragments in chain: 67 of 142
String length: 270 digits
7168905657777943735564820640830641213432229724978687217511533038871196120131537505...

Saved: result.txt (the string), chain.txt (fragments in order)
```

```
$ node validate.js
OK: 67 fragments, 270 digits
  all fragments come from data.txt (142 available), none reused, every junction matches,
  re-joining the chain reproduces result.txt byte for byte
```

## Verifying the answer independently

`validate.js` shares **no code** with `solve.js` — it re-reads both files from
scratch and checks the answer from first principles:

1. `result.txt` contains digits only;
2. the string can be split into fragments **taken from `data.txt`** (parsed
   left to right with backtracking);
3. every fragment used really exists in `data.txt`, and none is used more times
   than the file contains it;
4. every junction genuinely overlaps by two digits;
5. re-joining the fragments reproduces the original string byte for byte.

It prints `OK` or a specific error and exits with code 1 on failure.

## Files

| File | |
|---|---|
| `solve.js` | the solver |
| `validate.js` | independent verification of the answer |
| `data.txt` | input: 142 fragments |
| `result.txt` | output: the 270-digit string |
| `chain.txt` | output: the 67 fragments in order |

Both scripts overwrite `result.txt` and `chain.txt` on every run.

## How it works

The puzzle is a **longest trail in a directed multigraph**:

- a vertex is a two-digit code `00..99`;
- a fragment is an edge from its first two digits to its last two;
- a chain is a walk that never repeats an edge.

On `data.txt` the graph has 142 edges over 97 vertices and is very sparse
(average out-degree 1.46), with 23 vertices having no incoming edge. There is
no Eulerian path, so not all 142 fragments can be used.

The search is an exhaustive DFS with a **reachability bound**: before going
deeper it sums the gains of all edges still reachable from the current vertex
over unused edges, and abandons the branch when
`current_length + reachable <= best`. The record is shared across all start
vertices and never resets; 1000 fast greedy passes seed it beforehand (using a
deterministic PRNG, so runs are reproducible).

The bound is recomputed millions of times, so it is written to be allocation-free:
CSR adjacency in flat `Int32Array`s, a preallocated BFS queue, a `Uint8Array`
for used edges, and a generation-counter `Uint32Array` for visited vertices
instead of clearing it. This sustains ~7.5 million search nodes per second.

Fragments are kept **as strings and never parsed into numbers**, so leading
zeros survive. Duplicate fragments are handled as parallel edges.
