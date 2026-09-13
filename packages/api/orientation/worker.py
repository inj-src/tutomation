#!/usr/bin/env python3
"""Persistent JSON-lines worker for PaddleOCR document orientation classification."""

import contextlib
import json
import re
import sys


def first(value, default=None):
    if hasattr(value, "tolist"):
        value = value.tolist()
    while isinstance(value, (list, tuple)):
        if not value:
            return default
        value = value[0]
    return value if value is not None else default


def result_payload(result):
    value = getattr(result, "json", {})
    if callable(value):
        value = value()
    if isinstance(value, dict) and isinstance(value.get("res"), dict):
        value = value["res"]
    return value if isinstance(value, dict) else {}


def classify(model, paths):
    with contextlib.redirect_stdout(sys.stderr):
        results = list(model.predict(paths, batch_size=len(paths)))
    output = []
    for result in results:
        value = result_payload(result)
        label = first(value.get("label_names"), "0")
        match = re.search(r"(0|90|180|270)", str(label))
        angle = int(match.group(1)) if match else 0
        score = first(value.get("scores"), None)
        output.append(
            {
                "angle": angle,
                "confidence": float(score) if score is not None else None,
            }
        )
    if len(output) != len(paths):
        raise RuntimeError("PaddleOCR returned an invalid result count.")
    return output


def main():
    with contextlib.redirect_stdout(sys.stderr):
        from paddleocr import DocImgOrientationClassification

        model = DocImgOrientationClassification(
            model_name="PP-LCNet_x1_0_doc_ori",
            device="cpu",
            engine="paddle_static",
        )
    print(json.dumps({"ready": True}), flush=True)

    for line in sys.stdin:
        request = {}
        try:
            request = json.loads(line)
            results = classify(model, request["paths"])
            print(json.dumps({"id": request["id"], "results": results}), flush=True)
        except Exception as error:
            print(
                json.dumps(
                    {"id": request.get("id", 0), "error": str(error)}
                ),
                flush=True,
            )


if __name__ == "__main__":
    main()
