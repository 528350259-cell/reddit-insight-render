import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const backendBaseUrl = process.env.FEISHU_BACKEND_BASE_URL || 'http://localhost:5002';
const larkCliCmd = process.env.LARK_CLI_CMD || `${process.env.APPDATA}\\npm\\lark-cli.cmd`;
const isWindows = process.platform === 'win32';
const windowsCmdPath = 'C:\\Windows\\System32\\cmd.exe';

const seenEventIds = new Set();

function log(prefix, message) {
  process.stdout.write(`[feishu-consumer] ${prefix}${message}\n`);
}

async function forwardEvent(event) {
  const response = await fetch(`${backendBaseUrl.replace(/\/$/, '')}/feishu/consume`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`backend returned HTTP ${response.status}: ${body}`);
  }
}

function handleLine(line) {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith('{')) return;

  let event;
  try {
    event = JSON.parse(trimmed);
  } catch (error) {
    log('warn ', `failed to parse NDJSON line: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const eventId = event.event_id || event.message_id || event.id;
  if (eventId && seenEventIds.has(eventId)) {
    return;
  }
  if (eventId) {
    seenEventIds.add(eventId);
    if (seenEventIds.size > 500) {
      const firstKey = seenEventIds.values().next().value;
      if (firstKey) seenEventIds.delete(firstKey);
    }
  }

  forwardEvent(event)
    .then(() => {
      log('ok   ', `${event.type || 'event'} forwarded`);
    })
    .catch((error) => {
      log('err  ', error instanceof Error ? error.message : String(error));
    });
}

if (!existsSync(larkCliCmd)) {
  throw new Error(`lark-cli command not found at ${larkCliCmd}`);
}

log('info ', `connecting via lark-cli to im.message.receive_v1 -> ${backendBaseUrl}/feishu/consume`);

const command = isWindows ? windowsCmdPath : larkCliCmd;
const args = isWindows
  ? ['/c', larkCliCmd, 'event', 'consume', 'im.message.receive_v1', '--as', 'bot', '--quiet']
  : ['event', 'consume', 'im.message.receive_v1', '--as', 'bot', '--quiet'];

const child = spawn(command, args, {
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: false,
});

let stdoutBuffer = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  stdoutBuffer += chunk;
  const lines = stdoutBuffer.split(/\r?\n/);
  stdoutBuffer = lines.pop() ?? '';
  for (const line of lines) handleLine(line);
});

child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => {
  const text = chunk.trim();
  if (text) log('stderr ', text);
});

child.on('exit', (code, signal) => {
  log('exit ', `consumer stopped (code=${code ?? 'null'}, signal=${signal ?? 'null'})`);
  process.exit(code ?? 0);
});

process.on('SIGINT', () => {
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});
