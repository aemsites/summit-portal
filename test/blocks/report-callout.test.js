import { expect } from '@esm-bundle/chai';
import init from '../../blocks/report-callout/report-callout.js';

describe('report-callout', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('builds the public request announcement with distinct actions', () => {
    const block = document.createElement('div');
    block.className = 'report-callout report-requests';
    block.innerHTML = `
      <div>
        <div><p>New · Public report requests</p></div>
        <div>
          <h2>Customers can now request a Digital Opportunity Report online.</h2>
          <p>Share the public form with customers—no Adobe sign-in required. When a customer appears in the request list, generate their report in <a href="https://digital-insights.corp.adobe.com/" target="_blank" rel="noreferrer">Digital Insights</a>, then use this dashboard to send the customer their magic link.</p>
        </div>
        <div>
          <p><a href="/adobe/report-requests">Open report requests</a></p>
          <p><a href="/request-report">View public request form</a></p>
        </div>
      </div>
    `;
    document.body.append(block);

    init(block);

    const announcement = block.querySelector('.rcl-bar-report-requests');
    const actions = [...announcement.querySelectorAll('.rcl-announcement-action')];
    expect(announcement.tagName).to.equal('ASIDE');
    expect(announcement.querySelector('h2').textContent)
      .to.equal('Customers can now request a Digital Opportunity Report online.');
    expect(actions.map((action) => action.textContent))
      .to.deep.equal(['Open report requests', 'View public request form']);
    expect(actions[0].classList.contains('rcl-announcement-action-primary')).to.equal(true);
    expect(actions[0].getAttribute('href')).to.equal('/adobe/report-requests');
    expect(actions[1].getAttribute('href')).to.equal('/request-report');
    const digitalInsightsLink = announcement.querySelector('.rcl-announcement-copy a');
    expect(digitalInsightsLink.getAttribute('href'))
      .to.equal('https://digital-insights.corp.adobe.com/');
    expect(digitalInsightsLink.getAttribute('target')).to.equal('_blank');
  });

  it('preserves the compact default callout treatment', () => {
    const block = document.createElement('div');
    block.className = 'report-callout neutral';
    block.innerHTML = `
      <div>
        <div><p>Info</p></div>
        <div><p><strong>Existing notice:</strong> supporting copy.</p></div>
      </div>
    `;
    document.body.append(block);

    init(block);

    expect(block.querySelector('.rcl-bar-report-requests')).to.equal(null);
    expect(block.querySelector('.rcl-icon').textContent).to.equal('Info');
    expect(block.querySelector('.rcl-text').textContent)
      .to.equal('Existing notice: supporting copy.');
  });
});
