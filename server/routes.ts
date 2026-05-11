import type { Express } from "express";
import { type Server } from "http";

export async function registerRoutes(httpServer: Server, _app: Express): Promise<Server> {
  return httpServer;
}
