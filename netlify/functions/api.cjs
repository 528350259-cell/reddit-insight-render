exports.handler = async (event, context) => {
  const { handler } = require('../../apps/backend/dist/netlify-handler');
  return handler(event, context);
};
