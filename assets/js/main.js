// Assessment form submission
const form = document.getElementById('assessment-form');
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));

    // TODO: replace with your webhook URL (Formspree, GHL, Zapier, etc.)
    const WEBHOOK_URL = '';

    try {
      if (WEBHOOK_URL) {
        await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
      }
      form.style.display = 'none';
      document.getElementById('form-success').style.display = 'block';
    } catch (err) {
      alert('Something went wrong. Please email us directly at hello@landhawkdrone.com');
    }
  });
}

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});
