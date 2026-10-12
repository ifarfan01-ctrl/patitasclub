const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { flowPost, flowGet } = require("./flow");

initializeApp();
const db = getFirestore();

const FLOW_API_KEY = defineSecret("FLOW_API_KEY");
const FLOW_SECRET_KEY = defineSecret("FLOW_SECRET_KEY");

const APP_URL = "https://patitasclub.untalivan.cl";
const FUNCTIONS_URL = "https://us-central1-patitasclub.cloudfunctions.net";

const PLUS_AMOUNT = 2990;
const PLUS_CURRENCY = "CLP";
const PLUS_DAYS = 30;

// Patitas Plus se cobra como un pago único por 30 días (no suscripción
// automática), porque el cargo automático de Flow solo está disponible
// para cuentas de empresa. El usuario debe volver a pagar cuando venza.
exports.startPlusCheckout = onCall({ secrets: [FLOW_API_KEY, FLOW_SECRET_KEY] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const uid = request.auth.uid;
  const email = request.auth.token.email;
  if (!email) {
    throw new HttpsError("failed-precondition", "Tu cuenta no tiene un correo asociado.");
  }
  const apiKey = FLOW_API_KEY.value();
  const secretKey = FLOW_SECRET_KEY.value();

  // commerceOrder no puede superar 45 caracteres en Flow; no hace falta que
  // incluya el uid porque flowPayments/{commerceOrder} ya guarda esa relación.
  const commerceOrder = `plus_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const payment = await flowPost("/payment/create", {
    commerceOrder,
    subject: `Patitas Plus - ${PLUS_DAYS} días`,
    currency: PLUS_CURRENCY,
    amount: PLUS_AMOUNT,
    email,
    urlConfirmation: `${FUNCTIONS_URL}/flowPaymentWebhook`,
    urlReturn: `${FUNCTIONS_URL}/flowReturnRedirect`,
  }, apiKey, secretKey);

  await db.collection("flowPayments").doc(commerceOrder).set({
    uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { url: `${payment.url}?token=${payment.token}` };
});

// Flow vuelve con un POST a esta URL cuando el usuario termina de pagar.
// GitHub Pages (sitio estático) no acepta POST, así que esta función solo
// recibe ese POST y redirige al navegador (GET) a la página real.
exports.flowReturnRedirect = onRequest((req, res) => {
  res.redirect(303, `${APP_URL}/patitas-plus/?step=return`);
});

// Flow llama a esta URL cuando el pago se confirma, con un "token" en el
// cuerpo. Verificamos el estado real contra la API de Flow (nunca
// confiamos en el cuerpo del webhook por sí solo) antes de activar el plan.
exports.flowPaymentWebhook = onRequest({ secrets: [FLOW_API_KEY, FLOW_SECRET_KEY] }, async (req, res) => {
  const apiKey = FLOW_API_KEY.value();
  const secretKey = FLOW_SECRET_KEY.value();
  const token = req.body && req.body.token;

  if (!token) {
    logger.warn("flowPaymentWebhook: payload sin token", req.body);
    res.status(200).send("ok");
    return;
  }

  try {
    const payment = await flowGet("/payment/getStatus", { token }, apiKey, secretKey);
    const commerceOrder = payment.commerceOrder;

    const mapSnap = await db.collection("flowPayments").doc(commerceOrder).get();
    if (!mapSnap.exists) {
      logger.error("flowPaymentWebhook: commerceOrder sin usuario asociado", commerceOrder);
      res.status(200).send("ok");
      return;
    }
    const uid = mapSnap.data().uid;

    // Estados de pago de Flow: 1 pendiente, 2 pagado, 3 rechazado, 4 anulado.
    if (payment.status === 2) {
      await db.collection("users").doc(uid).set({
        plan: "plus",
        plusExpiresAt: Timestamp.fromMillis(Date.now() + PLUS_DAYS * 24 * 60 * 60 * 1000),
        plusUpdatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    res.status(200).send("ok");
  } catch (err) {
    logger.error("flowPaymentWebhook error", err);
    res.status(500).send("error");
  }
});
