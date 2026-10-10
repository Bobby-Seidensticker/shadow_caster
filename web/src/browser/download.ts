export function downloadBytes(bytes: Uint8Array, filename: string, type = 'model/stl'): void {
  const blob = new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoke on the next tick; some browsers cancel the download if it's revoked synchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
