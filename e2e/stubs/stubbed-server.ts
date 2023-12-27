export interface StubbedServer {
  start(): Promise<void>;
  shutdown(): Promise<void>;
  reset(): Promise<void>;
  getHost(): string;
  getPort(): number;
  getBaseUrl(): string;
}
