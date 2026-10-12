const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { flowPost, flowGet, PLAN_ID } = require("./flow");

initializeApp();
const db = getFirestore();

const FLOW_API_KEY = defineSecret("FLOW_API_KEY");
const FLOW_SECRET_KEY = defineSecret("FLOW_SECRET_KEY");

const APP_URL = "https://patitasclub.untalivan.cl";

// Crea (o reutiliza) el cliente en Flow para este usuario, y devuelve la URL
// a la que hay que redirigir al navegador para que registre su tarjeta.
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

  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  let flowCustomerId = userSnap.exists ? userSnap.data().flowCustomerId : null;

  if (!flowCustomerId) {
    const customer = await flowPost("/customer/create", {
      name: email,
      email,
      externalId: uid,
    }, apiKey, secretKey);
    flowCustomerId = customer.customerId;
    await userRef.set({ flowCustomerId }, { merge: true });
    await db.collection("flowCustomers").doc(flowCustomerId).set({ uid });
  }

  const registration = await flowPost("/customer/register", {
    customerId: flowCustomerId,
    urlReturn: `${APP_URL}/patitas-plus/?step=return`,
  }, apiKey, secretKey);

  return { url: `${registration.url}?token=${registration.token}` };
});

// Se llama cuando el usuario vuelve del registro de tarjeta en Flow.
// Confirma que la tarjeta quedó registrada y crea la suscripción al plan.
// El plan pasa a "plus" recién cuando llega el webhook confirmando el cobro.
exports.completePlusSubscription = onCall({ secrets: [FLOW_API_KEY, FLOW_SECRET_KEY] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const uid = request.auth.uid;
  const apiKey = FLOW_API_KEY.value();
  const secretKey = FLOW_SECRET_KEY.value();

  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const flowCustomerId = userSnap.exists ? userSnap.data().flowCustomerId : null;
  if (!flowCustomerId) {
    throw new HttpsError("failed-precondition", "No se encontró tu registro de pago. Intenta suscribirte de nuevo.");
  }

  const status = await flowGet("/customer/getRegisterStatus", { customerId: flowCustomerId }, apiKey, secretKey);
  const registered = status && (status.status === "1" || status.status === 1 || !!status.creditCardType);
  if (!registered) {
    throw new HttpsError("failed-precondition", "No se pudo confirmar el registro de tu tarjeta. Intenta de nuevo.");
  }

  if (!userSnap.data().flowSubscriptionId) {
    const subscription = await flowPost("/subscription/create", {
      planId: PLAN_ID,
      customerId: flowCustomerId,
    }, apiKey, secretKey);
    await userRef.set({ flowSubscriptionId: subscription.subscriptionId }, { merge: true });
  }

  return { ok: true };
});

// Flow llama a esta URL cada vez que hay un evento de cobro de la
// suscripción. Verificamos el estado real contra la API de Flow (nunca
// confiamos en el cuerpo del webhook por sí solo) antes de activar el plan.
exports.flowSubscriptionWebhook = onRequest({ secrets: [FLOW_API_KEY, FLOW_SECRET_KEY] }, async (req, res) => {
  const apiKey = FLOW_API_KEY.value();
  const secretKey = FLOW_SECRET_KEY.value();
  const invoiceId = req.body && (req.body.invoiceId || req.body.invoice_id);

  if (!invoiceId) {
    logger.warn("flowSubscriptionWebhook: payload sin invoiceId", req.body);
    res.status(200).send("ok");
    return;
  }

  try {
    const invoice = await flowGet("/invoice/get", { invoiceId }, apiKey, secretKey);
    const flowCustomerId = invoice.customerId;
    if (!flowCustomerId) {
      logger.warn("flowSubscriptionWebhook: invoice sin customerId", invoice);
      res.status(200).send("ok");
      return;
    }

    const mapSnap = await db.collection("flowCustomers").doc(String(flowCustomerId)).get();
    if (!mapSnap.exists) {
      logger.error("flowSubscriptionWebhook: customerId sin usuario asociado", flowCustomerId);
      res.status(200).send("ok");
      return;
    }
    const uid = mapSnap.data().uid;

    if (invoice.status === 1 || invoice.status === "1") {
      await db.collection("users").doc(uid).set({
        plan: "plus",
        plusUpdatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } else if (invoice.status === 2 || invoice.status === "2") {
      await db.collection("users").doc(uid).set({
        plan: "free",
        plusUpdatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    res.status(200).send("ok");
  } catch (err) {
    logger.error("flowSubscriptionWebhook error", err);
    res.status(500).send("error");
  }
});
