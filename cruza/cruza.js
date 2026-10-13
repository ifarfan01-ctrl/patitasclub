import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
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
  setDoc,
  getDoc,
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
import { attachAddressAutocomplete, loadGoogleMapsBootstrap } from "../address-autocomplete.js";
import { watchUserPlan } from "../plans.js";
import { getAuthCompat, signInWithGoogleCompat } from "../native-auth.js";

const app = initializeApp(firebaseConfig);
const auth = getAuthCompat(app);
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
const termsCheckRow = document.getElementById("termsCheckRow");
const acceptTerms = document.getElementById("acceptTerms");

const publishModal = document.getElementById("publishModal");
const publishForm = document.getElementById("publishForm");
const publishTitle = document.getElementById("publishTitle");
const publishSubmit = document.getElementById("publishSubmit");
const publishError = document.getElementById("publishError");
const closePublishModal = document.getElementById("closePublishModal");
const petPhotoInput = document.getElementById("petPhoto");
const petPhotoPreview = document.getElementById("petPhotoPreview");
const photoStatus = document.getElementById("photoStatus");
const addressContainer = document.getElementById("addressAutocomplete");
const addressStatus = document.getElementById("addressStatus");
const petPhoneInput = document.getElementById("petPhone");

const listingsEl = document.getElementById("listings");
const listingsEmpty = document.getElementById("listingsEmpty");

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

let authMode = "login"; // or "register"
let currentUser = null;
let currentPlan = "free";
let unsubscribePlan = null;
let editingPetId = null;
let editingPetFoto = "";
let editingHasAddress = false;
let selectedAddress = null;
let latestDocs = [];

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

function buildPetInfoContent(data) {
  const wrap = document.createElement("div");
  wrap.style.textAlign = "center";
  wrap.style.maxWidth = "160px";
  if (data.foto) {
    const img = document.createElement("img");
    img.src = data.foto;
    img.alt = "";
    img.style.width = "100%";
    img.style.height = "90px";
    img.style.objectFit = "cover";
    img.style.borderRadius = "8px";
    img.style.marginBottom = "6px";
    wrap.appendChild(img);
  }
  const strong = document.createElement("strong");
  strong.textContent = data.nombre || "Sin nombre";
  wrap.appendChild(strong);
  wrap.appendChild(document.createElement("br"));
  const span = document.createElement("span");
  span.style.color = "#777";
  span.style.fontSize = "0.85rem";
  span.textContent = [data.especie, data.raza].filter(Boolean).join(" · ");
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
  latestDocs.forEach(({ data }) => {
    if (typeof data.mapLat !== "number" || typeof data.mapLng !== "number") return;
    const position = { lat: data.mapLat, lng: data.mapLng };
    const marker = new google.maps.Marker({
      position,
      map: mapInstance,
      icon: pawMarkerIcon(),
      title: data.nombre || "Mascota para cruza",
    });
    marker.addListener("click", () => {
      mapInfoWindow.setContent(buildPetInfoContent(data));
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
    await signInWithGoogleCompat(auth, googleProvider);
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

function ownPetCount() {
  if (!currentUser) return 0;
  return latestDocs.filter(({ data }) => data.ownerUid === currentUser.uid).length;
}

function limitReached() {
  return currentPlan !== "plus" && ownPetCount() >= 1;
}

function updatePublishButtonState() {
  if (!currentUser) {
    publishBtn.hidden = true;
    return;
  }
  publishBtn.hidden = false;
  if (limitReached()) {
    publishBtn.textContent = "Límite alcanzado — hazte Plus";
    publishBtn.classList.add("limit-reached");
  } else {
    publishBtn.textContent = "+ Publicar mascota para cruza";
    publishBtn.classList.remove("limit-reached");
  }
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  renderAuthBox();
  if (unsubscribePlan) {
    unsubscribePlan();
    unsubscribePlan = null;
  }
  unsubscribePlan = watchUserPlan(db, user ? user.uid : null, (plan) => {
    currentPlan = plan;
    updatePublishButtonState();
  });
  renderListings();
});

publishBtn.addEventListener("click", () => {
  if (limitReached()) {
    openUpsellModal("Ya tienes 1 mascota publicada para cruza. Hazte Patitas Plus para publicar sin límite.");
    return;
  }
  editingPetId = null;
  editingPetFoto = "";
  editingHasAddress = false;
  publishTitle.textContent = "Publicar mascota para cruza";
  publishSubmit.textContent = "Publicar";
  publishError.hidden = true;
  publishForm.reset();
  petPhotoInput.required = true;
  petPhotoPreview.hidden = true;
  petPhotoPreview.src = "";
  photoStatus.hidden = true;
  resetAddressField();
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
  if (!selectedAddress && !editingHasAddress) {
    publishError.textContent = "La dirección es obligatoria.";
    publishError.hidden = false;
    return;
  }
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
    if (selectedAddress) {
      data.mapLat = selectedAddress.lat;
      data.mapLng = selectedAddress.lng;
    }
    let petId = editingPetId;
    if (editingPetId) {
      await updateDoc(doc(db, "cruzas", editingPetId), data);
    } else {
      const docRef = await addDoc(collection(db, "cruzas"), {
        ...data,
        ownerUid: currentUser.uid,
        ownerEmail: currentUser.email,
        createdAt: serverTimestamp(),
      });
      petId = docRef.id;
    }
    if (selectedAddress) {
      await setDoc(doc(db, "cruzas", petId, "private", "info"), {
        direccion: selectedAddress.direccion,
        lat: selectedAddress.lat,
        lng: selectedAddress.lng,
        ownerUid: currentUser.uid,
        updatedAt: serverTimestamp(),
      });
    }
    await setDoc(doc(db, "cruzas", petId, "private", "contacto"), {
      telefono: petPhoneInput.value.trim(),
      ownerUid: currentUser.uid,
      updatedAt: serverTimestamp(),
    });
    publishModal.hidden = true;
  } catch (err) {
    publishError.textContent = "No se pudo guardar. Intenta de nuevo.";
    publishError.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

async function openEditModal(petId, pet) {
  editingPetId = petId;
  editingPetFoto = pet.foto || "";
  editingHasAddress = false;
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
  petPhotoInput.required = !pet.foto;
  if (pet.foto) {
    petPhotoPreview.src = pet.foto;
    petPhotoPreview.hidden = false;
  } else {
    petPhotoPreview.hidden = true;
    petPhotoPreview.src = "";
  }
  photoStatus.hidden = true;
  resetAddressField();
  publishModal.hidden = false;

  try {
    const privateSnap = await getDoc(doc(db, "cruzas", petId, "private", "info"));
    if (privateSnap.exists()) {
      editingHasAddress = true;
      addressStatus.textContent = `✓ ${privateSnap.data().direccion} (ya guardada)`;
      addressStatus.hidden = false;
      addressStatus.classList.add("ok");
    }
  } catch (err) {
    // Si no se puede leer, el usuario puede volver a buscar su dirección.
  }

  try {
    const contactoSnap = await getDoc(doc(db, "cruzas", petId, "private", "contacto"));
    if (contactoSnap.exists()) {
      petPhoneInput.value = contactoSnap.data().telefono || "";
    }
  } catch (err) {
    // Si no se puede leer, el usuario puede volver a escribir su contacto.
  }
}

async function deletePet(petId, pet) {
  if (!confirm(`¿Borrar la publicación de ${pet.nombre || "esta mascota"}? Esta acción no se puede deshacer.`)) return;
  try {
    try {
      await deleteDoc(doc(db, "cruzas", petId, "private", "info"));
    } catch (err) {
      // Puede no existir si nunca se guardó una dirección.
    }
    try {
      await deleteDoc(doc(db, "cruzas", petId, "private", "contacto"));
    } catch (err) {
      // Puede no existir si nunca se guardó un contacto.
    }
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
  } else {
    const actions = document.createElement("div");
    actions.className = "pet-card-actions";

    const contactBtn = document.createElement("button");
    contactBtn.className = "link-btn contact-btn";
    contactBtn.textContent = "💬 Contactar";
    contactBtn.addEventListener("click", () => handleContactClick(petId));

    actions.appendChild(contactBtn);
    body.appendChild(actions);
  }

  card.appendChild(body);
  return card;
}

async function handleContactClick(petId) {
  if (currentPlan !== "plus") {
    openUpsellModal("Contactar al dueño de una mascota es una función de Patitas Plus.");
    return;
  }
  try {
    const snap = await getDoc(doc(db, "cruzas", petId, "private", "contacto"));
    const telefono = snap.exists() ? (snap.data().telefono || "").replace(/[^0-9+]/g, "") : "";
    if (!telefono) {
      alert("Este usuario no dejó un número de contacto.");
      return;
    }
    window.open(`https://wa.me/${telefono.replace(/^\+/, "")}`, "_blank", "noopener");
  } catch (err) {
    alert("No se pudo obtener el contacto. Intenta de nuevo.");
  }
}

function renderListings() {
  listingsEl.querySelectorAll(".pet-card").forEach((el) => el.remove());
  listingsEmpty.hidden = latestDocs.length > 0;
  latestDocs.forEach(({ id, data }) => {
    listingsEl.appendChild(petCard(id, data));
  });
  if (mapInstance && !mapModal.hidden) renderMapMarkers();
  syncOwnedMapCoords();
  updatePublishButtonState();
}

// Las publicaciones creadas antes del mapa no tienen mapLat/mapLng. Solo el
// dueño puede leer su dirección privada, así que esto corrige sus propias
// mascotas la próxima vez que entra a esta página con sesión iniciada.
const syncedIds = new Set();

async function syncOwnedMapCoords() {
  if (!currentUser) return;
  const targets = latestDocs.filter(({ id, data }) =>
    data.ownerUid === currentUser.uid && !syncedIds.has(id)
  );
  for (const { id, data } of targets) {
    syncedIds.add(id);
    try {
      const privateSnap = await getDoc(doc(db, "cruzas", id, "private", "info"));
      if (!privateSnap.exists()) continue;
      const { lat, lng } = privateSnap.data();
      if (typeof lat !== "number" || typeof lng !== "number") continue;
      if (data.mapLat === lat && data.mapLng === lng) continue;
      await updateDoc(doc(db, "cruzas", id), { mapLat: lat, mapLng: lng });
    } catch (err) {
      // Si falla, se reintenta en una próxima carga porque no se guardó.
    }
  }
}

const q = query(collection(db, "cruzas"), orderBy("createdAt", "desc"));
onSnapshot(q, (snapshot) => {
  latestDocs = snapshot.docs.map((d) => ({ id: d.id, data: d.data() }));
  renderListings();
}, () => {
  listingsEmpty.hidden = false;
  listingsEmpty.textContent = "No se pudieron cargar las publicaciones. Intenta más tarde.";
});
