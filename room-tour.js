/* Room tour: normal page scrolling and ordinary anchor links.
   CSS handles the opening animation; JavaScript guides the room camera. */
(function () {
  'use strict';

  // Old WebViews can query nodes but do not implement NodeList.forEach.
  function findAll(root, selector) {
    return Array.prototype.slice.call(root.querySelectorAll(selector));
  }

  function scrollPageTo(top, left) {
    try { window.scrollTo({ top: top, left: left || 0, behavior: 'instant' }); }
    catch (error) {
      try { window.scrollTo({ top: top, left: left || 0, behavior: 'auto' }); }
      catch (legacyError) { window.scrollTo(left || 0, top); }
    }
  }

  function startRoomTour() {
    var tour = document.getElementById('room-tour');
    var room = document.getElementById('room-scene');
    if (!tour || !room) { return; }

    var chapters = findAll(tour, '.tour-chapter[data-chapter]');
    var stops = findAll(document, '.tour-stop[data-chapter]');
    var hotspots = findAll(document, '.room-hotspot[data-chapter]');
    var currentNumber = document.getElementById('tour-current');
    var currentName = document.getElementById('tour-name');
    var progress = document.getElementById('tour-progress');
    var nextControl = document.getElementById('tour-next');
    var nextLabel = document.getElementById('tour-next-label');
    var jumpRun = 0;
    var readingNavigation = window.roomNavigation || null;
    var readingStage = tour.querySelector('.tour-interface');
    var viewStage = tour.querySelector('.tour-view');
    var mobileReadingStage = tour.querySelector('.tour-reading-window');
    if (!mobileReadingStage && readingStage) {
      mobileReadingStage = document.createElement('div');
      mobileReadingStage.className = 'tour-reading-window';
      readingStage.appendChild(mobileReadingStage);
    }
    var displayControls = document.querySelector('.room-controls');
    var controlHome = displayControls && displayControls.parentNode;
    var siteMenu = document.getElementById('site-nav');
    var wipe = document.getElementById('chapter-wipe');
    var model = window.roomModel || null;
    var modelFocus = {};
    var pointerYaw = 0;
    var pointerTilt = 0;
    var hoverYaw = 0;
    var hoverTilt = 0;
    var hoverQueued = false;
    var hoverTime = 0;
    var pointerBounds = null;
    var lastChapter = -1;
    var activeKey = 'home';
    var lastPlaybackKey = null;
    var motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    var frameQueued = false;
    var viewportControlsQueued = false;
    var lastVisibleHeight = -1;
    var lastViewportInset = -1;
    var copies = chapters.map(function (chapter) { return chapter.querySelector('.tour-copy'); });
    var storyLayout = null;
    var pendingStoryPosition = null;
    var layoutDirty = true;
    var storyPosition = null;
    var storyTime = 0;
    var snapPosition = true;
    var sceneZoom = 1;
    var viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    var layoutWidth = window.innerWidth;
    var viewportHeight = window.innerHeight;
    var viewportPixelRatio = window.devicePixelRatio || 1;
    var viewportPortrait = portraitViewport();
    var touchViewport = window.matchMedia('(pointer: coarse)').matches;
    var mobileStory = false;
    var basicLayout = !window.CSS || typeof window.CSS.supports !== 'function' || !window.CSS.supports('width', 'var(--room-size)');
    var stickySupported = !basicLayout && (window.CSS.supports('position', 'sticky') || window.CSS.supports('position', '-webkit-sticky'));
    var fixedViewport = !basicLayout && !stickySupported;

    function phoneLayout() {
      return layoutWidth <= 760 || (touchViewport && layoutWidth <= 1024);
    }

    function phonePaperWidth() {
      return Math.min(viewportWidth - 76, Math.max(viewportWidth * 0.72, 246), 520);
    }

    function updateViewportControls() {
      viewportControlsQueued = false;
      if (!readingStage || window.roomTourFailed) { return; }
      var visual = window.visualViewport;
      var visible = window.innerHeight;
      // Pinch zoom is left to the browser. Only browser bars / keyboard resize
      // the clear area; the chapter timeline and prepared 3D geometry stay put.
      if (visual && (!visual.scale || Math.abs(visual.scale - 1) < 0.01)) { visible = Math.min(visible, visual.height); }
      visible = Math.max(1, visible);
      var inset = mobileStory ? Math.max(0, viewportHeight - visible) : 0;
      if (Math.abs(visible - lastVisibleHeight) > 0.5) {
        readingStage.style.setProperty('--visible-height', visible.toFixed(3) + 'px'); lastVisibleHeight = visible;
      }
      if (Math.abs(inset - lastViewportInset) > 0.5) {
        readingStage.style.setProperty('--viewport-bottom', inset.toFixed(3) + 'px'); lastViewportInset = inset;
      }
    }

    function requestViewportControls() {
      if (!viewportControlsQueued && !window.roomTourFailed) {
        viewportControlsQueued = true;
        window.requestAnimationFrame(updateViewportControls);
      }
    }

    function portraitViewport() {
      if (window.screen && window.screen.orientation && typeof window.screen.orientation.angle === 'number') {
        return Math.abs(window.screen.orientation.angle) % 180 === 0;
      }
      if (typeof window.orientation === 'number') { return Math.abs(window.orientation) % 180 === 0; }
      return window.innerHeight > window.innerWidth;
    }

    function watchMotion(callback) {
      if (motionPreference.addEventListener) { motionPreference.addEventListener('change', callback); }
      else if (motionPreference.addListener) { motionPreference.addListener(callback); }
    }

    function focusWithoutScroll(element) {
      if (!element) { return; }
      var top = window.scrollY, left = window.scrollX || 0;
      try { element.focus({ preventScroll: true }); }
      catch (error) { element.focus(); }
      if (window.scrollY !== top || (window.scrollX || 0) !== left) {
        scrollPageTo(top, left);
      }
    }

    // Match furniture by chapter key so moving the directory cannot send the
    // camera to the previous chapter's object. Paper side comes from the HTML.
    var viewPresets = {
      home: [0.5, 0.5, 1], map: [0.5, 0.5, 1],
      about: [0.71, 0.28, 2.55], education: [0.47, 0.29, 2.75],
      skills: [0.49, 0.65, 2.65], projects: [0.27, 0.34, 2.9],
      experience: [0.225, 0.65, 2.65]
    };
    var views = chapters.map(function (chapter, index) {
      var preset = viewPresets[chapter.getAttribute('data-chapter')] || viewPresets.home;
      return [preset[0], preset[1], preset[2], index === 0 ? 0.5 :
        (chapter.getAttribute('data-side') === 'right' ? 0.25 : 0.75), index === 0 ? 0.49 : 0.5];
    });
    // A phone keeps the furniture beside the alternating reading paper.
    // These zooms are deliberately smaller than the desktop close-ups.
    var phoneZoomPresets = { home: 1, map: 1, about: 1.55, education: 1.6, skills: 1.8, projects: 1.85, experience: 1.7 };
    var phoneZooms = chapters.map(function (chapter) { return phoneZoomPresets[chapter.getAttribute('data-chapter')] || 1; });

    function motionAllowed() {
      return !motionPreference.matches && !document.body.classList.contains('motion-paused');
    }

    function clamp(value, minimum, maximum) {
      return Math.max(minimum, Math.min(maximum, value));
    }

    function roomBaseSize() {
      var width = viewportWidth, height = viewportHeight;
      if (basicLayout) { return Math.min(width * 0.85, 640); }
      if (phoneLayout()) { return Math.min(width * 1.08, height * 0.60, 600); }
      if (height <= 520) { return Math.min(width * 0.76, 340); }
      return Math.min(height * 0.68, width * 0.64, 900);
    }

    // Read the six real furniture anchors once in the model's resting view.
    // Links remain flat HTML, keeping their text crisp as the room turns.
    function readModelAnchors(saveFocus) {
      if (!model || !model.anchors) { return; }
      var positions = model.projectAnchors ? model.projectAnchors() : {};
      // Read every projection before writing link positions, avoiding repeated
      // read/write layout work in the same animation frame.
      if (!model.projectAnchors) {
      var bounds = room.getBoundingClientRect();
      if (!bounds.width || !bounds.height) { return; }
      var anchors = model.anchors();
      Object.keys(anchors).forEach(function (key) {
        var point = anchors[key].getBoundingClientRect();
        positions[key] = [
          (point.left + point.width / 2 - bounds.left) / bounds.width,
          (point.top + point.height / 2 - bounds.top) / bounds.height
        ];
      });
      }
      hotspots.forEach(function (hotspot) {
        var key = hotspot.getAttribute('data-chapter');
        if (!saveFocus && activeKey !== 'home' && key !== activeKey) { return; }
        var point = positions[key];
        if (!point) { return; }
        var x = point[0];
        var y = point[1];
        // The model now keeps a fixed-size scene. Its flat links move using
        // transforms, so zoom does not resize the room or enlarge label text.
        var size = roomBaseSize();
        var left = '50%';
        var top = '50%';
        if (hotspot.style.left !== left) { hotspot.style.setProperty('left', left, 'important'); }
        if (hotspot.style.top !== top) { hotspot.style.setProperty('top', top, 'important'); }
        setStyle(hotspot, 'transform', 'translate3d(' + ((x - 0.5) * size * sceneZoom).toFixed(3) + 'px, ' + ((y - 0.5) * size * sceneZoom).toFixed(3) + 'px, 0) translate(-50%, -50%)');
        if (saveFocus) { modelFocus[key] = [x, y]; }
      });
    }

    function cameraForChapter(index) {
      if (basicLayout) { return [0, 0, 1]; }
      index = Math.min(index, views.length - 1);
      var width = viewportWidth;
      var height = viewportHeight;
      if (!phoneLayout() && height > 520) {
        var view = views[index];
        var point = modelFocus[chapters[index].getAttribute('data-chapter')] || view;
        // These dimensions match the fixed, centered square in room-tour.css.
        var roomSize = Math.min(height * 0.68, width * 0.64, 900);
        // The bitmap fallback cannot be enlarged past its actual pixel width.
        var zoom = model ? view[2] : Math.min(view[2], 1254 / roomSize);
        zoom = Math.max(1, zoom);
        var x = view[3] * width - width * 0.5 - (point[0] - 0.5) * roomSize * zoom;
        var y = view[4] * height - height * 0.49 - (point[1] - 0.5) * roomSize * zoom;
        return [x, y, zoom];
      }
      if (!phoneLayout() || index === 0) { return [0, 0, 1]; }
      var focus = modelFocus[chapters[index].getAttribute('data-chapter')] || views[index];
      var size = roomBaseSize();
      var phoneZoom = model ? phoneZooms[index] : Math.min(phoneZooms[index], 1254 / size);
      // Keep the furniture in the clear side of the alternating phone paper.
      // The same measured width drives the paper and its bottom controls.
      var gap = width - phonePaperWidth();
      var targetX = chapters[index].getAttribute('data-side') === 'right' ? gap / 2 : width - gap / 2;
      return [targetX - width / 2 - (focus[0] - 0.5) * size * phoneZoom,
        -(focus[1] - 0.5) * size * phoneZoom, phoneZoom];
    }

    function activateChapter(nearest) {
      var activeChapter = chapters[nearest];
      activeKey = activeChapter.getAttribute('data-chapter');
      if (nearest !== lastChapter) {
      lastChapter = nearest;
      tour.setAttribute('data-active-chapter', activeKey);
      tour.setAttribute('data-panel-side', activeChapter.getAttribute('data-side') || 'none');
      chapters.forEach(function (chapter, index) {
        chapter.classList.toggle('is-active', index === nearest);
      });
      stops.forEach(function (stop) {
        var active = stop.getAttribute('data-chapter') === activeKey;
        stop.classList.toggle('is-active', active);
        if (active) { stop.setAttribute('aria-current', 'location'); }
        else { stop.removeAttribute('aria-current'); }
      });
      hotspots.forEach(function (hotspot) {
        hotspot.classList.toggle('is-current', hotspot.getAttribute('data-chapter') === activeKey);
      });
      if (currentNumber) { currentNumber.textContent = ('0' + (nearest + 1)).slice(-2); }
      if (currentName) { currentName.textContent = activeChapter.getAttribute('data-name') || ''; }
      if (nextControl) {
        var nextIndex = (nearest + 1) % chapters.length;
        var nextName = chapters[nextIndex].getAttribute('data-name');
        nextControl.setAttribute('href', '#' + chapters[nextIndex].getAttribute('id'));
        nextControl.setAttribute('aria-label', nextIndex === 0 ? 'Back to the room' : 'Next chapter: ' + nextName);
        if (nextLabel) { nextLabel.textContent = nextIndex === 0 ? 'Back to room' : 'Next: ' + nextName; }
      }
      updateModelPlayback();
      }
    }

    function updateModelPlayback(force) {
      if (!model || !model.setChapter) { return; }
      // A fixed tour leaves the viewport when the full introduction begins.
      // Its SVG movie must not keep painting behind an offscreen room.
      var offscreen = storyLayout && (window.scrollY >= storyLayout.end || window.scrollY + viewportHeight <= storyLayout.top);
      var waiting = introPlaying && introPhase !== 'assembling';
      var key = document.visibilityState === 'hidden' || offscreen || waiting ? 'loading' : activeKey;
      if (force || key !== lastPlaybackKey) { lastPlaybackKey = key; model.setChapter(key); }
    }

    function smoothStep(value) {
      value = clamp(value, 0, 1);
      return value * value * (3 - 2 * value);
    }

    function setStyle(element, property, value) {
      if (element.style[property] !== value) { element.style[property] = value; }
    }

    function setTourState(property, value) {
      if (tour.getAttribute(property) !== value) { tour.setAttribute(property, value); }
    }

    function prepareStoryLayout() {
      layoutDirty = false;
      var story = !basicLayout && (phoneLayout() ? viewportHeight >= 320 : viewportHeight > 520);
      tour.classList.toggle('tour-basic', basicLayout);
      mobileStory = story && phoneLayout();
      // A fixed mobile stage avoids WebKit differences between overlapping
      // sticky siblings. The document still provides all native scrolling.
      fixedViewport = !basicLayout && (mobileStory || !stickySupported);
      tour.classList.toggle('tour-story', story);
      tour.classList.toggle('tour-mobile-story', mobileStory);
      tour.classList.toggle('tour-fixed', story && fixedViewport);
      if (!fixedViewport) {
        if (viewStage) { viewStage.style.top = ''; }
        if (readingStage) { readingStage.style.top = ''; }
      }
      tour.style.setProperty('--tour-height', viewportHeight + 'px');
      tour.style.setProperty('--room-size', roomBaseSize().toFixed(3) + 'px');
      tour.style.setProperty('--paper-min-height', (viewportHeight * 1.25).toFixed(3) + 'px');
      tour.style.setProperty('--phone-paper-width', phonePaperWidth().toFixed(3) + 'px');
      updateViewportControls();
      if (displayControls && siteMenu) {
        var controlParent = mobileStory ? siteMenu : controlHome;
        if (displayControls.parentNode !== controlParent) { controlParent.appendChild(displayControls); }
      }
      var focusBeforeMove = document.activeElement;
      var moved = false;
      chapters.forEach(function (chapter, index) {
        // Keep each reading paper inside the existing sticky viewport. Native
        // scrolling must not move it before the next animation frame catches up.
        if (index > 0) {
          var parent = story ? readingStage : chapter;
          if (copies[index].parentNode !== parent) { parent.appendChild(copies[index]); moved = true; }
          copies[index].classList.toggle('tour-paper', story);
          if (story) { copies[index].setAttribute('data-paper-side', chapter.getAttribute('data-side')); }
          else { copies[index].removeAttribute('data-paper-side'); }
        } else {
          var homeParent = mobileStory ? readingStage : chapter;
          if (copies[index].parentNode !== homeParent) { homeParent.appendChild(copies[index]); moved = true; }
          copies[index].classList.toggle('tour-home-caption', mobileStory);
        }
        chapter.style.height = '';
        copies[index].style.transform = '';
        copies[index].style.visibility = '';
        copies[index].style.opacity = '';
        copies[index].style.setProperty('--paper-round', '90px');
        copies[index].classList.remove('is-visible');
      });
      if (moved && focusBeforeMove && focusBeforeMove !== document.activeElement) { focusWithoutScroll(focusBeforeMove); }
      storyPosition = null;
      storyTime = 0;
      snapPosition = true;
      if (!story) {
        storyLayout = null;
        pendingStoryPosition = null;
        if (viewStage) { viewStage.style.top = ''; }
        if (readingStage) { readingStage.style.top = ''; }
        setTourState('data-transitioning', 'false');
        return;
      }
      var height = viewportHeight;
      var readingTop = 0;
      var frameHeight = height - readingTop;
      tour.style.setProperty('--reading-top', readingTop.toFixed(4) + 'px');
      tour.style.setProperty('--reading-height', frameHeight.toFixed(4) + 'px');
      // Measure only on initial layout / resize, never during a scroll frame.
      // Extra content automatically receives more reading distance.
      var paperHeights = copies.map(function (copy, index) {
        return index === 0 ? height : Math.max(frameHeight * 1.25, copy.scrollHeight || 0);
      });
      var start = chapters[0].getBoundingClientRect().top + window.scrollY;
      storyLayout = { top: start, rows: [], frameHeight: frameHeight };
      chapters.forEach(function (chapter, index) {
        var paperHeight = paperHeights[index];
        var reading = index === 0 ? height * 0.45 : Math.max(height * 1.35, paperHeight - frameHeight + height * 0.95);
        var journey = height * (mobileStory ? 1 : 1.25);
        var row = { start: start, reading: reading, journey: journey, height: paperHeight };
        row.end = start + reading + journey;
        storyLayout.rows.push(row);
        chapter.style.height = (reading + journey).toFixed(2) + 'px';
        start = row.end;
      });
      storyLayout.end = start;
      if (pendingStoryPosition && !introPlaying) {
        var restored = storyLayout.rows[pendingStoryPosition.index];
        var destination = restored.start + (pendingStoryPosition.journey ? restored.reading + restored.journey * pendingStoryPosition.fraction : restored.reading * pendingStoryPosition.fraction);
        scrollPageTo(destination, 0);
        storyPosition = destination;
      }
      pendingStoryPosition = null;
    }

    function paintPaper(index, y, visible, rawScroll, viewportTop, reading) {
      var copy = copies[index];
      var row = storyLayout.rows[index];
      setStyle(copy, 'visibility', visible ? 'visible' : 'hidden');
      copy.classList.toggle('is-visible', visible);
      if (!visible) { return; }
      // Reading papers already stay with the sticky viewport. Move them only
      // along the camera timeline, without cancelling native document scroll.
      // Align the thin divider to device pixels so its coverage stays stable.
      var pixelRatio = window.devicePixelRatio || 1;
      var offset = index === 0 && !mobileStory ? rawScroll - row.start + viewportTop + y : Math.round(y * pixelRatio) / pixelRatio;
      setStyle(copy, 'transform', 'translate3d(0, ' + offset.toFixed(4) + 'px, 0)');
    }

    function renderStory(time) {
      var rows = storyLayout.rows;
      var height = viewportHeight;
      var frameHeight = storyLayout.frameHeight;
      var raw = window.scrollY;
      var elapsed = time && storyTime ? clamp(time - storyTime, 1, 40) : 16;
      storyTime = time || 0;
      var difference = storyPosition === null ? 0 : raw - storyPosition;
      // A small catch-up softens wheel bursts. Scrollbars, deep links and
      // jumps beyond the tour retain their native position immediately.
      if (snapPosition || storyPosition === null || mobileStory || !motionAllowed() ||
          Math.abs(difference) > height * 3 || raw < storyLayout.top || raw > storyLayout.end - height) {
        storyPosition = raw;
      } else {
        var step = difference * (1 - Math.exp(-elapsed / 105));
        storyPosition += clamp(step, -height * elapsed / 85, height * elapsed / 85);
        if (Math.abs(raw - storyPosition) < 0.35) { storyPosition = raw; }
      }
      snapPosition = false;
      var position = storyPosition;
      var before = 0;
      for (var i = 1; i < rows.length; i += 1) {
        if (position >= rows[i].start) { before = i; }
      }
      var row = rows[before];
      var after = Math.min(before + 1, rows.length - 1);
      var reading = clamp((position - row.start) / row.reading, 0, 1);
      var journey = after === before ? 0 : clamp((position - row.start - row.reading) / row.journey, 0, 1);
      var blend = smoothStep(journey);
      // The old paper has completely left before the next one enters.
      var outgoing = smoothStep(journey / 0.46);
      var incoming = smoothStep((journey - 0.54) / 0.46);
      var viewportTop = Math.max(storyLayout.top - raw, Math.min(0, storyLayout.end - raw - height));
      if (fixedViewport) {
        // Sticky is optional: a fixed, clipped viewport follows the very same
        // chapter timeline and leaves the screen at the end of the tour.
        if (viewStage) { setStyle(viewStage, 'top', viewportTop.toFixed(3) + 'px'); }
        if (readingStage) { setStyle(readingStage, 'top', viewportTop.toFixed(3) + 'px'); }
      }
      var travelled = clamp((position - rows[0].start) / (rows[rows.length - 1].start - rows[0].start), 0, 1);
      if (progress) { setStyle(progress, 'transform', 'scaleX(' + travelled.toFixed(4) + ')'); }
      // Reading follows the visitor's own scrolling in every mode. Reduced
      // motion still stops camera interpolation, sway and automatic animation.
      var showBefore = before === 0 ? journey < 0.46 : outgoing < 1;
      var showAfter = after !== before && journey > 0.54 && incoming > 0;
      copies.forEach(function (copy, index) {
        if ((index === before && showBefore) || (index === after && showAfter)) { return; }
        setStyle(copy, 'visibility', 'hidden');
        if (copy.classList.contains('is-visible')) { copy.classList.remove('is-visible'); }
      });
      if (before === 0) {
        paintPaper(0, -height * 0.18 * blend, showBefore, raw, viewportTop, reading);
        setStyle(copies[0], 'opacity', (1 - outgoing).toFixed(4));
      } else {
        var endOffset = -(row.height - frameHeight + frameHeight * 0.22);
        var paperY = endOffset * reading + (-row.height - frameHeight * 0.08 - endOffset) * outgoing;
        paintPaper(before, paperY, showBefore, raw, viewportTop, reading);
      }
      if (showAfter) {
        paintPaper(after, frameHeight * (1 - incoming), incoming > 0, raw, viewportTop, 0);
      }
      activateChapter(incoming > 0 ? after : before);
      setTourState('data-transitioning', journey > 0 && journey < 1 ? 'true' : 'false');
      var opening = before === 0 ? blend : 1;
      if (wipe) {
        var circle = motionAllowed() ? opening : (activeKey === 'home' ? 0 : 1);
        setStyle(wipe, 'transform', 'translate(-50%, -50%) scale(' + circle.toFixed(4) + ')');
      }
      var first = cameraForChapter(before);
      var second = cameraForChapter(after);
      var camera = first.map(function (value, index) { return value + (second[index] - value) * blend; });
      paintCamera(camera, opening);
      updateModelPlayback();
      if (storyPosition !== raw) { requestTourUpdate(); }
      else { storyTime = 0; }
    }

    function updateTour(time) {
      frameQueued = false;
      if (window.roomTourFailed) { return; }
      if (!chapters.length) { return; }
      if (introPlaying && startupFromBeginning && window.scrollY !== 0) { resetStartupPosition(false); }
      if (layoutDirty) { prepareStoryLayout(); }
      if (storyLayout) { renderStory(time); return; }
      // Compact windows retain ordinary scrolling text below the full room.
      var phoneReadingArea = window.innerWidth <= 760 && window.innerHeight > 520;
      var viewportCenter = phoneReadingArea ? window.innerHeight * 0.715 + 28.5 : window.innerHeight / 2;
      var centers = chapters.map(function (chapter) {
        var rectangle = chapter.getBoundingClientRect();
        return rectangle.top + rectangle.height / 2;
      });
      var nearest = 0;
      for (var i = 1; i < centers.length; i += 1) {
        if (Math.abs(centers[i] - viewportCenter) < Math.abs(centers[nearest] - viewportCenter)) { nearest = i; }
      }
      activateChapter(nearest);

      var distance = centers[centers.length - 1] - centers[0];
      var travelled = distance > 0 ? clamp((viewportCenter - centers[0]) / distance, 0, 1) : 0;
      if (progress) { setStyle(progress, 'transform', 'scaleX(' + travelled.toFixed(4) + ')'); }
      var openingDistance = centers.length > 1 ? centers[1] - centers[0] : 1;
      var openingProgress = clamp((viewportCenter - centers[0]) / openingDistance, 0, 1);
      if (wipe) {
        var circle = motionAllowed() ? openingProgress : (nearest === 0 ? 0 : 1);
        setStyle(wipe, 'transform', 'translate(-50%, -50%) scale(' + circle.toFixed(4) + ')');
      }
      // Find the two section centers around the viewport and blend their views.
      var before = 0;
      var after = 0;
      var blend = 0;
      if (viewportCenter >= centers[centers.length - 1]) {
        before = centers.length - 1;
        after = before;
      } else if (viewportCenter > centers[0]) {
        for (var j = 0; j < centers.length - 1; j += 1) {
          if (viewportCenter >= centers[j] && viewportCenter <= centers[j + 1]) {
            before = j;
            after = j + 1;
            blend = (viewportCenter - centers[j]) / (centers[j + 1] - centers[j]);
            break;
          }
        }
      }
      var first = cameraForChapter(before);
      var second = cameraForChapter(after);
      var camera = first.map(function (value, index) { return value + (second[index] - value) * blend; });
      paintCamera(camera, openingProgress);
      updateModelPlayback();
    }

    function paintCamera(camera, openingProgress) {
      // Reduced motion keeps the chapter composition, without interpolation
      // or decorative sway. Resetting to the overview would hide furniture
      // behind the reading paper on Windows/macOS with animations disabled.
      if (!motionAllowed()) { camera = cameraForChapter(lastChapter < 0 ? 0 : lastChapter); }

      var x = camera[0];
      var y = camera[1];
      var scale = camera[2];
      sceneZoom = scale;
      // Native 3D geometry zooms at its camera; its layout remains constant.
      // Only the bitmap fallback needs the older bounded image enlargement.
      setStyle(room, 'width', model ? '100%' : (100 * scale).toFixed(4) + '%');
      setStyle(room, 'height', model ? '100%' : (100 * scale).toFixed(4) + '%');
      setStyle(room, 'left', model ? '0%' : (-50 * (scale - 1)).toFixed(4) + '%');
      setStyle(room, 'top', model ? '0%' : (-50 * (scale - 1)).toFixed(4) + '%');
      setStyle(room, 'transform', 'translate(' + x.toFixed(2) + 'px, ' + y.toFixed(2) + 'px)');
      if (model) {
        model.layout(roomBaseSize(), scale);
        var turn = motionAllowed() && openingProgress === 0 && !introPlaying;
        if (!turn) { pointerYaw = pointerTilt = hoverYaw = hoverTilt = 0; }
        model.setView(turn ? hoverYaw : 0, turn ? hoverTilt : 0);
        readModelAnchors(false);
      }
    }

    function requestTourUpdate() {
      if (window.roomTourFailed) { return; }
      if (!frameQueued) {
        frameQueued = true;
        window.requestAnimationFrame(updateTour);
      }
    }
    window.addEventListener('scroll', requestTourUpdate, { passive: true });
    window.addEventListener('resize', function () {
      // Mobile browser bars resize the visual viewport while swiping. Keep
      // the established scroll distances and camera square during that gesture.
      var width = document.documentElement.clientWidth || window.innerWidth;
      var modeChanged = (window.innerWidth <= 760) !== (layoutWidth <= 760);
      var widthChanged = Math.abs(width - viewportWidth) > 1 || modeChanged;
      var orientationChanged = portraitViewport() !== viewportPortrait;
      var ratioChanged = Math.abs((window.devicePixelRatio || 1) - viewportPixelRatio) > 0.01;
      if (touchViewport && phoneLayout() && !widthChanged && !orientationChanged && !ratioChanged) { requestViewportControls(); return; }
      if (storyLayout && !introPlaying && window.scrollY >= storyLayout.top && window.scrollY < storyLayout.end) {
        var currentRow = 0;
        storyLayout.rows.forEach(function (row, index) { if (window.scrollY >= row.start) { currentRow = index; } });
        var row = storyLayout.rows[currentRow];
        var offset = Math.max(0, window.scrollY - row.start);
        pendingStoryPosition = { index: currentRow, journey: offset > row.reading,
          fraction: offset > row.reading ? (offset - row.reading) / row.journey : offset / row.reading };
      }
      viewportWidth = width;
      layoutWidth = window.innerWidth;
      viewportHeight = window.innerHeight;
      viewportPixelRatio = window.devicePixelRatio || 1;
      viewportPortrait = portraitViewport();
      pointerBounds = null;
      layoutDirty = true;
      requestTourUpdate();
    });
    window.addEventListener('hashchange', function () { snapPosition = true; requestTourUpdate(); });
    if (window.visualViewport && window.visualViewport.addEventListener) {
      window.visualViewport.addEventListener('resize', requestViewportControls, { passive: true });
    }
    // Pointer motion updates only the view and its six projected links. It
    // never recalculates chapter geometry, camera size or the whole tour.
    function renderHover(time) {
      if (window.roomTourFailed || !model || !motionAllowed() || activeKey !== 'home' || introPlaying || tour.getAttribute('data-transitioning') === 'true') {
        hoverQueued = false; hoverTime = 0;
        return;
      }
      var elapsed = time && hoverTime ? Math.min(40, time - hoverTime) : 16;
      hoverTime = time || 0;
      var ease = 1 - Math.exp(-elapsed / 85);
      hoverYaw += (pointerYaw - hoverYaw) * ease;
      hoverTilt += (pointerTilt - hoverTilt) * ease;
      var settling = Math.abs(pointerYaw - hoverYaw) > 0.01 || Math.abs(pointerTilt - hoverTilt) > 0.01;
      if (!settling) { hoverYaw = pointerYaw; hoverTilt = pointerTilt; }
      model.setView(hoverYaw, hoverTilt);
      readModelAnchors(false);
      if (settling) { window.requestAnimationFrame(renderHover); }
      else { hoverQueued = false; hoverTime = 0; }
    }
    function requestHover() {
      if (!hoverQueued) { hoverQueued = true; window.requestAnimationFrame(renderHover); }
    }
    room.addEventListener('pointerenter', function () { pointerBounds = room.getBoundingClientRect(); });
    room.addEventListener('pointermove', function (event) {
      if (!model || !motionAllowed() || activeKey !== 'home' || introPlaying || tour.getAttribute('data-transitioning') === 'true' || event.pointerType === 'touch') { return; }
      var stage = pointerBounds || room.getBoundingClientRect();
      pointerBounds = stage;
      pointerYaw = clamp((event.clientX - stage.left) / stage.width - 0.5, -0.5, 0.5) * 12;
      pointerTilt = clamp((event.clientY - stage.top) / stage.height - 0.5, -0.5, 0.5) * 4;
      requestHover();
    });
    room.addEventListener('pointerleave', function () {
      pointerBounds = null;
      pointerYaw = 0; pointerTilt = 0; requestHover();
    });

    // A loading bar, a greeting that waits for input, then the room entrance.
    var introScreen = document.getElementById('intro-screen');
    var introLoading = document.getElementById('intro-loading');
    var introProgress = document.getElementById('intro-progress');
    var enterButton = document.getElementById('intro-enter');
    var skipButton = document.getElementById('intro-skip');
    var replayButton = document.getElementById('replay-intro');
    var arrival = document.getElementById('room-arrival');
    var introTimer = null;
    var finishTimer = null;
    var introPlaying = false;
    var introRun = 0;
    var introPhase = 'idle';
    var introReturnFocus = null;
    var startupFromBeginning = window.roomStartup ? window.roomStartup.fromStart : !window.location.hash;
    var introBackgrounds = [document.getElementById('main-content'), document.querySelector('.scene-header'), document.querySelector('footer')];
    var touchStartY = null;

    function resetStartupPosition(cleanHash) {
      if (cleanHash && window.location.hash) {
        try { window.history.replaceState(window.history.state, '', window.location.href.split('#')[0]); }
        catch (error) { /* The early reset still prevents native position restoration. */ }
      }
      scrollPageTo(0, 0);
      storyPosition = 0;
      storyTime = 0;
      snapPosition = true;
      pointerYaw = pointerTilt = hoverYaw = hoverTilt = 0;
    }

    function setIntroProgress(value) {
      if (introProgress) { introProgress.style.transform = 'scaleX(' + (value / 100).toFixed(4) + ')'; }
      if (introLoading) { introLoading.setAttribute('aria-valuenow', String(Math.round(value))); }
    }

    function finishIntro() {
      // Clear both timers and invalidate callbacks belonging to an older replay.
      introRun += 1;
      if (introTimer !== null) { window.clearTimeout(introTimer); introTimer = null; }
      if (finishTimer !== null) { window.clearTimeout(finishTimer); finishTimer = null; }
      introPlaying = false;
      introPhase = 'idle';
      pointerYaw = pointerTilt = hoverYaw = hoverTilt = 0;
      document.body.classList.remove('intro-running', 'intro-finishing');
      document.documentElement.classList.remove('room-booting', 'room-opening');
      introBackgrounds.forEach(function (element) { if (element) { element.removeAttribute('inert'); } });
      if (model) { model.reset(); }
      if (introScreen) { introScreen.hidden = true; introScreen.classList.remove('is-leaving'); introScreen.setAttribute('data-phase', 'idle'); }
      if (arrival) { arrival.classList.remove('is-arriving'); }
      if (skipButton) {
        var focusWasInIntro = document.activeElement === skipButton || document.activeElement === enterButton;
        skipButton.hidden = true;
        if (focusWasInIntro) {
          var returnFocus = introReturnFocus || document.querySelector('.brand');
          focusWithoutScroll(returnFocus);
        }
      }
      if (enterButton) { enterButton.hidden = true; }
      updateModelPlayback();
    }

    function playIntro(autoFocus) {
      if (window.roomTourFailed) { return; }
      finishIntro();
      if (!introScreen) { return; }
      introReturnFocus = autoFocus ? document.querySelector('.brand') : document.activeElement;
      startupFromBeginning = true;
      resetStartupPosition(true);
      updateTour();
      var thisRun = introRun;
      introPlaying = true;
      introPhase = 'loading';
      introScreen.hidden = false;
      introScreen.setAttribute('data-phase', 'loading');
      if (introLoading) { introLoading.hidden = false; }
      if (enterButton) { enterButton.hidden = true; }
      setIntroProgress(0);
      if (skipButton) { skipButton.hidden = false; }
      document.body.classList.add('intro-running');
      document.documentElement.classList.add('room-opening');
      document.documentElement.classList.remove('room-booting');
      introBackgrounds.forEach(function (element) { if (element) { element.setAttribute('inert', ''); } });
      focusWithoutScroll(skipButton);
      updateModelPlayback();
      // This is preparation-sequence progress, not a claimed download percentage.
      var ticks = motionAllowed() ? 18 : 3;
      var tick = 0;
      function prepareNextStep() {
        if (window.roomTourFailed || !introPlaying || thisRun !== introRun) { return; }
        introTimer = null;
        tick += 1;
        setIntroProgress(100 * tick / ticks);
        if (tick < ticks) { introTimer = window.setTimeout(prepareNextStep, 50); return; }
        introPhase = 'welcome';
        introScreen.setAttribute('data-phase', 'welcome');
        if (introLoading) { introLoading.hidden = true; }
        if (enterButton) { enterButton.hidden = false; focusWithoutScroll(enterButton); }
      }
      introTimer = window.setTimeout(prepareNextStep, 50);
    }

    function enterRoom() {
      if (window.roomTourFailed || !introPlaying || introPhase !== 'welcome') { return; }
      introPhase = 'assembling';
      var thisRun = introRun;
      if (document.activeElement === enterButton) { focusWithoutScroll(skipButton); }
      if (enterButton) { enterButton.hidden = true; }
      if (!motionAllowed()) { finishIntro(); return; }
      introScreen.setAttribute('data-phase', 'assembling');
      introScreen.classList.add('is-leaving');
      document.body.classList.remove('intro-running');
      document.body.classList.add('intro-finishing');
      if (model) { updateModelPlayback(); model.replay(); }
      if (arrival) { arrival.classList.add('is-arriving'); }
      finishTimer = window.setTimeout(function () {
        if (thisRun !== introRun) { return; }
        finishTimer = null;
        finishIntro();
      }, 2100);
    }

    function updateIntroAvailability() {
      if (replayButton) { replayButton.disabled = !motionAllowed(); }
      if (!motionAllowed() && introPhase === 'assembling') { finishIntro(); }
      requestTourUpdate();
    }

    if (skipButton) { skipButton.addEventListener('click', finishIntro); }
    if (enterButton) { enterButton.addEventListener('click', enterRoom); }
    if (replayButton) {
      replayButton.hidden = false;
      replayButton.addEventListener('click', function () { playIntro(false); });
    }
    document.addEventListener('keydown', function (event) {
      if (window.roomTourFailed || !introPlaying) { return; }
      if (event.key === 'Escape') { finishIntro(); return; }
      if (event.key === 'Tab') {
        event.preventDefault();
        var nextFocus = introPhase === 'welcome' && document.activeElement === skipButton ? enterButton : skipButton;
        focusWithoutScroll(nextFocus);
      } else if (event.key === 'ArrowDown' || event.key === 'PageDown' ||
          (event.key === ' ' && event.target !== skipButton && event.target !== enterButton)) {
        event.preventDefault(); enterRoom();
      }
    });
    // Consume only the opening gesture. Once inside, scrolling is fully native.
    window.addEventListener('wheel', function (event) {
      if (window.roomTourFailed || !introPlaying || event.ctrlKey) { return; }
      event.preventDefault();
      if (event.deltaY > 0) { enterRoom(); }
    }, { passive: false });
    window.addEventListener('touchstart', function (event) {
      touchStartY = introPlaying && event.touches && event.touches.length === 1 ? event.touches[0].clientY : null;
    }, { passive: true });
    window.addEventListener('touchmove', function (event) {
      if (window.roomTourFailed || !introPlaying || touchStartY === null || !event.touches || event.touches.length !== 1) { return; }
      event.preventDefault();
      if (touchStartY - event.touches[0].clientY > 24) { enterRoom(); }
    }, { passive: false });
    function resetBeforeShowing() {
      if (startupFromBeginning && introPlaying) { resetStartupPosition(false); requestTourUpdate(); }
    }
    window.addEventListener('load', resetBeforeShowing);
    window.addEventListener('pageshow', resetBeforeShowing);
    // Chapter selection changes one camera composition directly. Native smooth
    // scrolling would visit every chapter between 07 and 01 before arriving.
    // Wheel reading still uses the existing continuous camera timeline.
    function goToChapter(index, writeHistory, bookmark) {
      if (layoutDirty) { prepareStoryLayout(); }
      if (introPlaying) { finishIntro(); }
      var chapter = chapters[index];
      var hash = '#' + chapter.getAttribute('id');
      var top = storyLayout ? storyLayout.rows[index].start : chapter.getBoundingClientRect().top + window.scrollY - 32;
      if (bookmark) {
        if (storyLayout) {
          var returnRow = storyLayout.rows[index];
          top += bookmark.phase === 'travel' ? returnRow.reading + returnRow.journey * bookmark.fraction : returnRow.reading * bookmark.fraction;
        } else { top += Math.max(0, chapter.getBoundingClientRect().height - viewportHeight) * bookmark.fraction; }
      }
      var root = document.documentElement;
      var thisJump = ++jumpRun;
      root.classList.add('room-chapter-jump');
      if (writeHistory && window.location.hash !== hash) {
        try { window.history.pushState(readingNavigation ? readingNavigation.chapterHistoryState() : window.history.state, '', hash); }
        catch (error) { /* Keep direct navigation; assigning hash here would start another native anchor scroll. */ }
      }
      snapPosition = true;
      storyPosition = top;
      storyTime = 0;
      // Explicit instant scrolling cancels any previous native smooth scroll.
      // The homepage also permanently disables CSS smooth anchor navigation;
      // browsers without the instant enum can safely use the auto fallback.
      scrollPageTo(Math.max(0, top), 0);
      updateTour();
      if (!storyLayout) { activateChapter(index); paintCamera(cameraForChapter(index), index === 0 ? 0 : 1); }
      window.requestAnimationFrame(function () {
        if (thisJump === jumpRun) { root.classList.remove('room-chapter-jump'); }
      });
    }
    function chapterLinkClick(event) {
      if (window.roomTourFailed || event.defaultPrevented || (event.button !== undefined && event.button !== 0) ||
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || this.getAttribute('target') || this.getAttribute('download') !== null) { return; }
      var href = this.getAttribute('href');
      var index = -1;
      chapters.forEach(function (chapter, number) { if ('#' + chapter.getAttribute('id') === href) { index = number; } });
      if (index < 0) { return; }
      event.preventDefault();
      goToChapter(index, true);
      // A footer link can leave with its paper; keep keyboard focus visible.
      if (document.activeElement === this && this.classList.contains('chapter-next') && nextControl) { focusWithoutScroll(nextControl); }
    }
    findAll(tour, 'a').forEach(function (link) { link.addEventListener('click', chapterLinkClick); });
    window.addEventListener('popstate', function () {
      if (window.roomTourFailed || introPlaying) { return; }
      if (readingNavigation && readingNavigation.restoreHistory()) { return; }
      chapters.forEach(function (chapter, index) {
        if ('#' + chapter.getAttribute('id') === window.location.hash) { goToChapter(index, false); }
      });
    });
    findAll(document, '.motion-toggle').forEach(function (button) {
      // The shared script changes body.motion-paused before this handler runs.
      button.addEventListener('click', updateIntroAvailability);
    });
    watchMotion(updateIntroAvailability);

    function captureReadingPosition() {
      if (introPlaying || window.roomTourFailed) { return null; }
      if (layoutDirty) { prepareStoryLayout(); }
      var paused = document.body.classList.contains('motion-paused');
      var profile = document.getElementById('about');
      if (profile && typeof profile.getBoundingClientRect === 'function') {
        var profileTop = profile.getBoundingClientRect().top + window.scrollY;
        if (window.scrollY >= profileTop - 1) {
          return { key: 'profile', phase: 'page', fraction: clamp((window.scrollY - profileTop) / Math.max(profile.scrollHeight || 0, viewportHeight), 0, 1), paused: paused };
        }
      }
      if (storyLayout) {
        var position = storyPosition === null ? window.scrollY : storyPosition;
        var index = 0;
        storyLayout.rows.forEach(function (row, number) { if (position >= row.start) { index = number; } });
        var row = storyLayout.rows[index];
        var travel = position > row.start + row.reading;
        return { key: chapters[index].getAttribute('data-chapter'), phase: travel ? 'travel' : 'read',
          fraction: clamp((position - row.start - (travel ? row.reading : 0)) / (travel ? row.journey : row.reading), 0, 1), paused: paused };
      }
      var chapterIndex = Math.max(0, lastChapter);
      var rectangle = chapters[chapterIndex].getBoundingClientRect();
      return { key: chapters[chapterIndex].getAttribute('data-chapter'), phase: 'read', fraction: clamp(-rectangle.top / Math.max(1, rectangle.height - viewportHeight), 0, 1), paused: paused };
    }
    function restoreReadingPosition(bookmark) {
      if (window.roomTourFailed) { return false; }
      var pause = document.querySelector('.motion-toggle');
      if (pause && !pause.disabled && document.body.classList.contains('motion-paused') !== bookmark.paused) { pause.click(); }
      if (bookmark.key === 'profile') {
        var profile = document.getElementById('about');
        if (!profile || typeof profile.getBoundingClientRect !== 'function') { return false; }
        if (layoutDirty) { prepareStoryLayout(); }
        if (introPlaying) { finishIntro(); }
        var top = profile.getBoundingClientRect().top + window.scrollY + bookmark.fraction * Math.max(profile.scrollHeight || 0, viewportHeight);
        snapPosition = true; storyPosition = top; storyTime = 0;
        scrollPageTo(top, 0); updateTour(); return true;
      }
      var index = -1;
      chapters.forEach(function (chapter, number) { if (chapter.getAttribute('data-chapter') === bookmark.key) { index = number; } });
      if (index < 0) { return false; }
      goToChapter(index, false, bookmark);
      return true;
    }
    if (readingNavigation) { readingNavigation.registerTour({ capture: captureReadingPosition, restore: restoreReadingPosition }); }

    document.addEventListener('visibilitychange', function () {
      updateModelPlayback(true);
    });
    if (model) { model.setView(0, 0); model.layout(roomBaseSize(), 1); readModelAnchors(true); }
    prepareStoryLayout();
    var resumePosition = !startupFromBeginning && readingNavigation ? readingNavigation.takeResume() : null;
    var resumed = resumePosition && restoreReadingPosition(resumePosition);
    if (resumed) { readingNavigation.finishResume(resumePosition); }
    if (startupFromBeginning) { resetStartupPosition(true); }
    // Fresh deep links still work; refresh explicitly starts from the loading bar.
    if (!startupFromBeginning && !resumed && storyLayout && window.location.hash) {
      chapters.forEach(function (chapter, index) {
        if ('#' + chapter.getAttribute('id') === window.location.hash) {
          scrollPageTo(storyLayout.rows[index].start, 0);
        }
      });
    }
    updateTour();
    // Hide other chapter copies only after the tour successfully starts.
    tour.classList.add('tour-enhanced');
    if (nextControl) { nextControl.hidden = false; }
    updateIntroAvailability();
    // A direct chapter link keeps its position and skips the decorative opening.
    if (startupFromBeginning) { playIntro(true); }
    if (window.roomStartup) { window.roomStartup.ready = true; }
    document.documentElement.classList.remove('room-returning');
    if (window.roomStartup && window.roomStartup.guardTimer) { window.clearTimeout(window.roomStartup.guardTimer); }
  }

  function startSafely() {
    try { startRoomTour(); }
    catch (error) {
      // A partial upload or unsupported enhancement must not lock the visitor
      // inside the welcome dialog. Restore the actual HTML, with its links.
      window.roomTourFailed = true;
      document.documentElement.classList.remove('room-booting', 'room-opening', 'room-returning');
      document.body.classList.remove('intro-running', 'intro-finishing');
      findAll(document, '[inert]').forEach(function (item) { item.removeAttribute('inert'); });
      var screen = document.getElementById('intro-screen');
      if (screen) { screen.hidden = true; }
      var tour = document.getElementById('room-tour');
      if (tour) {
        tour.classList.remove('tour-story', 'tour-mobile-story', 'tour-enhanced', 'tour-fixed');
        var failedView = tour.querySelector('.tour-view');
        var failedInterface = tour.querySelector('.tour-interface');
        if (failedView) { failedView.style.top = ''; }
        if (failedInterface) { failedInterface.style.top = ''; }
        tour.classList.add('tour-basic');
        var base = Math.min((document.documentElement.clientWidth || window.innerWidth) * 0.85, 640);
        tour.style.setProperty('--room-size', base.toFixed(3) + 'px');
        findAll(tour, '.tour-chapter').forEach(function (chapter) {
          var title = document.getElementById(chapter.getAttribute('aria-labelledby'));
          var copy = title && title.parentNode;
          if (copy && copy.classList.contains('tour-copy')) {
            if (copy.parentNode !== chapter) { chapter.appendChild(copy); }
            copy.classList.remove('tour-paper', 'tour-home-caption', 'is-visible');
            copy.style.transform = ''; copy.style.visibility = ''; copy.style.opacity = '';
          }
          chapter.style.height = '';
        });
        var controls = document.querySelector('.room-controls');
        var stage = tour.querySelector('.tour-interface');
        if (controls && stage && controls.parentNode !== stage) { stage.appendChild(controls); }
        var scene = document.getElementById('room-scene');
        if (scene) { scene.style.transform = ''; scene.style.width = '100%'; scene.style.height = '100%'; scene.style.left = '0%'; scene.style.top = '0%'; }
        if (window.roomModel) {
          window.roomModel.reset(); window.roomModel.layout(base, 1);
          var positions = window.roomModel.projectAnchors ? window.roomModel.projectAnchors() : {};
          findAll(tour, '.room-hotspot[data-chapter]').forEach(function (link) {
            var point = positions[link.getAttribute('data-chapter')];
            if (point) { link.style.transform = 'translate3d(' + ((point[0] - 0.5) * base).toFixed(3) + 'px, ' + ((point[1] - 0.5) * base).toFixed(3) + 'px, 0) translate(-50%, -50%)'; }
          });
        }
      }
      var replay = document.getElementById('replay-intro');
      if (replay) { replay.hidden = true; }
      if (window.roomStartup) {
        window.roomStartup.ready = true;
        window.clearTimeout(window.roomStartup.guardTimer);
      }
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startSafely);
  } else { startSafely(); }
}());
