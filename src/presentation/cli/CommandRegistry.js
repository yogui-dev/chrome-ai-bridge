export class CommandRegistry {
  constructor() {
    this.commands = new Map();
    this.aliases = new Map();
  }

  register(commandInstance) {
    this.commands.set(commandInstance.name, commandInstance);
    if (Array.isArray(commandInstance.aliases)) {
      commandInstance.aliases.forEach(alias => this.aliases.set(alias, commandInstance));
    }
  }

  resolve(commandName) {
    if (!commandName) return null;
    return this.commands.get(commandName) || this.aliases.get(commandName) || null;
  }
}
