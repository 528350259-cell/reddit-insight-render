exports.handler = async (event, context) => {
  try {
    const { handler } = require('../../apps/backend/dist/netlify-handler');
    return await handler(event, context);
  } catch (error) {
    console.error('[netlify-api] unhandled error', error);

    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-app-password',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Netlify API function failed before completing the request.',
        error: error instanceof Error ? error.message : String(error),
      }),
    };
  }
};
