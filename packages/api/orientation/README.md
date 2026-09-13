# Local image orientation worker

The API starts `worker.py` once and keeps the PaddleOCR model warm. It classifies
all pages in one request, then Node uses Sharp to rotate the actual image pixels.

From the repository root, install the optional local runtime:

```sh
python3 -m venv packages/api/orientation/.venv
packages/api/orientation/.venv/bin/pip install -r packages/api/orientation/requirements.txt
```

The server automatically uses `orientation/.venv/bin/python` when it exists.
Start it normally:

```sh
pnpm --filter server dev
```

`PADDLEOCR_PYTHON` can still override the interpreter when deploying elsewhere.

The model is `PP-LCNet_x1_0_doc_ori`. It supports 0, 90, 180, and 270 degree
document orientations. If the optional runtime is not installed, captures still
work and retain the original orientation; the API logs one warning.
