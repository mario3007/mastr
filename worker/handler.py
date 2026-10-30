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


def resolve_target_file(preset: str) -> str:
    """Select the appropriate reference curve WAV from targets directory."""
    targets_dir = os.path.join(os.path.dirname(__file__), "targets")
    preset_lower = (preset or "").lower().strip()

    if any(k in preset_lower for k in ["club", "edm", "punch"]):
        target_path = os.path.join(targets_dir, "club.wav")
    elif any(k in preset_lower for k in ["warm", "tape", "analog"]):
        target_path = os.path.join(targets_dir, "warm.wav")
    else:
        target_path = os.path.join(targets_dir, "standard.wav")

    if not os.path.exists(target_path):
        target_path = os.path.join(targets_dir, "standard.wav")

    return target_path


def apply_pedalboard_limiting(input_path: str, output_path: str, target_lufs: float = -14.0, true_peak_ceiling_db: float = -1.0):
    """Normalize loudness towards target_lufs and apply true-peak brickwall limiting."""
    logger.info(f"Applying Pedalboard Limiter targeting {target_lufs} LUFS / {true_peak_ceiling_db} dB True Peak...")

    # Read audio for loudness measurement
    data, sample_rate = sf.read(input_path)
    if data.ndim == 1:
        # Convert mono to stereo
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

    # Process through Pedalboard Limiter
    board = Pedalboard([
        HighpassFilter(cutoff_frequency_hz=30.0),
        Limiter(threshold_db=true_peak_ceiling_db, release_ms=100.0),
    ])

    # Pedalboard expects (channels, samples)
    audio_transposed = data.T.astype(np.float32)
    effected = board(audio_transposed, sample_rate)

    # Save final 24-bit PCM WAV
    sf.write(output_path, effected.T, sample_rate, subtype="PCM_24")
    logger.info(f"Limiting complete: saved to {output_path}")


def process_suno_enhancer(input_path: str, output_path: str):
    """Run AudioSR super-resolution followed by Pedalboard Glue Compression & High-Pass."""
    logger.info("Executing Suno Enhancer pipeline (AudioSR + Pedalboard Glue Compression)...")
    temp_sr_output = input_path.replace(".wav", "_sr.wav")

    try:
        model = get_audiosr_model()
        import audiosr
        # Super resolution to 48kHz studio quality
        audiosr.super_resolution(
            model,
            input_path,
            output_file=temp_sr_output,
            seed=42,
            guidance_scale=3.5,
            ddim_steps=50,
        )
        sr_source = temp_sr_output if os.path.exists(temp_sr_output) else input_path
    except Exception as err:
        logger.warning(f"AudioSR super_resolution fallback to direct DSP: {err}")
        sr_source = input_path

    # Apply Pedalboard Glue-Compression & Highpass
    with AudioFile(sr_source) as f:
        audio = f.read(f.frames)
        sr = f.samplerate

    board = Pedalboard([
        HighpassFilter(cutoff_frequency_hz=32.0),
        Compressor(threshold_db=-16.0, ratio=2.5, attack_ms=25.0, release_ms=120.0),
        Limiter(threshold_db=-1.0, release_ms=100.0),
    ])

    effected = board(audio, sr)

    # Save final 24-bit WAV
    with AudioFile(output_path, "w", sr, effected.shape[0], bit_depth=24) as f:
        f.write(effected)

    if os.path.exists(temp_sr_output):
        try:
            os.remove(temp_sr_output)
        except OSError:
            pass


def handler(event: dict) -> dict:
    """RunPod Serverless Handler entrypoint."""
    job_input = event.get("input", {})
    download_url = job_input.get("download_url")
    upload_url = job_input.get("upload_url")
    preset = job_input.get("preset", "standard")
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
        logger.info(f"Starting job {job_id} for preset: {preset}")

        # 1. Download source audio
        download_file(download_url, input_file)

        # 2. Branch according to preset
        if preset in ["suno_enhancer", "audiosr"]:
            process_suno_enhancer(input_file, final_output_file)
        elif preset in ["full", "ai_full", "full_chain"]:
            logger.info("Running AI Full Chain: AudioSR Enhancement -> Matchering -> Limiter...")
            sr_intermediate = os.path.join(temp_dir, "sr_intermediate.wav")
            temp_files.append(sr_intermediate)
            process_suno_enhancer(input_file, sr_intermediate)
            target_reference = resolve_target_file("standard")
            mg.process(
                target=sr_intermediate,
                reference=target_reference,
                results=[mg.pcm24(matchered_file)],
            )
            apply_pedalboard_limiting(
                input_path=matchered_file,
                output_path=final_output_file,
                target_lufs=-14.0,
                true_peak_ceiling_db=-1.0,
            )
        else:
            target_reference = resolve_target_file(preset)
            logger.info(f"Using matchering target reference: {target_reference}")

            # Run Matchering process
            mg.process(
                target=input_file,
                reference=target_reference,
                results=[mg.pcm24(matchered_file)],
            )

            # Apply Pedalboard Limiter (-14 LUFS / -1.0 dB True Peak)
            apply_pedalboard_limiting(
                input_path=matchered_file,
                output_path=final_output_file,
                target_lufs=-14.0,
                true_peak_ceiling_db=-1.0,
            )

        # 3. Upload final result directly to presigned PUT upload_url
        upload_file(upload_url, final_output_file)

        return {
            "status": "COMPLETED",
            "job_id": job_id,
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
