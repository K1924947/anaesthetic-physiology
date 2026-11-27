/* Registers the service worker so the site can be installed and used offline. */
(function () {
  "use strict";
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function () { /* offline use is optional */ });
  });
})();
