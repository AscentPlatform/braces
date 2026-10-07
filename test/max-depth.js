'use strict';

require('mocha');
const assert = require('assert').strict;
const path = require('path');
const { spawnSync } = require('child_process');
const braces = require('..');

const nested = (depth, inner = 'a,b') => '{'.repeat(depth) + inner + '}'.repeat(depth);

// GHSA-vfj7-8cjw-p6xm: deeply nested patterns below `maxLength` used to
// exhaust the call stack in the recursive compile/expand walkers.
describe('max depth', () => {
  const deep = nested(4000); // 8003 chars: under MAX_LENGTH, crashed 3.0.3 in compile

  it('throws a catchable SyntaxError instead of overflowing the stack', () => {
    assert.ok(deep.length < 10000);
    assert.throws(() => braces(deep), SyntaxError, /max depth/);
    assert.throws(() => braces.compile(deep), SyntaxError, /max depth/);
    assert.throws(() => braces.expand(deep), SyntaxError, /max depth/);
    assert.throws(() => braces.parse(deep), SyntaxError, /max depth/);
    assert.throws(() => braces.create(deep), SyntaxError, /max depth/);
  });

  it('reports a depth error, never a stack overflow, on a constrained stack', () => {
    // A small stack makes the pre-fix RangeError deterministic (1,000 levels
    // overflow it on every Node version) instead of depending on JIT state.
    const script = `
      const braces = require(${JSON.stringify(path.resolve(__dirname, '..'))});
      const input = '{'.repeat(1000) + 'a,b' + '}'.repeat(1000);
      for (const method of ['compile', 'expand']) {
        try { braces[method](input); process.exit(2); } catch (err) { console.log(err.constructor.name); }
      }
    `;
    const result = spawnSync(process.execPath, ['--stack-size=100', '-e', script], { encoding: 'utf8' });
    assert.equal(result.stdout.trim(), 'SyntaxError\nSyntaxError');
  });

  it('also rejects unclosed deep nesting', () => {
    assert.throws(() => braces('{'.repeat(9000)), SyntaxError, /max depth/);
  });

  it('allows nesting up to the default limit (100)', () => {
    assert.doesNotThrow(() => braces(nested(100)));
    assert.doesNotThrow(() => braces.expand(nested(100, 'a')));
    assert.throws(() => braces(nested(101)), SyntaxError, /max depth/);
  });

  it('supports options.maxDepth', () => {
    assert.throws(() => braces('a{b,{c,d}}', { maxDepth: 1 }), SyntaxError, /max depth/);
    assert.deepEqual(braces.expand('a{b,{c,d}}', { maxDepth: 2 }), ['ab', 'ac', 'ad']);
    assert.doesNotThrow(() => braces(nested(150), { maxDepth: 200 }));
  });

  it('does not affect ordinary nested patterns', () => {
    assert.deepEqual(braces.expand('/usr/{ucb/{ex,edit},lib/{ex,how_ex}}'), ['/usr/ucb/ex', '/usr/ucb/edit', '/usr/lib/ex', '/usr/lib/how_ex']);
  });
});
