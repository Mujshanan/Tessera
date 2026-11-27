"""JSON in on stdin; one JSON result on stdout."""
import json
import sys
import numpy as np

payload = json.load(sys.stdin)
samples = max(2, min(int(payload.get("samples", 80)), 1000))
amplitude = float(payload.get("amplitude", 2.0))
x = np.linspace(0.0, 2.0 * np.pi, samples)
y = amplitude * np.sin(x)
print(json.dumps({
    "label": "NumPy sine wave",
    "x": x.tolist(),
    "y": y.tolist(),
    "metadata": {"samples": samples, "amplitude": amplitude}
}))
