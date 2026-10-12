import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import { firebaseConfig } from "../firebase-config.js";
import { watchUserPlan } from "../plans.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

const authBox = document.getElementById("authBox");
const planStatus = document.getElementById("planStatus");
const subscribeBtn = document.getElementById("subscribeBtn");
const subscribeHint = document.getElementById("subscribeHint");

let unsubscribePlan = null;
let processingReturn = false;

function renderAuthBox(user) {
  authBox.innerHTML = "";
  if (user) {
    const span = document.createElement("span");
    span.className = "user-email";
    span.textContent = user.email;
    authBox.appendChild(span);
  } else {
    const loginLink = document.createElement("a");
    loginLink.className = "link-btn";
    loginLink.href = "../index.html";
    loginLink.textContent = "Iniciar sesión";
    authBox.appendChild(loginLink);
  }
}

async function startCheckout() {
  subscribeBtn.disabled = true;
  subscribeHint.textContent = "Conectando con Flow...";
  try {
    const start = httpsCallable(functions, "startPlusCheckout");
    const { data } = await start();
    window.location.href = data.url;
  } catch (err) {
    subscribeBtn.disabled = false;
    subscribeHint.textContent = "No se pudo iniciar el pago. Intenta de nuevo.";
  }
}

async function handleReturnFromFlow() {
  processingReturn = true;
  subscribeBtn.hidden = true;
  subscribeHint.hidden = false;
  subscribeHint.textContent = "Confirmando tu pago con Flow...";
  try {
    const complete = httpsCallable(functions, "completePlusSubscription");
    await complete();
    subscribeHint.textContent = "¡Listo! Activando tu plan Plus...";
  } catch (err) {
    processingReturn = false;
    subscribeHint.textContent = "No se pudo confirmar el pago. Si ya pagaste, espera un minuto y recarga esta página.";
  }
  const url = new URL(window.location.href);
  url.searchParams.delete("step");
  window.history.replaceState({}, "", url);
}

function updateUI(user, plan) {
  if (plan === "plus") {
    planStatus.hidden = false;
    subscribeBtn.hidden = true;
    subscribeHint.hidden = true;
    return;
  }
  if (processingReturn) return;
  planStatus.hidden = true;
  subscribeBtn.hidden = false;
  subscribeBtn.disabled = false;
  subscribeHint.hidden = false;
  if (!user) {
    subscribeBtn.textContent = "Inicia sesión para suscribirte";
    subscribeHint.textContent = "Necesitas una cuenta para suscribirte a Patitas Plus.";
    subscribeBtn.onclick = () => { window.location.href = "../index.html"; };
  } else {
    subscribeBtn.textContent = "Suscribirme a Patitas Plus";
    subscribeHint.textContent = "Pagas con Webpay/RedCompra a través de Flow.";
    subscribeBtn.onclick = startCheckout;
  }
}

onAuthStateChanged(auth, (user) => {
  renderAuthBox(user);
  if (unsubscribePlan) {
    unsubscribePlan();
    unsubscribePlan = null;
  }
  unsubscribePlan = watchUserPlan(db, user ? user.uid : null, (plan) => {
    updateUI(user, plan);
  });
  if (user && new URLSearchParams(window.location.search).get("step") === "return" && !processingReturn) {
    handleReturnFromFlow();
  }
});
