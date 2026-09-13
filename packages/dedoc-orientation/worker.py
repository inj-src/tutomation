#!/usr/bin/env python3
"""HTTP service for Dedoc's four-way document orientation classifier."""

import argparse
import json
import logging
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock

import torch
from PIL import Image
from torch import nn
from torchvision import models, transforms


class ClassificationModel(nn.Module):
    """The six-class EfficientNet wrapper used when Dedoc saved the checkpoint."""

    def __init__(self):
        super().__init__()
        self.efficientnet_b0 = models.efficientnet_b0(weights=None)
        self.efficientnet_b0.classifier[1] = nn.Linear(1280, 6)

    def forward(self, inputs):
        return self.efficientnet_b0(inputs)


class OrientationClassifier:
    """The same EfficientNet-B0 architecture and preprocessing used by Dedoc."""

    def __init__(self, checkpoint_path: Path):
        self.device = torch.device("cpu")
        self.transform = transforms.Compose(
            [
                transforms.Lambda(self._resize_to_square),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5]),
            ]
        )
        self.model = ClassificationModel()
        state = torch.load(
            checkpoint_path, map_location=self.device, weights_only=True
        )
        self.model.load_state_dict(state)
        self.model.to(self.device)
        self.model.eval()

    @staticmethod
    def _resize_to_square(image: Image.Image) -> Image.Image:
        max_dimension = max(image.size)
        resized = transforms.functional.resize(
            image,
            [
                round(image.height / max_dimension * 1200),
                round(image.width / max_dimension * 1200),
            ],
        )
        square = Image.new("RGB", (1200, 1200), (255, 255, 255))
        square.paste(resized)
        return square

    def classify(self, paths: list[str]) -> list[dict]:
        images = [self.transform(Image.open(path).convert("RGB")) for path in paths]
        batch = torch.stack(images).to(self.device)
        with torch.inference_mode():
            outputs = self.model(batch)
            probabilities = torch.softmax(outputs[:, 2:], dim=1)
            scores, predictions = torch.max(probabilities, dim=1)
        angles = [0, 90, 180, 270]
        return [
            {
                "angle": angles[int(prediction)],
                "confidence": float(score),
                "source": "dedoc",
            }
            for prediction, score in zip(predictions, scores)
        ]


class Handler(BaseHTTPRequestHandler):
    classifier: OrientationClassifier
    inference_lock = Lock()

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa: N802
        if self.path == "/health":
            self._send_json(
                200,
                {
                    "status": "ok",
                    "model": "dedoc/scan_orientation_efficient_net_b0",
                },
            )
            return
        self._send_json(404, {"error": "Not found"})

    def do_POST(self):  # noqa: N802
        if self.path != "/classify":
            self._send_json(404, {"error": "Not found"})
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            request = json.loads(self.rfile.read(content_length))
            paths = request.get("paths")
            if not isinstance(paths, list) or not paths or not all(
                isinstance(path, str) and path for path in paths
            ):
                raise ValueError("paths must be a non-empty list of file paths")
            if len(paths) > 64:
                raise ValueError("at most 64 images can be classified per request")
            with self.inference_lock:
                results = self.classifier.classify(paths)
            self._send_json(200, {"results": results})
        except (OSError, ValueError, json.JSONDecodeError) as error:
            self._send_json(400, {"error": str(error)})
        except Exception as error:  # keep one bad request from killing the service
            logging.exception("Orientation classification failed")
            self._send_json(500, {"error": str(error)})

    def log_message(self, format, *args):
        logging.info("%s - %s", self.address_string(), format % args)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=9380)
    parser.add_argument("--model", required=True)
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
    )
    Handler.classifier = OrientationClassifier(Path(args.model))
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    logging.info(
        "Dedoc orientation server listening on http://%s:%s", args.host, args.port
    )
    try:
        server.serve_forever()
    finally:
        server.server_close()
        logging.info("Dedoc orientation server stopped")


if __name__ == "__main__":
    main()
