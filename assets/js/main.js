// Assessment form submission
const form = document.getElementById('assessment-form');
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));

    const WEBHOOK_URL = 'https://dylansells.app.n8n.cloud/webhook-test/landhawk-assessment';

    try {
      if (WEBHOOK_URL) {
        await fetch(WEBHOOK_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(data),
        });
      }
      form.style.display = 'none';
      document.getElementById('form-success').style.display = 'block';
    } catch (err) {
      form.style.display = 'none';
      document.getElementById('form-success').style.display = 'block';
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
