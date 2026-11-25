import { IProfileRegistry } from '../../domain/contracts/IProfileRegistry.js';

export class InMemoryProfileRegistry extends IProfileRegistry {
  constructor() {
    super();
    this.profiles = new Map(); // id -> Profile
    this.tabToProfile = new Map(); // tabId (number) -> profileId (string)
  }

  register(profile) {
    this.profiles.set(profile.id, profile);
    if (profile.tabs && Array.isArray(profile.tabs)) {
      profile.tabs.forEach(tab => {
        if (tab && tab.tabId) {
          this.mapTabToProfile(tab.tabId, profile.id);
        }
      });
    }
  }

  unregister(profileId) {
    this.profiles.delete(profileId);
    for (const [tabId, pId] of this.tabToProfile.entries()) {
      if (pId === profileId) {
        this.tabToProfile.delete(tabId);
      }
    }
  }

  getById(profileId) {
    return this.profiles.get(profileId) || null;
  }

  listProfiles() {
    return Array.from(this.profiles.values());
  }

  mapTabToProfile(tabId, profileId) {
    this.tabToProfile.set(parseInt(tabId, 10), String(profileId));
  }

  getProfileIdByTab(tabId) {
    return this.tabToProfile.get(parseInt(tabId, 10)) || null;
  }

  findTargetProfile(targetQuery = null, tabId = null) {
    // 1. Si se especificó un perfil objetivo
    if (targetQuery) {
      const query = String(targetQuery).trim().toLowerCase();
      if (this.profiles.has(targetQuery)) {
        return this.profiles.get(targetQuery);
      }
      for (const prof of this.profiles.values()) {
        if (prof.id.toLowerCase() === query || prof.name.toLowerCase() === query) {
          return prof;
        }
      }
      for (const prof of this.profiles.values()) {
        if (prof.id.toLowerCase().includes(query) || prof.name.toLowerCase().includes(query)) {
          return prof;
        }
      }
      const available = Array.from(this.profiles.values()).map(p => `"${p.name}" (ID: ${p.id})`).join(', ');
      throw new Error(`Perfil "${targetQuery}" no encontrado. Perfiles activos: ${available || 'ninguno'}`);
    }

    // 2. Si se especificó un tabId
    if (tabId !== null && tabId !== undefined) {
      const numTabId = parseInt(tabId, 10);
      if (this.tabToProfile.has(numTabId)) {
        const profId = this.tabToProfile.get(numTabId);
        if (this.profiles.has(profId)) {
          return this.profiles.get(profId);
        }
      }
    }

    // 3. Si solo hay un perfil conectado
    if (this.profiles.size === 1) {
      return Array.from(this.profiles.values())[0];
    }

    // 4. Si hay múltiples perfiles, retornar el más recientemente activo
    if (this.profiles.size > 1) {
      const sorted = Array.from(this.profiles.values()).sort(
        (a, b) => (b.lastSeen - a.lastSeen) || (b.connectedAt - a.connectedAt)
      );
      return sorted[0];
    }

    return null;
  }
}
