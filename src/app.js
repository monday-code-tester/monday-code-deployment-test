import express from 'express';
import { Logger, SecureStorage, EnvironmentVariablesManager, SecretsManager } from '@mondaycom/apps-sdk';
import { 
  queueTestConfig, 
  processQueueMessage, 
  runQueueHealthCheck,
} from './services/queueService.js';

// These are declared in queueService.js and maintained for backward compatibility
// They are still accessible from there but referenced here for documentation
// let queueMessageReceived = false;
// let lastReceivedQueueMessage = null;
// let queueMessageTimestamp = null;

const envs = new EnvironmentVariablesManager({ updateProcessEnv: true });
const logger = new Logger('test-logger');

const app = express();
const port = 8080;

// Parse JSON bodies
app.use(express.json());

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
      'region (from env)': processEnv.MNDY_REGION || 'null',
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
  const { randomWord, timeoutMs, checkIntervalMs } = req.query;
  const secure = new SecureStorage();
  
  // Allow configuration via query parameters
  const timeout = timeoutMs ? parseInt(timeoutMs, 10) : queueTestConfig.timeoutMs;
  const interval = checkIntervalMs ? parseInt(checkIntervalMs, 10) : queueTestConfig.checkIntervalMs;
  
  const startTime = Date.now();
  const diagnostics = {
    start: new Date(startTime).toISOString(),
    steps: []
  };

  try {
    logger.info(`Deep health check started - randomWord: ${randomWord}`);
    diagnostics.steps.push({ step: 'start', time: diagnostics.start });

    // Secure storage test
    const key = Date.now() + '';
    const value = 'test';

    await secure.set(key, value);
    const result = await secure.get(key);
    const deleted = await secure.delete(key);
    const result2 = await secure.get(key);

    if (!(result === value && deleted && !result2)) {
      throw new Error('Secure storage assertion failed');
    }
    
    diagnostics.steps.push({ step: 'secure-storage-complete', timeMs: Date.now() - startTime });

    // Run queue health check
    const queueResults = await runQueueHealthCheck(
      { timeout, interval },
      diagnostics,
      startTime
    );

    logger.debug(`Deep health check completed in ${Date.now() - startTime}ms`);
    diagnostics.end = new Date().toISOString();
    diagnostics.durationMs = Date.now() - startTime;
    
    res.status(200).send({ 
      'status': queueResults.status,
      randomWord,
      queueTest: queueResults.queueTest,
      diagnostics
    });

  } catch (error) {
    const errorTime = Date.now();
    logger.error(`Deep health failed: ${error.message}`, { error });
    
    diagnostics.steps.push({ 
      step: 'error', 
      timeMs: errorTime - startTime,
      error: error.message
    });
    
    diagnostics.end = new Date(errorTime).toISOString();
    diagnostics.durationMs = errorTime - startTime;
    
    res.status(500).send({ 
      'status': 'FAILED', 
      error: error.message,
      diagnostics
    });
  }
});

// create end point under /queue that receive message from pubsub subscription and print their body
app.post("/mndy-queue", function (req, res) {
  console.log("queue message received headers", req.headers);
  console.log("queue message received body", req.body);
  console.log("queue message query params", req.query);
  
  // Process the queue message using the queue service
  const result = processQueueMessage(req.body, req.headers);
  console.log("produce message received", req.body);
  
  res.status(200).send();
});

app.get("/sleep", function (req, res) {
  console.log("sleep request received");
  const sleepTime = req.query.sleepTime || 1000;
  console.log("sleeping for", sleepTime);
  setTimeout(() => {
    console.log("sleep done");
    res.status(200).send();
  }, sleepTime);
});

app.get('/topic-name', (req, res) => {
  const name = process.env.MNDY_TOPIC_NAME || 'process.env.MNDY_TOPIC_NAME not found';
  res.status(200).send({ 'status': 'OK', name });
});

app.get('/env-var', (req, res) => {
  const envVarValue = envs.get('MY_VAR') || process.env.MY_VAR || 'process.env.MY_VAR not found';
  res.status(200).send({ 'status': 'OK', envVarValue });
});

app.get('/region', (req, res) => {
  const region = process.env.MNDY_REGION || 'MNDY_REGION env var was null or undefined';
  res.status(200).send({ 'status': 'OK', region });
});

app.listen(port, () => console.log(`monday code tester app listening at http://localhost:${port}`));

