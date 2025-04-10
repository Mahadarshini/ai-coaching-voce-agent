import formidable from 'formidable';
import fs from 'fs';
import axios from 'axios';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const form = new formidable.IncomingForm();

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: 'File parsing error' });

    const filePath = files.audioFile.filepath;

    try {
      const uploadRes = await axios({
        method: 'post',
        url: 'https://api.assemblyai.com/v2/upload',
        headers: {
          'authorization': process.env.ASSEMBLYAI_API_KEY,
          'transfer-encoding': 'chunked',
        },
        data: fs.createReadStream(filePath),
      });

      const audio_url = uploadRes.data.upload_url;

      const transcriptRes = await axios.post(
        'https://api.assemblyai.com/v2/transcript',
        { audio_url },
        {
          headers: {
            authorization: process.env.ASSEMBLYAI_API_KEY,
            'content-type': 'application/json',
          },
        }
      );

      res.status(200).json({ transcriptId: transcriptRes.data.id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}