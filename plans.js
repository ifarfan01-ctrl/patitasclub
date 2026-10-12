import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Patitas Plus es un pago único por 30 días (sin renovación automática),
// así que un usuario solo es "plus" si plusExpiresAt sigue en el futuro.
function isActivePlus(data) {
  if (!data || data.plan !== "plus") return false;
  const expiresAt = data.plusExpiresAt;
  return !!expiresAt && expiresAt.toMillis() > Date.now();
}

// Observa el plan del usuario (users/{uid}). Llama a onChange("free"|"plus", expiresAt)
// cada vez que cambie, donde expiresAt es un Timestamp de Firestore o null.
// Si uid es null (no hay sesión), reporta "free" una vez.
// Devuelve una función para dejar de escuchar.
export function watchUserPlan(db, uid, onChange) {
  if (!uid) {
    onChange("free", null);
    return () => {};
  }
  return onSnapshot(
    doc(db, "users", uid),
    (snap) => {
      const data = snap.exists() ? snap.data() : null;
      onChange(isActivePlus(data) ? "plus" : "free", data ? data.plusExpiresAt || null : null);
    },
    () => onChange("free", null)
  );
}
