// ============================================================
// js/join.js — SRM NCR WebRing join page
// Handles the join/update form: city autocomplete, badge upload,
// custom validation, and the multipart POST to the backend worker
// that opens a pull request for the new member.
// ============================================================
(function () {
  'use strict';

  const API = 'https://backend.srmncrwebring.workers.dev';

  const form = document.getElementById('joinForm');
  const gradDateInput = document.getElementById('gradDate');
  const badgeInput = document.getElementById('badge');
  const badgePreview = document.getElementById('badgePreview');
  const submitBtn = document.getElementById('joinSubmit');
  const output = document.getElementById('output');
  const locationInput = document.getElementById('location');
  const locationPicker = locationInput ? locationInput.closest('.join-location') : null;
  const locationMenu = document.getElementById('locationMenu');
  const locationList = document.getElementById('locationList');
  const locationEmpty = document.getElementById('locationEmpty');
  let citiesData = null;
  let activeIndex = -1;

  // ── City / town autocomplete (from data/cities.json) ──
  function populateCities() {
    return fetch('data/cities.json')
      .then(function (r) { return r.json(); })
      .then(function (cities) { citiesData = cities || {}; })
      .catch(function () { citiesData = {}; });
  }

  function effectiveLocation() {
    return locationInput ? locationInput.value.trim() : '';
  }

  function matchCities(query) {
    const q = query.toLowerCase();
    const out = [];
    Object.keys(citiesData || {}).forEach(function (key) {
      const c = citiesData[key];
      const name = c.name || key;
      if (key.indexOf(q) === 0 || name.toLowerCase().indexOf(q) !== -1 ||
          String(c.state || '').toLowerCase().indexOf(q) !== -1) {
        out.push({ key: key, name: name, state: c.state || '' });
      }
    });
    out.sort(function (a, b) {
      const an = a.name.toLowerCase().indexOf(q), bn = b.name.toLowerCase().indexOf(q);
      if (an === 0 && bn !== 0) return -1;
      if (bn === 0 && an !== 0) return 1;
      return a.name.localeCompare(b.name);
    });
    return out.slice(0, 14);
  }

  function openMenu() { if (locationMenu) locationMenu.hidden = false; }

  function closeMenu() {
    if (locationMenu) locationMenu.hidden = true;
    activeIndex = -1;
    if (locationList) {
      locationList.querySelectorAll('.join-location-item').forEach(function (el) {
        el.classList.remove('is-active');
      });
    }
  }

  function selectCity(city) {
    locationInput.value = city.name;
    closeMenu();
    setFieldError(locationInput, '');
  }

  function renderResults(query) {
    if (!locationList) return;
    const results = matchCities(query);
    locationList.textContent = '';
    if (locationEmpty) locationEmpty.hidden = results.length > 0;
    activeIndex = -1;
    results.forEach(function (r) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'join-location-item';
      item.setAttribute('role', 'option');
      const name = document.createElement('span');
      name.textContent = r.name;
      const state = document.createElement('small');
      state.textContent = r.state;
      item.dataset.key = r.key;
      item.appendChild(name);
      item.appendChild(state);
      // mousedown (with preventDefault) beats input blur so the selection registers.
      item.addEventListener('mousedown', function (e) {
        e.preventDefault();
        selectCity(r);
      });
      locationList.appendChild(item);
    });
    openMenu();
  }

  function setActive(i) {
    const items = locationList.querySelectorAll('.join-location-item');
    if (!items.length) return;
    if (i < 0) i = items.length - 1;
    if (i >= items.length) i = 0;
    activeIndex = i;
    items.forEach(function (el, idx) {
      el.classList.toggle('is-active', idx === i);
    });
    items[i].scrollIntoView({ block: 'nearest' });
  }

  // ── Widget snippet ────────────────────────────────────
  // Self-contained HTML a member can paste into their footer.
  // `ring` is the ring's origin, `site` is the member's own URL.
  function buildWidgetSnippet(ring, site) {
    const base = (ring || location.origin).replace(/\/$/, '');
    return [
      '<!-- SRM NCR WebRing widget -->',
      '<div class="srm-ring-widget">',
      '  <a href="' + base + '/#' + site + '?nav=prev" class="srm-ring-arrow">&larr;</a>',
      '  <a href="' + base + '/" class="srm-ring-logo">SRM<sup>NCR</sup></a>',
      '  <a href="' + base + '/#' + site + '?nav=next" class="srm-ring-arrow">&rarr;</a>',
      '</div>',
      '<style>',
      '.srm-ring-widget{display:inline-flex;align-items:center;gap:.6rem;padding:.5rem .9rem;',
      'border:1px solid rgba(12,77,162,.35);border-radius:999px;background:#fff;',
      'box-shadow:0 1px 3px rgba(0,0,0,.08)}',
      '.srm-ring-arrow{text-decoration:none;font-weight:700;font-size:1.1rem;color:#0c4da2;line-height:1}',
      '.srm-ring-logo{text-decoration:none;font-weight:700;letter-spacing:-.02em;color:#c8a008;font-size:.95rem}',
      '.srm-ring-logo sup{font-size:.6em}',
      '</style>',
    ].join('\n');
  }

  function attachCopy(btn, snippetEl) {
    btn.addEventListener('click', function () {
      const text = snippetEl.textContent;
      const done = function () {
        btn.textContent = 'Copied!';
        btn.classList.add('is-copied');
        setTimeout(function () {
          btn.textContent = 'Copy code';
          btn.classList.remove('is-copied');
        }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {
          fallbackCopy(text);
          done();
        });
      } else {
        fallbackCopy(text);
        done();
      }
    });
  }

  // Legacy clipboard fallback for browsers without navigator.clipboard.
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* noop */ }
    document.body.removeChild(ta);
  }

  // Fill the on-page widget preview once, from the current origin.
  var widgetCode = document.getElementById('widgetCode');
  var widgetCopyBtn = document.getElementById('widgetCopyBtn');
  if (widgetCode && widgetCopyBtn) {
    widgetCode.textContent = buildWidgetSnippet(location.origin, 'https://your-site.example');
    attachCopy(widgetCopyBtn, widgetCode);
  }

  // ── Badge upload preview ──
  if (badgeInput && badgePreview) {
    badgeInput.addEventListener('change', function () {
      const file = badgeInput.files && badgeInput.files[0];
      badgeInput.classList.toggle('has-file', !!file);
      if (file && file.type.startsWith('image/')) {
        badgePreview.src = URL.createObjectURL(file);
        badgePreview.classList.remove('is-empty');
      }
    });
  }

  if (locationInput) {
    locationInput.addEventListener('input', function () {
      setFieldError(locationInput, '');
      const v = locationInput.value.trim();
      if (!v) closeMenu();
      else renderResults(v);
    });
    locationInput.addEventListener('keydown', function (e) {
      const menuOpen = locationMenu && !locationMenu.hidden;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!menuOpen && locationInput.value.trim()) renderResults(locationInput.value);
        setActive(activeIndex + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!menuOpen && locationInput.value.trim()) renderResults(locationInput.value);
        setActive(activeIndex - 1);
      } else if (e.key === 'Enter') {
        if (!menuOpen) return;
        const items = locationList.querySelectorAll('.join-location-item');
        if (activeIndex >= 0 && items[activeIndex]) {
          e.preventDefault();
          selectCity(citiesData[items[activeIndex].dataset.key]);
        } else {
          closeMenu();
        }
      } else if (e.key === 'Escape') {
        closeMenu();
      }
    });
  }
  if (locationPicker) {
    document.addEventListener('mousedown', function (e) {
      if (!locationPicker.contains(e.target)) closeMenu();
    });
  }
  populateCities();

  // ── Custom validation (replaces browser default bubbles) ──
  function emailValid(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  function monthIndex(mon) {
    const idx = MONTHS.indexOf(mon.toLowerCase().slice(0, 3));
    return idx === -1 ? NaN : idx + 1;
  }

  // Accepts DD/MM/YYYY, DD MMM YYYY, YYYY-MM-DD, etc.
  // Returns a valid Date or null.
  function parseGradDate(value) {
    const s = String(value || '').trim();
    let d, m, y;
    const monthRe = /^(\d{1,2})[\/\-\.\s]+([a-zA-Z]{3,9})[\/\-\.\s]+(\d{4})$/;
    const numericRe = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/;
    const isoRe = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
    if (numericRe.test(s)) {
      const parts = s.match(numericRe);
      d = +parts[1]; m = +parts[2]; y = +parts[3];
    } else if (monthRe.test(s)) {
      const parts = s.match(monthRe);
      d = +parts[1]; m = monthIndex(parts[2]); y = +parts[3];
    } else if (isoRe.test(s)) {
      const parts = s.match(isoRe);
      y = +parts[1]; m = +parts[2]; d = +parts[3];
    } else {
      return null;
    }
    if (isNaN(m)) return null;
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
    return date;
  }

  function urlValid(value) {
    try {
      const u = new URL(value);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (e) {
      return false;
    }
  }

  function setFieldError(input, message) {
    const label = input.closest('label') || input.closest('.join-badge-field');
    input.classList.toggle('is-invalid', !!message);
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    let errEl = label.querySelector('.field-error');
    if (message) {
      if (!errEl) {
        errEl = document.createElement('em');
        errEl.className = 'field-error';
        label.appendChild(errEl);
      }
      errEl.textContent = message;
    } else if (errEl) {
      errEl.remove();
    }
  }

  function validate() {
    let firstInvalid = null;
    const check = function (input, message) {
      setFieldError(input, message);
      if (message && !firstInvalid) firstInvalid = input;
    };

    check(document.getElementById('name'), document.getElementById('name').value.trim() ? '' : 'Please enter your name.');

    const website = document.getElementById('website');
    const websiteValue = website.value.trim();
    check(website, websiteValue && urlValid(websiteValue) ? '' : 'Enter a valid website URL (https://...).');

    check(document.getElementById('program'), document.getElementById('program').value.trim() ? '' : 'Please enter your program.');

    const locValue = effectiveLocation();
    check(locationInput, locValue ? '' : 'Please enter your city or town.');

    const gradValue = gradDateInput.value.trim();
    let gradError = '';
    if (!gradValue) {
      gradError = 'Please pick your graduation date.';
    } else {
      const gradDate = parseGradDate(gradValue);
      if (!gradDate) {
        gradError = 'Enter the date as DD/MM/YYYY.';
      } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const maxDate = new Date();
        maxDate.setFullYear(today.getFullYear() + 10);
        if (gradDate < today) gradError = 'Graduation date must be in the future.';
        else if (gradDate > maxDate) gradError = 'Graduation date seems too far in the future.';
      }
    }
    check(gradDateInput, gradError);

    const college = document.getElementById('collegeEmail');
    check(college, emailValid(college.value.trim()) ? '' : 'Enter a valid college email.');
    const personal = document.getElementById('personalEmail');
    check(personal, emailValid(personal.value.trim()) ? '' : 'Enter a valid email.');

    const badgeFile = badgeInput.files && badgeInput.files[0];
    let badgeError = '';
    if (!badgeFile) badgeError = 'Please choose a badge image.';
    else if (badgeFile.size > 1024 * 1024) badgeError = 'Badge is too large (max 1 MB).';
    setFieldError(badgeInput, badgeError);
    if (badgeError && !firstInvalid) firstInvalid = badgeInput;

    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
  }

  // Clear a field's error as soon as the user edits it.
  form.addEventListener('input', function (event) {
    if (event.target.matches('input, select, textarea') && event.target.classList.contains('is-invalid')) {
      setFieldError(event.target, '');
    }
  });

  // ── Submit: multipart POST to the backend worker ──
  form.addEventListener('submit', function (event) {
    event.preventDefault();

    if (!validate()) return;

    const form = new FormData();
    form.append('name', document.getElementById('name').value.trim());
    form.append('website', document.getElementById('website').value.trim());
    form.append('program', document.getElementById('program').value.trim());
    form.append('gradDate', gradDateInput.value);
    form.append('collegeEmail', document.getElementById('collegeEmail').value.trim());
    form.append('personalEmail', document.getElementById('personalEmail').value.trim());
    form.append('badgeFile', badgeInput.files[0]);
    form.append('location', effectiveLocation());

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting\u2026';

    fetch(API, { method: 'POST', body: form })
      .then(function (response) {
        return response.json().then(function (data) {
          return { ok: response.ok, data: data };
        });
      })
      .then(function (result) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit request';
        if (result.ok && result.data.success && result.data.prUrl) {
          const el = document.createElement('div');

          const line = document.createElement('div');
          line.textContent = 'Submitted! Your pull request is waiting for review.';
          el.appendChild(line);

          const link = document.createElement('a');
          link.href = result.data.prUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = 'View pull request \u2192';
          el.appendChild(link);

          const widgetHeading = document.createElement('p');
          widgetHeading.style.marginTop = '1rem';
          widgetHeading.style.marginBottom = '0.25rem';
          widgetHeading.textContent = 'While you wait, drop this into your footer:';
          el.appendChild(widgetHeading);

          const snippetCode = document.createElement('code');
          snippetCode.style.display = 'block';
          snippetCode.style.whiteSpace = 'pre-wrap';
          snippetCode.style.wordBreak = 'break-all';
          snippetCode.style.fontFamily = 'var(--font-mono)';
          snippetCode.style.fontSize = '0.72rem';
          snippetCode.style.padding = '0.75rem';
          snippetCode.style.background = 'rgba(0,0,0,.25)';
          snippetCode.style.borderRadius = '6px';
          snippetCode.textContent = buildWidgetSnippet(location.origin, document.getElementById('website').value.trim());
          el.appendChild(snippetCode);

          const copyBtn = document.createElement('button');
          copyBtn.type = 'button';
          copyBtn.className = 'widget-copy';
          copyBtn.style.position = 'static';
          copyBtn.style.marginTop = '0.5rem';
          copyBtn.textContent = 'Copy code';
          attachCopy(copyBtn, snippetCode);
          el.appendChild(copyBtn);

          showStatus(el, false);
        } else {
          showStatus(result.data.error || 'Something went wrong. Please try again.', true);
        }
      })
      .catch(function (error) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit request';
        showStatus('Network error: ' + error.message, true);
      });
  });

  function showStatus(message, isError) {
    output.textContent = '';
    output.className = 'join-status is-visible ' + (isError ? 'is-error' : 'is-success');
    if (typeof message === 'string') {
      output.textContent = message;
    } else {
      output.appendChild(message);
    }
  }
})();
