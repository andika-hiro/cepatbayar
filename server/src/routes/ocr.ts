import { Router } from 'express';
import { scanReceipt } from '../lib/visionOcr';

const router = Router();

// POST /api/ocr/scan
router.post('/scan', async (req, res) => {
  const { imageBase64 } = req.body;
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return res.status(400).json({ error: 'imageBase64 string is required' });
  }

  const result = await scanReceipt(imageBase64);
  res.json(result);
});

export default router;
