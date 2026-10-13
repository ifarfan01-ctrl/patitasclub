// Compatibilidad de Firebase Auth entre el sitio web y las apps nativas
// (Capacitor/Android/iOS). En la web se usa el flujo normal del SDK JS;
// en la app nativa signInWithPopup no funciona (el redirect de Google
// vuelve a una pestaña de Chrome externa que no puede regresar a la
// WebView), así que ahí se usa el plugin nativo @capacitor-firebase/authentication
// y luego se sincroniza la sesión con el SDK JS vía signInWithCredential.
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

function isNative() {
  return !!window.Capacitor?.isNativePlatform?.();
}

// En la app nativa, forzamos persistencia IndexedDB para que la sesión
// sobreviva a reinicios de la app (en la WebView, la detección automática
// del SDK no siempre la elige).
export function getAuthCompat(app) {
  if (isNative()) {
    return initializeAuth(app, { persistence: indexedDBLocalPersistence });
  }
  return getAuth(app);
}

export async function signInWithGoogleCompat(auth, googleProvider) {
  if (isNative()) {
    const { FirebaseAuthentication } = window.Capacitor.Plugins;
    const result = await FirebaseAuthentication.signInWithGoogle();
    const idToken = result?.credential?.idToken;
    if (!idToken) {
      throw new Error("No se recibió el idToken de Google.");
    }
    const credential = GoogleAuthProvider.credential(idToken);
    return signInWithCredential(auth, credential);
  }
  return signInWithPopup(auth, googleProvider);
}
