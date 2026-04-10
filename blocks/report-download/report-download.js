/**
 * Report Download block
 *
 * Authoring structure (single row, two cells):
 *   Cell 1: Bold heading paragraph | description paragraph(s)
 *   Cell 2: Link (report title + download href) | metadata paragraphs (date, pages, …)
 */
export default function init(el) {
  const row = el.querySelector(':scope > div');
  if (!row) return;

  const [leftCell, rightCell] = [...row.children];

  // --- Left column: heading + description ---
  const left = document.createElement('div');
  left.className = 'rd-left';

  if (leftCell) {
    [...leftCell.children].forEach((child) => {
      if (child.tagName === 'P') {
        const strong = child.querySelector('strong');
        if (strong && child.textContent.trim() === strong.textContent.trim()) {
          // Bold-only paragraph → section heading
          const heading = document.createElement('h2');
          heading.className = 'rd-heading';
          heading.textContent = strong.textContent.trim();
          left.append(heading);
          return;
        }
        const desc = document.createElement('p');
        desc.className = 'rd-desc';
        desc.innerHTML = child.innerHTML;
        left.append(desc);
        return;
      }
      left.append(child);
    });
  }

  // --- Right column: PDF card ---
  const right = document.createElement('div');
  right.className = 'rd-right';

  let downloadHref = '#';
  let cardTitle = '';
  const metaItems = [];

  if (rightCell) {
    rightCell.querySelectorAll(':scope p').forEach((p) => {
      const anchor = p.querySelector('a');
      if (anchor && !cardTitle) {
        // First link → card title + download URL
        cardTitle = anchor.textContent.trim();
        downloadHref = anchor.href || '#';
      } else {
        const text = p.textContent.trim();
        if (text) metaItems.push(text);
      }
    });
  }

  // --- CTA button + metadata row below description ---
  const ctaRow = document.createElement('div');
  ctaRow.className = 'rd-cta-row';

  const ctaBtn = document.createElement('a');
  ctaBtn.className = 'rd-cta-btn';
  ctaBtn.href = downloadHref;
  ctaBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M13.53 9.427c-.292-.292-.766-.294-1.06 0l-1.717 1.714V2.75c0-.414-.336-.75-.75-.75s-.75.336-.75.75v8.4L7.53 9.426c-.293-.293-.767-.293-1.06 0s-.293.767 0 1.06l2.998 2.998c.146.147.338.22.53.22.191 0 .384-.073.53-.22l3.002-2.998c.293-.292.293-.767 0-1.06"/><path fill="currentColor" d="M15.75 18H4.25C3.01 18 2 16.99 2 15.75v-2.021c0-.415.336-.75.75-.75s.75.335.75.75v2.021c0 .413.337.75.75.75h11.5c.413 0 .75-.337.75-.75v-2.021c0-.415.336-.75.75-.75s.75.335.75.75v2.021c0 1.24-1.01 2.25-2.25 2.25"/></svg> Download full report';
  ctaRow.append(ctaBtn);

  if (metaItems.length) {
    const clockIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M10 18.75c-4.825 0-8.75-3.925-8.75-8.75S5.175 1.25 10 1.25s8.75 3.925 8.75 8.75-3.925 8.75-8.75 8.75m0-16c-3.998 0-7.25 3.252-7.25 7.25s3.252 7.25 7.25 7.25 7.25-3.252 7.25-7.25S13.998 2.75 10 2.75"/><path fill="currentColor" d="M13.249 12.645c-.129 0-.26-.034-.379-.104l-3.22-1.895c-.23-.134-.37-.38-.37-.646V5c0-.414.335-.75.75-.75s.75.336.75.75v4.571l2.85 1.677c.357.21.476.67.266 1.026-.14.239-.39.37-.647.37"/></svg>';
    const docIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="m16.34 5.296-3.62-3.622c-.42-.42-1-.66-1.591-.66H5.25C4.01 1.015 3 2.025 3 3.265v12.484c0 1.24 1.01 2.25 2.25 2.25h9.5c1.24 0 2.25-1.01 2.25-2.25V6.887c0-.6-.234-1.166-.66-1.591m-1.06 1.06c.046.047.074.104.106.159H12.25c-.413 0-.75-.337-.75-.75V2.628c.055.033.114.06.16.106zm-.53 10.142h-9.5c-.413 0-.75-.337-.75-.75V3.265c0-.413.337-.75.75-.75H10v3.25c0 1.24 1.01 2.25 2.25 2.25h3.25v7.733c0 .413-.337.75-.75.75"/><path fill="currentColor" d="M13 11.498H7c-.414 0-.75-.336-.75-.75s.336-.75.75-.75h6c.414 0 .75.336.75.75s-.336.75-.75.75M13 14.498H7c-.414 0-.75-.336-.75-.75s.336-.75.75-.75h6c.414 0 .75.336.75.75s-.336.75-.75.75"/></svg>';
    const metaRow = document.createElement('div');
    metaRow.className = 'rd-meta-row';
    metaItems.forEach((item) => {
      const span = document.createElement('span');
      span.className = 'rd-meta-item';
      const lower = item.toLowerCase();
      const icon = lower.includes('update') || lower.includes('date') ? clockIcon : docIcon;
      span.innerHTML = `${icon} ${item}`;
      metaRow.append(span);
    });
    ctaRow.append(metaRow);
  }

  left.append(ctaRow);

  // --- Right column: PDF card ---
  const card = document.createElement('div');
  card.className = 'rd-pdf-card';

  const adobeLogo = document.createElement('span');
  adobeLogo.className = 'rd-pdf-logo';
  adobeLogo.innerHTML = '<svg width="19" height="18" viewBox="0 0 19 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M18.4902 17.185H14.6254C14.4574 17.1881 14.2924 17.1409 14.1513 17.0493C14.0101 16.9577 13.8992 16.826 13.8327 16.6708L9.63697 6.79793C9.62602 6.75949 9.60305 6.72563 9.57147 6.70136C9.53989 6.67709 9.50139 6.6637 9.46166 6.66318C9.42193 6.66266 9.38309 6.67503 9.35089 6.69847C9.3187 6.7219 9.29486 6.75515 9.28292 6.79329L6.66816 13.0618C6.65397 13.0957 6.64833 13.1326 6.65175 13.1692C6.65517 13.2059 6.66754 13.2411 6.68776 13.2717C6.70799 13.3024 6.73543 13.3275 6.76764 13.3449C6.79986 13.3623 6.83585 13.3714 6.87242 13.3714H9.74656C9.83363 13.3714 9.91877 13.3972 9.99135 13.4456C10.0639 13.494 10.1208 13.5628 10.1547 13.6435L11.4131 16.4617C11.4464 16.5407 11.4598 16.6269 11.452 16.7124C11.4442 16.798 11.4154 16.8802 11.3683 16.9519C11.3212 17.0235 11.2572 17.0823 11.1821 17.123C11.1069 17.1637 11.0229 17.185 10.9375 17.185H0.474181C0.395482 17.1846 0.318122 17.1645 0.248995 17.1267C0.179869 17.0888 0.121124 17.0343 0.077997 16.9681C0.0348704 16.9018 0.00870212 16.8259 0.00182488 16.747C-0.00505236 16.6681 0.007575 16.5887 0.0385815 16.5159L6.69405 0.565464C6.76207 0.396646 6.87909 0.25239 7.02983 0.151529C7.18056 0.0506675 7.35802 -0.00211258 7.53902 7.93067e-05H11.3777C11.5588 -0.00233345 11.7363 0.0503568 11.8871 0.151245C12.0379 0.252134 12.1549 0.396513 12.2228 0.565464L18.9243 16.5159C18.9553 16.5886 18.968 16.6678 18.9612 16.7466C18.9544 16.8254 18.9284 16.9013 18.8854 16.9675C18.8424 17.0337 18.7839 17.0882 18.7149 17.1262C18.646 17.1642 18.5688 17.1844 18.4902 17.185Z" fill="white"/></svg>';
  card.append(adobeLogo);

  const titleEl = document.createElement('h3');
  titleEl.className = 'rd-pdf-title';
  titleEl.textContent = cardTitle;
  card.append(titleEl);

  const tagEl = document.createElement('a');
  tagEl.className = 'rd-pdf-tag';
  tagEl.href = downloadHref;
  tagEl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M9.80126 5.73413C9.80126 5.44592 9.73888 5.10156 9.4533 5.10156C9.34245 5.10718 9.24303 5.17138 9.1925 5.27014C8.95867 6.09204 9.04235 6.97168 9.42688 7.73486C9.63733 7.08679 9.76311 6.4143 9.80126 5.73413Z" fill="currentColor"/><path d="M5.01754 14.4251C4.99618 14.5288 5.03457 14.6359 5.11703 14.7024C5.16995 14.75 5.23953 14.7749 5.31063 14.7717C5.74471 14.7717 6.48739 14.0039 7.24203 12.7891C5.95993 13.3618 5.10031 13.9897 5.01754 14.4251Z" fill="currentColor"/><path d="M9.87512 9.71095C9.75549 10.0385 9.62518 10.3734 9.48651 10.7083C9.38129 10.9617 9.26044 11.2284 9.12891 11.4974C9.37641 11.4221 9.62409 11.3514 9.86798 11.2869C10.2075 11.1974 10.5424 11.1184 10.8665 11.0502L10.893 11.0439C10.6459 10.7729 10.4146 10.488 10.2003 10.1904C10.089 10.0361 9.98065 9.87623 9.87512 9.71095Z" fill="currentColor"/><path d="M14.1124 11.3713C13.8458 11.3256 13.5756 11.3048 13.3051 11.3092C12.8996 11.31 12.4947 11.3413 12.0938 11.4025C12.5718 11.7959 13.1309 12.0788 13.7308 12.2312C13.8154 12.2524 13.9022 12.2631 13.9893 12.2636C14.2953 12.2636 14.519 12.1235 14.5608 11.9071C14.629 11.5555 14.3552 11.4216 14.1124 11.3713Z" fill="currentColor"/><path d="M15.7861 0.96875H4.27637C2.48413 0.96875 1.03125 2.42163 1.03125 4.21387V15.7236C1.03125 17.5159 2.48413 18.9688 4.27637 18.9688H15.7861C17.5784 18.9688 19.0313 17.5159 19.0313 15.7236V4.21387C19.0313 2.42163 17.5784 0.96875 15.7861 0.96875ZM15.8077 12.3623C15.5701 12.9121 14.9935 13.2344 14.4009 13.1484C13.2883 13.1045 12.2276 12.6665 11.4082 11.9126C11.0006 11.9888 10.5656 12.0879 10.1129 12.2075C9.69378 12.3184 9.27355 12.4443 8.86212 12.582C7.69372 14.6289 6.57367 15.6665 5.5321 15.6665C5.17059 15.6753 4.81909 15.5474 4.54827 15.3076C4.26018 15.0459 4.12871 14.6538 4.2011 14.2715C4.40105 13.2036 6.2138 12.3047 7.34099 11.8428C7.62535 11.3193 7.88237 10.7817 8.11113 10.2319C8.37645 9.59472 8.59782 9.0122 8.80382 8.40625C8.20226 7.31885 8.0833 6.02979 8.47588 4.85059C8.68187 4.49805 9.05681 4.27832 9.4652 4.27051C10.3732 4.27051 10.9599 5.03613 10.9599 6.22071C10.9185 7.11378 10.749 7.9961 10.4567 8.84132C10.6144 9.11085 10.788 9.37696 10.9742 9.63478C11.2213 9.98097 11.4955 10.3067 11.7944 10.6094C13.656 10.336 14.9848 10.5166 15.5742 11.1494C15.8705 11.4795 15.9603 11.9458 15.8077 12.3623Z" fill="currentColor"/></svg> Full PDF report';
  card.append(tagEl);

  right.append(card);

  el.textContent = '';
  el.append(left, right);
}
