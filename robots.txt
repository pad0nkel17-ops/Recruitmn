import axios from 'axios';

export default async (req: any, res: any) => {
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
};
