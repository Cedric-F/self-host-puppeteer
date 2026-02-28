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

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' },
      preferCSSPageSize: true,
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename || 'document'}.pdf"`,
      'Cache-Control': 'no-store',
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Error generating PDF:', err);

    // Si Chromium a crash, on ferme et on force une relance au prochain appel
    await safeCloseBrowser();

    res.status(500).json({
      error: err.message,
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