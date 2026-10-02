import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import cases from './contracts.mjs';
import { harness, BASELINE } from './harness.mjs';

const args = new Set(process.argv.slice(2));
if (args.has('--timezones')) {
  let failed = false;
  for (const TZ of ['UTC', 'America/Los_Angeles', 'Asia/Shanghai']) {
    console.log(`\n===== TIMEZONE: ${TZ} =====`);
    try { execFileSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', fileURLToPath(import.meta.url)], { env: { ...process.env, TZ }, stdio: 'inherit' }); } catch { failed = true; }
  }
  process.exit(failed ? 1 : 0);
}
process.env.TZ ||= 'UTC';
const baselineOnly = args.has('--baseline');
const outcomes = [];
console.log(`Synthetic PnLCalendar contracts | TZ=${process.env.TZ} | baseline=${BASELINE}`);
console.log('No browser profile or real localStorage is read. All fetch calls are in-memory doubles.\n');
for (const spec of cases) {
  const results = {};
  for (const revision of baselineOnly ? ['baseline'] : ['baseline', 'current']) {
    try { const options = { revision }; const h = await harness(options); await spec.fn(h, options); results[revision] = { passed: true }; }
    catch (error) { results[revision] = { passed: false, error: error.message }; }
  }
  const base = results.baseline, current = results.current;
  let status;
  if (baselineOnly) status = base.passed ? 'PASS' : spec.knownBaseline ? 'BASELINE BUG' : spec.newContract ? 'NEW CONTRACT (absent)' : 'BASELINE UNEXPECTED FAILURE';
  else if (current.passed) status = base.passed ? 'PASS' : 'FIXED / NEW PASS';
  else if (!base.passed && spec.knownBaseline && base.error === current.error) status = 'KNOWN BASELINE BUG';
  else if (!base.passed && spec.knownBaseline) status = 'REGRESSION (changed baseline failure)';
  else status = base.passed ? 'REGRESSION' : spec.newContract ? 'REQUIRED UI FAILURE' : 'UNEXPECTED FAILURE';
  outcomes.push({ ...spec, results, status });
  console.log(`${status.padEnd(27)} ${spec.id}: ${spec.name}`);
  if ((baselineOnly && !base.passed) || (!baselineOnly && !current.passed)) {
    const message = (current || base).error.split('\n').slice(0, 12).join('\n'); console.log(message.split('\n').map(s => `    ${s}`).join('\n'));
  }
}
const counts = Object.fromEntries([...new Set(outcomes.map(o => o.status))].map(status => [status, outcomes.filter(o => o.status === status).length]));
console.log('\nSummary:', counts);
console.log('Known baseline bugs are disclosed failures, not passing checks. --strict fails for any current unmet contract.');
const hardFailure = outcomes.some(o => /REGRESSION|REQUIRED UI FAILURE|UNEXPECTED FAILURE/.test(o.status));
const strictFailure = args.has('--strict') && outcomes.some(o => !o.results.current?.passed);
process.exitCode = hardFailure || strictFailure ? 1 : 0;
