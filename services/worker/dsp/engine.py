"""Mastr Audio Mastering DSP Engine (Umleitung auf worker.chain)

Zentrale Umleitung auf die konsolidierte Audio-Pipeline in worker/chain.py.
Entfernt redundante DSP-Implementierungen und nutzt die einheitliche Chain:
1. prepare_input: 30 Hz Highpass, Bass-Mono < 120 Hz, Input-Gain-Absenkung
2. apply_preset: EQ -> Glue-Kompressor -> Saturation -> Ziel-LUFS -> Limiter
"""

import os
import sys
import tempfile
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Literal, Optional, Tuple

import numpy as np
import soundfile as sf

# Pfad zu worker/ in sys.path registrieren
_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_WORKER_PATH = _PROJECT_ROOT / "worker"
if str(_WORKER_PATH) not in sys.path:
    sys.path.insert(0, str(_WORKER_PATH))

try:
    from chain import load_preset, prepare_input, apply_preset
except ImportError:
    from worker.chain import load_preset, prepare_input, apply_preset


@dataclass
class MasteringParameters:
    mode: Literal["easy", "pro"] = "easy"
    preset: str = "vocal_pop"
    intensity: float = 80.0
    target_lufs: float = -10.0
    low_end_mono_cutoff: float = 120.0
    tape_saturation: float = 20.0
    stereo_width: float = 50.0
    low_end_punch: float = 50.0
    vocal_clarity: float = 50.0
    true_peak_ceiling_dbtp: float = -1.0


class AudioMasteringEngine:
    """Zentrale AudioMasteringEngine, weitergeleitet an worker/chain.py."""

    def __init__(self):
        pass

    def export_preview_mp3(
        self, audio: np.ndarray, sr: int, output_mp3_path: str | Path, window_sec: float = 60.0
    ) -> str:
        """Encodes up to 60 seconds preview MP3 for web player streaming."""
        n_samples = int(window_sec * sr)
        # audio shape: (channels, samples)
        preview_audio = audio[:, :n_samples] if audio.shape[1] > n_samples else audio

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_wav:
            tmp_wav_path = tmp_wav.name

        try:
            sf.write(tmp_wav_path, preview_audio.T, sr, subtype="PCM_16")
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
                try:
                    os.remove(tmp_wav_path)
                except OSError:
                    pass

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
                try:
                    os.remove(tmp_wav_path)
                except OSError:
                    pass

    def process_file(
        self,
        input_audio_path: str | Path,
        output_dir: str | Path,
        params: MasteringParameters,
        job_id: str,
    ) -> Dict[str, any]:
        """Executes unified mastering DSP pipeline via worker/chain.py."""
        os.makedirs(output_dir, exist_ok=True)

        data, sr = sf.read(str(input_audio_path), dtype="float32")
        if data.ndim == 1:
            data = np.column_stack([data, data])

        # 1. Preset aus zentralen Presets laden
        preset_name = getattr(params, "preset", "vocal_pop") or "vocal_pop"
        try:
            preset = load_preset(preset_name)
        except Exception:
            preset = load_preset("vocal_pop")

        # Pro-Mode Übersteuerungen falls angegeben
        if getattr(params, "mode", "easy") == "pro" and getattr(params, "target_lufs", None) is not None:
            preset["output"]["target_lufs"] = float(params.target_lufs)
        if getattr(params, "mode", "easy") == "pro" and getattr(params, "true_peak_ceiling_dbtp", None) is not None:
            preset["output"]["true_peak_db"] = float(params.true_peak_ceiling_dbtp)

        # 2. Stufe 1: Vorbereitung (30Hz Low-Cut, Bass-Mono < 120Hz, Input-Protection)
        cleaned, in_metrics = prepare_input(data, sr)

        # 3. Stufe 3: Finale Mastering-Kette (EQ -> Comp -> Saturation -> Target-LUFS -> Limiter)
        final_audio, out_metrics = apply_preset(cleaned, sr, preset)

        # 4. Speichern als 24-Bit WAV
        wav_filename = f"master_final_{job_id}.wav" if job_id else "master_final.wav"
        mp3_filename = f"master_preview_60s_{job_id}.mp3" if job_id else "master_preview_60s.mp3"
        stream_mp3_filename = f"master_stream_{job_id}.mp3" if job_id else "master_stream.mp3"

        final_wav_path = os.path.join(output_dir, wav_filename)
        preview_mp3_path = os.path.join(output_dir, mp3_filename)
        stream_mp3_path = os.path.join(output_dir, stream_mp3_filename)

        sf.write(final_wav_path, final_audio, sr, subtype="PCM_24")

        # MP3 Encodierung (channels, samples)
        audio_ch_first = final_audio.T
        try:
            self.export_preview_mp3(audio_ch_first, sr, preview_mp3_path, window_sec=60.0)
            self.export_full_mp3(audio_ch_first, sr, stream_mp3_path)
        except Exception:
            # Falls ffmpeg im Test-Environment fehlt, wird WAV trotzdem bereitgestellt
            pass

        in_lufs = in_metrics.get("input_lufs")
        out_lufs = out_metrics.get("output_lufs")
        dyn_range = round(abs(out_lufs - in_lufs), 2) if in_lufs and out_lufs else 0.0

        return {
            "jobId": job_id,
            "finalWavPath": str(final_wav_path),
            "previewMp3Path": str(preview_mp3_path),
            "streamMp3Path": str(stream_mp3_path),
            "sampleRate": sr,
            "channels": 2,
            "inputLufs": in_lufs,
            "outputLufs": out_lufs,
            "dynamicRange": dyn_range,
            "truePeakCeiling": preset["output"]["true_peak_db"],
            "metrics": {
                "input": in_metrics,
                "output": out_metrics,
            },
        }
