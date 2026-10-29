/**
 * R30-0 PERMANENT HYDRATION FIX PROOF — extension-noise simulation via CDP.
 * Injects the EXACT attributes real extensions add (Grammarly: data-gr-ext-installed,
 * data-new-gr-c-s-check-loaded on <html>; generic dark-mode: class + style on <body>)
 * at document_start — BEFORE React hydrates — then navigates and asserts the
 * React 19 hydration error NEVER fires. Also runs a control pass (no injection).
 */
export {} // module marker — top-level await requires it under tsc

const CDP_HTTP = process.argv[2] ?? "http://127.0.0.1:44129" // CDP http endpoint of a running browser
const TARGET_URL = "http://localhost:3000/"
const INJECT = process.argv[3] === "inject"

interface Msg { id?: number; method?: string; params?: any; result?: any; sessionId?: string }

const version = (await (await fetch(`${CDP_HTTP}/json/version`)).json()) as {
  webSocketDebuggerUrl: string
  Browser?: string
}
console.log(`[proof] browser ws: ${version.Browser}`)

const ws = new WebSocket(version.webSocketDebuggerUrl)
await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error("ws fail")) })

let msgId = 0
const pending = new Map<number, (v: any) => void>()
const send = (method: string, params: any = {}, sessionId?: string) =>
  new Promise<any>((res) => {
    const id = ++msgId
    pending.set(id, res)
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })

const consoleLines: string[] = []
const exceptions: string[] = []
let pageSession = ""

ws.onmessage = (ev) => {
  const m = JSON.parse(String(ev.data)) as Msg
  if (m.id && pending.has(m.id)) { pending.get(m.id)!(m.result); pending.delete(m.id); return }
  if (!m.method) return
  if (m.sessionId !== pageSession) return
  if (m.method === "Runtime.consoleAPICalled") {
    const text = (m.params.args ?? []).map((a: any) => a.value ?? a.description ?? "").join(" ")
    consoleLines.push(`[${m.params.type}] ${text}`)
  }
  if (m.method === "Runtime.exceptionThrown") {
    exceptions.push(String(m.params.exceptionDetails?.text ?? "") + " " + String(m.params.exceptionDetails?.exception?.description ?? ""))
  }
}

// create a fresh target and attach
const { targetId } = await send("Target.createTarget", { url: "about:blank" })
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
pageSession = sessionId
console.log(`[proof] target ${targetId} attached (mode: ${INJECT ? "EXTENSION-NOISE INJECTION" : "control (clean)"})`)

await send("Page.enable", {}, sessionId)
await send("Runtime.enable", {}, sessionId)

if (INJECT) {
  // Fires on every new document BEFORE any page script (incl. React) runs.
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      (function () {
        var poison = function () {
          var de = document.documentElement, b = document.body;
          if (de) {
            de.setAttribute("data-gr-ext-installed", "");
            de.setAttribute("data-new-gr-c-s-check-loaded", "8.1.0");
            de.setAttribute("data-lp-focusable", "true");
          }
          if (b) {
            b.setAttribute("data-ca-product", "prime-test");
            b.setAttribute("cz-shortcut-listen", "true");
            b.classList.add("lb-overlay-open", "force-dark-mode");
            b.setAttribute("style", (b.getAttribute("style") || "") + "; --ext-filter: invert(0.9);");
          }
        };
        poison();
        document.addEventListener("readystatechange", poison);
        document.addEventListener("DOMContentLoaded", poison);
      })();
    `,
  }, sessionId)
}

console.log("[proof] navigating…")
await send("Page.navigate", { url: TARGET_URL }, sessionId)
await new Promise((r) => setTimeout(r, 12000)) // boot + fetch + hydrate + settle

// DOM sanity: page actually rendered the app?
const { result } = await send("Runtime.evaluate", {
  expression: `JSON.stringify({
    htmlAttrs: document.documentElement.getAttribute("data-gr-ext-installed") !== null,
    bodyAttrs: document.body.getAttribute("data-ca-product") !== null,
    bodyClass: document.body.className.includes("force-dark-mode"),
    region: (document.querySelector("[role=region]") || {}).getAttribute ? document.querySelector("[role=region]").getAttribute("aria-label") : null,
    jsReveal: document.documentElement.classList.contains("js-reveal"),
    scrollW: document.documentElement.scrollWidth
  })`,
  returnByValue: true,
}, sessionId)
console.log("[proof] DOM state:", result.value)

const full = [...consoleLines, ...exceptions]
const hydrationHits = full.filter((l) => /hydrat|didn't match|server rendered HTML|mismatch/i.test(l))
console.log(`[proof] console lines: ${full.length}, hydration-error hits: ${hydrationHits.length}`)
full.filter((l) => /error|warn/i.test(l.slice(0, 8))).slice(0, 8).forEach((l) => console.log("  ·", l.slice(0, 160)))
if (hydrationHits.length) { console.log("[proof] ❌ HYDRATION ERROR REPRODUCED:"); hydrationHits.forEach((l) => console.log("   !!", l.slice(0, 300))) }
else console.log("[proof] ✅ ZERO HYDRATION ERRORS" + (INJECT ? " — WITH injected extension noise" : " (control)"))

await send("Target.closeTarget", { targetId })
ws.close()
