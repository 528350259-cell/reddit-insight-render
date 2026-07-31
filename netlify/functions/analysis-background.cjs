exports.handler = async (event) => {
  const expected = process.env.APP_ACCESS_PASSWORD?.trim();
  const supplied = event.headers?.['x-app-password']?.trim();

  if (expected && supplied !== expected) {
    console.error('[analysis-background] rejected unauthorized invocation');
    return;
  }

  const body = event.body ? JSON.parse(event.body) : {};
  if (!body.taskId || typeof body.taskId !== 'string') {
    console.error('[analysis-background] taskId is required');
    return;
  }

  const { runAnalysisTask } = require('../../apps/backend/dist/netlify-handler');
  const task = await runAnalysisTask(body.taskId);
  console.log(`[analysis-background] task ${body.taskId} finished with status ${task.status}`);
};
