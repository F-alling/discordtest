export function mediaToDatabase(media, removeFlag) {
  if (media) {
    return [
      media.filename,
      media.type,
      media.path,
      media.size,
      media.preview.base64,
      media.sizes.small.avif.path.replace(/_small\.avif$/, ''),
      JSON.stringify(media.sizes),
      removeFlag ? 1 : 0,
    ]
  } else {
    return [
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      removeFlag ? 1 : 0,
    ]
  }
}