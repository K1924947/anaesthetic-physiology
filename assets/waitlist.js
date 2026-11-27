/* Plus waitlist form (home page). Posts one row to Supabase through its REST
   endpoint using the public anon key, which can INSERT only (see
   supabase/waitlist.sql). Nothing is read back and nothing is cached. */
(function () {
  "use strict";

  /* Fill these in once the Supabase project exists. The anon (publishable)
     key is designed to be public; row-level security limits it to INSERT. */
  var WAITLIST_URL = "";   /* e.g. https://abcdxyz.supabase.co */
  var WAITLIST_KEY = "";   /* the project's anon / publishable key */

  var over = window.PHYSIO_WAITLIST_CONFIG; /* optional override, used by tests */
  if (over) { WAITLIST_URL = over.url || WAITLIST_URL; WAITLIST_KEY = over.key || WAITLIST_KEY; }

  /* Change this whenever the consent wording or privacy notice changes. */
  var CONSENT_VERSION = "waitlist-2026-11-27";

  var form = document.getElementById("waitlist-form");
  if (!form) return;
  var status = document.getElementById("waitlist-status");
  var btn = form.querySelector("button[type=submit]");

  function say(kind, text) {
    status.setAttribute("data-kind", kind);
    status.textContent = "";
    var tag = document.createElement("strong");
    tag.textContent = kind === "ok" ? "Done. " : "Problem. ";
    status.appendChild(tag);
    status.appendChild(document.createTextNode(text));
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = form.elements.email.value.trim();
    var role = form.elements.role.value;
    if (!form.checkValidity()) {
      say("err", "Please enter a valid email address and tick the consent box.");
      return;
    }
    if (!WAITLIST_URL || !WAITLIST_KEY) {
      say("err", "The waitlist is not open yet. Please try again soon.");
      return;
    }
    btn.disabled = true;
    status.removeAttribute("data-kind");
    status.textContent = "Sending...";

    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 12000) : null;
    fetch(WAITLIST_URL.replace(/\/+$/, "") + "/rest/v1/waitlist", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": WAITLIST_KEY,
        "Authorization": "Bearer " + WAITLIST_KEY,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({ email: email, role: role || null, consent_version: CONSENT_VERSION, source: "home" }),
      cache: "no-store",
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      /* 409 means the address is already on the list: treat it as success
         so the form does not reveal who has signed up. */
      if (r.ok || r.status === 409) {
        form.reset();
        say("ok", "You're on the Plus waitlist. We will email you at " + email + " when Plus is ready to try. You can unsubscribe at any time from the link in those emails, or by writing to [CONTACT EMAIL].");
      } else {
        say("err", "Sorry, that did not work. Please try again in a moment.");
      }
    }).catch(function () {
      say("err", "Sorry, we could not reach the server. Check your connection and try again.");
    }).then(function () {
      if (timer) clearTimeout(timer);
      btn.disabled = false;
    });
  });
})();
