```
npm install
npm run dev
```

```
open http://localhost:3000
```

Image orientation uses a separate warm Dedoc EfficientNet-B0 service. The
root `pnpm dev` command starts it through the `dedoc-orientation` workspace
package and forwards shutdown signals to it.

The API defaults to `http://127.0.0.1:9380`. Override this with
`ORIENTATION_BASE_URL` and the request timeout with `ORIENTATION_TIMEOUT_MS`.
