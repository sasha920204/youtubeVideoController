/*
  Pitch shifter worklet using simple resampling
  - Parameter 'semitones' controls pitch in [-24, 24]
*/

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
    this.lastSemitones = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    
    if (!input || !output) {
      return true;
    }

    const channelCount = Math.min(input.length || 0, output.length || 0);
    const frames = output[0]?.length || 128;
    const semitonesValues = parameters.semitones;
    const semitones = semitonesValues.length > 0 ? semitonesValues[0] : 0;

    // Log pitch changes
    if (semitones !== this.lastSemitones) {
      this.lastSemitones = semitones;
    }

    // Process each channel
    for (let ch = 0; ch < channelCount; ch++) {
      const inCh = input[ch];
      const outCh = output[ch];
      
      if (!inCh || !outCh) {
        if (outCh) {
          for (let i = 0; i < frames; i++) {
            outCh[i] = 0;
          }
        }
        continue;
      }

      if (semitones === 0) {
        // Pass-through for original pitch
        for (let i = 0; i < frames; i++) {
          outCh[i] = inCh[i] || 0;
        }
      } else {
        // Simple pitch shifting using resampling
        // UI sends inverted values, so we need to invert them back
        const actualSemitones = -semitones;
        const pitchRatio = Math.pow(2, actualSemitones / 12);
        
        for (let i = 0; i < frames; i++) {
          const sourceIndex = i * pitchRatio;
          const sourceIndexFloor = Math.floor(sourceIndex);
          const fraction = sourceIndex - sourceIndexFloor;
          
          if (sourceIndexFloor < inCh.length - 1) {
            // Linear interpolation
            outCh[i] = inCh[sourceIndexFloor] * (1 - fraction) + 
                      inCh[sourceIndexFloor + 1] * fraction;
          } else if (sourceIndexFloor < inCh.length) {
            outCh[i] = inCh[sourceIndexFloor];
          } else {
            outCh[i] = 0;
          }
        }
      }
    }

    return true;
  }
}

registerProcessor('pitch-shifter-processor', PitchShifterProcessor);


