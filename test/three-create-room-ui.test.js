import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// 从真实页面脚本加载建房流程，模拟服务回执及当前浏览器状态。
const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const flow = source.slice(source.indexOf('async function createRoom('), source.indexOf("$('create').onclick"));

function setup(status, error, phase) {
  const button = {};
  const oldRoom = { id: 'old' };
  let pauses = 0;
  const context = {
    session: oldRoom, state: { sessionPhase: phase }, creatingRoom: false,
    $: () => button, action: async () => { pauses++; },
    fetch: async () => new Response(JSON.stringify({ error }), { status }),
  };
  const create = runInNewContext(flow + '\ncreateRoom;', context);
  return { button, oldRoom, context, create, pauses: () => pauses };
}

test('缺少邀请时显示原因，不声称暂停了未运行的房间', async () => {
  const env = setup(403, '请先从研究者提供的完整分享邀请链接进入', 'lobby');
  await assert.rejects(env.create(), /403.*邀请链接/);
  assert.equal(env.pauses(), 0);
  assert.equal(env.context.session, env.oldRoom);
  assert.equal(env.button.disabled, false);
});

test('暂停成功后建房被拒绝，保留旧房间并说明配额', async () => {
  const env = setup(429, '分享房间数量已达限制', 'playing');
  await assert.rejects(env.create(), /429.*已达限制.*原房间已暂停/);
  assert.equal(env.pauses(), 1);
  assert.equal(env.context.session, env.oldRoom);
});
