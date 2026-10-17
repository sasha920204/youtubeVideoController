// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://www.youtube.com/watch?v=abc" }
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// jsdom의 <video>는 재생을 지원하지 않으므로 필요한 속성만 흉내 낸다
function createFakeVideo({ duration = 200, currentTime = 10, paused = false } = {}) {
  const video = document.createElement('video');
  let time = currentTime;
  let isPaused = paused;
  Object.defineProperties(video, {
    duration: { configurable: true, get: () => duration },
    currentTime: { configurable: true, get: () => time, set: (v) => { time = v; } },
    paused: { configurable: true, get: () => isPaused },
    playbackRate: { configurable: true, writable: true, value: 1 },
    volume: { configurable: true, writable: true, value: 1 },
  });
  video.play = vi.fn(() => { isPaused = false; return Promise.resolve(); });
  video.pause = vi.fn(() => { isPaused = true; });
  return video;
}

// Web Audio 최소 모형 (피치 초기화 경로 확인용)
class FakeAudioParam { constructor() { this.value = 0; } }
class FakeAudioWorkletNode {
  constructor() {
    this.parameters = new Map([['semitones', new FakeAudioParam()]]);
    FakeAudioWorkletNode.last = this;
  }
  connect() {}
  disconnect() {}
}
const fakeNode = () => ({ connect() {}, disconnect() {} });
class FakeAudioContext {
  constructor() {
    this.state = FakeAudioContext.initialState;
    this.destination = fakeNode();
    this.audioWorklet = { addModule: vi.fn(() => Promise.resolve()) };
  }
  resume() {
    // 자동재생 정책으로 막힌 상황 흉내: 끝나지 않는 Promise
    if (FakeAudioContext.resumeHangs) return new Promise(() => {});
    this.state = 'running';
    return Promise.resolve();
  }
  createMediaElementSource() {
    FakeAudioContext.sourceCalls += 1;
    if (FakeAudioContext.alreadyConnected || FakeAudioContext.sourceCalls > 1) {
      // 같은 <video>에 두 번 연결하면 브라우저가 InvalidStateError를 던진다
      throw new Error('InvalidStateError: HTMLMediaElement already connected previously to a different MediaElementSourceNode');
    }
    return fakeNode();
  }
  createGain() { return { ...fakeNode(), gain: { value: 1 } }; }
}

let listener;
let video;

function resetFakeAudio() {
  FakeAudioContext.initialState = 'running';
  FakeAudioContext.resumeHangs = false;
  FakeAudioContext.alreadyConnected = false;
  FakeAudioContext.sourceCalls = 0;
}

async function loadContentScript(videoOptions) {
  document.body.innerHTML = '<h1 class="title">Test Song</h1>';
  if (videoOptions !== null) {
    video = createFakeVideo(videoOptions);
    document.body.appendChild(video);
  }
  listener = undefined;
  globalThis.chrome = {
    runtime: {
      onMessage: { addListener: (fn) => { listener = fn; } },
      getURL: (p) => `chrome-extension://test/${p}`,
    },
    storage: { local: { set: vi.fn((_v, cb) => cb && cb()) } },
  };
  globalThis.chrome.runtime.sendMessage = vi.fn(() => Promise.resolve());
  globalThis.AudioContext = FakeAudioContext;
  globalThis.AudioWorkletNode = FakeAudioWorkletNode;
  vi.resetModules();
  await import('../src/content.js');
  expect(listener).toBeTypeOf('function');
}

function send(message) {
  return new Promise((resolve) => {
    const keepOpen = listener(message, {}, resolve);
    if (keepOpen !== true) {
      // 동기 응답은 이미 resolve 됨
    }
  });
}

beforeEach(() => {
  resetFakeAudio();
  vi.useFakeTimers();
  window.history.replaceState({}, '', '/watch?v=abc');
});

afterEach(() => {
  vi.useRealTimers();
  delete globalThis.chrome;
});

describe('content script 메시지 처리 (CS)', () => {
  it('CS-01 getVideoInfo는 길이·현재 시간·제목을 돌려준다', async () => {
    await loadContentScript();
    const res = await send({ action: 'getVideoInfo' });
    expect(res).toMatchObject({ success: true, duration: 200, currentTime: 10, title: 'Test Song' });
  });

  it('CS-02 getVideoState는 속도·피치·반복 상태를 돌려준다', async () => {
    await loadContentScript();
    video.playbackRate = 1.5;
    const res = await send({ action: 'getVideoState' });
    expect(res).toMatchObject({
      success: true, speed: 1.5, pitch: 0, duration: 200, isPlaying: true,
      loop: { start: 0, end: 0, enabled: false },
    });
  });

  it('CS-03 setPlaybackRate는 영상 속도를 바꾼다', async () => {
    await loadContentScript();
    expect(await send({ action: 'setPlaybackRate', speed: 1.5 })).toEqual({ success: true });
    expect(video.playbackRate).toBe(1.5);
  });

  it('CS-04 seekTo는 재생 위치를 옮긴다', async () => {
    await loadContentScript();
    expect(await send({ action: 'seekTo', time: 42 })).toEqual({ success: true });
    expect(video.currentTime).toBe(42);
  });

  it('CS-05 setVolume은 영상 볼륨을 0~1로 제한해 설정한다', async () => {
    await loadContentScript();
    await send({ action: 'setVolume', volume: 0.3 });
    expect(video.volume).toBe(0.3);
    await send({ action: 'setVolume', volume: 5 });
    expect(video.volume).toBe(1);
  });

  it('CS-06 togglePlayPause는 재생과 일시정지를 오간다', async () => {
    await loadContentScript();
    await send({ action: 'togglePlayPause' });
    expect(video.pause).toHaveBeenCalled();
    expect(video.paused).toBe(true);
    await send({ action: 'togglePlayPause' });
    expect(video.play).toHaveBeenCalled();
    expect(video.paused).toBe(false);
  });

  it('CS-07 알 수 없는 action은 실패로 응답한다', async () => {
    await loadContentScript();
    expect(await send({ action: 'nope' })).toMatchObject({ success: false });
  });

  it('CS-08 영상이 없으면 getVideoInfo는 실패로 응답한다', async () => {
    await loadContentScript(null);
    expect(await send({ action: 'getVideoInfo' })).toMatchObject({ success: false });
  });

  it('CS-09 다른 영상으로 URL이 바뀌면 2초 안에 설정을 초기화한다', async () => {
    await loadContentScript();
    video.playbackRate = 1.5;
    window.history.pushState({}, '', '/watch?v=other');
    vi.advanceTimersByTime(2000);
    expect(video.playbackRate).toBe(1);
  });

  it('CS-10 같은 영상 안에서 앞뒤로 크게 이동해도 설정을 초기화하지 않는다', async () => {
    await loadContentScript();
    video.playbackRate = 1.5;
    video.currentTime = 100; // 30초 넘게 앞으로
    vi.advanceTimersByTime(2000);
    video.currentTime = 20; // 10초 넘게 뒤로
    vi.advanceTimersByTime(2000);
    video.currentTime = 0.5; // 처음으로
    vi.advanceTimersByTime(2000);
    expect(video.playbackRate).toBe(1.5);
  });

  it('CS-11 같은 영상에서 URL의 다른 값(t= 등)만 바뀌면 초기화하지 않는다', async () => {
    await loadContentScript();
    video.playbackRate = 1.5;
    window.history.pushState({}, '', '/watch?v=abc&t=42s');
    vi.advanceTimersByTime(2000);
    expect(video.playbackRate).toBe(1.5);
  });

  it('CS-12 제목이 늦게 로드되거나 바뀌어도 같은 영상이면 초기화하지 않는다', async () => {
    await loadContentScript();
    video.playbackRate = 1.5;
    document.querySelector('h1.title').textContent = 'Test Song (Official Video)';
    vi.advanceTimersByTime(2000);
    expect(video.playbackRate).toBe(1.5);
  });
});

describe('구간 반복 — 영상 쪽 (LOOPC)', () => {
  it('LOOPC-01 잘못된 구간은 거부한다', async () => {
    await loadContentScript();
    expect(await send({ action: 'setLoop', start: 60, end: 30, enabled: true })).toEqual({ success: false });
    expect(await send({ action: 'setLoop', start: 10, end: 500, enabled: true })).toEqual({ success: false });
  });

  it('LOOPC-02 영상 전체 구간은 반복을 켜지 않는다', async () => {
    await loadContentScript();
    expect(await send({ action: 'setLoop', start: 0, end: 200, enabled: true })).toEqual({ success: true });
    expect((await send({ action: 'getVideoState' })).loop.enabled).toBe(false);
  });

  it('LOOPC-03 끝점(B)까지 재생한 뒤 시작점으로 점프한다 (B 직전을 잘라먹지 않음)', async () => {
    await loadContentScript();
    await send({ action: 'setLoop', start: 30, end: 60, enabled: true });
    video.currentTime = 59.6;
    video.dispatchEvent(new Event('timeupdate'));
    vi.advanceTimersByTime(30);
    expect(video.currentTime).toBe(59.6);
    video.currentTime = 60;
    vi.advanceTimersByTime(30);
    expect(video.currentTime).toBe(30);
  });

  it('LOOPC-07 이동(seek)이 진행 중이면 다시 이동시키지 않는다', async () => {
    await loadContentScript();
    await send({ action: 'setLoop', start: 30, end: 60, enabled: true });
    const seeks = [];
    let t = 61;
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => t, set: (v) => { seeks.push(v); } });
    Object.defineProperty(video, 'seeking', { configurable: true, get: () => true });
    video.dispatchEvent(new Event('timeupdate'));
    vi.advanceTimersByTime(300);
    expect(seeks).toEqual([]);
  });

  it('LOOPC-04 반복 중 영상이 끝나면 시작점에서 다시 재생한다', async () => {
    await loadContentScript();
    await send({ action: 'setLoop', start: 30, end: 60, enabled: true });
    video.currentTime = 200;
    video.dispatchEvent(new Event('ended'));
    expect(video.currentTime).toBe(30);
    expect(video.play).toHaveBeenCalled();
  });

  it('LOOPC-05 반복을 끄면 더 이상 점프하지 않는다', async () => {
    await loadContentScript();
    await send({ action: 'setLoop', start: 30, end: 60, enabled: true });
    await send({ action: 'setLoop', start: 30, end: 60, enabled: false });
    video.currentTime = 59.6;
    video.dispatchEvent(new Event('timeupdate'));
    vi.advanceTimersByTime(100);
    expect(video.currentTime).toBe(59.6);
  });
});

describe('구간 반복 — 이동 정밀도 (LOOPC)', () => {
  it('LOOPC-08 (80% 속도) A가 소수점 시간이고 이동 결과가 A보다 아주 조금 앞이어도 다시 이동하지 않는다', async () => {
    await loadContentScript();
    await send({ action: 'setPlaybackRate', speed: 0.8 });
    // 브라우저는 위치를 마이크로초 단위로 저장해서, 70.123456789로 이동하면 70.123456이 된다
    const seeks = [];
    let t = 50;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => t,
      set: (v) => { seeks.push(v); t = Math.floor(v * 1e6) / 1e6; },
    });
    await send({ action: 'setLoop', start: 70.123456789, end: 95, enabled: true });
    t = 95; // B 도달
    vi.advanceTimersByTime(30);
    expect(seeks.length).toBe(1);
    // 이동 직후 timeupdate와 30ms 체크가 여러 번 돌아도 다시 이동하지 않아야 한다
    for (let i = 0; i < 10; i++) {
      video.dispatchEvent(new Event('timeupdate'));
      vi.advanceTimersByTime(30);
    }
    expect(seeks.length).toBe(1);
    expect(video.playbackRate).toBe(0.8);
    // 다음 바퀴: 재생이 이어져 B에 다시 도달하면 정상적으로 한 번 더 점프한다
    vi.advanceTimersByTime(400);
    t = 95;
    vi.advanceTimersByTime(30);
    expect(seeks.length).toBe(2);
  });
});

describe('구간 반복 + 속도 (LOOPC)', () => {
  it('LOOPC-06 구간 반복을 지정하고 반복이 돌아도 재생 속도와 반복이 유지된다', async () => {
    await loadContentScript();
    await send({ action: 'setPlaybackRate', speed: 1.5 });
    video.currentTime = 100;
    vi.advanceTimersByTime(2000);
    // 팝업에서 구간 지정: 시작점으로 이동 후 반복 ON
    await send({ action: 'seekTo', time: 30 });
    await send({ action: 'setLoop', start: 30, end: 60, enabled: true });
    vi.advanceTimersByTime(2000);
    // 반복 한 바퀴: 끝점 도달 → 시작점으로 점프
    video.currentTime = 60;
    video.dispatchEvent(new Event('timeupdate'));
    vi.advanceTimersByTime(2000);
    expect(video.currentTime).toBe(30);
    expect(video.playbackRate).toBe(1.5);
    expect((await send({ action: 'getVideoState' })).loop.enabled).toBe(true);
  });
});

describe('피치 — 영상 쪽 (PIT)', () => {
  it('PIT-06 피치를 바꿔도 재생 속도는 그대로다', async () => {
    await loadContentScript();
    await send({ action: 'setPlaybackRate', speed: 1.5 });
    expect(await send({ action: 'setPitch', pitch: 3 })).toMatchObject({ success: true, currentPitch: 3 });
    expect(FakeAudioWorkletNode.last.parameters.get('semitones').value).toBe(3);
    expect(video.playbackRate).toBe(1.5);
  });

  it('PIT-07 피치 기능을 끄면 워클릿 피치가 0으로 돌아간다', async () => {
    await loadContentScript();
    await send({ action: 'setPitch', pitch: 5 });
    expect(FakeAudioWorkletNode.last.parameters.get('semitones').value).toBe(5);
    expect(await send({ action: 'disablePitch' })).toEqual({ success: true });
    expect(FakeAudioWorkletNode.last.parameters.get('semitones').value).toBe(0);
    expect((await send({ action: 'getVideoState' })).pitch).toBe(0);
  });
});

describe('피치 엔진 초기화 (PIT)', () => {
  it('PIT-09 초기화와 피치 설정이 동시에 와도 둘 다 성공하고 영상 소리는 한 번만 연결한다', async () => {
    await loadContentScript();
    const [init, pitch] = await Promise.all([
      send({ action: 'initializePitch' }),
      send({ action: 'setPitch', pitch: 3 }),
    ]);
    expect(init).toEqual({ success: true });
    expect(pitch).toMatchObject({ success: true, currentPitch: 3 });
    expect(FakeAudioContext.sourceCalls).toBe(1);
  });

  it('PIT-10 이전 스크립트가 영상 소리를 잡고 있으면 새로고침이 필요하다고 알려준다', async () => {
    await loadContentScript();
    FakeAudioContext.alreadyConnected = true;
    expect(await send({ action: 'initializePitch' })).toEqual({ success: false, reason: 'needsReload' });
  });

  it('PIT-11 AudioContext 재개가 막혀도 초기화 응답이 멈추지 않는다', async () => {
    await loadContentScript();
    FakeAudioContext.initialState = 'suspended';
    FakeAudioContext.resumeHangs = true;
    const pending = send({ action: 'initializePitch' });
    await vi.advanceTimersByTimeAsync(400);
    expect(await pending).toEqual({ success: true });
  });
});

describe('설정 독립성 — 영상 쪽 (IND)', () => {
  const state = async () => {
    const s = await send({ action: 'getVideoState' });
    return {
      speed: video.playbackRate,
      pitch: FakeAudioWorkletNode.last ? FakeAudioWorkletNode.last.parameters.get('semitones').value : 0,
      loop: s.loop,
    };
  };
  const setAll = async () => {
    await send({ action: 'setPlaybackRate', speed: 1.5 });
    await send({ action: 'setPitch', pitch: 3 });
    await send({ action: 'setLoop', start: 30, end: 60, enabled: true });
  };

  it('IND-01 속도·피치·반복을 모두 지정하면 셋 다 그대로 적용된다', async () => {
    await loadContentScript();
    await setAll();
    expect(await state()).toEqual({ speed: 1.5, pitch: 3, loop: { start: 30, end: 60, enabled: true } });
  });

  it('IND-02 속도를 바꿔도 피치와 반복은 그대로다', async () => {
    await loadContentScript();
    await setAll();
    await send({ action: 'setPlaybackRate', speed: 0.8 });
    expect(await state()).toEqual({ speed: 0.8, pitch: 3, loop: { start: 30, end: 60, enabled: true } });
  });

  it('IND-03 피치를 바꿔도 속도와 반복은 그대로다', async () => {
    await loadContentScript();
    await setAll();
    await send({ action: 'setPitch', pitch: -5 });
    expect(await state()).toEqual({ speed: 1.5, pitch: -5, loop: { start: 30, end: 60, enabled: true } });
  });

  it('IND-04 반복 구간을 바꾸거나 끄고 켜도 속도와 피치는 그대로다', async () => {
    await loadContentScript();
    await setAll();
    await send({ action: 'seekTo', time: 40 });
    await send({ action: 'setLoop', start: 40, end: 80, enabled: true });
    expect(await state()).toEqual({ speed: 1.5, pitch: 3, loop: { start: 40, end: 80, enabled: true } });
    await send({ action: 'setLoop', start: 40, end: 80, enabled: false });
    await send({ action: 'setLoop', start: 40, end: 80, enabled: true });
    const s = await state();
    expect(s.speed).toBe(1.5);
    expect(s.pitch).toBe(3);
  });

  it('IND-05 반복이 여러 바퀴 돌고 2초 감지 주기가 지나도 셋 다 유지된다', async () => {
    await loadContentScript();
    await setAll();
    for (let lap = 0; lap < 3; lap++) {
      video.currentTime = 60;
      video.dispatchEvent(new Event('timeupdate'));
      vi.advanceTimersByTime(2000);
    }
    expect(await state()).toEqual({ speed: 1.5, pitch: 3, loop: { start: 30, end: 60, enabled: true } });
  });

  it('IND-06 유튜브 플레이어가 속도를 되돌려도 화면에 설정한 속도로 다시 맞춘다', async () => {
    await loadContentScript();
    await setAll();
    video.playbackRate = 1; // 플레이어가 임의로 1.0x로 바꿈
    video.dispatchEvent(new Event('ratechange'));
    expect(video.playbackRate).toBe(1.5);
  });

  it('IND-08 플레이어가 속도를 계속 되돌려도 서로 무한히 다투지 않는다', async () => {
    await loadContentScript();
    await send({ action: 'setPlaybackRate', speed: 1.5 });
    // 플레이어가 속도가 바뀔 때마다 즉시 1.0으로 되돌리는 최악의 경우
    let rate = 1.5;
    let writes = 0;
    Object.defineProperty(video, 'playbackRate', {
      configurable: true,
      get: () => rate,
      set: (v) => {
        writes += 1;
        if (writes > 200) throw new Error('무한 반복');
        rate = v;
        video.dispatchEvent(new Event('ratechange'));
        if (rate !== 1) { rate = 1; video.dispatchEvent(new Event('ratechange')); }
      },
    });
    rate = 1;
    video.dispatchEvent(new Event('ratechange'));
    expect(writes).toBeLessThanOrEqual(5);
  });

  it('IND-07 다른 영상으로 넘어가 초기화된 뒤에는 이전 속도를 강제하지 않는다', async () => {
    await loadContentScript();
    await setAll();
    window.history.pushState({}, '', '/watch?v=other');
    vi.advanceTimersByTime(2000);
    expect(video.playbackRate).toBe(1);
    video.playbackRate = 1.25; // 새 영상에서 유튜브 메뉴로 바꾼 속도
    video.dispatchEvent(new Event('ratechange'));
    expect(video.playbackRate).toBe(1.25);
  });
});

describe('키보드 단축키 — 영상 쪽 (KEY)', () => {
  const shortcut = (command) => send({ action: 'shortcut', command });
  const toastText = () => document.querySelector('[data-video-controller-toast]')?.textContent;

  it('KEY-01 속도 단축키는 0.1x씩 바꾸고 0.25x~4.0x를 벗어나지 않는다', async () => {
    await loadContentScript();
    await shortcut('speed-up');
    await shortcut('speed-up');
    expect(video.playbackRate).toBe(1.2);
    expect(toastText()).toBe('⚡ 1.2x');
    for (let i = 0; i < 40; i++) await shortcut('speed-up');
    expect(video.playbackRate).toBe(4);
    for (let i = 0; i < 60; i++) await shortcut('speed-down');
    expect(video.playbackRate).toBe(0.25);
  });

  it('KEY-02 피치 단축키는 1반음씩 바꾸고 속도는 그대로 둔다', async () => {
    await loadContentScript();
    await send({ action: 'setPlaybackRate', speed: 1.5 });
    await shortcut('pitch-up');
    await shortcut('pitch-up');
    await shortcut('pitch-down');
    expect(FakeAudioWorkletNode.last.parameters.get('semitones').value).toBe(1);
    expect(toastText()).toBe('🎵 +1');
    expect(video.playbackRate).toBe(1.5);
  });

  it('KEY-03 A 다음 B를 누르면 A~B 반복이 시작된다', async () => {
    await loadContentScript();
    video.currentTime = 30;
    await shortcut('loop-a');
    expect((await send({ action: 'getVideoState' })).loop).toMatchObject({ start: 30, enabled: false });
    video.currentTime = 60;
    await shortcut('loop-b');
    expect((await send({ action: 'getVideoState' })).loop).toEqual({ start: 30, end: 60, enabled: true });
    expect(toastText()).toBe('🔁 0:30 – 1:00');
  });

  it('KEY-04 A 없이 B만 누르면 처음부터 B까지 반복한다', async () => {
    await loadContentScript();
    video.currentTime = 45;
    await shortcut('loop-b');
    expect((await send({ action: 'getVideoState' })).loop).toEqual({ start: 0, end: 45, enabled: true });
  });

  it('KEY-05 반복 켜기/끄기 단축키 (구간이 없으면 안내만 한다)', async () => {
    await loadContentScript();
    expect(await shortcut('loop-toggle')).toEqual({ success: false });
    video.currentTime = 30;
    await shortcut('loop-a');
    video.currentTime = 60;
    await shortcut('loop-b');
    await shortcut('loop-toggle');
    expect((await send({ action: 'getVideoState' })).loop.enabled).toBe(false);
    await shortcut('loop-toggle');
    expect((await send({ action: 'getVideoState' })).loop).toEqual({ start: 30, end: 60, enabled: true });
  });

  it('KEY-06 단축키로 값을 바꾸면 열려 있는 팝업에 알린다', async () => {
    await loadContentScript();
    await shortcut('speed-up');
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'videoStateChanged' });
  });
});
