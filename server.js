import 'dotenv/config';
import app from './src/app.js';

const port = Number(process.env.PORT || 3000);

app.listen(port, () => console.info(`Application running at port ${port}`));

