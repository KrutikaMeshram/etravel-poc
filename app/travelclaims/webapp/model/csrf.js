sap.ui.define([], function () {
  "use strict";

  var _sToken = null;

  async function getToken() {
    if (_sToken) return _sToken;
    var res = await fetch("/travel/", {
      method: "GET",
      headers: { "X-CSRF-Token": "Fetch" },
      credentials: "same-origin"
    });
    _sToken = res.headers.get("x-csrf-token");
    return _sToken;
  }

  // Drop-in replacement for fetch() on state-changing calls (POST/PATCH/DELETE).
  // Automatically attaches the CSRF token and required headers.
  async function fetchWithCsrf(sUrl, oOptions) {
    oOptions = oOptions || {};
    oOptions.headers = oOptions.headers || {};
    oOptions.credentials = "same-origin";

    var sToken = await getToken();
    if (sToken) {
      oOptions.headers["X-CSRF-Token"] = sToken;
    }

    var res = await fetch(sUrl, oOptions);

    // Token can go stale (e.g. session change); retry once with a fresh one.
    if (res.status === 403) {
      _sToken = null;
      var sFreshToken = await getToken();
      oOptions.headers["X-CSRF-Token"] = sFreshToken;
      res = await fetch(sUrl, oOptions);
    }

    return res;
  }

  return { fetchWithCsrf: fetchWithCsrf };
});