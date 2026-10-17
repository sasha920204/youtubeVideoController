import { vi } from 'vitest';

// 팝업 테스트용: chrome.* API와 "유튜브 탭의 content script"를 흉내 낸다.
// tabs.sendMessage로 들어온 메시지를 FakeContent가 실제 content.js처럼 처리한다.
export class FakeContent {
  constructor(overrides = {}) {
    this.state = {
      speed: 1.0,
      pitch: 0,
      loop: { start: 0, end: 0, enabled: false },
      duration: 200,
      currentTime: 10,
      title: 'Test Song',
      isPlaying: true,
      volume: 1,
      hasVideo: true,
      initFailures: 0, // initializePitch가 이 횟수만큼 실패한 뒤 성공
      initReason: undefined, // 실패 이유 (예: 'needsReload'면 계속 실패)
      ...overrides,
    };
    this.initCalls = 0;
  }

  handle(msg) {
    const s = this.state;
    switch (msg.action) {
      case 'getVideoInfo':
        if (!s.hasVideo) return { success: false };
        return { success: true, duration: s.duration, currentTime: s.currentTime, title: s.title, isPlaying: s.isPlaying };
      case 'getVideoState':
        if (!s.hasVideo) return { success: false };
        return {
          success: true, isPlaying: s.isPlaying, volume: s.volume, currentTime: s.currentTime,
          duration: s.duration, speed: s.speed, pitch: s.pitch, loop: { ...s.loop },
        };
      case 'setPlaybackRate': s.speed = msg.speed; return { success: true };
      case 'setPitch': s.pitch = msg.pitch; return { success: true, currentPitch: s.pitch };
      case 'disablePitch': s.pitch = 0; return { success: true };
      case 'initializePitch':
        this.initCalls += 1;
        if (s.initReason === 'needsReload') return { success: false, reason: 'needsReload' };
        if (this.initCalls <= s.initFailures) return { success: false, reason: 'failed' };
        return { success: true };
      case 'setLoop': s.loop = { start: msg.start, end: msg.end, enabled: msg.enabled }; return { success: true };
      case 'seekTo': s.currentTime = msg.time; return { success: true };
      case 'setVolume': s.volume = msg.volume; return { success: true };
      case 'togglePlayPause': s.isPlaying = !s.isPlaying; return { success: true };
      default: return { success: false, error: 'Unknown action' };
    }
  }
}

export function installFakeChrome({
  url = 'https://www.youtube.com/watch?v=abc',
  content = new FakeContent(),
  receiverMissing = false, // true면 content script가 없는 탭 (주입 전까지 연결 오류)
  iframeAnswersFirst = false, // true면 frameId 없이 보낸 메시지에 영상 없는 iframe이 먼저 응답
  storage = {},
} = {}) {
  let hasReceiver = !receiverMissing;
  const sent = []; // { message, options }
  const runtimeListeners = new Set();
  const store = { ...storage };

  const deliver = (message, options) => {
    sent.push({ message, options });
    if (!hasReceiver) {
      return Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'));
    }
    if (iframeAnswersFirst && !(options && options.frameId === 0)) {
      return Promise.resolve({ success: false, error: 'Invalid execution context' });
    }
    return Promise.resolve(content.handle(message));
  };

  const chrome = {
    tabs: {
      query: vi.fn((_q, cb) => {
        const tabs = [{ id: 1, url }];
        if (cb) { cb(tabs); return undefined; }
        return Promise.resolve(tabs);
      }),
      sendMessage: vi.fn((_tabId, message, options, cb) => {
        if (typeof options === 'function') { cb = options; options = undefined; }
        const p = deliver(message, options);
        if (cb) { p.then(cb, () => cb(undefined)); return undefined; }
        return p;
      }),
      reload: vi.fn(() => Promise.resolve()),
      create: vi.fn(() => Promise.resolve({ id: 2 })),
    },
    scripting: {
      executeScript: vi.fn(() => { hasReceiver = true; return Promise.resolve([]); }),
    },
    storage: {
      local: {
        get: vi.fn(async (keys) => {
          const out = {};
          (Array.isArray(keys) ? keys : [keys]).forEach((k) => { if (k in store) out[k] = store[k]; });
          return out;
        }),
        set: vi.fn(async (obj) => { Object.assign(store, obj); }),
      },
    },
    runtime: {
      onMessage: {
        addListener: vi.fn((fn) => runtimeListeners.add(fn)),
        removeListener: vi.fn((fn) => runtimeListeners.delete(fn)),
      },
      getURL: (p) => `chrome-extension://test/${p.replace(/^\//, '')}`,
    },
  };

  globalThis.chrome = chrome;

  const sentActions = (action) => sent.filter((s) => s.message.action === action).map((s) => s.message);

  // content script가 chrome.runtime.sendMessage로 팝업에 보내는 메시지 흉내
  const emitRuntimeMessage = (message) => runtimeListeners.forEach((fn) => fn(message, {}, () => {}));

  return { chrome, content, sent, sentActions, store, emitRuntimeMessage };
}
