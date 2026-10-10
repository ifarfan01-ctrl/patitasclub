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
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

const authBox = document.getElementById("authBox");
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const googleBtn = document.getElementById("googleBtn");
const publishBtn = document.getElementById("publishBtn");

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

const publishModal = document.getElementById("publishModal");
const publishForm = document.getElementById("publishForm");
const publishError = document.getElementById("publishError");
const closePublishModal = document.getElementById("closePublishModal");

const listingsEl = document.getElementById("listings");
const listingsEmpty = document.getElementById("listingsEmpty");

let authMode = "login"; // or "register"
let currentUser = null;

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

function renderAuthBox() {
  authBox.innerHTML = "";
  if (currentUser) {
    const span = document.createElement("span");
    span.className = "user-email";
    span.textContent = currentUser.email;
    const logoutBtn = document.createElement("button");
    logoutBtn.className = "link-btn";
    logoutBtn.textContent = "Cerrar sesión";
    logoutBtn.addEventListener("click", () => signOut(auth));
    authBox.appendChild(span);
    authBox.appendChild(logoutBtn);
    publishBtn.hidden = false;
  } else {
    authBox.appendChild(loginBtn);
    authBox.appendChild(registerBtn);
    publishBtn.hidden = true;
  }
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  renderAuthBox();
});

publishBtn.addEventListener("click", () => {
  publishError.hidden = true;
  publishForm.reset();
  publishModal.hidden = false;
});
closePublishModal.addEventListener("click", () => { publishModal.hidden = true; });

publishForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;
  publishError.hidden = true;
  const submitBtn = publishForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  try {
    await addDoc(collection(db, "cruzas"), {
      nombre: document.getElementById("petName").value.trim(),
      especie: document.getElementById("petSpecies").value,
      sexo: document.getElementById("petSex").value,
      raza: document.getElementById("petBreed").value.trim(),
      edad: document.getElementById("petAge").value || null,
      foto: document.getElementById("petPhoto").value.trim(),
      descripcion: document.getElementById("petDescription").value.trim(),
      ownerUid: currentUser.uid,
      ownerEmail: currentUser.email,
      createdAt: serverTimestamp(),
    });
    publishModal.hidden = true;
  } catch (err) {
    publishError.textContent = "No se pudo publicar. Intenta de nuevo.";
    publishError.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

function petCard(pet) {
  const card = document.createElement("article");
  card.className = "pet-card";

  const img = document.createElement("img");
  img.src = pet.foto || "https://placedog.net/400/300?id=" + Math.floor(Math.random() * 90);
  img.alt = pet.nombre || "Mascota para cruza";
  card.appendChild(img);

  const body = document.createElement("div");
  body.className = "pet-card-body";

  const h3 = document.createElement("h3");
  h3.textContent = pet.nombre || "Sin nombre";
  body.appendChild(h3);

  const meta = document.createElement("p");
  meta.className = "pet-card-meta";
  const parts = [pet.especie, pet.sexo, pet.raza, pet.edad ? `${pet.edad} años` : null].filter(Boolean);
  meta.textContent = parts.join(" · ");
  body.appendChild(meta);

  const desc = document.createElement("p");
  desc.className = "pet-card-desc";
  desc.textContent = pet.descripcion || "";
  body.appendChild(desc);

  card.appendChild(body);
  return card;
}

const q = query(collection(db, "cruzas"), orderBy("createdAt", "desc"));
onSnapshot(q, (snapshot) => {
  listingsEl.querySelectorAll(".pet-card").forEach((el) => el.remove());
  listingsEmpty.hidden = !snapshot.empty;
  snapshot.forEach((doc) => {
    listingsEl.appendChild(petCard(doc.data()));
  });
}, () => {
  listingsEmpty.hidden = false;
  listingsEmpty.textContent = "No se pudieron cargar las publicaciones. Intenta más tarde.";
});
