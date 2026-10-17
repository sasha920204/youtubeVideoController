// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SAMPLE_RATE = 48000;
const BLOCK = 128;
let Processor;

beforeAll(() => {
  // AudioWorkletGlobalScope 흉내: sampleRate, AudioWorkletProcessor, registerProcessor
  const source = fs.readFileSync(path.resolve(__dirname, '../src/pitch-shifter.worklet.js'), 'utf8');
  const scope = {
    sampleRate: SAMPLE_RATE,
    AudioWorkletProcessor: class {},
    registerProcessor: (_name, cls) => { Processor = cls; },
  };
  new Function('sampleRate', 'AudioWorkletProcessor', 'registerProcessor', source)(
    scope.sampleRate, scope.AudioWorkletProcessor, scope.registerProcessor,
  );
});

const sine = (freq, n) => Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE));

// 입력 채널 배열을 128샘플 블록 단위로 워클릿에 흘려보낸다
function runProcessor(channels, semitones) {
  const proc = new Processor();
  const n = channels[0].length;
  const outs = channels.map(() => new Float32Array(n));
  for (let off = 0; off < n; off += BLOCK) {
    const input = channels.map((ch) => ch.slice(off, off + BLOCK));
    const output = channels.map(() => new Float32Array(BLOCK));
    proc.process([input], [output], { semitones: new Float32Array([semitones]) });
    output.forEach((o, c) => outs[c].set(o, off));
  }
  return outs;
}

// 100~2000Hz 구간에서 가장 센 주파수 (1Hz 간격 DFT)
function dominantFrequency(signal) {
  let best = 0;
  let bestFreq = 0;
  for (let f = 100; f <= 2000; f++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < signal.length; i += 2) {
      const w = (2 * Math.PI * f * i) / SAMPLE_RATE;
      re += signal[i] * Math.cos(w);
      im += signal[i] * Math.sin(w);
    }
    const mag = re * re + im * im;
    if (mag > best) { best = mag; bestFreq = f; }
  }
  return bestFreq;
}

const rms = (s) => Math.sqrt(s.reduce((a, v) => a + v * v, 0) / s.length);

describe('피치 워클릿 신호 처리 (WK)', () => {
  it('WK-01 피치 0이면 입력을 그대로 내보낸다', () => {
    const input = sine(440, BLOCK * 50);
    const [out] = runProcessor([input], 0);
    expect(Array.from(out)).toEqual(Array.from(input));
  });

  it.each([3, 7, 12, -3, -7, -12])('WK-02 %i 반음이면 440Hz가 440·2^(n/12)Hz로 바뀐다', (semi) => {
    const [out] = runProcessor([sine(440, SAMPLE_RATE)], semi);
    const expected = 440 * 2 ** (semi / 12);
    expect(Math.abs(dominantFrequency(out.subarray(SAMPLE_RATE / 2)) - expected)).toBeLessThanOrEqual(1);
  });

  it('WK-03 피치를 올려도 끊김(무음 구간) 없이 음량이 유지된다', () => {
    const [out] = runProcessor([sine(440, SAMPLE_RATE)], 12);
    const tail = out.subarray(SAMPLE_RATE / 4);
    // 1ms(48샘플) 창마다 RMS가 원래(0.707)의 절반 아래로 떨어지면 끊긴 것으로 본다
    for (let i = 0; i + 48 <= tail.length; i += 48) {
      expect(rms(tail.subarray(i, i + 48))).toBeGreaterThan(0.35);
    }
    expect(rms(tail)).toBeGreaterThan(0.6);
  });

  it('WK-04 블록 경계에서 파형이 튀지 않는다', () => {
    const [out] = runProcessor([sine(440, SAMPLE_RATE)], 5);
    const ratio = 2 ** (5 / 12);
    // 최대 기울기: 사인파 진폭 1 기준 2π·f/fs, 크로스페이드 여유를 넉넉히 2배
    const maxStep = 2 * ((2 * Math.PI * 440 * ratio) / SAMPLE_RATE);
    let worst = 0;
    for (let i = BLOCK; i < out.length; i += BLOCK) {
      worst = Math.max(worst, Math.abs(out[i] - out[i - 1]));
    }
    expect(worst).toBeLessThan(maxStep);
  });

  it('WK-05 스테레오 두 채널을 같은 위상으로 처리한다', () => {
    const input = sine(440, BLOCK * 200);
    const [left, right] = runProcessor([input, input.slice()], 4);
    expect(Array.from(right)).toEqual(Array.from(left));
  });
});
