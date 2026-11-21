# csv-reader-speed-01

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/allianzero/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/allianzero/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0: it reads broken CSV files exactly as csv-reader does — same columns, rows and errors for every input — but several times faster. `solve.js` is a dependency-free ES module whose `run({text, header})` returns `{columns, rows, errors}`; `main.ts` is the program the harness runs, reading every case from `/input/cases.json` and writing `/output/answers.json`.

The reader is tolerant of broken rows by design: stray CRs, quotes that never close, junk after a closing quote, short and long rows, blank lines, a BOM, and quoted fields that span lines are all read the way csv-reader reads them. Speed comes from never reading one character at a time — fields are cut out with `indexOf`/`slice`, whole lines with no quoted field are split at once, and a quoted field is found with quote-to-quote jumps.

## Run it

```sh
MAKEFUN_INPUT_DIR=./practice/input MAKEFUN_OUTPUT_DIR=./out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
