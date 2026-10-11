import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../firebase-config.js";
import { watchUserPlan } from "../plans.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const authBox = document.getElementById("authBox");
const planStatus = document.getElementById("planStatus");
const subscribeBtn = document.getElementById("subscribeBtn");
const subscribeHint = document.getElementById("subscribeHint");

let unsubscribePlan = null;

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

function updateUI(user, plan) {
  if (plan === "plus") {
    planStatus.hidden = false;
    subscribeBtn.hidden = true;
    subscribeHint.hidden = true;
    return;
  }
  planStatus.hidden = true;
  subscribeBtn.hidden = false;
  subscribeHint.hidden = false;
  if (!user) {
    subscribeBtn.textContent = "Inicia sesión para suscribirte";
    subscribeBtn.onclick = () => { window.location.href = "../index.html"; };
  } else {
    subscribeBtn.textContent = "Suscribirme a Patitas Plus";
    subscribeBtn.onclick = () => {
      alert("Los pagos con Flow se están activando. Muy pronto podrás suscribirte aquí mismo. Mientras tanto, escríbenos para activarlo.");
    };
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
});
