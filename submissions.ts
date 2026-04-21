import axios from 'axios';

export default async (req: any, res: any) => {
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
};
