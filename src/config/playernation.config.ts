import { registerAs } from '@nestjs/config';

export default registerAs('playernation', () => ({
  baseUrl: process.env.PLAYERNATION_BASE_URL || 'https://api.theplayernation.com',
  phone: process.env.PLAYERNATION_PHONE,
  password: process.env.PLAYERNATION_PASSWORD,
}));
