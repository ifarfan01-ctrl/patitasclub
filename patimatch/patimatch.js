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
  getDocs,
  getDoc,
  setDoc,
  doc,
  query,
  where,
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
import { attachAddressAutocomplete, loadGoogleMapsBootstrap } from "../address-autocomplete.js";
import { watchUserPlan } from "../plans.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const MAX_DISTANCE_KM = 25;

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDistance(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

// ---- DOM refs ----
const authBox = document.getElementById("authBox");
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const googleBtn = document.getElementById("googleBtn");

const gate = document.getElementById("gate");
const gateLoginBtn = document.getElementById("gateLoginBtn");
const gateRegisterBtn = document.getElementById("gateRegisterBtn");

const onboarding = document.getElementById("onboarding");
const addPetBtn = document.getElementById("addPetBtn");

const deckSection = document.getElementById("deckSection");
const myPetLabel = document.getElementById("myPetLabel");
const editMyPetBtn = document.getElementById("editMyPetBtn");
const deleteMyPetBtn = document.getElementById("deleteMyPetBtn");
const myMatchesBtn = document.getElementById("myMatchesBtn");
const matchCountEl = document.getElementById("matchCount");
const deckEl = document.getElementById("deck");
const deckEmpty = document.getElementById("deckEmpty");
const passBtn = document.getElementById("passBtn");
const likeBtn = document.getElementById("likeBtn");

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
const termsCheckRow = document.getElementById("termsCheckRow");
const acceptTerms = document.getElementById("acceptTerms");

const petModal = document.getElementById("petModal");
const petModalTitle = document.getElementById("petModalTitle");
const petForm = document.getElementById("petForm");
const petError = document.getElementById("petError");
const petSubmit = document.getElementById("petSubmit");
const closePetModal = document.getElementById("closePetModal");
const petPhotoInput = document.getElementById("petPhoto");
const petPhotoPreview = document.getElementById("petPhotoPreview");
const photoStatus = document.getElementById("photoStatus");
const addressContainer = document.getElementById("addressAutocomplete");
const addressStatus = document.getElementById("addressStatus");

const matchOverlay = document.getElementById("matchOverlay");
const matchPhotoMine = document.getElementById("matchPhotoMine");
const matchPhotoTheirs = document.getElementById("matchPhotoTheirs");
const matchText = document.getElementById("matchText");
const matchDistanceEl = document.getElementById("matchDistance");
const matchContactEl = document.getElementById("matchContact");
const closeMatchBtn = document.getElementById("closeMatch");

const matchesModal = document.getElementById("matchesModal");
const matchesList = document.getElementById("matchesList");
const matchesEmpty = document.getElementById("matchesEmpty");
const closeMatchesModal = document.getElementById("closeMatchesModal");

const mapBtn = document.getElementById("mapBtn");
const mapModal = document.getElementById("mapModal");
const closeMapModal = document.getElementById("closeMapModal");
const petsMapEl = document.getElementById("petsMap");

const upsellModal = document.getElementById("upsellModal");
const upsellMessage = document.getElementById("upsellMessage");
const closeUpsellModal = document.getElementById("closeUpsellModal");

function openUpsellModal(message) {
  upsellMessage.textContent = message;
  upsellModal.hidden = false;
}
closeUpsellModal.addEventListener("click", () => { upsellModal.hidden = true; });

// ---- State ----
let currentUser = null;
let currentPlan = "free";
let unsubscribePlan = null;
let myPet = null; // {id, ...data}
let editingMyPet = false;
let editingPetFoto = "";
let editingHasAddress = false;
let selectedAddress = null;
let editingLat = null;
let editingLng = null;

function resetAddressField() {
  selectedAddress = null;
  addressStatus.hidden = true;
  addressStatus.classList.remove("ok");
  attachAddressAutocomplete(addressContainer, (addr) => {
    selectedAddress = addr;
    addressStatus.textContent = `✓ ${addr.direccion}`;
    addressStatus.hidden = false;
    addressStatus.classList.add("ok");
  });
}
let deckPets = []; // candidates to swipe, nearest first
let isAnimating = false;

function placeholderPhoto(seed) {
  return "https://placedog.net/400/400?id=" + (seed % 90 + 1);
}

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

// ---- Auth ----
let authMode = "login";

function openAuthModal(mode) {
  authMode = mode;
  authError.hidden = true;
  authForm.reset();
  termsCheckRow.hidden = mode !== "register";
  acceptTerms.checked = false;
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
gateLoginBtn.addEventListener("click", () => openAuthModal("login"));
gateRegisterBtn.addEventListener("click", () => openAuthModal("register"));
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
  if (authMode === "register" && !acceptTerms.checked) {
    authError.textContent = "Debes aceptar los Términos y Condiciones.";
    authError.hidden = false;
    return;
  }
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
  if (authMode === "register" && !acceptTerms.checked) {
    authError.textContent = "Debes aceptar los Términos y Condiciones.";
    authError.hidden = false;
    return;
  }
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
  } else {
    authBox.appendChild(loginBtn);
    authBox.appendChild(registerBtn);
  }
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  renderAuthBox();
  if (unsubscribePlan) {
    unsubscribePlan();
    unsubscribePlan = null;
  }
  unsubscribePlan = watchUserPlan(db, user ? user.uid : null, (plan) => {
    currentPlan = plan;
  });
  if (!user) {
    myPet = null;
    showView("gate");
    return;
  }
  try {
    await loadMyPet();
    if (!myPet) {
      showView("onboarding");
    } else {
      myPetLabel.textContent = `Tu mascota: ${myPet.nombre}`;
      await loadMatchCount();
      await loadDeck();
      showView("deck");
    }
  } catch (err) {
    showView("onboarding");
    onboarding.querySelector("p").textContent =
      "No se pudo cargar tu información. Intenta recargar la página en unos segundos.";
    addPetBtn.hidden = true;
  }
});

function showView(view) {
  gate.hidden = view !== "gate";
  onboarding.hidden = view !== "onboarding";
  deckSection.hidden = view !== "deck";
}

async function loadMyPet() {
  const snap = await getDocs(query(collection(db, "patimatch_pets"), where("ownerUid", "==", currentUser.uid)));
  if (snap.empty) {
    myPet = null;
  } else {
    const d = snap.docs[0];
    myPet = { id: d.id, ...d.data() };
  }
}

// ---- Add pet ----
addPetBtn.addEventListener("click", () => {
  editingMyPet = false;
  editingPetFoto = "";
  editingHasAddress = false;
  petModalTitle.textContent = "Mi mascota";
  petSubmit.textContent = "Guardar mi mascota";
  petError.hidden = true;
  petForm.reset();
  petPhotoInput.required = true;
  editingLat = null;
  editingLng = null;
  petPhotoPreview.hidden = true;
  petPhotoPreview.src = "";
  photoStatus.hidden = true;
  resetAddressField();
  petModal.hidden = false;
});
closePetModal.addEventListener("click", () => { petModal.hidden = true; });

editMyPetBtn.addEventListener("click", async () => {
  if (!myPet) return;
  editingMyPet = true;
  editingPetFoto = myPet.foto || "";
  editingHasAddress = false;
  petModalTitle.textContent = "Editar mi mascota";
  petSubmit.textContent = "Guardar cambios";
  petError.hidden = true;
  petForm.reset();
  document.getElementById("petName").value = myPet.nombre || "";
  document.getElementById("petSpecies").value = myPet.especie || "Perro";
  document.getElementById("petSex").value = myPet.sexo || "Macho";
  document.getElementById("petBreed").value = myPet.raza || "";
  document.getElementById("petAge").value = myPet.edad || "";
  document.getElementById("petDescription").value = myPet.descripcion || "";
  petPhotoInput.required = !myPet.foto;
  editingLat = typeof myPet.lat === "number" ? myPet.lat : null;
  editingLng = typeof myPet.lng === "number" ? myPet.lng : null;
  if (myPet.foto) {
    petPhotoPreview.src = myPet.foto;
    petPhotoPreview.hidden = false;
  } else {
    petPhotoPreview.hidden = true;
    petPhotoPreview.src = "";
  }
  photoStatus.hidden = true;
  resetAddressField();
  petModal.hidden = false;

  try {
    const privateSnap = await getDoc(doc(db, "patimatch_pets", myPet.id, "private", "info"));
    if (privateSnap.exists()) {
      editingHasAddress = true;
      addressStatus.textContent = `✓ ${privateSnap.data().direccion} (ya guardada)`;
      addressStatus.hidden = false;
      addressStatus.classList.add("ok");
    }
  } catch (err) {
    // Si no se puede leer, el usuario puede volver a buscar su dirección.
  }
});

deleteMyPetBtn.addEventListener("click", async () => {
  if (!myPet) return;
  if (!confirm(`¿Borrar a ${myPet.nombre || "tu mascota"} de PatiMatch? Esta acción no se puede deshacer.`)) return;
  try {
    try {
      await deleteDoc(doc(db, "patimatch_pets", myPet.id, "private", "info"));
    } catch (err) {
      // Puede no existir si nunca se guardó una dirección.
    }
    await deleteDoc(doc(db, "patimatch_pets", myPet.id));
    if (myPet.foto && myPet.foto.includes("firebasestorage.googleapis.com")) {
      try {
        await deleteObject(ref(storage, myPet.foto));
      } catch (err) {
        // La foto puede no existir o no tener permisos; no bloquea el borrado.
      }
    }
    myPet = null;
    showView("onboarding");
  } catch (err) {
    alert("No se pudo borrar tu mascota. Intenta de nuevo.");
  }
});

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

petForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  petError.hidden = true;
  if (!selectedAddress && !editingHasAddress) {
    petError.textContent = "La dirección es obligatoria.";
    petError.hidden = false;
    return;
  }
  petSubmit.disabled = true;
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
      lat: selectedAddress ? selectedAddress.lat : editingLat,
      lng: selectedAddress ? selectedAddress.lng : editingLng,
    };
    let petId;
    if (editingMyPet && myPet) {
      petId = myPet.id;
      await updateDoc(doc(db, "patimatch_pets", petId), data);
    } else {
      const docRef = await addDoc(collection(db, "patimatch_pets"), {
        ...data,
        ownerUid: currentUser.uid,
        ownerEmail: currentUser.email,
        createdAt: serverTimestamp(),
      });
      petId = docRef.id;
      myPet = { id: petId };
    }
    if (selectedAddress) {
      await setDoc(doc(db, "patimatch_pets", petId, "private", "info"), {
        direccion: selectedAddress.direccion,
        lat: selectedAddress.lat,
        lng: selectedAddress.lng,
        ownerUid: currentUser.uid,
        updatedAt: serverTimestamp(),
      });
    }
    petModal.hidden = true;
    await loadMyPet();
    myPetLabel.textContent = `Tu mascota: ${myPet.nombre}`;
    await loadMatchCount();
    await loadDeck();
    showView("deck");
  } catch (err) {
    petError.textContent = "No se pudo guardar. Intenta de nuevo.";
    petError.hidden = false;
  } finally {
    petSubmit.disabled = false;
  }
});

// ---- Deck ----
async function loadDeck() {
  const [petsSnap, mySwipesSnap] = await Promise.all([
    getDocs(collection(db, "patimatch_pets")),
    getDocs(query(collection(db, "patimatch_swipes"), where("fromPetId", "==", myPet.id))),
  ]);

  const alreadySwiped = new Set(mySwipesSnap.docs.map((d) => d.data().toPetId));

  deckPets = [];
  petsSnap.forEach((d) => {
    if (d.id === myPet.id) return;
    const pet = { id: d.id, ...d.data() };
    if (pet.ownerUid === currentUser.uid) return;
    if (alreadySwiped.has(d.id)) return;
    if (typeof pet.lat !== "number" || typeof pet.lng !== "number") return;
    pet.distanceKm = distanceKm(myPet.lat, myPet.lng, pet.lat, pet.lng);
    if (pet.distanceKm > MAX_DISTANCE_KM) return;
    deckPets.push(pet);
  });
  deckPets.sort((a, b) => a.distanceKm - b.distanceKm);

  renderDeck();
}

function renderDeck() {
  deckEl.innerHTML = "";
  deckEmpty.hidden = deckPets.length > 0;
  if (mapInstance && !mapModal.hidden) renderMapMarkers();
  if (deckPets.length === 0) return;

  deckPets.slice(0, 3).reverse().forEach((pet, i, arr) => {
    const depth = arr.length - 1 - i;
    const card = buildCard(pet, depth === 0);
    card.style.transform = `translateY(${depth * 8}px) scale(${1 - depth * 0.04})`;
    card.style.zIndex = String(10 - depth);
    deckEl.appendChild(card);
  });
}

function buildCard(pet, interactive) {
  const card = document.createElement("div");
  card.className = "card";

  const img = document.createElement("img");
  img.src = pet.foto || placeholderPhoto(hashSeed(pet.id));
  img.alt = pet.nombre;
  card.appendChild(img);

  const info = document.createElement("div");
  info.className = "card-info";
  const parts = [pet.especie, pet.sexo, pet.raza, pet.edad ? `${pet.edad} años` : null].filter(Boolean);
  info.innerHTML = `<h2>${pet.nombre}</h2><p>${parts.join(" · ")}</p><p class="card-distance">📍 ${fmtDistance(pet.distanceKm)} de distancia</p>`;
  card.appendChild(info);

  const likeStamp = document.createElement("div");
  likeStamp.className = "stamp like";
  likeStamp.textContent = "LIKE";
  card.appendChild(likeStamp);

  const nopeStamp = document.createElement("div");
  nopeStamp.className = "stamp nope";
  nopeStamp.textContent = "NOPE";
  card.appendChild(nopeStamp);

  if (interactive) {
    enableDrag(card, pet, likeStamp, nopeStamp);
  }

  return card;
}

function enableDrag(card, pet, likeStamp, nopeStamp) {
  let startX = 0, startY = 0, currentX = 0, currentY = 0, dragging = false;

  function onPointerDown(e) {
    if (isAnimating) return;
    dragging = true;
    card.style.cursor = "grabbing";
    startX = e.clientX;
    startY = e.clientY;
    card.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragging) return;
    currentX = e.clientX - startX;
    currentY = e.clientY - startY;
    const rotation = currentX / 12;
    card.style.transform = `translate(${currentX}px, ${currentY}px) rotate(${rotation}deg)`;
    const ratio = Math.min(Math.abs(currentX) / 120, 1);
    likeStamp.style.opacity = currentX > 0 ? ratio : 0;
    nopeStamp.style.opacity = currentX < 0 ? ratio : 0;
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    card.style.cursor = "grab";
    const threshold = 100;
    if (currentX > threshold) {
      swipeOut(card, pet, "right");
    } else if (currentX < -threshold) {
      swipeOut(card, pet, "left");
    } else {
      card.style.transition = "transform 0.3s ease";
      card.style.transform = "";
      likeStamp.style.opacity = 0;
      nopeStamp.style.opacity = 0;
      card.addEventListener("transitionend", () => { card.style.transition = ""; }, { once: true });
    }
    currentX = 0;
    currentY = 0;
  }

  card.addEventListener("pointerdown", onPointerDown);
  card.addEventListener("pointermove", onPointerMove);
  card.addEventListener("pointerup", onPointerUp);
  card.addEventListener("pointercancel", onPointerUp);
}

function swipeOut(card, pet, direction) {
  if (isAnimating) return;
  isAnimating = true;
  card.style.pointerEvents = "none";
  const flyX = direction === "right" ? 600 : -600;
  card.style.transition = "transform 0.4s ease, opacity 0.4s ease";
  card.style.transform = `translate(${flyX}px, -40px) rotate(${direction === "right" ? 30 : -30}deg)`;
  card.style.opacity = "0";

  setTimeout(async () => {
    deckPets = deckPets.filter((p) => p.id !== pet.id);
    await handleSwipe(pet, direction === "right");
    isAnimating = false;
    renderDeck();
  }, 350);
}

passBtn.addEventListener("click", () => {
  if (isAnimating || !deckPets.length) return;
  const topCard = deckEl.lastElementChild;
  if (topCard) swipeOut(topCard, deckPets[0], "left");
});

likeBtn.addEventListener("click", () => {
  if (isAnimating || !deckPets.length) return;
  const topCard = deckEl.lastElementChild;
  if (topCard) swipeOut(topCard, deckPets[0], "right");
});

async function handleSwipe(pet, liked) {
  const swipeId = `${myPet.id}_${pet.id}`;
  await setDoc(doc(db, "patimatch_swipes", swipeId), {
    fromUid: currentUser.uid,
    fromPetId: myPet.id,
    toUid: pet.ownerUid,
    toPetId: pet.id,
    liked,
    createdAt: serverTimestamp(),
  });

  if (!liked) return;

  const reverseId = `${pet.id}_${myPet.id}`;
  const reverseSnap = await getDoc(doc(db, "patimatch_swipes", reverseId));
  if (reverseSnap.exists() && reverseSnap.data().liked) {
    const matchId = [myPet.id, pet.id].sort().join("_");
    await setDoc(doc(db, "patimatch_matches", matchId), {
      petIds: [myPet.id, pet.id].sort(),
      uids: [currentUser.uid, pet.ownerUid],
      createdAt: serverTimestamp(),
    });
    showMatch(pet);
    await loadMatchCount();
  }
}

function showMatch(pet) {
  matchPhotoMine.src = myPet.foto || placeholderPhoto(hashSeed(myPet.id));
  matchPhotoTheirs.src = pet.foto || placeholderPhoto(hashSeed(pet.id));
  matchText.textContent = `${myPet.nombre} y ${pet.nombre} se gustaron`;
  matchDistanceEl.textContent = `📍 Viven a ${fmtDistance(pet.distanceKm)}`;
  matchContactEl.textContent = `Coordina el paseo escribiendo a: ${pet.ownerEmail}`;
  matchOverlay.hidden = false;
}

closeMatchBtn.addEventListener("click", () => { matchOverlay.hidden = true; });

// ---- Matches list ----
async function loadMatchCount() {
  const snap = await getDocs(query(collection(db, "patimatch_matches"), where("uids", "array-contains", currentUser.uid)));
  matchCountEl.textContent = String(snap.size);
}

myMatchesBtn.addEventListener("click", async () => {
  matchesList.innerHTML = "";
  matchesList.appendChild(matchesEmpty);
  const snap = await getDocs(query(collection(db, "patimatch_matches"), where("uids", "array-contains", currentUser.uid)));
  matchesEmpty.hidden = !snap.empty;

  for (const d of snap.docs) {
    const data = d.data();
    const theirPetId = data.petIds.find((id) => id !== myPet.id);
    if (!theirPetId) continue;
    const petSnap = await getDoc(doc(db, "patimatch_pets", theirPetId));
    if (!petSnap.exists()) continue;
    const pet = { id: petSnap.id, ...petSnap.data() };
    const dist = distanceKm(myPet.lat, myPet.lng, pet.lat, pet.lng);

    const row = document.createElement("div");
    row.className = "match-row";
    const img = document.createElement("img");
    img.src = pet.foto || placeholderPhoto(hashSeed(pet.id));
    img.alt = pet.nombre;
    const info = document.createElement("div");
    info.className = "match-row-info";
    info.innerHTML = `<h4>${pet.nombre}</h4><p>📍 ${fmtDistance(dist)} · ${pet.ownerEmail}</p>`;
    row.appendChild(img);
    row.appendChild(info);
    matchesList.appendChild(row);
  }

  matchesModal.hidden = false;
});

closeMatchesModal.addEventListener("click", () => { matchesModal.hidden = true; });

// ---- Mapa de mascotas cercanas (Patitas Plus) ----
let mapInstance = null;
let mapInfoWindow = null;
let mapMarkers = [];
let userLocationMarker = null;

function pawMarkerIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="52" viewBox="0 0 40 52">
<path d="M20 1C10 1 2 9 2 19c0 13 18 31 18 31s18-18 18-31C38 9 30 1 20 1z" fill="#ff8a5b" stroke="#ffffff" stroke-width="2"/>
<g transform="translate(6,5) scale(0.42)">
<circle cx="14" cy="24" r="7" fill="#ffffff"/>
<circle cx="27" cy="13" r="7.5" fill="#ffffff"/>
<circle cx="41" cy="13" r="7.5" fill="#ffffff"/>
<circle cx="54" cy="24" r="7" fill="#ffffff"/>
<ellipse cx="34" cy="43" rx="18" ry="15" fill="#ffffff"/>
</g>
</svg>`;
  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(40, 52),
    anchor: new google.maps.Point(20, 50),
  };
}

function buildPetInfoContent(pet) {
  const wrap = document.createElement("div");
  wrap.style.textAlign = "center";
  wrap.style.maxWidth = "160px";
  if (pet.foto) {
    const img = document.createElement("img");
    img.src = pet.foto;
    img.alt = "";
    img.style.width = "100%";
    img.style.height = "90px";
    img.style.objectFit = "cover";
    img.style.borderRadius = "8px";
    img.style.marginBottom = "6px";
    wrap.appendChild(img);
  }
  const strong = document.createElement("strong");
  strong.textContent = pet.nombre || "Sin nombre";
  wrap.appendChild(strong);
  wrap.appendChild(document.createElement("br"));
  const span = document.createElement("span");
  span.style.color = "#777";
  span.style.fontSize = "0.85rem";
  span.textContent = `${[pet.especie, pet.raza].filter(Boolean).join(" · ")} · ${fmtDistance(pet.distanceKm)}`;
  wrap.appendChild(span);
  return wrap;
}

async function initMap() {
  if (mapInstance) return;
  await loadGoogleMapsBootstrap();
  const { Map, InfoWindow } = await google.maps.importLibrary("maps");
  await google.maps.importLibrary("marker");
  mapInstance = new Map(petsMapEl, {
    center: { lat: -33.4489, lng: -70.6693 },
    zoom: 11,
  });
  mapInfoWindow = new InfoWindow();
}

function clearMapMarkers() {
  mapMarkers.forEach((m) => m.setMap(null));
  mapMarkers = [];
}

function renderMapMarkers() {
  if (!mapInstance) return;
  clearMapMarkers();
  const bounds = new google.maps.LatLngBounds();
  let any = false;
  deckPets.forEach((pet) => {
    if (typeof pet.lat !== "number" || typeof pet.lng !== "number") return;
    const position = { lat: pet.lat, lng: pet.lng };
    const marker = new google.maps.Marker({
      position,
      map: mapInstance,
      icon: pawMarkerIcon(),
      title: pet.nombre || "Mascota",
    });
    marker.addListener("click", () => {
      mapInfoWindow.setContent(buildPetInfoContent(pet));
      mapInfoWindow.open(mapInstance, marker);
    });
    mapMarkers.push(marker);
    bounds.extend(position);
    any = true;
  });
  if (any) mapInstance.fitBounds(bounds, 60);
}

function recenterOnUser() {
  if (!navigator.geolocation || !mapInstance) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      mapInstance.setCenter(here);
      mapInstance.setZoom(12);
      if (userLocationMarker) userLocationMarker.setMap(null);
      userLocationMarker = new google.maps.Marker({
        position: here,
        map: mapInstance,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#4285F4",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
        title: "Tu ubicación",
      });
    },
    () => { /* ubicación denegada o no disponible: se mantiene la vista por defecto */ },
    { timeout: 8000 }
  );
}

async function openMapModal() {
  mapModal.hidden = false;
  await initMap();
  renderMapMarkers();
  recenterOnUser();
}

mapBtn.addEventListener("click", () => {
  if (currentPlan !== "plus") {
    openUpsellModal("Buscar mascotas en el mapa es una función de Patitas Plus.");
    return;
  }
  openMapModal();
});
closeMapModal.addEventListener("click", () => { mapModal.hidden = true; });
