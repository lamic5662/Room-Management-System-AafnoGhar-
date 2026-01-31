import sys
import json
import joblib
import pandas as pd
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "model.joblib"

if len(sys.argv) < 2:
    raise ValueError("Missing payload JSON argument")

payload = json.loads(sys.argv[1])

bundle = joblib.load(MODEL_PATH)
pipe = bundle["pipe"]
mae = bundle["mae"]

df = pd.DataFrame([payload])
pred = float(pipe.predict(df)[0])

low = max(0, pred - mae * 1.5)
high = pred + mae * 1.5

if mae <= 1000:
    confidence = "high"
elif mae <= 2500:
    confidence = "medium"
else:
    confidence = "low"

out = {
    "predicted": round(pred),
    "low": round(low),
    "high": round(high),
    "confidence": confidence,
    "mae": round(mae, 2)
}

print(json.dumps(out))
