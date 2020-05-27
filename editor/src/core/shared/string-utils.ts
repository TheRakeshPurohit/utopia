export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function isEmptyString(value: string | null): boolean {
  return value === null || value === undefined || value.trim().length === 0
}

export function replaceAll(inString: string, searchFor: string, replaceWith: string): string {
  return inString.split(searchFor).join(replaceWith)
}

export function dropExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.')
  if (lastDotIndex > 0) {
    return filename.slice(0, lastDotIndex)
  } else {
    return filename
  }
}
