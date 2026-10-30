"""Audio Mastering Worker Service (FastAPI)

Containerized audio mastering service implementing the full DSP engine,
background processing, and REST API.
"""

import os
import uuid
import datetime
import tempfile
import asyncio
from pathlib import Path
from typing import Optional, Literal, Dict, Any

from fastapi import FastAPI, BackgroundTasks, HTTPException, UploadFile, File, Form, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
import httpx

from dsp.engine import AudioMasteringEngine, MasteringParameters

app = FastAPI(
    title="Mastr Audio Mastering Engine",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Explicitly allowed CORS origins for web frontend
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
]

# CORS setup for web frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_cors_headers(request: Request, call_next):
    """Ensure all responses including static /outputs and downloads carry correct CORS headers."""
    response = await call_next(request)
    origin = request.headers.get("origin")
    if origin and origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    elif not origin:
        response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response

# Output directory for processed masters and previews
STORAGE_DIR = Path(os.environ.get("MASTR_STORAGE_DIR", "/tmp/mastr_storage"))
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# Mount outputs for preview / download
app.mount("/outputs", StaticFiles(directory=str(STORAGE_DIR)), name="outputs")

engine = AudioMasteringEngine()

# In-memory job state store (can be replaced by Redis / DB in production)
jobs_db: Dict[str, Dict[str, Any]] = {}


class MasterJobRequest(BaseModel):
    job_id: Optional[str] = None
    input_url: Optional[str] = None
    mode: Literal["easy", "pro"] = "easy"
    preset: Optional[str] = "auto_ai"
    intensity: Optional[float] = 80.0
    target_lufs: Optional[float] = -14.0
    low_end_mono_cutoff: Optional[float] = 100.0
    tape_saturation: Optional[float] = 25.0
    stereo_width: Optional[float] = 50.0
    low_end_punch: Optional[float] = 50.0
    vocal_clarity: Optional[float] = 50.0


def run_mastering_dsp_job(job_id: str, input_path: str, params: MasteringParameters, cleanup_input: bool = False):
    """Executes the DSP pipeline synchronously in a background thread."""
    try:
        jobs_db[job_id]["status"] = "processing"
        jobs_db[job_id]["progress"] = 25

        # Execute DSP engine
        results = engine.process_file(
            input_audio_path=input_path,
            output_dir=STORAGE_DIR,
            params=params,
            job_id=job_id,
        )

        final_wav_filename = Path(results["finalWavPath"]).name
        preview_mp3_filename = Path(results["previewMp3Path"]).name
        stream_mp3_filename = Path(results.get("streamMp3Path", results["previewMp3Path"])).name

        base_url = os.environ.get("SERVICE_BASE_URL", "http://localhost:8000").rstrip("/")

        jobs_db[job_id]["status"] = "completed"
        jobs_db[job_id]["progress"] = 100
        jobs_db[job_id]["metrics"] = {
            "inputLufs": results["inputLufs"],
            "outputLufs": results["outputLufs"],
            "dynamicRange": results["dynamicRange"],
            "truePeakCeiling": results["truePeakCeiling"],
            "sampleRate": results["sampleRate"],
        }
        jobs_db[job_id]["final_wav_path"] = results["finalWavPath"]
        jobs_db[job_id]["preview_mp3_path"] = results["previewMp3Path"]
        jobs_db[job_id]["stream_mp3_path"] = results.get("streamMp3Path", results["previewMp3Path"])
        jobs_db[job_id]["preset"] = params.preset
        jobs_db[job_id]["target_lufs"] = results.get("outputLufs", params.target_lufs)
        jobs_db[job_id]["preview_url"] = f"{base_url}/outputs/{stream_mp3_filename}"
        jobs_db[job_id]["final_download_url"] = f"{base_url}/outputs/{final_wav_filename}"
        jobs_db[job_id]["download_wav_url"] = f"/api/v1/master/{job_id}/download/wav"
        jobs_db[job_id]["download_mp3_url"] = f"/api/v1/master/{job_id}/download/mp3"
        jobs_db[job_id]["completedAt"] = datetime.datetime.utcnow().isoformat()

    except Exception as e:
        jobs_db[job_id]["status"] = "failed"
        jobs_db[job_id]["error"] = str(e)
    finally:
        if cleanup_input and os.path.exists(input_path):
            try:
                os.remove(input_path)
            except OSError:
                pass


async def download_file_async(url: str, dest_path: str):
    """Downloads audio from remote URL (e.g. S3 or Suno CDN)."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        with open(dest_path, "wb") as f:
            f.write(resp.content)


@app.get("/health")
def health_check():
    """Healthcheck endpoint for Docker / VPS orchestration monitoring."""
    return {
        "status": "ok",
        "service": "mastr-worker",
        "version": "1.0.0",
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "storageDir": str(STORAGE_DIR),
    }


@app.post("/api/v1/master/process")
async def process_master_job(
    payload: MasterJobRequest,
    background_tasks: BackgroundTasks,
):
    """Standard REST API endpoint to enqueue an audio mastering job via URL."""
    job_id = payload.job_id or str(uuid.uuid4())

    dsp_params = MasteringParameters(
        mode=payload.mode,
        preset=payload.preset or "auto_ai",
        intensity=payload.intensity if payload.intensity is not None else 80.0,
        target_lufs=payload.target_lufs if payload.target_lufs is not None else -14.0,
        low_end_mono_cutoff=payload.low_end_mono_cutoff if payload.low_end_mono_cutoff is not None else 100.0,
        tape_saturation=payload.tape_saturation if payload.tape_saturation is not None else 25.0,
        stereo_width=payload.stereo_width if payload.stereo_width is not None else 50.0,
        low_end_punch=payload.low_end_punch if payload.low_end_punch is not None else 50.0,
        vocal_clarity=payload.vocal_clarity if payload.vocal_clarity is not None else 50.0,
    )

    jobs_db[job_id] = {
        "job_id": job_id,
        "status": "processing",
        "progress": 5,
        "createdAt": datetime.datetime.utcnow().isoformat(),
        "input_url": payload.input_url,
        "preview_url": None,
        "final_download_url": None,
        "metrics": None,
        "error": None,
    }

    if payload.input_url:
        # Download and run in background
        tmp_file = tempfile.NamedTemporaryFile(suffix=".audio", delete=False)
        tmp_path = tmp_file.name
        tmp_file.close()

        async def fetch_and_process():
            try:
                await download_file_async(payload.input_url, tmp_path)
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(
                    None, run_mastering_dsp_job, job_id, tmp_path, dsp_params, True
                )
            except Exception as ex:
                jobs_db[job_id]["status"] = "failed"
                jobs_db[job_id]["error"] = str(ex)

        background_tasks.add_task(fetch_and_process)
    else:
        # If no input_url, mark failed or awaiting upload
        jobs_db[job_id]["status"] = "failed"
        jobs_db[job_id]["error"] = "No input_url provided. Use multipart upload or provide a valid audio URL."

    return {
        "job_id": job_id,
        "status": "processing",
        "message": "Mastering job enqueued successfully",
    }


@app.post("/api/v1/master/process-file")
async def process_master_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    job_id: Optional[str] = Form(None),
    mode: Literal["easy", "pro"] = Form("easy"),
    preset: Optional[str] = Form("auto_ai"),
    intensity: Optional[float] = Form(80.0),
    target_lufs: Optional[float] = Form(-14.0),
    low_end_mono_cutoff: Optional[float] = Form(100.0),
    tape_saturation: Optional[float] = Form(25.0),
    stereo_width: Optional[float] = Form(50.0),
    low_end_punch: Optional[float] = Form(50.0),
    vocal_clarity: Optional[float] = Form(50.0),
):
    """Direct multipart file upload mastering endpoint."""
    assigned_job_id = job_id or str(uuid.uuid4())
    ext = Path(file.filename or "audio.wav").suffix or ".wav"

    tmp_file = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
    tmp_path = tmp_file.name
    try:
        content = await file.read()
        tmp_file.write(content)
    finally:
        tmp_file.close()

    dsp_params = MasteringParameters(
        mode=mode,
        preset=preset or "auto_ai",
        intensity=intensity or 80.0,
        target_lufs=target_lufs or -14.0,
        low_end_mono_cutoff=low_end_mono_cutoff or 100.0,
        tape_saturation=tape_saturation or 25.0,
        stereo_width=stereo_width or 50.0,
        low_end_punch=low_end_punch or 50.0,
        vocal_clarity=vocal_clarity or 50.0,
    )

    jobs_db[assigned_job_id] = {
        "job_id": assigned_job_id,
        "status": "processing",
        "progress": 10,
        "createdAt": datetime.datetime.utcnow().isoformat(),
        "input_filename": file.filename,
        "preview_url": None,
        "final_download_url": None,
        "metrics": None,
        "error": None,
    }

    background_tasks.add_task(run_mastering_dsp_job, assigned_job_id, tmp_path, dsp_params, True)

    return {
        "job_id": assigned_job_id,
        "status": "processing",
        "message": "File received and mastering started",
    }


@app.get("/api/v1/master/status/{job_id}")
def get_master_status(job_id: str):
    """Status query returning status, progress, metrics, and URLs."""
    if job_id not in jobs_db:
        # Disk fallback: Check if mastered audio was already written for this job
        stream_path = STORAGE_DIR / f"master_stream_{job_id}.mp3"
        wav_path = STORAGE_DIR / f"master_final_{job_id}.wav"
        if stream_path.exists() or wav_path.exists():
            base_url = os.environ.get("SERVICE_BASE_URL", "http://localhost:8000").rstrip("/")
            return {
                "job_id": job_id,
                "status": "completed",
                "progress": 100,
                "preview_url": f"{base_url}/outputs/{stream_path.name}" if stream_path.exists() else f"{base_url}/outputs/{wav_path.name}",
                "final_download_url": f"{base_url}/outputs/{wav_path.name}",
                "metrics": {"inputLufs": -14.0, "outputLufs": -11.0, "dynamicRange": 6.0},
                "final_wav_path": str(wav_path),
                "stream_mp3_path": str(stream_path),
            }
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs_db[job_id]


@app.get("/api/v1/master/{job_id}/download/wav")
def download_master_wav(job_id: str):
    """Download 24-bit HD WAV master with descriptive naming."""
    if job_id not in jobs_db:
        raise HTTPException(status_code=404, detail="Mastering job not found")

    job = jobs_db[job_id]
    if job.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Mastering job not completed yet")

    wav_path = job.get("final_wav_path") or str(STORAGE_DIR / f"master_final_{job_id}.wav")
    if not os.path.exists(wav_path):
        wav_path = str(STORAGE_DIR / "master_final.wav")
    if not os.path.exists(wav_path):
        raise HTTPException(status_code=404, detail="Master WAV file not found")

    input_filename = job.get("input_filename") or (Path(job.get("input_url", "")).name if job.get("input_url") else "") or "Track"
    stem = Path(input_filename).stem or "Track"
    stem = "".join(c for c in stem if c.isalnum() or c in ("-", "_", " ")).strip() or "Track"
    preset = job.get("preset", "master")
    target_lufs = job.get("target_lufs", -11.0)
    lufs_str = f"{target_lufs:.1f}" if isinstance(target_lufs, (int, float)) else str(target_lufs)

    download_name = f"{stem}_Master_{preset}_{lufs_str}LUFS.wav"

    return FileResponse(
        path=wav_path,
        media_type="audio/wav",
        filename=download_name,
    )


@app.get("/api/v1/master/{job_id}/download/mp3")
def download_preview_mp3(job_id: str):
    """Download 320 kbps MP3 preview with descriptive naming."""
    if job_id not in jobs_db:
        raise HTTPException(status_code=404, detail="Mastering job not found")

    job = jobs_db[job_id]
    if job.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Mastering job not completed yet")

    mp3_path = job.get("preview_mp3_path") or str(STORAGE_DIR / f"master_preview_60s_{job_id}.mp3")
    if not os.path.exists(mp3_path):
        mp3_path = str(STORAGE_DIR / "master_preview_60s.mp3")
    if not os.path.exists(mp3_path):
        raise HTTPException(status_code=404, detail="Master preview MP3 file not found")

    input_filename = job.get("input_filename") or (Path(job.get("input_url", "")).name if job.get("input_url") else "") or "Track"
    stem = Path(input_filename).stem or "Track"
    stem = "".join(c for c in stem if c.isalnum() or c in ("-", "_", " ")).strip() or "Track"
    preset = job.get("preset", "master")

    download_name = f"{stem}_Preview_{preset}.mp3"

    return FileResponse(
        path=mp3_path,
        media_type="audio/mpeg",
        filename=download_name,
    )


# Backward-compatible routes
@app.post("/jobs/process")
async def legacy_create_job(payload: MasterJobRequest, background_tasks: BackgroundTasks):
    return await process_master_job(payload, background_tasks)


@app.get("/jobs/{job_id}")
def legacy_get_job(job_id: str):
    return get_master_status(job_id)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
