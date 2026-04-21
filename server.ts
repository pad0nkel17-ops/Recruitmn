import express from 'express';
import axios from 'axios';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const router = express.Router();

// Jotform Proxy Routes
router.get('/jotform-forms', async (req, res) => {
  try {
    const apiKey = process.env.JOTFORM_API_KEY;
    if (!apiKey) return res.json({ content: [] });
    
    let response;
    try {
      response = await axios.get('https://eu-api.jotform.com/user/forms', { params: { apiKey, limit: 100 } });
    } catch (e) {
      response = await axios.get('https://api.jotform.com/user/forms', { params: { apiKey, limit: 100 } });
    }
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch forms' });
  }
});

router.get('/jotform-submissions', async (req, res) => {
  try {
    const { formId } = req.query;
    const apiKey = process.env.JOTFORM_API_KEY;
    if (!formId || !apiKey) return res.status(400).json({ error: 'Data missing' });
    
    let response;
    try {
      response = await axios.get(`https://eu-api.jotform.com/form/${formId}/submissions`, { 
        params: { apiKey, limit: 1000 } 
      });
    } catch (e) {
      response = await axios.get(`https://api.jotform.com/form/${formId}/submissions`, { 
        params: { apiKey, limit: 1000 } 
      });
    }
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

app.use(express.json());
app.use('/api', router);

// Vite middleware for development
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
  app.listen(3000, '0.0.0.0', () => console.log('Dev server: http://localhost:3000'));
} else if (!process.env.VERCEL) {
  const dist = path.join(process.cwd(), 'dist');
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

export const appPromise = Promise.resolve(app);
export default app;
