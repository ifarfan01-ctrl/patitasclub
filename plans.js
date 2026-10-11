import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Observa el plan del usuario (users/{uid}.plan). Llama a onChange("free"|"plus")
// cada vez que cambie. Si uid es null (no hay sesión), reporta "free" una vez.
// Devuelve una función para dejar de escuchar.
export function watchUserPlan(db, uid, onChange) {
  if (!uid) {
    onChange("free");
    return () => {};
  }
  return onSnapshot(
    doc(db, "users", uid),
    (snap) => onChange(snap.exists() && snap.data().plan === "plus" ? "plus" : "free"),
    () => onChange("free")
  );
}
