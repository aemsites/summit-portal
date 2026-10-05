import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const readLocal = (path) => readFile(new URL(path, import.meta.url));
const [review, preview, adobeLogo, semrushLogo] = await Promise.all([
  readLocal('./touchscreen-review.html'),
  readLocal('./booth-preview.html'),
  readLocal('../../../../img/icons/adobe-logo.svg'),
  readLocal('../../../../img/icons/semrush-logo.png'),
]);

const embed = (html, source, mime, asset) => {
  if (!html.includes(source)) throw new Error(`Missing expected asset: ${source}`);
  return html.replaceAll(source, `data:${mime};base64,${asset.toString('base64')}`);
};

let standalonePreview = embed(
  preview.toString(),
  '../../../../img/icons/adobe-logo.svg',
  'image/svg+xml',
  adobeLogo,
);
standalonePreview = embed(
  standalonePreview,
  '../../../../img/icons/semrush-logo.png',
  'image/png',
  semrushLogo,
);

const iframe = '<iframe id="preview" title="Interactive Digital Opportunity Report booth preview"></iframe>';
// Match the reviewer's template source literally, without evaluating it.
// eslint-disable-next-line no-template-curly-in-string
const loadPreview = '    preview.src = `./booth-preview.html?review=${Date.now()}`;';
const reviewer = review.toString();
if (!reviewer.includes(iframe) || !reviewer.includes(loadPreview)) {
  throw new Error('Touchscreen reviewer structure changed; update the export before sharing.');
}

const attribute = standalonePreview
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');
const standalone = reviewer
  .replace(iframe, `<iframe id="preview" title="Interactive Digital Opportunity Report booth preview" srcdoc="${attribute}"></iframe>`)
  .replace(`${loadPreview}\n`, '')
  .replace(
    '<title>Digital Opportunity Report | Touchscreen review</title>',
    '<title>Digital Opportunity Report | Shareable touchscreen review</title>',
  );

const destination = process.argv[2]
  || fileURLToPath(new URL('./booth-touchscreen-shareable.html', import.meta.url));
await writeFile(destination, standalone);
process.stdout.write(`${destination}\n`);
