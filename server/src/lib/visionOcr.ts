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

const MODELS_TO_TRY = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];

const RECEIPT_PROMPT = `Anda adalah sistem OCR khusus membaca struk/nota belanja di Indonesia.
Tugas Anda: Analisis foto struk ini dan ekstrak data barang dan nominal rupiah secara SANGAT AKURAT.

Aturan Penting Ekstraksi Nominal Rupiah:
1. Setiap nominal angka di Indonesia menggunakan titik sebagai pemisah ribuan (misal 15.000 = 15000, 120.500 = 120500). Hapus semua titik pemisah ribuan dan abaikan desimal 00 di belakang koma.
2. Untuk setiap baris barang/makanan/minuman:
   - "name": Nama item makanan/minuman/barang.
   - "price": Nominal TOTAL harga untuk baris item tersebut dalam Rupiah (integer positif tanpa titik/koma). Jika ada qty > 1 (misal "2 x Nasi Goreng @ 15.000 = 30.000"), gunakan total harga baris (30000).
3. "taxPercent": Persentase Pajak (PB1 / VAT / Tax) jika ada di struk dalam angka bulat (misal 10 untuk 10%). Jika pajak dalam rupiah (misal Rp 5.000 dari subtotal Rp 50.000), hitung persentasenya (10). Jika tidak ada, isi 0.
4. "servicePercent": Persentase Service Charge / Layanan jika ada (misal 5 untuk 5%). Jika tidak ada, isi 0.
5. "total": Nominal TOTAL AKHIR bayar yang tertera paling bawah di struk (dalam Rupiah integer bulat).

Format output HARUS JSON murni tanpa markdown/penjelasan lain:
{
  "items": [
    { "name": "Nasi Goreng Spesial", "price": 35000 },
    { "name": "Es Teh Manis", "price": 8000 }
  ],
  "taxPercent": 10,
  "servicePercent": 5,
  "total": 47300
}`;

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

  let lastError: Error | null = null;
  for (const model of MODELS_TO_TRY) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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
        lastError = new Error(`Vision LLM (${model}) request failed with status ${response.status}`);
        continue;
      }

      const body = await response.json();
      const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        lastError = new Error(`Vision LLM (${model}) response did not contain a result`);
        continue;
      }

      const cleanJsonStr = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJsonStr);
      return {
        items: Array.isArray(parsed.items)
          ? parsed.items.map((i: { name?: string; price?: number }) => ({
              name: String(i.name || '').trim(),
              price: Math.max(0, Math.round(Number(i.price) || 0)),
            }))
          : [],
        taxPercent: Math.max(0, Number(parsed.taxPercent) || 0),
        servicePercent: Math.max(0, Number(parsed.servicePercent) || 0),
        total: Math.max(0, Math.round(Number(parsed.total) || 0)),
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error('Vision LLM scan failed for all models');
}
