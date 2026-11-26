import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { mountBoothRequest } from '../../scripts/booth-request.js';

async function boothDocument() {
  const html = await (await fetch('/booth.html')).text();
  return new DOMParser().parseFromString(html, 'text/html');
}

function fill(root, overrides = {}) {
  const values = {
    firstName: 'Jordan', lastName: 'Lee', email: 'jordan@example.com', company: 'Northstar', website: 'example.com', ...overrides,
  };
  const form = root.getElementById('request-form');
  Object.entries(values).forEach(([name, value]) => {
    form.elements[name].value = value;
    form.elements[name].dispatchEvent(new Event('input'));
  });
  form.elements.consent.checked = true;
  form.elements.consent.dispatchEvent(new Event('change'));
}

const submit = (root) => root.getElementById('request-form')
  .dispatchEvent(new Event('submit', { cancelable: true }));
const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('booth embedded report request', () => {
  let sandbox;
  beforeEach(() => { sandbox = sinon.createSandbox(); });
  afterEach(() => { sandbox.restore(); });

  it('stays disabled until every field and consent are complete, and never sends invalid details', async () => {
    const root = await boothDocument();
    const fetchStub = sandbox.stub(window, 'fetch');
    mountBoothRequest(root, { onSubmitted: sandbox.spy() });
    expect(root.getElementById('request-submit').disabled).to.equal(true);
    fill(root, { email: 'seller@adobe.com', website: 'nodot' });
    expect(root.getElementById('request-submit').disabled).to.equal(false);
    submit(root);
    await settle();
    expect(fetchStub.called).to.equal(false);
    expect(root.querySelectorAll('.request-field.is-invalid').length).to.equal(2);
  });

  it('keeps details after an unconfirmed attempt and retries with the same idempotency key', async () => {
    const root = await boothDocument();
    const onSubmitted = sandbox.spy();
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.onFirstCall().resolves(new Response('{"error":"Unavailable"}', { status: 503 }));
    fetchStub.onSecondCall().resolves(new Response('{"requestId":"r1"}', { status: 201 }));
    mountBoothRequest(root, { onSubmitted });
    fill(root);
    submit(root);
    await settle();
    await settle();
    expect(root.getElementById('request-status').textContent).to.include('will not be sent twice');
    expect(root.getElementById('request-first-name').value).to.equal('Jordan');
    submit(root);
    await settle();
    await settle();
    const [first, second] = fetchStub.getCalls().map((call) => call.args);
    expect(first[0]).to.equal('/auth/booth/request');
    expect(first[1].headers['Idempotency-Key']).to.equal(second[1].headers['Idempotency-Key']);
    expect(JSON.parse(first[1].body)).to.deep.equal({
      fullName: 'Jordan Lee',
      email: 'jordan@example.com',
      company: 'Northstar',
      website: 'example.com',
      consent: true,
    });
    expect(onSubmitted.calledOnceWith({ company: 'Northstar', website: 'example.com' })).to.equal(true);
    expect(root.getElementById('request-first-name').value).to.equal('');
  });

  it('reports sending so the booth can hold navigation, and releases it when cleared mid-send', async () => {
    const root = await boothDocument();
    const onSending = sandbox.spy();
    sandbox.stub(window, 'fetch').returns(new Promise(() => {}));
    const request = mountBoothRequest(root, { onSubmitted: sandbox.spy(), onSending });
    fill(root);
    submit(root);
    await settle();
    expect(onSending.args).to.deep.equal([[true]]);
    expect(root.getElementById('request-first-name').readOnly).to.equal(true);
    request.clear();
    expect(onSending.args).to.deep.equal([[true], [false]]);
    expect(root.getElementById('request-first-name').value).to.equal('');
  });

  it('treats edited details as a new request and ignores results after the screen is cleared', async () => {
    const root = await boothDocument();
    const onSubmitted = sandbox.spy();
    let release;
    const fetchStub = sandbox.stub(window, 'fetch');
    fetchStub.onFirstCall().resolves(new Response('{}', { status: 502 }));
    fetchStub.onSecondCall().returns(new Promise((resolve) => { release = resolve; }));
    const request = mountBoothRequest(root, { onSubmitted });
    fill(root);
    submit(root);
    await settle();
    await settle();
    fill(root, { website: 'example.org' });
    submit(root);
    await settle();
    const keys = fetchStub.getCalls().map((call) => call.args[1].headers['Idempotency-Key']);
    expect(keys[0]).to.not.equal(keys[1]);
    request.clear();
    release(new Response('{"requestId":"r2"}', { status: 201 }));
    await settle();
    await settle();
    expect(onSubmitted.called).to.equal(false);
  });
});
