exports.handler = async (event) => {
  const expected = process.env.APP_ACCESS_PASSWORD?.trim();
  const supplied = event.headers?.['x-app-password']?.trim();

  if (expected && supplied !== expected) {
    console.error('[analysis-background] rejected unauthorized invocation');
    return;
  }

  const body = event.body ? JSON.parse(event.body) : {};
  if (
    !body.taskId ||
    typeof body.taskId !== 'string' ||
    !['plan', 'analyze'].includes(body.kind) ||
    !body.payload ||
    typeof body.payload !== 'object'
  ) {
    console.error('[analysis-background] taskId, kind, and payload are required');
    return;
  }

  const { createAndRunAnalysisTask } = require('../../apps/backend/dist/netlify-handler');
  const task = await createAndRunAnalysisTask(body.taskId, body.kind, body.payload);
  console.log(`[analysis-background] task ${body.taskId} finished with status ${task.status}`);
};
