import crypto from "crypto";

function buildSignedMessage(payload, signedFieldNames) {
  return signedFieldNames
    .split(",")
    .map((k) => `${k}=${payload[k]}`)
    .join(",");
}

function generateEsewaSignature(payload, signedFieldNames, secretKey) {
  const message = buildSignedMessage(payload, signedFieldNames);
  const hmac = crypto.createHmac("sha256", secretKey);
  hmac.update(message);
  return hmac.digest("base64");
}

export { buildSignedMessage, generateEsewaSignature };
