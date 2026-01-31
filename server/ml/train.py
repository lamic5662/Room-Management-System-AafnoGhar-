import json
import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from sklearn.impute import SimpleImputer
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "rooms.json"
MODEL_PATH = BASE_DIR / "model.joblib"

if not DATA_PATH.exists():
    raise FileNotFoundError(f"Missing data file: {DATA_PATH}")

df = pd.read_json(DATA_PATH)

y = df["monthlyRent"].astype(float)

feature_cols = [
    "city", "area", "roomType",
    "bedrooms", "bathrooms", "sizeSqft",
    "furnished", "wifi", "parking", "water", "electricityBackup"
]
X = df[feature_cols].copy()

cat_cols = ["city", "area", "roomType"]
num_cols = ["bedrooms", "bathrooms", "sizeSqft", "furnished", "wifi", "parking", "water", "electricityBackup"]
bool_cols = []

# Convert boolean flags to int for sklearn imputers
for c in ["furnished", "wifi", "parking", "water", "electricityBackup"]:
    if c in X.columns:
        X[c] = X[c].astype(int)

categorical = Pipeline(steps=[
    ("imputer", SimpleImputer(strategy="most_frequent")),
    ("onehot", OneHotEncoder(handle_unknown="ignore"))
])

numeric = Pipeline(steps=[
    ("imputer", SimpleImputer(strategy="median"))
])

preprocess = ColumnTransformer(
    transformers=[
        ("cat", categorical, cat_cols),
        ("num", numeric, num_cols),
    ]
)

model = RandomForestRegressor(
    n_estimators=400,
    random_state=42,
    n_jobs=-1
)

pipe = Pipeline(steps=[("prep", preprocess), ("model", model)])

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

pipe.fit(X_train, y_train)

pred = pipe.predict(X_test)
mae = mean_absolute_error(y_test, pred)

joblib.dump({"pipe": pipe, "mae": float(mae)}, MODEL_PATH)

print("✅ Model trained.")
print("MAE:", mae)
print("Saved:", MODEL_PATH)
