/**
 * Local synthetic supplier server for testing the feed importer / paste-a-
 * link extractor without ever needing a real third-party URL. Run with:
 *
 *   npm run fixture:supplier
 *
 * Then in /admin/products:
 *   - Import from feed: http://127.0.0.1:4100/wp-json/wc/store/v1/products
 *   - Paste a product URL, e.g. http://127.0.0.1:4100/product/lavender-bar-soap/,
 *     into "Fetch & prefill" to test the extractor.
 *
 * All data below is invented — generic wellness/household items, nothing
 * modeled on a real store.
 */
import http from 'node:http';

const PORT = 4100;

// Tiny 1x1 solid-color PNGs, self-contained (no external image files).
const IMAGES = {
  red: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  ),
  green: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==',
    'base64',
  ),
  blue: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
};

const PRODUCTS = [
  {
    id: 1,
    slug: 'lavender-bar-soap',
    name: 'Lavender Bar Soap',
    description: '<p>Cold-processed bar soap with lavender essential oil.</p>',
    price: '699',
    image: 'red',
    inStock: true,
  },
  {
    id: 2,
    slug: 'vitamin-c-serum',
    name: 'Vitamin C Serum',
    description: '<p>Brightening facial serum.</p><p>10% vitamin C.</p>',
    price: '1899',
    image: 'green',
    inStock: true,
  },
  {
    id: 3,
    slug: 'chamomile-tea-bags',
    name: 'Chamomile Tea Bags (20ct)',
    description: '<p>Caffeine-free herbal tea.</p>',
    price: '549',
    image: 'blue',
    inStock: false,
  },
  {
    id: 4,
    slug: 'bamboo-toothbrush',
    name: 'Bamboo Toothbrush (4-pack)',
    description: '<p>Biodegradable handles, soft bristles.</p>',
    price: '1299',
    image: 'red',
    inStock: true,
  },
  {
    id: 5,
    slug: 'eucalyptus-bath-salts',
    name: 'Eucalyptus Bath Salts',
    description: '<p>Epsom salt soak with eucalyptus oil.</p>',
    price: '999',
    image: 'green',
    inStock: true,
  },
];

function toStoreApiProduct(p) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    permalink: `http://127.0.0.1:${PORT}/product/${p.slug}/`,
    prices: { price: p.price, currency_code: 'USD' },
    images: [{ src: `http://127.0.0.1:${PORT}/images/${p.image}.png` }],
    is_in_stock: p.inStock,
  };
}

function productPageHtml(p) {
  const priceDollars = (Number(p.price) / 100).toFixed(2);
  return `<!doctype html>
<html><body>
<div class="product${p.inStock ? '' : ' outofstock'}">
  <h1 class="product_title">${p.name}</h1>
  <div class="summary">
    <span class="price"><span class="woocommerce-Price-amount">$${priceDollars}</span></span>
  </div>
  <div class="woocommerce-product-gallery__image">
    <img src="http://127.0.0.1:${PORT}/images/${p.image}.png" />
  </div>
</div>
</body></html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname === '/robots.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('User-agent: *\nAllow: /\n');
    return;
  }

  if (url.pathname === '/wp-json/wc/store/v1/products') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(PRODUCTS.map(toStoreApiProduct)));
    return;
  }

  const productMatch = url.pathname.match(/^\/product\/([^/]+)\/?$/);
  if (productMatch) {
    const product = PRODUCTS.find((p) => p.slug === productMatch[1]);
    if (!product) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(productPageHtml(product));
    return;
  }

  const imageMatch = url.pathname.match(/^\/images\/(red|green|blue)\.png$/);
  if (imageMatch) {
    const bytes = IMAGES[imageMatch[1]];
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': bytes.length });
    res.end(bytes);
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`Fixture supplier server running at http://127.0.0.1:${PORT}`);
  console.log(`  Feed URL:    http://127.0.0.1:${PORT}/wp-json/wc/store/v1/products`);
  console.log(`  Product URL: http://127.0.0.1:${PORT}/product/lavender-bar-soap/`);
});
