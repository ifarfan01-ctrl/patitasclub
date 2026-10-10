import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

const authBox = document.getElementById("authBox");
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const googleBtn = document.getElementById("googleBtn");

const authModal = document.getElementById("authModal");
const authForm = document.getElementById("authForm");
const authTitle = document.getElementById("authTitle");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authError = document.getElementById("authError");
const authSubmit = document.getElementById("authSubmit");
const authSwitchText = document.getElementById("authSwitchText");
const authSwitchBtn = document.getElementById("authSwitchBtn");
const closeAuthModal = document.getElementById("closeAuthModal");

let authMode = "login";

function openAuthModal(mode) {
  authMode = mode;
  authError.hidden = true;
  authForm.reset();
  if (mode === "login") {
    authTitle.textContent = "Iniciar sesión";
    authSubmit.textContent = "Iniciar sesión";
    authSwitchText.textContent = "¿No tienes cuenta?";
    authSwitchBtn.textContent = "Regístrate";
  } else {
    authTitle.textContent = "Crear cuenta";
    authSubmit.textContent = "Registrarme";
    authSwitchText.textContent = "¿Ya tienes cuenta?";
    authSwitchBtn.textContent = "Inicia sesión";
  }
  authModal.hidden = false;
}

loginBtn.addEventListener("click", () => openAuthModal("login"));
registerBtn.addEventListener("click", () => openAuthModal("register"));
closeAuthModal.addEventListener("click", () => { authModal.hidden = true; });
authSwitchBtn.addEventListener("click", () => openAuthModal(authMode === "login" ? "register" : "login"));

const AUTH_ERROR_MESSAGES = {
  "auth/invalid-email": "Correo inválido.",
  "auth/user-not-found": "No existe una cuenta con ese correo.",
  "auth/wrong-password": "Contraseña incorrecta.",
  "auth/invalid-credential": "Correo o contraseña incorrectos.",
  "auth/email-already-in-use": "Ya existe una cuenta con ese correo.",
  "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
};

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.hidden = true;
  authSubmit.disabled = true;
  const email = authEmail.value.trim();
  const password = authPassword.value;
  try {
    if (authMode === "login") {
      await signInWithEmailAndPassword(auth, email, password);
    } else {
      await createUserWithEmailAndPassword(auth, email, password);
    }
    authModal.hidden = true;
  } catch (err) {
    authError.textContent = AUTH_ERROR_MESSAGES[err.code] || "Ocurrió un error. Intenta de nuevo.";
    authError.hidden = false;
  } finally {
    authSubmit.disabled = false;
  }
});

googleBtn.addEventListener("click", async () => {
  authError.hidden = true;
  googleBtn.disabled = true;
  try {
    await signInWithPopup(auth, googleProvider);
    authModal.hidden = true;
  } catch (err) {
    if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
      authError.textContent = "No se pudo iniciar sesión con Google. Intenta de nuevo.";
      authError.hidden = false;
    }
  } finally {
    googleBtn.disabled = false;
  }
});

function renderAuthBox(user) {
  authBox.innerHTML = "";
  if (user) {
    const span = document.createElement("span");
    span.className = "user-email";
    span.textContent = user.email;
    const logoutBtn = document.createElement("button");
    logoutBtn.className = "link-btn";
    logoutBtn.textContent = "Cerrar sesión";
    logoutBtn.addEventListener("click", () => signOut(auth));
    authBox.appendChild(span);
    authBox.appendChild(logoutBtn);
  } else {
    authBox.appendChild(loginBtn);
    authBox.appendChild(registerBtn);
  }
}

onAuthStateChanged(auth, (user) => {
  renderAuthBox(user);
});
