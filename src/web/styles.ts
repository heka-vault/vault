// Design tokens and shared component styles. Page-specific styles live next to each page as `css`,
// scoped under the page class passed to <Layout page="…">. See DESIGN-SYSTEM notes for usage.
// Raw px: 1px hairlines, 1.5/2px strokes, outlines and underlines, icon/avatar/dot/spinner sizes, the
// kbd baseline nudge, breakpoints. All else is a token.

const chevron = (hex: string) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23${hex}' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4.5 6.25 8 9.75l3.5-3.5'/%3E%3C/svg%3E")`;

const X_MASK =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23000' stroke-width='1.5' stroke-linecap='round'%3E%3Cpath d='m4 4 8 8M12 4l-8 8'/%3E%3C/svg%3E") center/16px no-repeat`;

/** Light theme custom properties (declarations only, so a scope can force a theme). */
export const TOKENS_LIGHT = `
--bg:#ffffff;--bg-subtle:#fafafa;--bg-muted:#f4f4f5;--bg-hover:#f4f4f5;--bg-active:#e4e4e7;
--surface:#ffffff;--surface-raised:#ffffff;
--fg:#09090b;--fg-muted:#52525b;--fg-subtle:#71717a;
--inverse:#18181b;--inverse-hover:#3f3f46;--fg-on-inverse:#fafafa;
--border:#e4e4e7;--border-strong:#d4d4d8;--border-input:#8e8e96;
--accent:#1a3fb0;--accent-subtle:#eff4ff;--accent-border:#c7d7fe;--focus:#2563eb;
--danger:#b42318;--danger-hover:#912018;--danger-fg:#9b1c13;--danger-subtle:#fef3f2;--danger-border:#fecdca;--fg-on-danger:#ffffff;
--success:#067647;--success-fg:#05603a;--success-subtle:#ecfdf3;--success-border:#abefc6;
--warning:#ca8a04;--warning-fg:#713f12;--warning-subtle:#fefce8;--warning-border:#fde68a;
--prod:#ea580c;--prod-fg:#8b3410;--prod-subtle:#fff7ed;--prod-border:#fed7aa;
--segment-active:#ffffff;--segment-shadow:0 1px 2px rgb(9 9 11 / .06),0 0 0 1px #e4e4e7;
--scroll-shadow:rgb(9 9 11 / .14);
--th-bg:rgb(9 9 11 / .02);--row-hover:rgb(9 9 11 / .045);
--shadow-xs:0 1px 2px rgb(9 9 11 / .05);
--shadow-md:0 4px 16px rgb(9 9 11 / .08),0 1px 3px rgb(9 9 11 / .06);
--shadow-lg:0 24px 48px -12px rgb(9 9 11 / .18),0 2px 6px rgb(9 9 11 / .06);
--backdrop:rgb(9 9 11 / .4);
--chevron:${chevron("52525b")};
color-scheme:light;
`;

/** Dark theme custom properties. */
export const TOKENS_DARK = `
--bg:#09090b;--bg-subtle:#111114;--bg-muted:#1b1b1f;--bg-hover:#1b1b1f;--bg-active:#27272a;
--surface:#0e0e11;--surface-raised:#141417;
--fg:#fafafa;--fg-muted:#a8a8b1;--fg-subtle:#8b8b94;
--inverse:#fafafa;--inverse-hover:#d4d4d8;--fg-on-inverse:#09090b;
--border:#26262b;--border-strong:#34343a;--border-input:#63636c;
--accent:#8ab0ff;--accent-subtle:rgb(59 108 246 / .16);--accent-border:rgb(122 162 255 / .35);--focus:#6b9bff;
--danger:#c8291d;--danger-hover:#a8231a;--danger-fg:#ff8f84;--danger-subtle:rgb(240 68 56 / .12);--danger-border:rgb(255 143 132 / .32);--fg-on-danger:#ffffff;
--success:#17b26a;--success-fg:#4ade80;--success-subtle:rgb(23 178 106 / .12);--success-border:rgb(74 222 128 / .3);
--warning:#eab308;--warning-fg:#fde047;--warning-subtle:rgb(234 179 8 / .1);--warning-border:rgb(250 204 21 / .28);
--prod:#fb923c;--prod-fg:#fdba74;--prod-subtle:rgb(234 88 12 / .14);--prod-border:rgb(251 146 60 / .35);
--segment-active:#2a2a2f;--segment-shadow:0 0 0 1px #3a3a41;
--scroll-shadow:rgb(255 255 255 / .12);
--th-bg:rgb(255 255 255 / .02);--row-hover:rgb(255 255 255 / .045);
--shadow-xs:0 1px 2px rgb(0 0 0 / .4);
--shadow-md:0 8px 24px rgb(0 0 0 / .5),0 0 0 1px rgb(255 255 255 / .02);
--shadow-lg:0 24px 64px -12px rgb(0 0 0 / .7);
--backdrop:rgb(0 0 0 / .6);
--chevron:${chevron("a8a8b1")};
color-scheme:dark;
`;

/** Theme-independent tokens: type, space, radii, sizes, motion. */
const TOKENS_BASE = `
--font-sans:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue","Noto Sans","Liberation Sans",Arial,sans-serif;
--font-mono:ui-monospace,"SF Mono",SFMono-Regular,"Cascadia Mono","JetBrains Mono",Menlo,Consolas,"Noto Sans Mono","DejaVu Sans Mono","Liberation Mono",monospace;
--text-xs:12px;--text-sm:13px;--text-base:14px;--text-md:16px;--text-lg:20px;--text-xl:24px;
--lh-xs:16px;--lh-sm:18px;--lh-base:20px;--lh-md:24px;--lh-lg:28px;--lh-xl:32px;
--s-0_5:2px;--s-1:4px;--s-1_5:6px;--s-2:8px;--s-3:12px;--s-4:16px;--s-5:20px;--s-6:24px;--s-8:32px;--s-10:40px;--s-12:48px;--s-16:64px;
--r-sm:4px;--r:6px;--r-lg:8px;--r-xl:12px;--r-full:999px;
--h-xs:20px;--h-sm:28px;--h:32px;--h-lg:40px;--row:48px;
--w-page:1120px;--w-search:320px;--w-form:560px;--w-narrow:440px;--w-auth:360px;--w-prose:640px;--w-menu:240px;--w-menu-sm:192px;--w-field-min:160px;--w-search-min:200px;
--gutter:32px;--topbar:56px;--blur:10px;
--ease:cubic-bezier(.2,0,0,1);--dur-1:120ms;--dur-2:200ms;
`;

// Scroll-edge shadows for horizontally scrolling tables: the `local` covers move with the content and
// hide the `scroll` shadows at each end, so a shadow only shows on a side that has hidden content.
const edges = (fill: string) =>
  `background:linear-gradient(to right,${fill} 40%,transparent) left center/var(--s-10) 100% no-repeat local,linear-gradient(to left,${fill} 40%,transparent) right center/var(--s-10) 100% no-repeat local,radial-gradient(farthest-side at 0 50%,var(--scroll-shadow),transparent) left center/var(--s-3) 100% no-repeat scroll,radial-gradient(farthest-side at 100% 50%,var(--scroll-shadow),transparent) right center/var(--s-3) 100% no-repeat scroll,${fill}`;
const SCROLL_EDGES = edges("var(--surface)");

export const CSS = `
:root{${TOKENS_BASE}${TOKENS_LIGHT}}
@media (prefers-color-scheme:dark){:root{${TOKENS_DARK}}}
@media (max-width:640px){:root{--gutter:var(--s-4)}}
@media (pointer:coarse){:root{--h-sm:32px;--h:40px;--h-lg:44px;--row:52px}}
@media (prefers-reduced-motion:reduce){:root{--dur-1:0ms;--dur-2:0ms}:not(td.actions,th.actions),::before,::after{animation:none!important;transition:none!important}}

*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;scroll-padding-top:calc(var(--topbar) + var(--s-2));scroll-padding-bottom:var(--s-2)}
body{margin:0;min-height:100vh;background:var(--bg);color:var(--fg);font-family:var(--font-sans);font-size:var(--text-base);line-height:var(--lh-base);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
::selection{background:var(--accent-subtle);color:inherit}
strong,b{font-weight:600}
h1,h2,h3,h4{margin:0;color:var(--fg);font-weight:600;text-wrap:balance}
h1{font-size:var(--text-xl);line-height:var(--lh-xl);letter-spacing:-.018em}
h2{font-size:var(--text-md);line-height:var(--lh-md);letter-spacing:-.01em;margin:var(--s-10) 0 var(--s-3)}
h3{font-size:var(--text-base);line-height:var(--lh-base);margin:0 0 var(--s-3)}
p{margin:0 0 var(--s-3);text-wrap:pretty}
a{color:var(--accent);text-decoration:none;text-underline-offset:2px;text-decoration-thickness:1px}
a:hover{text-decoration:underline}
p a,li a,dd a,.flash a{text-decoration:underline}
svg{flex:none}
.ic *{vector-effect:non-scaling-stroke}
hr{border:0;border-top:1px solid var(--border);margin:var(--s-8) 0}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
:focus:not(:focus-visible){outline:none}

.sr-only{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
html:not(.js) .js-only{display:none!important}
.js .nojs-only{display:none!important}
.muted{color:var(--fg-muted)}
.subtle{color:var(--fg-subtle)}
.mono{font-family:var(--font-mono);font-size:var(--text-sm)}
.tnum{font-variant-numeric:tabular-nums}
.nowrap{white-space:nowrap}
.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.form-page,.narrow{max-width:var(--w-form)}
.row{display:flex;gap:var(--s-2);align-items:center;flex-wrap:wrap}
.row>input:not([type=checkbox]):not([type=radio]){flex:1 1 var(--w-field-min);width:auto}
.stack{display:grid;gap:var(--s-4)}
.spacer{flex:1}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--s-4);margin:0 0 var(--s-4)}
.grid>*{margin:0}
@media (max-width:768px){.grid{grid-template-columns:minmax(0,1fr)}}
.show-sm{display:none}
@media (max-width:640px){.hide-sm{display:none!important}.show-sm{display:revert}}

.skip{position:absolute;left:var(--s-2);top:calc(-1 * var(--s-12));z-index:50;padding:var(--s-2) var(--s-3);background:var(--inverse);color:var(--fg-on-inverse);border-radius:var(--r);font-weight:500}
.skip:focus{top:var(--s-2);text-decoration:none}
.topbar{position:sticky;top:0;z-index:20;background:var(--bg);border-bottom:1px solid var(--border)}
@supports (backdrop-filter:blur(1px)){.topbar{background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:saturate(1.6) blur(var(--blur))}}
.topbar-in{display:flex;align-items:center;gap:var(--s-6);max-width:calc(var(--w-page) + 2 * var(--gutter));height:var(--topbar);margin:0 auto;padding:0 var(--gutter)}
.brand{display:inline-flex;align-items:center;gap:var(--s-2);color:var(--fg);font-size:var(--text-md);line-height:var(--lh-md);font-weight:600;letter-spacing:-.01em;white-space:nowrap;border-radius:var(--r)}
.brand:hover{text-decoration:none}
.brand-mark{width:24px;height:24px;color:var(--fg)}
.nav{display:flex;align-items:center;gap:var(--s-0_5);min-width:0;scrollbar-width:none}
.nav::-webkit-scrollbar{display:none}
.nav a,.topbar-link{display:inline-flex;align-items:center;gap:var(--s-1_5);height:var(--h);padding:0 var(--s-3);border-radius:var(--r);color:var(--fg-muted);font-weight:500;white-space:nowrap;transition:color var(--dur-1) var(--ease),background-color var(--dur-1) var(--ease)}
.nav a:hover,.topbar-link:hover{color:var(--fg);background:var(--bg-hover);text-decoration:none}
.nav a[aria-current],.topbar-link[aria-current]{color:var(--fg);background:var(--bg-muted)}
.brand,.topbar-end{flex:none}
.topbar-end{display:flex;align-items:center;gap:var(--s-2);margin-left:auto}
.menu-wrap{position:relative}
.menu-wrap>summary{list-style:none;cursor:pointer}
.menu-wrap>summary::-webkit-details-marker{display:none}
.account>summary{display:inline-flex;align-items:center;gap:var(--s-2);height:var(--h);padding:0 var(--s-2) 0 var(--s-1);border:1px solid var(--border);border-radius:var(--r-full);color:var(--fg);font-weight:500;transition:background-color var(--dur-1) var(--ease)}
.account>summary:hover,.account[open]>summary{background:var(--bg-hover)}
.account>summary>svg{color:var(--fg-subtle)}
.avatar{display:grid;place-items:center;width:24px;height:24px;border-radius:var(--r-full);background:var(--bg-muted);color:var(--fg-muted);border:1px solid var(--border)}
.menu{position:absolute;right:0;top:calc(100% + var(--s-1));z-index:30;min-width:var(--w-menu);padding:var(--s-1);background:var(--surface-raised);border:1px solid var(--border);border-radius:var(--r-lg);box-shadow:var(--shadow-md);text-align:left;white-space:normal}
.menu-head{padding:var(--s-2) var(--s-2) var(--s-3)}
.menu-title{font-weight:600;overflow-wrap:anywhere}
.menu-meta{display:flex;align-items:center;gap:var(--s-2);margin-top:var(--s-1_5);color:var(--fg-muted)}
.menu-sep{height:1px;margin:var(--s-1) calc(-1 * var(--s-1));background:var(--border)}
.menu form{margin:0}
.menu-item{display:flex;align-items:center;gap:var(--s-2);width:100%;height:var(--h);padding:0 var(--s-2);border:0;border-radius:var(--r-sm);background:none;color:var(--fg);font:inherit;font-weight:400;text-align:left;text-decoration:none;white-space:nowrap;cursor:pointer}
button.menu-item{justify-content:flex-start}
.menu-item:hover,.menu-item:focus-visible{background:var(--bg-hover);color:var(--fg);text-decoration:none}
.menu-item:focus-visible{outline-offset:-2px}
.menu-item>svg{color:var(--fg-muted)}
.menu-item.danger{background:none;color:var(--danger-fg)}
.menu-item.danger>svg{color:currentColor}
.menu-item.danger:hover,.menu-item.danger:focus-visible{background:var(--danger-subtle);color:var(--danger-fg)}
.row-menu{display:inline-block;vertical-align:middle}
.row-menu>.menu{min-width:var(--w-menu-sm)}
.js .row-menu>.menu{position:fixed;right:auto;top:auto}
.js .row-menu:not([data-placed])>.menu{visibility:hidden}
html:not(.js) .row-menu[open]{display:flex;width:100%;flex-direction:column;align-items:flex-end}
html:not(.js) .row-menu[open]>.menu{flex:none;position:static;margin-top:var(--s-1);box-shadow:none;text-align:left}
.row-menu[open]>summary{background:var(--bg-hover);color:var(--fg)}
.account-name{min-width:0;max-width:var(--w-menu-sm);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (max-width:640px){
  .topbar-in{gap:var(--s-3)}
  .brand-name,.account-name{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
  .topbar-in:not(:has(.nav)) .account-name{position:static;width:auto;height:auto;clip:auto;max-width:40vw}
  .topbar-docs{display:none}
  .account>summary{gap:var(--s-1_5);padding:0 var(--s-1_5) 0 var(--s-1)}
  .nav{overflow-x:auto;margin:calc(-1 * var(--s-1));padding:var(--s-1)}
  .nav a{padding:0 var(--s-2)}
}
@media (max-width:380px){
  .topbar-in{gap:var(--s-2)}
  .nav a{padding:0 var(--s-1_5)}
  .topbar-in:has(.nav) .avatar{display:none}
  .account>summary{padding:0 var(--s-1) 0 var(--s-1_5)}
}

main{display:block;max-width:calc(var(--w-page) + 2 * var(--gutter));margin:0 auto;padding:var(--s-8) var(--gutter) var(--s-16)}
main:focus{outline:none}
.shell-min .topbar{position:static;border:0;background:none;backdrop-filter:none}
.shell-min .topbar-in{justify-content:center;height:auto;padding-top:max(var(--s-12),12vh);padding-bottom:var(--s-6)}
.shell-min .brand-mark{width:32px;height:32px}
.shell-min .brand-name{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.shell-min main{max-width:calc(var(--w-auth) + 2 * var(--gutter));padding-top:0}
.shell-min .page-head{text-align:center}
.shell-min .page-head-row{justify-content:center}
.shell-min :is(.form-page,.narrow){max-width:none}
.shell-min main .card{padding:0;border:0;background:none}
.shell-min main form>button[type=submit]{width:100%;height:var(--h-lg);margin-top:var(--s-2)}
.shell-min main input:not([type=checkbox],[type=radio],[type=hidden]){height:var(--h-lg)}

.page-head{margin:0 0 var(--s-6)}
.page-head-row{display:flex;align-items:flex-end;justify-content:space-between;gap:var(--s-3) var(--s-6);flex-wrap:wrap}
.page-head-text{min-width:0}
.page-head h1{overflow-wrap:anywhere}
.page-desc{margin:var(--s-1) 0 0;color:var(--fg-muted);max-width:var(--w-prose);text-wrap:pretty}
.page-actions,.section-actions{display:flex;align-items:center;gap:var(--s-2);flex-wrap:wrap}
.crumbs{margin:0 0 var(--s-2);color:var(--fg-muted);font-size:var(--text-sm);line-height:var(--lh-sm)}
.crumbs ol{display:flex;flex-wrap:wrap;align-items:center;gap:var(--s-1_5);margin:0;padding:0;list-style:none}
.crumbs li+li::before{content:"/";margin-right:var(--s-1_5);color:var(--border-input)}
.crumbs a{color:var(--fg-muted);text-decoration:none}
.crumbs a:hover{color:var(--fg)}
.crumbs li:last-child{color:var(--fg)}
.crumbs .mono{font-size:inherit}
.project-head{margin:0 0 var(--s-6)}
.project-head .page-head{margin-bottom:var(--s-4)}
.project-head:not(:has(.tabnav)) .page-head{margin-bottom:0}
.section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:var(--s-3) var(--s-6);flex-wrap:wrap;margin:var(--s-10) 0 var(--s-3)}
.section-head h2{margin:0}
.section-desc{margin:var(--s-0_5) 0 0;color:var(--fg-muted);font-size:var(--text-sm);line-height:var(--lh-sm);text-wrap:pretty}
.page-head+.section-head,.project-head+.section-head,.flash+.section-head,.page-head+h2,.project-head+h2,.flash+h2{margin-top:0}

button,.btn{display:inline-flex;align-items:center;justify-content:center;gap:var(--s-1_5);height:var(--h);padding:0 var(--s-3);margin:0;border:1px solid transparent;border-radius:var(--r);background:var(--inverse);color:var(--fg-on-inverse);font:inherit;font-size:var(--text-base);font-weight:500;line-height:1;white-space:nowrap;text-decoration:none;cursor:pointer;user-select:none;transition:background-color var(--dur-1) var(--ease),border-color var(--dur-1) var(--ease),color var(--dur-1) var(--ease)}
button:hover,.btn:hover{background:var(--inverse-hover);text-decoration:none}
button.secondary,.btn.secondary{background:var(--surface);color:var(--fg);border-color:var(--border-strong);box-shadow:var(--shadow-xs)}
button.secondary:hover,.btn.secondary:hover{background:var(--bg-hover)}
button.ghost,.btn.ghost{background:transparent;color:var(--fg-muted)}
button.ghost:hover,.btn.ghost:hover{background:var(--bg-hover);color:var(--fg)}
:is(button,.btn):is(.secondary,.ghost):not(.danger):active,.nav a:active,.topbar-link:active,.menu-item:not(.danger):active{background:var(--bg-active)}
button.danger,.btn.danger{background:var(--danger);color:var(--fg-on-danger)}
button.danger:hover,.btn.danger:hover{background:var(--danger-hover)}
button.danger.ghost,button.danger.secondary,.btn.danger.ghost,.btn.danger.secondary{background:transparent;color:var(--danger-fg)}
button.danger.secondary,.btn.danger.secondary{background:var(--surface);border-color:var(--border-strong)}
button.danger.ghost:hover,button.danger.secondary:hover,.btn.danger.ghost:hover,.btn.danger.secondary:hover{background:var(--danger-subtle);border-color:var(--danger-border)}
button.link,.btn.link{height:auto;padding:0;border:0;background:none;color:var(--accent);font-weight:inherit}
button.link:hover,.btn.link:hover{background:none;text-decoration:underline}
button.small,.btn.small{height:var(--h-sm);padding:0 var(--s-2);gap:var(--s-1);font-size:var(--text-sm)}
button.large,.btn.large{height:var(--h-lg);padding:0 var(--s-4)}
button.block,.btn.block{width:100%}
button.icon,.btn.icon{width:var(--h);padding:0}
button.icon.small,.btn.icon.small{width:var(--h-sm)}
:is(button,.btn):is(:disabled,[aria-disabled=true]),:is(button,.btn):is(.danger,.secondary):is(:disabled,[aria-disabled=true]){background:var(--bg-muted);color:var(--fg-subtle);border-color:var(--border);box-shadow:none;cursor:not-allowed;pointer-events:none}
:is(button,.btn).ghost:is(:disabled,[aria-disabled=true]){background:transparent;border-color:transparent}
:is(button,.btn).link:is(:disabled,[aria-disabled=true]){background:none}
button[aria-busy=true]{cursor:progress;pointer-events:none}
button[aria-busy=true]::before{content:"";width:12px;height:12px;border:1.5px solid currentColor;border-right-color:transparent;border-radius:50%;animation:hv-spin .6s linear infinite}
button[aria-busy=true]>svg{display:none}
@keyframes hv-spin{to{transform:rotate(360deg)}}
form.inline{display:inline}
form{margin:0}

:where(input:not([type=checkbox],[type=radio],[type=hidden])),select,textarea{display:block;width:100%;min-width:0;height:var(--h);margin:0;padding:0 var(--s-3);border:1px solid var(--border-input);border-radius:var(--r);background:var(--surface);color:var(--fg);font:inherit;font-size:var(--text-base);transition:border-color var(--dur-1) var(--ease)}
input:where(:not([type=checkbox],[type=radio])):hover,select:hover,textarea:hover{border-color:var(--fg-subtle)}
input:where(:not([type=checkbox],[type=radio])):focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--focus);outline-offset:-1px;border-color:var(--focus)}
textarea{height:auto;min-height:calc(3 * var(--lh-base) + 2 * var(--s-2) + 2px);padding:var(--s-2) var(--s-3);line-height:var(--lh-base);resize:vertical}
select{appearance:none;padding-right:var(--s-8);background-image:var(--chevron);background-repeat:no-repeat;background-position:right var(--s-2) center;background-size:16px;cursor:pointer}
.row>select{width:auto}
::placeholder{color:var(--fg-subtle);opacity:1}
input:disabled,select:disabled,textarea:disabled,input[readonly],textarea[readonly]{background:var(--bg-subtle);color:var(--fg-muted);border-color:var(--border-strong)}
input:disabled,select:disabled,textarea:disabled{cursor:not-allowed}
[aria-invalid=true]{border-color:var(--danger)!important}
input.mono,textarea.mono,select.mono{font-family:var(--font-mono);font-size:var(--text-sm)}
input[type=checkbox],input[type=radio]{width:16px;height:16px;margin:0;flex:none;accent-color:var(--inverse);cursor:pointer}
input[type=search]::-webkit-search-cancel-button{cursor:pointer}
@media (max-width:640px) and (pointer:coarse){input:not([type=checkbox]):not([type=radio]),select,textarea{font-size:var(--text-md)}}
label{display:grid;gap:var(--s-1_5);margin:0 0 var(--s-4);font-size:var(--text-sm);line-height:var(--lh-sm);font-weight:500;color:var(--fg)}
label.check{display:flex;align-items:center;gap:var(--s-2);font-size:var(--text-base);line-height:var(--lh-base);font-weight:400;cursor:pointer}
form>textarea{margin:0 0 var(--s-4)}
.field{display:grid;gap:var(--s-1_5);margin:0 0 var(--s-4)}
.field>label{margin:0}
.label-opt{margin-left:var(--s-1);font-weight:400;color:var(--fg-muted)}
.hint{margin:0;color:var(--fg-muted);font-size:var(--text-sm);line-height:var(--lh-sm)}
.field-error{display:flex;align-items:flex-start;gap:var(--s-1_5);margin:0;color:var(--danger-fg);font-size:var(--text-sm);line-height:var(--lh-sm)}
.field-error>svg{margin-top:calc((var(--lh-sm) - 16px) / 2)}
fieldset{min-width:0;margin:0 0 var(--s-4);padding:0;border:0}
fieldset>.field:last-child{margin-bottom:0}
legend{margin:0 0 var(--s-1_5);padding:0;font-size:var(--text-sm);line-height:var(--lh-sm);font-weight:500}
.form-actions{display:flex;align-items:center;gap:var(--s-2);flex-wrap:wrap;margin-top:var(--s-5)}

.card{margin:0 0 var(--s-4);padding:var(--s-5);background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg)}
.card>h3:first-child{margin-top:0}
.card>:last-child{margin-bottom:0}
.panel{margin:0 0 var(--s-4);background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg)}
.panel-body{padding:var(--s-5)}
.panel-body>:last-child{margin-bottom:0}
.panel-body>h3{margin-bottom:var(--s-1)}
.panel-foot{display:flex;align-items:center;justify-content:space-between;gap:var(--s-3);flex-wrap:wrap;min-height:calc(var(--h) + 2 * var(--s-3));padding:var(--s-3) var(--s-5);border-top:1px solid var(--border);border-radius:0 0 calc(var(--r-lg) - 1px) calc(var(--r-lg) - 1px);background:var(--bg-subtle);color:var(--fg-muted);font-size:var(--text-sm);line-height:var(--lh-sm)}
.panel.danger{border-color:var(--danger-border)}
.panel.danger .panel-foot{border-top-color:var(--danger-border);background:var(--danger-subtle)}

table{width:100%;margin:0 0 var(--s-4);border-collapse:separate;border-spacing:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg)}
th,td{padding:var(--s-2) var(--s-3);text-align:left;vertical-align:middle;border-bottom:1px solid var(--border)}
tbody td{height:var(--row)}
th{background-image:linear-gradient(var(--th-bg),var(--th-bg));color:var(--fg-muted);font-size:var(--text-xs);line-height:var(--lh-xs);font-weight:500;white-space:nowrap}
th:first-child,td:first-child{padding-left:var(--s-4)}
th:last-child,td:last-child{padding-right:var(--s-4)}
thead tr:first-child th:first-child{border-top-left-radius:calc(var(--r-lg) - 1px)}
thead tr:first-child th:last-child{border-top-right-radius:calc(var(--r-lg) - 1px)}
tbody tr:last-child>td,tbody tr:has(+tr.secret-reveal:last-child)>td{border-bottom:0}
tbody tr:hover>td,tbody tr:hover+tr.secret-reveal>td,tbody tr:has(+tr.secret-reveal:hover)>td{background-image:linear-gradient(var(--row-hover),var(--row-hover))}
td.actions,th.actions{width:1%;text-align:right;white-space:nowrap}
td.actions>*{vertical-align:middle}
td.actions:has(.row-menu[open]),td.actions .row-menu[open]{z-index:3}
td.actions>*+*{margin-left:var(--s-1)}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
td.muted,td .muted{font-variant-numeric:tabular-nums}
td[colspan].muted{height:auto;padding:var(--s-8) var(--s-4);text-align:center}
td a:not(.menu-item,.btn){color:var(--fg);font-weight:500;text-decoration:underline;text-decoration-color:var(--border-input)}
td a:not(.menu-item,.btn):hover{text-decoration-color:currentColor}
tr.row-link{position:relative}
tr.row-link>td:first-child a{text-decoration:none}
tr.row-link>td:first-child a::after{content:"";position:absolute;inset:0}
tr.row-link>td:first-child a:focus-visible{outline:none}
tr.row-link:has(>td:first-child a:focus-visible){outline:2px solid var(--focus);outline-offset:-2px}
tr.row-link:hover>td:first-child a{text-decoration:underline}
tr.row-link :is(button,summary,input,select,form,.menu-wrap,[data-copy],[data-copy-from]){position:relative;z-index:1}
tr.row-link>td.actions:not(:has(a,button,summary,input)){pointer-events:none}
tr.row-link .row-chevron{color:var(--fg-subtle)}
tr.row-link:hover .row-chevron{color:var(--fg)}
tr.revoked>td,tr.revoked>td :is(a:not(.menu-item,.btn),code,.muted,time,.cell-meta){color:var(--fg-muted)}
tr.revoked .badge:not(.danger){background:transparent;border-color:var(--border);color:var(--fg-muted)}
tr.revoked>td:first-child:not(:has(.cell-2)),tr.revoked .cell-main{text-decoration:line-through;text-decoration-color:var(--fg-muted)}
.table-wrap{margin:0 0 var(--s-4);overflow-x:auto;border:1px solid var(--border);border-radius:var(--r-lg);${SCROLL_EDGES}}
.table-wrap>table{margin:0;border:0;border-radius:0;background:transparent}
.table-wrap>table th{border-radius:0!important}
table.fixed{table-layout:fixed}
table.fixed th{overflow:hidden;text-overflow:ellipsis}
table.fixed td>code{overflow-wrap:anywhere}
col.actions{width:calc(var(--actions,1) * (var(--h-sm) + var(--s-1)) - var(--s-1) + var(--s-3) + var(--s-4))}
tbody tr:has(+tr.secret-reveal)>td{border-bottom-color:transparent}
tr.secret-reveal>td{height:auto;padding-top:0;padding-bottom:var(--s-3)}
tr.secret-reveal .secret-chip{display:block;max-width:none}
.cell-2{display:grid;min-width:0}
.cell-main{font-weight:500;line-height:var(--lh-sm)}
.cell-2>code{line-height:var(--lh-sm)}
.cell-meta{color:var(--fg-muted);font-size:var(--text-xs);line-height:var(--lh-xs)}
.cell-meta.mono{font-size:var(--text-xs)}
td:has(>.cell-2){padding-top:var(--s-1_5);padding-bottom:var(--s-1_5)}
.table-toolbar{display:flex;align-items:center;gap:var(--s-2);flex-wrap:wrap;margin:0 0 var(--s-3)}
.table-toolbar>.search-field{flex:1 1 var(--w-search-min);max-width:var(--w-search)}
.table-toolbar>select{flex:none;width:auto}
.table-toolbar-end{display:flex;align-items:center;gap:var(--s-2);margin-left:auto}
.search-field{position:relative;display:flex;align-items:center;min-width:0}
.search-field>svg{position:absolute;left:var(--s-3);color:var(--fg-muted);pointer-events:none}
.search-field>input{padding-left:calc(var(--s-3) + 16px + var(--s-2));padding-right:var(--s-8)}
.search-field>kbd{position:absolute;right:var(--s-2);pointer-events:none}
.search-field>input:is(:focus,:not(:placeholder-shown))~kbd{display:none}
.search-field>input:not(:placeholder-shown){padding-right:var(--s-2)}
.search-field>input::-webkit-search-cancel-button{-webkit-appearance:none;appearance:none;width:16px;height:16px;margin:0;background:var(--fg-muted);-webkit-mask:${X_MASK};mask:${X_MASK};cursor:pointer}
.search-field>input::-webkit-search-cancel-button:hover{background:var(--fg)}
.pager{display:flex;align-items:center;justify-content:space-between;gap:var(--s-2) var(--s-3);flex-wrap:wrap;margin:0 0 var(--s-4);color:var(--fg-muted);font-size:var(--text-sm);line-height:var(--lh-sm);font-variant-numeric:tabular-nums}
.pager-nav{display:flex;gap:var(--s-2)}
.table-wrap>.pager{position:sticky;left:0;margin:0;padding:var(--s-2) var(--s-3) var(--s-2) var(--s-4);border-top:1px solid var(--border);background:var(--bg-subtle)}
@keyframes hv-edge{0%,99.9%{box-shadow:calc(-1 * var(--s-2)) 0 var(--s-2) calc(-1 * var(--s-2)) var(--scroll-shadow),inset 1px 0 var(--border)}100%{box-shadow:none}}
@media (max-width:640px){
  .table-toolbar>.search-field{flex-basis:100%;max-width:none}
  .search-field>kbd{display:none}
  .search-field>input{padding-right:var(--s-2)}
  .table-toolbar-end{flex:1 1 auto;margin-left:0}
  .table-toolbar-end>*{flex:1}
  main table:not(.table-wrap table){display:block;overflow-x:auto;${SCROLL_EDGES}}
  table th,table td{white-space:nowrap}
  tbody td:first-child:not([colspan],.tnum,.nowrap,:has(>time)){min-width:calc(2 * var(--s-16));white-space:normal}
  tbody td:first-child:not([colspan],.tnum,.nowrap,:has(>time)),tbody td:first-child:not([colspan],.tnum,.nowrap,:has(>time)) *{overflow-wrap:anywhere}
  table.fixed :is(th,td):not(.actions){white-space:normal}
  col.masked{width:calc(var(--s-16) + 2 * (var(--h-sm) + var(--s-1)) + var(--s-3) * 2)}
  td.actions,th.actions{position:sticky;right:0;z-index:1;background-color:var(--surface)}
  @supports (animation-timeline:scroll()){
    .table-wrap,main table:not(.table-wrap table){scroll-timeline:--hv-x x}
    td.actions,th.actions{animation:hv-edge linear both;animation-timeline:--hv-x}
  }
  @supports not (animation-timeline:scroll()){td.actions,th.actions{box-shadow:inset 1px 0 var(--border)}}
}

code,kbd,pre,samp{font-family:var(--font-mono)}
code{padding:0 var(--s-1);border-radius:var(--r-sm);background:var(--bg-muted);color:var(--fg);font-size:var(--text-sm);overflow-wrap:anywhere}
td code,pre code,a code,.tabs code,.crumbs code{padding:0;background:none;border-radius:0}
:is(.flash.err,.flash.prod,.field-error) code{padding:0;background:none;color:inherit}
td>code{overflow-wrap:normal}
pre{margin:0 0 var(--s-4);padding:var(--s-3) var(--s-4);overflow-x:auto;background:var(--bg-subtle);border:1px solid var(--border);border-radius:var(--r-lg);color:var(--fg);font-size:var(--text-sm);line-height:var(--lh-base);white-space:pre;overflow-wrap:normal;tab-size:2}
pre.wrap,td pre{white-space:pre-wrap;overflow-wrap:break-word}
pre.card{padding:var(--s-3) var(--s-4);background:var(--bg-subtle)}
td pre{margin:var(--s-1_5) 0 0;padding:var(--s-1_5) var(--s-2);line-height:var(--lh-sm);border-radius:var(--r)}
.codeblock{margin:0 0 var(--s-4);background:var(--bg-subtle);border:1px solid var(--border);border-radius:var(--r-lg)}
.codeblock-head{display:flex;align-items:center;justify-content:space-between;gap:var(--s-2);height:var(--s-10);padding:0 var(--s-1_5) 0 var(--s-4);border-bottom:1px solid var(--border);color:var(--fg-muted);font-size:var(--text-xs);font-weight:500}
.codeblock>pre{margin:0;border:0;border-radius:0 0 var(--r-lg) var(--r-lg);background:none}
kbd{display:inline-flex;align-items:center;justify-content:center;min-width:var(--h-xs);height:var(--h-xs);padding:0 var(--s-1);border:1px solid var(--border-strong);border-radius:var(--r-sm);background:var(--surface);box-shadow:0 1px 0 var(--border-strong);color:var(--fg-muted);font-size:var(--text-xs);font-weight:500;line-height:1;vertical-align:1px}
.kv{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:var(--s-2) var(--s-6);margin:0}
.kv dt{color:var(--fg-muted)}
.kv dd{margin:0;min-width:0;overflow-wrap:anywhere}
details>summary{width:fit-content;cursor:pointer;color:var(--fg-muted);border-radius:var(--r-sm)}
details>summary:hover{color:var(--fg)}

.secret{display:inline-flex;align-items:center;gap:var(--s-1);max-width:100%;min-width:0;vertical-align:middle}
.secret-chip{display:inline-block;min-width:0;max-width:100%;padding:var(--s-1) 0;border:1px solid transparent;border-radius:var(--r-sm);background:none;color:var(--fg);font-size:var(--text-sm);line-height:var(--lh-sm);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;overflow-wrap:normal}
.secret-mask{color:var(--fg-muted);font-family:var(--font-sans);letter-spacing:.04em}
.secret-value{display:none}
.secret-chip.revealed .secret-value{display:inline}
.secret-chip.revealed .secret-mask{display:none}
.secret-chip.revealed{padding:var(--s-1) var(--s-2);border-color:var(--border);background:var(--bg-subtle);max-height:calc(8 * var(--lh-sm) + 2 * var(--s-1) + 2px);overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;text-overflow:clip}
tbody tr:not(.secret-reveal)>td .secret-chip.revealed{max-height:none;padding-inline:0;border-color:transparent;background:none;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
td .secret{display:flex;width:100%}
td .secret>.secret-chip{flex:1 1 auto;min-width:0}
[data-reveal][aria-pressed=true] .i-eye,[data-reveal]:not([aria-pressed=true]) .i-eye-off{display:none}
.token-field{display:flex;align-items:stretch;margin:0 0 var(--s-4)}
.token-field>textarea{flex:1;height:auto;min-height:var(--h-lg);field-sizing:content;padding:calc((var(--h-lg) - var(--lh-base) - 2px) / 2) var(--s-3);border-color:var(--border-input);border-radius:var(--r) 0 0 var(--r);background:var(--surface);color:var(--fg);font-family:var(--font-mono);font-size:var(--text-base);font-weight:500;word-break:break-all;resize:none}
.token-field>textarea:focus-visible{position:relative;z-index:1}
.token-field>button{height:auto;min-height:var(--h-lg);margin-left:-1px;border-color:var(--border-input);border-radius:0 var(--r) var(--r) 0;box-shadow:none}

.badge{display:inline-flex;align-items:center;gap:var(--s-1);max-width:100%;min-height:var(--h-xs);padding:0 var(--s-1_5);border:1px solid var(--border);border-radius:var(--r-sm);background:var(--bg-subtle);color:var(--fg-muted);font-size:var(--text-xs);font-weight:500;line-height:var(--lh-xs);overflow-wrap:anywhere;vertical-align:middle}
.badge.mono{font-family:var(--font-mono);font-size:var(--text-xs)}
.badge.outline{background:transparent}
.badge.strong{background:var(--inverse);border-color:var(--inverse);color:var(--fg-on-inverse)}
.badge.accent{background:var(--accent-subtle);border-color:var(--accent-border);color:var(--accent)}
.badge.ok{background:var(--success-subtle);border-color:var(--success-border);color:var(--success-fg)}
.badge.danger{background:var(--danger-subtle);border-color:var(--danger-border);color:var(--danger-fg)}
.badge.warn{background:var(--warning-subtle);border-color:var(--warning-border);color:var(--warning-fg)}
.badge.prod{background:var(--prod-subtle);border-color:var(--prod-border);color:var(--prod-fg)}
.badge>.dot{flex:none;width:6px;height:6px;border-radius:50%;background:currentColor}
.badge.prod>.dot{background:var(--prod)}
.badge.ok>.dot{background:var(--success)}

.tabs{display:flex;width:fit-content;max-width:100%;gap:var(--s-0_5);margin:0 0 var(--s-3);padding:var(--s-0_5);overflow-x:auto;${
  edges("var(--bg-muted)")
};border-radius:var(--r);scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tabs>a,.tabs>button{display:inline-flex;align-items:center;gap:var(--s-1_5);height:calc(var(--h) - 2 * var(--s-0_5));padding:0 var(--s-3);border:0;border-radius:calc(var(--r) - var(--s-0_5));background:none;color:var(--fg-muted);font-size:var(--text-sm);font-weight:500;white-space:nowrap;transition:color var(--dur-1) var(--ease),background-color var(--dur-1) var(--ease)}
.tabs>a:hover,.tabs>button:hover{color:var(--fg);background:none;text-decoration:none}
.tabs>:is([aria-current],[aria-pressed=true],.on),.tabs>:is([aria-current],[aria-pressed=true],.on):hover{background:var(--segment-active);color:var(--fg);box-shadow:var(--segment-shadow)}
.tabs>:focus-visible{outline-offset:0}
.tabs.paths>a,.tabs.envs>a{font-family:var(--font-mono)}
.tabs.envs>a.prod::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--prod)}
.tabs.envs>a.prod:is([aria-current],.on){color:var(--prod-fg)}
.tabnav{display:flex;gap:var(--s-6);margin:0 0 var(--s-6);overflow-x:auto;border-bottom:1px solid var(--border);scrollbar-width:none}
.tabnav>a{position:relative;display:inline-flex;align-items:center;gap:var(--s-1_5);height:var(--s-10);padding:0;color:var(--fg-muted);font-weight:500;white-space:nowrap}
.tabnav>a:hover{color:var(--fg);text-decoration:none}
.tabnav>a[aria-current]{color:var(--fg)}
.tabnav>a[aria-current]::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;border-radius:2px;background:var(--fg)}
.tabnav>a:focus-visible{outline-offset:-2px}

.flash{display:flex;align-items:flex-start;gap:var(--s-2);margin:0 0 var(--s-4);padding:var(--s-3);border:1px solid var(--border);border-radius:var(--r-lg);background:var(--bg-subtle);color:var(--fg);overflow-wrap:anywhere}
.flash>svg{margin-top:var(--s-0_5)}
.flash-text{flex:1;min-width:0}
.flash.ok{background:var(--success-subtle);border-color:var(--success-border)}
.flash.ok>svg{color:var(--success-fg)}
.flash.info>svg{color:var(--fg-muted)}
.flash.err{background:var(--danger-subtle);border-color:var(--danger-border);color:var(--danger-fg)}
.flash.warn{background:var(--warning-subtle);border-color:var(--warning-border)}
.flash.warn>svg{color:var(--warning-fg)}
.flash.prod{background:var(--prod-subtle);border-color:var(--prod-border);color:var(--prod-fg)}
.flash>.flash-close{margin:calc(-1 * var(--s-1)) calc(-1 * var(--s-1)) calc(-1 * var(--s-1)) 0;color:var(--fg-muted)}
.flash>.flash-close:hover{background:transparent;color:var(--fg)}
.flash:is(.err,.prod)>.flash-close,.flash:is(.err,.prod)>.flash-close:hover{color:currentColor}
.toast{position:fixed;left:50%;bottom:var(--s-6);z-index:60;display:inline-flex;align-items:center;gap:var(--s-2);max-width:calc(100vw - var(--s-8));padding:var(--s-2) var(--s-3);border-radius:var(--r);background:var(--inverse);color:var(--fg-on-inverse);box-shadow:var(--shadow-md);font-size:var(--text-sm);font-weight:500;opacity:0;pointer-events:none;transform:translate(-50%,var(--s-2));transition:opacity var(--dur-2) var(--ease),transform var(--dur-2) var(--ease)}
.toast.show{opacity:1;transform:translate(-50%,0)}

.empty{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;margin:0 0 var(--s-4);padding:var(--s-12) var(--s-6);text-align:center;border:1px dashed var(--border-strong);border-radius:var(--r-lg)}
.empty.plain{border:0;padding:var(--s-8) var(--s-4)}
.empty.center{justify-content:center}
.empty-icon{display:grid;place-items:center;width:var(--s-10);height:var(--s-10);margin-bottom:var(--s-4);border:1px solid var(--border);border-radius:var(--r-lg);background:var(--surface);box-shadow:var(--shadow-xs);color:var(--fg-muted)}
.empty-title{margin:0 0 var(--s-1);font-size:var(--text-base);line-height:var(--lh-base);font-weight:600;letter-spacing:0;text-wrap:balance}
.empty.page{border:0;padding:var(--s-16) var(--s-4)}
.empty-eyebrow{margin:0 0 var(--s-2);color:var(--fg-muted);font-family:var(--font-mono);font-size:var(--text-xs);line-height:var(--lh-xs)}
.empty.page>.empty-title{margin-bottom:var(--s-1_5);font-size:var(--text-xl);line-height:var(--lh-xl);letter-spacing:-.018em}
.empty-text{margin:0;max-width:calc(var(--w-narrow) - var(--s-16));color:var(--fg-muted);text-wrap:pretty}
.empty-actions{display:flex;gap:var(--s-2);flex-wrap:wrap;justify-content:center;margin-top:var(--s-5)}
.empty-detail{margin:var(--s-6) 0 0;color:var(--fg-muted);font-family:var(--font-mono);font-size:var(--text-xs);line-height:var(--lh-xs);overflow-wrap:anywhere}

[data-copy] .i-check,[data-copy-from] .i-check{display:none}
.copied .i-copy{display:none}
.copied .i-check{display:inline;color:var(--success)}

.dialog{width:min(var(--w-narrow),calc(100vw - var(--s-8)));max-height:calc(100vh - var(--s-16));padding:0;border:1px solid var(--border);border-radius:var(--r-xl);background:var(--surface-raised);color:var(--fg);box-shadow:var(--shadow-lg)}
.dialog::backdrop{background:var(--backdrop)}
.dialog[open]{animation:hv-in var(--dur-2) var(--ease)}
@keyframes hv-in{from{opacity:0;transform:translateY(var(--s-1_5)) scale(.98)}}
.dialog-body{padding:var(--s-5) var(--s-5) var(--s-4)}
.dialog-title{margin:0 0 var(--s-1_5);font-size:var(--text-md);line-height:var(--lh-md);font-weight:600;text-wrap:balance;overflow-wrap:anywhere}
.dialog-text{margin:0;color:var(--fg-muted);overflow-wrap:anywhere;text-wrap:pretty}
.dialog-body>.flash{margin:var(--s-4) 0 0;font-size:var(--text-sm);line-height:var(--lh-sm)}
.dialog-body>.field{margin:var(--s-4) 0 0}
.typed-label{display:flex;align-items:center;gap:var(--s-1);min-height:var(--h-sm)}
.typed-label>label{display:block;margin:0}
.typed-label code{font-weight:500}
.dialog-foot{display:flex;justify-content:flex-end;gap:var(--s-2);padding:var(--s-3) var(--s-5);border-top:1px solid var(--border);border-radius:0 0 calc(var(--r-xl) - 1px) calc(var(--r-xl) - 1px);background:var(--bg-subtle)}
@media (max-width:480px){.dialog-foot>:is(button,.btn){flex:1}}
.confirm-page{padding-top:var(--s-16)}
.dialog.static{position:static;display:block;width:100%;max-width:var(--w-narrow);max-height:none;margin:0 auto;animation:none;box-shadow:none}
.dialog.static .dialog-title{font-size:var(--text-xl);line-height:var(--lh-xl);letter-spacing:-.018em}
`;
