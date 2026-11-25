import { Profile } from '../../domain/entities/Profile.js';

export class RegisterProfileUseCase {
  constructor({ profileRegistry }) {
    this.profileRegistry = profileRegistry;
  }

  execute(payload, socketClient = null) {
    const profileId = payload.profileId || payload.id;
    if (!profileId) throw new Error('profileId is required');

    let profile = this.profileRegistry.getById(profileId);
    if (!profile) {
      profile = new Profile({
        id: profileId,
        name: payload.profileName || payload.name || `Cliente #${profileId}`,
        ws: socketClient,
        tabs: payload.tabs || []
      });
    } else {
      if (payload.profileName || payload.name) profile.name = payload.profileName || payload.name;
      if (socketClient) profile.ws = socketClient;
      if (payload.tabs) profile.setTabs(payload.tabs);
      profile.updateLastSeen();
    }

    this.profileRegistry.register(profile);
    return profile;
  }
}
