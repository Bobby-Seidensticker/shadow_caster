// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import type { GrayImage } from '../core/image';
import { loadFixture } from '../test/fixtures';

const wave = loadFixture('great_wave');
const fuji = loadFixture('red_fuji');
const decode = async (file: File): Promise<GrayImage> => {
  if (file.name === 'broken.png') throw new Error('bad data');
  return file.name.includes('wave') ? wave : fuji;
};

let downloads: { name: string; size: number }[];

beforeEach(() => {
  downloads = [];
  // jsdom has no canvas or object URLs.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const blobs = new Map<string, Blob>();
  URL.createObjectURL = vi.fn((blob: Blob) => {
    const url = `blob:${blobs.size}`;
    blobs.set(url, blob);
    return url;
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, size: blobs.get(this.href)!.size });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const downloadButton = () => screen.getByRole('button', { name: /download stl|generating|upload images/i });

async function uploadBoth() {
  const user = userEvent.setup();
  await user.upload(screen.getByLabelText(/horizontal shadow image/i), new File(['x'], 'wave.png', { type: 'image/png' }));
  await user.upload(screen.getByLabelText(/vertical shadow image/i), new File(['x'], 'fuji.png', { type: 'image/png' }));
  return user;
}

describe('App', () => {
  it('asks for images before anything can be exported', () => {
    render(<App decodeImage={decode} />);
    expect(downloadButton()).toBeDisabled();
    expect(downloadButton()).toHaveTextContent('Upload images to export');
  });

  it('generates in the background and downloads the STL for the current settings', async () => {
    render(<App decodeImage={decode} />);
    const user = await uploadBoth();

    await waitFor(() => expect(downloadButton()).toHaveTextContent('Download STL'), { timeout: 5000 });
    expect(downloadButton()).toBeEnabled();
    expect(screen.getByRole('img', { name: 'Lit from the left simulated shadow' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Lit from the back simulated shadow' })).toBeInTheDocument();
    expect(screen.getByText(/25 × \d+ cells, 9 height levels/)).toBeInTheDocument();

    await user.click(downloadButton());
    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toBe('25px_1.20cell_0.26wall_0.90bottom_0.90maxHeight_1.20border.stl');
    expect(downloads[0].size).toBeGreaterThan(84);
  });

  it('never exports a model that is out of date with the settings', async () => {
    render(<App decodeImage={decode} />);
    const user = await uploadBoth();
    await waitFor(() => expect(downloadButton()).toBeEnabled(), { timeout: 5000 });

    const width = screen.getByLabelText('Width (cells)');
    await user.clear(width);
    await user.type(width, '40');
    // Immediately after the change the old model is gone.
    expect(downloadButton()).toBeDisabled();
    await waitFor(() => expect(downloadButton()).toBeEnabled(), { timeout: 5000 });

    await user.click(downloadButton());
    expect(downloads.map((d) => d.name)).toEqual(['40px_1.20cell_0.26wall_0.90bottom_0.90maxHeight_1.20border.stl']);
  });

  it('crops the other image to the lead image and lets the crop be moved', async () => {
    render(<App decodeImage={decode} />);
    const user = await uploadBoth();
    await waitFor(() => expect(downloadButton()).toBeEnabled(), { timeout: 5000 });
    // The horizontal image (the wave) leads; the vertical one is cropped to its aspect ratio.
    expect(screen.getByLabelText(/Horizontal \(lit from the left\)/)).toBeChecked();
    const used = () => screen.getByTestId('crop-used').textContent!;
    const [, x0, y0, x1, y1] = used().match(/Using (\d+),(\d+) → (\d+),(\d+)/)!.map(Number);
    expect((x1 - x0) / (y1 - y0)).toBeCloseTo(wave.width / wave.height, 1);
    expect(screen.getByText(/25 × 17 cells/)).toBeInTheDocument();

    const top = screen.getByLabelText('Top (y)');
    await user.clear(top);
    await user.type(top, String(y0 + 10));
    expect(downloadButton()).toBeDisabled();
    await waitFor(() => expect(downloadButton()).toBeEnabled(), { timeout: 5000 });
    expect(used()).not.toBe(`Using ${x0},${y0} → ${x1},${y1} (${x1 - x0} x ${y1 - y0} px)`);

    // Leading with the vertical image starts the other one over from a full-image crop.
    await user.click(screen.getByLabelText(/Vertical \(lit from the back\)/));
    await waitFor(() => expect(downloadButton()).toBeEnabled(), { timeout: 5000 });
    expect(screen.getByLabelText('Top (y)')).toHaveValue(0);
    expect(screen.getByText(new RegExp(`25 × ${Math.round((25 * fuji.height) / fuji.width)} cells`))).toBeInTheDocument();
  });

  it('works with a single image', async () => {
    render(<App decodeImage={decode} />);
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/vertical shadow image/i), new File(['x'], 'fuji.png', { type: 'image/png' }));
    await waitFor(() => expect(downloadButton()).toBeEnabled(), { timeout: 5000 });
    expect(screen.queryByRole('img', { name: 'Lit from the left simulated shadow' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Lit from the back simulated shadow' })).toBeInTheDocument();
  });

  it('shows invalid settings instead of generating', async () => {
    render(<App decodeImage={decode} />);
    const user = await uploadBoth();
    const wall = screen.getByLabelText('Wall Width (mm)');
    await user.clear(wall);
    await user.type(wall, '5');
    expect(await screen.findByText('wallWidth must be smaller than cellSize')).toBeInTheDocument();
    expect(downloadButton()).toBeDisabled();
  });

  it('reports images that fail to decode', async () => {
    render(<App decodeImage={decode} />);
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/horizontal shadow image/i), new File(['x'], 'broken.png', { type: 'image/png' }));
    expect(await screen.findByText('broken.png: bad data')).toBeInTheDocument();
    expect(downloadButton()).toBeDisabled();
  });
});
