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
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import { firebaseConfig } from "../firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

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
const publishTitle = document.getElementById("publishTitle");
const publishSubmit = document.getElementById("publishSubmit");
const publishError = document.getElementById("publishError");
const closePublishModal = document.getElementById("closePublishModal");
const petPhotoInput = document.getElementById("petPhoto");
const petPhotoPreview = document.getElementById("petPhotoPreview");
const photoStatus = document.getElementById("photoStatus");

const listingsEl = document.getElementById("listings");
const listingsEmpty = document.getElementById("listingsEmpty");

let authMode = "login"; // or "register"
let currentUser = null;
let editingPetId = null;
let editingPetFoto = "";
let latestDocs = [];

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
  renderListings();
});

publishBtn.addEventListener("click", () => {
  editingPetId = null;
  editingPetFoto = "";
  publishTitle.textContent = "Publicar mascota para cruza";
  publishSubmit.textContent = "Publicar";
  publishError.hidden = true;
  publishForm.reset();
  petPhotoPreview.hidden = true;
  petPhotoPreview.src = "";
  photoStatus.hidden = true;
  publishModal.hidden = false;
});
closePublishModal.addEventListener("click", () => { publishModal.hidden = true; });

petPhotoInput.addEventListener("change", () => {
  const file = petPhotoInput.files[0];
  photoStatus.hidden = true;
  if (!file) {
    petPhotoPreview.hidden = true;
    return;
  }
  if (file.size > MAX_PHOTO_BYTES) {
    photoStatus.textContent = "La foto debe pesar menos de 5MB.";
    photoStatus.hidden = false;
    petPhotoInput.value = "";
    petPhotoPreview.hidden = true;
    return;
  }
  petPhotoPreview.src = URL.createObjectURL(file);
  petPhotoPreview.hidden = false;
});

publishForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;
  publishError.hidden = true;
  const submitBtn = publishForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  try {
    let fotoUrl = editingPetFoto;
    const file = petPhotoInput.files[0];
    if (file) {
      photoStatus.textContent = "Subiendo foto...";
      photoStatus.hidden = false;
      const photoRef = ref(storage, `pet-photos/${currentUser.uid}/${Date.now()}-${file.name}`);
      await uploadBytes(photoRef, file);
      fotoUrl = await getDownloadURL(photoRef);
      photoStatus.hidden = true;
    }
    const data = {
      nombre: document.getElementById("petName").value.trim(),
      especie: document.getElementById("petSpecies").value,
      sexo: document.getElementById("petSex").value,
      raza: document.getElementById("petBreed").value.trim(),
      edad: document.getElementById("petAge").value || null,
      foto: fotoUrl,
      descripcion: document.getElementById("petDescription").value.trim(),
    };
    if (editingPetId) {
      await updateDoc(doc(db, "cruzas", editingPetId), data);
    } else {
      await addDoc(collection(db, "cruzas"), {
        ...data,
        ownerUid: currentUser.uid,
        ownerEmail: currentUser.email,
        createdAt: serverTimestamp(),
      });
    }
    publishModal.hidden = true;
  } catch (err) {
    publishError.textContent = "No se pudo guardar. Intenta de nuevo.";
    publishError.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

function openEditModal(petId, pet) {
  editingPetId = petId;
  editingPetFoto = pet.foto || "";
  publishTitle.textContent = "Editar mascota";
  publishSubmit.textContent = "Guardar cambios";
  publishError.hidden = true;
  publishForm.reset();
  document.getElementById("petName").value = pet.nombre || "";
  document.getElementById("petSpecies").value = pet.especie || "Perro";
  document.getElementById("petSex").value = pet.sexo || "Macho";
  document.getElementById("petBreed").value = pet.raza || "";
  document.getElementById("petAge").value = pet.edad || "";
  document.getElementById("petDescription").value = pet.descripcion || "";
  if (pet.foto) {
    petPhotoPreview.src = pet.foto;
    petPhotoPreview.hidden = false;
  } else {
    petPhotoPreview.hidden = true;
    petPhotoPreview.src = "";
  }
  photoStatus.hidden = true;
  publishModal.hidden = false;
}

async function deletePet(petId, pet) {
  if (!confirm(`¿Borrar la publicación de ${pet.nombre || "esta mascota"}? Esta acción no se puede deshacer.`)) return;
  try {
    await deleteDoc(doc(db, "cruzas", petId));
    if (pet.foto && pet.foto.includes("firebasestorage.googleapis.com")) {
      try {
        await deleteObject(ref(storage, pet.foto));
      } catch (err) {
        // La foto puede no existir o no tener permisos; no bloquea el borrado de la publicación.
      }
    }
  } catch (err) {
    alert("No se pudo borrar la publicación. Intenta de nuevo.");
  }
}

function petCard(petId, pet) {
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

  if (currentUser && pet.ownerUid === currentUser.uid) {
    const actions = document.createElement("div");
    actions.className = "pet-card-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "link-btn";
    editBtn.textContent = "Editar";
    editBtn.addEventListener("click", () => openEditModal(petId, pet));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "link-btn delete-btn";
    deleteBtn.textContent = "Borrar";
    deleteBtn.addEventListener("click", () => deletePet(petId, pet));

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    body.appendChild(actions);
  }

  card.appendChild(body);
  return card;
}

function renderListings() {
  listingsEl.querySelectorAll(".pet-card").forEach((el) => el.remove());
  listingsEmpty.hidden = latestDocs.length > 0;
  latestDocs.forEach(({ id, data }) => {
    listingsEl.appendChild(petCard(id, data));
  });
}

const q = query(collection(db, "cruzas"), orderBy("createdAt", "desc"));
onSnapshot(q, (snapshot) => {
  latestDocs = snapshot.docs.map((d) => ({ id: d.id, data: d.data() }));
  renderListings();
}, () => {
  listingsEmpty.hidden = false;
  listingsEmpty.textContent = "No se pudieron cargar las publicaciones. Intenta más tarde.";
});
