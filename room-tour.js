/* Room tour: normal page scrolling and ordinary anchor links.
   CSS handles the opening animation; JavaScript guides the room camera. */
(function () {
  'use strict';

  function startRoomTour() {
    var tour = document.getElementById('room-tour');
    var room = document.getElementById('room-scene');
    if (!tour || !room) { return; }

    var chapters = Array.prototype.slice.call(tour.querySelectorAll('.tour-chapter[data-chapter]'));
    var stops = document.querySelectorAll('.tour-stop[data-chapter]');
    var hotspots = document.querySelectorAll('.room-hotspot[data-chapter]');
    var currentNumber = document.getElementById('tour-current');
    var currentName = document.getElementById('tour-name');
    var progress = document.getElementById('tour-progress');
    var readingStage = tour.querySelector('.tour-interface');
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
    var motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    var frameQueued = false;
    var copies = chapters.map(function (chapter) { return chapter.querySelector('.tour-copy'); });
    var storyLayout = null;
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
    var basicLayout = !window.CSS || !window.CSS.supports ||
      !(window.CSS.supports('position', 'sticky') || window.CSS.supports('position', '-webkit-sticky')) ||
      !window.CSS.supports('overflow', 'clip') || !window.CSS.supports('width', 'var(--room-size)');

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
        window.scrollTo({ top: top, left: left, behavior: 'instant' });
      }
    }

    // Desktop: focus point in the image, zoom, then target point on the screen.
    var views = [
      [0.5, 0.5, 1, 0.5, 0.49],
      [0.71, 0.28, 2.55, 0.75, 0.5],
      [0.47, 0.29, 2.75, 0.25, 0.5],
      [0.49, 0.65, 2.65, 0.75, 0.5],
      [0.27, 0.34, 2.9, 0.25, 0.5],
      [0.225, 0.65, 2.65, 0.75, 0.5],
      [0.5, 0.5, 1, 0.25, 0.5]
    ];
    // A portrait phone keeps the room above the moving reading paper.
    // These zooms are deliberately smaller than the desktop close-ups.
    var phoneZooms = [1, 1.55, 1.6, 1.8, 1.85, 1.7, 1];

    function motionAllowed() {
      return !motionPreference.matches && !document.body.classList.contains('motion-paused');
    }

    function clamp(value, minimum, maximum) {
      return Math.max(minimum, Math.min(maximum, value));
    }

    function roomBaseSize() {
      var width = viewportWidth, height = viewportHeight;
      if (basicLayout) { return Math.min(width * 0.85, 640); }
      if (height <= 520) { return Math.min(width * 0.76, 340); }
      if (layoutWidth <= 760) { return Math.min(width * 1.08, height * 0.60, 600); }
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
      if (layoutWidth > 760 && height > 520) {
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
      if (height <= 520 || index === 0) { return [0, 0, 1]; }
      var focus = modelFocus[chapters[index].getAttribute('data-chapter')] || views[index];
      var size = roomBaseSize();
      var phoneZoom = model ? phoneZooms[index] : Math.min(phoneZooms[index], 1254 / size);
      // Match the same resting square used by the mobile CSS, then bring the
      // selected furniture into the upper half without covering the text.
      return [-(focus[0] - 0.5) * size * phoneZoom,
        height * (0.245 - 0.5) - (focus[1] - 0.5) * size * phoneZoom, phoneZoom];
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
      if (model && model.setChapter) { model.setChapter(activeKey); }
      }
    }

    function smoothStep(value) {
      value = clamp(value, 0, 1);
      return value * value * (3 - 2 * value);
    }

    function setStyle(element, property, value) {
      if (element.style[property] !== value) { element.style[property] = value; }
    }

    function prepareStoryLayout() {
      layoutDirty = false;
      var story = viewportHeight > 520 && !basicLayout;
      tour.classList.toggle('tour-basic', basicLayout);
      mobileStory = story && layoutWidth <= 760;
      tour.classList.toggle('tour-story', story);
      tour.classList.toggle('tour-mobile-story', mobileStory);
      tour.style.setProperty('--tour-height', viewportHeight + 'px');
      tour.style.setProperty('--room-size', roomBaseSize().toFixed(3) + 'px');
      tour.style.setProperty('--paper-min-height', (viewportHeight * 1.25).toFixed(3) + 'px');
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
          var parent = story ? (mobileStory ? mobileReadingStage : readingStage) : chapter;
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
        tour.setAttribute('data-transitioning', 'false');
        return;
      }
      var height = viewportHeight;
      var ratio = window.devicePixelRatio || 1;
      var readingTop = mobileStory ? Math.round(height * 0.46 * ratio) / ratio : 0;
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
      if (snapPosition || storyPosition === null || !motionAllowed() ||
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
      var travelled = clamp((position - rows[0].start) / (rows[rows.length - 1].start - rows[0].start), 0, 1);
      if (progress) { progress.style.transform = 'scaleX(' + travelled.toFixed(4) + ')'; }
      if (!motionAllowed()) {
        // Keep ordinary reading motion, with a direct chapter change instead
        // of a partially entered paper or a camera stuck in the overview.
        var selected = journey >= 0.5 ? after : before;
        copies.forEach(function (copy, index) {
          if (index !== selected) { setStyle(copy, 'visibility', 'hidden'); copy.classList.remove('is-visible'); }
        });
        var staticY = selected === 0 || selected !== before ? 0 : -(row.height - frameHeight + frameHeight * 0.22) * reading;
        paintPaper(selected, staticY, true, raw, viewportTop, reading);
        copies[0].style.opacity = '1';
        activateChapter(selected);
        tour.setAttribute('data-transitioning', 'false');
        if (wipe) { wipe.style.transform = 'translate(-50%, -50%) scale(' + (selected === 0 ? '0' : '1') + ')'; }
        paintCamera(cameraForChapter(selected), selected === 0 ? 0 : 1);
        storyTime = 0;
        return;
      }
      var showBefore = before === 0 ? journey < 0.46 : outgoing < 1;
      var showAfter = after !== before && journey > 0.54 && incoming > 0;
      copies.forEach(function (copy, index) {
        if ((index === before && showBefore) || (index === after && showAfter)) { return; }
        setStyle(copy, 'visibility', 'hidden');
        copy.classList.remove('is-visible');
      });
      if (before === 0) {
        paintPaper(0, -height * 0.18 * blend, showBefore, raw, viewportTop, reading);
        copies[0].style.opacity = (1 - outgoing).toFixed(4);
      } else {
        var endOffset = -(row.height - frameHeight + frameHeight * 0.22);
        var paperY = endOffset * reading + (-row.height - frameHeight * 0.08 - endOffset) * outgoing;
        paintPaper(before, paperY, showBefore, raw, viewportTop, reading);
      }
      if (showAfter) {
        paintPaper(after, frameHeight * (1 - incoming), incoming > 0, raw, viewportTop, 0);
      }
      activateChapter(incoming > 0 ? after : before);
      tour.setAttribute('data-transitioning', journey > 0 && journey < 1 ? 'true' : 'false');
      var opening = before === 0 ? blend : 1;
      if (wipe) {
        var circle = motionAllowed() ? opening : (activeKey === 'home' ? 0 : 1);
        wipe.style.transform = 'translate(-50%, -50%) scale(' + circle.toFixed(4) + ')';
      }
      var first = cameraForChapter(before);
      var second = cameraForChapter(after);
      var camera = first.map(function (value, index) { return value + (second[index] - value) * blend; });
      paintCamera(camera, opening);
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
      if (progress) { progress.style.transform = 'scaleX(' + travelled.toFixed(4) + ')'; }
      var openingDistance = centers.length > 1 ? centers[1] - centers[0] : 1;
      var openingProgress = clamp((viewportCenter - centers[0]) / openingDistance, 0, 1);
      if (wipe) {
        var circle = motionAllowed() ? openingProgress : (nearest === 0 ? 0 : 1);
        wipe.style.transform = 'translate(-50%, -50%) scale(' + circle.toFixed(4) + ')';
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
      if (touchViewport && !widthChanged && !orientationChanged && !ratioChanged) { return; }
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
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
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
      if (model && model.setChapter) { model.setChapter(activeKey); }
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
      if (model && model.setChapter) { model.setChapter('loading'); }
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
      if (model) { model.setChapter('home'); model.replay(); }
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
    stops.forEach(function (stop) { stop.addEventListener('click', finishIntro); });
    hotspots.forEach(function (hotspot) { hotspot.addEventListener('click', finishIntro); });
    document.querySelectorAll('.motion-toggle').forEach(function (button) {
      // The shared script changes body.motion-paused before this handler runs.
      button.addEventListener('click', updateIntroAvailability);
    });
    watchMotion(updateIntroAvailability);

    document.addEventListener('visibilitychange', function () {
      if (model && model.setChapter) { model.setChapter(activeKey); }
    });
    if (model) { model.setView(0, 0); model.layout(roomBaseSize(), 1); readModelAnchors(true); }
    prepareStoryLayout();
    if (startupFromBeginning) { resetStartupPosition(true); }
    // Fresh deep links still work; refresh explicitly starts from the loading bar.
    if (!startupFromBeginning && storyLayout && window.location.hash) {
      chapters.forEach(function (chapter) {
        if ('#' + chapter.getAttribute('id') === window.location.hash && chapter.scrollIntoView) {
          chapter.scrollIntoView({ block: 'start', behavior: 'instant' });
        }
      });
    }
    updateTour();
    // Hide other chapter copies only after the tour successfully starts.
    tour.classList.add('tour-enhanced');
    updateIntroAvailability();
    // A direct chapter link keeps its position and skips the decorative opening.
    if (startupFromBeginning) { playIntro(true); }
    if (window.roomStartup) { window.roomStartup.ready = true; }
    if (window.roomStartup && window.roomStartup.guardTimer) { window.clearTimeout(window.roomStartup.guardTimer); }
  }

  function startSafely() {
    try { startRoomTour(); }
    catch (error) {
      // A partial upload or unsupported enhancement must not lock the visitor
      // inside the welcome dialog. Restore the actual HTML, with its links.
      window.roomTourFailed = true;
      document.documentElement.classList.remove('room-booting', 'room-opening');
      document.body.classList.remove('intro-running', 'intro-finishing');
      document.querySelectorAll('[inert]').forEach(function (item) { item.removeAttribute('inert'); });
      var screen = document.getElementById('intro-screen');
      if (screen) { screen.hidden = true; }
      var tour = document.getElementById('room-tour');
      if (tour) {
        tour.classList.remove('tour-story', 'tour-mobile-story', 'tour-enhanced');
        tour.classList.add('tour-basic');
        var base = Math.min((document.documentElement.clientWidth || window.innerWidth) * 0.85, 640);
        tour.style.setProperty('--room-size', base.toFixed(3) + 'px');
        tour.querySelectorAll('.tour-chapter').forEach(function (chapter) {
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
          tour.querySelectorAll('.room-hotspot[data-chapter]').forEach(function (link) {
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
