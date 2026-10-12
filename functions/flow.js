const crypto = require("crypto");

const FLOW_BASE_URL = process.env.FLOW_BASE_URL || "https://www.flow.cl/api";
const PLAN_ID = "patitas-plus-mensual";

function sign(params, secretKey) {
  const keys = Object.keys(params).sort();
  const toSign = keys.map((k) => `${k}${params[k]}`).join("");
  return crypto.createHmac("sha256", secretKey).update(toSign).digest("hex");
}

function signedForm(params, apiKey, secretKey) {
  const full = { ...params, apiKey };
  return { ...full, s: sign(full, secretKey) };
}

async function flowPost(path, params, apiKey, secretKey) {
  const body = signedForm(params, apiKey, secretKey);
  const form = new URLSearchParams();
  Object.entries(body).forEach(([k, v]) => form.append(k, String(v)));
  const res = await fetch(`${FLOW_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Flow ${path} failed: ${JSON.stringify(data)}`);
  return data;
}

async function flowGet(path, params, apiKey, secretKey) {
  const body = signedForm(params, apiKey, secretKey);
  const qs = new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`${FLOW_BASE_URL}${path}?${qs.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(`Flow ${path} failed: ${JSON.stringify(data)}`);
  return data;
}

module.exports = { flowPost, flowGet, PLAN_ID, FLOW_BASE_URL };
