"""Test script for audio master download endpoints."""
import os
import tempfile
from fastapi.testclient import TestClient

from main import app, jobs_db, STORAGE_DIR

client = TestClient(app)

def test_downloads():
    print(">>> TESTING MASTER DOWNLOAD ENDPOINTS <<<")

    # 1. Test 404 for unknown job
    res_wav_404 = client.get("/api/v1/master/non_existent_job/download/wav")
    assert res_wav_404.status_code == 404, f"Expected 404, got {res_wav_404.status_code}"
    print("[OK] 404 handled properly for unknown WAV job")

    res_mp3_404 = client.get("/api/v1/master/non_existent_job/download/mp3")
    assert res_mp3_404.status_code == 404, f"Expected 404, got {res_mp3_404.status_code}"
    print("[OK] 404 handled properly for unknown MP3 job")

    # 2. Mock a completed job with dummy WAV and MP3 files
    job_id = "test_job_123"
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    wav_path = STORAGE_DIR / f"master_final_{job_id}.wav"
    mp3_path = STORAGE_DIR / f"master_preview_60s_{job_id}.mp3"

    with open(wav_path, "wb") as f:
        f.write(b"RIFF dummy 24-bit wav header and samples")

    with open(mp3_path, "wb") as f:
        f.write(b"ID3 dummy mp3 frames")

    jobs_db[job_id] = {
        "job_id": job_id,
        "status": "completed",
        "progress": 100,
        "input_filename": "deep_groove_mix.wav",
        "preset": "groove_soul",
        "target_lufs": -11.0,
        "final_wav_path": str(wav_path),
        "preview_mp3_path": str(mp3_path),
    }

    try:
        # 3. Test WAV download endpoint
        res_wav = client.get(f"/api/v1/master/{job_id}/download/wav")
        assert res_wav.status_code == 200, f"Expected 200, got {res_wav.status_code}"
        assert "audio/wav" in res_wav.headers.get("content-type", "")
        content_disp = res_wav.headers.get("content-disposition", "")
        print(f"[OK] WAV Content-Disposition: {content_disp}")
        assert 'deep_groove_mix_Master_groove_soul_-11.0LUFS.wav' in content_disp

        # 4. Test MP3 download endpoint
        res_mp3 = client.get(f"/api/v1/master/{job_id}/download/mp3")
        assert res_mp3.status_code == 200, f"Expected 200, got {res_mp3.status_code}"
        assert "audio/mpeg" in res_mp3.headers.get("content-type", "")
        content_disp_mp3 = res_mp3.headers.get("content-disposition", "")
        print(f"[OK] MP3 Content-Disposition: {content_disp_mp3}")
        assert 'deep_groove_mix_Preview_groove_soul.mp3' in content_disp_mp3

        print(">>> ALL DOWNLOAD ENDPOINT TESTS PASSED! <<<")
    finally:
        if wav_path.exists():
            wav_path.unlink()
        if mp3_path.exists():
            mp3_path.unlink()
        if job_id in jobs_db:
            del jobs_db[job_id]

if __name__ == "__main__":
    test_downloads()
