export class IProfileRegistry {
  register(profile) { throw new Error('Not implemented: register'); }
  unregister(profileId) { throw new Error('Not implemented: unregister'); }
  getById(profileId) { throw new Error('Not implemented: getById'); }
  findTargetProfile(targetQuery, tabId) { throw new Error('Not implemented: findTargetProfile'); }
  listProfiles() { throw new Error('Not implemented: listProfiles'); }
  mapTabToProfile(tabId, profileId) { throw new Error('Not implemented: mapTabToProfile'); }
  getProfileIdByTab(tabId) { throw new Error('Not implemented: getProfileIdByTab'); }
}
