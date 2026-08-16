/**
 * HandymanPro CRM — embeddable lead form for client landing pages.
 *
 * A site owner pastes two lines into any page:
 *
 *   <div id="hp-intake"></div>
 *   <script src="https://<workspace>/intake-embed.js"
 *           data-intake-url="https://<workspace>/api/intake/wo_KEY"
 *           data-lang="en"></script>
 *
 * and gets a name / phone / message form that posts straight to the intake
 * endpoint. Everything lives in this one file — no fonts, no libraries, no
 * second request — because the landings this ships to are static pages on
 * shared hosting where a broken CDN link means a broken form under paid traffic.
 *
 * The visible cost of embedding is that the intake key sits in the page source.
 * That trade is documented in docs/LANDING-FORMS.md: throttling plus one-click
 * key revocation is the defence, and clients with an ad budget get the
 * server-side PHP forward instead.
 */
(function () {
  "use strict";

  /**
   * currentScript is only reliable while the script executes, so the config is
   * read immediately even though rendering may wait for DOMContentLoaded.
   */
  var script =
    document.currentScript ||
    document.querySelector('script[src*="intake-embed"]');
  if (!script) return;

  var INTAKE_URL = script.getAttribute("data-intake-url") || "";
  var TARGET_ID = script.getAttribute("data-target") || "hp-intake";
  var LANG = script.getAttribute("data-lang") === "uk" ? "uk" : "en";

  /**
   * Two languages the current landings actually run in. Copy is deliberately
   * plain: this form sits inside somebody else's page and should read like
   * part of it, not like an announcement from a third-party product.
   */
  var I18N = {
    en: {
      name: "Your name",
      phone: "Phone",
      message: "How can we help?",
      submit: "Send request",
      sending: "Sending…",
      success: "Thank you! We received your request and will call you back shortly.",
      needName: "Please enter your name.",
      needPhone: "Please enter your phone number.",
      tooMany: "Too many requests from this device. Please try again in a few minutes.",
      failed: "Could not send the request. Please try again, or just call us.",
    },
    uk: {
      name: "Ваше імʼя",
      phone: "Телефон",
      message: "Чим допомогти?",
      submit: "Надіслати заявку",
      sending: "Надсилаємо…",
      success:
        "Дякуємо! Ми отримали вашу заявку і скоро зателефонуємо.",
      needName: "Вкажіть, будь ласка, імʼя.",
      needPhone: "Вкажіть, будь ласка, телефон.",
      tooMany:
        "Забагато заявок з цього пристрою. Спробуйте за кілька хвилин.",
      failed:
        "Не вдалося надіслати заявку. Спробуйте ще раз або просто зателефонуйте.",
    },
  };
  var T = I18N[LANG];

  /**
   * The stylesheet inherits everything it can (font, text colour, background)
   * so the form takes the landing's look for free; the widget only draws what
   * a bare form cannot live without — field borders, spacing, the two state
   * colours. All selectors sit under .hp-if to stay out of the host page's way.
   */
  var CSS =
    ".hp-if{font:inherit;color:inherit;max-width:26rem}" +
    ".hp-if *{box-sizing:border-box}" +
    ".hp-if label{display:block;margin:0 0 .75rem}" +
    ".hp-if .hp-if-label{display:block;font-size:.875em;margin-bottom:.25rem;opacity:.85}" +
    ".hp-if input,.hp-if textarea{display:block;width:100%;font:inherit;color:inherit;" +
    "background:transparent;border:1px solid rgba(128,128,128,.55);border-radius:3px;" +
    "padding:.5rem .625rem;margin:0}" +
    ".hp-if input:focus,.hp-if textarea:focus{outline:2px solid currentColor;outline-offset:1px}" +
    ".hp-if textarea{min-height:4.5rem;resize:vertical}" +
    ".hp-if button{font:inherit;font-weight:600;cursor:pointer;border:1px solid currentColor;" +
    "border-radius:3px;background:transparent;color:inherit;padding:.5rem 1.25rem}" +
    ".hp-if button:disabled{opacity:.55;cursor:default}" +
    ".hp-if .hp-if-error{color:#b3261e;font-size:.875em;margin:.5rem 0 0;min-height:1.25em}" +
    ".hp-if .hp-if-success{color:#1b7f55;margin:0}" +
    /* Honeypot: moved out of view rather than display:none, because the dumber
       bots skip inputs the layout engine dropped and only fill the ones that
       still occupy a box. */
    ".hp-if .hp-if-hp{position:absolute!important;left:-6000px;top:auto;width:1px;height:1px;overflow:hidden}";

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return "&#" + ch.charCodeAt(0) + ";";
    });
  }

  function render() {
    var mount = document.getElementById(TARGET_ID);
    if (!mount || !INTAKE_URL) return;

    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    var form = document.createElement("form");
    form.className = "hp-if";
    form.noValidate = true;
    form.innerHTML =
      '<label><span class="hp-if-label">' + esc(T.name) + "</span>" +
      '<input type="text" name="name" autocomplete="name" maxlength="120"></label>' +
      '<label><span class="hp-if-label">' + esc(T.phone) + "</span>" +
      '<input type="tel" name="phone" autocomplete="tel" maxlength="40"></label>' +
      '<label><span class="hp-if-label">' + esc(T.message) + "</span>" +
      '<textarea name="message" maxlength="1000"></textarea></label>' +
      /* The honeypot pretends to be a real field. "company_website" is absent
         from every legitimate quiz, so a value here is a bot's autofill. */
      '<label class="hp-if-hp" aria-hidden="true">Website' +
      '<input type="text" name="company_website" tabindex="-1" autocomplete="off"></label>' +
      '<button type="submit">' + esc(T.submit) + "</button>" +
      '<p class="hp-if-error" role="alert"></p>';
    mount.textContent = "";
    mount.appendChild(form);

    var button = form.querySelector("button");
    var errorLine = form.querySelector(".hp-if-error");
    var sending = false;

    function fail(message) {
      sending = false;
      button.disabled = false;
      button.textContent = T.submit;
      errorLine.textContent = message;
    }

    function succeed() {
      var done = document.createElement("p");
      done.className = "hp-if hp-if-success";
      done.setAttribute("role", "status");
      done.textContent = T.success;
      mount.textContent = "";
      mount.appendChild(done);
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (sending) return;

      var name = form.elements.name.value.trim();
      var phone = form.elements.phone.value.trim();
      var message = form.elements.message.value.trim();

      if (!name) return fail(T.needName);
      /* The endpoint accepts phone OR email, but this small form only asks for
         a phone: its buyers are HVAC and moving shops, and a lead they cannot
         dial is a lead they will not work. */
      if (phone.replace(/\D/g, "").length < 7) return fail(T.needPhone);

      /* A filled honeypot gets the thank-you screen and no request at all —
         showing the bot an error would invite it to retry until one lands. */
      if (form.elements.company_website.value) return succeed();

      sending = true;
      button.disabled = true;
      button.textContent = T.sending;
      errorLine.textContent = "";

      /* One id per submission attempt, shaped like the quizzes' event_id: if
         the visitor's connection drops after the server saved the lead and he
         resubmits, the CRM's replay check folds both into one enquiry. */
      var payload = {
        event_id:
          "emb_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
        name: name,
        phone: phone,
        page: location.href,
      };
      if (message) payload.message = message;

      var abort = null;
      var timer = null;
      if (typeof AbortController === "function") {
        abort = new AbortController();
        /* Ten seconds covers a cold serverless start; past that the visitor is
           staring at "Sending…" and about to leave the page anyway. */
        timer = setTimeout(function () {
          abort.abort();
        }, 10000);
      }

      fetch(INTAKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: abort && abort.signal,
      })
        .then(function (res) {
          /* 200 deduped and 201 created look identical to the visitor: his
             request is in the system either way. */
          if (res.ok) return succeed();
          if (res.status === 429) return fail(T.tooMany);
          /* 404 (revoked key), 422, 500 — none of these are the visitor's
             fault and none of them are fixable from his side, so they all
             collapse into one message that points him at the phone number. */
          return fail(T.failed);
        })
        .catch(function () {
          return fail(T.failed);
        })
        .finally(function () {
          if (timer) clearTimeout(timer);
        });
    });
  }

  /* The snippet may sit in <head> or above the target div; render only once
     the div can exist. */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
