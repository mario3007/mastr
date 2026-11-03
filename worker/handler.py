"""RunPod Serverless Worker Handler for Mastr Audio Mastering

Pipeline:
1. Downloads audio from presigned HTTPS GET download_url
2. Branches based on preset:
   - preset == 'suno_enhancer': audiosr.super_resolution + Pedalboard Glue Compression & High-Pass
   - Standard / Club / Warm / other: Matchering spectral/dynamics matching against targets/ + Pedalboard Limiting (-14 LUFS / -1.0 dB True Peak)
3. Uploads final 24-bit master via HTTPS PUT to upload_url
4. Ensures clean temporary file removal in finally block
"""

import os
import sys
import uuid
import shutil
import logging
import requests
import numpy as np
import soundfile as sf
import scipy.signal as scipy_signal
import pyloudnorm as pyln
from pedalboard import Pedalboard, HighpassFilter, Compressor, Limiter
from pedalboard.io import AudioFile
import matchering as mg

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("mastr-worker")

# Lazy-loaded AudioSR model cache
_audiosr_model = None

def get_audiosr_model():
    """Lazily initialize AudioSR model with GPU/CPU support."""
    global _audiosr_model
    if _audiosr_model is None:
        try:
            import torch
            import audiosr
            device = "cuda" if torch.cuda.is_available() else "cpu"
            logger.info(f"Loading AudioSR model on device: {device}...")
            _audiosr_model = audiosr.build_model(model_name="basic", device=device)
            logger.info("AudioSR model successfully loaded.")
        except Exception as e:
            logger.error(f"Failed to load AudioSR model: {e}")
            raise
    return _audiosr_model


def download_file(url: str, dest_path: str):
    """Download audio file from presigned GET URL."""
    logger.info(f"Downloading audio from {url} to {dest_path}...")
    with requests.get(url, stream=True, timeout=180) as r:
        r.raise_for_status()
        with open(dest_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    f.write(chunk)
    logger.info(f"Download complete: {os.path.getsize(dest_path)} bytes")


def upload_file(url: str, src_path: str):
    """Upload completed master to presigned PUT URL."""
    file_size = os.path.getsize(src_path)
    logger.info(f"Uploading mastered file ({file_size} bytes) to {url}...")
    with open(src_path, "rb") as f:
        res = requests.put(
            url,
            data=f,
            headers={"Content-Type": "audio/wav"},
            timeout=300,
        )
        res.raise_for_status()
    logger.info("Upload complete with HTTP status 200.")


def create_mastering_reference(curve_type: str = "standard", duration_sec: float = 15.0, sr: int = 44100) -> np.ndarray:
    """Synthesizes a pristine, full-range commercial mastering reference curve with deep bass and coherent stereo."""
    np.random.seed(42)
    n_samples = int(sr * duration_sec)
    freqs = np.fft.rfftfreq(n_samples, 1 / sr)
    freqs[0] = 1.0  # avoid divide by zero

    # Base pink noise slope: -4.3 dB/octave matching top commercial masters
    base_spectrum = 1.0 / (freqs ** 0.72)

    if curve_type == "club":
        # Enhanced sub-bass 40-75 Hz (+4 dB), tight scooped lower-mids 350-500 Hz (-2 dB), crisp highs 8-15k
        sub_boost = 1.0 + 1.8 * np.exp(-0.5 * ((np.log2(freqs / 55.0)) / 0.4) ** 2)
        mid_scoop = 1.0 - 0.25 * np.exp(-0.5 * ((np.log2(freqs / 400.0)) / 0.5) ** 2)
        high_sheen = 1.0 + 0.35 * np.exp(-0.5 * ((np.log2(freqs / 11000.0)) / 0.6) ** 2)
        eq = sub_boost * mid_scoop * high_sheen
    elif curve_type == "warm":
        # Rich warm bass 80-160 Hz (+3 dB), rounded smooth highs above 10k (-3 dB)
        bass_warmth = 1.0 + 1.5 * np.exp(-0.5 * ((np.log2(freqs / 110.0)) / 0.5) ** 2)
        high_tame = 1.0 / (1.0 + (freqs / 12000.0) ** 2)
        eq = bass_warmth * (0.8 + 0.2 * high_tame)
    else:  # standard / balanced
        # Solid sub-bass 35-90 Hz (+3 dB), clean boxiness notch at 450 Hz, silky air at 12 kHz
        sub_fundament = 1.0 + 1.4 * np.exp(-0.5 * ((np.log2(freqs / 65.0)) / 0.45) ** 2)
        box_cut = 1.0 - 0.18 * np.exp(-0.5 * ((np.log2(freqs / 450.0)) / 0.4) ** 2)
        vocal_air = 1.0 + 0.25 * np.exp(-0.5 * ((np.log2(freqs / 12000.0)) / 0.7) ** 2)
        eq = sub_fundament * box_cut * vocal_air

    # Gentle subsonic highpass at 24 Hz (preserves 100% of 30-100 Hz bass)
    hp_sub = 1.0 / (1.0 + (24.0 / freqs) ** 4)
    lp_ultra = 1.0 / (1.0 + (freqs / 20500.0) ** 6)

    final_spectrum = base_spectrum * eq * hp_sub * lp_ultra

    # Mid channel: 100% coherent sub-bass & full musical energy
    random_phases_mid = np.exp(1j * np.random.uniform(0, 2 * np.pi, len(freqs)))
    mid_fft = final_spectrum * random_phases_mid
    mid = np.fft.irfft(mid_fft, n_samples)

    # Side channel: Stereo spread with pure mono bass (< 120 Hz)
    side_hp = 1.0 / (1.0 + (130.0 / freqs) ** 4)
    side_spectrum = final_spectrum * 0.45 * side_hp
    random_phases_side = np.exp(1j * np.random.uniform(0, 2 * np.pi, len(freqs)))
    side_fft = side_spectrum * random_phases_side
    side = np.fft.irfft(side_fft, n_samples)

    left = mid + side
    right = mid - side
    stereo = np.column_stack([left, right])

    # Normalize to -1.0 dB True Peak
    max_peak = np.max(np.abs(stereo))
    if max_peak > 0:
        target_peak = 10.0 ** (-1.0 / 20.0)
        stereo = stereo * (target_peak / max_peak)

    return stereo


PRESET_CONFIG = {
    "club_punch": {
        "target": "targets/club_punch.wav",
        "target_lufs": -8.5,
    },
    "vocal_pop": {
        "target": "targets/vocal_pop.wav",
        "target_lufs": -10.5,
    },
    "warm_tape": {
        "target": "targets/warm_tape.wav",
        "target_lufs": -13.0,
    },
    "groove_soul": {
        "target": "targets/groove_soul.wav",
        "target_lufs": -11.0,
    },
}
DEFAULT_PRESET = "club_punch"


def resolve_target_file(preset: str) -> tuple:
    """Select or generate the appropriate full-range reference curve WAV and target LUFS with fallback protection."""
    targets_dir = os.path.join(os.path.dirname(__file__), "targets")
    os.makedirs(targets_dir, exist_ok=True)
    preset_lower = (preset or "").lower().strip()

    # Find matching config or fallback to DEFAULT_PRESET
    if preset_lower in PRESET_CONFIG:
        config_entry = PRESET_CONFIG[preset_lower]
    else:
        config_entry = PRESET_CONFIG[DEFAULT_PRESET]

    target_relative_path = config_entry["target"]
    target_lufs = config_entry["target_lufs"]
    target_path = os.path.join(os.path.dirname(__file__), target_relative_path)

    # Fallback protection: check if target WAV exists and is valid (> 10KB)
    if not os.path.exists(target_path) or os.path.getsize(target_path) < 10000:
        logger.warning(f"Target WAV {target_path} not found. Checking fallback standard target...")
        fallback_path = os.path.join(targets_dir, "standard.wav")
        if os.path.exists(fallback_path) and os.path.getsize(fallback_path) >= 10000:
            logger.info(f"Using existing standard reference target fallback: {fallback_path}")
            target_path = fallback_path
        else:
            logger.info(f"Generating studio-grade full-range reference target: {target_path}...")
            curve_type = "standard"
            if "club" in target_relative_path:
                curve_type = "club"
            elif "warm" in target_relative_path:
                curve_type = "warm"
            ref_audio = create_mastering_reference(curve_type=curve_type, duration_sec=15.0, sr=44100)
            sf.write(target_path, ref_audio, 44100, subtype="PCM_24")

    return target_path, target_lufs


def apply_low_cut(input_path: str, output_path: str, cutoff_hz: float = 30.0) -> str:
    """Apply a zero-phase 30Hz high-pass low-cut filter to remove subsonic rumble before mastering."""
    logger.info(f"Applying pre-processing low-cut filter ({cutoff_hz} Hz) to {input_path}...")
    data, sample_rate = sf.read(input_path)
    is_1d = data.ndim == 1
    if is_1d:
        data = np.column_stack([data, data])

    # 4th-order Butterworth highpass with forward-backward zero-phase filtering
    sos = scipy_signal.butter(4, cutoff_hz, btype="highpass", fs=sample_rate, output="sos")
    filtered = scipy_signal.sosfiltfilt(sos, data, axis=0)

    if is_1d:
        filtered = filtered[:, 0]

    sf.write(output_path, filtered, sample_rate, subtype="PCM_24" if input_path.endswith(".wav") else "PCM_16")
    logger.info(f"Low-cut pre-filtering complete: saved to {output_path}")
    return output_path


def prepare_normalized_target(target_path: str, temp_dir: str, target_lufs: float = -10.0, max_peak_db: float = -1.0) -> str:
    """Ensure target reference track is normalized to safe peak (<= -1.0 dBFS) and max -10.0 LUFS to prevent overcompressed target curves."""
    logger.info(f"Validating and normalizing target reference {target_path} (max {max_peak_db} dBFS, target ~{target_lufs} LUFS)...")
    data, sample_rate = sf.read(target_path)
    if data.ndim == 1:
        data = np.column_stack([data, data])

    meter = pyln.Meter(sample_rate)
    try:
        current_lufs = meter.integrated_loudness(data)
    except Exception:
        current_lufs = -10.0

    # If reference track is hotter than target_lufs (e.g. -7 or -8 LUFS), pull it down
    if not np.isinf(current_lufs) and not np.isnan(current_lufs) and current_lufs > target_lufs:
        gain_db = target_lufs - current_lufs
        logger.info(f"Reference loudness {current_lufs:.1f} LUFS exceeds {target_lufs:.1f} LUFS. Applying {gain_db:.1f} dB attenuation.")
        data = data * (10.0 ** (gain_db / 20.0))

    # Ensure peak does not exceed max_peak_db (-1.0 dBFS)
    peak = np.max(np.abs(data))
    max_peak_amp = 10.0 ** (max_peak_db / 20.0)
    if peak > max_peak_amp:
        logger.info(f"Reference peak {20 * np.log10(peak + 1e-9):.1f} dBFS exceeds {max_peak_db} dBFS. Scaling down to safe ceiling.")
        data = data * (max_peak_amp / peak)

    norm_target_path = os.path.join(temp_dir, f"norm_{os.path.basename(target_path)}")
    sf.write(norm_target_path, data, sample_rate, subtype="PCM_24")
    return norm_target_path


def get_matchering_config(headroom_db: float = -1.0) -> mg.Config:
    """Create Matchering Config with safe threshold to prevent 0 dBFS clipping and inter-sample distortion."""
    # Matchering threshold is linear amplitude between min_value and 1.0 (default 0.998 ~ 0 dBFS)
    safe_threshold = float(10.0 ** (headroom_db / 20.0))
    logger.info(f"Configuring Matchering with threshold={safe_threshold:.4f} ({headroom_db} dB True Peak headroom)")
    return mg.Config(threshold=safe_threshold)


def apply_pedalboard_limiting(input_path: str, output_path: str, target_lufs: float = -14.0, true_peak_ceiling_db: float = -1.0):
    """Normalize loudness towards target_lufs and apply true-peak brickwall limiting without bass loss."""
    logger.info(f"Applying Pedalboard Limiter targeting {target_lufs} LUFS / {true_peak_ceiling_db} dB True Peak...")

    # Read audio for loudness measurement
    data, sample_rate = sf.read(input_path)
    if data.ndim == 1:
        # Convert true mono to dual-channel stereo
        data = np.column_stack([data, data])

    meter = pyln.Meter(sample_rate)
    try:
        current_lufs = meter.integrated_loudness(data)
    except Exception:
        current_lufs = -20.0

    # Calculate gain offset required for target loudness
    if not np.isinf(current_lufs) and not np.isnan(current_lufs):
        gain_db = target_lufs - current_lufs
        # Soft clamp gain boost to avoid extreme distortions before limiting
        gain_db = np.clip(gain_db, -18.0, 18.0)
        gain_factor = 10.0 ** (gain_db / 20.0)
        data = data * gain_factor

    # Process through Pedalboard Limiter with 30Hz subsonic filter (preserving all bass down to 30 Hz)
    board = Pedalboard([
        HighpassFilter(cutoff_frequency_hz=30.0),
        Limiter(threshold_db=true_peak_ceiling_db, release_ms=100.0),
    ])

    # Pedalboard expects (channels, samples)
    audio_transposed = data.T.astype(np.float32)
    effected = board(audio_transposed, sample_rate)

    # Save final 24-bit PCM WAV (samples, channels)
    sf.write(output_path, effected.T, sample_rate, subtype="PCM_24")
    logger.info(f"Limiting complete: saved to {output_path} (channels={effected.shape[0]}, sr={sample_rate})")


def process_suno_enhancer(input_path: str, output_path: str):
    """Run AudioSR super-resolution with true stereo preservation, followed by Pedalboard Glue Compression."""
    logger.info("Executing Suno Enhancer pipeline (AudioSR + Pedalboard Glue Compression)...")

    audio_data, in_sr = sf.read(input_path)
    is_stereo = audio_data.ndim == 2 and audio_data.shape[1] >= 2

    temp_files = []
    sr_stereo_data = None
    proc_sr = in_sr

    try:
        model = get_audiosr_model()
        import audiosr

        if is_stereo:
            logger.info("Stereo audio detected: Processing Left and Right channels independently to preserve stereo field...")
            left_ch = audio_data[:, 0]
            right_ch = audio_data[:, 1]

            temp_l = input_path.replace(".wav", "_temp_l.wav")
            temp_r = input_path.replace(".wav", "_temp_r.wav")
            out_sr_l = input_path.replace(".wav", "_sr_l.wav")
            out_sr_r = input_path.replace(".wav", "_sr_r.wav")
            temp_files.extend([temp_l, temp_r, out_sr_l, out_sr_r])

            sf.write(temp_l, left_ch, in_sr, subtype="PCM_24")
            sf.write(temp_r, right_ch, in_sr, subtype="PCM_24")

            # Run AudioSR on Left and Right independently with fixed seed
            audiosr.super_resolution(model, temp_l, output_file=out_sr_l, seed=42, guidance_scale=3.5, ddim_steps=50)
            audiosr.super_resolution(model, temp_r, output_file=out_sr_r, seed=42, guidance_scale=3.5, ddim_steps=50)

            l_sr, sr_rate = sf.read(out_sr_l)
            r_sr, _ = sf.read(out_sr_r)

            min_len = min(len(l_sr), len(r_sr))
            sr_stereo_data = np.column_stack([l_sr[:min_len], r_sr[:min_len]])
            proc_sr = sr_rate
        else:
            logger.info("Mono audio detected: Processing single channel...")
            temp_sr_output = input_path.replace(".wav", "_sr.wav")
            temp_files.append(temp_sr_output)
            audiosr.super_resolution(model, input_path, output_file=temp_sr_output, seed=42, guidance_scale=3.5, ddim_steps=50)
            mono_data, proc_sr = sf.read(temp_sr_output)
            sr_stereo_data = np.column_stack([mono_data, mono_data])

    except Exception as err:
        logger.warning(f"AudioSR super_resolution fallback to direct DSP: {err}")
        if is_stereo:
            sr_stereo_data = audio_data
        else:
            sr_stereo_data = np.column_stack([audio_data, audio_data])
        proc_sr = in_sr

    # Clean intermediate temporary files
    for tf in temp_files:
        if os.path.exists(tf):
            try:
                os.remove(tf)
            except OSError:
                pass

    # Apply Pedalboard Glue-Compression with subsonic protection (30 Hz cutoff so 30-100Hz bass is 100% preserved)
    board = Pedalboard([
        HighpassFilter(cutoff_frequency_hz=30.0),
        Compressor(threshold_db=-18.0, ratio=2.0, attack_ms=30.0, release_ms=100.0),
        Limiter(threshold_db=-1.0, release_ms=100.0),
    ])

    # Pedalboard expects (channels, samples)
    audio_transposed = sr_stereo_data.T.astype(np.float32)
    effected = board(audio_transposed, proc_sr)

    # Save final 24-bit PCM WAV (samples, channels)
    sf.write(output_path, effected.T, proc_sr, subtype="PCM_24")
    logger.info(f"Suno Enhancer complete: saved {output_path} (channels={effected.shape[0]}, sr={proc_sr})")


def handler(event: dict) -> dict:
    """RunPod Serverless Handler entrypoint."""
    job_input = event.get("input", {})
    download_url = job_input.get("download_url")
    upload_url = job_input.get("upload_url")
    engine = (job_input.get("engine") or "").lower().strip()
    preset = (job_input.get("preset") or DEFAULT_PRESET).lower().strip()
    if preset not in PRESET_CONFIG:
        preset = DEFAULT_PRESET
    duration = job_input.get("duration")

    if not download_url or not upload_url:
        return {"error": "Missing required download_url or upload_url in input"}

    job_id = str(uuid.uuid4())
    temp_dir = os.path.join("/tmp", f"mastr_job_{job_id}")
    os.makedirs(temp_dir, exist_ok=True)

    input_file = os.path.join(temp_dir, "input_audio.wav")
    matchered_file = os.path.join(temp_dir, "matchered.wav")
    final_output_file = os.path.join(temp_dir, "final_master.wav")

    temp_files = [input_file, matchered_file, final_output_file]

    try:
        logger.info(f"Starting job {job_id} with engine='{engine}', preset='{preset}'")

        # 1. Download source audio
        download_file(download_url, input_file)

        in_info = sf.info(input_file)
        logger.info(f"Input audio specs: channels={in_info.channels}, samplerate={in_info.samplerate}, duration={in_info.duration:.2f}s")

        # 2. Branch according to engine & preset
        # Pure AudioSR 48kHz Upscaling: No target curve enforced!
        if engine in ["audio_sr", "audiosr"] or preset in ["audio_sr", "audiosr", "suno_enhancer"]:
            logger.info("Running pure AudioSR 48kHz Upscaling (no target curve enforced)...")
            process_suno_enhancer(input_file, final_output_file)

        # AI Full Chain: AudioSR Upscaling -> 30Hz Low-Cut -> Matchering with Normalized Target & Config -> Limiter
        elif engine in ["full", "ai_full", "full_chain"]:
            raw_target, target_lufs = resolve_target_file(preset)
            normalized_target = prepare_normalized_target(raw_target, temp_dir, target_lufs=-10.0, max_peak_db=-1.0)
            temp_files.append(normalized_target)

            logger.info(f"Running AI Full Chain: AudioSR Enhancement -> 30Hz Low-Cut -> Matchering ({normalized_target}) -> Limiter ({target_lufs} LUFS)...")
            sr_intermediate = os.path.join(temp_dir, "sr_intermediate.wav")
            sr_clean = os.path.join(temp_dir, "sr_clean.wav")
            temp_files.extend([sr_intermediate, sr_clean])

            process_suno_enhancer(input_file, sr_intermediate)
            apply_low_cut(sr_intermediate, sr_clean, cutoff_hz=30.0)

            # Matchering with safe -1.0 dB True-Peak headroom config
            mg_config = get_matchering_config(headroom_db=-1.0)
            mg.process(
                target=sr_clean,
                reference=normalized_target,
                results=[mg.pcm24(matchered_file)],
                config=mg_config,
            )
            apply_pedalboard_limiting(
                input_path=matchered_file,
                output_path=final_output_file,
                target_lufs=target_lufs,
                true_peak_ceiling_db=-1.0,
            )

        # Matchering / Classic / Default: 30Hz Low-Cut -> Matchering with Normalized Target & Config -> Limiter
        else:
            raw_target, target_lufs = resolve_target_file(preset)
            normalized_target = prepare_normalized_target(raw_target, temp_dir, target_lufs=-10.0, max_peak_db=-1.0)
            temp_files.append(normalized_target)

            logger.info(f"Using matchering target reference: {normalized_target} (target_lufs={target_lufs})")

            # Pre-Processing: 30Hz zero-phase high-pass low-cut filter to prevent subsonic limiter saturation
            preprocessed_input = os.path.join(temp_dir, "preprocessed_input.wav")
            temp_files.append(preprocessed_input)
            apply_low_cut(input_file, preprocessed_input, cutoff_hz=30.0)

            # Run Matchering process with safe -1.0 dB True-Peak headroom config
            mg_config = get_matchering_config(headroom_db=-1.0)
            mg.process(
                target=preprocessed_input,
                reference=normalized_target,
                results=[mg.pcm24(matchered_file)],
                config=mg_config,
            )

            # Apply Pedalboard Limiter with dynamic target_lufs and -1.0 dB True-Peak ceiling
            apply_pedalboard_limiting(
                input_path=matchered_file,
                output_path=final_output_file,
                target_lufs=target_lufs,
                true_peak_ceiling_db=-1.0,
            )

        # 3. Upload final result directly to presigned PUT upload_url
        upload_file(upload_url, final_output_file)

        return {
            "status": "COMPLETED",
            "job_id": job_id,
            "engine": engine,
            "preset": preset,
            "duration": duration,
            "message": "Mastering completed and uploaded successfully.",
        }

    except Exception as e:
        logger.exception(f"Job {job_id} failed with error: {e}")
        return {
            "status": "FAILED",
            "job_id": job_id,
            "error": str(e),
        }

    finally:
        # 4. Clean up temporary directory and files in finally block
        logger.info(f"Cleaning up temporary directory {temp_dir}...")
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception as e:
            logger.warning(f"Failed to remove temp dir {temp_dir}: {e}")


if __name__ == "__main__":
    try:
        import runpod
        logger.info("Starting RunPod Serverless worker loop...")
        runpod.serverless.start({"handler": handler})
    except ImportError:
        logger.warning("runpod package not found; running in standalone local test mode")
