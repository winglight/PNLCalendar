# Synthetic regression contracts

Zero third-party dependencies. Requires Node.js 20+. Git is not required: the
byte-exact baseline source fixtures live as per-file `.gz` archives in
`tests/baseline/`, pinned to commit
`6821bbc255fc1cdc1e59123a9b3f56a0ca9580f5`. Their SHA-256 hashes and byte lengths
are recorded in `tests/baseline/manifest.json` and verified on every baseline read.
Node’s built-in zlib decompresses each archive. Both compressed and decompressed
checksums are checked; all original source bytes, including whitespace, remain
unchanged. Plaintext duplicates are intentionally omitted.
The fixtures contain only public application source, never user data or credentials.

```sh
npm test                 # Compare current files with the pinned baseline
npm run test:baseline    # Execute the same expectations against baseline only
npm run test:timezones   # UTC, America/Los_Angeles, Asia/Shanghai
npm run test:strict      # Fail on EVERY unmet current expectation, including legacy bugs
```

No `npm install` is needed. `vm.SourceTextModule` requires the Node experimental
VM-modules flag, already included in these scripts.

## Interpreting results

- `PASS`: the expected behavior passes on both baseline and current code
- `FIXED / NEW PASS`: the current code meets an expectation the baseline did not
- `KNOWN BASELINE BUG`: an explicitly listed old defect fails with the same assertion
  on both revisions; it is **not a passing test**
- `REGRESSION`: current code fails an expectation the baseline passed, or a known
  baseline failure changed unexpectedly
- `REQUIRED UI FAILURE`: current code does not meet a required new interface contract
- `UNEXPECTED FAILURE`: an unclassified failure that blocks the normal command

The default command exits nonzero for regressions, unexpected failures, and unmet
new UI contracts. It tolerates only the explicitly disclosed unchanged baseline
bugs. The strict command deliberately exits nonzero while any legacy bug remains.

## Verified checkpoint

At the 2026-10-02 integration checkpoint, 52 contracts ran per timezone:

| Timezone | Expectations met | Unchanged baseline bugs | New regressions / required UI failures |
| --- | ---: | ---: | ---: |
| UTC | 46 (26 existing + 20 fixed/new) | 6 | 0 |
| America/Los_Angeles | 43 (23 existing + 20 fixed/new) | 9 | 0 |
| Asia/Shanghai | 46 (26 existing + 20 fixed/new) | 6 | 0 |

Rerun the commands after further edits; this checkpoint is not a claim about
future working-tree versions.

## Coverage

- Imported IB CSV fields and TransactionID replacement/deduplication
- Only closed records contribute imported `FifoPnlRealized`; synthetic entry/exit
  prices intentionally disagree with realized P&L, so recalculating it would fail
- Same-batch open/close linkage, holding durations, cross-batch and reload defects
- Exact symbol matching, trailing `*` prefix matching, date/symbol intersections,
  date inclusivity, month boundaries, leap days, all-range reset, YTD and 30-day presets
- Entire daily/weekly log schema, CRUD, storage round trips, individual/batch
  associations, full form submission/reopen/update/delete, weekly auto-fields
- AI configuration, health request, daily/weekly draft generation, submit-only
  persistence, error handling, synthetic order attachment contents, weekly range
- All six theme APIs and actual theme-button callbacks; original trades, logs,
  AI config and R2 config stay byte-identical
- Calendar/analytics/journal navigation keeps original data intact
- Desktop headers, all dates and weekly summaries; 375/700/701px DOM structure;
  CSS weekend breakpoint and full-row mobile weekly summaries
- Mobile weekend P&L, journals and weekly totals remain present in data

## Unchanged baseline defects (not introduced by the redesign)

1. `reload-transaction-ids`: storage loading groups distinct same-day/symbol/
   open-close records and discards later TransactionIDs
2. `reload-numeric-quantity`: string quantities `"2"` and `"3"` become `"23"`
3. `cross-batch-open-time`: an imported close cannot find an open in an earlier
   import batch; `OpenDateTime` becomes empty
4. `reload-import-idempotence`: two trades with P&L 10 and 20 become 50 after a
   storage reload and repeat import of the second record, instead of remaining 30
5. `independent-log-associations`: default `associatedTrades` arrays are shared
   between newly created logs because the template is shallow-copied
6. `independent-log-nested-fields`: default nested log fields are also shared
7. `weekly-auto-stats` (Los Angeles): mixing UTC-parsed date-only strings with
   local weekday arithmetic shifts the intended Monday–Friday review range to
   Tuesday–Saturday. The fixture returns 996 instead of 6 by including Saturday
8. `ai-week-range-timezone` (Los Angeles): the AI period helper has the same range
   shift (`2025-01-28`–`2025-02-01`, expected `2025-01-27`–`2025-01-31`)

9. `monthly-dst-boundary` (Los Angeles): monthly stats advance UTC-midnight
   dates with local `setDate`, repeating the daylight-saving date and missing the
   month's final UTC date. March 9 P&L 7 plus March 31 P&L 3 returns 14 instead of 10

The first six reproduce in all three tested timezones. The last three are not visible
in UTC or Shanghai. Tests do not change trading calculations, matching, or storage
behavior to hide these failures.

Previously failing date-display/filter contracts now pass: month/quarter end
inclusion, week crossing a month boundary, January-31 navigation, local input
labels, YTD, last 30 days, and combined date/symbol filters.

## Isolation and limits

`harness.mjs` reads application source and evaluates the actual ESM modules inside
fresh Node VM contexts. It uses a small DOM/form/event double and an in-memory
localStorage double. A few existing private helpers receive test-only exports in
the in-memory source; production files are not edited.

All records, log text, URLs and credentials are synthetic. The tests do not open
browser profiles or read actual localStorage or credentials. `fetch` is replaced
with an in-memory double; unexpected requests throw instead of reaching a network.
R2 is disabled, and scheduled timers are queued rather than executed.

These are behavior and structural-CSS tests, not a full browser layout engine.
They do not certify screenshots, computed layout, chart canvas rendering, focus
traps, real IB/R2/AI service connectivity, or authentication. Those require
separate authorized browser/integration checks. The parser intentionally models
only the DOM operations exercised by these contracts.

## Native localization regression suite

`npm test` also runs `tests/i18n.mjs`. Run `npm run test:i18n:timezones` to exercise
its 23 contracts in UTC, America/Los_Angeles and Asia/Shanghai. These test the
actual locale handlers and UI modules with synthetic records, including switches
inside open unsaved forms, in-flight AI requests, byte-identical request payloads,
chart-instance/data preservation, stable enum values, and repeat close/reopen.

The DOM double now models compound selectors, entity decoding, live element
lookup, innerHTML serialization, cloned elements and handler `this` binding for
those flows. It remains a test double, not a real browser or layout renderer.
See `I18N.md` for the display-only localization contract and validation limits.
