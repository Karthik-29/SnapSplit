// Companion to public/404.html. When GitHub Pages bounced a deep link through
// the SPA fallback, the real path arrives here encoded as "/?/review&foo=bar".
// Rewrite the address bar back to "/review?foo=bar" before react-router reads it.
// Kept as a separate same-origin file (not inline) so the page's strict
// Content-Security-Policy needs no 'unsafe-inline' in script-src.
(function () {
  var l = window.location;
  if (l.search && l.search.charAt(1) === '/') {
    var decoded = l.search
      .slice(1)
      .split('&')
      .map(function (part) {
        return part.replace(/~and~/g, '&');
      })
      .join('?');
    window.history.replaceState(null, '', l.pathname.slice(0, -1) + decoded + l.hash);
  }
})();
