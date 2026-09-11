/**
 * Pont vers les capacités de la version « artefact Claude » (page web hébergée sur claude.ai).
 * Hors artefact, toutes les fonctions renvoient null et l'app se comporte comme avant.
 */

// Sous-ensemble des contrats runtime utilisés par l'app.
export interface ArtifactDocSnapshot {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
export interface ArtifactDocChange {
  type: 'added' | 'modified' | 'removed';
  doc: ArtifactDocSnapshot;
}
export interface ArtifactQuerySnapshot {
  docs: ArtifactDocSnapshot[];
  docChanges(): ArtifactDocChange[];
}
export interface ArtifactDocRef {
  id: string;
  get(): Promise<ArtifactDocSnapshot>;
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
export interface ArtifactCollection {
  doc(id: string): ArtifactDocRef;
  get(): Promise<ArtifactQuerySnapshot>;
  limit(n: number): ArtifactCollection;
  onSnapshot(next: (snap: ArtifactQuerySnapshot) => void, error?: (e: { code: string; message: string }) => void): () => void;
}
export interface ArtifactDb {
  collection(path: string): ArtifactCollection;
  doc(path: string): ArtifactDocRef;
}
export interface SampleLimits {
  maxPromptBytes: number;
  images?: { maxCount: number; maxInputBytes: number; mediaTypes: string[] };
}
export interface SampleFn {
  (input: string | { role: 'user' | 'assistant'; content: string }[], options?: SampleOptions): Promise<{ text: string; truncated: boolean }>;
  json<T = unknown>(input: string | { role: 'user' | 'assistant'; content: string }[], options?: SampleOptions): Promise<T>;
  limits(): Promise<SampleLimits>;
}
export interface SampleOptions {
  images?: Blob | Blob[];
  modelTier?: 'default' | 'complex' | 'quick';
  cache?: boolean;
  signal?: AbortSignal;
  onText?: (u: { text: string; delta: string }) => void;
}
export interface DownloadsNs {
  save(req: { filename: string; data: string | Blob }): Promise<{ status: 'saved' | 'delivered' }>;
}

interface ClaudeUse {
  use(name: string): Promise<unknown>;
}

declare const __ARTIFACT_BUILD__: boolean;

/** Vrai pour le build « artefact » (cible web hébergée), faux pour l'APK et le dev. */
export const isArtifactBuild = (): boolean => typeof __ARTIFACT_BUILD__ !== 'undefined' && __ARTIFACT_BUILD__;

function claude(): ClaudeUse | null {
  if (typeof window === 'undefined') return null;
  const c = (window as unknown as { claude?: ClaudeUse }).claude;
  return c && typeof c.use === 'function' ? c : null;
}

let dbP: Promise<ArtifactDb | null> | null = null;
let sampleP: Promise<SampleFn | null> | null = null;
let dlP: Promise<DownloadsNs | null> | null = null;

export function artifactDb(): Promise<ArtifactDb | null> {
  if (!dbP) dbP = claude() ? (claude()!.use('db') as Promise<ArtifactDb | null>).catch(() => null) : Promise.resolve(null);
  return dbP;
}
export function artifactSample(): Promise<SampleFn | null> {
  if (!sampleP) sampleP = claude() ? (claude()!.use('sample') as Promise<SampleFn | null>).catch(() => null) : Promise.resolve(null);
  return sampleP;
}
export function artifactDownloads(): Promise<DownloadsNs | null> {
  if (!dlP) dlP = claude() ? (claude()!.use('downloads') as Promise<DownloadsNs | null>).catch(() => null) : Promise.resolve(null);
  return dlP;
}
