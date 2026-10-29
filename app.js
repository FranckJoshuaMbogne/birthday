/* For my little bird — app logic
   Content (pages + photos) lives encrypted in vault.json and only opens with the right code. */
(function () {
  "use strict";
  var KEY_STORE = "littlebird.key";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- helpers ---------- */
  function b64(s) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function toB64(buf) { var u = new Uint8Array(buf), s = ""; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); }
  function store(get, val) { try { if (get) return localStorage.getItem(KEY_STORE); if (val === null) localStorage.removeItem(KEY_STORE); else localStorage.setItem(KEY_STORE, val); } catch (e) { return null; } }

  var vaultP = fetch("vault.json", { cache: "no-cache" }).then(function (r) { return r.json(); });

  function deriveKey(pin, v) {
    return crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]).then(function (base) {
      return crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64(v.salt), iterations: v.iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
    });
  }
  function decrypt(key, v) {
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(v.iv) }, key, b64(v.ct)).then(function (pt) { return JSON.parse(new TextDecoder().decode(pt)); });
  }

  /* ---------- sky: floating hearts & petals ---------- */
  var sky = $("#sky"), ctx = sky.getContext("2d"), parts = [], W, H, dpr;
  function size() { dpr = Math.min(window.devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; sky.width = W * dpr; sky.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  size(); addEventListener("resize", size);
  var COLORS = ["#D96C80", "#F2B8B5", "#C9A25E", "#F9DDD6", "#8E3B55"];
  function heartPath(c, s) { c.beginPath(); c.moveTo(0, s * .3); c.bezierCurveTo(0, 0, -s * .5, 0, -s * .5, s * .3); c.bezierCurveTo(-s * .5, s * .6, 0, s * .8, 0, s); c.bezierCurveTo(0, s * .8, s * .5, s * .6, s * .5, s * .3); c.bezierCurveTo(s * .5, 0, 0, 0, 0, s * .3); c.fill(); }
  function birdPath(c, s) { c.beginPath(); c.ellipse(0, 0, s * .55, s * .45, 0, 0, 7); c.fill(); c.beginPath(); c.moveTo(s * .5, -s * .12); c.lineTo(s * .8, 0); c.lineTo(s * .5, s * .1); c.fill(); c.beginPath(); c.moveTo(-s * .5, 0); c.lineTo(-s * .85, -s * .25); c.lineTo(-s * .75, s * .15); c.fill(); }
  function spawnAmbient() { parts.push({ x: Math.random() * W, y: H + 20, vx: (Math.random() - .5) * .3, vy: -(.25 + Math.random() * .45), s: 8 + Math.random() * 10, r: Math.random() * 6, vr: (Math.random() - .5) * .01, a: .25 + Math.random() * .3, c: COLORS[(Math.random() * 3) | 0], t: Math.random() < .7 ? "h" : "p", life: 1e9 }); }
  function burst(x, y, n, birds) {
    for (var i = 0; i < n; i++) {
      var ang = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 6;
      parts.push({ x: x, y: y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 3, s: 10 + Math.random() * 16, r: Math.random() * 6, vr: (Math.random() - .5) * .1, a: 1, c: COLORS[(Math.random() * COLORS.length) | 0], t: birds && Math.random() < .35 ? "b" : (Math.random() < .75 ? "h" : "p"), life: 160 + Math.random() * 80, g: .06 });
    }
  }
  var tick = 0;
  function loop() {
    ctx.clearRect(0, 0, W, H); tick++;
    if (!reduce && tick % 50 === 0 && parts.length < 40) spawnAmbient();
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.x += p.vx + (p.g ? 0 : Math.sin((tick + i * 40) / 60) * .25); p.y += p.vy; if (p.g) { p.vy += p.g; p.vx *= .99; }
      p.r += p.vr; p.life--;
      var alpha = p.life < 60 ? p.a * p.life / 60 : p.a;
      if (p.y < -40 || p.y > H + 60 || p.life <= 0) { parts.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = p.c; ctx.translate(p.x, p.y);
      if (p.t === "b") { ctx.scale(p.vx < 0 ? -1 : 1, 1); birdPath(ctx, p.s * 1.4); }
      else { ctx.rotate(Math.sin(p.r) * .5); if (p.t === "h") heartPath(ctx, p.s); else { ctx.beginPath(); ctx.ellipse(0, 0, p.s * .5, p.s * .28, p.r, 0, 7); ctx.fill(); } }
      ctx.restore();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  /* ---------- lock ---------- */
  var code = "", busy = false, cells = $$("#pin b"), msg = $("#lockMsg");
  function paint() { cells.forEach(function (c, i) { c.className = i < code.length ? "f" : (i === code.length ? "c" : ""); }); }
  paint();
  function press(k) {
    if (busy) return;
    if (k === "back") code = code.slice(0, -1);
    else if (k === "clear") code = "";
    else if (code.length < 8) code += k;
    msg.innerHTML = "&nbsp;"; paint();
    if (code.length === 8) tryCode(code);
  }
  $("#pad").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) press(b.getAttribute("data-k")); });
  addEventListener("keydown", function (e) {
    if (!document.body.classList.contains("locked")) return;
    if (/^[0-9]$/.test(e.key)) press(e.key);
    else if (e.key === "Backspace") press("back");
    else if (e.key === "Escape") press("clear");
  });

  function tryCode(pin) {
    busy = true; msg.textContent = "Checking…";
    vaultP.then(function (v) { return deriveKey(pin, v).then(function (key) { return decrypt(key, v).then(function (data) { return { key: key, data: data }; }); }); })
      .then(function (res) {
        crypto.subtle.exportKey("raw", res.key).then(function (raw) { store(false, toB64(raw)); });
        msg.textContent = "Welcome, little bird ♥";
        openSite(res.data, true);
      })
      .catch(function () {
        busy = false; code = ""; msg.textContent = "Not quite, little bird — try again.";
        var pin = $("#pin"); pin.classList.remove("bad"); void pin.offsetWidth; pin.classList.add("bad");
        setTimeout(function () { pin.classList.remove("bad"); paint(); }, 600);
      });
  }

  // returning visitor on the same device
  var saved = store(true);
  if (saved) {
    vaultP.then(function (v) {
      return crypto.subtle.importKey("raw", b64(saved), { name: "AES-GCM" }, false, ["decrypt"]).then(function (k) { return decrypt(k, v); });
    }).then(function (data) { openSite(data, false); }).catch(function () { store(false, null); });
  }

  /* ---------- open the site ---------- */
  var IMG = {};
  function openSite(data, animate) {
    IMG = data.img;
    var app = $("#app");
    app.innerHTML = data.html;
    $$("[data-src]", app).forEach(function (el) { el.src = IMG[el.getAttribute("data-src")]; });
    $$("[data-bg]", app).forEach(function (el) { el.style.backgroundImage = "url(" + IMG[el.getAttribute("data-bg")] + ")"; });
    var lock = $("#lock");
    function reveal() {
      app.hidden = false; document.body.classList.remove("locked");
      lock.classList.add("gone"); setTimeout(function () { lock.remove(); }, 1100);
      initApp();
    }
    if (animate && !reduce) {
      lock.classList.add("opening");
      var r = $("#lockCard").getBoundingClientRect();
      setTimeout(function () { burst(r.left + r.width / 2, r.top + r.height / 2, 70, true); }, 350);
      setTimeout(reveal, 1300);
    } else reveal();
  }

  /* ---------- app ---------- */
  var io;
  function initApp() {
    var nav = $("#nav");
    addEventListener("scroll", function () { nav.classList.toggle("solid", scrollY > 30); growBranch(); }, { passive: true });
    $("#burger").addEventListener("click", function () { nav.classList.toggle("open"); });
    $("#links").addEventListener("click", function () { nav.classList.remove("open"); });

    io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { threshold: .15, rootMargin: "0px 0px -40px 0px" });

    // polaroid tilt + lightbox
    $$(".pol").forEach(function (p) {
      p.addEventListener("pointermove", function (e) {
        if (e.pointerType !== "mouse") return;
        var r = p.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        p.style.setProperty("--ty", (x * 14) + "deg"); p.style.setProperty("--tx", (-y * 14) + "deg");
      });
      p.addEventListener("pointerleave", function () { p.style.removeProperty("--tx"); p.style.removeProperty("--ty"); });
      p.addEventListener("click", function () {
        var src = p.querySelector("[data-src],[data-bg]"), name = src.getAttribute("data-src") || src.getAttribute("data-bg");
        var lb = $("#lightbox"); $(".lb-img", lb).style.backgroundImage = "url(" + IMG[name] + ")";
        $("p", lb).textContent = p.querySelector("figcaption").firstChild.textContent.trim();
        lb.hidden = false;
      });
    });
    $("#lightbox").addEventListener("click", function () { this.hidden = true; });

    // envelopes
    $$(".env").forEach(function (env) {
      env.addEventListener("click", function () {
        var wasOpen = env.classList.contains("open");
        env.classList.toggle("open");
        if (!wasOpen) { var r = env.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + 40, 14, false); }
      });
    });

    // wishes
    $("#blow").addEventListener("click", function () {
      var cake = $("#cake");
      if (cake.classList.contains("out")) return;
      cake.classList.add("out"); this.textContent = "Your wish is on its way ♥";
      var r = cake.getBoundingClientRect();
      for (var i = 0; i < 4; i++) setTimeout(function () { burst(Math.random() * W, H * (.2 + Math.random() * .4), 40, true); }, i * 350);
      burst(r.left + r.width / 2, r.top + r.height * .15, 60, true);
      setTimeout(function () { $("#wishMsg").classList.add("show"); }, 700);
      if (!music.on) toggleMusic();
    });

    $("#music").addEventListener("click", toggleMusic);
    addEventListener("hashchange", route);
    route();
  }

  function route() {
    var name = (location.hash.match(/^#\/(\w+)/) || [])[1] || "home";
    var page = $('.page[data-page="' + name + '"]') || $('.page[data-page="home"]');
    name = page.getAttribute("data-page");
    $$(".page").forEach(function (p) { p.classList.toggle("on", p === page); });
    $$("#links a").forEach(function (a) { a.classList.toggle("on", a.getAttribute("data-r") === name); });
    window.scrollTo(0, 0);
    $$(".rv", page).forEach(function (el) { el.classList.remove("in"); io.observe(el); });
    document.title = name === "home" ? "Happy Birthday, Priyanka" : (page.querySelector(".phead h1").textContent + " · For my little bird");
    growBranch();
  }

  function growBranch() {
    var tl = $('.page.on .timeline'); if (!tl) return;
    var r = tl.getBoundingClientRect(), p = (innerHeight * .75 - r.top) / r.height;
    $(".branch", tl).style.setProperty("--grow", Math.max(0, Math.min(1, p)).toFixed(3));
  }

  /* ---------- music box (Happy Birthday, generated live) ---------- */
  var music = { on: false, ac: null, timer: null };
  var N = { G4: 392, A4: 440, B4: 493.9, C5: 523.3, D5: 587.3, E5: 659.3, F5: 698.5, G5: 784 };
  var SONG = [["G4", .75], ["G4", .25], ["A4", 1], ["G4", 1], ["C5", 1], ["B4", 2],
              ["G4", .75], ["G4", .25], ["A4", 1], ["G4", 1], ["D5", 1], ["C5", 2],
              ["G4", .75], ["G4", .25], ["G5", 1], ["E5", 1], ["C5", 1], ["B4", 1], ["A4", 2],
              ["F5", .75], ["F5", .25], ["E5", 1], ["C5", 1], ["D5", 1], ["C5", 3]];
  function playSong() {
    var ac = music.ac, t = ac.currentTime + .1, beat = .42;
    SONG.forEach(function (n) {
      [1, 2].forEach(function (h, i) {
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = i ? "sine" : "triangle"; o.frequency.value = N[n[0]] * h;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(i ? .03 : .12, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + 1.6);
        o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 1.7);
      });
      t += n[1] * beat;
    });
    music.timer = setTimeout(function () { if (music.on) playSong(); }, (t - ac.currentTime + 1.5) * 1000);
  }
  function toggleMusic() {
    var btn = $("#music");
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    music.on = !music.on; btn.classList.toggle("on", music.on); btn.setAttribute("aria-label", music.on ? "Pause music" : "Play music");
    if (music.on) { music.ac = new AC(); playSong(); }
    else { clearTimeout(music.timer); if (music.ac) music.ac.close(); music.ac = null; }
  }
})();
