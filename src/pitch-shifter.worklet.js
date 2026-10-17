/*
  Pitch shifter worklet (delay-line / two-tap crossfade)
  - Parameter 'semitones' controls pitch in [-24, 24] (+ = higher)

  예전 구현은 128샘플 블록 하나 안에서만 리샘플링해서
  피치를 올리면 블록 뒤쪽이 0으로 채워지고(지직거림), 내리면 블록 경계가 끊겼다.
  여기서는 블록 사이에 유지되는 링버퍼에 입력을 계속 쓰고,
  지연 시간이 톱니파처럼 변하는 읽기 헤드 두 개를 반 주기 어긋나게 두어
  Hann 창으로 크로스페이드한다. 지연이 (1 - ratio) 속도로 변하므로 출력 피치는 ratio 배가 된다.
*/

const WINDOW_SECONDS = 0.05; // 읽기 창 길이 (길수록 부드럽지만 지연이 늘어남)

class PitchShifterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'semitones',
        defaultValue: 0,
        minValue: -24,
        maxValue: 24,
        automationRate: 'k-rate',
      },
    ];
  }

  constructor() {
    super();
    this.windowSize = Math.round(sampleRate * WINDOW_SECONDS);
    // 창 길이 + 보간 여유보다 큰 2의 거듭제곱 크기
    let size = 1;
    while (size < this.windowSize * 2 + 4) size <<= 1;
    this.bufferSize = size;
    this.bufferMask = size - 1;
    this.buffers = [];
    this.writeIndex = 0;
    this.phase = 0; // 0~1, 첫 번째 읽기 헤드의 지연 = phase * windowSize
  }

  readInterpolated(buffer, delay) {
    const pos = this.writeIndex - delay;
    const floor = Math.floor(pos);
    const frac = pos - floor;
    const a = buffer[floor & this.bufferMask];
    const b = buffer[(floor + 1) & this.bufferMask];
    return a + (b - a) * frac;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!output || output.length === 0) {
      return true;
    }

    const channelCount = output.length;
    const frames = output[0].length;
    const semitones = parameters.semitones.length > 0 ? parameters.semitones[0] : 0;

    while (this.buffers.length < channelCount) {
      this.buffers.push(new Float32Array(this.bufferSize));
    }

    const ratio = Math.pow(2, semitones / 12);
    const phaseStep = (1 - ratio) / this.windowSize;
    const bypass = semitones === 0;
    const startWrite = this.writeIndex;
    const startPhase = this.phase;

    for (let ch = 0; ch < channelCount; ch++) {
      const inCh = input && input[ch] ? input[ch] : (input && input[0]) || null;
      const outCh = output[ch];
      const buffer = this.buffers[ch];

      // 모든 채널이 같은 위치·위상에서 시작하도록 매 채널마다 되돌린다
      this.writeIndex = startWrite;
      let phase = startPhase;

      for (let i = 0; i < frames; i++) {
        const sample = inCh ? inCh[i] : 0;
        buffer[this.writeIndex & this.bufferMask] = sample;

        if (bypass) {
          outCh[i] = sample;
        } else {
          const phaseB = phase + 0.5 >= 1 ? phase - 0.5 : phase + 0.5;
          const gainA = Math.sin(Math.PI * phase) ** 2;
          const gainB = 1 - gainA; // sin²(π(p+½)) = cos²(πp)
          outCh[i] =
            this.readInterpolated(buffer, phase * this.windowSize) * gainA +
            this.readInterpolated(buffer, phaseB * this.windowSize) * gainB;

          phase += phaseStep;
          if (phase >= 1) phase -= 1;
          else if (phase < 0) phase += 1;
        }

        this.writeIndex++;
      }

      if (ch === channelCount - 1) {
        // 원래 피치로 돌아오면 위상을 초기화해서 다음 변경이 지연 0에서 시작하게 한다
        this.phase = bypass ? 0 : phase;
      }
    }

    // 정수 오버플로 방지
    this.writeIndex &= this.bufferMask;
    return true;
  }
}

registerProcessor('pitch-shifter-processor', PitchShifterProcessor);
