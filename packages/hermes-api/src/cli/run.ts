export interface CliResult {
  exitCode: number;
  output: string;
}

const USAGE = `hermes-api <command>

Commands:
  serve    run the server
  keys     manage API keys
  users    manage users
`;

export function runCli(args: string[]): CliResult {
  const command = args[0];
  if (command === undefined || command === "help" || command === "--help") {
    return { exitCode: command === undefined ? 1 : 0, output: USAGE };
  }
  return { exitCode: 1, output: `unknown command: ${command}\n\n${USAGE}` };
}
