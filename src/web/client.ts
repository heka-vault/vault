// Shared vanilla JS for every page. No framework; event delegation on document. Every feature is an
// enhancement: forms, links, and <details> all work without it.
//
//   [data-copy="text"] / [data-copy-from="#el"]   copy to the clipboard (input value, <template>
//     content, or text), icon flips to a check, toast "Copied to clipboard"
//   [data-reveal="#chip"][aria-pressed]           SecretValue eye toggle. Only aria-pressed changes
//     (name and title stay "Show KEY"). In a table row the chip fills the cell and the eye and copy stay pinned at its
//     right edge; the value shows on one line in the chip when it fits, otherwise (and always under
//     640px) in a full-width tr.secret-reveal under the row while the chip keeps its dots, so
//     columns, controls, and row heights never move. Re-checked on resize
//   [data-src="url"] around a SecretValue          the value is fetched on first reveal or copy (the page
//     never carries it), then the click replays. A 404 reloads with ?err; a redirect is followed.
//     WebKit only lets the click itself write the clipboard, so copy hands it a pending value
//   [data-select-all]                             select the whole input on focus/click (TokenField)
//   form[data-confirm="Title"]                    <dialog> confirmation before submit; optional
//     data-confirm-body ("{subject}" / "{where}" become mono chips of data-confirm-subject / -where),
//     data-confirm-warning (red callout), data-confirm-action, data-confirm-tone="default",
//     data-confirm-type="slug" (typed confirmation; the typed text is written into the form's
//     [data-confirm-input])
//   details.menu-wrap                             closes on outside click (so one is open at a time), Esc, and
//     focus leaving it; arrow keys move between .menu-item; .row-menu is positioned fixed so table
//     scroll containers don't clip it (hidden until placed, so it never paints at its static spot);
//     on scroll/resize it follows its "…" and closes only once that leaves its table or the viewport
//   [data-dismiss]                                removes the closest .flash
//   input[data-filter="css selector"]             filters matching elements by their data-filter-text,
//     else by visible text minus secret values, sr-only/no-JS text and menus; "/" focuses it;
//     data-filter-empty="#el" is shown when nothing matches, and then the rows' .table-wrap (or table)
//     is hidden so the empty state replaces it
//   .field                                        hint/error ids wired onto the control's aria attributes
//   form submit                                   aria-busy on the form and its submit button (skipped for
//     form[data-no-busy] and form[target]; cleared after 10s, on bfcache restore, and on return to tab)
//
//   toast("text")                                 global: the shared status toast
//
// navigator.clipboard needs a secure context, which a LAN http:// origin is not; fall back to execCommand.
export const CLIENT_JS = `
document.documentElement.classList.add("js");
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const textOf = (el) => !el ? "" : el.matches("input,textarea") ? el.value
    : el instanceof HTMLTemplateElement ? el.content.textContent : el.textContent;
  let toastTimer;
  const toast = (msg) => {
    const t = $("#toast");
    if (!t) return;
    const host = $("dialog[open]") || document.body;
    if (t.parentElement !== host) host.append(t);
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
  };
  self.toast = toast;
  const copied = (c) => {
    c.classList.add("copied");
    setTimeout(() => c.classList.remove("copied"), 1500);
    toast(c.dataset.copyToast || "Copied to clipboard");
  };
  const COPY_FAILED = "Copy failed. Select the text and copy it manually.";
  const copy = (text) => {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    (document.activeElement?.closest("dialog") || document.body).appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok ? Promise.resolve() : Promise.reject();
  };

  const menus = () => $$("details.menu-wrap[open]");
  const closeMenu = (m, focus) => { m.open = false; if (focus) m.querySelector("summary").focus(); };
  const place = (d) => {
    const m = d.querySelector(".menu");
    const r = d.querySelector("summary").getBoundingClientRect();
    const w = m.offsetWidth, h = m.offsetHeight;
    let top = r.bottom + 4;
    if (top + h > innerHeight - 8 && r.top - h - 4 > 8) top = r.top - h - 4;
    m.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + "px";
    m.style.top = top + "px";
  };

  const SKIP = ".secret-value,.sr-only,.nojs-only,.js-only,.menu,[aria-hidden=true],template,script,style";
  const hay = new WeakMap();
  const haystack = (el) => {
    if (el.dataset.filterText !== undefined) return el.dataset.filterText.toLowerCase();
    if (!hay.has(el)) {
      const c = el.cloneNode(true);
      for (const n of c.querySelectorAll(SKIP)) n.remove();
      hay.set(el, c.textContent.replace(/\\s+/g, " ").toLowerCase());
    }
    return hay.get(el);
  };

  const narrow = matchMedia("(max-width:640px)");
  const showValue = (b) => {
    const chip = $(b.dataset.reveal);
    if (!chip) return;
    const on = b.getAttribute("aria-pressed") === "true";
    const val = chip.querySelector(".secret-value");
    const tr = chip.closest("tbody tr");
    if (tr?.hidden) return;
    chip.classList.toggle("revealed", on);
    const below = on && !!tr && (narrow.matches || chip.scrollWidth > chip.clientWidth + 1);
    if (below) chip.classList.remove("revealed");
    let row = document.getElementById(chip.id + "-below");
    if (below && !row) {
      row = document.createElement("tr");
      row.className = "secret-reveal";
      row.id = chip.id + "-below";
      const td = row.insertCell();
      td.colSpan = [...tr.cells].filter((c) => getComputedStyle(c).display !== "none").length;
      const code = document.createElement("code");
      code.className = "secret-chip revealed";
      const v = document.createElement("span");
      v.className = "secret-value";
      v.textContent = val.textContent;
      code.append(v);
      td.append(code);
      let after = tr;
      while (after.nextElementSibling?.classList.contains("secret-reveal")) after = after.nextElementSibling;
      after.after(row);
    } else if (!below && row) row.remove();
    b.setAttribute("aria-controls", below ? chip.id + " " + row.id : chip.id);
  };
  const reveal = (b) => {
    const on = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", String(on));
    showValue(b);
  };
  const load = (b) => {
    const box = b.closest("[data-src]");
    const v = box?.querySelector(".secret-value");
    if (!v || v.dataset.loaded !== undefined) return false;
    if (b.getAttribute("aria-busy")) return true;
    b.setAttribute("aria-busy", "true");
    const src = new URL(box.dataset.src, location.href);
    let leaving = false;
    const value = fetch(src).then((r) => {
      if (r.ok && !r.redirected) return r.text();
      leaving = r.redirected || r.status === 404;
      if (r.redirected) location.assign(r.url);
      else if (r.status === 404) {
        const u = new URL(location.href);
        u.searchParams.set("err", "Secret not found: " + src.searchParams.get("key"));
        location.replace(u);
      }
      throw r;
    });
    const write = b.matches("[data-copy-from]") && isSecureContext && window.ClipboardItem &&
      navigator.clipboard.write([new ClipboardItem({ "text/plain": value.then((t) => new Blob([t], { type: "text/plain" })) })]);
    value.then((t) => {
      v.textContent = t;
      v.dataset.loaded = "";
      b.removeAttribute("aria-busy");
      if (!write) b.click();
    }, () => {
      b.removeAttribute("aria-busy");
      if (!leaving) toast("Could not load the value. Try again.");
    });
    if (write) write.then(() => copied(b), () => value.then(() => toast(COPY_FAILED), () => {}));
    return true;
  };
  const recheck = () => $$('[data-reveal][aria-pressed="true"]').forEach(showValue);
  narrow.addEventListener("change", recheck);

  document.addEventListener("click", (e) => {
    for (const m of menus()) if (!m.contains(e.target)) m.open = false;
    const l = e.target.closest("[data-reveal],[data-copy-from]");
    if (l && load(l)) return;
    const c = e.target.closest("[data-copy],[data-copy-from]");
    if (c) {
      const text = c.dataset.copy ?? textOf($(c.dataset.copyFrom));
      const m = c.closest("details.menu-wrap");
      if (m && c.classList.contains("menu-item")) closeMenu(m, true);
      copy(text).then(() => copied(c), () => toast(COPY_FAILED));
      return;
    }
    const r = e.target.closest("[data-reveal]");
    if (r) return reveal(r);
    const s = e.target.closest("[data-select-all]");
    if (s) return s.select();
    const d = e.target.closest("[data-dismiss]");
    if (d) return d.closest(".flash")?.remove();
  });

  document.addEventListener("toggle", (e) => {
    const d = e.target;
    if (!d.matches?.("details.row-menu")) return;
    if (d.open) { place(d); d.dataset.placed = ""; } else delete d.dataset.placed;
  }, true);
  let raf = 0;
  const follow = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const bar = $("body > .topbar");
      for (const d of $$("details.row-menu[open]")) {
        const r = d.querySelector("summary").getBoundingClientRect();
        const w = d.closest(".table-wrap")?.getBoundingClientRect();
        const top = Math.max(w ? w.top : 0, bar ? bar.getBoundingClientRect().bottom : 0);
        const bottom = Math.min(w ? w.bottom : innerHeight, innerHeight);
        const left = w ? w.left : 0, right = Math.min(w ? w.right : innerWidth, innerWidth);
        if (r.bottom <= top || r.top >= bottom || r.right <= left || r.left >= right) d.open = false;
        else place(d);
      }
    });
  };
  addEventListener("scroll", follow, true);
  addEventListener("resize", follow);
  let rsz = 0;
  addEventListener("resize", () => { clearTimeout(rsz); rsz = setTimeout(recheck, 100); });

  document.addEventListener("focusin", (e) => {
    if (e.target.matches?.("[data-select-all]")) e.target.select();
  });
  document.addEventListener("focusout", (e) => {
    const m = e.target.closest?.("details.menu-wrap[open]");
    if (m && e.relatedTarget && !m.contains(e.relatedTarget)) m.open = false;
  });

  document.addEventListener("keydown", (e) => {
    const open = menus();
    if (e.key === "Escape" && open.length) {
      for (const m of open) closeMenu(m, m.contains(document.activeElement));
      return;
    }
    const m = e.target.closest?.("details.menu-wrap[open]");
    if (m && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      const items = $$(".menu-item", m).filter((i) => i.offsetParent);
      if (!items.length) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement);
      const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i <= 0 ? items.length : i) - 1;
      items[next].focus();
      return;
    }
    const t = e.target;
    const typing = t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
    if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const f = $("[data-filter]");
      if (f) { e.preventDefault(); f.focus(); f.select(); }
    }
  });

  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "confirm-input") {
      const d = $("#confirm-dialog");
      d.querySelector("[data-ok]").disabled = t.value.trim() !== d.dataset.typed;
      return;
    }
    if (!t.dataset.filter) return;
    const q = t.value.trim().toLowerCase();
    let shown = 0;
    const boxes = new Map();
    for (const el of $$(t.dataset.filter)) {
      if (el.classList.contains("secret-reveal")) continue;
      const hit = !q || haystack(el).includes(q);
      el.hidden = !hit;
      if (hit) shown++;
      const box = el.closest(".table-wrap") || el.closest("table");
      if (box) boxes.set(box, (boxes.get(box) || 0) + hit);
    }
    for (const r of $$("tr.secret-reveal")) r.hidden = !!r.previousElementSibling?.hidden;
    const empty = t.dataset.filterEmpty && $(t.dataset.filterEmpty);
    if (empty) {
      empty.hidden = shown > 0;
      for (const [box, n] of boxes) box.hidden = !n;
    }
  });

  const submitAgain = (form, submitter) => {
    form.dataset.confirmed = "1";
    form.requestSubmit(submitter && submitter.form === form ? submitter : undefined);
    delete form.dataset.confirmed;
  };

  const confirmSubmit = (form, submitter) => {
    const f = form.dataset;
    const d = $("#confirm-dialog");
    const subject = f.confirmSubject || "";
    const chips = { "{subject}": subject, "{where}": f.confirmWhere || "" };
    const text = f.confirmBody || (subject ? "{subject}" : "");
    const parts = text.split(/({subject}|{where})/);
    if (!d || typeof d.showModal !== "function") {
      const q = f.confirm + (text ? "\\n\\n" + parts.map((p) => Object.hasOwn(chips, p) ? chips[p] : p).join("") : "");
      if (confirm(q)) submitAgain(form, submitter);
      return;
    }
    const menu = submitter?.closest("details.menu-wrap");
    const returnTo = menu ? menu.querySelector("summary") : submitter;
    if (menu) menu.open = false;
    const typed = f.confirmType || "";
    const ok = d.querySelector("[data-ok]");
    const input = $("#confirm-input");
    $("#confirm-title").textContent = f.confirm;
    const body = $("#confirm-text");
    body.replaceChildren(...parts.map((p) => {
      if (!Object.hasOwn(chips, p)) return p;
      const code = document.createElement("code");
      code.textContent = chips[p];
      return code;
    }));
    body.hidden = !text;
    const warn = $("#confirm-warning");
    warn.querySelector("[data-warning-text]").textContent = f.confirmWarning || "";
    warn.hidden = !f.confirmWarning;
    ok.textContent = f.confirmAction || "Confirm";
    ok.className = f.confirmTone === "default" ? "" : "danger";
    ok.disabled = !!typed;
    d.dataset.typed = typed;
    d.querySelector("[data-typed]").hidden = !typed;
    $("#confirm-typed").textContent = typed;
    input.value = "";
    d.returnValue = "";
    d.onclose = () => {
      const t = $("#toast");
      if (t && t.parentElement === d) document.body.append(t);
      if (d.returnValue !== "ok") return returnTo?.focus();
      const target = form.querySelector("[data-confirm-input]");
      if (target) target.value = input.value.trim();
      submitAgain(form, submitter);
    };
    d.showModal();
    (typed ? input : d.querySelector("[data-cancel]")).focus();
  };

  const busy = new Set();
  const unbusy = () => { for (const el of busy) el.removeAttribute("aria-busy"); busy.clear(); };
  document.addEventListener("submit", (e) => {
    const form = e.target;
    if (form.method === "dialog" || e.defaultPrevented) return;
    if (form.dataset.confirm && form.dataset.confirmed !== "1") {
      e.preventDefault();
      return confirmSubmit(form, e.submitter);
    }
    if (form.hasAttribute("data-no-busy") || form.target) return;
    if (form.getAttribute("aria-busy") === "true") return e.preventDefault();
    for (const el of [form, e.submitter]) if (el) { el.setAttribute("aria-busy", "true"); busy.add(el); }
    setTimeout(unbusy, 10000);
  });

  document.addEventListener("click", (e) => {
    const d = $("#confirm-dialog");
    if (!d?.open) return;
    if (e.target.closest("[data-cancel]") || e.target === d) d.close("");
  });

  addEventListener("pageshow", (e) => { if (e.persisted) unbusy(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) unbusy(); });

  addEventListener("DOMContentLoaded", () => {
    for (const el of $$("form[data-confirm-type] [data-confirm-input]")) el.required = false;
    for (const f of $$(".field")) {
      const c = document.getElementById(f.querySelector("label[for]")?.htmlFor || "");
      if (!c || c.id === "confirm-input") continue;
      const ids = $$(":scope > .hint[id], :scope > .field-error[id]", f).map((n) => n.id);
      const cur = (c.getAttribute("aria-describedby") || "").split(" ").filter(Boolean);
      const all = [...new Set([...cur, ...ids])];
      if (all.length) c.setAttribute("aria-describedby", all.join(" "));
      if ($(":scope > .field-error", f) && !c.hasAttribute("aria-invalid")) c.setAttribute("aria-invalid", "true");
    }
    const url = new URL(location.href);
    if (url.searchParams.has("msg") || url.searchParams.has("err")) {
      url.searchParams.delete("msg");
      url.searchParams.delete("err");
      history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    }
  });
})();
`;
