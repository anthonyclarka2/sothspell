import { runCli } from './cli.js';

const exitCode = await runCli(process.argv.slice(2), {
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
});

process.exitCode = exitCode;
