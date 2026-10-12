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
let waitingConfirmation = false;

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

function handleReturnFromFlow() {
  waitingConfirmation = true;
  subscribeBtn.hidden = true;
  subscribeHint.hidden = false;
  subscribeHint.textContent = "Confirmando tu pago con Flow...";
  const url = new URL(window.location.href);
  url.searchParams.delete("step");
  window.history.replaceState({}, "", url);
  setTimeout(() => {
    if (waitingConfirmation) {
      subscribeHint.textContent = "Esto está tardando más de lo normal. Si ya pagaste, espera un momento y recarga la página.";
    }
  }, 20000);
}

function formatDate(timestamp) {
  if (!timestamp) return "";
  return timestamp.toDate().toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" });
}

function updateUI(user, plan, expiresAt) {
  if (plan === "plus") {
    waitingConfirmation = false;
    planStatus.hidden = false;
    planStatus.textContent = `✓ Patitas Plus activo hasta el ${formatDate(expiresAt)}`;
    subscribeBtn.hidden = false;
    subscribeBtn.disabled = false;
    subscribeBtn.textContent = "Renovar Patitas Plus (+30 días)";
    subscribeHint.hidden = false;
    subscribeHint.textContent = "Patitas Plus se paga una vez al mes, no se renueva solo. Puedes renovar cuando quieras.";
    subscribeBtn.onclick = startCheckout;
    return;
  }
  if (waitingConfirmation) return;
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
    subscribeHint.textContent = "Pagas con Webpay/RedCompra a través de Flow. Dura 30 días.";
    subscribeBtn.onclick = startCheckout;
  }
}

onAuthStateChanged(auth, (user) => {
  renderAuthBox(user);
  if (unsubscribePlan) {
    unsubscribePlan();
    unsubscribePlan = null;
  }
  unsubscribePlan = watchUserPlan(db, user ? user.uid : null, (plan, expiresAt) => {
    updateUI(user, plan, expiresAt);
  });
  if (user && new URLSearchParams(window.location.search).get("step") === "return" && !waitingConfirmation) {
    handleReturnFromFlow();
  }
});
