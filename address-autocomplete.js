import { GOOGLE_MAPS_API_KEY } from "./maps-config.js";

let loaderPromise = null;

export function loadGoogleMapsBootstrap() {
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise((resolve) => {
    if (window.google?.maps?.importLibrary) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.textContent = `(g=>{var h,a,k,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b=window;b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),r=new Set,e=new URLSearchParams,u=()=>h||(h=new Promise(async(f,n)=>{await (a=m.createElement("script"));e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src=\`https://maps.\${c}apis.com/maps/api/js?\`+e;d[q]=f;a.onerror=()=>h=n(Error(p+" could not load."));a.nonce=m.querySelector("script[nonce]")?.nonce||"";m.head.append(a)}));d[l]?console.warn(p+" only loads once. Ignoring:",g):d[l]=(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})({key:"${GOOGLE_MAPS_API_KEY}",v:"weekly"});`;
    document.head.appendChild(script);
    const check = setInterval(() => {
      if (window.google?.maps?.importLibrary) {
        clearInterval(check);
        resolve();
      }
    }, 50);
  });
  return loaderPromise;
}

/**
 * Mounts a Google Places autocomplete element inside `container`.
 * Calls onSelect({ direccion, lat, lng }) when the user picks a place.
 * Returns the created element (has a .clear()-like reset via re-creation).
 */
export async function attachAddressAutocomplete(container, onSelect) {
  await loadGoogleMapsBootstrap();
  const { PlaceAutocompleteElement } = await google.maps.importLibrary("places");
  container.innerHTML = "";
  const el = new PlaceAutocompleteElement();
  container.appendChild(el);
  el.addEventListener("gmp-select", async ({ placePrediction }) => {
    const place = placePrediction.toPlace();
    await place.fetchFields({ fields: ["formattedAddress", "location"] });
    onSelect({
      direccion: place.formattedAddress || "",
      lat: place.location ? place.location.lat() : null,
      lng: place.location ? place.location.lng() : null,
    });
  });
  return el;
}
