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

app.get('/', (req, res) => {
  res.json({alive: true, message: 'PDF service is running'});
});

app.post('/pdf', async (req, res) => {
  const { html, filename } = req.body;
  if (!html) return res.status(400).json({ error: 'Missing html' });

  let browser;
  try {
    const chromePath = executablePath();
    console.log('Puppeteer Chrome executablePath:', chromePath);
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: chromePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' },
      preferCSSPageSize: true,
    });
    await browser.close();
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename || 'document'}.pdf"`
    });
    res.send(pdfBuffer);
  } catch (err) {
    if (browser) await browser.close();
    console.error('Error generating PDF:', err);
    res.status(500).json({
      error: err.message,
      chromePath: (typeof executablePath === 'function') ? executablePath() : undefined,
      env: process.env.PUPPETEER_CACHE_DIR,
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('PDF service running on port', PORT));
