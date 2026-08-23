#!/usr/bin/env bun
import { runCli } from "./cli/run.ts";

const result = runCli(process.argv.slice(2));
console.log(result.output);
process.exit(result.exitCode);
