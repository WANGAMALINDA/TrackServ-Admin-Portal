export const MAX_PROFILE_PICTURE_BYTES = 3 * 1024 * 1024;

export type DecodedProfilePicture = {
  bytes: Uint8Array;
  contentType: string;
  extension: string;
};

export function decodeProfilePicture(value: unknown): DecodedProfilePicture | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new Error("The profile picture data is invalid.");
  }

  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/);
  if (!match || match[2].length > 4_200_000) {
    throw new Error("Choose a JPEG, PNG, or WebP image no larger than 3 MB.");
  }

  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  } catch {
    throw new Error("The profile picture data is invalid.");
  }
  if (bytes.byteLength > MAX_PROFILE_PICTURE_BYTES) {
    throw new Error("Profile pictures must be no larger than 3 MB.");
  }

  const isPng = bytes.length >= 8
    && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const isJpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const isWebp = bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  const contentType = match[1];
  if (!(contentType === "image/png" && isPng)
    && !(contentType === "image/jpeg" && isJpeg)
    && !(contentType === "image/webp" && isWebp)) {
    throw new Error("The selected file does not match its JPEG, PNG, or WebP image type.");
  }

  return {
    bytes,
    contentType,
    extension: contentType === "image/jpeg" ? "jpg" : contentType.slice("image/".length),
  };
}
