// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ParameterControls } from '../ParameterControls';
import { defaultConfig, presetConfigs } from '../../core/config';

describe('ParameterControls', () => {
  it('edits numeric parameters', () => {
    const onChange = vi.fn();
    render(<ParameterControls config={defaultConfig} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Cell Size (mm)'), { target: { value: '1.5' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...defaultConfig, cellSize: 1.5 });
  });

  it('treats a cleared field as invalid rather than zero', () => {
    const onChange = vi.fn();
    render(<ParameterControls config={defaultConfig} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Layer Height (mm)'), { target: { value: '' } });
    expect(onChange.mock.lastCall![0].layerHeight).toBeNaN();
  });

  it('switches dithering and toggles', () => {
    const onChange = vi.fn();
    render(<ParameterControls config={defaultConfig} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Dithering'), { target: { value: 'atkinson' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...defaultConfig, dither: 'atkinson' });
    fireEvent.click(screen.getByLabelText(/isolation posts/i));
    expect(onChange).toHaveBeenLastCalledWith({ ...defaultConfig, isolationPosts: false });
  });

  it('shows the preset matching the current settings, starting with the 0.2mm nozzle default', () => {
    const { rerender } = render(<ParameterControls config={defaultConfig} onChange={() => {}} />);
    const select = screen.getByLabelText('Preset') as HTMLSelectElement;
    expect(select.options[0].text).toBe('Default for 0.2mm nozzle');
    expect(select.selectedOptions[0].text).toBe('Default for 0.2mm nozzle');
    rerender(<ParameterControls config={{ ...presetConfigs.p2, doHorizImage: false }} onChange={() => {}} />);
    expect(select.value).toBe('p2');
    rerender(<ParameterControls config={{ ...defaultConfig, cellSize: 1.5 }} onChange={() => {}} />);
    expect(select.selectedOptions[0].text).toBe('Custom');
  });

  it('applies presets without changing which images are enabled', () => {
    const onChange = vi.fn();
    render(<ParameterControls config={{ ...defaultConfig, doVertImage: false }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Preset'), { target: { value: 'p2' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...presetConfigs.p2, doVertImage: false });
  });

  it('lists validation problems', () => {
    render(<ParameterControls config={{ ...defaultConfig, cellSize: 0.2 }} onChange={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('wallWidth must be smaller than cellSize');
  });
});
