import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  doc,
  query,
  where,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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

const gate = document.getElementById("gate");
const gateLoginBtn = document.getElementById("gateLoginBtn");
const gateRegisterBtn = document.getElementById("gateRegisterBtn");

const onboarding = document.getElementById("onboarding");
const addPetBtn = document.getElementById("addPetBtn");

const deckSection = document.getElementById("deckSection");
const myPetLabel = document.getElementById("myPetLabel");
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

const petModal = document.getElementById("petModal");
const petForm = document.getElementById("petForm");
const petError = document.getElementById("petError");
const petSubmit = document.getElementById("petSubmit");
const closePetModal = document.getElementById("closePetModal");
const captureLocationBtn = document.getElementById("captureLocationBtn");
const locationStatus = document.getElementById("locationStatus");

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

// ---- State ----
let currentUser = null;
let myPet = null; // {id, ...data}
let capturedLocation = null; // {lat, lng}
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
  petError.hidden = true;
  petForm.reset();
  capturedLocation = null;
  locationStatus.textContent = "Ubicación: no capturada todavía (obligatoria).";
  locationStatus.classList.remove("ok");
  petSubmit.disabled = true;
  petModal.hidden = false;
});
closePetModal.addEventListener("click", () => { petModal.hidden = true; });

captureLocationBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    locationStatus.textContent = "Tu navegador no soporta geolocalización.";
    return;
  }
  locationStatus.textContent = "Obteniendo ubicación...";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      capturedLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      locationStatus.textContent = "✓ Ubicación capturada.";
      locationStatus.classList.add("ok");
      petSubmit.disabled = false;
    },
    () => {
      capturedLocation = null;
      locationStatus.textContent = "No pudimos obtener tu ubicación. Revisa los permisos del navegador e intenta de nuevo.";
      locationStatus.classList.remove("ok");
      petSubmit.disabled = true;
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

petForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!capturedLocation) return;
  petError.hidden = true;
  petSubmit.disabled = true;
  try {
    const docRef = await addDoc(collection(db, "patimatch_pets"), {
      nombre: document.getElementById("petName").value.trim(),
      especie: document.getElementById("petSpecies").value,
      raza: document.getElementById("petBreed").value.trim(),
      edad: document.getElementById("petAge").value || null,
      foto: document.getElementById("petPhoto").value.trim(),
      descripcion: document.getElementById("petDescription").value.trim(),
      lat: capturedLocation.lat,
      lng: capturedLocation.lng,
      ownerUid: currentUser.uid,
      ownerEmail: currentUser.email,
      createdAt: serverTimestamp(),
    });
    myPet = { id: docRef.id, nombre: document.getElementById("petName").value.trim() };
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
  const parts = [pet.especie, pet.raza, pet.edad ? `${pet.edad} años` : null].filter(Boolean);
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
