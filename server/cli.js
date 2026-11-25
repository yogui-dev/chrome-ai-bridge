#!/usr/bin/env node

/**
 * CLI para interactuar con Antigravity Chrome Bridge
 * Uso: node server/cli.js <command> [opciones]
 */

import { CliApp } from '../src/presentation/cli/CliApp.js';

const app = new CliApp();
await app.run(process.argv.slice(2));
