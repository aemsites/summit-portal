export default function init(el) {
  if (el.querySelector('.bgb-content')) return;
  el.innerHTML = `
    <aside class="bgb-content" aria-label="Touchscreen booth staff guide">
      <div class="bgb-copy">
        <p class="bgb-eyebrow">Event staff / Touchscreen booth</p>
        <h2>Amplify your brand visibility</h2>
        <p class="bgb-description">Set up the screen, guide the report conversation, and answer customer questions. Your illustrated staff guide, ready on mobile or desktop.</p>
        <a class="bgb-action" href="/adobe/booth-guide">Open the staff guide <span aria-hidden="true">↗</span></a>
      </div>
      <svg class="bgb-screen" viewBox="0 0 140 180" fill="none" aria-hidden="true">
        <rect x="24" y="8" width="92" height="132" rx="8" stroke="currentColor" stroke-width="2"/>
        <path d="M35 25h70M35 115h70M70 140v24m-22 7h44" stroke="currentColor" stroke-width="2"/>
        <path d="M38 43h52M38 51h36" stroke="currentColor" stroke-width="3"/>
        <path d="M38 71h12v26H38zm22 10h12v16H60zm22-18h12v34H82z" fill="currentColor" opacity=".35"/>
        <circle cx="99" cy="123" r="3" fill="currentColor"/>
      </svg>
    </aside>
  `;
}
