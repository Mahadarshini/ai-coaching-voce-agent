import axios from 'axios';

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) return res.status(400).json({ error: 'Transcript ID is required' });

  try {
    const result = await axios.get(`https://api.assemblyai.com/v2/transcript/${id}`, {
      headers: {
        authorization: process.env.ASSEMBLYAI_API_KEY,
      },
    });

    res.status(200).json(result.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
