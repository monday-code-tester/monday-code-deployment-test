import express from 'express';
import { Logger, SecureStorage, EnvironmentVariablesManager} from '@mondaycom/apps-sdk';

const secretManager = new EnvironmentVariablesManager({updateProcessEnv: true});
const logger = new Logger('test-logger');

const app = express();
const port = 8080;

app.get('/', (req, res) => {
  logger.info(`hello from info`);
  logger.error(`hello from error`);
  logger.error(`hello from error WITH error string`, { error: 'error string' });
  logger.error(`hello from error WITH error object`, { error: new Error('error class instance') });
  logger.warn(`hello from warn`);
  logger.debug(`hello from debug`);

  const secrets = new SecretsManager();
  let secretsObject = {};
  for (const key of secrets.getKeys()) {
    secretsObject[key] = secrets.get(key);
  }


  let envsObject = {};
  for (const key of envs.getKeys()) {
    envsObject[key] = envs.get(key);
  }

  let processEnv = process.env;
  res.status(200).send({
    hard_coded_data: { // FIXME: change for each deployment
      'region (from env)': process.env.MNDY_REGION || 'null',
      'last code change (hard coded)': '2024-06-19T10:45:00.000Z'
    },
    secretsObject,
    envsObject,
    processEnv,
    now: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.status(200).send({ 'status': 'OK' });
});

app.get('/deep-health', async (req, res) => {
  const { randomWord } = req.query;
  const secure = new SecureStorage();

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
  res.status(200).send({ 'status': 'OK', name });
});

app.get('/env-var', (req, res) => {
  const envVarValue = secretManager.get('MY_VAR') || process.env.MY_VAR || 'process.env.MY_VAR not found';
  res.status(200).send({ 'status': 'OK', envVarValue });
});

app.get('/region', (req, res) => {
  const region = process.env.MNDY_REGION || 'MNDY_REGION env var was null or undefined';
  res.status(200).send({ 'status': 'OK', region });
});

app.listen(port, () => console.log(`monday code tester app listening at http://localhost:${port}`));

