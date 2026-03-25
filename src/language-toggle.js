/**
 * Language Toggle Script
 *
 * Enables smart navigation when switching between Python and TypeScript docs.
 * When a user clicks the language dropdown, this redirects them to the equivalent
 * page in the target language (preserving the section hash) instead of the default
 * overview page.
 *
 * How it works:
 * Mintlify's language dropdown renders <a> tags inside Radix UI portals. Next.js
 * Link binds the navigation target from a React prop closure at render time, so
 * rewriting the DOM href attribute alone doesn't change where clicks navigate.
 *
 * Instead, we intercept clicks on dropdown links in the capture phase (before
 * React's handler fires). When the link points to the other language's default
 * page, we prevent the default navigation and use window.next.router.push() to
 * navigate to the equivalent page. This gives instant, flicker-free SPA navigation.
 */

(function () {
  "use strict";

  if (window.__langToggleInit) return;
  window.__langToggleInit = true;

  var PYTHON_PREFIX = "/oss/python/";
  var JS_PREFIX = "/oss/javascript/";

  function getPathLanguage(path) {
    if (path.startsWith(PYTHON_PREFIX)) return "python";
    if (path.startsWith(JS_PREFIX)) return "javascript";
    return null;
  }

  function getEquivalentPath(sourcePath, targetLang) {
    var sourcePrefix = targetLang === "python" ? JS_PREFIX : PYTHON_PREFIX;
    var targetPrefix = targetLang === "python" ? PYTHON_PREFIX : JS_PREFIX;
    if (sourcePath.startsWith(sourcePrefix)) {
      return targetPrefix + sourcePath.substring(sourcePrefix.length);
    }
    return null;
  }

  document.addEventListener(
    "click",
    function (e) {
      var anchor = e.target.closest ? e.target.closest("a[href]") : null;
      if (!anchor) return;

      // Only act on links inside Radix dropdown portals
      if (!anchor.closest("[data-radix-popper-content-wrapper]")) return;

      var href = anchor.getAttribute("href");
      if (!href) return;

      var currentLang = getPathLanguage(location.pathname);
      var linkLang = getPathLanguage(href);

      // Only intercept cross-language links while on an OSS page
      if (!currentLang || !linkLang || linkLang === currentLang) return;

      var equiv = getEquivalentPath(location.pathname, linkLang);
      if (!equiv || equiv === href) return;

      var target = equiv + location.hash;

      e.preventDefault();
      e.stopPropagation();

      // Use Next.js router for instant SPA navigation
      if (window.next && window.next.router && window.next.router.push) {
        window.next.router.push(target);
      } else {
        location.href = target;
      }
    },
    true,
  );
})();
