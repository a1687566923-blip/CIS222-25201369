/* A small CSS 3D room. Every piece is built from ordinary HTML faces.
   No canvas, WebGL, external library or downloaded texture is required. */
(function () {
  'use strict';

  function buildRoom() {
    var scene = document.getElementById('room-scene');
    if (!scene) { return; }
    if (!window.CSS || typeof window.CSS.supports !== 'function' ||
        !(window.CSS.supports('transform-style', 'preserve-3d') || window.CSS.supports('-webkit-transform-style', 'preserve-3d')) ||
        !window.CSS.supports('width', 'var(--model-unit)')) { return; }
    var fallback = scene.querySelector('.room-image');
    var model;
    try {
      var anchors = {};
      var anchorPoints = {};
      var pieceNumber = 0;
      var buildTimer = null;
      var buildRun = 0;
      var lastWidth = 0;
      var lastZoom = 0;
      var viewYaw = 0;
      var viewTilt = 0;
      var compactModel = (window.innerWidth || 1024) <= 760;
      var renderDensity = compactModel ? 1.75 : 3;
      var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      var bedsideLight = { x: 42, y: -65, z: 92 };

      function element(tag, className, parent) {
        var item = document.createElement(tag);
        item.className = className;
        if (parent) { parent.appendChild(item); }
        return item;
      }
      function variables(item, values) {
        Object.keys(values).forEach(function (key) {
          item.style.setProperty('--' + key, String(values[key]));
        });
      }
      function tint(color, light, amount) {
        var first = parseInt(color.slice(1), 16), second = parseInt(light.slice(1), 16);
        var result = '#';
        [16, 8, 0].forEach(function (shift) {
          var channel = Math.round(((first >> shift) & 255) * (1 - amount) + ((second >> shift) & 255) * amount);
          result += ('0' + channel.toString(16)).slice(-2);
        });
        return result;
      }
      function colors(front, top, dark, daytime, nighttime) {
        var original = [front, top || front, dark || front];
        // Light the materials themselves. A filter on a CSS 3D ancestor would
        // flatten the room and turn the theme toggle into a flat image effect.
        return {
          day: daytime || original.map(function (color) { return tint(color, '#fff5df', 0.16); }),
          night: nighttime || original
        };
      }
      function lamplight(color, x, y, z) {
        var distance = Math.sqrt(Math.pow(x - bedsideLight.x, 2) + Math.pow(y - bedsideLight.y, 2) + Math.pow(z - bedsideLight.z, 2));
        var falloff = Math.max(0, 1 - distance / 235);
        return tint(color, '#ffedc1', 0.58 * falloff * falloff);
      }

      // A small vector movie on the monitor: greeting cube, room assembly,
      // then title. Its own timeline loops without rebuilding the real room.
      function screenMovie() {
        // Project the current room coordinates once into a small flat SVG.
        // The movie has no second 3D scene, iframe or per-frame drawing loop.
        function point(x, y, z) {
          return [(100 + (x + y) * 0.14142).toFixed(2), (73 + (y - x) * 0.07494 - z * 0.16961).toFixed(2)];
        }
        function surface(points, day, night) {
          return '<polygon class="movie-material" points="' + points.map(function (p) { return p.join(','); }).join(' ') +
            '" fill="' + night + '" style="--movie-day:' + day + ';--movie-night:' + night + '"/>';
        }
        function solid(x, y, z, w, d, h, palette) {
          var a = x - w / 2, b = x + w / 2, c = y - d / 2, e = y + d / 2;
          return surface([point(a, c, z), point(a, e, z), point(a, e, z + h), point(a, c, z + h)], palette.day[2], lamplight(palette.night[2], a, y, z + h / 2)) +
            surface([point(a, e, z), point(b, e, z), point(b, e, z + h), point(a, e, z + h)], palette.day[0], lamplight(palette.night[0], x, e, z + h / 2)) +
            surface([point(a, c, z + h), point(b, c, z + h), point(b, e, z + h), point(a, e, z + h)], palette.day[1], lamplight(palette.night[1], x, y, z + h));
        }
        function wallGraphic(x, y, z, w, h, side, content) {
          var start = point(x, y, z), end = side === 'left' ? point(x + w, y, z) : point(x, y + w, z);
          var down = point(x, y, z - h);
          return '<g transform="matrix(' + ((end[0] - start[0]) / w).toFixed(5) + ',' + ((end[1] - start[1]) / w).toFixed(5) + ',0,' + ((down[1] - start[1]) / h).toFixed(5) + ',' + start.join(',') + ')">' + content + '</g>';
        }
        function roundSurface(x, y, z, radius) {
          var points = [];
          for (var side = 0; side < 12; side += 1) { var angle = side * Math.PI / 6; points.push(point(x + radius * Math.cos(angle), y + radius * Math.sin(angle), z)); }
          return surface(points, wood.day[1], lamplight(wood.night[1], x, y, z));
        }
        var shell = solid(0, 0, -14, 400, 400, 14, wood) +
          solid(0, -199, 0, 405, 10, 230, colors('#2c333d', '#49515c', '#1a2028', ['#d8d5ca', '#eee6d4', '#aeaca4'])) +
          solid(199, 0, 0, 10, 400, 230, colors('#323c49', '#4d5765', '#202833', ['#cecec4', '#e5decd', '#a1a5a0'])) +
          surface([point(-20, -20, 1), point(96, -20, 1), point(96, 110, 1), point(-20, 110, 1)], '#555c6b', '#3e464e');
        var art = wallGraphic(-107, -192, 214, 125, 105, 'left', '<rect width="125" height="105" fill="#183148" stroke="#293440" stroke-width="7"/><circle cx="97" cy="19" r="7" fill="#e4ebfc"/><path d="M1 104V66H17V104M21 104V51H38V104M43 104V70H56V104M63 104V37H81V104M87 104V62H103V104M108 104V49H125V104" fill="#102034"/><path d="M7 73V97M28 60V98M70 45V98M95 70V98M117 57V98" stroke="#dfc797" stroke-width="3" stroke-dasharray="4 7"/>') +
          wallGraphic(193, -40, 188, 73, 60, 'right', '<rect width="73" height="60" fill="#274357" stroke="#887761" stroke-width="5"/><circle cx="51" cy="17" r="9" fill="#dcc491"/><path d="M0 50L24 23L46 42L73 32V60H0Z" fill="#486779"/>') +
          wallGraphic(193, 59, 192, 76, 66, 'right', '<rect width="76" height="66" fill="#344858" stroke="#887761" stroke-width="5"/><ellipse cx="38" cy="33" rx="26" ry="15" fill="none" stroke="#bca47a" stroke-width="3"/><circle cx="38" cy="33" r="9" fill="#8daab8"/>') +
          wallGraphic(193, 64, 112, 62, 42, 'right', '<rect width="62" height="42" fill="#294f59" stroke="#887761" stroke-width="5"/><path d="M31 6L49 33H13Z" fill="#c4d5d4"/>');
        var shelf = solid(127, -178, 0, 106, 4, 199, wood);
        [-50, 50].forEach(function (x) { shelf += solid(127 + x, -160, 0, 7, 40, 199, wood); });
        [0, 51, 103, 153, 194].forEach(function (z) { shelf += solid(127, -160, z, 106, 40, 5, wood); });
        [56, 108, 158].forEach(function (z, row) {
          ['#748ba2', '#b2ad95', '#67567b', '#c4ab7c'].forEach(function (color, book) { shelf += solid(90 + book * 21, -157, z, 14, 23, 29 + (row + book) % 3 * 4, colors(color, color, '#303641')); });
        });
        var bedMovie = solid(130, 64, 8, 104, 210, 28, wood) + solid(130, -38, 8, 108, 9, 72, dark) +
          solid(130, 64, 36, 100, 202, 16, blue) + solid(130, -2, 52, 80, 39, 11, white) +
          solid(130, 90, 52, 101, 144, 9, blue) + solid(130, 25, 61, 100, 15, 3, colors('#57718a', '#6d879e', '#3d566f')) + solid(130, 166, 30, 100, 3, 28, blue);
        var deskMovie = '';
        [-61, 61].forEach(function (x) { [-25, 25].forEach(function (y) { deskMovie += solid(-105 + x, -119 + y, 0, 5, 5, 84, dark); }); });
        deskMovie += solid(-105, -119, 84, 146, 68, 6, wood) + solid(-85, -124, 90, 39, 24, 3, dark) +
          solid(-85, -128, 93, 5, 6, 14, dark) + solid(-85, -128, 107, 87, 7, 51, dark) +
          wallGraphic(-128, -124, 154, 81, 44, 'left', '<rect width="81" height="44" fill="#0d1722"/><path d="M8 12H34M8 21H24M8 30H39" stroke="#9cbfcc" stroke-width="2"/>') +
          solid(-104, -103, 91, 51, 17, 3, dark) + solid(-65, -102, 91, 11, 18, 6, dark) +
          wallGraphic(-165, -130, 139, 30, 47, 'left', '<path d="M3 42V19C3 -4 27 -4 27 19V42" fill="none" stroke="#222a33" stroke-width="7"/>');
        var chairMovie = solid(-82, -26, 9, 5, 5, 34, colors('#89949e')) + solid(-82, -26, 42, 45, 45, 7, dark) +
          solid(-82, -26, 49, 41, 41, 3, white) + solid(-82, -3, 49, 45, 9, 63, white) + solid(-82, -4, 106, 27, 10, 11, dark);
        [-29, 29].forEach(function (x) { chairMovie += solid(-82 + x, -26, 65, 7, 34, 5, white); });
        var lampPoint = point(bedsideLight.x, bedsideLight.y, 92);
        var lampMovie = '<circle class="movie-lamp-glow" cx="' + lampPoint[0] + '" cy="' + lampPoint[1] + '" r="15" fill="url(#movie-lamplight)"/>';
        [30, 150, 270].forEach(function (angle) { var radians = angle * Math.PI / 180; lampMovie += solid(42 + 18 * Math.cos(radians), -65 + 18 * Math.sin(radians), 0, 4, 4, 58, wood); });
        lampMovie += roundSurface(42, -65, 62, 25) + solid(42, -65, 62, 15, 15, 3, dark) + solid(42, -65, 65, 3, 3, 21, colors('#93816a'));
        lampMovie += surface([point(33, -65, 102), point(51, -65, 102), point(58, -65, 83), point(26, -65, 83)], '#eeebe0', '#fff4d2');
        var tableMovie = '';
        [30, 150, 270].forEach(function (angle) { var radians = angle * Math.PI / 180; tableMovie += solid(-62 + 25 * Math.cos(radians), 54 + 25 * Math.sin(radians), 0, 5, 5, 27, dark); });
        tableMovie += roundSurface(-62, 54, 32, 40) + solid(-62, 50, 33, 29, 17, 5, dark) + solid(-78, 66, 33, 17, 25, 3.2, colors('#8295a5', '#9aabb8', '#516576'));
        var extras = solid(-168, -81, 2, 50, 30, 25, colors('#283f55', '#3c5870', '#172838')) + solid(-168, -81, 31, 23, 3, 3, dark) +
          surface([point(-197, -22, 1), point(-156, -22, 1), point(-156, 32, 1), point(-197, 32, 1)], '#ddd6bb', '#ddd6bb');
        return '<svg class="screen-movie" data-room-version="20261015-dark-nav1" viewBox="0 0 200 112" xmlns="http://www.w3.org/2000/svg">' +
          '<defs><radialGradient id="movie-lamplight"><stop stop-color="#ffedc1" stop-opacity=".7"/><stop offset="1" stop-color="#ffedc1" stop-opacity="0"/></radialGradient></defs><rect class="movie-backdrop" width="200" height="112" fill="#202735"/>' +
          '<g class="movie-cube"><path d="M34 44L47 37L60 44L47 52Z" fill="#b6d4e4"/><path d="M34 44V59L47 67V52Z" fill="#739eb8"/><path d="M47 52V67L60 59V44Z" fill="#486c87"/></g>' +
          '<text class="movie-hello" x="69" y="57" fill="#d8e4ec" font-family="Arial,sans-serif" font-size="7">Hi, I’m Kwok Ho.</text>' +
          '<g class="movie-room"><g class="movie-shell">' + shell + '</g><g class="movie-piece movie-art">' + art + '</g><g class="movie-piece movie-shelf">' + shelf + '</g><g class="movie-piece movie-bed">' + bedMovie + '</g><g class="movie-piece movie-desk">' + deskMovie + '</g><g class="movie-piece movie-lamp">' + lampMovie + '</g><g class="movie-piece movie-chair">' + chairMovie + '</g><g class="movie-piece movie-table">' + tableMovie + '</g><g class="movie-piece movie-extras">' + extras + '</g></g>' +
          '<text class="movie-title" x="100" y="110" fill="#b8d1e0" text-anchor="middle" font-family="Arial,sans-serif" font-size="5.5" letter-spacing="1">KWOK HO’S ROOM</text></svg>';
      }

      model = element('div', 'room-model');
      if (compactModel) { model.classList.add('model-compact'); }
      model.setAttribute('aria-hidden', 'true');
      variables(model, { 'model-unit': '1px', 'model-yaw': '0deg', 'model-tilt': '0deg' });
      var camera = element('div', 'model-camera', model);
      var tilt = element('div', 'model-tilt', camera);
      var world = element('div', 'model-world', tilt);

      // World coordinates: the floor is 400 by 400, with 230-high walls.
      // Each independent group rotates around its own furniture position.
      function group(name, x, y, isStatic, extraClass) {
        var item = element('div', 'model-group group group-' + name + (isStatic ? ' is-static' : '') + (extraClass ? ' ' + extraClass : ''), world);
        variables(item, { gx: x + 200, gy: y + 200, 'piece-delay': (pieceNumber * (compactModel ? 80 : 70)) + 'ms' });
        item.roomOrigin = { x: x, y: y };
        if (!isStatic) { pieceNumber += 1; }
        return item;
      }

      // A box has six real faces: front/back/left/right/top/bottom.
      function facesAway(side, rotation) {
        var normals = { front: [0, 1, 0], back: [0, -1, 0], left: [-1, 0, 0], right: [1, 0, 0], top: [0, 0, 1], bottom: [0, 0, -1] };
        var normal = normals[side], x = normal[0], y = normal[1], z = normal[2];
        var rx = ((rotation && rotation.x) || 0) * Math.PI / 180;
        var ry = ((rotation && rotation.y) || 0) * Math.PI / 180;
        var rz = (((rotation && rotation.z) || 0) - 45) * Math.PI / 180;
        var yAfterX = y * Math.cos(rx) - z * Math.sin(rx);
        var zAfterX = y * Math.sin(rx) + z * Math.cos(rx);
        var xAfterY = x * Math.cos(ry) + zAfterX * Math.sin(ry);
        var zAfterY = -x * Math.sin(ry) + zAfterX * Math.cos(ry);
        var yAfterZ = xAfterY * Math.sin(rz) + yAfterX * Math.cos(rz);
        var depth = yAfterZ * Math.sin(58 * Math.PI / 180) + zAfterY * Math.cos(58 * Math.PI / 180);
        // The margin also covers the full gentle mouse sway. Keep uncertain
        // edge faces; only remove surfaces that always face away at rest.
        return depth < -0.17;
      }
      function box(parent, x, y, z, width, depth, height, palette, extraClass, rotation) {
        var item = element('div', 'model-cuboid' + (extraClass ? ' ' + extraClass : ''), parent);
        var origin = parent.roomOrigin;
        // Bake the small lamp's soft falloff into the night material once.
        // Moving the camera or toggling the theme never recalculates lighting.
        var nightFront = lamplight(palette.night[0], origin.x + x, origin.y + y + depth / 2, z + height / 2);
        var nightTop = lamplight(palette.night[1], origin.x + x, origin.y + y, z + height);
        var nightDark = lamplight(palette.night[2], origin.x + x + width / 2, origin.y + y, z + height / 2);
        variables(item, {
          cx: x, cy: y, cz: z + height / 2, w: width, d: depth, h: height,
          rx: ((rotation && rotation.x) || 0) + 'deg',
          ry: ((rotation && rotation.y) || 0) + 'deg',
          rz: ((rotation && rotation.z) || 0) + 'deg',
          'day-front': palette.day[0], 'day-top': palette.day[1], 'day-dark': palette.day[2],
          'night-front': nightFront, 'night-top': nightTop, 'night-dark': nightDark
        });
        // Phone cameras never tip under the floor. Furniture can still rotate
        // fully around Z during its arrival, so keep all four upright faces.
        var faces = compactModel ? (parent.classList.contains('is-static') ? ['front', 'left', 'top'] : ['front', 'back', 'left', 'right', 'top']) : ['front', 'back', 'left', 'right', 'top', 'bottom'];
        if (compactModel && rotation && (rotation.x || rotation.y)) { faces.push('bottom'); }
        faces.forEach(function (side) {
          var face = element('span', 'model-face face-' + side, item);
          if (facesAway(side, rotation)) { face.classList.add('rest-occluded'); }
        });
        return item;
      }
      function panel(parent, x, y, z, width, height, className, rotateZ, rotateX) {
        var item = element('div', 'model-panel ' + className, parent);
        variables(item, { cx: x, cy: y, cz: z, pw: width, ph: height, rz: (rotateZ || 0) + 'deg', rx: (rotateX || 0) + 'deg' });
        return item;
      }
      function anchor(parent, key, x, y, z) {
        var item = element('span', 'model-anchor', parent);
        item.setAttribute('data-room-anchor', key);
        variables(item, { cx: x, cy: y, cz: z });
        anchors[key] = item;
        anchorPoints[key] = { x: parent.roomOrigin.x + x, y: parent.roomOrigin.y + y, z: z };
      }
      function shadow(x, y, width, depth) {
        panel(world, x + 200, y + 200, 0.7, width, depth, 'model-shadow');
      }
      function roundTop(parent, radius, z, height) {
        panel(parent, 0, 0, z + height, radius * 2, radius * 2, 'table-round-top');
        var sides = compactModel ? 12 : 16;
        var edge = 2 * radius * Math.sin(Math.PI / sides);
        for (var i = 0; i < sides; i += 1) {
          var angle = i * Math.PI * 2 / sides;
          var side = panel(parent, radius * Math.cos(angle), radius * Math.sin(angle), z + height / 2, edge + 0.7, height, 'table-round-edge', i * 360 / sides - 90, -90);
          side.style.background = i < 8 ? '#775b45' : '#503e32';
        }
      }

      var wood = colors('#5a483a', '#75604c', '#3d3028', ['#85684e', '#aa8963', '#604b3b']);
      var dark = colors('#222a33', '#35404c', '#131a21', ['#28313b', '#424c56', '#171e27']);
      var white = colors('#dce1e4', '#f3f5f6', '#919da7', ['#ece9df', '#fffdf4', '#b6bbc1']);
      var blue = colors('#22344b', '#344e6c', '#162334', ['#496278', '#7c93a5', '#344a62']);

      // The room shell stays still while the individual furniture arrives.
      panel(world, 226, 220, -15, 465, 452, 'model-ground-shadow');
      var floor = group('floor', 0, 0, true);
      box(floor, 0, 0, -14, 400, 400, 14, wood, 'model-floor');
      var wallLeft = group('wall-left', 0, -199, true, 'model-wall-left');
      box(wallLeft, 0, 0, 0, 405, 10, 230, colors('#2c333d', '#49515c', '#1a2028', ['#d8d5ca', '#eee6d4', '#aeaca4']));
      var wallRight = group('wall-right', 199, 0, true, 'model-wall-right');
      box(wallRight, 0, 0, 0, 10, 400, 230, colors('#323c49', '#4d5765', '#202833', ['#cecec4', '#e5decd', '#a1a5a0']));
      box(wallLeft, 0, 7, 0, 398, 3, 8, dark);
      box(wallRight, -7, 0, 0, 3, 398, 8, dark);
      panel(floor, 38, 45, 1, 115, 133, 'model-rug');
      panel(world, bedsideLight.x + 200, bedsideLight.y + 200, 0.6, 225, 245, 'model-lamp-pool');

      // A deep-blue bed with separate frame, pillow and folded blanket.
      var bed = group('bed', 130, 64);
      shadow(130, 64, 108, 214);
      box(bed, 0, 0, 8, 104, 210, 28, wood);
      box(bed, 0, -102, 8, 108, 9, 72, dark);
      box(bed, 0, 0, 36, 100, 202, 16, blue);
      box(bed, 0, -66, 52, 80, 39, 11, white);
      // A thick duvet, a folded edge, and fabric hanging over the bed end.
      box(bed, 0, 26, 52, 101, 144, 9, blue, 'model-duvet');
      box(bed, 0, -39, 61, 100, 15, 3, colors('#57718a', '#6d879e', '#3d566f'), 'duvet-fold');
      box(bed, 0, 102, 30, 100, 3, 28, blue, 'duvet-drape');
      [-43, 43].forEach(function (x) { [-85, 85].forEach(function (y) { box(bed, x, y, 0, 8, 8, 10, dark); }); });

      // Walnut desk, black peripherals, and a softly lit monitor.
      var desk = group('desk', -105, -119);
      shadow(-105, -119, 147, 69);
      box(desk, 0, 0, 84, 146, 68, 6, wood);
      [-61, 61].forEach(function (x) { [-25, 25].forEach(function (y) { box(desk, x, y, 0, 5, 5, 84, dark); }); });
      box(desk, 0, -27, 72, 130, 5, 8, dark);
      box(desk, 0, 33, 86, 138, 1.4, 2.2, dark, 'model-blue-led');
      var monitor = group('monitor', -85, -124);
      box(monitor, 0, 0, 90, 39, 24, 3, dark);
      box(monitor, 0, -4, 93, 5, 6, 14, dark);
      var screen = box(monitor, 0, -4, 107, 87, 7, 51, dark);
      screen.querySelector('.face-front').classList.add('model-screen');
      screen.querySelector('.face-front').innerHTML = screenMovie();
      anchor(monitor, 'projects', 30, -0.3, 118);
      var keyboard = group('keyboard', -104, -103);
      box(keyboard, 0, 0, 91, 51, 17, 3, dark, 'model-keyboard');
      var mouse = group('mouse', -65, -102);
      box(mouse, 0, 0, 91, 11, 18, 6, dark, 'model-mouse');
      box(mouse, 0, -3, 97, 1.3, 5, 0.8, colors('#8993a0'), 'mouse-wheel');
      var headphones = group('headphones', -150, -130);
      box(headphones, 0, 0, 90, 23, 19, 2, dark);
      box(headphones, 0, 0, 92, 3, 3, 41, colors('#74808e'));
      var bandCount = compactModel ? 5 : 7;
      for (var band = 0; band < bandCount; band += 1) {
        var bandAngle = -75 + band * 150 / (bandCount - 1);
        var radians = bandAngle * Math.PI / 180;
        box(headphones, 15 * Math.sin(radians), 0, 119 + 15 * Math.cos(radians), 5, 7, 9, dark, '', { y: bandAngle });
      }
      [-15, 15].forEach(function (x) { box(headphones, x, 0, 111, 8, 12, 17, dark); });

      // White-and-black gaming chair with a real base, arms and tall back.
      var chair = group('chair', -82, -26);
      shadow(-82, -26, 68, 65);
      box(chair, 0, 0, 9, 5, 5, 34, colors('#89949e'));
      [0, 72, 144, 216, 288].forEach(function (angle) {
        var radians = angle * Math.PI / 180;
        box(chair, 13 * Math.cos(radians), 13 * Math.sin(radians), 6, 30, 4, 4, dark, '', { z: angle });
        box(chair, 26 * Math.cos(radians), 26 * Math.sin(radians), 1, 7, 6, 7, dark);
      });
      box(chair, 0, 0, 42, 45, 45, 7, dark);
      box(chair, 0, 0, 49, 41, 41, 3, white);
      // The backrest is behind the sitter; the seat faces the desk (-Y).
      box(chair, 0, 23, 49, 45, 9, 63, white);
      box(chair, 0, 17.8, 54, 27, 2, 48, dark);
      box(chair, 0, 22, 106, 27, 10, 11, dark);
      [-29, 29].forEach(function (x) { box(chair, x, 0, 43, 4, 5, 22, dark); box(chair, x, 0, 65, 7, 34, 5, white); });

      // Bookcase: actual shelf levels and small volumes, rather than a texture.
      var bookcase = group('bookcase', 127, -160);
      box(bookcase, 0, -18, 0, 106, 4, 199, wood);
      [-50, 50].forEach(function (x) { box(bookcase, x, 0, 0, 7, 40, 199, wood); });
      [0, 51, 103, 153, 194].forEach(function (z) { box(bookcase, 0, 0, z, 106, 40, 5, wood); });
      var bookColors = ['#748ba2', '#b2ad95', '#67567b', '#2e536d', '#8a5d58', '#c4ab7c'];
      [56, 108, 158].forEach(function (z, shelf) {
        var volumes = compactModel ? 5 : 8;
        for (var book = 0; book < volumes; book += 1) {
          var color = bookColors[(book + shelf) % bookColors.length];
          box(bookcase, -38 + book * (compactModel ? 17 : 10), 3, z, (compactModel ? 12 : 7) + book % 3, 23, 25 + (book * 7 + shelf * 3) % 16, colors(color, color, '#303641'));
        }
      });
      anchor(bookcase, 'education', -22, 16, 171);

      // Native SVG Hong Kong night skyline in a framed window on the left wall.
      var windowGroup = group('window', -45, -192, false, 'wall-left-object');
      var windowPanel = panel(windowGroup, 0, 0, 162, 125, 105, 'model-window', 0, -90);
      windowPanel.innerHTML = '<svg viewBox="0 0 125 105" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="room-sky" x2="0" y2="1"><stop class="sky-top" stop-color="#b6cdd9"/><stop class="sky-bottom" offset="1" stop-color="#e6d7bb"/></linearGradient><pattern id="room-windows" width="8" height="10" patternUnits="userSpaceOnUse"><rect class="city-light" width="2" height="4" x="3" y="3" fill="#dbc895"/></pattern></defs><rect width="125" height="105" fill="url(#room-sky)"/><circle class="sky-orb" cx="97" cy="19" r="7" fill="#f2d49b"/><path class="city-hills" d="M0 71L13 62L22 67L39 49L53 58L69 43L84 60L103 46L125 61V105H0Z" fill="#718d99"/><path class="city-buildings" d="M1 104V66H17V104M21 104V51H38V104M43 104V70H56V104M63 104V37H81V104M87 104V62H103V104M108 104V49H125V104" fill="#526d83"/><path d="M2 101V68H16V101M23 101V53H36V101M45 101V73H54V101M65 101V40H79V101M89 101V65H101V101M110 101V52H123V101" fill="url(#room-windows)"/><path d="M72 37V27M65 41H79" stroke="#97c2d9" stroke-width="2"/></svg>';
      var picture = group('picture', 193, -4, false, 'wall-right-object');
      var picturePanel = panel(picture, 0, 0, 158, 73, 60, 'model-picture', 90, -90);
      picturePanel.classList.add('wall-art');
      picturePanel.innerHTML = '<svg viewBox="0 0 73 60" xmlns="http://www.w3.org/2000/svg"><rect width="73" height="60" fill="#274357"/><g class="art-float"><circle cx="51" cy="17" r="9" fill="#dcc491"/><circle cx="17" cy="12" r="1.3" fill="#c5dfe8"/><circle cx="35" cy="8" r="1" fill="#c5dfe8"/></g><path d="M0 44L24 23L38 36L48 26L73 47V60H0" fill="#1b3043"/><path d="M0 50L27 36L51 45L73 37V60H0" fill="#486779"/><path d="M0 55H73" stroke="#a3bcc7" stroke-width="2"/></svg>';
      anchor(picture, 'about', -1, 24, 136);
      var pinboard = group('pinboard', 193, 97, false, 'wall-right-object');
      var board = panel(pinboard, 0, 0, 159, 76, 66, 'model-picture wall-art art-brass', 90, -90);
      board.innerHTML = '<svg viewBox="0 0 76 66" xmlns="http://www.w3.org/2000/svg"><rect width="76" height="66" fill="#344858"/><g class="art-orbit"><ellipse cx="38" cy="33" rx="26" ry="15" fill="none" stroke="#bca47a" stroke-width="2"/><circle cx="61" cy="27" r="5" fill="#d7c5a0"/></g><circle cx="38" cy="33" r="9" fill="#8daab8"/><path d="M9 54H28M52 11H67" stroke="#d0dce1" stroke-width="1.3"/></svg>';
      var movingArt = group('moving-art', 193, 95, false, 'wall-right-object');
      var abstractPanel = panel(movingArt, 0, 0, 91, 62, 42, 'model-picture wall-art art-teal', 90, -90);
      abstractPanel.innerHTML = '<svg viewBox="0 0 62 42" xmlns="http://www.w3.org/2000/svg"><rect width="62" height="42" fill="#294f59"/><g class="art-drift"><path d="M31 6L49 33H13Z" fill="#c4d5d4"/><circle cx="10" cy="9" r="3" fill="#baa476"/><circle cx="52" cy="32" r="2" fill="#baa476"/></g></svg>';

      // One little bedside lamp. Its table and lamp arrive as one furniture
      // group; the shade is a tapered cloth cone, rather than a tall light box.
      var lamp = group('lamp', bedsideLight.x, bedsideLight.y, false, 'model-bedside-lamp');
      shadow(bedsideLight.x, bedsideLight.y, 60, 62);
      roundTop(lamp, 25, 58, 4);
      [30, 150, 270].forEach(function (angle) {
        var radians = angle * Math.PI / 180;
        box(lamp, 18 * Math.cos(radians), 18 * Math.sin(radians), 0, 4, 4, 58, wood, 'nightstand-leg');
      });
      box(lamp, 0, 0, 62, 15, 15, 3, dark, 'model-lamp-base');
      box(lamp, 0, 0, 65, 3, 3, 21, colors('#93816a'), 'model-lamp-stem');
      var shadeSides = compactModel ? 8 : 12;
      var bottomRadius = 16, topRadius = 9, shadeHeight = 19;
      var slope = (bottomRadius - topRadius) * Math.cos(Math.PI / shadeSides);
      var slant = Math.sqrt(shadeHeight * shadeHeight + slope * slope);
      var shadePitch = -90 + Math.atan(slope / shadeHeight) * 180 / Math.PI;
      var shadeRadius = (bottomRadius + topRadius) / 2 * Math.cos(Math.PI / shadeSides);
      var shadeWidth = 2 * bottomRadius * Math.sin(Math.PI / shadeSides);
      for (var shadeSide = 0; shadeSide < shadeSides; shadeSide += 1) {
        var shadeAngle = shadeSide * Math.PI * 2 / shadeSides;
        panel(lamp, shadeRadius * Math.cos(shadeAngle), shadeRadius * Math.sin(shadeAngle), 92.5, shadeWidth + 0.25, slant, 'model-lampshade', shadeSide * 360 / shadeSides - 90, shadePitch);
      }
      panel(lamp, 0, 0, 102, 18, 18, 'model-lamp-cap');
      panel(lamp, 0, 0, 82.8, 31, 31, 'model-warm-light');
      panel(lamp, 0, 0, 92, 62, 62, 'model-lamp-halo', 45, -58);
      var bag = group('gymbag', -168, -81);
      shadow(-168, -81, 59, 35);
      box(bag, 0, 0, 2, 50, 30, 25, colors('#283f55', '#3c5870', '#172838'), 'model-bag');
      box(bag, 0, 15.4, 5, 24, 1.5, 13, colors('#415e73'));
      box(bag, 0, 0, 31, 23, 3, 3, dark);
      [-10, 10].forEach(function (x) { box(bag, x, 0, 26, 3, 3, 7, dark); });
      anchor(bag, 'experience', -6, 16, 13);
      var table = group('roundtable', -62, 54);
      shadow(-62, 54, 84, 84);
      roundTop(table, 40, 27, 5);
      [30, 150, 270].forEach(function (angle) { var radians = angle * Math.PI / 180; box(table, 25 * Math.cos(radians), 25 * Math.sin(radians), 0, 5, 5, 27, dark); });
      var controller = group('controller', -62, 50);
      box(controller, 0, 0, 33, 29, 12, 5, dark);
      box(controller, -12, 4, 33, 9, 16, 5, dark, '', { z: -20 });
      box(controller, 12, 4, 33, 9, 16, 5, dark, '', { z: 20 });
      box(controller, -7, 0, 38, 7, 2, 1, colors('#a8b0b8'));
      box(controller, -7, 0, 38, 2, 7, 1, colors('#a8b0b8'));
      ['#ae7772', '#6d9a83', '#7195b1', '#c7b47f'].forEach(function (color, index) {
        var button = panel(controller, 8 + (index % 2) * 4, -2 + Math.floor(index / 2) * 4, 38.8, 2.4, 2.4, 'controller-button');
        button.style.background = color;
      });
      anchor(controller, 'skills', -5, 0, 39);
      var notebook = group('notebook', -78, 66);
      box(notebook, 0, 0, 33, 17, 25, 3.2, colors('#8295a5', '#9aabb8', '#516576'), 'model-notebook', { z: -13 });
      var map = group('map', -177, 5);
      var mapPanel = panel(map, 0, 0, 1.3, 41, 54, 'model-map', -9);
      mapPanel.innerHTML = '<svg viewBox="0 0 41 54" xmlns="http://www.w3.org/2000/svg"><rect width="41" height="54" fill="#ddd6bb"/><path d="M0 15L16 12L22 27L41 23M8 0L14 21L5 54M30 0L26 17L36 54M0 40L21 34L41 42" stroke="#a3af9b" stroke-width="4" fill="none"/><path d="M18 4V49M4 26H36" stroke="#b7ab8b" stroke-width="1.5"/><circle cx="24" cy="31" r="3" fill="#7b4d48"/></svg>';
      anchor(map, 'map', 10, 12, 1.6);

      function layout(baseWidth, zoom) {
        // Geometry is prepared sharply at the largest tour magnification.
        // Scrolling then updates one transform, not hundreds of face dimensions.
        var width = Number(baseWidth) || scene.clientWidth || scene.getBoundingClientRect().width || 640;
        zoom = Number(zoom) || 1;
        var resized = Math.abs(width - lastWidth) >= 0.01;
        // Retina and Windows display scaling multiply prepared surface pixels.
        // Bound the largest face texture, rather than allocating 3x geometry
        // at every pixel ratio. Plain vector surfaces retain the same shape.
        var ratio = Math.max(1, Number(window.devicePixelRatio) || 1);
        var density = Math.max(0.75, Math.min(compactModel ? 1.75 : 3, (compactModel ? 1408 : 2048) / (width * 0.64 * ratio)));
        var densityChanged = Math.abs(density - renderDensity) >= 0.0001;
        renderDensity = density;
        if (resized || densityChanged) {
          lastWidth = width;
          model.style.setProperty('--model-unit', (width * renderDensity / 640).toFixed(5) + 'px');
        }
        if (resized || densityChanged || Math.abs(zoom - lastZoom) >= 0.0001) {
          lastZoom = zoom;
          // The camera is at 61% of the square. Keep its offset from the
          // square centre proportional to zoom, without resizing its parent.
          camera.style.transform = 'translateY(' + (width * 0.11 * (zoom - 1)).toFixed(3) + 'px) scale(' + (zoom / renderDensity).toFixed(6) + ')';
        }
      }
      function setView(yaw, inclination) {
        yaw = Math.max(-6, Math.min(6, Number(yaw) || 0));
        inclination = Math.max(-2, Math.min(2, Number(inclination) || 0));
        viewYaw = yaw; viewTilt = inclination;
        // Direct transforms avoid changing inherited styles on every face.
        var turn = 'rotateZ(' + (-45 + yaw).toFixed(3) + 'deg)';
        var pitch = 'rotateX(' + (58 + inclination).toFixed(3) + 'deg)';
        if (world.style.transform !== turn) { world.style.transform = turn; }
        if (tilt.style.transform !== pitch) { tilt.style.transform = pitch; }
      }
      function projectAnchors() {
        var angle = (-45 + viewYaw) * Math.PI / 180;
        var pitch = (58 + viewTilt) * Math.PI / 180;
        var points = {};
        Object.keys(anchorPoints).forEach(function (key) {
          var point = anchorPoints[key];
          var x = point.x * Math.cos(angle) - point.y * Math.sin(angle);
          var y = point.x * Math.sin(angle) + point.y * Math.cos(angle);
          points[key] = [0.5 + x / 640, 0.61 + (y * Math.cos(pitch) - point.z * Math.sin(pitch)) / 640];
        });
        return points;
      }
      function setChapter(key) {
        var visible = document.visibilityState !== 'hidden';
        model.classList.toggle('screen-active', visible && (key === 'home' || key === 'projects'));
        model.classList.toggle('art-active', visible && (key === 'home' || key === 'about'));
      }
      function reset() {
        buildRun += 1;
        if (buildTimer !== null) { window.clearTimeout(buildTimer); buildTimer = null; }
        model.classList.remove('is-building');
        setView(0, 0);
      }
      function replay() {
        reset();
        if (reduceMotion.matches || document.body.classList.contains('motion-paused')) { return; }
        void model.offsetWidth; // Restart the one-time furniture animation.
        model.classList.add('is-building');
        var thisRun = buildRun;
        buildTimer = window.setTimeout(function () {
          if (thisRun !== buildRun) { return; }
          model.classList.remove('is-building'); buildTimer = null;
        }, 2100);
      }

      scene.appendChild(model);
      scene.classList.add('has-room-model');
      layout();
      setChapter('home');
      window.roomModel = { setView: setView, replay: replay, reset: reset, layout: layout, anchors: function () { return anchors; }, projectAnchors: projectAnchors, setChapter: setChapter };
      if (fallback) { fallback.hidden = true; }
      // room-tour.js supplies the fixed base width on window resize.
      function onMotionChange() { if (reduceMotion.matches) { reset(); } }
      if (reduceMotion.addEventListener) { reduceMotion.addEventListener('change', onMotionChange); }
      else if (reduceMotion.addListener) { reduceMotion.addListener(onMotionChange); }
    } catch (error) {
      // A failed enhancement never removes the original room image or page links.
      if (model && model.parentNode) { model.parentNode.removeChild(model); }
      scene.classList.remove('has-room-model');
      window.roomModel = null;
      if (fallback) { fallback.hidden = false; }
      delete window.roomModel;
    }
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', buildRoom); }
  else { buildRoom(); }
}());
