import express from 'express';
import { Logger, SecureStorage } from '@mondaycom/apps-sdk';

const app = express();
const port = 8080;

app.get('/health', (req, res) => {
  res.status(200).send({ 'status': 'OK' });
});

app.get('/deep-health', async (req, res) => {
  const { randomWord } = req.query;
  const secure = new SecureStorage();
  const logger = new Logger('test-logger');

  try {
    logger.info(`This is a logger info. the random word is: ${randomWord}`);

    const key = Date.now() + '';
    const value = 'test';

    await secure.set(key, value);
    const result = await secure.get(key);
    const deleted = await secure.delete(key);
    const result2 = await secure.get(key);

    if (!(result === value && deleted && !result2)) {
      throw new Error('Secure storage assertion failed');
    }

    logger.debug(`Deep health finished successfully`);
    res.status(200).send({ 'status': 'OK', randomWord });

  } catch (error) {
    logger.error(`Deep health failed: ${error}`);
    res.status(500).send({ 'status': 'FAILED' });
  }
});

app.get('/topic-name', (req, res) => {
  const name = process.env.MNDY_TOPIC_NAME || 'process.env.MNDY_TOPIC_NAME not found';
  res.status(200).send({ 'status': 'OK', name, new_draft_version_deploy: true });
});

app.get('/env-var', (req, res) => {
  const envVarValue = process.env.MY_VAR || 'process.env.MY_VAR not found';
  res.status(200).send({ 'status': 'OK', envVarValue });
});

app.listen(port, () => console.log(`monday code tester app listening at http://localhost:${port}`));

