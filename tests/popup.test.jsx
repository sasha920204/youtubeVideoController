import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import VideoController from '../src/components/VideoController';
import { installFakeChrome, FakeContent } from './helpers/fakeChrome';

afterEach(() => {
  cleanup();
  delete globalThis.chrome;
});

const openPopup = () => render(<VideoController />);
const waitForController = () => screen.findByText('⚡ Playback Speed');
// 메시지는 활성 탭 조회 후 비동기로 나가므로, 클릭 뒤 대기 중인 Promise까지 흘려보낸다
const click = (title) =>
  act(async () => {
    fireEvent.click(screen.getByTitle(title));
    await new Promise((r) => setTimeout(r, 0));
  });
const lastOf = (list) => list[list.length - 1];

// 피치 버튼은 initializePitch 응답 후에야 동작한다
const waitForPitchReady = async (env) => {
  await waitFor(() => expect(env.sentActions('initializePitch').length).toBeGreaterThan(0));
  await act(async () => {});
};

const typeAndEnter = (title, value) => {
  const input = screen.getByTitle(title);
  fireEvent.change(input, { target: { value } });
  fireEvent.keyPress(input, { key: 'Enter', code: 'Enter', charCode: 13 });
};

describe('연결 (CONN)', () => {
  it('CONN-01 영상 탭에서 열면 연결 중 표시 후 Refresh 화면 없이 컨트롤러가 뜬다', async () => {
    installFakeChrome();
    openPopup();
    expect(screen.getByText(/영상에 연결하는 중/)).toBeInTheDocument();
    expect(screen.queryByText('Refresh Page')).not.toBeInTheDocument();
    await waitForController();
    expect(screen.queryByText('Refresh Page')).not.toBeInTheDocument();
  });

  it('CONN-02 유튜브가 아닌 탭이면 안내와 Refresh 버튼을 보여준다', async () => {
    installFakeChrome({ url: 'https://example.com/' });
    openPopup();
    expect(await screen.findByText(/Please open YouTube/)).toBeInTheDocument();
    expect(screen.getByText('Refresh Page')).toBeInTheDocument();
  });

  it('CONN-03 Refresh 버튼은 현재 탭을 새로고침한다', async () => {
    const env = installFakeChrome({ url: 'https://example.com/' });
    openPopup();
    await screen.findByText('Refresh Page');
    await click('Refresh current page');
    await waitFor(() => expect(env.chrome.tabs.reload).toHaveBeenCalledWith(1));
  });

  it('CONN-04 content script가 없는 탭이면 자동 주입 후 연결된다', async () => {
    const env = installFakeChrome({ receiverMissing: true });
    openPopup();
    await waitFor(() => expect(env.chrome.scripting.executeScript).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(env.chrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 1, frameIds: [0] },
      files: ['content.js'],
    });
    await screen.findByText('⚡ Playback Speed', {}, { timeout: 3000 });
  });

  it('CONN-05 iframe이 먼저 응답해도 최상위 프레임으로만 보내서 연결된다', async () => {
    const env = installFakeChrome({ iframeAnswersFirst: true });
    openPopup();
    await waitForController();
    expect(env.sent.length).toBeGreaterThan(0);
    env.sent.forEach(({ options }) => expect(options).toEqual({ frameId: 0 }));
  });

  it('CONN-06 영상이 없는 유튜브 페이지면 연결 실패 안내를 보여준다', async () => {
    installFakeChrome({ url: 'https://www.youtube.com/', content: new FakeContent({ hasVideo: false }) });
    openPopup();
    expect(await screen.findByText(/Please open YouTube/)).toBeInTheDocument();
  });
});

describe('재생 속도 (SPD)', () => {
  it('SPD-01 ±0.1 / ±0.2 버튼으로 속도를 바꾼다', async () => {
    const env = installFakeChrome();
    openPopup();
    await waitForController();
    const speeds = () => env.sentActions('setPlaybackRate').map((m) => m.speed);

    await click('Up 0.1x');
    expect(lastOf(speeds())).toBe(1.1);
    await click('Reset to normal speed');
    await click('Up 0.2x');
    expect(lastOf(speeds())).toBe(1.2);
    await click('Reset to normal speed');
    await click('Down 0.1x');
    expect(lastOf(speeds())).toBe(0.9);
    await click('Reset to normal speed');
    await click('Down 0.2x');
    expect(lastOf(speeds())).toBe(0.8);
  });

  it('SPD-02 속도는 0.25x ~ 4.0x를 벗어나지 않는다', async () => {
    const env = installFakeChrome();
    openPopup();
    await waitForController();
    for (let i = 0; i < 20; i++) await click('Up 0.2x');
    expect(env.content.state.speed).toBe(4);
    expect(screen.getByText('4x')).toBeInTheDocument();
    for (let i = 0; i < 30; i++) await click('Down 0.2x');
    expect(env.content.state.speed).toBe(0.25);
  });

  it('SPD-03 프리셋과 리셋 버튼', async () => {
    const env = installFakeChrome();
    openPopup();
    await waitForController();
    for (const [pct, speed] of [[60, 0.6], [70, 0.7], [80, 0.8], [90, 0.9], [110, 1.1], [120, 1.2]]) {
      await click(`Set speed to ${pct}%`);
      expect(env.content.state.speed).toBe(speed);
    }
    await click('Reset to normal speed');
    expect(env.content.state.speed).toBe(1);
  });

  it('SPD-04 속도 표시 형식', async () => {
    installFakeChrome();
    openPopup();
    await waitForController();
    expect(screen.getByText('1.0x')).toBeInTheDocument();
    await click('Set speed to 80%');
    expect(screen.getByText('0.8x')).toBeInTheDocument();
  });

  it('SPD-05 속도 기능 OFF면 1.0x, 다시 ON이면 이전 속도로 복원', async () => {
    const env = installFakeChrome({ content: new FakeContent({ speed: 1.5 }) });
    openPopup();
    await screen.findByText('1.5x');
    await click('Disable Speed Control');
    await waitFor(() => expect(env.content.state.speed).toBe(1));
    await click('Enable Speed Control');
    await waitFor(() => expect(env.content.state.speed).toBe(1.5));
  });

  it('SPD-06 팝업을 다시 열어도 영상 속도(1.5x)가 유지되고 그대로 표시된다', async () => {
    const env = installFakeChrome({ content: new FakeContent({ speed: 1.5 }) });
    const first = openPopup();
    await screen.findByText('1.5x');
    first.unmount();

    openPopup();
    await screen.findByText('1.5x');
    await waitForPitchReady(env);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(env.content.state.speed).toBe(1.5);
    env.sentActions('setPlaybackRate').forEach((m) => expect(m.speed).toBe(1.5));
  });
});

describe('피치 (PIT)', () => {
  it('PIT-01 ±1, ±2 반음 버튼', async () => {
    const env = installFakeChrome();
    openPopup();
    await waitForController();
    await waitForPitchReady(env);
    const pitches = () => env.sentActions('setPitch').map((m) => m.pitch);

    await click('Up 1 semitone');
    expect(lastOf(pitches())).toBe(1);
    await click('Up 2 semitones');
    expect(lastOf(pitches())).toBe(3);
    await click('Down 1 semitone');
    expect(lastOf(pitches())).toBe(2);
    await click('Down 2 semitones');
    expect(lastOf(pitches())).toBe(0);
  });

  it('PIT-02 톤 프리셋과 리셋', async () => {
    const env = installFakeChrome();
    openPopup();
    await waitForController();
    await waitForPitchReady(env);
    for (const [title, pitch] of [['Down 2 tones', -4], ['Down 1 tone', -2], ['Up 1 tone', 2], ['Up 2 tones', 4]]) {
      await click(title);
      expect(env.content.state.pitch).toBe(pitch);
    }
    await click('Reset to original pitch');
    expect(env.content.state.pitch).toBe(0);
  });

  it('PIT-03 피치는 -24 ~ +24 반음을 벗어나지 않는다', async () => {
    const env = installFakeChrome();
    openPopup();
    await waitForController();
    await waitForPitchReady(env);
    for (let i = 0; i < 20; i++) await click('Up 2 semitones');
    expect(env.content.state.pitch).toBe(24);
    for (let i = 0; i < 40; i++) await click('Down 2 semitones');
    expect(env.content.state.pitch).toBe(-24);
  });

  it('PIT-04 피치 표시 형식', async () => {
    const env = installFakeChrome();
    openPopup();
    await waitForController();
    await waitForPitchReady(env);
    expect(screen.getByText('Original')).toBeInTheDocument();
    await click('Up 1 semitone');
    expect(screen.getByText('+1 semitone')).toBeInTheDocument();
    await click('Up 1 semitone');
    expect(screen.getByText('+1 tone')).toBeInTheDocument();
    await click('Up 1 semitone');
    expect(screen.getByText('+1t 1st')).toBeInTheDocument();
    await click('Down 2 tones');
    expect(screen.getByText('-2 tones')).toBeInTheDocument();
  });

  it('PIT-05 팝업을 다시 열어도 피치를 리셋하지 않고 같은 부호로 표시한다', async () => {
    const env = installFakeChrome({ content: new FakeContent({ pitch: 3 }) });
    openPopup();
    await screen.findByText('+1t 1st');
    await waitForPitchReady(env);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(env.content.state.pitch).toBe(3);
    env.sentActions('setPitch').forEach((m) => expect(m.pitch).toBe(3));
  });
});

describe('구간 반복 — 팝업 (LOOP)', () => {
  it('LOOP-01 끝점의 초기값은 영상 길이다', async () => {
    installFakeChrome();
    openPopup();
    await waitForController();
    expect(await screen.findByTitle('End: 3:20')).toBeInTheDocument();
  });

  it('LOOP-02 시작 입력 "1:30" → 90초로 설정하고 그 위치로 이동', async () => {
    const env = installFakeChrome();
    openPopup();
    await screen.findByTitle('End: 3:20');
    typeAndEnter('Set start time (MM:SS or SS)', '1:30');
    expect(screen.getByTitle('Start: 1:30')).toBeInTheDocument();
    await waitFor(() => expect(env.content.state.currentTime).toBe(90));
  });

  it('LOOP-03 초 단위 입력은 받고, 잘못된 형식은 무시한다', async () => {
    const env = installFakeChrome();
    openPopup();
    await screen.findByTitle('End: 3:20');
    typeAndEnter('Set start time (MM:SS or SS)', '45');
    expect(screen.getByTitle('Start: 0:45')).toBeInTheDocument();
    const seeksBefore = env.sentActions('seekTo').length;
    typeAndEnter('Set start time (MM:SS or SS)', 'abc');
    expect(screen.getByTitle('Start: 0:45')).toBeInTheDocument();
    expect(env.sentActions('seekTo').length).toBe(seeksBefore);
  });

  it('LOOP-04 끝점은 영상 끝에서 1초 전까지로 제한된다', async () => {
    installFakeChrome();
    openPopup();
    await screen.findByTitle('End: 3:20');
    typeAndEnter('Set end time (MM:SS or SS)', '9:99');
    expect(screen.getByTitle('End: 3:19')).toBeInTheDocument();
  });

  it('LOOP-05 반복 시작/정지 버튼', async () => {
    const env = installFakeChrome();
    openPopup();
    await screen.findByTitle('End: 3:20');
    typeAndEnter('Set start time (MM:SS or SS)', '30');
    typeAndEnter('Set end time (MM:SS or SS)', '60');
    await click('Start Loop');
    await waitFor(() => expect(env.content.state.loop).toEqual({ start: 30, end: 60, enabled: true }));
    await click('Stop Loop');
    await waitFor(() => expect(env.content.state.loop.enabled).toBe(false));
  });

  it('LOOP-06 시작점으로 이동 버튼', async () => {
    const env = installFakeChrome();
    openPopup();
    await screen.findByTitle('End: 3:20');
    typeAndEnter('Set start time (MM:SS or SS)', '30');
    env.content.state.currentTime = 100;
    await click('Jump to start point');
    await waitFor(() => expect(env.content.state.currentTime).toBe(30));
  });

  it('LOOP-07 반복 중 반복 기능을 끄면 반복이 멈춘다', async () => {
    const env = installFakeChrome();
    openPopup();
    await screen.findByTitle('End: 3:20');
    typeAndEnter('Set start time (MM:SS or SS)', '30');
    typeAndEnter('Set end time (MM:SS or SS)', '60');
    await click('Start Loop');
    await waitFor(() => expect(env.content.state.loop.enabled).toBe(true));
    await click('Disable Loop Control');
    await waitFor(() => expect(env.content.state.loop.enabled).toBe(false));
  });
});

describe('전역 스위치 / 리셋 (GLB, RST)', () => {
  it('GLB-01 전역 OFF는 속도·반복·피치를 해제하고 상태를 저장한다', async () => {
    const env = installFakeChrome({ content: new FakeContent({ speed: 1.5, loop: { start: 30, end: 60, enabled: true } }) });
    openPopup();
    await screen.findByText('1.5x');
    await click('Extension Enabled (Click to Disable All)');
    await waitFor(() => expect(env.sentActions('disablePitch').length).toBe(1));
    expect(env.content.state.speed).toBe(1);
    expect(env.content.state.loop.enabled).toBe(false);
    expect(env.store.isGlobalEnabled).toBe(false);
  });

  it('GLB-02 전역 ON은 이전 속도를 복원한다', async () => {
    const env = installFakeChrome({ content: new FakeContent({ speed: 1.5 }) });
    openPopup();
    await screen.findByText('1.5x');
    await click('Extension Enabled (Click to Disable All)');
    await waitFor(() => expect(env.content.state.speed).toBe(1));
    await click('Extension Disabled (Click to Enable)');
    await waitFor(() => expect(env.content.state.speed).toBe(1.5));
    expect(env.store.isGlobalEnabled).toBe(true);
  });

  it('GLB-03 저장된 OFF 상태로 팝업이 열린다', async () => {
    installFakeChrome({ storage: { isGlobalEnabled: false } });
    openPopup();
    expect(await screen.findByTitle('Extension Disabled (Click to Enable)')).toBeInTheDocument();
  });

  it('GLB-04 전역 OFF면 속도 버튼이 아무 메시지도 보내지 않는다', async () => {
    const env = installFakeChrome({ storage: { isGlobalEnabled: false } });
    openPopup();
    await screen.findByTitle('Extension Disabled (Click to Enable)');
    const before = env.sentActions('setPlaybackRate').length;
    await click('Up 0.1x');
    expect(env.sentActions('setPlaybackRate').length).toBe(before);
  });

  it('RST-01 전체 리셋은 속도 1.0x, 반복 OFF, 피치 0으로 되돌린다', async () => {
    const env = installFakeChrome({
      content: new FakeContent({ speed: 1.5, pitch: 2, loop: { start: 30, end: 60, enabled: true } }),
    });
    openPopup();
    await screen.findByText('1.5x');
    await click('Reset all controls to original');
    await waitFor(() => expect(env.content.state.pitch).toBe(0));
    expect(env.content.state.speed).toBe(1);
    expect(env.content.state.loop).toEqual({ start: 0, end: 200, enabled: false });
    expect(screen.getByText('1.0x')).toBeInTheDocument();
  });
});

describe('기본 재생 컨트롤 (BAS)', () => {
  it('BAS-01 재생/일시정지 버튼', async () => {
    const env = installFakeChrome();
    openPopup();
    await waitForController();
    fireEvent.click(await screen.findByTitle('Pause'));
    await waitFor(() => expect(env.content.state.isPlaying).toBe(false));
  });

  it('BAS-02 영상 제목을 보여준다', async () => {
    installFakeChrome();
    openPopup();
    expect(await screen.findByTitle('Test Song')).toBeInTheDocument();
  });
});

describe('피치 엔진 초기화 — 팝업 (PIT)', () => {
  it('PIT-12 피치 기능을 껐다 켜면 화면에 보이는 피치로 다시 적용된다', async () => {
    const env = installFakeChrome({ content: new FakeContent({ pitch: 3 }) });
    openPopup();
    await screen.findByText('+1t 1st');
    await waitForPitchReady(env);
    await click('Disable Pitch Control');
    expect(env.content.state.pitch).toBe(0);
    await click('Enable Pitch Control');
    await waitFor(() => expect(env.content.state.pitch).toBe(3));
  });

  it('PIT-13 초기화가 몇 번 실패해도 다시 시도해서 준비된다', async () => {
    const env = installFakeChrome({ content: new FakeContent({ initFailures: 2 }) });
    openPopup();
    await waitForController();
    expect(screen.getByText('Initializing pitch engine...')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Initializing pitch engine...')).not.toBeInTheDocument(), { timeout: 4000 });
    expect(env.content.initCalls).toBe(3);
  });

  it('PIT-14 새로고침이 필요하면 안내와 새로고침 버튼을 보여준다', async () => {
    const env = installFakeChrome({ content: new FakeContent({ initReason: 'needsReload' }) });
    openPopup();
    expect(await screen.findByText('피치를 쓰려면 유튜브 탭을 새로고침해 주세요')).toBeInTheDocument();
    fireEvent.click(screen.getByText('새로고침'));
    await waitFor(() => expect(env.chrome.tabs.reload).toHaveBeenCalledWith(1));
  });
});

describe('설정 독립성 — 팝업 (IND)', () => {
  const setup = async () => {
    const env = installFakeChrome({
      content: new FakeContent({ speed: 1.5, pitch: 3, loop: { start: 30, end: 60, enabled: true } }),
    });
    openPopup();
    await screen.findByText('1.5x');
    await waitForPitchReady(env);
    return env;
  };

  it('IND-P1 속도 버튼을 눌러도 피치와 반복은 그대로다', async () => {
    const env = await setup();
    await click('Set speed to 80%');
    await click('Up 0.1x');
    expect(env.content.state).toMatchObject({ speed: 0.9, pitch: 3, loop: { start: 30, end: 60, enabled: true } });
  });

  it('IND-P2 피치 버튼을 눌러도 속도와 반복은 그대로다', async () => {
    const env = await setup();
    await click('Up 2 semitones');
    await click('Down 2 tones');
    expect(env.content.state).toMatchObject({ speed: 1.5, pitch: -4, loop: { start: 30, end: 60, enabled: true } });
  });

  it('IND-P3 반복 구간을 바꾸고 껐다 켜도 속도와 피치는 그대로다', async () => {
    const env = await setup();
    typeAndEnter('Set start time (MM:SS or SS)', '40');
    typeAndEnter('Set end time (MM:SS or SS)', '80');
    await click('Stop Loop');
    await click('Start Loop');
    await waitFor(() => expect(env.content.state.loop).toEqual({ start: 40, end: 80, enabled: true }));
    expect(env.content.state).toMatchObject({ speed: 1.5, pitch: 3 });
  });

  it('IND-P4 화면 표시도 세 값을 각각 그대로 보여준다', async () => {
    await setup();
    await click('Up 1 semitone');
    expect(screen.getByText('1.5x')).toBeInTheDocument();
    expect(screen.getByText('+2 tones')).toBeInTheDocument();
    expect(screen.getByTitle('Start: 0:30')).toBeInTheDocument();
    expect(screen.getByTitle('End: 1:00')).toBeInTheDocument();
  });
});

describe('구간 반복 A/B 지금 위치로 (LOOP)', () => {
  it('LOOP-08 A의 Now는 현재 재생 위치를 시작점으로 지정한다 (반복은 켜지 않음)', async () => {
    const env = installFakeChrome({ content: new FakeContent({ currentTime: 42 }) });
    openPopup();
    await screen.findByTitle('End: 3:20');
    await click('Set start (A) to current position');
    expect(screen.getByTitle('Start: 0:42')).toBeInTheDocument();
    expect(env.content.state.loop.enabled).toBe(false);
  });

  it('LOOP-09 B의 Now는 현재 위치를 끝점으로 지정하고 반복을 시작한다', async () => {
    const env = installFakeChrome({ content: new FakeContent({ currentTime: 10 }) });
    openPopup();
    await screen.findByTitle('End: 3:20');
    await click('Set start (A) to current position');
    env.content.state.currentTime = 42;
    await click('Set end (B) to current position and start loop');
    await waitFor(() => expect(env.content.state.loop).toEqual({ start: 10, end: 42, enabled: true }));
    expect(screen.getByTitle('Stop Loop')).toBeInTheDocument();
  });

  it('LOOP-10 A를 기존 B보다 뒤로 지정하면 B는 영상 끝(1초 전)으로 옮긴다', async () => {
    const env = installFakeChrome({ content: new FakeContent({ loop: { start: 30, end: 60, enabled: true }, currentTime: 100 }) });
    openPopup();
    await screen.findByTitle('End: 1:00');
    await click('Set start (A) to current position');
    await waitFor(() => expect(env.content.state.loop).toEqual({ start: 100, end: 199, enabled: true }));
  });

  it('LOOP-11 B를 A보다 앞으로 지정하면 A는 처음으로 옮긴다', async () => {
    const env = installFakeChrome({ content: new FakeContent({ loop: { start: 30, end: 60, enabled: true }, currentTime: 20 }) });
    openPopup();
    await screen.findByTitle('End: 1:00');
    await click('Set end (B) to current position and start loop');
    await waitFor(() => expect(env.content.state.loop).toEqual({ start: 0, end: 20, enabled: true }));
  });
});

describe('키보드 단축키 — 팝업 (KEY)', () => {
  it('KEY-P1 단축키 버튼은 크롬 단축키 설정 페이지를 연다', async () => {
    const env = installFakeChrome();
    openPopup();
    await waitForController();
    await click('Keyboard shortcuts');
    expect(env.chrome.tabs.create).toHaveBeenCalledWith({ url: 'chrome://extensions/shortcuts' });
  });

  it('KEY-P2 팝업이 열린 채 단축키로 바뀐 값을 화면에 반영한다', async () => {
    const env = installFakeChrome({ content: new FakeContent({ speed: 1.5 }) });
    openPopup();
    await screen.findByText('1.5x');
    env.content.state.speed = 1.6;
    env.content.state.loop = { start: 30, end: 60, enabled: true };
    await act(async () => { env.emitRuntimeMessage({ type: 'videoStateChanged' }); });
    expect(await screen.findByText('1.6x')).toBeInTheDocument();
    expect(screen.getByTitle('Stop Loop')).toBeInTheDocument();
  });
});

describe('구간 반복 드래그 (LOOP)', () => {
  it('LOOP-12 손잡이를 끄는 동안에는 영상을 이동시키지 않고, 놓을 때 한 번만 이동한다', async () => {
    const env = installFakeChrome();
    openPopup();
    await screen.findByTitle('End: 3:20');
    const track = document.querySelector('.loop-controls .unified-slider-track');
    track.getBoundingClientRect = () => ({ left: 0, width: 200, top: 0, height: 10, right: 200, bottom: 10 });
    const seeksBefore = env.sentActions('seekTo').length;

    fireEvent.mouseDown(screen.getByTitle('Start: 0:00'));
    for (const x of [10, 20, 30, 40, 50]) fireEvent.mouseMove(document, { clientX: x });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(env.sentActions('seekTo').length).toBe(seeksBefore);

    fireEvent.mouseUp(document);
    await waitFor(() => expect(env.sentActions('seekTo').length).toBe(seeksBefore + 1));
    expect(env.content.state.currentTime).toBe(50); // 200px 중 50px = 영상 200초의 25%
    expect(screen.getByTitle('Start: 0:50')).toBeInTheDocument();
  });
});
