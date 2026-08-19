const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the root directory
app.use(express.static(__dirname));

// Serve a page with .env-driven contact details injected (single source of truth = .env)
function sendPage(res, file) {
  fs.readFile(path.join(__dirname, file), 'utf8', (err, html) => {
    if (err) return res.status(500).send('Error loading page');
    html = html
      .split('__QS_WHATSAPP__').join(process.env.WHATSAPP_NUMBER || '')
      .split('__QS_EMAIL__').join(process.env.TARGET_EMAIL || '')
      .split('__QS_LINKEDIN__').join(process.env.LINKEDIN_URL || '');
    res.type('html').send(html);
  });
}

// Page routes (new PRISM site)
app.get('/', (req, res) => sendPage(res, 'landing.html'));
app.get('/blog', (req, res) => res.sendFile(path.join(__dirname, 'blog.html')));
app.get('/blog-post', (req, res) => res.sendFile(path.join(__dirname, 'blog-post.html')));
app.get(/^\/blog\/([A-Za-z0-9-]+)\/?$/, (req, res) => {
  const slug = String(req.params[0]).replace(/[^a-z0-9-]/gi, '');
  res.sendFile(path.join(__dirname, 'blog-' + slug + '.html'), (err) => { if (err) res.redirect('/blog'); });
});

// Expose configuration securely to frontend
app.get('/config.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`window.QS_CONFIG = { 
    EMAIL: "${process.env.TARGET_EMAIL || ''}",
    WHATSAPP_NUMBER: "${process.env.WHATSAPP_NUMBER || ''}",
    COMPANY_NAME: "${process.env.COMPANY_NAME || 'QUANTSOFT'}",
    LINKEDIN_URL: "${process.env.LINKEDIN_URL || ''}",
    LINKEDIN_HANDLE: "${process.env.LINKEDIN_HANDLE || ''}",
    PRISM_APP_URL: "${process.env.PRISM_APP_URL || ''}",
    LOCATION_MAIN: "${process.env.LOCATION_MAIN || ''}",
    LOCATION_SEC: "${process.env.LOCATION_SEC || ''}",
    COPYRIGHT_YEAR: "${process.env.COPYRIGHT_YEAR || '2026'}",
    COPYRIGHT_DOMAIN: "${process.env.COPYRIGHT_DOMAIN || ''}"
  };`);
});

// Configure Nodemailer
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Endpoint to handle form submissions
app.post('/api/contact', async (req, res) => {
  try {
    const { source, name, email, role, msg } = req.body;

    const mailOptions = {
      from: `"${name || 'Quantsoft Website'}" <${process.env.SMTP_USER}>`,
      replyTo: email || process.env.SMTP_USER,
      to: process.env.TARGET_EMAIL,
      subject: `New Inquiry via Quantsoft Website: ${source}`,
      html: `
        <h2>New Form Submission</h2>
        <p><strong>Form Source:</strong> ${source}</p>
        <p><strong>Name:</strong> ${name || 'N/A'}</p>
        <p><strong>Email:</strong> ${email || 'N/A'}</p>
        <p><strong>Company/Role:</strong> ${role || 'N/A'}</p>
        <br/>
        <h3>Message:</h3>
        <p style="white-space: pre-wrap; background: #f4f4f4; padding: 15px; border-radius: 5px;">${msg || 'No message provided.'}</p>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent: ' + info.response);
    res.status(200).json({ success: true, message: 'Message sent successfully.' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ success: false, message: 'Failed to send message.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
