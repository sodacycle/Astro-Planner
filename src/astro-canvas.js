/* astro-canvas.js — Sky arc canvas renderer for Astro Planner
   Handles: static background (OffscreenCanvas), arc drawing,
   rAF-throttled hover overlay, and hit-testing.
   All drawing stays in the renderer process — never in main. */

(function() {
    'use strict';

    /* ── Seeded PRNG so stars don't flicker on re-renders ── */
    function seededRand(seed) {
        var s = seed;
        return function() {
            s = (s * 16807 + 0) % 2147483647;
            return (s - 1) / 2147483646;
        };
    }

    /* ── Cached offscreen star layer ── */
    var _starCache = null; /* { bitmap, W, H } */

    function buildStarLayer(W, H) {
        if (_starCache && _starCache.W === W && _starCache.H === H) {
            return _starCache.bitmap;
        }
        var offscreen = new OffscreenCanvas(W, H);
        var ctx = offscreen.getContext('2d');
        var rand = seededRand(42);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (var i = 0; i < 200; i++) {
            var x = rand() * W;
            var y = rand() * (H * 0.7);
            var r = rand() * 1.5 + 0.3;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        var bitmap = offscreen.transferToImageBitmap();
        _starCache = { bitmap: bitmap, W: W, H: H };
        return bitmap;
    }

    /* ── Hover state ── */
    var _h = {
        pts: [],
        rect: null,
        cursor: '',
        pending: false,
        mx: 0,
        my: 0
    };

    /* ── Render data shared between draw passes ── */
    var arcRenderData = null;

    /* ── Build quadratic-curve sample cache for hit testing ── */
    function buildArcHoverCache(riseX, riseY, transitX, transitY, setX, setY) {
        var pts = [];
        for (var i = 0; i <= 100; i++) {
            var t = i / 100;
            var inv = 1 - t;
            pts.push({
                x: inv * inv * riseX + 2 * inv * t * transitX + t * t * setX,
                y: inv * inv * riseY + 2 * inv * t * transitY + t * t * setY,
                t: t
            });
        }
        _h.pts = pts;
        var c = document.getElementById('sky-arc-canvas');
        _h.rect = c ? c.getBoundingClientRect() : null;
    }

    /* ── Hit test: find nearest point on arc ── */
    function hitTestArc(mx, my) {
        var best = Infinity, idx = -1, pts = _h.pts;
        for (var i = 0; i < pts.length; i++) {
            var dx = pts[i].x - mx;
            var dy = pts[i].y - my;
            var d = dx * dx + dy * dy;
            if (d < best) { best = d; idx = i; }
        }
        if (idx < 0) return { dist: Infinity, idx: -1 };
        return { dist: Math.sqrt(best), idx: idx, point: pts[idx] };
    }

    /* ── Draw hover overlay (called inside rAF) ── */
    function drawArcHover(mx, my) {
        var canvas = document.getElementById('sky-arc-canvas');
        var overlay = document.getElementById('sky-arc-overlay');
        if (!canvas || !overlay || !arcRenderData || _h.pts.length === 0) return;

        var validPoints = arcRenderData.validPoints;
        var W = canvas.width;
        var H = canvas.height;
        var ctx = overlay.getContext('2d');
        ctx.clearRect(0, 0, W, H);

        var hit = hitTestArc(mx, my);
        var isHover = hit.dist < 15 && hit.idx >= 0;

        if (isHover && hit.point) {
            var vi = Math.round(hit.point.t * (validPoints.length - 1));
            var pt = validPoints[vi];
            var hx = hit.point.x;
            var hy = hit.point.y;

            /* Dot */
            ctx.fillStyle = '#ffff00';
            ctx.beginPath();
            ctx.arc(hx, hy, 5, 0, Math.PI * 2);
            ctx.fill();

            /* Tooltip */
            var txt = 'Alt: ' + pt.altDeg.toFixed(1) + '\u00B0  |  ' +
                      pt.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            ctx.font = '11px system-ui';
            var tw = ctx.measureText(txt).width;
            var tx = Math.min(hx + 10, W - tw - 12);
            var ty = hy - 25;
            if (ty < 14) ty = hy + 22;

            ctx.fillStyle = 'rgba(0,0,0,0.82)';
            ctx.beginPath();
            ctx.roundRect(tx - 5, ty - 13, tw + 10, 20, 4);
            ctx.fill();

            ctx.fillStyle = '#ffff00';
            ctx.textAlign = 'left';
            ctx.fillText(txt, tx, ty);
        }

        var cur = isHover ? 'pointer' : 'default';
        if (cur !== _h.cursor) {
            canvas.style.cursor = cur;
            _h.cursor = cur;
        }
    }

    /* ── rAF-throttled mousemove ── */
    document.addEventListener('mousemove', function(e) {
        if (!_h.rect) {
            var c = document.getElementById('sky-arc-canvas');
            _h.rect = c ? c.getBoundingClientRect() : null;
        }
        if (!_h.rect || _h.pts.length === 0) return;

        _h.mx = e.clientX - _h.rect.left;
        _h.my = e.clientY - _h.rect.top;

        if (!_h.pending) {
            _h.pending = true;
            requestAnimationFrame(function() {
                drawArcHover(_h.mx, _h.my);
                _h.pending = false;
            });
        }
    }, { passive: true });

    window.addEventListener('resize', function() { _h.rect = null; });
    window.addEventListener('scroll', function() { _h.rect = null; }, true);

    /* ── Draw static background onto main canvas ── */
    function drawStaticBackground(canvasId, arcPoints, objectName) {
        var canvas = document.getElementById(canvasId);
        if (!canvas) return null;
        var ctx = canvas.getContext('2d');

        /* Size canvas to CSS display size to fix coordinate mismatch */
        var rect = canvas.getBoundingClientRect();
        canvas.width  = rect.width  || 800;
        canvas.height = rect.height || 300;

        var W = canvas.width;
        var H = canvas.height;

        /* Sky gradient */
        var skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.75);
        skyGrad.addColorStop(0,   '#000611');
        skyGrad.addColorStop(0.5, '#001628');
        skyGrad.addColorStop(1,   '#0a0a0a');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, W, H);

        /* Stars via OffscreenCanvas bitmap (GPU blit, no random flicker) */
        var stars = buildStarLayer(W, Math.round(H * 0.75));
        ctx.drawImage(stars, 0, 0);

        /* Horizon fill */
        var horizonY = H * 0.75;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, horizonY, W, H - horizonY);

        /* Filter arc points above horizon */
        var validPoints = arcPoints.filter(function(p) { return p.altDeg > -2; });
        if (validPoints.length === 0) return null;

        /* Look up catalog object for azimuth calculations */
        var catalogObj = window.fullCatalog
            ? window.fullCatalog.find(function(o) { return o.name === objectName; })
            : null;
        var decDeg = catalogObj ? window.parseDec(catalogObj.dec) : null;

        /* Rise / set / transit key points */
        var transitPoint = validPoints.reduce(function(mx, p) { return p.altDeg > mx.altDeg ? p : mx; }, validPoints[0]);

        /* Compass directions for rise / set — use exact HA calculation */
        var riseDir = 'E', setDir = 'W';
        if (decDeg !== null && window.currentLat !== null) {
            var haRise = window.calculateRiseSetHA(decDeg, window.currentLat);
            if (haRise !== null) {
                /* Rise: HA negative, Set: HA positive */
                var riseAz = window.calculateAzimuth(-haRise, decDeg, window.currentLat);
                var setAz  = window.calculateAzimuth(haRise,  decDeg, window.currentLat);
                riseDir = window.azimuthToCompass(riseAz);
                setDir  = window.azimuthToCompass(setAz);
            }
        }

        /* Canvas coordinates */
        var leftX    = W * 0.15;
        var rightX   = W * 0.85;
        var riseX    = leftX;
        var riseY    = horizonY;
        var setX     = rightX;
        var setY     = horizonY;
        var transitX = (leftX + rightX) / 2;
        var transitY = horizonY - (transitPoint.altDeg / 90) * (horizonY - 40);

        /* Build hover cache */
        buildArcHoverCache(riseX, riseY, transitX, transitY, setX, setY);

        /* Cardinal direction labels */
        ctx.fillStyle  = '#ffffff';
        ctx.font       = '14px system-ui';
        ctx.textAlign  = 'center';
        ctx.fillText(riseDir,  leftX,  horizonY + 22);
        ctx.fillText('N',      W * 0.5, horizonY + 22);
        ctx.fillText(setDir,   rightX, horizonY + 22);

        /* Dashed arc */
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(riseX, riseY);
        ctx.quadraticCurveTo(transitX, transitY, setX, setY);
        ctx.stroke();
        ctx.setLineDash([]);

        /* Rise and Set glows */
        [
            { x: riseX, y: riseY, label: 'Rise', sub: riseDir },
            { x: setX,  y: setY,  label: 'Set',  sub: setDir  }
        ].forEach(function(p) {
            var grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 18);
            grad.addColorStop(0, '#4fd1ff');
            grad.addColorStop(1, 'rgba(79,209,255,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#4fd1ff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle  = '#ffffff';
            ctx.font       = '13px system-ui';
            ctx.textAlign  = 'center';
            ctx.fillText(p.label, p.x, p.y - 20);
        });

        return {
            horizonY:    horizonY,
            leftX:       leftX,
            rightX:      rightX,
            riseX:       riseX,
            riseY:       riseY,
            setX:        setX,
            setY:        setY,
            transitX:    transitX,
            transitY:    transitY,
            catalogObj:  catalogObj,
            validPoints: validPoints,
            riseDir:     riseDir,
            setDir:      setDir
        };
    }

    /* ── Public entry point called by showObjectDetail ── */
    function drawSkyArc(canvasId, arcPoints, currentAlt, objectName) {
        arcRenderData = drawStaticBackground(canvasId, arcPoints, objectName);
        if (arcRenderData) {
            arcRenderData.currentAlt  = currentAlt;
            arcRenderData.objectName  = objectName;
        }

        /* Size overlay to match main canvas */
        var canvas  = document.getElementById(canvasId);
        var overlay = document.getElementById('sky-arc-overlay');
        if (canvas && overlay) {
            overlay.width  = canvas.width;
            overlay.height = canvas.height;
            overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
        }

        /* Invalidate hover rect so it recalculates on next move */
        _h.rect = null;
    }

    /* ── Expose to global scope ── */
    window.drawSkyArc = drawSkyArc;

})();
