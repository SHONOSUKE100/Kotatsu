type Attributes = Record<string, unknown> | undefined;

const formatMessage = (message: string, attributes?: Attributes) => {
  if (!attributes || Object.keys(attributes).length === 0) {
    return message;
  }
  try {
    return `${message} ${JSON.stringify(attributes)}`;
  } catch {
    return message;
  }
};

export const initLogger = () => {
  // No initialization needed for console-based logging.
};

export const logDebug = (message: string, attributes?: Attributes) => {
  console.debug(formatMessage(message, attributes));
};

export const logInfo = (message: string, attributes?: Attributes) => {
  console.info(formatMessage(message, attributes));
};

export const logWarn = (message: string, attributes?: Attributes) => {
  console.warn(formatMessage(message, attributes));
};

export const logError = (message: string, attributes?: Attributes) => {
  console.error(formatMessage(message, attributes));
};
