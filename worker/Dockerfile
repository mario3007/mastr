# Base PyTorch image with CUDA 12.1 and cuDNN 8
FROM pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    ffmpeg \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Pre-download AudioSR model weights during Docker build to minimize RunPod cold start latency
RUN python -c "from audiosr import build_model; build_model(model_name='basic')"

# Copy worker application code and target curves
COPY . /app

# Start the RunPod serverless worker handler
CMD ["python", "-u", "handler.py"]
