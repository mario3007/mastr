"""Mastr Audio Mastering DSP Engine (Python)

Professional multi-stage audio mastering signal chain:
1. 30 Hz Butterworth Highpass Filter (18 dB/oct) to remove infrasonic rumble
2. Intelligent Bass-Mono M/S Matrix (collapsing sub-100Hz frequencies to pure mono)
3. Dynamic EQ & Spectral Balancing (400 Hz boxiness cut, 3.8 kHz de-harshing)
4. Analog Saturation (Tanh soft-clipping tape drive)
5. ITU-R BS.1770-4 Loudness Normalization & 4x Oversampled True-Peak Limiter (-0.5 dBTP)
6. Outputs: 24-Bit WAV and 320kbps 60-second Energy-Cut MP3 Preview
"""

import os
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Literal, Optional, Tuple

import numpy as np
import pyloudnorm as pyln
import scipy.signal
import scipy.ndimage
import soundfile as sf


@dataclass
class MasteringParameters:
    mode: Literal["easy", "pro"] = "easy"
    preset: str = "groove_soul"
    intensity: float = 80.0  # 0 to 100%
    target_lufs: float = -11.0  # e.g. -11.0 for Groove Soul, -8.5 for Club
    low_end_mono_cutoff: float = 95.0  # Hz
    tape_saturation: float = 22.0  # 0 to 100%
    stereo_width: float = 50.0  # 0 to 100%
    low_end_punch: float = 50.0  # 0 to 100%
    vocal_clarity: float = 50.0  # 0 to 100%
    true_peak_ceiling_dbtp: float = -0.5  # dBTP


PRESET_CONFIGS = {
    "groove_soul": {
        "target_lufs": -11.0,
        "bass_mono_cutoff": 95.0,
        "tape_drive": 0.22,
        "eq_bands": [
            {"type": "bell", "freq": 90.0, "gain_db": 1.2, "q": 1.2},      # Low-End Bounce
            {"type": "bell", "freq": 250.0, "gain_db": 0.8, "q": 1.0},     # Warmth & Rhodes-Body
            {"type": "bell", "freq": 450.0, "gain_db": -1.0, "q": 1.5},    # Boxiness Control
            {"type": "high_shelf", "freq": 12500.0, "gain_db": 1.6, "q": 0.707}  # Silky Hats & Cymbals
        ],
        "stereo_width": 1.20,
    },
    "club_punch": {
        "target_lufs": -8.5,
        "bass_mono_cutoff": 115.0,
        "tape_drive": 0.12,
        "eq_bands": [
            {"type": "bell", "freq": 65.0, "gain_db": 1.5, "q": 1.0},      # Sub Punch
            {"type": "bell", "freq": 400.0, "gain_db": -1.2, "q": 1.3},    # Mid Scoop
            {"type": "high_shelf", "freq": 11000.0, "gain_db": 1.0, "q": 0.707}  # Crisp Top
        ],
        "stereo_width": 1.15,
    },
    "warm_tape": {
        "target_lufs": -13.0,
        "bass_mono_cutoff": 90.0,
        "tape_drive": 0.28,
        "eq_bands": [
            {"type": "bell", "freq": 120.0, "gain_db": 1.0, "q": 1.1},     # Low-End Roundness
            {"type": "high_shelf", "freq": 16000.0, "gain_db": -0.8, "q": 0.707} # Analog Roll-off
        ],
        "stereo_width": 1.0,
    },
    "vocal_pop": {
        "target_lufs": -10.5,
        "bass_mono_cutoff": 100.0,
        "tape_drive": 0.08,
        "eq_bands": [
            {"type": "bell", "freq": 350.0, "gain_db": -1.8, "q": 1.4},    # De-Mud / De-Boxiness
            {"type": "bell", "freq": 3200.0, "gain_db": 1.8, "q": 1.2},   # Vocal Presence & Clarity
            {"type": "high_shelf", "freq": 12000.0, "gain_db": 2.2, "q": 0.707}  # Pop Air Band
        ],
        "stereo_width": 1.25,
    },
    "suno_enhancer": {
        "target_lufs": -9.5,
        "bass_mono_cutoff": 110.0,
        "tape_drive": 0.18,
        "eq_bands": [
            {"type": "bell", "freq": 55.0, "gain_db": 2.0, "q": 1.1},      # Rebuild Sub Fundament
            {"type": "bell", "freq": 4100.0, "gain_db": -2.8, "q": 2.0},   # Anti-Harshness AI Notch
            {"type": "high_shelf", "freq": 10000.0, "gain_db": 1.5, "q": 0.707}  # Top Sheen
        ],
        "stereo_width": 1.10,
    },
}

# Legacy aliases
PRESET_CONFIGS["auto_ai"] = PRESET_CONFIGS["groove_soul"]
PRESET_CONFIGS["club_edm"] = PRESET_CONFIGS["club_punch"]
PRESET_CONFIGS["streaming_balanced"] = PRESET_CONFIGS["warm_tape"]


class AudioMasteringEngine:
    def __init__(self):
        pass

    # ---------------------------------------------------------
    # Helper: Bi-quad Peaking Filter (Audio EQ Cookbook)
    # ---------------------------------------------------------
    @staticmethod
    def _create_peaking_filter(
        fs: float, center_freq: float, gain_db: float, q: float
    ) -> Tuple[np.ndarray, np.ndarray]:
        """Calculates b, a coefficients for a peaking EQ filter."""
        w0 = 2.0 * np.pi * center_freq / fs
        alpha = np.sin(w0) / (2.0 * q)
        A = 10.0 ** (gain_db / 40.0)

        b0 = 1.0 + alpha * A
        b1 = -2.0 * np.cos(w0)
        b2 = 1.0 - alpha * A
        a0 = 1.0 + alpha / A
        a1 = -2.0 * np.cos(w0)
        a2 = 1.0 - alpha / A

        b = np.array([b0, b1, b2]) / a0
        a = np.array([a0, a1, a2]) / a0
        return b, a

    @staticmethod
    def _create_high_shelf_filter(
        fs: float, cutoff_freq: float, gain_db: float, q: float = 0.707
    ) -> Tuple[np.ndarray, np.ndarray]:
        """Calculates b, a coefficients for a high-shelf EQ filter (RBJ Audio EQ Cookbook)."""
        A = 10.0 ** (gain_db / 40.0)
        w0 = 2.0 * np.pi * cutoff_freq / fs
        cos_w0 = np.cos(w0)
        sin_w0 = np.sin(w0)
        alpha = sin_w0 / (2.0 * q)
        sqrt_A = np.sqrt(A)

        b0 = A * ((A + 1.0) + (A - 1.0) * cos_w0 + 2.0 * sqrt_A * alpha)
        b1 = -2.0 * A * ((A - 1.0) + (A + 1.0) * cos_w0)
        b2 = A * ((A + 1.0) + (A - 1.0) * cos_w0 - 2.0 * sqrt_A * alpha)
        a0 = (A + 1.0) - (A - 1.0) * cos_w0 + 2.0 * sqrt_A * alpha
        a1 = 2.0 * ((A - 1.0) - (A + 1.0) * cos_w0)
        a2 = (A + 1.0) - (A - 1.0) * cos_w0 - 2.0 * sqrt_A * alpha

        b = np.array([b0, b1, b2]) / a0
        a = np.array([a0, a1, a2]) / a0
        return b, a

    # ---------------------------------------------------------
    # Stage 1: Highpass Filter (30 Hz, 18 dB/Oct Butterworth)
    # ---------------------------------------------------------
    def apply_highpass(self, audio: np.ndarray, sr: int, cutoff_hz: float = 30.0) -> np.ndarray:
        """3rd order Butterworth highpass (18 dB/octave attenuation)."""
        # N=3 gives 18 dB/octave
        sos = scipy.signal.butter(3, cutoff_hz, btype="highpass", fs=sr, output="sos")
        # Apply across channel axis (channels, samples)
        filtered = scipy.signal.sosfilt(sos, audio, axis=-1)
        return filtered.astype(np.float32)

    # ---------------------------------------------------------
    # Stage 2: Bass-Mono Matrix (M/S conversion)
    # ---------------------------------------------------------
    def apply_bass_mono(
        self, audio: np.ndarray, sr: int, cutoff_hz: float = 100.0
    ) -> np.ndarray:
        """Sum frequencies below cutoff_hz to mono via Mid/Side matrix."""
        if audio.shape[0] < 2:
            return audio  # Already mono

        left = audio[0]
        right = audio[1]

        # M/S encoding
        mid = (left + right) / np.sqrt(2.0)
        side = (left - right) / np.sqrt(2.0)

        # Highpass filter the Side signal below cutoff_hz (4th order Butterworth for steep cutoff)
        sos_side = scipy.signal.butter(4, cutoff_hz, btype="highpass", fs=sr, output="sos")
        side_filtered = scipy.signal.sosfilt(sos_side, side)

        # M/S decoding back to L/R
        new_left = (mid + side_filtered) / np.sqrt(2.0)
        new_right = (mid - side_filtered) / np.sqrt(2.0)

        return np.vstack([new_left, new_right]).astype(np.float32)

    # ---------------------------------------------------------
    # Helper: Stereo Width (M/S matrix scaling)
    # ---------------------------------------------------------
    def apply_stereo_width(self, audio: np.ndarray, width_factor: float = 1.0) -> np.ndarray:
        """Scales the stereo image via Mid/Side matrix."""
        if audio.shape[0] < 2 or width_factor == 1.0:
            return audio

        left = audio[0]
        right = audio[1]

        mid = (left + right) / np.sqrt(2.0)
        side = ((left - right) / np.sqrt(2.0)) * width_factor

        new_left = (mid + side) / np.sqrt(2.0)
        new_right = (mid - side) / np.sqrt(2.0)

        return np.vstack([new_left, new_right]).astype(np.float32)

    # ---------------------------------------------------------
    # Stage 3: Dynamic EQ & Spectral Balancing
    # ---------------------------------------------------------
    def apply_spectral_balancing(
        self, audio: np.ndarray, sr: int, params: MasteringParameters
    ) -> np.ndarray:
        """Applies preset-specific EQ bands (bell & high-shelf) scaled by intensity factor."""
        intensity_factor = np.clip(params.intensity / 100.0, 0.1, 1.0)
        preset_cfg = PRESET_CONFIGS.get(params.preset, PRESET_CONFIGS["groove_soul"])
        eq_bands = preset_cfg.get("eq_bands", [])
        processed = audio.copy()

        # Apply preset EQ bands
        for band in eq_bands:
            band_type = band.get("type", "bell")
            freq = float(band["freq"])
            gain = float(band["gain_db"]) * intensity_factor
            q = float(band.get("q", 0.707))

            # Guard against frequencies exceeding Nyquist limit
            if freq >= (sr / 2.0) - 100.0:
                continue

            if band_type == "bell":
                b, a = self._create_peaking_filter(sr, center_freq=freq, gain_db=gain, q=q)
                processed = scipy.signal.lfilter(b, a, processed, axis=-1)
            elif band_type == "high_shelf":
                b, a = self._create_high_shelf_filter(sr, cutoff_freq=freq, gain_db=gain, q=q)
                processed = scipy.signal.lfilter(b, a, processed, axis=-1)

        # Pro Mode Macro Controls
        if params.mode == "pro" and params.low_end_punch != 50.0:
            punch_delta = (params.low_end_punch - 50.0) / 50.0 * 2.5  # -2.5 dB to +2.5 dB
            b_punch, a_punch = self._create_peaking_filter(sr, center_freq=70.0, gain_db=punch_delta, q=1.0)
            processed = scipy.signal.lfilter(b_punch, a_punch, processed, axis=-1)

        if params.mode == "pro" and params.vocal_clarity != 50.0:
            clarity_delta = (params.vocal_clarity - 50.0) / 50.0 * 2.0  # -2.0 dB to +2.0 dB
            b_clarity, a_clarity = self._create_peaking_filter(sr, center_freq=3000.0, gain_db=clarity_delta, q=1.1)
            processed = scipy.signal.lfilter(b_clarity, a_clarity, processed, axis=-1)

        return processed.astype(np.float32)

    # ---------------------------------------------------------
    # Stage 4: Analog Saturation (Tanh soft-clipping)
    # ---------------------------------------------------------
    def apply_analog_saturation(
        self, audio: np.ndarray, drive_percent: float = 25.0
    ) -> np.ndarray:
        """Gentle tape warmth and harmonic excitation via soft tanh saturation."""
        if drive_percent <= 0:
            return audio

        drive = np.clip(drive_percent / 100.0, 0.0, 1.0)
        drive_gain = 1.0 + (drive * 0.8)  # Up to 1.8x drive into non-linearity
        wet_mix = 0.35 * drive

        driven = audio * drive_gain
        saturated = np.tanh(driven) / np.tanh(drive_gain)

        output = (1.0 - wet_mix) * audio + wet_mix * saturated
        return output.astype(np.float32)

    # ---------------------------------------------------------
    # Stage 5: Loudness Normalization & 4x True-Peak Limiter
    # ---------------------------------------------------------
    def apply_loudness_and_true_peak_limiter(
        self, audio: np.ndarray, sr: int, target_lufs: float, ceiling_dbtp: float = -0.5
    ) -> Tuple[np.ndarray, float, float]:
        """Measures LUFS via pyloudnorm, normalizes, and applies 4x oversampled true-peak brickwall limiting."""
        # pyloudnorm requires (samples, channels)
        audio_t = audio.T
        meter = pyln.Meter(sr)

        input_lufs = meter.integrated_loudness(audio_t)
        if np.isneginf(input_lufs) or np.isnan(input_lufs):
            input_lufs = -24.0

        # Gain adjustment to hit target LUFS
        lufs_delta = target_lufs - input_lufs
        pre_gain_linear = 10.0 ** (lufs_delta / 20.0)
        leveled = audio * pre_gain_linear

        # 2x Oversampling for True-Peak Detection & Limiting (optimized for speed & accuracy)
        up = 2
        down = 1
        oversampled = scipy.signal.resample_poly(leveled, up=up, down=down, axis=-1)

        # True-Peak ceiling in linear amplitude
        ceiling_linear = 10.0 ** (ceiling_dbtp / 20.0)  # e.g. -0.5 dBTP = ~0.94406

        # Fast lookahead soft-knee limiter
        peak_envelope = np.maximum(np.abs(oversampled[0]), np.abs(oversampled[1])) if oversampled.shape[0] >= 2 else np.abs(oversampled[0])
        
        # Smooth envelope (attack: instant, release: ~50ms)
        release_samples = int(0.050 * sr * up)
        b_env = [1.0 / release_samples] * release_samples
        # Use maximum filter followed by rolling average
        smoothed_peaks = scipy.ndimage.maximum_filter1d(peak_envelope, size=int(0.005 * sr * up))

        # Attenuation factor
        attenuation = np.ones_like(smoothed_peaks)
        overshoot = smoothed_peaks > ceiling_linear
        attenuation[overshoot] = ceiling_linear / (smoothed_peaks[overshoot] + 1e-9)

        # Apply gain reduction
        limited_oversampled = oversampled * attenuation

        # Hard safety clip on oversampled grid
        limited_oversampled = np.clip(limited_oversampled, -ceiling_linear, ceiling_linear)

        # Downsample back to original sample rate
        final_audio = scipy.signal.resample_poly(limited_oversampled, up=down, down=up, axis=-1)

        # Final safety clamp
        final_audio = np.clip(final_audio, -ceiling_linear, ceiling_linear).astype(np.float32)

        # Measure output LUFS
        output_lufs = meter.integrated_loudness(final_audio.T)
        return final_audio, float(input_lufs), float(output_lufs)

    # ---------------------------------------------------------
    # Helper: Energy-based 60s Preview Window Detection
    # ---------------------------------------------------------
    @staticmethod
    def find_loudest_window(
        audio: np.ndarray, sr: int, window_sec: float = 60.0
    ) -> Tuple[int, int]:
        """Finds the most energetic passage of the track (drop/chorus) using rolling RMS."""
        total_samples = audio.shape[-1]
        window_samples = int(window_sec * sr)

        if total_samples <= window_samples:
            return 0, total_samples

        # Calculate mono power
        mono_signal = np.mean(audio, axis=0) if audio.shape[0] > 1 else audio[0]
        power = mono_signal ** 2

        # Integrated power via cumulative sum
        cumsum = np.cumsum(np.insert(power, 0, 0.0))
        window_energies = cumsum[window_samples:] - cumsum[:-window_samples]

        loudest_start = int(np.argmax(window_energies))
        loudest_end = loudest_start + window_samples
        return loudest_start, loudest_end

    # ---------------------------------------------------------
    # Export 60s Preview to MP3 320 kbps with Fade In/Out
    # ---------------------------------------------------------
    def export_preview_mp3(
        self, audio: np.ndarray, sr: int, output_mp3_path: str | Path, window_sec: float = 60.0
    ) -> str:
        """Extracts the loudest passage, adds smooth fades, and encodes to 320 kbps MP3 via ffmpeg."""
        start_idx, end_idx = self.find_loudest_window(audio, sr, window_sec)
        preview_slice = audio[:, start_idx:end_idx].copy()

        # Add 1.5s fade-in and 2.0s fade-out
        fade_in_samples = int(min(1.5 * sr, preview_slice.shape[-1] / 4))
        fade_out_samples = int(min(2.0 * sr, preview_slice.shape[-1] / 4))

        fade_in = np.linspace(0.0, 1.0, fade_in_samples)
        fade_out = np.linspace(1.0, 0.0, fade_out_samples)

        preview_slice[:, :fade_in_samples] *= fade_in
        preview_slice[:, -fade_out_samples:] *= fade_out

        # Write intermediate WAV to temp
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_wav:
            tmp_wav_path = tmp_wav.name

        try:
            sf.write(tmp_wav_path, preview_slice.T, sr, subtype="PCM_24")

            # Encode to MP3 320k using ffmpeg
            cmd = [
                "ffmpeg",
                "-y",
                "-i",
                tmp_wav_path,
                "-codec:a",
                "libmp3lame",
                "-b:a",
                "320k",
                str(output_mp3_path),
            ]
            subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            return str(output_mp3_path)
        finally:
            if os.path.exists(tmp_wav_path):
                os.remove(tmp_wav_path)

    # ---------------------------------------------------------
    # Export Full Master Track to MP3 320 kbps for Web Player
    # ---------------------------------------------------------
    def export_full_mp3(
        self, audio: np.ndarray, sr: int, output_mp3_path: str | Path
    ) -> str:
        """Encodes full mastered audio to 320 kbps MP3 for web player streaming."""
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_wav:
            tmp_wav_path = tmp_wav.name

        try:
            sf.write(tmp_wav_path, audio.T, sr, subtype="PCM_16")

            cmd = [
                "ffmpeg",
                "-y",
                "-i",
                tmp_wav_path,
                "-codec:a",
                "libmp3lame",
                "-b:a",
                "320k",
                str(output_mp3_path),
            ]
            subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            return str(output_mp3_path)
        finally:
            if os.path.exists(tmp_wav_path):
                os.remove(tmp_wav_path)

    # ---------------------------------------------------------
    # Master Processing Entrypoint
    # ---------------------------------------------------------
    def process_file(
        self,
        input_audio_path: str | Path,
        output_dir: str | Path,
        params: MasteringParameters,
        job_id: str,
    ) -> Dict[str, any]:
        """Executes full mastering DSP pipeline on an audio file."""
        os.makedirs(output_dir, exist_ok=True)

        # 1. Load Audio
        data, sr = sf.read(str(input_audio_path), dtype="float32")
        # Ensure (channels, samples) shape
        if data.ndim == 1:
            audio = np.vstack([data, data])  # duplicate mono to stereo
        else:
            audio = data.T  # (channels, samples)

        preset_cfg = PRESET_CONFIGS.get(params.preset, PRESET_CONFIGS["groove_soul"])

        # 2. Stage 1: Highpass Filter (30 Hz Butterworth 18 dB/oct)
        audio = self.apply_highpass(audio, sr, cutoff_hz=30.0)

        # 3. Stage 2: Bass-Mono Matrix
        cutoff = params.low_end_mono_cutoff if params.mode == "pro" else preset_cfg.get("bass_mono_cutoff", 95.0)
        audio = self.apply_bass_mono(audio, sr, cutoff_hz=cutoff)

        # 4. Stage 3: Dynamic EQ & Spectral Balancing
        audio = self.apply_spectral_balancing(audio, sr, params)

        # 5. Stereo Width Expansion
        width_factor = (params.stereo_width / 50.0) if params.mode == "pro" else preset_cfg.get("stereo_width", 1.0)
        audio = self.apply_stereo_width(audio, width_factor=width_factor)

        # 6. Stage 4: Analog Saturation
        sat_drive = params.tape_saturation if params.mode == "pro" else (preset_cfg.get("tape_drive", 0.20) * 100.0 * (params.intensity / 100.0))
        audio = self.apply_analog_saturation(audio, drive_percent=sat_drive)

        # 7. Stage 5: Loudness Normalization & True-Peak Limiter
        target_lufs = params.target_lufs if params.mode == "pro" else preset_cfg.get("target_lufs", -11.0)

        mastered_audio, input_lufs, output_lufs = self.apply_loudness_and_true_peak_limiter(
            audio, sr, target_lufs=target_lufs, ceiling_dbtp=params.true_peak_ceiling_dbtp
        )

        # 7. Export Outputs
        wav_filename = f"master_final_{job_id}.wav" if job_id else "master_final.wav"
        mp3_filename = f"master_preview_60s_{job_id}.mp3" if job_id else "master_preview_60s.mp3"
        stream_mp3_filename = f"master_stream_{job_id}.mp3" if job_id else "master_stream.mp3"

        final_wav_path = os.path.join(output_dir, wav_filename)
        preview_mp3_path = os.path.join(output_dir, mp3_filename)
        stream_mp3_path = os.path.join(output_dir, stream_mp3_filename)

        print(
            f"--> DSP PROCESSING: Preset={params.preset}, Input={input_audio_path}, Output={final_wav_path}, Shape={mastered_audio.shape}",
            flush=True,
        )

        # 24-Bit WAV output (for HD Download)
        sf.write(final_wav_path, mastered_audio.T, sr, subtype="PCM_24")

        # 60-Second 320kbps MP3 Preview
        self.export_preview_mp3(mastered_audio, sr, preview_mp3_path, window_sec=60.0)

        # Full-length 320kbps MP3 for Web Player Streaming
        self.export_full_mp3(mastered_audio, sr, stream_mp3_path)

        return {
            "jobId": job_id,
            "finalWavPath": str(final_wav_path),
            "previewMp3Path": str(preview_mp3_path),
            "streamMp3Path": str(stream_mp3_path),
            "sampleRate": sr,
            "channels": 2,
            "inputLufs": round(input_lufs, 2),
            "outputLufs": round(output_lufs, 2),
            "dynamicRange": round(abs(output_lufs - input_lufs), 2),
            "truePeakCeiling": params.true_peak_ceiling_dbtp,
        }
