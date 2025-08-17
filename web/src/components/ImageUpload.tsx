import React, { useCallback } from 'react';

interface ImageUploadProps {
  onImagesSelected: (horizFile: File | null, vertFile: File | null) => void;
  horizFile: File | null;
  vertFile: File | null;
}

export function ImageUpload({ onImagesSelected, horizFile, vertFile }: ImageUploadProps) {
  const handleHorizChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    onImagesSelected(file, vertFile);
  }, [onImagesSelected, vertFile]);

  const handleVertChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    onImagesSelected(horizFile, file);
  }, [onImagesSelected, horizFile]);

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
      <h2 className="text-lg font-semibold">Upload Images</h2>
      
      <div className="space-y-3">
        <div>
          <label htmlFor="horiz-image" className="block text-sm font-medium mb-1">
            Horizontal Shadow Image
          </label>
          <input
            id="horiz-image"
            type="file"
            accept="image/*"
            onChange={handleHorizChange}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {horizFile && (
            <p className="text-xs text-gray-600 mt-1">Selected: {horizFile.name}</p>
          )}
        </div>

        <div>
          <label htmlFor="vert-image" className="block text-sm font-medium mb-1">
            Vertical Shadow Image
          </label>
          <input
            id="vert-image"
            type="file"
            accept="image/*"
            onChange={handleVertChange}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {vertFile && (
            <p className="text-xs text-gray-600 mt-1">Selected: {vertFile.name}</p>
          )}
        </div>
      </div>

      <div className="text-sm text-gray-600">
        <p>• Upload 1-2 images for different shadow directions</p>
        <p>• Images will be automatically resized and converted to grayscale</p>
        <p>• Supported formats: JPG, PNG, GIF, WebP</p>
      </div>
    </div>
  );
}