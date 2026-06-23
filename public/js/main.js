/**
 * TECH ZONE — Frontend JavaScript
 * Handles: Quantity calculator + WhatsApp message generator on product page
 */

// ===== Live Search =====
(function () {
  'use strict';
  const input = document.getElementById('globalSearchInput');
  const dropdown = document.getElementById('searchDropdown');
  const resultsEl = document.getElementById('searchDropdownResults');
  const emptyEl = document.getElementById('searchDropdownEmpty');
  const allEl = document.getElementById('searchDropdownAll');
  const clearBtn = document.getElementById('searchClear');
  const form = input ? input.closest('form') : null;
  if (!input || !dropdown || !resultsEl) return;

  let lastQuery = '';
  let debounceTimer = null;
  let activeRequest = 0;

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function highlight(text, q) {
    if (!q) return escapeHtml(text);
    const safeText = escapeHtml(text);
    const safeQ = escapeHtml(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safeText.replace(new RegExp(safeQ, 'gi'), (m) => '<mark>' + m + '</mark>');
  }

  function closeDropdown() {
    dropdown.hidden = true;
  }

  function openDropdown() {
    dropdown.hidden = false;
  }

  function showLoading() {
    openDropdown();
    resultsEl.innerHTML = '<div class="search-loading">جاري البحث</div>';
    emptyEl.hidden = true;
    allEl.hidden = true;
  }

  function renderResults(results, q, isWholesale) {
    if (!results || results.length === 0) {
      resultsEl.innerHTML = '';
      emptyEl.hidden = false;
      allEl.hidden = true;
      openDropdown();
      return;
    }
    emptyEl.hidden = true;
    allEl.hidden = false;
    allEl.href = '/search?q=' + encodeURIComponent(q);

    const html = results.map((p) => {
      const img = p.image_type
        ? '<img src="/img/' + p.id + '" alt="" />'
        : '<span class="no-img">📦</span>';
      // Pick the right price + symbol per viewer (mirrors server-side displayPrice):
      //   - Wholesale (logged in): p.price + '$' (wholesale_symbol)
      //   - Visitor (default):      p.price_retail (fallback p.price) + '₺' (retail_symbol)
      const symbol = isWholesale ? '$' : '₺';
      const rawPrice = isWholesale ? p.price : (p.price_retail || p.price);
      const price = parseFloat(rawPrice || 0).toFixed(2);
      return (
        '<a class="search-dropdown-item" href="/product/' + p.id + '">' +
          '<div class="search-dropdown-img">' + img + '</div>' +
          '<div class="search-dropdown-info">' +
            '<div class="search-dropdown-name">' + highlight(p.name, q) + '</div>' +
            '<div class="search-dropdown-cat">📂 ' + escapeHtml(p.category_name || '') + '</div>' +
          '</div>' +
          '<div class="search-dropdown-price">' + parseFloat(price).toFixed(2) + ' ' + symbol + '</div>' +
        '</a>'
      );
    }).join('');
    resultsEl.innerHTML = html;
    openDropdown();
  }

  async function runSearch(q) {
    if (q === lastQuery) return;
    lastQuery = q;
    const requestId = ++activeRequest;
    showLoading();
    try {
      const res = await fetch('/api/search?q=' + encodeURIComponent(q), {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error('search failed');
      const data = await res.json();
      if (requestId !== activeRequest) return; // stale
      renderResults(data.results || [], q, !!data.isWholesale);
    } catch (err) {
      if (requestId !== activeRequest) return;
      resultsEl.innerHTML = '<div class="search-dropdown-empty">حدث خطأ في البحث</div>';
      emptyEl.hidden = true;
      allEl.hidden = true;
      openDropdown();
    }
  }

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearBtn.hidden = q.length === 0;
    if (q.length === 0) {
      lastQuery = '';
      closeDropdown();
      return;
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runSearch(q), 220);
  });

  input.addEventListener('focus', () => {
    if (input.value.trim().length > 0) openDropdown();
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.hidden = true;
    lastQuery = '';
    closeDropdown();
    input.focus();
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== input && !input.contains(e.target)) {
      closeDropdown();
    }
  });

  // Close on Escape
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDropdown();
      input.blur();
    }
  });

  // Submit goes to /search for full results
  if (form) {
    form.addEventListener('submit', (e) => {
      const q = input.value.trim();
      if (!q) {
        e.preventDefault();
        input.focus();
      }
    });
  }
})();


(function () {
  'use strict';

  // ===== Quantity & WhatsApp Calculator =====
  const qtyInput = document.getElementById('qty-input');
  const qtyMinus = document.getElementById('qty-minus');
  const qtyPlus = document.getElementById('qty-plus');
  const totalValueEl = document.getElementById('total-value');
  const waBtn = document.getElementById('wa-btn');

  if (qtyInput && totalValueEl && waBtn) {
    // The price + symbol passed in by the server already match the viewer type
    // (wholesale: USD, retail: TRY) — no client-side conversion needed.
    const pricePerUnit = parseFloat(waBtn.dataset.price) || 0;
    const productName = document.getElementById('product-name').value || '';
    const categoryName = document.getElementById('category-name').value || '';
    const whatsappNumber = (waBtn.dataset.phone || '').replace(/[^\d]/g, '');
    const currencySymbol = waBtn.dataset.currencySymbol || '';
    const formatPrice = (n) => n.toFixed(2);

    function updateTotal() {
      let qty = parseInt(qtyInput.value, 10);
      if (isNaN(qty) || qty < 1) {
        qty = 1;
        qtyInput.value = 1;
      }
      if (qty > 999) {
        qty = 999;
        qtyInput.value = 999;
      }
      const total = qty * pricePerUnit;
      totalValueEl.textContent = formatPrice(total);

      // Build WhatsApp message
      const lines = [
        'مرحباً، أرغب بطلب المنتج التالي:',
        '',
        `📦 المنتج: ${productName}`,
        `📂 القسم: ${categoryName}`,
        `💵 سعر القطعة: ${formatPrice(pricePerUnit)} ${currencySymbol}`,
        `🔢 الكمية: ${qty}`,
        `💰 المجموع الكلي: ${formatPrice(total)} ${currencySymbol}`,
        '',
        'أرجو تأكيد توفره وتفاصيل التوصيل. شكراً!',
      ];
      const text = encodeURIComponent(lines.join('\n'));
      if (whatsappNumber) {
        waBtn.href = `https://wa.me/${whatsappNumber}?text=${text}`;
        waBtn.removeAttribute('disabled');
      } else {
        waBtn.href = '#';
        waBtn.setAttribute('disabled', 'disabled');
        waBtn.style.opacity = '0.5';
        waBtn.style.cursor = 'not-allowed';
      }
    }

    if (qtyMinus) {
      qtyMinus.addEventListener('click', () => {
        qtyInput.value = Math.max(1, (parseInt(qtyInput.value, 10) || 1) - 1);
        updateTotal();
      });
    }
    if (qtyPlus) {
      qtyPlus.addEventListener('click', () => {
        qtyInput.value = Math.min(999, (parseInt(qtyInput.value, 10) || 1) + 1);
        updateTotal();
      });
    }
    qtyInput.addEventListener('input', updateTotal);
    qtyInput.addEventListener('change', updateTotal);

    updateTotal();
  }

  // ===== Image error fallback =====
  document.querySelectorAll('img[data-fallback]').forEach((img) => {
    img.addEventListener('error', () => {
      img.style.display = 'none';
      const placeholder = img.nextElementSibling;
      if (placeholder) placeholder.style.display = 'flex';
    });
  });

  // ===== Confirm dangerous actions =====
  document.querySelectorAll('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      const msg = form.getAttribute('data-confirm') || 'هل أنت متأكد؟';
      if (!confirm(msg)) e.preventDefault();
    });
  });

  // ===== Contact dropdown toggle =====
  const contactBtn = document.getElementById('contactToggle');
  const contactDropdown = document.getElementById('contactDropdown');
  if (contactBtn && contactDropdown) {
    contactBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = contactDropdown.classList.toggle('open');
      contactBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!contactBtn.contains(e.target) && !contactDropdown.contains(e.target)) {
        contactDropdown.classList.remove('open');
        contactBtn.setAttribute('aria-expanded', 'false');
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && contactDropdown.classList.contains('open')) {
        contactDropdown.classList.remove('open');
        contactBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }
})();
// ===== Hero Slider (slide animation, no controls) =====
(function () {
  'use strict';
  const slider = document.getElementById('heroSlider');
  if (!slider) return;
  const track = document.getElementById('heroSliderTrack');
  if (!track) return;
  const slides = track.querySelectorAll('.hero-slider-slide');
  const total = slides.length;
  if (total === 0) return;

  let current = 0;
  let timer = null;
  const INTERVAL = 5000; // 5 seconds

  function goTo(idx) {
    current = ((idx % total) + total) % total; // safe modulo for negatives
    track.style.transform = 'translateX(-' + (current * 100) + '%)';
  }
  function next() { goTo(current + 1); }
  function start() { stop(); timer = setInterval(next, INTERVAL); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  // Initial position
  goTo(0);

  if (total <= 1) {
    // No auto-advance needed for a single slide
    return;
  }

  // Touch / swipe support (mobile)
  let touchStartX = 0;
  let touchEndX = 0;
  slider.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    stop();
  }, { passive: true });
  slider.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    const dx = touchEndX - touchStartX;
    if (Math.abs(dx) > 40) {
      if (dx < 0) next();
      else goTo(current - 1);
    }
    start();
  }, { passive: true });

  // Pause on hover (desktop)
  slider.addEventListener('mouseenter', stop);
  slider.addEventListener('mouseleave', start);

  // Pause when tab is hidden (saves CPU)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else start();
  });

  start();
})();

// ===== Global Page Loader =====
(function () {
  'use strict';

  const loader = document.getElementById('globalLoader');
  if (!loader) return;

  const statusEl = document.getElementById('loaderStatus');
  const messages = ['جاري التحميل', 'لحظة من فضلك', 'يتم تجهيز المحتوى', 'تقريباً جاهز'];
  let msgIdx = 0;
  let msgTimer = null;
  let isShowing = false;
  let minVisibleTimer = null;
  let failSafeTimer = null;
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  // Mobile: shorter minimum visible time, faster animations off
  const MIN_VISIBLE_MS = isMobile ? 150 : 300;
  const STATUS_CYCLE_MS = isMobile ? 1800 : 1200;
  const FAILSAFE_MS = isMobile ? 4000 : 8000;

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function cycleStatus() {
    if (!isShowing) return;
    msgIdx = (msgIdx + 1) % messages.length;
    setStatus(messages[msgIdx]);
  }

  function startStatusCycle() {
    if (msgTimer) clearInterval(msgTimer);
    msgTimer = setInterval(cycleStatus, STATUS_CYCLE_MS);
  }

  function clearAllTimers() {
    if (minVisibleTimer) { clearTimeout(minVisibleTimer); minVisibleTimer = null; }
    if (failSafeTimer) { clearTimeout(failSafeTimer); failSafeTimer = null; }
    if (msgTimer) { clearInterval(msgTimer); msgTimer = null; }
  }

  function showLoader(text) {
    if (isShowing) {
      if (text) setStatus(text);
      return;
    }
    isShowing = true;
    loader.classList.remove('is-hiding');
    loader.classList.add('is-visible');
    loader.setAttribute('aria-hidden', 'false');
    setStatus(text || messages[0]);
    msgIdx = 0;
    startStatusCycle();
    // Fail-safe: never stay longer than FAILSAFE_MS
    failSafeTimer = setTimeout(() => {
      if (isShowing) hideLoader();
    }, FAILSAFE_MS);
  }

  function hideLoader() {
    if (!isShowing) return;
    clearAllTimers();
    isShowing = false;
    loader.classList.add('is-hiding');
    setTimeout(() => {
      loader.classList.remove('is-visible', 'is-hiding');
      loader.setAttribute('aria-hidden', 'true');
    }, 350);
  }

  function scheduleMinHide() {
    if (minVisibleTimer) clearTimeout(minVisibleTimer);
    minVisibleTimer = setTimeout(hideLoader, MIN_VISIBLE_MS);
  }

  // ===== 1. Page load - hide ASAP (DOMContentLoaded, faster than window.load) =====
  showLoader('جاري التحميل');
  const onReady = () => {
    // Small minimum visible time so user sees the loader (no flash)
    scheduleMinHide();
  };
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    onReady();
  } else {
    document.addEventListener('DOMContentLoaded', () => onReady(), { once: true });
  }
  // Backup: also try window.load in case DOMContentLoaded already fired
  if (document.readyState !== 'complete') {
    window.addEventListener('load', () => {
      if (isShowing) scheduleMinHide();
    }, { once: true });
  }

  // ===== 2. Link clicks (intercept internal navigation) =====
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (
      !href ||
      href.startsWith('#') ||
      href.startsWith('javascript:') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      link.target === '_blank' ||
      link.hasAttribute('download') ||
      (link.origin && link.origin !== window.location.origin)
    ) {
      return;
    }
    // Skip admin nav
    if (href.startsWith('/admin')) return;
    // Skip if loader already showing (don't double-trigger)
    if (isShowing) return;
    showLoader('جاري الانتقال');
    // Browser will navigate; loader hides on new page load
  });

  // ===== 3. Form submissions =====
  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    if (form.closest('.admin-panel')) return;
    showLoader('جاري الإرسال');
  });

  // ===== 4. Hide on bfcache restore =====
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) hideLoader();
  });

  // ===== 5. Listen for ANY navigation completion via beforeunload =====
  window.addEventListener('beforeunload', () => {
    // Reset fail-safe so old page's timer doesn't affect new page
    clearAllTimers();
  });

  // Expose for AJAX callers
  window.__showLoader = showLoader;
  window.__hideLoader = hideLoader;
})();
