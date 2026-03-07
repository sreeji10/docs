/**
 * Chat LangChain Widget
 *
 * Self-contained floating chat widget that embeds chat.langchain.com
 * into the docs site via an iframe. When opened, the main page content
 * shrinks horizontally and the chat panel slides in from the right.
 *
 * Built as a zero-dependency IIFE — no React, no npm imports.
 * Bundled by esbuild via Bun into a single JS file.
 */
(function chatWidget() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const CHAT_PROXY_PORT = 3333;
  const isLocal = typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
     window.location.hostname === "127.0.0.1");
  const CHAT_URL = isLocal
    ? `http://localhost:${CHAT_PROXY_PORT}/`
    : "https://chat.langchain.com/";
  const PANEL_WIDTH = 420;
  const BUTTON_SIZE = 56;
  const BUTTON_MARGIN = 24;
  const Z_BUTTON = 9999;
  const Z_PANEL = 9998;
  const Z_CLOSE = 10000;
  const TRANSITION = "0.3s cubic-bezier(0.4, 0, 0.2, 1)";

  const CHAT_ICON = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
  const CLOSE_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

  let isOpen = false;
  let panel: HTMLDivElement | null = null;
  let button: HTMLButtonElement | null = null;
  let closeBtn: HTMLButtonElement | null = null;
  let iframe: HTMLIFrameElement | null = null;

  function isDark(): boolean {
    const el = document.documentElement;
    return el.classList.contains("dark") ||
      el.getAttribute("data-theme") === "dark" ||
      el.style.colorScheme === "dark";
  }

  function injectStyles(): void {
    if (document.getElementById("lc-chat-css")) return;
    const styleEl = document.createElement("style");
    styleEl.id = "lc-chat-css";
    styleEl.textContent = `
      body > .antialiased {
        transition: margin-right ${TRANSITION};
      }
      body[data-lc-chat-open] > .antialiased {
        margin-right: ${PANEL_WIDTH}px;
      }
      @media (max-width: 768px) {
        body[data-lc-chat-open] > .antialiased {
          margin-right: 0;
        }
      }
    `;
    document.head.appendChild(styleEl);
  }

  function createButton(): void {
    button = document.createElement("button");
    button.type = "button";
    button.id = "lc-chat-btn";
    button.setAttribute("aria-label", "Open Chat LangChain");
    button.innerHTML = CHAT_ICON;

    Object.assign(button.style, {
      position: "fixed",
      bottom: `${BUTTON_MARGIN}px`,
      right: `${BUTTON_MARGIN}px`,
      width: `${BUTTON_SIZE}px`,
      height: `${BUTTON_SIZE}px`,
      borderRadius: "50%",
      border: "none",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: String(Z_BUTTON),
      transition: `transform 0.2s ease, box-shadow 0.2s ease, opacity ${TRANSITION}`,
      boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
      padding: "0",
    });

    applyButtonTheme();
    button.addEventListener("mouseenter", () => {
      if (button) {
        button.style.transform = "scale(1.08)";
        button.style.boxShadow = "0 6px 24px rgba(0,0,0,0.25)";
      }
    });
    button.addEventListener("mouseleave", () => {
      if (button) {
        button.style.transform = "scale(1)";
        button.style.boxShadow = "0 4px 16px rgba(0,0,0,0.18)";
      }
    });
    button.addEventListener("click", () => toggle());

    document.body.appendChild(button);
  }

  function applyButtonTheme(): void {
    if (!button) return;
    const dark = isDark();
    button.style.backgroundColor = dark ? "#006DDD" : "#161F34";
    button.style.color = "#FFFFFF";
  }

  function createPanel(): void {
    panel = document.createElement("div");
    panel.id = "lc-chat-panel";

    Object.assign(panel.style, {
      position: "fixed",
      top: "0",
      right: "0",
      bottom: "0",
      width: `${PANEL_WIDTH}px`,
      zIndex: String(Z_PANEL),
      transform: "translateX(100%)",
      transition: `transform ${TRANSITION}`,
      overflow: "hidden",
    });

    applyPanelTheme();

    // Close button — floats over the iframe in the top-right
    closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.id = "lc-chat-close";
    closeBtn.setAttribute("aria-label", "Close chat");
    closeBtn.innerHTML = CLOSE_ICON;
    Object.assign(closeBtn.style, {
      position: "absolute",
      top: "14px",
      right: "110px",
      zIndex: String(Z_CLOSE),
      width: "32px",
      height: "32px",
      borderRadius: "8px",
      border: "none",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "background-color 0.15s ease, opacity 0.15s ease",
      padding: "0",
    });
    applyCloseTheme();
    closeBtn.addEventListener("mouseenter", () => {
      if (closeBtn) closeBtn.style.opacity = "1";
    });
    closeBtn.addEventListener("mouseleave", () => {
      if (closeBtn) closeBtn.style.opacity = "0.7";
    });
    closeBtn.addEventListener("click", () => toggle());
    panel.appendChild(closeBtn);

    document.body.appendChild(panel);
  }

  function applyCloseTheme(): void {
    if (!closeBtn) return;
    const dark = isDark();
    closeBtn.style.backgroundColor = dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)";
    closeBtn.style.color = dark ? "#E2E8F0" : "#1A202C";
    closeBtn.style.opacity = "0.7";
  }

  function applyPanelTheme(): void {
    if (!panel) return;
    const dark = isDark();

    panel.style.backgroundColor = dark ? "#0B1120" : "#FFFFFF";
    panel.style.boxShadow = dark
      ? "-4px 0 24px rgba(0,0,0,0.5)"
      : "-4px 0 24px rgba(0,0,0,0.1)";

    applyCloseTheme();
  }

  function ensureIframe(): void {
    if (iframe || !panel) return;

    iframe = document.createElement("iframe");
    iframe.src = CHAT_URL;
    iframe.title = "Chat LangChain";
    iframe.setAttribute("allow", "clipboard-write");
    Object.assign(iframe.style, {
      width: "100%",
      height: "100%",
      border: "none",
      display: "block",
    });

    panel.appendChild(iframe);
  }

  function toggle(): void {
    isOpen = !isOpen;

    if (isOpen) {
      ensureIframe();
      document.body.setAttribute("data-lc-chat-open", "");
      if (panel) panel.style.transform = "translateX(0)";
      if (button) {
        button.style.opacity = "0";
        button.style.pointerEvents = "none";
      }
    } else {
      document.body.removeAttribute("data-lc-chat-open");
      if (panel) panel.style.transform = "translateX(100%)";
      if (button) {
        button.style.opacity = "1";
        button.style.pointerEvents = "auto";
      }
    }
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape" && isOpen) {
      toggle();
    }
  }

  function watchTheme(): void {
    const observer = new MutationObserver(() => {
      applyButtonTheme();
      applyPanelTheme();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });
  }

  function watchResize(): void {
    const mq = window.matchMedia("(max-width: 768px)");
    function handleChange(e: MediaQueryListEvent | MediaQueryList) {
      if (e.matches && panel) {
        panel.style.width = "100%";
      } else if (panel) {
        panel.style.width = `${PANEL_WIDTH}px`;
      }
    }
    handleChange(mq);
    mq.addEventListener("change", handleChange);
  }

  function init(): void {
    injectStyles();
    createButton();
    createPanel();
    watchTheme();
    watchResize();
    document.addEventListener("keydown", handleKeyDown);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
