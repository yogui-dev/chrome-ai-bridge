export class FlagParser {
  static parse(rawArgs = []) {
    const command = rawArgs.length > 0 && !rawArgs[0].startsWith('--') ? rawArgs[0] : null;
    const startIdx = command !== null ? 1 : 0;
    const flags = {};
    const extraArgs = [];

    for (let i = startIdx; i < rawArgs.length; i++) {
      const arg = rawArgs[i];
      if (arg.startsWith('--')) {
        const key = arg.slice(2);
        const next = rawArgs[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      } else {
        extraArgs.push(arg);
      }
    }

    return { command, flags, extraArgs };
  }
}
