// Storage interface for the application
// Currently not used for WHOIS lookup (stateless), but kept for potential future features

export interface IStorage {
  // Add storage methods here if needed in the future
}

export class MemStorage implements IStorage {
  constructor() {
    // Initialize storage
  }
}

export const storage = new MemStorage();
