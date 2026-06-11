# portal-login Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `blocks/portal-login` — two equal-weight login cards (Adobe ID link + magic link email form) with responsive grid layout and full form submit/success/error handling.

**Architecture:** A vanilla JS `init(el)` decorator adds semantic classes, injects card headings, decorates the Adobe ID link as a button, appends an email form to the magic link column, and injects a mobile "or" divider. CSS uses existing design tokens for card chrome and form styling. No ak.js imports needed.

**Tech Stack:** Vanilla JS ES modules, CSS custom properties from `styles.css`, `@web/test-runner` + `@esm-bundle/chai` + `sinon` for unit tests.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `blocks/portal-login/portal-login.js` | Block decorator — DOM manipulation, form logic |
| Create | `blocks/portal-login/portal-login.css` | Card layout, form styles, responsive behaviour |
| Create | `test/blocks/portal-login/portal-login.test.js` | Unit tests (WTR + chai + sinon) |

---

### Task 1: Scaffold — column class decoration + complete CSS

**Files:**
- Create: `blocks/portal-login/portal-login.js`
- Create: `blocks/portal-login/portal-login.css`
- Create: `test/blocks/portal-login/portal-login.test.js`

- [ ] **Step 1: Create the test file with a failing test for column decoration**

```js
// test/blocks/portal-login/portal-login.test.js
import { expect } from '@esm-bundle/chai';
import init from '../../../blocks/portal-login/portal-login.js';

function makeBlock() {
  const el = document.createElement('div');
  el.innerHTML = `
    <div>
      <div>
        <p>If you already have an Adobe ID, you can use this one to log in to your brand report.</p>
        <p><strong><a href="/auth/portal">Login with Adobe ID</a></strong></p>
      </div>
      <div>If you don't have an Adobe ID, you can request a one-time login link with your corporate email address.</div>
    </div>
  `;
  return el;
}

describe('portal-login', () => {
  describe('column decoration', () => {
    let el;
    before(() => {
      el = makeBlock();
      init(el);
    });

    it('adds pl-row to the row div', () => {
      expect(el.children[0].classList.contains('pl-row')).to.be.true;
    });

    it('adds pl-col and pl-col-adobe to first column', () => {
      const col = el.querySelector('.pl-row').children[0];
      expect(col.classList.contains('pl-col')).to.be.true;
      expect(col.classList.contains('pl-col-adobe')).to.be.true;
    });

    it('adds pl-col and pl-col-magic to second column', () => {
      const col = el.querySelector('.pl-row').children[1];
      expect(col.classList.contains('pl-col')).to.be.true;
      expect(col.classList.contains('pl-col-magic')).to.be.true;
    });
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npm run test:file -- test/blocks/portal-login/portal-login.test.js
```

Expected: FAIL — `Cannot find module '../../../blocks/portal-login/portal-login.js'`

- [ ] **Step 3: Create `portal-login.js` with the column decoration**

```js
// blocks/portal-login/portal-login.js
const MAGIC_LINK_ENDPOINT = '';

export default function init(el) {
  const [row] = [...el.children];
  row.classList.add('pl-row');

  const [colAdobe, colMagic] = [...row.children];
  colAdobe.classList.add('pl-col', 'pl-col-adobe');
  colMagic.classList.add('pl-col', 'pl-col-magic');
}
```

- [ ] **Step 4: Create `portal-login.css` with complete styles**

```css
/* blocks/portal-login/portal-login.css */

/* Wrapper centering — support both ak.js and aem.js conventions */
.portal-login-wrapper,
.block-content:has(.portal-login) {
  padding-inline: 0;
}

@media (width >= 1000px) {
  .portal-login-wrapper,
  .block-content:has(.portal-login) {
    padding-inline: var(--spacing-l);
  }

  .portal-login {
    max-width: 1200px;
    margin-inline: auto;
  }
}

/* Grid layout */
.portal-login .pl-row {
  display: grid;
  grid-template-columns: 1fr;
}

@media (width >= 1000px) {
  .portal-login .pl-row {
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-xl);
  }
}

/* Card chrome */
.portal-login .pl-col {
  padding: var(--spacing-xl);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  box-shadow: var(--rpt-card-shadow);
}

@media (width >= 1000px) {
  .portal-login .pl-col {
    border-radius: 16px;
  }
}

/* Card heading */
.portal-login .pl-card-title {
  margin: 0 0 var(--spacing-m);
  padding-bottom: var(--spacing-s);
  font-size: var(--heading-font-size-xs);
  font-weight: 600;
  border-bottom: 1px solid var(--color-border);
}

/* Adobe ID column — make the .btn full-width */
.portal-login .pl-col-adobe a.btn {
  display: block;
  text-align: center;
  margin-top: var(--spacing-m);
}

/* Magic link form */
.portal-login .pl-magic-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-s);
  margin-top: var(--spacing-m);
}

.portal-login .pl-label {
  font-size: var(--body-font-size-s);
  font-weight: 500;
  color: var(--color-text-secondary);
}

.portal-login .pl-input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px var(--spacing-m);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;

  &:focus {
    outline: 2px solid var(--color-adobe-red);
    outline-offset: 2px;
  }
}

.portal-login .pl-submit {
  display: block;
  width: 100%;
  padding: 10px var(--spacing-m);
  background: var(--color-adobe-red);
  color: #fff;
  border: 2px solid var(--color-adobe-red);
  border-radius: 4px;
  font: inherit;
  font-weight: 500;
  cursor: pointer;
  text-align: center;
  transition: background 0.15s ease, border-color 0.15s ease;

  &:hover:not(:disabled) {
    background: var(--color-adobe-red-hover);
    border-color: var(--color-adobe-red-hover);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

/* Success message */
.portal-login .pl-success {
  font-size: var(--body-font-size-s);
  color: var(--color-text-secondary);
  margin: 0;
}

/* Inline error */
.portal-login .pl-error {
  font-size: var(--body-font-size-s);
  color: var(--color-red-600);
  margin: 0;
}

/* Mobile "or" divider — shown between stacked cards on mobile */
.portal-login .pl-divider {
  display: flex;
  align-items: center;
  gap: var(--spacing-m);
  padding: var(--spacing-m) var(--spacing-xl);
  color: var(--color-text-muted);
  font-size: var(--body-font-size-s);

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--color-border);
  }
}

@media (width >= 1000px) {
  .portal-login .pl-divider {
    display: none;
  }
}
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
npm run test:file -- test/blocks/portal-login/portal-login.test.js
```

Expected: PASS — 3 passing

- [ ] **Step 6: Commit**

```bash
git add blocks/portal-login/portal-login.js blocks/portal-login/portal-login.css test/blocks/portal-login/portal-login.test.js
git commit -m "feat(portal-login): scaffold block with column class decoration and full CSS"
```

---

### Task 2: Inject card headings

**Files:**
- Modify: `blocks/portal-login/portal-login.js`
- Modify: `test/blocks/portal-login/portal-login.test.js`

- [ ] **Step 1: Add failing tests for card headings**

Append inside the `describe('portal-login', ...)` block in the test file (after the `column decoration` describe):

```js
describe('card headings', () => {
  let el;
  before(() => {
    el = makeBlock();
    init(el);
  });

  it('injects "Adobe ID" heading as first child of col-adobe', () => {
    const col = el.querySelector('.pl-col-adobe');
    const h3 = col.querySelector('h3.pl-card-title');
    expect(h3).to.exist;
    expect(h3.textContent).to.equal('Adobe ID');
    expect(col.firstElementChild).to.equal(h3);
  });

  it('injects "Magic Link" heading as first child of col-magic', () => {
    const col = el.querySelector('.pl-col-magic');
    const h3 = col.querySelector('h3.pl-card-title');
    expect(h3).to.exist;
    expect(h3.textContent).to.equal('Magic Link');
    expect(col.firstElementChild).to.equal(h3);
  });
});
```

- [ ] **Step 2: Run to confirm new tests fail**

```bash
npm run test:file -- test/blocks/portal-login/portal-login.test.js
```

Expected: FAIL — `h3 is null`

- [ ] **Step 3: Add `injectHeading` and call it in `init()`**

Replace the contents of `blocks/portal-login/portal-login.js`:

```js
// blocks/portal-login/portal-login.js
const MAGIC_LINK_ENDPOINT = '';

function injectHeading(col, text) {
  const h3 = document.createElement('h3');
  h3.className = 'pl-card-title';
  h3.textContent = text;
  col.prepend(h3);
}

export default function init(el) {
  const [row] = [...el.children];
  row.classList.add('pl-row');

  const [colAdobe, colMagic] = [...row.children];
  colAdobe.classList.add('pl-col', 'pl-col-adobe');
  colMagic.classList.add('pl-col', 'pl-col-magic');

  injectHeading(colAdobe, 'Adobe ID');
  injectHeading(colMagic, 'Magic Link');
}
```

- [ ] **Step 4: Run to confirm all tests pass**

```bash
npm run test:file -- test/blocks/portal-login/portal-login.test.js
```

Expected: PASS — 5 passing

- [ ] **Step 5: Commit**

```bash
git add blocks/portal-login/portal-login.js test/blocks/portal-login/portal-login.test.js
git commit -m "feat(portal-login): inject card headings"
```

---

### Task 3: Decorate Adobe ID link as a button

**Files:**
- Modify: `blocks/portal-login/portal-login.js`
- Modify: `test/blocks/portal-login/portal-login.test.js`

- [ ] **Step 1: Add failing test for button decoration**

Append inside `describe('portal-login', ...)`:

```js
describe('Adobe ID button', () => {
  let el;
  before(() => {
    el = makeBlock();
    init(el);
  });

  it('adds .btn and .btn-primary to the Adobe ID link', () => {
    const link = el.querySelector('.pl-col-adobe a');
    expect(link.classList.contains('btn')).to.be.true;
    expect(link.classList.contains('btn-primary')).to.be.true;
  });
});
```

- [ ] **Step 2: Run to confirm the new test fails**

```bash
npm run test:file -- test/blocks/portal-login/portal-login.test.js
```

Expected: FAIL — link does not have `.btn`

- [ ] **Step 3: Add `decorateAdobeButton` and call it in `init()`**

Replace `blocks/portal-login/portal-login.js`:

```js
// blocks/portal-login/portal-login.js
const MAGIC_LINK_ENDPOINT = '';

function injectHeading(col, text) {
  const h3 = document.createElement('h3');
  h3.className = 'pl-card-title';
  h3.textContent = text;
  col.prepend(h3);
}

function decorateAdobeButton(col) {
  const link = col.querySelector('strong > a');
  if (!link) return;
  link.classList.add('btn', 'btn-primary');
}

export default function init(el) {
  const [row] = [...el.children];
  row.classList.add('pl-row');

  const [colAdobe, colMagic] = [...row.children];
  colAdobe.classList.add('pl-col', 'pl-col-adobe');
  colMagic.classList.add('pl-col', 'pl-col-magic');

  injectHeading(colAdobe, 'Adobe ID');
  injectHeading(colMagic, 'Magic Link');

  decorateAdobeButton(colAdobe);
}
```

- [ ] **Step 4: Run to confirm all tests pass**

```bash
npm run test:file -- test/blocks/portal-login/portal-login.test.js
```

Expected: PASS — 6 passing

- [ ] **Step 5: Commit**

```bash
git add blocks/portal-login/portal-login.js test/blocks/portal-login/portal-login.test.js
git commit -m "feat(portal-login): decorate Adobe ID link as .btn.btn-primary"
```

---

### Task 4: Inject magic link form (DOM only)

**Files:**
- Modify: `blocks/portal-login/portal-login.js`
- Modify: `test/blocks/portal-login/portal-login.test.js`

- [ ] **Step 1: Add failing tests for form elements**

Append inside `describe('portal-login', ...)`:

```js
describe('magic link form', () => {
  let el;
  before(() => {
    el = makeBlock();
    init(el);
  });

  it('injects a form with class pl-magic-form into col-magic', () => {
    const form = el.querySelector('.pl-col-magic .pl-magic-form');
    expect(form).to.exist;
    expect(form.tagName).to.equal('FORM');
  });

  it('form contains an email input with id pl-email', () => {
    const input = el.querySelector('.pl-magic-form #pl-email');
    expect(input).to.exist;
    expect(input.type).to.equal('email');
    expect(input.required).to.be.true;
  });

  it('form contains a label associated with pl-email', () => {
    const label = el.querySelector('.pl-magic-form .pl-label');
    expect(label).to.exist;
    expect(label.htmlFor).to.equal('pl-email');
  });

  it('form contains a submit button with class pl-submit', () => {
    const btn = el.querySelector('.pl-magic-form .pl-submit');
    expect(btn).to.exist;
    expect(btn.type).to.equal('submit');
  });

  it('form contains a hidden error element with role alert', () => {
    const err = el.querySelector('.pl-magic-form .pl-error');
    expect(err).to.exist;
    expect(err.hidden).to.be.true;
    expect(err.getAttribute('role')).to.equal('alert');
  });
});
```

- [ ] **Step 2: Run to confirm the new tests fail**

```bash
npm run test:file -- test/blocks/portal-login/portal-login.test.js
```

Expected: FAIL — `form is null`

- [ ] **Step 3: Add `createMagicForm` and inject it in `init()`**

Replace `blocks/portal-login/portal-login.js`:

```js
// blocks/portal-login/portal-login.js
const MAGIC_LINK_ENDPOINT = '';

function injectHeading(col, text) {
  const h3 = document.createElement('h3');
  h3.className = 'pl-card-title';
  h3.textContent = text;
  col.prepend(h3);
}

function decorateAdobeButton(col) {
  const link = col.querySelector('strong > a');
  if (!link) return;
  link.classList.add('btn', 'btn-primary');
}

function createMagicForm() {
  const form = document.createElement('form');
  form.className = 'pl-magic-form';

  const label = document.createElement('label');
  label.className = 'pl-label';
  label.htmlFor = 'pl-email';
  label.textContent = 'Email address';

  const input = document.createElement('input');
  input.className = 'pl-input';
  input.type = 'email';
  input.id = 'pl-email';
  input.name = 'email';
  input.placeholder = 'your@company.com';
  input.required = true;
  input.autocomplete = 'email';

  const btn = document.createElement('button');
  btn.className = 'pl-submit';
  btn.type = 'submit';
  btn.textContent = 'Send login link';

  const error = document.createElement('p');
  error.className = 'pl-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  error.textContent = 'Something went wrong. Please try again.';

  form.append(label, input, btn, error);
  return form;
}

export default function init(el) {
  const [row] = [...el.children];
  row.classList.add('pl-row');

  const [colAdobe, colMagic] = [...row.children];
  colAdobe.classList.add('pl-col', 'pl-col-adobe');
  colMagic.classList.add('pl-col', 'pl-col-magic');

  injectHeading(colAdobe, 'Adobe ID');
  injectHeading(colMagic, 'Magic Link');

  decorateAdobeButton(colAdobe);

  const form = createMagicForm();
  colMagic.append(form);
}
```

- [ ] **Step 4: Run to confirm all tests pass**

```bash
npm run test:file -- test/blocks/portal-login/portal-login.test.js
```

Expected: PASS — 11 passing

- [ ] **Step 5: Commit**

```bash
git add blocks/portal-login/portal-login.js test/blocks/portal-login/portal-login.test.js
git commit -m "feat(portal-login): inject magic link email form"
```

---

### Task 5: Form submit handler (fetch + success/error states)

**Files:**
- Modify: `blocks/portal-login/portal-login.js`
- Modify: `test/blocks/portal-login/portal-login.test.js`

- [ ] **Step 1: Add failing tests for submit behaviour**

Append inside `describe('portal-login', ...)`:

```js
describe('form submit', () => {
  let el;
  let fetchStub;

  beforeEach(() => {
    el = makeBlock();
    init(el);
    fetchStub = sinon.stub(window, 'fetch');
  });

  afterEach(() => {
    fetchStub.restore();
  });

  it('calls fetch with POST and the entered email on submit', async () => {
    fetchStub.resolves(new Response('{}', { status: 200 }));
    const form = el.querySelector('.pl-magic-form');
    form.querySelector('#pl-email').value = 'user@example.com';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchStub.calledOnce).to.be.true;
    const [, options] = fetchStub.firstCall.args;
    expect(options.method).to.equal('POST');
    expect(JSON.parse(options.body).email).to.equal('user@example.com');
  });

  it('replaces form with success message on 200 response', async () => {
    fetchStub.resolves(new Response('{}', { status: 200 }));
    const col = el.querySelector('.pl-col-magic');
    const form = col.querySelector('.pl-magic-form');
    form.querySelector('#pl-email').value = 'user@example.com';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(col.querySelector('.pl-magic-form')).to.be.null;
    const msg = col.querySelector('.pl-success');
    expect(msg).to.exist;
    expect(msg.textContent).to.include('user@example.com');
  });

  it('shows error element on failed fetch (non-2xx)', async () => {
    fetchStub.resolves(new Response('{}', { status: 500 }));
    const form = el.querySelector('.pl-magic-form');
    form.querySelector('#pl-email').value = 'user@example.com';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(form.querySelector('.pl-error').hidden).to.be.false;
    expect(form.querySelector('.pl-submit').disabled).to.be.false;
  });

  it('shows error element on network failure', async () => {
    fetchStub.rejects(new Error('Network error'));
    const form = el.querySelector('.pl-magic-form');
    form.querySelector('#pl-email').value = 'user@example.com';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(form.querySelector('.pl-error').hidden).to.be.false;
  });
});
```

Also add the sinon import at the top of the test file (after the chai import):

```js
import sinon from 'sinon';
```

- [ ] **Step 2: Run to confirm the new tests fail**

```bash
npm run test:file -- test/blocks/portal-login/portal-login.test.js
```

Expected: FAIL — submit handler not yet attached

- [ ] **Step 3: Add `attachSubmitHandler` and call it in `init()`**

Replace `blocks/portal-login/portal-login.js`:

```js
// blocks/portal-login/portal-login.js
const MAGIC_LINK_ENDPOINT = '';

function injectHeading(col, text) {
  const h3 = document.createElement('h3');
  h3.className = 'pl-card-title';
  h3.textContent = text;
  col.prepend(h3);
}

function decorateAdobeButton(col) {
  const link = col.querySelector('strong > a');
  if (!link) return;
  link.classList.add('btn', 'btn-primary');
}

function createMagicForm() {
  const form = document.createElement('form');
  form.className = 'pl-magic-form';

  const label = document.createElement('label');
  label.className = 'pl-label';
  label.htmlFor = 'pl-email';
  label.textContent = 'Email address';

  const input = document.createElement('input');
  input.className = 'pl-input';
  input.type = 'email';
  input.id = 'pl-email';
  input.name = 'email';
  input.placeholder = 'your@company.com';
  input.required = true;
  input.autocomplete = 'email';

  const btn = document.createElement('button');
  btn.className = 'pl-submit';
  btn.type = 'submit';
  btn.textContent = 'Send login link';

  const error = document.createElement('p');
  error.className = 'pl-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  error.textContent = 'Something went wrong. Please try again.';

  form.append(label, input, btn, error);
  return form;
}

function attachSubmitHandler(form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.querySelector('#pl-email');
    const btn = form.querySelector('.pl-submit');
    const errorEl = form.querySelector('.pl-error');
    const email = input.value.trim();

    errorEl.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Sending…';

    try {
      const resp = await fetch(MAGIC_LINK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const msg = document.createElement('p');
      msg.className = 'pl-success';
      msg.textContent = `Check your inbox — we've sent a login link to ${email}.`;
      form.replaceWith(msg);
    } catch {
      btn.disabled = false;
      btn.textContent = 'Send login link';
      errorEl.hidden = false;
    }
  });
}

export default function init(el) {
  const [row] = [...el.children];
  row.classList.add('pl-row');

  const [colAdobe, colMagic] = [...row.children];
  colAdobe.classList.add('pl-col', 'pl-col-adobe');
  colMagic.classList.add('pl-col', 'pl-col-magic');

  injectHeading(colAdobe, 'Adobe ID');
  injectHeading(colMagic, 'Magic Link');

  decorateAdobeButton(colAdobe);

  const form = createMagicForm();
  colMagic.append(form);
  attachSubmitHandler(form);
}
```

- [ ] **Step 4: Run to confirm all tests pass**

```bash
npm run test:file -- test/blocks/portal-login/portal-login.test.js
```

Expected: PASS — 15 passing

- [ ] **Step 5: Commit**

```bash
git add blocks/portal-login/portal-login.js test/blocks/portal-login/portal-login.test.js
git commit -m "feat(portal-login): add form submit handler with success and error states"
```

---

### Task 6: Mobile "or" divider

**Files:**
- Modify: `blocks/portal-login/portal-login.js`
- Modify: `test/blocks/portal-login/portal-login.test.js`

- [ ] **Step 1: Add failing test for divider injection**

Append inside `describe('portal-login', ...)`:

```js
describe('mobile divider', () => {
  let el;
  before(() => {
    el = makeBlock();
    init(el);
  });

  it('injects a .pl-divider between the two cards', () => {
    const row = el.querySelector('.pl-row');
    const divider = row.querySelector('.pl-divider');
    expect(divider).to.exist;
    expect(divider.previousElementSibling.classList.contains('pl-col-adobe')).to.be.true;
    expect(divider.nextElementSibling.classList.contains('pl-col-magic')).to.be.true;
  });

  it('divider contains the text "or"', () => {
    const divider = el.querySelector('.pl-divider');
    expect(divider.textContent.trim()).to.equal('or');
  });
});
```

- [ ] **Step 2: Run to confirm the new tests fail**

```bash
npm run test:file -- test/blocks/portal-login/portal-login.test.js
```

Expected: FAIL — `.pl-divider` not found

- [ ] **Step 3: Add `injectDivider` and call it in `init()`**

Replace `blocks/portal-login/portal-login.js` with the final version:

```js
// blocks/portal-login/portal-login.js
const MAGIC_LINK_ENDPOINT = '';

function injectHeading(col, text) {
  const h3 = document.createElement('h3');
  h3.className = 'pl-card-title';
  h3.textContent = text;
  col.prepend(h3);
}

function decorateAdobeButton(col) {
  const link = col.querySelector('strong > a');
  if (!link) return;
  link.classList.add('btn', 'btn-primary');
}

function createMagicForm() {
  const form = document.createElement('form');
  form.className = 'pl-magic-form';

  const label = document.createElement('label');
  label.className = 'pl-label';
  label.htmlFor = 'pl-email';
  label.textContent = 'Email address';

  const input = document.createElement('input');
  input.className = 'pl-input';
  input.type = 'email';
  input.id = 'pl-email';
  input.name = 'email';
  input.placeholder = 'your@company.com';
  input.required = true;
  input.autocomplete = 'email';

  const btn = document.createElement('button');
  btn.className = 'pl-submit';
  btn.type = 'submit';
  btn.textContent = 'Send login link';

  const error = document.createElement('p');
  error.className = 'pl-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  error.textContent = 'Something went wrong. Please try again.';

  form.append(label, input, btn, error);
  return form;
}

function attachSubmitHandler(form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.querySelector('#pl-email');
    const btn = form.querySelector('.pl-submit');
    const errorEl = form.querySelector('.pl-error');
    const email = input.value.trim();

    errorEl.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Sending…';

    try {
      const resp = await fetch(MAGIC_LINK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const msg = document.createElement('p');
      msg.className = 'pl-success';
      msg.textContent = `Check your inbox — we've sent a login link to ${email}.`;
      form.replaceWith(msg);
    } catch {
      btn.disabled = false;
      btn.textContent = 'Send login link';
      errorEl.hidden = false;
    }
  });
}

function injectDivider(row) {
  const divider = document.createElement('div');
  divider.className = 'pl-divider';
  const span = document.createElement('span');
  span.textContent = 'or';
  divider.append(span);
  const [colAdobe] = [...row.children];
  colAdobe.after(divider);
}

export default function init(el) {
  const [row] = [...el.children];
  row.classList.add('pl-row');

  const [colAdobe, colMagic] = [...row.children];
  colAdobe.classList.add('pl-col', 'pl-col-adobe');
  colMagic.classList.add('pl-col', 'pl-col-magic');

  injectHeading(colAdobe, 'Adobe ID');
  injectHeading(colMagic, 'Magic Link');

  decorateAdobeButton(colAdobe);

  const form = createMagicForm();
  colMagic.append(form);
  attachSubmitHandler(form);

  injectDivider(row);
}
```

- [ ] **Step 4: Run to confirm all tests pass**

```bash
npm run test:file -- test/blocks/portal-login/portal-login.test.js
```

Expected: PASS — 17 passing

- [ ] **Step 5: Commit**

```bash
git add blocks/portal-login/portal-login.js test/blocks/portal-login/portal-login.test.js
git commit -m "feat(portal-login): inject mobile 'or' divider between cards"
```

---

### Task 7: Lint and visual smoke test

**Files:** No changes expected; fix lint issues if any arise.

- [ ] **Step 1: Run the linter**

```bash
npm run lint
```

Expected: no errors. If ESLint reports issues (unused vars, trailing commas, import order), fix them in place and re-run until clean.

- [ ] **Step 2: Run all tests one final time**

```bash
npm run test:file -- test/blocks/portal-login/portal-login.test.js
```

Expected: PASS — 17 passing

- [ ] **Step 3: Start the dev server and visually verify the block**

```bash
npx -y @adobe/aem-cli up --no-open --forward-browser-logs
```

Open `http://localhost:3000/login` in a browser. Verify:
- Two cards rendered side by side on desktop (≥1000px viewport)
- Cards stack vertically with "or" divider on mobile (<1000px viewport)
- "Adobe ID" card shows text and a styled red button
- "Magic Link" card shows text, email input, and "Send login link" button
- Entering an email and submitting shows "Sending…" state
- (Form POST will fail since `MAGIC_LINK_ENDPOINT` is empty — verify the error state shows correctly)
- Light/dark mode toggle works (cards use surface tokens)

- [ ] **Step 4: Commit lint fixes if any**

```bash
# Only if lint required changes:
git add blocks/portal-login/portal-login.js blocks/portal-login/portal-login.css
git commit -m "fix(portal-login): lint corrections"
```
