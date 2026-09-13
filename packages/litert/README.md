# LiteRT-LM development service

This package owns the local LiteRT-LM server used for image orientation. The
root `pnpm dev` command starts it alongside the API and web app.

The project-local runtime is installed with:

```bash
python3 -m venv .litert-lm/venv
.litert-lm/venv/bin/python -m pip install litert-lm==0.17.0
```

Import the model once:

```bash
.litert-lm/venv/bin/litert-lm import \
  --from-huggingface-repo=litert-community/gemma-4-E2B-it-litert-lm \
  gemma-4-E2B-it.litertlm gemma-4-E2B-it
```

The server listens on `127.0.0.1:9379` by default. Set `LITERT_RUNTIME`,
`LITERT_HOST`, or `LITERT_PORT` to override the launcher settings.
