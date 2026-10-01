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

const iframe = '<iframe id="preview" title="Interactive Adobe Brand Visibility booth preview"></iframe>';
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
  .replace(iframe, `<iframe id="preview" title="Interactive Adobe Brand Visibility booth preview" srcdoc="${attribute}"></iframe>`)
  .replace(`${loadPreview}\n`, '')
  .replace(
    '<title>Adobe Brand Visibility | Touchscreen review</title>',
    '<title>Adobe Brand Visibility | Shareable touchscreen review</title>',
  );

const destination = process.argv[2]
  || fileURLToPath(new URL('./booth-touchscreen-shareable.html', import.meta.url));
await writeFile(destination, standalone);
console.log(destination);
