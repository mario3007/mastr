import json
from pathlib import Path
import numpy as np
import pyloudnorm as pyln
from scipy.signal import butter, sosfiltfilt
from pedalboard import (
    Pedalboard,
    HighpassFilter,
    LowShelfFilter,
    HighShelfFilter,
    PeakFilter,
    Compressor,
    Distortion,
    Gain,
    Limiter,
)

PRESET_DIR = Path(__file__).parent / "presets"


def load_preset(name: str) -> dict:
    preset_path = PRESET_DIR / f"{name}.json"
    if not preset_path.exists():
        raise FileNotFoundError(f"Preset not found: {preset_path}")
    return json.loads(preset_path.read_text(encoding="utf-8"))


def make_bass_mono(audio: np.ndarray, sr: int, cutoff_hz: float = 120.0) -> np.ndarray:
    """Summiert Frequenzen unterhalb von cutoff_hz auf Mono (M/S-Verfahren)."""
    if audio.ndim < 2 or audio.shape[1] < 2:
        return audio

    left, right = audio[:, 0], audio[:, 1]
    mid = 0.5 * (left + right)
    side = 0.5 * (left - right)

    sos = butter(4, cutoff_hz, btype="high", fs=sr, output="sos")
    side_filtered = sosfiltfilt(sos, side)

    out_left = mid + side_filtered
    out_right = mid - side_filtered
    return np.column_stack((out_left, out_right)).astype(np.float32)


def prepare_input(
    audio: np.ndarray,
    sr: int,
    max_input_lufs: float = -11.0,
    target_input_lufs: float = -14.0,
) -> tuple[np.ndarray, dict]:
    """
    Stufe 1 (Vor Matchering):
    30 Hz Low-Cut, Bass-Mono < 120 Hz und Input-Gain-Absenkung bei zu lauten KI-Quellen.
    """
    cleaned = Pedalboard([HighpassFilter(30.0)])(audio.T, sr).T
    cleaned = make_bass_mono(cleaned, sr, cutoff_hz=120.0)

    meter = pyln.Meter(sr)
    input_lufs = float(meter.integrated_loudness(cleaned))
    peak_db = float(20.0 * np.log10(np.max(np.abs(cleaned)) + 1e-12))
    crest_factor = peak_db - input_lufs

    applied_input_gain = 0.0
    if np.isfinite(input_lufs) and input_lufs > max_input_lufs:
        applied_input_gain = target_input_lufs - input_lufs
        cleaned = Pedalboard([Gain(applied_input_gain)])(cleaned.T, sr).T

    metrics = {
        "input_lufs": round(input_lufs, 2) if np.isfinite(input_lufs) else None,
        "crest_factor_db": round(crest_factor, 2) if np.isfinite(crest_factor) else None,
        "applied_input_gain_db": round(applied_input_gain, 2),
    }
    return cleaned.astype(np.float32), metrics


def _eq(band: dict):
    t = band["type"]
    freq = float(band["freq"])
    gain_db = float(band["gain_db"])
    q = float(band.get("q", 0.7))

    if t == "low_shelf":
        return LowShelfFilter(cutoff_frequency_hz=freq, gain_db=gain_db, q=q)
    if t == "high_shelf":
        return HighShelfFilter(cutoff_frequency_hz=freq, gain_db=gain_db, q=q)
    return PeakFilter(cutoff_frequency_hz=freq, gain_db=gain_db, q=float(band.get("q", 1.0)))


def build_chain(p: dict) -> Pedalboard:
    fx = [HighpassFilter(30.0)]
    fx += [_eq(b) for b in p.get("eq", [])]
    c = p["comp"]
    fx.append(
        Compressor(
            threshold_db=float(c["threshold_db"]),
            ratio=float(c["ratio"]),
            attack_ms=float(c["attack_ms"]),
            release_ms=float(c["release_ms"]),
        )
    )
    return Pedalboard(fx)


def apply_preset(audio: np.ndarray, sr: int, p: dict) -> tuple[np.ndarray, dict]:
    """
    Stufe 3 (Nach Matchering):
    EQ -> Glue-Kompressor -> Parallele Sättigung -> Ziel-LUFS -> True-Peak-Limiter.
    """
    x = build_chain(p)(audio.T, sr).T

    s = p.get("saturation", {"drive_db": 0.0, "mix": 0.0})
    mix = float(s.get("mix", 0.0))
    if mix > 0.0 and float(s.get("drive_db", 0.0)) > 0.0:
        wet = Pedalboard([Distortion(drive_db=float(s["drive_db"]))])(x.T, sr).T
        x = (1.0 - mix) * x + mix * wet

    meter = pyln.Meter(sr)
    current_lufs = float(meter.integrated_loudness(x))
    target_lufs = float(p["output"]["target_lufs"])

    gain = min(target_lufs - current_lufs, 6.0) if np.isfinite(current_lufs) else 0.0
    ceiling_db = float(p["output"]["true_peak_db"])

    out = Pedalboard([
        Gain(gain_db=gain),
        Limiter(threshold_db=ceiling_db, release_ms=100.0),
    ])(x.T, sr).T.astype(np.float32)

    final_lufs = float(meter.integrated_loudness(out))
    metrics = {
        "preset": p.get("name"),
        "post_gain_db": round(gain, 2),
        "output_lufs": round(final_lufs, 2) if np.isfinite(final_lufs) else None,
        "ceiling_db": ceiling_db,
    }
    return out, metrics
