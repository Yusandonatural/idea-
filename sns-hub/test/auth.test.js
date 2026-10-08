import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/auth.js';

test('パスワードは毎回違う塩でハッシュ化され、正しいものだけ通る', async () => {
  const a = await hashPassword('ochaocha123');
  const b = await hashPassword('ochaocha123');
  assert.notEqual(a, b);
  assert.match(a, /^pbkdf2\$100000\$/);
  assert.equal(await verifyPassword('ochaocha123', a), true);
  assert.equal(await verifyPassword('ochaocha124', a), false);
  assert.equal(await verifyPassword('x', 'garbage'), false);
});
