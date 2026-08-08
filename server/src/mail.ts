import nodemailer from 'nodemailer';

export async function sendMagicLinkEmail(to: string, link: string): Promise<void> {
  if (!process.env.SMTP_HOST) {
    console.log(`[dev] Magic link for ${to}: ${link}`);
    return;
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to,
    subject: 'Link masuk Cepatkan Bayar',
    text: `Klik link ini buat masuk: ${link}\n\nLink ini berlaku 15 menit.`,
  });
}
