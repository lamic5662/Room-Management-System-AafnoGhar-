#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BASE_URL="${BASE_URL:-http://localhost:5001}"

# Load server/.env if present (for local runs)
if [ -f "$ROOT_DIR/server/.env" ]; then
  export $(grep -v '^#' "$ROOT_DIR/server/.env" | xargs) || true
fi

echo "Running cleanup..."
node "$ROOT_DIR/server/src/scripts/cleanupTestData.js" >/dev/null

echo "Register owner..."
curl -s -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Test Owner","email":"owner1@test.com","phone":"9800000001","role":"owner","password":"pass1234"}' >/dev/null

echo "Register tenant..."
curl -s -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Test Tenant","email":"tenant1@test.com","phone":"9800000002","role":"tenant","password":"pass1234"}' >/dev/null

echo "Register admin..."
curl -s -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Admin User","email":"admin@test.com","phone":"9800000099","role":"owner","password":"pass1234"}' >/dev/null || true

echo "Promote admin..."
(cd "$ROOT_DIR/server" && node src/scripts/makeAdmin.js >/dev/null)

OWNER_TOKEN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"emailOrPhone":"owner1@test.com","password":"pass1234"}' | node -p "JSON.parse(fs.readFileSync(0,'utf8')).token")

TENANT_TOKEN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"emailOrPhone":"tenant1@test.com","password":"pass1234"}' | node -p "JSON.parse(fs.readFileSync(0,'utf8')).token")

TENANT_ID=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"emailOrPhone":"tenant1@test.com","password":"pass1234"}' | node -p "JSON.parse(fs.readFileSync(0,'utf8')).user.id")

ADMIN_TOKEN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"emailOrPhone":"admin@test.com","password":"pass1234"}' | node -p "JSON.parse(fs.readFileSync(0,'utf8')).token")

echo "Create room..."
ROOM_ID=$(curl -s -X POST "$BASE_URL/api/rooms" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Room","location":"Kathmandu","monthlyRent":12000,"rooms":1,"bathrooms":1,"description":"Nice room","facilities":{"wifi":true}}' | node -p "JSON.parse(fs.readFileSync(0,'utf8')).room._id")

echo "Submit KYC (owner)..."
TMP_PDF="$(mktemp)"
printf '%s' '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n' > "$TMP_PDF"
curl -s -X POST "$BASE_URL/api/kyc/submit" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -F "docType=citizenship" \
  -F "front=@$TMP_PDF;type=application/pdf" >/dev/null
rm -f "$TMP_PDF"

echo "Submit KYC (tenant)..."
TMP_PDF_T="$(mktemp)"
printf '%s' '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n' > "$TMP_PDF_T"
curl -s -X POST "$BASE_URL/api/kyc/submit" \
  -H "Authorization: Bearer $TENANT_TOKEN" \
  -F "docType=college_id" \
  -F "front=@$TMP_PDF_T;type=application/pdf" >/dev/null
rm -f "$TMP_PDF_T"

echo "Approve KYC (admin)..."
OWNER_ID=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"emailOrPhone":"owner1@test.com","password":"pass1234"}' | node -p "JSON.parse(fs.readFileSync(0,'utf8')).user.id")

curl -s -X PATCH "$BASE_URL/api/kyc/$OWNER_ID/approve" \
  -H "Authorization: Bearer $ADMIN_TOKEN" >/dev/null

curl -s -X PATCH "$BASE_URL/api/kyc/$TENANT_ID/approve" \
  -H "Authorization: Bearer $ADMIN_TOKEN" >/dev/null

echo "Publish room..."
curl -s -X PATCH "$BASE_URL/api/rooms/$ROOM_ID/publish" \
  -H "Authorization: Bearer $OWNER_TOKEN" >/dev/null

echo "Tenant request..."
REQUEST_ID=$(curl -s -X POST "$BASE_URL/api/requests" \
  -H "Authorization: Bearer $TENANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"roomId\":\"$ROOM_ID\",\"message\":\"Interested\"}" | node -p "JSON.parse(fs.readFileSync(0,'utf8')).request._id")

echo "Owner approves request..."
curl -s -X PATCH "$BASE_URL/api/requests/$REQUEST_ID/status" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"approved"}' >/dev/null

echo "Create agreement..."
AGREEMENT_ID=$(curl -s -X POST "$BASE_URL/api/agreements/from-request/$REQUEST_ID" \
  -H "Authorization: Bearer $OWNER_TOKEN" | node -p "JSON.parse(fs.readFileSync(0,'utf8')).agreement._id")

echo "eSewa init (no redirect)..."
ESEWA_INIT=$(curl -s -X POST "$BASE_URL/api/esewa/init" \
  -H "Authorization: Bearer $TENANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"agreementId\":\"$AGREEMENT_ID\",\"period\":\"2026-02\",\"amount\":12000}")

ESEWA_PAYMENT_ID=$(echo "$ESEWA_INIT" | node -p "const d=JSON.parse(fs.readFileSync(0,'utf8')); d.paymentId||''")
ESEWA_UUID=$(echo "$ESEWA_INIT" | node -p "const d=JSON.parse(fs.readFileSync(0,'utf8')); d.form&&d.form.transaction_uuid||''")
ESEWA_PRODUCT=$(echo "$ESEWA_INIT" | node -p "const d=JSON.parse(fs.readFileSync(0,'utf8')); d.form&&d.form.product_code||''")
ESEWA_TOTAL=$(echo "$ESEWA_INIT" | node -p "const d=JSON.parse(fs.readFileSync(0,'utf8')); d.form&&d.form.total_amount||''")

if [ -z "$ESEWA_PAYMENT_ID" ] || [ -z "$ESEWA_UUID" ]; then
  echo "eSewa init failed: $ESEWA_INIT"
  exit 1
fi

if [ "${ESEWA_SKIP_STATUS:-0}" = "1" ]; then
  echo "eSewa verify (mock)..."
  ESEWA_DATA=$(ESEWA_TOTAL="$ESEWA_TOTAL" ESEWA_UUID="$ESEWA_UUID" ESEWA_PRODUCT="$ESEWA_PRODUCT" ESEWA_SECRET_KEY="$ESEWA_SECRET_KEY" node - <<'NODE'
const crypto = require("crypto");
const payload = {
  total_amount: process.env.ESEWA_TOTAL,
  transaction_uuid: process.env.ESEWA_UUID,
  product_code: process.env.ESEWA_PRODUCT,
};
payload.signed_field_names = "total_amount,transaction_uuid,product_code";
const msg = payload.signed_field_names.split(",").map(k => `${k}=${payload[k]}`).join(",");
payload.signature = crypto.createHmac("sha256", process.env.ESEWA_SECRET_KEY).update(msg).digest("base64");
payload.transaction_code = "TESTTXN";
console.log(Buffer.from(JSON.stringify(payload)).toString("base64"));
NODE
)

  curl -s -X POST "$BASE_URL/api/esewa/verify" \
    -H "Authorization: Bearer $TENANT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"paymentId\":\"$ESEWA_PAYMENT_ID\",\"data\":\"$ESEWA_DATA\"}" >/dev/null
else
  echo "eSewa verify skipped (set ESEWA_SKIP_STATUS=1 on server)"
fi

echo "Upload room photo..."
TMP_PNG="$(mktemp)"
python3 - "$TMP_PNG" <<'PY'
import base64, sys
# 50x50 red PNG
png = b'iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAIAAACRXR/mAAAAK0lEQVR4nO3OQQ0AMAgAsG0/6S2YBq2H0qS8q7oAANb2A0X+0U8Gm7sGAAAAAElFTkSuQmCC'
open(sys.argv[1], 'wb').write(base64.b64decode(png))
PY
curl -s -X POST "$BASE_URL/api/rooms/$ROOM_ID/photos" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -F "photos=@$TMP_PNG;filename=smoke.png;type=image/png" >/dev/null
rm -f "$TMP_PNG"

echo "Verify room photo stored..."
ROOM_JSON=$(curl -s "$BASE_URL/api/rooms/$ROOM_ID")
PHOTO_PATH=$(echo "$ROOM_JSON" | node -p "const d=JSON.parse(fs.readFileSync(0,'utf8')); (d.room && d.room.photos && d.room.photos[0]) || ''")
if [ -z "$PHOTO_PATH" ]; then
  echo "Photo upload check failed: no photo in room response"
  exit 1
fi

echo "Create rule (owner)..."
RULE_ID=$(curl -s -X POST "$BASE_URL/api/rules" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"roomId\":\"$ROOM_ID\",\"title\":\"No loud music\",\"description\":\"Keep noise low after 10pm\",\"severity\":\"important\"}" | node -p "JSON.parse(fs.readFileSync(0,'utf8')).rule._id")

echo "Tenant views rules..."
curl -s "$BASE_URL/api/rules/tenant/agreement/$AGREEMENT_ID" \
  -H "Authorization: Bearer $TENANT_TOKEN" >/dev/null

echo "Tenant creates payment..."
PAYMENT_ID=$(curl -s -X POST "$BASE_URL/api/payments" \
  -H "Authorization: Bearer $TENANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"agreementId\":\"$AGREEMENT_ID\",\"period\":\"2026-01\",\"amount\":12000,\"method\":\"cash\",\"note\":\"smoke\"}" | node -p "JSON.parse(fs.readFileSync(0,'utf8')).payment._id")

echo "Owner confirms payment..."
curl -s -X PATCH "$BASE_URL/api/payments/$PAYMENT_ID/status" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"confirmed"}' >/dev/null

echo "Tenant complaint (legacy message)..."
curl -s -X POST "$BASE_URL/api/complaints" \
  -H "Authorization: Bearer $TENANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"agreementId\":\"$AGREEMENT_ID\",\"message\":\"Legacy complaint\"}" >/dev/null

echo "Tenant exit request..."
EXIT_ID=$(curl -s -X POST "$BASE_URL/api/exits" \
  -H "Authorization: Bearer $TENANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"agreementId\":\"$AGREEMENT_ID\",\"moveOutDate\":\"2026-03-01\",\"reason\":\"Moving\"}" | node -p "JSON.parse(fs.readFileSync(0,'utf8')).exitRequest._id")

echo "Owner approves exit..."
curl -s -X PATCH "$BASE_URL/api/exits/$EXIT_ID/approve" \
  -H "Authorization: Bearer $OWNER_TOKEN" >/dev/null

echo "Owner settles exit..."
curl -s -X PATCH "$BASE_URL/api/exits/$EXIT_ID/settle" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"unpaidRent":0,"damagesCost":0,"otherDeductions":0,"ownerNote":"All good"}' >/dev/null

echo "Offer flow (tenant -> owner -> agreement)..."
ROOM_ID2=$(curl -s -X POST "$BASE_URL/api/rooms" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Offer Room","location":"Lalitpur","monthlyRent":15000,"rooms":1,"bathrooms":1,"description":"Offer room","facilities":{"wifi":true}}' | node -p "JSON.parse(fs.readFileSync(0,'utf8')).room._id")

curl -s -X PATCH "$BASE_URL/api/rooms/$ROOM_ID2/publish" \
  -H "Authorization: Bearer $OWNER_TOKEN" >/dev/null

OFFER_ID=$(curl -s -X POST "$BASE_URL/api/offers" \
  -H "Authorization: Bearer $TENANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"roomId\":\"$ROOM_ID2\",\"offeredRent\":14000,\"message\":\"Can you do 14k?\"}" | node -p "JSON.parse(fs.readFileSync(0,'utf8')).offer._id")

curl -s -X PATCH "$BASE_URL/api/offers/$OFFER_ID/accept" \
  -H "Authorization: Bearer $OWNER_TOKEN" >/dev/null

AGREE_OFFER_ID=$(curl -s -X POST "$BASE_URL/api/offers/$OFFER_ID/create-agreement" \
  -H "Authorization: Bearer $OWNER_TOKEN" | node -p "JSON.parse(fs.readFileSync(0,'utf8')).agreement._id")

echo "List agreements (owner/tenant)..."
curl -s "$BASE_URL/api/agreements/owner" -H "Authorization: Bearer $OWNER_TOKEN" >/dev/null
curl -s "$BASE_URL/api/agreements/tenant" -H "Authorization: Bearer $TENANT_TOKEN" >/dev/null

echo "Fraud flags + admin unflag..."
ROOM_ID3=$(curl -s -X POST "$BASE_URL/api/rooms" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Suspicious Room","location":"Kathmandu","monthlyRent":200,"rooms":1,"bathrooms":1,"description":"Cheap","facilities":{"wifi":false}}' | node -p "JSON.parse(fs.readFileSync(0,'utf8')).room._id")

FLAGGED_ID=$(curl -s "$BASE_URL/api/fraud/rooms/flagged" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | node -p "const r=JSON.parse(fs.readFileSync(0,'utf8')); (r.rooms && r.rooms[0] && r.rooms[0]._id) || ''")

if [ -n "$FLAGGED_ID" ]; then
  curl -s -X PATCH "$BASE_URL/api/fraud/rooms/$FLAGGED_ID/unflag" \
    -H "Authorization: Bearer $ADMIN_TOKEN" >/dev/null
fi

echo "ML price predict..."
curl -s -X POST "$BASE_URL/api/ml/price-predict" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"city":"Kathmandu","area":"Boudha","roomType":"1BHK","bedrooms":1,"bathrooms":1,"sizeSqft":450,"furnished":1,"wifi":1,"parking":0,"water":1,"electricityBackup":0}' >/dev/null

echo "Smoke test OK ✅"
