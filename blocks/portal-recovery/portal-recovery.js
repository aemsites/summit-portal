export default function init(el) {
  el.innerHTML = `
    <div class="pr-content">
      <h1>This report isn't available to the account you're signed in with.</h1>
      <p>Try the business account that received the report, or request a report from Adobe Sales.</p>
      <a class="pr-primary" href="/request-report">Request a report</a>
      <nav class="pr-alternatives" aria-label="Report access options">
        <a href="/auth/portal">My Portal</a>
        <a href="/auth/logout">Sign out and use another account</a>
      </nav>
      <p class="pr-note">A report request doesn't unlock this page. Adobe Sales will prepare your report and follow up.</p>
    </div>
  `;
}
