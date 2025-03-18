import { Queue, Logger } from '@mondaycom/apps-sdk';

// Initialize queue service
const queue = new Queue();
const logger = new Logger('queue-service');

// Global variables for backward compatibility
let lastReceivedQueueMessage = null;
let queueMessageReceived = false;
let queueMessageTimestamp = null;

// Queue test configuration
const queueTestConfig = {
  timeoutMs: 10000,       // 10 seconds timeout
  checkIntervalMs: 500,   // Check every 500ms
  cleanupIntervalMinutes: 10  // Clean up old messages every 10 minutes
};

// Storage for tracking queue messages
const queueMessages = {
  pending: {},  // Track messages by correlationId
  received: {}  // Store received messages by correlationId
};

// Clean up old pending messages periodically
setInterval(() => {
  const now = Date.now();
  const cutoffTime = now - (60 * 60 * 1000); // 1 hour ago
  
  Object.keys(queueMessages.pending).forEach(id => {
    if (queueMessages.pending[id].timestamp < cutoffTime) {
      delete queueMessages.pending[id];
    }
  });
  
  Object.keys(queueMessages.received).forEach(id => {
    if (queueMessages.received[id].receivedAt < cutoffTime) {
      delete queueMessages.received[id];
    }
  });
}, queueTestConfig.cleanupIntervalMinutes * 60 * 1000);

/**
 * Process an incoming queue message
 * @param {object|string} message - The message received from the queue
 * @param {object} headers - The HTTP headers from the request
 * @returns {object} Processing result
 */
function processQueueMessage(message, headers) {
  try {
    // Try to parse the message if it's a string
    let parsedMessage = message;
    if (typeof message === 'string') {
      try {
        parsedMessage = JSON.parse(message);
      } catch (e) {
        logger.warn(`Could not parse message as JSON: ${e.message}`);
      }
    }
    
    // Look for correlation ID
    const correlationId = parsedMessage?.correlationId;
    const receivedTime = Date.now();
    
    if (correlationId) {
      logger.info(`Received queue message with correlationId: ${correlationId}`);
      
      // Store received message
      queueMessages.received[correlationId] = {
        message: parsedMessage,
        receivedAt: receivedTime,
        headers: headers
      };
      
      // Mark as received if we were waiting for it
      if (queueMessages.pending[correlationId]) {
        queueMessages.pending[correlationId].received = true;
        queueMessages.pending[correlationId].receivedAt = receivedTime;
        logger.info(`Matched message with pending correlationId: ${correlationId}`);
      }
    } else {
      logger.info(`Received queue message without correlationId`);
    }
    
    // Update global variables for backward compatibility
    queueMessageReceived = true;
    lastReceivedQueueMessage = parsedMessage;
    queueMessageTimestamp = new Date(receivedTime).toISOString();
    
    return {
      success: true,
      correlationId,
      timestamp: queueMessageTimestamp
    };
    
  } catch (error) {
    logger.error(`Error processing queue message: ${error.message}`, { error });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Wait for a message with the specified correlationId to be received
 * @param {string} correlationId - The correlation ID to wait for
 * @param {object} options - Options for the wait operation
 * @returns {Promise<object>} Result of the wait operation
 */
async function waitForQueueMessage(correlationId, options = {}) {
  const { timeout = queueTestConfig.timeoutMs, interval = queueTestConfig.checkIntervalMs } = options;
  const maxAttempts = Math.ceil(timeout / interval);
  
  let attempts = 0;
  
  return new Promise((resolve) => {
    const intervalId = setInterval(() => {
      attempts++;
      
      // Check if we've received the message with our correlation ID
      if (queueMessages.pending[correlationId]?.received) {
        clearInterval(intervalId);
        resolve({
          received: true,
          attempts,
          message: queueMessages.received[correlationId]
        });
      } else if (attempts >= maxAttempts) {
        clearInterval(intervalId);
        resolve({
          received: false,
          attempts,
          timeout: true
        });
      }
    }, interval);
  });
}

/**
 * Publish a message to the queue
 * @param {object} messageData - The message data to publish
 * @param {string} [correlationId] - Optional correlation ID (will be generated if not provided)
 * @returns {Promise<object>} Result of the publish operation
 */
async function publishQueueMessage(messageData, correlationId = null) {
  // Generate a correlation ID if not provided
  const msgCorrelationId = correlationId || `test-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  
  try {
    // Prepare the message with correlation ID
    const message = {
      ...messageData,
      correlationId: msgCorrelationId,
      timestamp: new Date().toISOString()
    };
    
    const messageContent = JSON.stringify(message);
    
    // Publish to the queue
    const messageId = await queue.publishMessage(messageContent);
    
    // Track this pending message
    queueMessages.pending[msgCorrelationId] = {
      messageId,
      content: messageContent,
      timestamp: Date.now(),
      received: false
    };
    
    logger.info(`Message ${messageId} published with correlationId: ${msgCorrelationId}`);
    
    return {
      success: true,
      messageId,
      correlationId: msgCorrelationId
    };
    
  } catch (error) {
    logger.error(`Failed to publish message: ${error.message}`, { error });
    return {
      success: false,
      error: error.message,
      correlationId: msgCorrelationId
    };
  }
}

/**
 * Run a health check for the queue service
 * @param {object} options - Configuration options
 * @param {object} diagnostics - Diagnostics object to update
 * @param {number} startTime - Start time of the health check
 * @returns {Promise<object>} Results of the health check
 */
async function runQueueHealthCheck(options = {}, diagnostics = { steps: [] }, startTime = Date.now()) {
  const { timeout = queueTestConfig.timeoutMs, interval = queueTestConfig.checkIntervalMs } = options;
  const maxAttempts = Math.ceil(timeout / interval);
  
  try {
    // Publish a message to the queue
    diagnostics.steps.push({ step: 'queue-publish-start', timeMs: Date.now() - startTime });
    
    const publishResult = await publishQueueMessage({ 
      content: "This is a health check message",
      testId: `health-${Date.now()}`
    });
    
    if (!publishResult.success) {
      diagnostics.steps.push({ 
        step: 'queue-publish-failed', 
        timeMs: Date.now() - startTime,
        error: publishResult.error
      });
      
      return {
        status: 'FAILED',
        queueTest: {
          messagePublished: false,
          error: publishResult.error
        }
      };
    }
    
    const { messageId, correlationId } = publishResult;
    
    diagnostics.steps.push({ 
      step: 'queue-publish-complete', 
      timeMs: Date.now() - startTime,
      messageId,
      correlationId
    });
    
    // Wait for the message to be received
    logger.info(`Waiting for queue message (correlationId: ${correlationId})...`);
    diagnostics.steps.push({ step: 'queue-waiting-start', timeMs: Date.now() - startTime });
    
    const waitResult = await waitForQueueMessage(correlationId, { timeout, interval });
    const waitTime = Date.now() - startTime;
    
    diagnostics.steps.push({ 
      step: 'queue-waiting-complete', 
      timeMs: waitTime,
      attempts: waitResult.attempts,
      received: waitResult.received,
      waitedMs: waitResult.attempts * interval
    });
    
    if (!waitResult.received) {
      logger.warn(`Queue message (correlationId: ${correlationId}) was not received within ${timeout}ms (${waitResult.attempts} attempts)`);
    } else {
      logger.info(`Queue message (correlationId: ${correlationId}) received after ${waitResult.attempts} attempts`);
    }
    
    return {
      status: waitResult.received ? 'OK' : 'PARTIAL',
      queueTest: {
        messagePublished: true,
        messageId,
        correlationId,
        messageReceived: waitResult.received,
        receivedMessage: waitResult.received ? queueMessages.received[correlationId] : null,
        attempts: waitResult.attempts,
        maxAttempts,
        timeout: waitResult.timeout,
        configuredTimeoutMs: timeout,
        checkIntervalMs: interval
      }
    };
    
  } catch (error) {
    logger.error(`Queue health check failed: ${error.message}`, { error });
    
    diagnostics.steps.push({ 
      step: 'queue-health-error', 
      timeMs: Date.now() - startTime,
      error: error.message
    });
    
    return {
      status: 'FAILED',
      queueTest: {
        error: error.message
      }
    };
  }
}

/**
 * Get the current status of queue messages
 * @returns {object} Current queue message statistics
 */
function getQueueStatus() {
  return {
    pendingCount: Object.keys(queueMessages.pending).length,
    receivedCount: Object.keys(queueMessages.received).length,
    lastReceived: {
      timestamp: queueMessageTimestamp,
      message: lastReceivedQueueMessage
    },
    messageReceived: queueMessageReceived
  };
}

export {
  queue,
  queueTestConfig,
  processQueueMessage,
  publishQueueMessage,
  waitForQueueMessage,
  runQueueHealthCheck,
  getQueueStatus,
  // Expose for backward compatibility
  lastReceivedQueueMessage,
  queueMessageReceived,
  queueMessageTimestamp
}; 