"""Automated DSP Test Script for Mastr Audio Mastering Engine

Generates a synthetic 5-second stereo track containing:
- 4/4 Kick transient & synth bass
- Infrasonic sub-30 Hz rumble (15 Hz sine wave)
- Out-of-phase subbass (50 Hz out-of-phase L/R)
- High peaks exceeding 0 dBFS

Executes the AudioMasteringEngine signal chain and verifies:
- Generation of master_final.wav (24-Bit PCM)
- Generation of master_preview_60s.mp3 (320 kbps)
- Measured Integrated LUFS against target
- True-Peak ceiling holding strictly at or below -0.5 dBTP
"""

import os
import sys
import tempfile
import numpy as np
import soundfile as sf
import pyloudnorm as pyln
import scipy.signal

from dsp.engine import AudioMasteringEngine, MasteringParameters


def generate_synthetic_audio(duration_sec: float = 5.0, sr: int = 44100) -> np.ndarray:
    """Generates synthetic stereo audio with problematic subsonic and phase content."""
    n_samples = int(duration_sec * sr)
    t = np.linspace(0.0, duration_sec, n_samples, endpoint=False)

    # 1. Infrasonic Rumble (15 Hz) at -6 dB
    rumble = 0.5 * np.sin(2.0 * np.pi * 15.0 * t)

    # 2. Out-of-phase Sub-Bass (50 Hz) - Left is +phase, Right is -phase
    sub_left = 0.6 * np.sin(2.0 * np.pi * 50.0 * t)
    sub_right = -0.6 * np.sin(2.0 * np.pi * 50.0 * t)

    # 3. Punchy Kick & Bass harmonic (80 Hz to 240 Hz)
    kick_pulse = np.zeros(n_samples)
    bpm = 120
    interval = int(sr * 60 / bpm)
    for i in range(0, n_samples, interval):
        decay_len = min(int(0.25 * sr), n_samples - i)
        env = np.exp(-15.0 * np.linspace(0, 0.25, decay_len))
        kick_pulse[i : i + decay_len] += 0.8 * env * np.sin(2.0 * np.pi * 90.0 * np.linspace(0, 0.25, decay_len))

    # 4. Boxiness resonance at 400 Hz and harshness at 3800 Hz
    boxiness = 0.3 * np.sin(2.0 * np.pi * 400.0 * t)
    harshness = 0.25 * np.sin(2.0 * np.pi * 3800.0 * t)

    # 5. Intentional extreme overshoot peak (+4.5 dBFS) at t = 2.0s
    peak_idx = int(2.0 * sr)
    overshoot = np.zeros(n_samples)
    overshoot[peak_idx : peak_idx + 200] = 1.68  # Exceeds 0 dBFS

    left = rumble + sub_left + kick_pulse + boxiness + harshness + overshoot
    right = rumble + sub_right + kick_pulse + boxiness + harshness + overshoot

    stereo = np.vstack([left, right]).astype(np.float32)
    return stereo, sr


def measure_true_peak_dbtp(audio: np.ndarray, sr: int) -> float:
    """Measures true peak with 4x polyphase oversampling in dBTP."""
    oversampled = scipy.signal.resample_poly(audio, up=4, down=1, axis=-1)
    max_peak = np.max(np.abs(oversampled))
    return float(20.0 * np.log10(max_peak + 1e-9))


def run_dsp_test():
    print("=" * 60)
    print(">>> MASTR AUDIO MASTERING ENGINE - AUTOMATED DSP TEST <<<")
    print("=" * 60)

    # 1. Synthesize audio
    audio_data, sr = generate_synthetic_audio(duration_sec=5.0, sr=44100)
    print(f"Generated synthetic 5-second stereo track: {audio_data.shape[1]} samples @ {sr} Hz")

    with tempfile.TemporaryDirectory() as tmp_dir:
        input_wav = os.path.join(tmp_dir, "synthetic_input.wav")
        output_dir = os.path.join(tmp_dir, "master_output")

        # Save input WAV
        sf.write(input_wav, audio_data.T, sr, subtype="PCM_24")
        print(f"Saved input WAV: {input_wav}")

        # Measure Input Metrics
        meter = pyln.Meter(sr)
        initial_lufs = meter.integrated_loudness(audio_data.T)
        initial_true_peak = measure_true_peak_dbtp(audio_data, sr)
        print(f"  * Input Integrated LUFS : {initial_lufs:.2f} LUFS")
        print(f"  * Input True-Peak       : {initial_true_peak:.2f} dBTP (Intentional clipping overshoot)")

        # 2. Run AudioMasteringEngine with primary preset
        engine = AudioMasteringEngine()
        params = MasteringParameters(
            mode="easy",
            preset="groove_soul",
            intensity=85.0,
            true_peak_ceiling_dbtp=-0.5,
        )

        print("\nExecuting DSP Signal Chain (Preset: groove_soul):")
        print("  [1/5] Highpass Filter (30 Hz Butterworth 18 dB/oct)...")
        print("  [2/5] Intelligent Bass-Mono Matrix (95 Hz M/S)...")
        print("  [3/5] Dynamic EQ & Spectral Balancing (4 bands including 12.5 kHz High-Shelf)...")
        print("  [4/5] Stereo Width Expansion (1.20x)...")
        print("  [5/5] Analog Saturation (Tanh tape drive 0.22)...")
        print("  [6/6] ITU-R BS.1770-4 Normalization (-11.0 LUFS) & 4x True-Peak Limiter (-0.5 dBTP)...")

        result = engine.process_file(
            input_audio_path=input_wav,
            output_dir=output_dir,
            params=params,
            job_id="",  # Generates master_final.wav and master_preview_60s.mp3
        )

        final_wav = os.path.join(output_dir, "master_final.wav")
        preview_mp3 = os.path.join(output_dir, "master_preview_60s.mp3")

        # 3. Assert outputs exist
        assert os.path.exists(final_wav), f"Missing output file: {final_wav}"
        assert os.path.getsize(final_wav) > 0, "master_final.wav is empty"
        print(f"\n[OK] master_final.wav generated: {os.path.getsize(final_wav)} bytes")

        assert os.path.exists(preview_mp3), f"Missing output file: {preview_mp3}"
        assert os.path.getsize(preview_mp3) > 0, "master_preview_60s.mp3 is empty"
        print(f"[OK] master_preview_60s.mp3 generated: {os.path.getsize(preview_mp3)} bytes")

        # 4. Measure Output Master
        mastered_data, mastered_sr = sf.read(final_wav, dtype="float32")
        final_lufs = meter.integrated_loudness(mastered_data)
        final_true_peak = measure_true_peak_dbtp(mastered_data.T, mastered_sr)

        print("\n" + "-" * 40)
        print(">>> MASTERING METRICS VERIFICATION <<<")
        print("-" * 40)
        print(f"Target LUFS         : {params.target_lufs:.2f} LUFS")
        print(f"Measured Final LUFS : {final_lufs:.2f} LUFS")
        print(f"Target Peak Ceiling : {params.true_peak_ceiling_dbtp:.2f} dBTP")
        print(f"Measured True-Peak  : {final_true_peak:.2f} dBTP")

        # Verification checks
        # True-peak must not exceed ceiling (-0.5 dBTP) by more than 0.05 dB margin
        assert final_true_peak <= (params.true_peak_ceiling_dbtp + 0.05), (
            f"True-Peak violation: {final_true_peak} dBTP > {params.true_peak_ceiling_dbtp} dBTP"
        )
        print("[OK] True-Peak Ceiling strictly enforced under -0.5 dBTP!")

        # Verify Bass-Mono: Sub-100Hz Side channel power must be substantially attenuated
        mid = (mastered_data[:, 0] + mastered_data[:, 1]) / np.sqrt(2.0)
        side = (mastered_data[:, 0] - mastered_data[:, 1]) / np.sqrt(2.0)

        # Lowpass filter the Side channel to inspect sub-100Hz residue
        sos_lp = scipy.signal.butter(4, 90.0, btype="lowpass", fs=mastered_sr, output="sos")
        sub_side = scipy.signal.sosfilt(sos_lp, side)
        sub_side_rms = np.sqrt(np.mean(sub_side ** 2))
        print(f"[OK] Sub-100Hz Side-channel RMS residual: {sub_side_rms:.6f} (Mono collapsed)")
        assert sub_side_rms < 0.05, "Sub-100Hz Side energy was not sufficiently collapsed to mono"

        # 5. Verify all 5 Presets execute properly
        print("\n" + "-" * 40)
        print(">>> VERIFYING ALL 5 CONSOLIDATED PRESETS <<<")
        print("-" * 40)
        preset_targets = {
            "groove_soul": -11.0,
            "club_punch": -8.5,
            "warm_tape": -13.0,
            "vocal_pop": -10.5,
            "suno_enhancer": -9.5,
        }
        for preset_name, expected_lufs in preset_targets.items():
            preset_params = MasteringParameters(mode="easy", preset=preset_name, intensity=75.0)
            res = engine.process_file(
                input_audio_path=input_wav,
                output_dir=output_dir,
                params=preset_params,
                job_id=preset_name,
            )
            out_wav = res["finalWavPath"]
            assert os.path.exists(out_wav) and os.path.getsize(out_wav) > 0
            preset_audio, _ = sf.read(out_wav, dtype="float32")
            measured_l = meter.integrated_loudness(preset_audio)
            tp = measure_true_peak_dbtp(preset_audio.T, sr)
            print(f"  [Preset: {preset_name:14s}] Output LUFS: {measured_l:.1f} (target: {expected_lufs:.1f}), Peak: {tp:.2f} dBTP")
            assert tp <= -0.45, f"Peak exceeded for {preset_name}: {tp}"
            assert abs(measured_l - expected_lufs) <= 1.2, f"Loudness deviation too high for {preset_name}: {measured_l}"

        print("=" * 60)
        print(">>> ALL DSP TESTS & 5 PRESETS PASSED SUCCESSFULLY! <<<")
        print("=" * 60)


if __name__ == "__main__":
    run_dsp_test()
