export class ListProfilesUseCase {
  constructor({ profileRegistry, transport }) {
    this.profileRegistry = profileRegistry;
    this.transport = transport;
  }

  async execute(refreshTabs = false) {
    const profiles = this.profileRegistry.listProfiles();
    // refreshTabs is a future enhancement; for now just return current state
    return profiles;
  }
}
