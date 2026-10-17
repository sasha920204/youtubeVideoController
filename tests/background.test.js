// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

let commandListener;
let sendMessage;
let executeScript;
let tabUrl;
let store;
let receiverMissing;

beforeEach(async () => {
  tabUrl = 'https://www.youtube.com/watch?v=abc';
  store = {};
  receiverMissing = false;
  sendMessage = vi.fn(async () => {
    if (receiverMissing) throw new Error('Could not establish connection. Receiving end does not exist.');
    return { success: true };
  });
  executeScript = vi.fn(async () => { receiverMissing = false; return []; });
  globalThis.chrome = {
    commands: { onCommand: { addListener: (fn) => { commandListener = fn; } } },
    storage: { local: { get: vi.fn(async (keys) => Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]]))) } },
    tabs: { query: vi.fn(async () => [{ id: 7, url: tabUrl }]), sendMessage },
    scripting: { executeScript },
  };
  vi.resetModules();
  await import('../src/background.js');
});

const run = async (command) => {
  const { handleCommand } = await import('../src/background.js');
  return handleCommand(command);
};

describe('키보드 단축키 — 백그라운드 (KEY)', () => {
  it('KEY-B1 단축키를 현재 유튜브 탭의 최상위 프레임으로 보낸다', async () => {
    expect(commandListener).toBeTypeOf('function');
    expect(await run('speed-up')).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith(7, { action: 'shortcut', command: 'speed-up' }, { frameId: 0 });
  });

  it('KEY-B2 유튜브가 아닌 탭에서는 아무것도 하지 않는다', async () => {
    tabUrl = 'https://example.com/';
    expect(await run('speed-up')).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('KEY-B3 전역 스위치가 꺼져 있으면 단축키도 동작하지 않는다', async () => {
    store.isGlobalEnabled = false;
    expect(await run('loop-b')).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('KEY-B4 content script가 없는 탭이면 주입한 뒤 다시 보낸다', async () => {
    receiverMissing = true;
    expect(await run('loop-a')).toBe(true);
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 7, frameIds: [0] }, files: ['content.js'] });
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('KEY-B5 알 수 없는 명령은 무시한다', async () => {
    expect(await run('nope')).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('KEY-B6 manifest에 모든 단축키가 있고, 기본 키는 크롬 제한(4개) 이하다', async () => {
    const { SHORTCUT_COMMANDS } = await import('../src/background.js');
    const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../manifest.json'), 'utf8'));
    expect(manifest.background).toEqual({ service_worker: 'background.js' });
    expect(Object.keys(manifest.commands).sort()).toEqual([...SHORTCUT_COMMANDS].sort());
    const withKeys = Object.values(manifest.commands).filter((c) => c.suggested_key);
    expect(withKeys.length).toBeLessThanOrEqual(4);
  });
});
