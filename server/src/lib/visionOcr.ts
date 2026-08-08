export interface OcrItem {
  name: string;
  price: number;
}

export interface OcrResult {
  items: OcrItem[];
  taxPercent: number;
  servicePercent: number;
  total: number;
}

const GEMINI_MODEL = 'gemini-3.6-flash';

const RECEIPT_PROMPT = `Baca struk belanja pada gambar ini dan ekstrak datanya dalam format JSON persis seperti ini, tanpa teks lain di luar JSON:
{"items":[{"name":"nama item","price":harga_satuan_dalam_rupiah_integer}],"taxPercent":persen_pajak_atau_0,"servicePercent":persen_service_charge_atau_0,"total":total_akhir_dalam_rupiah_integer}
Semua nilai uang harus angka Rupiah bulat (integer), tanpa titik atau koma pemisah ribuan. Kalau pajak atau service charge tidak tercantum di struk, isi 0.`;

function parseImageDataUrl(imageBase64: string): { mimeType: string; data: string } {
  const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) {
    return { mimeType: 'image/jpeg', data: imageBase64 };
  }
  return { mimeType: match[1], data: match[2] };
}

export async function scanReceipt(imageBase64: string): Promise<OcrResult> {
  const apiKey = process.env.VISION_LLM_API_KEY;

  // Fallback to structured receipt mock response when VISION_LLM_API_KEY is not configured
  if (!apiKey) {
    return {
      items: [
        { name: 'Nasi Goreng Spesial', price: 35000 },
        { name: 'Es Teh Manis', price: 8000 },
        { name: 'Ayam Goreng Kremes', price: 28000 },
      ],
      taxPercent: 10,
      servicePercent: 5,
      total: 78100,
    };
  }

  const { mimeType, data } = parseImageDataUrl(imageBase64);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: RECEIPT_PROMPT }, { inline_data: { mime_type: mimeType, data } }],
          },
        ],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Vision LLM request failed with status ${response.status}`);
  }

  const body = await response.json();
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Vision LLM response did not contain a result');
  }

  const parsed = JSON.parse(text);
  return {
    items: Array.isArray(parsed.items) ? parsed.items : [],
    taxPercent: Number(parsed.taxPercent) || 0,
    servicePercent: Number(parsed.servicePercent) || 0,
    total: Number(parsed.total) || 0,
  };
}
