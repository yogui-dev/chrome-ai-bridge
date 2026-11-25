export class Tab {
  constructor({
    tabId,
    url = '',
    title = '',
    isManaged = false,
    active = false,
    groupTitle = null,
    sessionName = 'user_active',
    task = null,
    incognito = false,
    profileId = null,
    profileName = null
  }) {
    this.tabId = parseInt(tabId, 10);
    this.url = url;
    this.title = title;
    this.isManaged = Boolean(isManaged);
    this.active = Boolean(active);
    this.groupTitle = groupTitle;
    this.sessionName = sessionName;
    this.task = task;
    this.incognito = Boolean(incognito);
    this.profileId = profileId;
    this.profileName = profileName;
  }
}
