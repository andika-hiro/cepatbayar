export interface OcrItem {
  name: string;
  price: number;
}

export interface OcrResult {
  items: OcrItem[];
  taxPercent: number;
  servicePercent: number;
  total: number;
  isFallback?: boolean;
}

const MODELS_TO_TRY = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];

const RECEIPT_PROMPT = `Anda adalah OCR kecerdasan buatan serba bisa untuk membaca segala jenis struk belanja & nota di Indonesia (struk kasir thermal, nota warung, struk Indomaret/Alfamart, bill restoran, struk GoFood/GrabFood).

TUGAS UTAMA: Ekstrak daftar barang/makanan dan nominal harga ke JSON.

PANDUAN EKSTRAKSI HARGA & NOMINAL:
1. FORMAT RUPIAH: Struk di Indonesia menggunakan titik (.) sebagai pemisah ribuan (contoh: 15.000 = 15000, 150.000 = 150000). Abaikan desimal pasca koma seperti ,00. Hapus semua titik dan simbol Rp.
2. ITEM & TOTAL HARGA:
   - "name": Nama ringkas barang/makanan/minuman.
   - "price": Nominal harga TOTAL untuk baris item tersebut dalam angka bulat Rupiah (contoh: jika tertera "2 Teh Obeng @ 8.000 = 16.000", price = 16000).
   - Abaikan baris diskon atau gunakan nominal harga bersih (net).
3. PAJAK & SERVICE CHARGE:
   - "taxPercent": Persen Pajak (PB1/VAT/Tax) jika ada (misal 10). Jika pajak dalam nominal Rupiah, hitung % terhadap subtotal. Jika tidak ada = 0.
   - "servicePercent": Persen Service Charge jika ada (misal 5). Jika tidak ada = 0.
4. "total": Nominal Total Bayar akhir struk dalam Rupiah integer bulat.

BERIKAN HASIL HANYA DALAM FORMAT JSON BERIKUT (TANPA MARKDOWN KODE / TEKS LAIN):
{
  "items": [
    { "name": "Nasi Goreng", "price": 25000 }
  ],
  "taxPercent": 0,
  "servicePercent": 0,
  "total": 25000
}`;

function parseImageDataUrl(imageBase64: string): { mimeType: string; data: string } {
  const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) {
    return { mimeType: 'image/jpeg', data: imageBase64 };
  }
  return { mimeType: match[1], data: match[2] };
}

function extractJsonFromText(text: string): any {
  const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleanText);
  } catch {
    const match = cleanText.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
  }
  return null;
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
          }),
        },
      );

      if (!response.ok) {
        continue;
      }

      const body = await response.json();
      const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        continue;
      }

      const parsed = extractJsonFromText(text);
      if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
        const validItems = parsed.items
          .map((i: { name?: string; price?: number }) => ({
            name: String(i.name || '').trim(),
            price: Math.max(0, Math.round(Number(i.price) || 0)),
          }))
          .filter((i: { name: string; price: number }) => i.name.length > 0 || i.price > 0);

        if (validItems.length > 0) {
          return {
            items: validItems,
            taxPercent: Math.max(0, Number(parsed.taxPercent) || 0),
            servicePercent: Math.max(0, Number(parsed.servicePercent) || 0),
            total: Math.max(0, Math.round(Number(parsed.total) || 0)),
          };
        }
      }
    } catch {
      // Continue to next model
    }
  }

  // Graceful fallback response if all models fail to parse thermal/unusual receipts
  return {
    items: [{ name: '', price: 0 }],
    taxPercent: 0,
    servicePercent: 0,
    total: 0,
    isFallback: true,
  };
}
