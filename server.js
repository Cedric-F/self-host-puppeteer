const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const puppeteer = require('puppeteer');
const { executablePath } = require('puppeteer');

const app = express();
app.use(cors());
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json({ limit: '5mb' }));

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      executablePath: executablePath(),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process',
      ],
    });
  }

  try {
    return await browserPromise;
  } catch (e) {
    browserPromise = null;
    throw e;
  }
}

async function safeCloseBrowser() {
  if (!browserPromise) return;
  try {
    const b = await browserPromise;
    await b.close();
  } catch (_) {
    // ignore
  } finally {
    browserPromise = null;
  }
}

app.get('/', (req, res) => {
  res.json({ alive: true, message: 'PDF service is running' });
});

app.post('/pdf', async (req, res) => {
  const { html, filename } = req.body;
  if (!html) return res.status(400).json({ error: 'Missing html' });

  let page;
  try {
    const chromePath = executablePath();
    console.log('Puppeteer Chrome executablePath:', chromePath);

    const browser = await getBrowser();

    page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 90000 });

    const pdfData = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' },
      preferCSSPageSize: true,
    });

    // Important: forcer un Buffer (évite la sérialisation JSON d’un Uint8Array)
    const pdfBuffer = Buffer.isBuffer(pdfData) ? pdfData : Buffer.from(pdfData);

    res.status(200);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename || 'document'}.pdf"`,
      'Content-Length': String(pdfBuffer.length),
      'Cache-Control': 'no-store',
    });

    // Important: envoyer en binaire
    res.end(pdfBuffer);
  } catch (err) {
    console.error('Error generating PDF:', err);

    await safeCloseBrowser();

    res.status(500).json({
      error: err && err.message ? err.message : String(err),
      chromePath: typeof executablePath === 'function' ? executablePath() : undefined,
      puppeteerCacheDir: process.env.PUPPETEER_CACHE_DIR,
    });
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (_) {
        // ignore
      }
    }
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('PDF service running on port', PORT));