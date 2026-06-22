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

  function renderResults(results, q) {
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
      // The server-rendered displayPrice isn't available here, so we pick the
      // right price based on a data attribute set in the header search
      // (wholesale cookie detection happens server-side, but for live results
      // we just use the price + a generic symbol fallback). The full results
      // page uses displayPrice properly.
      const price = p.price;
      const symbol = '$';
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
      renderResults(data.results || [], q);
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