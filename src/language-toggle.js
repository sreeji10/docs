/**
 * Language Toggle Script
 *
 * Enables smart navigation when switching between Python and TypeScript docs.
 * When a user clicks the language dropdown, this redirects them to the equivalent
 * page in the target language (preserving the section hash) instead of the default
 * overview page.
 *
 * How it works:
 * 1. Click listener detects language toggle clicks and stores current URL+hash
 * 2. History API interception (pushState/replaceState) and popstate/hashchange
 *    listeners detect when Mintlify's client-side routing changes the path
 * 3. On path change, check if we're switching languages and redirect to equivalent page
 *
 * Note: Mintlify re-executes custom JS on each client-side navigation, so we
 * persist state in sessionStorage and guard against duplicate event listeners.
 */

(function () {
  "use strict";

  const PYTHON_PREFIX = "/oss/python/";
  const JS_PREFIX = "/oss/javascript/";
  const STORAGE_KEY = "__lang_toggle_prev";

  // Mintlify CSS class selector for language dropdown items
  const LANGUAGE_TOGGLE_SELECTOR = ".nav-dropdown-item";

  function getPreviousUrl() {
    try {
      return sessionStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function setPreviousUrl(url) {
    try {
      sessionStorage.setItem(STORAGE_KEY, url);
    } catch (e) {}
  }

  function clearPreviousUrl() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  function getEquivalentPath(sourcePath, targetLang) {
    const sourcePrefix = targetLang === "python" ? JS_PREFIX : PYTHON_PREFIX;
    const targetPrefix = targetLang === "python" ? PYTHON_PREFIX : JS_PREFIX;

    if (sourcePath.startsWith(sourcePrefix)) {
      return targetPrefix + sourcePath.substring(sourcePrefix.length);
    }
    return null;
  }

  function getPathLanguage(path) {
    if (path.startsWith(PYTHON_PREFIX)) return "python";
    if (path.startsWith(JS_PREFIX)) return "javascript";
    return null;
  }

  function updateCurrent() {
    const lang = getPathLanguage(location.pathname);
    if (lang) {
      setPreviousUrl(location.pathname + location.hash);
    }
  }

  function checkRedirect() {
    const currentLang = getPathLanguage(location.pathname);
    if (!currentLang) return;

    var previousUrl = getPreviousUrl();
    if (!previousUrl) {
      updateCurrent();
      return;
    }

    var parts = previousUrl.split("#");
    var prevPath = parts[0];
    var prevHash = parts[1] || "";
    var prevLang = getPathLanguage(prevPath);

    if (prevLang && prevLang !== currentLang) {
      var equivalentPath = getEquivalentPath(prevPath, currentLang);

      if (equivalentPath && equivalentPath !== location.pathname) {
        clearPreviousUrl();
        location.replace(equivalentPath + (prevHash ? "#" + prevHash : ""));
        return;
      }
    }

    updateCurrent();
  }

  document.addEventListener(
    "click",
    function (e) {
      if (e.target.closest(LANGUAGE_TOGGLE_SELECTOR)) {
        updateCurrent();
      }
    },
    true,
  );

  // Only patch History API once to avoid stacking interceptors
  if (!window.__langTogglePatched) {
    window.__langTogglePatched = true;

    var lastPath = location.pathname;

    function onPathChange() {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        checkRedirect();
      }
    }

    window.addEventListener("popstate", onPathChange);
    window.addEventListener("hashchange", onPathChange);

    var originalPushState = history.pushState;
    var originalReplaceState = history.replaceState;

    history.pushState = function () {
      originalPushState.apply(this, arguments);
      onPathChange();
    };

    history.replaceState = function () {
      originalReplaceState.apply(this, arguments);
      onPathChange();
    };
  }

  checkRedirect();
})();
