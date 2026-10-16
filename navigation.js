/* Carry a reading bookmark through ordinary HTML links. No scroll loop.
   URL state also works when local-file / Safari session storage is restricted. */
(function () {
  'use strict';
  function startReadingNavigation() {
    var settings = document.querySelector('script[data-room-page]');
    if (!settings) { return; }
    var page = settings.getAttribute('data-room-page');
    var prefix = settings.getAttribute('data-room-root') || '';
    var isRoom = page === 'index.html';
    var adapter = null;
    var aboutReturn = null;
    var loadingResume = null;
    var startup = window.roomStartup;
    var base = window.location.href.split('#')[0].split('?')[0];
    var storageKey = 'cis222-room-reading:' + base.slice(0, Math.max(0, base.length - page.length));
    var names = { home: 'the room', map: 'Directory', about: 'About me', education: 'Education', skills: 'Skills', projects: 'Projects', experience: 'Experience', profile: 'my introduction' };

    function parameter(href, key) {
      var match = String(href || '').match(new RegExp('[?&]' + key + '=([^&#]*)'));
      if (!match) { return null; }
      try { return decodeURIComponent(match[1]); } catch (error) { return null; }
    }
    function withParameter(href, key, value) {
      var fragments = href.split('#');
      var parts = fragments[0].split('?');
      var fields = (parts[1] || '').split('&').filter(function (field) { return field && field.split('=')[0] !== key; });
      if (value !== null) { fields.push(key + '=' + encodeURIComponent(value)); }
      return parts[0] + (fields.length ? '?' + fields.join('&') : '') + (fragments.length > 1 ? '#' + fragments.slice(1).join('#') : '');
    }
    function decode(token) {
      if (typeof token !== 'string' || token.length > 100) { return null; }
      var match = token.match(/^1\|(home|map|about|education|skills|projects|experience|profile)\|(read|travel|page)\|(0(?:\.\d{1,6})?|1(?:\.0{1,6})?)\|([01])$/);
      if (!match || (match[1] === 'profile') !== (match[2] === 'page')) { return null; }
      return { key: match[1], phase: match[2], fraction: Number(match[3]), paused: match[4] === '1' };
    }
    function encode(bookmark) {
      if (!bookmark) { return null; }
      var value = '1|' + bookmark.key + '|' + bookmark.phase + '|' + Math.max(0, Math.min(1, bookmark.fraction || 0)).toFixed(6) + '|' + (bookmark.paused ? '1' : '0');
      return decode(value) ? value : null;
    }
    function loadStored() {
      try { return decode(window.sessionStorage.getItem(storageKey)); } catch (error) { return null; }
    }
    function saveStored(bookmark) {
      try {
        if (bookmark) { window.sessionStorage.setItem(storageKey, encode(bookmark)); }
        else { window.sessionStorage.removeItem(storageKey); }
      } catch (error) { /* Links carry their own bookmark as a fallback. */ }
    }
    function copyState() {
      var original = window.history.state;
      var copy = {};
      if (original && typeof original === 'object') { Object.keys(original).forEach(function (key) { copy[key] = original[key]; }); }
      return copy;
    }
    function rememberHistory(bookmark, cleanUrl) {
      if (!isRoom) { return; }
      try {
        var state = copyState();
        state.roomReading = encode(bookmark);
        state.roomReadingPage = 'index.html';
        if (bookmark.key === 'profile' && aboutReturn) { state.roomReadingParent = encode(aboutReturn); }
        else { delete state.roomReadingParent; }
        var url = cleanUrl || window.location.href;
        state.roomReadingHash = url.indexOf('#') < 0 ? '' : '#' + url.split('#').slice(1).join('#');
        window.history.replaceState(state, '', url);
      } catch (error) { /* Restricted History API cannot prevent the Back link. */ }
    }
    function capture() {
      if (adapter) { return adapter.capture(); }
      return null;
    }
    function restore(bookmark) {
      if (!bookmark || !adapter || !adapter.restore(bookmark)) { return false; }
      saveStored(bookmark);
      rememberHistory(bookmark, resumeUrl(bookmark));
      return true;
    }
    function resumeUrl(bookmark) {
      return withParameter(withParameter(window.location.href, 'room-resume', null), 'room-parent', null).split('#')[0] + '#' + (bookmark.key === 'profile' ? 'about' : 'tour-' + bookmark.key);
    }

    var context = decode(parameter(window.location.href, 'room-return')) || loadStored();
    var initial = decode(parameter(window.location.href, 'room-resume')) || decode(startup && startup.resumeToken);
    var parentReading = decode(parameter(window.location.href, 'room-parent')) || decode(startup && startup.resumeParentToken);
    if (parentReading && parentReading.key !== 'profile') { aboutReturn = parentReading; }
    // Explicit reload keeps the requested loading-bar / greeting start.
    if (isRoom && startup && startup.fromStart) {
      context = null; initial = null; aboutReturn = null; saveStored(null);
      try {
        var freshState = copyState(); delete freshState.roomReading; delete freshState.roomReadingPage; delete freshState.roomReadingHash; delete freshState.roomReadingParent;
        window.history.replaceState(freshState, '', withParameter(withParameter(window.location.href, 'room-resume', null), 'room-parent', null));
      } catch (error) { /* Reload still starts from the loading bar. */ }
    }

    function backHref(bookmark) {
      return prefix + 'index.html?room-resume=' + encode(bookmark) + (bookmark.key === 'profile' && aboutReturn ? '&room-parent=' + encode(aboutReturn) : '') + '#' + (bookmark.key === 'profile' ? 'about' : 'tour-' + bookmark.key);
    }
    function updateBackLinks(bookmark) {
      Array.prototype.forEach.call(document.querySelectorAll('[data-room-back]'), function (link) {
        if (bookmark && !isRoom) { link.setAttribute('href', backHref(bookmark)); }
        link.setAttribute('aria-label', 'Back to ' + (bookmark ? names[bookmark.key] : 'the room chapter'));
      });
    }
    function route(href) {
      if (!href || /^(?:[a-z][\w+.-]*:|\/\/|\/|#)/i.test(href)) { return null; }
      var file = href.split('#')[0].split('?')[0];
      if (!/\.html$/i.test(file)) { return null; }
      var parts = page.split('/'); parts.pop();
      file.split('/').forEach(function (part) {
        if (part === '..') { parts.pop(); }
        else if (part && part !== '.') { parts.push(part); }
      });
      return parts.join('/');
    }
    function ordinaryClick(event, link) {
      return !event.defaultPrevented && (event.button === undefined || event.button === 0) &&
        !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey &&
        !link.getAttribute('target') && link.getAttribute('download') === null;
    }

    updateBackLinks(context);
    Array.prototype.forEach.call(document.querySelectorAll('a'), function (link) {
      link.addEventListener('click', function (event) {
        if (!ordinaryClick(event, link)) { return; }
        if (link.getAttribute('data-room-back') !== null) {
          if (isRoom) {
            var previous = aboutReturn || { key: 'about', phase: 'read', fraction: 0, paused: document.body.classList.contains('motion-paused') };
            if (restore(previous)) { event.preventDefault(); }
          }
          return;
        }
        var href = link.getAttribute('href');
        if (isRoom && href === '#about') {
          aboutReturn = capture();
          if (aboutReturn) { saveStored(aboutReturn); rememberHistory(aboutReturn); }
          return;
        }
        var destination = route(href);
        // Room / logo links are an explicit fresh visit; Back is the resume action.
        if (!destination || destination === 'index.html') { return; }
        var previous = isRoom ? capture() : context;
        if (!previous) { return; }
        context = previous;
        saveStored(previous);
        rememberHistory(previous);
        var destinationHref = withParameter(href, 'room-return', encode(previous));
        link.setAttribute('href', withParameter(destinationHref, 'room-parent', previous.key === 'profile' && aboutReturn ? encode(aboutReturn) : null));
      });
    });
    if (isRoom) {
      window.addEventListener('pagehide', function () {
        var previous = capture();
        if (previous) { saveStored(previous); rememberHistory(previous); }
      });
      window.addEventListener('pageshow', function (event) {
        if (event.persisted) { window.roomNavigation.restoreHistory(); }
        else if (loadingResume) { var previous = loadingResume; loadingResume = null; restore(previous); }
      });
      window.addEventListener('load', function () { if (loadingResume) { restore(loadingResume); } });
      ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(function (name) {
        window.addEventListener(name, function () { loadingResume = null; }, { passive: true });
      });
    }
    window.roomNavigation = {
      registerTour: function (value) { adapter = value; },
      takeResume: function () { var previous = initial; initial = null; return previous; },
      finishResume: function (bookmark) { loadingResume = bookmark; saveStored(bookmark); rememberHistory(bookmark, resumeUrl(bookmark)); },
      restoreHistory: function () {
        var state = window.history.state;
        if (!state || state.roomReadingPage !== 'index.html' || state.roomReadingHash !== (window.location.hash || '')) { return false; }
        var previous = decode(state.roomReading);
        var parent = decode(state.roomReadingParent);
        if (previous && previous.key === 'profile' && parent && parent.key !== 'profile') { aboutReturn = parent; }
        return restore(previous);
      },
      chapterHistoryState: function () { var state = copyState(); delete state.roomReading; delete state.roomReadingPage; delete state.roomReadingHash; delete state.roomReadingParent; return state; }
    };
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', startReadingNavigation); }
  else { startReadingNavigation(); }
}());
