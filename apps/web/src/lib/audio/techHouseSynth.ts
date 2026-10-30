/**
 * Client-side Web Audio API Tech House Loop Synthesizer.
 * Generates an in-memory 2-bar 126 BPM loop:
 * - 4/4 Punchy Tech House Kick Drum
 * - Offbeat Open Hi-Hat
 * - Rolling 16th Synth Bassline (F minor)
 * - Percussive Claps / Shaker
 */
export function generateTechHouseBuffer(ctx: AudioContext): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const bpm = 126;
  const beatDuration = 60 / bpm; // ~0.47619 s
  const totalBeats = 8; // 2 bars
  const totalDuration = beatDuration * totalBeats; // ~3.8095 s
  const totalSamples = Math.floor(sampleRate * totalDuration);

  const buffer = ctx.createBuffer(2, totalSamples, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  // 1. Synthesize 4/4 Kick Drum on every beat (0, 1, 2, 3, 4, 5, 6, 7)
  for (let beat = 0; beat < totalBeats; beat++) {
    const startSample = Math.floor(beat * beatDuration * sampleRate);
    const kickSamples = Math.min(Math.floor(0.38 * sampleRate), totalSamples - startSample);

    for (let i = 0; i < kickSamples; i++) {
      const t = i / sampleRate;
      // Pitch drop: 150 Hz to 45 Hz exponentially
      const freq = 45 + 105 * Math.exp(-t * 28);
      const phase = 2 * Math.PI * freq * t;
      // Amplitude envelope
      const amp = Math.exp(-t * 9.5) * 0.85;
      const kickVal = Math.sin(phase) * amp;

      left[startSample + i] += kickVal;
      right[startSample + i] += kickVal;
    }
  }

  // 2. Synthesize Offbeat Hi-Hats on every "and" (0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5)
  for (let beat = 0; beat < totalBeats; beat++) {
    const startSample = Math.floor((beat + 0.5) * beatDuration * sampleRate);
    const hatSamples = Math.min(Math.floor(0.18 * sampleRate), totalSamples - startSample);

    // Highpass noise simulation
    let prevNoise = 0;
    for (let i = 0; i < hatSamples; i++) {
      const t = i / sampleRate;
      const white = Math.random() * 2 - 1;
      // High-pass filter noise
      const hp = white - prevNoise;
      prevNoise = white;
      const amp = Math.exp(-t * 22) * 0.22;

      // Slight stereo spread
      left[startSample + i] += hp * amp * 0.9;
      right[startSample + i] += hp * amp * 1.1;
    }
  }

  // 3. Synthesize Claps on 2 and 4 (beats 1, 3, 5, 7 in 0-indexed)
  const clapBeats = [1, 3, 5, 7];
  for (const beat of clapBeats) {
    const startSample = Math.floor(beat * beatDuration * sampleRate);
    const clapSamples = Math.min(Math.floor(0.22 * sampleRate), totalSamples - startSample);

    for (let i = 0; i < clapSamples; i++) {
      const t = i / sampleRate;
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 16);
      left[startSample + i] += noise * 0.3;
      right[startSample + i] += noise * 0.3;
    }
  }

  // 4. Synthesize Rolling Tech House Bassline (16th notes around root note F1 / 43.65 Hz)
  const sixteenth = beatDuration / 4;
  const baseFreq = 43.65; // F1
  for (let s = 0; s < totalBeats * 4; s++) {
    const stepInBeat = s % 4;
    // Classic offbeat 16th rhythm (skip downbeat where kick is dominant)
    if (stepInBeat === 0) continue;

    const startSample = Math.floor(s * sixteenth * sampleRate);
    const noteDuration = sixteenth * 0.85;
    const noteSamples = Math.min(Math.floor(noteDuration * sampleRate), totalSamples - startSample);

    // Melodic variation: step pattern (F1, G#1, F1, Bb1)
    const pitchMul = s % 8 === 6 ? 1.334 : s % 4 === 2 ? 1.189 : 1.0;
    const noteFreq = baseFreq * pitchMul;

    for (let i = 0; i < noteSamples; i++) {
      const t = i / sampleRate;
      // Rich saw wave with harmonics
      const saw = 2 * ((t * noteFreq) % 1) - 1;
      const sub = Math.sin(2 * Math.PI * noteFreq * t);
      const amp = Math.exp(-t * 12) * 0.45;
      const val = (saw * 0.4 + sub * 0.6) * amp;

      left[startSample + i] += val;
      right[startSample + i] += val;
    }
  }

  // Soft master normalize to avoid harsh clipping in the raw buffer
  let maxPeak = 0;
  for (let i = 0; i < totalSamples; i++) {
    maxPeak = Math.max(maxPeak, Math.abs(left[i]), Math.abs(right[i]));
  }
  if (maxPeak > 0.95) {
    const norm = 0.92 / maxPeak;
    for (let i = 0; i < totalSamples; i++) {
      left[i] *= norm;
      right[i] *= norm;
    }
  }

  return buffer;
}
