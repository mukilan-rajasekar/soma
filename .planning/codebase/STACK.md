# Technology Stack

**Analysis Date:** 2026-07-18

## Languages

**Primary:**
- Python 3.x - Backend pipeline, analysis, inference orchestration
- JavaScript - Static demo frontend (no framework, no build step)
- HTML5 / CSS3 - Demo UI and layout

**GPU Inference:**
- CUDA (Colab T4 or rented A100; user-managed installation per box)

## Runtime

**Environment:**
- Python: CPython 3.x via local venv (`.venv/`)
- Browser: Modern ES6+ capable browsers for demo (no transpilation)
- GPU boxes: Google Colab (free T4) or rented (RunPod/Lambda)

**Package Manager:**
- `pip` (Python)
- No npm/Node.js in the main repo (demo is vendored, zero dependencies)

## Frameworks

**Backend / Analysis:**
- No web framework (analysis runs as CLI scripts)
- NumPy - Numeric computation, array operations
- SciPy - Statistics (ranks, norm CDF/PPF), .mat file loading
- Pandas - Arc/annotation tables, CSV I/O
- Matplotlib - Forest plots in validation reports

**Brain Model:**
- TRIBE v2 (Meta, public, Algonauts-2025 winner) - Trimodal encoder (audio/video/text; text path disabled in config)
  - Accessed via: `model.from_pretrained("facebook/tribev2")` through HuggingFace
  - Downloads ~1 GB weights, cached to `./cache/`
  - Runs inference only; model weights never fine-tuned locally

**Frontend / Visualization:**
- Three.js r185 (vendored locally at `demo/vendor/three/`) - 3D cortex mesh, post-processing effects
  - EffectComposer with UnrealBloomPass for neon effect
  - Decorative only; not connected to prediction data
- GSAP + ScrollTrigger (vendored at `demo/vendor/gsap/`) - Timeline and scroll-driven animations
- Lenis (vendored at `demo/vendor/lenis/`) - Smooth scroll library
- Custom vanilla JavaScript (`app.js`, `brain3d.js`, `scrollbrain.js`) - Demo logic, arc rendering, data binding

**Data Processing:**
- OpenCV (opencv-python-headless) - Per-second luminance, cuts, motion extraction (baseline)
- nilearn - Destrieux fsaverage5 atlas → ROI masks for DMN, DAN, valence, arousal
- imageio-ffmpeg - Audio loudness extraction, synthetic mp4 muxing

## Key Dependencies

**Critical — GPU Stack:**
- `numpy>=1.26,<2.1` - **Hard pinned.** TRIBE / neuralset compiled stack breaks on numpy≥2.1
- `torch` - CUDA build; installed per the GPU box's CUDA version
- `tribev2` (commented out, installed from HuggingFace sources on GPU boxes)
- `neuralset` - Event extraction/standardization for TRIBE pipeline
- `huggingface_hub` - Pulls gated `facebook/tribev2` weights (~1 GB)
- `transformers` (optional) - Trimodal text/LLaMA path (disabled in current config)

**Critical — CPU/Analysis Stack (this venv):**
- `numpy>=1.26,<2.1` - Same constraint as GPU stack for compatibility
- `scipy` - Stats: ranks, norm cdf/ppf, `.mat` file loading
- `pandas` - Arc/annotation tables
- `matplotlib` - Forest plot generation
- `nilearn` - FSAverage5 atlas and ROI mask building
- `opencv-python-headless` - Audiovisual baseline features
- `imageio-ffmpeg` - Audio loudness, mp4 muxing

**Infrastructure:**
- Supabase Python client - Not explicitly in requirements.txt; uses urllib directly
- Stdlib only for publishing (`urllib`, `json`, `base64`, `zlib`) — no external deps on Python side for Supabase integration

## Configuration

**Environment:**
- `.env.local` (demo/) - Vercel deployment token (never committed, Vercel CLI auto-creates)
- `.venv/` - Python virtual environment (gitignored)

**Python Config:**
- `requirements.txt` - Declares two independent groups (GPU vs CPU) to avoid resolver conflicts
  - Group A: GPU/inference (torch, tribev2, neuralset, huggingface_hub)
  - Group B: CPU/analysis (scipy, pandas, matplotlib, nilearn, opencv, imageio-ffmpeg)
  - Install in separate .venv instances; the main `.venv/` in repo uses Group B

**JavaScript Config:**
- No build tooling, no minification (files served as-is)
- `demo/supabase-config.js` - Supabase project URL + anon key (hardcoded, safe to commit via RLS)
- `demo/vendor/` - All JS libraries vendored locally; no CDN at runtime

**Frontend Deployment:**
- Vercel project config at `demo/.vercel/project.json`
- Framework: null (static hosting)
- Node version: 24.x (not used for build; just for deployment environment)
- No buildCommand, installCommand, or devCommand

## Build & Development

**Local Development:**
- No build step for frontend (static HTML + vendored JS)
- Python analysis runs directly: `python script.py`
- Mock HTTP server for demo: `python -m http.server 8000` from `demo/`

**Testing:**
- `make test` - Generates synthetic fixtures, runs full pipeline end-to-end
- Synthetic data: no GPU required, planted signal for validation

**Deployment:**
- **Demo:** Automatic deploy to Vercel on push to `main` (static site, ~5 sec)
- **GPU Inference:** User manages (Colab T4 free tier or rented A100); Colab notebook at `colab_run.ipynb`
- **Results Publishing:** `publish_to_supabase.py` reads `SUPABASE_SERVICE_ROLE_KEY` env var, posts arcs to database (server-side only)

## Platform Requirements

**Development:**
- Python 3.6+ (tested 3.8+)
- macOS / Linux / Windows (no platform-specific code in analysis)
- FFmpeg (for trim/encode): `brew install ffmpeg` (macOS) or `apt-get install ffmpeg-headless`
- Git (for repo)

**Prediction (GPU):**
- Google Colab (free T4) **or** rented A100 (RunPod/Lambda, ~$1–2/hr)
- CUDA 11.8+ and cuDNN 8.6+ (auto-installed in Colab)
- HuggingFace access token (gated model: `facebook/tribev2`)
- ~1 GB disk for model cache (`./cache/`)

**Demo Deployment:**
- Vercel (free tier)
- Static hosting; no runtime dependencies

---

*Stack analysis: 2026-07-18*
