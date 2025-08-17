import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageUpload } from '../ImageUpload';

describe('ImageUpload', () => {
  it('should render upload inputs for both images', () => {
    const mockOnImagesSelected = vi.fn();
    
    render(
      <ImageUpload 
        onImagesSelected={mockOnImagesSelected}
        horizFile={null}
        vertFile={null}
      />
    );

    expect(screen.getByLabelText(/horizontal shadow image/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/vertical shadow image/i)).toBeInTheDocument();
  });

  it('should show selected file names', () => {
    const mockOnImagesSelected = vi.fn();
    const horizFile = new File([''], 'horizontal.jpg', { type: 'image/jpeg' });
    const vertFile = new File([''], 'vertical.png', { type: 'image/png' });
    
    render(
      <ImageUpload 
        onImagesSelected={mockOnImagesSelected}
        horizFile={horizFile}
        vertFile={vertFile}
      />
    );

    expect(screen.getByText('Selected: horizontal.jpg')).toBeInTheDocument();
    expect(screen.getByText('Selected: vertical.png')).toBeInTheDocument();
  });

  it('should call onImagesSelected when horizontal file is selected', async () => {
    const user = userEvent.setup();
    const mockOnImagesSelected = vi.fn();
    const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
    
    render(
      <ImageUpload 
        onImagesSelected={mockOnImagesSelected}
        horizFile={null}
        vertFile={null}
      />
    );

    const input = screen.getByLabelText(/horizontal shadow image/i);
    await user.upload(input, file);

    expect(mockOnImagesSelected).toHaveBeenCalledWith(file, null);
  });

  it('should call onImagesSelected when vertical file is selected', async () => {
    const user = userEvent.setup();
    const mockOnImagesSelected = vi.fn();
    const file = new File([''], 'test.png', { type: 'image/png' });
    
    render(
      <ImageUpload 
        onImagesSelected={mockOnImagesSelected}
        horizFile={null}
        vertFile={null}
      />
    );

    const input = screen.getByLabelText(/vertical shadow image/i);
    await user.upload(input, file);

    expect(mockOnImagesSelected).toHaveBeenCalledWith(null, file);
  });

  it('should preserve existing files when selecting new ones', async () => {
    const user = userEvent.setup();
    const mockOnImagesSelected = vi.fn();
    const existingFile = new File([''], 'existing.jpg', { type: 'image/jpeg' });
    const newFile = new File([''], 'new.png', { type: 'image/png' });
    
    render(
      <ImageUpload 
        onImagesSelected={mockOnImagesSelected}
        horizFile={existingFile}
        vertFile={null}
      />
    );

    const vertInput = screen.getByLabelText(/vertical shadow image/i);
    await user.upload(vertInput, newFile);

    expect(mockOnImagesSelected).toHaveBeenCalledWith(existingFile, newFile);
  });

  it('should display usage instructions', () => {
    const mockOnImagesSelected = vi.fn();
    
    render(
      <ImageUpload 
        onImagesSelected={mockOnImagesSelected}
        horizFile={null}
        vertFile={null}
      />
    );

    expect(screen.getByText(/upload 1-2 images/i)).toBeInTheDocument();
    expect(screen.getByText(/automatically resized/i)).toBeInTheDocument();
    expect(screen.getByText(/supported formats/i)).toBeInTheDocument();
  });
});