import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const cfg = {"file": ".github/workflows/deploy.yml", "job": "deploy", "variable": "ENABLE_PAGES_PUBLICATION", "expression": "(github.ref == 'refs/heads/main' && github.event_name != 'pull_request' && inputs.build_only != true) && vars.ENABLE_PAGES_PUBLICATION == 'true'", "repo": "gcake119/ithome-2026"};
const workflow = readFileSync(new URL('../' + cfg.file, import.meta.url), 'utf8');
const block = workflow.split('  ' + cfg.job + ':\n')[1]?.split(/\n  [A-Za-z0-9_-]+:\n/)[0];
const raw = block?.match(/^    if: (.+)$/m)?.[1];
const expression = raw?.replace(/^\$\{\{\s*|\s*\}\}$/g, '');
test('publication requires an explicit enable flag and preserves original conditions', () => {
  assert.equal(expression, cfg.expression);
});
// These conditions use only equality, AND, parentheses and property lookups.
// Test their routing independently of any deployment commands or credentials.
const allows = (value, changes = {}) => {
  assert.ok(expression, 'publication guard must exist');
  const vars = value === undefined ? {} : { [cfg.variable]: value };
  return !!Function('vars', 'github', 'inputs', 'return (' + expression + ')')(
    vars, { repository: cfg.repo, ref: 'refs/heads/main', event_name: 'push', ...changes.github },
    { build_only: false, ...changes.inputs });
};
for (const value of [undefined, '', 'false', 'invalid', '0']) {
  test('publication disabled for ' + String(value), () => assert.equal(allows(value), false));
}
test('explicit true retains publication eligibility', () => assert.equal(allows('true'), true));
if (cfg.job === 'publish-image') {
  test('true does not bypass repository/event/ref restrictions', () => {
    assert.equal(allows('true', { github: { repository: 'other/repo' } }), false);
    assert.equal(allows('true', { github: { event_name: 'pull_request' } }), false);
    assert.equal(allows('true', { github: { ref: 'refs/heads/feature' } }), false);
  });
}
if (cfg.repo.endsWith('/ithome-2026')) {
  test('true does not bypass build-only, PR or main restrictions', () => {
    assert.equal(allows('true', { inputs: { build_only: true } }), false);
    assert.equal(allows('true', { github: { event_name: 'pull_request' } }), false);
    assert.equal(allows('true', { github: { ref: 'refs/heads/feature' } }), false);
  });
}
