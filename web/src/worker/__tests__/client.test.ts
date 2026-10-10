import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../core/config';
import { decodeBinarySTL } from '../../core/stl';
import { loadFixture } from '../../test/fixtures';
import { buildArtifacts } from '../build';
import { GeneratorClient } from '../client';

const wave = loadFixture('great_wave');
const fuji = loadFixture('red_fuji');
const config = { ...defaultConfig, widthInPixels: 24 };

describe('buildArtifacts', () => {
  it('returns the STL, stats and both previews', () => {
    const res = buildArtifacts({ id: 7, horiz: wave, vert: fuji, config });
    if (!res.ok) throw new Error(res.error);
    expect(res.id).toBe(7);
    expect(res.filename).toBe('24px_1.20cell_0.26wall_0.90bottom_0.90maxHeight_1.20border.stl');
    expect(decodeBinarySTL(res.stl).triangles).toHaveLength(res.stats.triangles);
    for (const preview of [res.horizPreview!, res.vertPreview!]) {
      expect(preview.dithered.width).toBe(24);
      expect(preview.shadow.width).toBe(24);
      expect(preview.shadow.height).toBe(res.stats.rows);
    }
  });

  it('reports failures instead of throwing', () => {
    const res = buildArtifacts({ id: 1, horiz: null, vert: null, config });
    expect(res).toEqual({ id: 1, ok: false, error: expect.stringMatching(/At least one/) });
  });
});

describe('GeneratorClient (inline fallback)', () => {
  it('resolves each request in turn', async () => {
    const client = new GeneratorClient(false);
    const res = await client.submit({ id: 1, horiz: wave, vert: null, config });
    expect(res?.ok).toBe(true);
    expect(res?.id).toBe(1);
  });

  it('drops requests superseded before they start, and stale results', async () => {
    const client = new GeneratorClient(false);
    const first = client.submit({ id: 1, horiz: wave, vert: null, config });
    const second = client.submit({ id: 2, horiz: wave, vert: null, config });
    const third = client.submit({ id: 3, horiz: wave, vert: null, config: { ...config, widthInPixels: 10 } });
    // #1 started immediately but #3 arrived before it finished, so its result is stale too.
    expect(await first).toBeNull();
    expect(await second).toBeNull();
    const res = await third;
    expect(res?.id).toBe(3);
    expect(res?.ok && res.stats.cols).toBe(10);
  });

  it('resolves pending requests to null when disposed', async () => {
    const client = new GeneratorClient(false);
    const pending = client.submit({ id: 1, horiz: wave, vert: null, config });
    client.dispose();
    expect(await pending).toBeNull();
  });
});
