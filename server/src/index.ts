import 'dotenv/config';
import { createApp } from './app';

const app = createApp();
const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
