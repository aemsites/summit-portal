function getSlug() {
  const match = window.location.pathname.match(/\/insights\/([^/]+)/);
  return match ? match[1] : 'unknown';
}

function track(rating, slug) {
  const metadata = { slug, path: window.location.pathname };
  if (typeof window.sa_event === 'function') {
    window.sa_event(`insights_feedback_${rating}`, metadata);
  }
}

export default function decorate(block) {
  const prompt = block.textContent.trim() || 'Did these insights resonate with you?';
  block.textContent = '';

  const wrap = document.createElement('div');
  wrap.className = 'rf-wrap';

  const label = document.createElement('p');
  label.className = 'rf-prompt';
  label.textContent = prompt;

  const buttons = document.createElement('div');
  buttons.className = 'rf-buttons';

  const thanks = document.createElement('p');
  thanks.className = 'rf-thanks';
  thanks.textContent = 'Thanks for the feedback!';
  thanks.hidden = true;

  const ratings = [
    { key: 'up', icon: '👍', aria: 'Yes, these insights resonate' },
    { key: 'down', icon: '👎', aria: 'No, these insights miss the mark' },
  ];

  const slug = getSlug();
  let submitted = false;

  ratings.forEach(({ key, icon, aria }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `rf-btn rf-btn-${key}`;
    btn.setAttribute('aria-label', aria);
    btn.textContent = icon;
    btn.addEventListener('click', () => {
      if (submitted) return;
      submitted = true;
      track(key, slug);
      buttons.querySelectorAll('button').forEach((b) => {
        b.disabled = true;
        if (b !== btn) b.classList.add('rf-btn-dimmed');
      });
      btn.classList.add('rf-btn-selected');
      thanks.hidden = false;
    });
    buttons.append(btn);
  });

  wrap.append(label, buttons, thanks);
  block.append(wrap);
}
