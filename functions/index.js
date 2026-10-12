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
const FUNCTIONS_URL = "https://us-central1-patitasclub.cloudfunctions.net";

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
    url_return: `${FUNCTIONS_URL}/flowReturnRedirect`,
  }, apiKey, secretKey);
  await userRef.set({ flowRegisterToken: registration.token }, { merge: true });

  return { url: `${registration.url}?token=${registration.token}` };
});

// Flow vuelve con un POST a esta URL cuando el usuario termina de
// registrar su tarjeta. GitHub Pages (sitio estático) no acepta POST,
// así que esta función solo recibe ese POST y redirige al navegador
// (GET) a la página real de Patitas Plus.
exports.flowReturnRedirect = onRequest((req, res) => {
  res.redirect(303, `${APP_URL}/patitas-plus/?step=return`);
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
  const flowRegisterToken = userSnap.exists ? userSnap.data().flowRegisterToken : null;
  if (!flowCustomerId || !flowRegisterToken) {
    throw new HttpsError("failed-precondition", "No se encontró tu registro de pago. Intenta suscribirte de nuevo.");
  }

  const status = await flowGet("/customer/getRegisterStatus", { token: flowRegisterToken }, apiKey, secretKey);
  const registered = status && (status.status === "1" || status.status === 1 || !!status.creditCardType);
  if (!registered) {
    throw new HttpsError("failed-precondition", "No se pudo confirmar el registro de tu tarjeta. Intenta de nuevo.");
  }

  let subscription;
  if (!userSnap.data().flowSubscriptionId) {
    subscription = await flowPost("/subscription/create", {
      planId: PLAN_ID,
      customerId: flowCustomerId,
    }, apiKey, secretKey);
    await userRef.set({ flowSubscriptionId: subscription.subscriptionId }, { merge: true });
    await db.collection("flowSubscriptions").doc(subscription.subscriptionId).set({ uid });
  } else {
    subscription = await flowGet("/subscription/get", {
      subscriptionId: userSnap.data().flowSubscriptionId,
    }, apiKey, secretKey);
    await db.collection("flowSubscriptions").doc(subscription.subscriptionId).set({ uid });
  }

  // No dependemos solo del webhook para la primera activación: si Flow ya
  // marcó la primera factura como pagada, activamos el plan de inmediato.
  const firstInvoice = subscription.invoices && subscription.invoices[0];
  if (firstInvoice && (firstInvoice.status === 1 || firstInvoice.status === "1")) {
    await userRef.set({
      plan: "plus",
      plusUpdatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  return { ok: true };
});

// El commerceOrder de un cobro de suscripción tiene la forma
// "{subscriptionId}_{invoiceId}_{fecha}". Como el propio subscriptionId
// puede traer guiones bajos, se busca el último segmento numérico seguido
// de "_" para separar ambas partes de forma confiable.
function parseSubscriptionCommerceOrder(commerceOrder) {
  const match = /^(.+)_(\d+)_.+$/.exec(commerceOrder || "");
  if (!match) return null;
  return { subscriptionId: match[1], invoiceId: match[2] };
}

// Flow llama a esta URL cada vez que hay un evento de cobro de la
// suscripción, con un "token" en el cuerpo. Verificamos el estado real
// contra la API de Flow (nunca confiamos en el cuerpo del webhook por sí
// solo) antes de activar el plan.
exports.flowSubscriptionWebhook = onRequest({ secrets: [FLOW_API_KEY, FLOW_SECRET_KEY] }, async (req, res) => {
  const apiKey = FLOW_API_KEY.value();
  const secretKey = FLOW_SECRET_KEY.value();
  const token = req.body && req.body.token;

  if (!token) {
    logger.warn("flowSubscriptionWebhook: payload sin token", req.body);
    res.status(200).send("ok");
    return;
  }

  try {
    const payment = await flowGet("/payment/getStatus", { token }, apiKey, secretKey);
    const parsed = parseSubscriptionCommerceOrder(payment.commerceOrder);
    if (!parsed) {
      logger.warn("flowSubscriptionWebhook: no se pudo leer commerceOrder", payment.commerceOrder);
      res.status(200).send("ok");
      return;
    }

    const mapSnap = await db.collection("flowSubscriptions").doc(parsed.subscriptionId).get();
    if (!mapSnap.exists) {
      logger.error("flowSubscriptionWebhook: subscriptionId sin usuario asociado", parsed.subscriptionId);
      res.status(200).send("ok");
      return;
    }
    const uid = mapSnap.data().uid;

    // Estados de pago de Flow: 1 pendiente, 2 pagado, 3 rechazado, 4 anulado.
    if (payment.status === 2) {
      await db.collection("users").doc(uid).set({
        plan: "plus",
        plusUpdatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } else if (payment.status === 3 || payment.status === 4) {
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
