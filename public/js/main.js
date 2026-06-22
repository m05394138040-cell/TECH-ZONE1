/**
 * TECH ZONE — Frontend JavaScript
 * Handles: Quantity calculator + WhatsApp message generator on product page
 */

(function () {
  'use strict';

  // ===== Quantity & WhatsApp Calculator =====
  const qtyInput = document.getElementById('qty-input');
  const qtyMinus = document.getElementById('qty-minus');
  const qtyPlus = document.getElementById('qty-plus');
  const totalValueEl = document.getElementById('total-value');
  const waBtn = document.getElementById('wa-btn');

  if (qtyInput && totalValueEl && waBtn) {
    const pricePerUnit = parseFloat(document.getElementById('unit-price').value) || 0;
    const productName = document.getElementById('product-name').value || '';
    const categoryName = document.getElementById('category-name').value || '';
    const whatsappNumber = (waBtn.dataset.phone || '').replace(/[^\d]/g, '');
    // Read currency settings from data attributes
    const currencySymbol = waBtn.dataset.currencySymbol || '$';
    const isWholesale = waBtn.dataset.isWholesale === 'true';
    const exchangeRate = parseFloat(waBtn.dataset.exchangeRate) || 1;
    const displayPrice = isWholesale ? pricePerUnit : pricePerUnit * exchangeRate;
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
      const total = qty * displayPrice;
      totalValueEl.textContent = formatPrice(total);

      // Build WhatsApp message
      const lines = [
        'مرحباً، أرغب بطلب المنتج التالي:',
        '',
        `📦 المنتج: ${productName}`,
        `📂 القسم: ${categoryName}`,
        `💵 سعر القطعة: ${formatPrice(displayPrice)} ${currencySymbol}`,
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