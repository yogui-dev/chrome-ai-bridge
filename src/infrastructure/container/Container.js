import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { InMemoryProfileRegistry } from '../persistence/InMemoryProfileRegistry.js';
import { InMemoryLogRepository } from '../persistence/InMemoryLogRepository.js';
import { LocalFileStorage } from '../filesystem/LocalFileStorage.js';
import { WsExtensionTransport } from '../transport/WsExtensionTransport.js';
import { ActionRegistry } from '../../application/actions/ActionRegistry.js';
import { GenericActionHandler } from '../../application/actions/GenericActionHandler.js';
import { CreateTabActionHandler } from '../../application/actions/CreateTabActionHandler.js';
import { ScreenshotActionHandler } from '../../application/actions/ScreenshotActionHandler.js';
import { ExecuteActionUseCase } from '../../application/use-cases/ExecuteActionUseCase.js';
import { RegisterProfileUseCase } from '../../application/use-cases/RegisterProfileUseCase.js';
import { ListProfilesUseCase } from '../../application/use-cases/ListProfilesUseCase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_SCREENSHOTS_DIR = path.resolve(__dirname, '../../../screenshots');

export class Container {
  constructor(options = {}) {
    this.screenshotsDir = options.screenshotsDir || DEFAULT_SCREENSHOTS_DIR;

    // Infrastructure
    this.profileRegistry = options.profileRegistry || new InMemoryProfileRegistry();
    this.logRepository = options.logRepository || new InMemoryLogRepository();
    this.fileStorage = options.fileStorage || new LocalFileStorage(this.screenshotsDir);
    this.transport = options.transport || new WsExtensionTransport();

    // Action Registry (OCP — register specialized handlers first, generic last as default)
    this.actionRegistry = options.actionRegistry || new ActionRegistry();
    this.actionRegistry.register(new CreateTabActionHandler(this.profileRegistry, this.transport));
    this.actionRegistry.register(new ScreenshotActionHandler(this.fileStorage, this.transport));
    this.actionRegistry.setDefaultHandler(new GenericActionHandler(this.transport));

    // Use Cases
    this.executeActionUseCase = new ExecuteActionUseCase({
      profileRegistry: this.profileRegistry,
      actionRegistry: this.actionRegistry
    });
    this.registerProfileUseCase = new RegisterProfileUseCase({
      profileRegistry: this.profileRegistry
    });
    this.listProfilesUseCase = new ListProfilesUseCase({
      profileRegistry: this.profileRegistry,
      transport: this.transport
    });
  }
}
