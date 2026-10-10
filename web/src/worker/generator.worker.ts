/// <reference lib="webworker" />
import { buildArtifacts } from './build';
import type { GenerateRequest } from './build';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<GenerateRequest>) => {
  const response = buildArtifacts(event.data);
  self.postMessage(response, response.ok ? [response.stl.buffer as ArrayBuffer] : []);
};
