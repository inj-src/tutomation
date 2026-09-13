# Dedoc orientation service

This package runs Dedoc's EfficientNet-B0 document orientation classifier as a
small local HTTP service. It classifies each image as `0`, `90`, `180`, or
`270` degrees and does not run Dedoc's full OCR/document parsing pipeline.

The project-local CPU runtime is installed with:

```bash
python3 -m venv .dedoc-orientation/venv
.dedoc-orientation/venv/bin/python -m pip install \
  --index-url https://download.pytorch.org/whl/cpu \
  torch==2.7.1+cpu torchvision==0.22.1+cpu
.dedoc-orientation/venv/bin/python -m pip install pillow==11.3.0
```

The checkpoint is stored outside the repository at
`/home/inj-src/.dedoc-orientation/models/scan_orientation_efficient_net_b0.pth`.
Override this location with `DEDOC_ORIENTATION_MODEL`.

The service listens on `127.0.0.1:9380` by default. Override the launcher with
`DEDOC_ORIENTATION_RUNTIME`, `DEDOC_ORIENTATION_HOST`, or
`DEDOC_ORIENTATION_PORT`.
