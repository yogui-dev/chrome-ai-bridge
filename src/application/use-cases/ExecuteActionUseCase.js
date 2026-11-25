export class ExecuteActionUseCase {
  constructor({ profileRegistry, actionRegistry }) {
    this.profileRegistry = profileRegistry;
    this.actionRegistry = actionRegistry;
  }

  async execute(envelope) {
    const targetProfile = this.profileRegistry.findTargetProfile(
      envelope.profile,
      envelope.params?.tabId
    );

    if (!targetProfile && envelope.profile) {
      throw new Error(`Perfil "${envelope.profile}" no encontrado.`);
    }

    // The targetClientId is the ws socket stored on the profile, or falls back to the profile itself
    const targetClientId = targetProfile ? (targetProfile.ws || targetProfile.id) : null;
    const targetProfileId = targetProfile ? targetProfile.id : null;

    const handler = this.actionRegistry.getHandler(envelope.action);
    if (!handler) {
      throw new Error(`No handler registered for action "${envelope.action}"`);
    }

    return await handler.handle(envelope, {
      targetProfile,
      targetClientId,
      targetProfileId
    });
  }
}
