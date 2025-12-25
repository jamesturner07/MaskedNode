import { Wallet, isAddress } from 'ethers';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function addressToBytes(address: string): Uint8Array {
  const normalized = address.toLowerCase().replace(/^0x/, "");
  if (!isAddress(`0x${normalized}`)) {
    throw new Error("Invalid mask address");
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = parseInt(normalized.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}` as `0x${string}`;
}

function hexToBytes(hexValue: string): Uint8Array {
  const clean = hexValue.replace(/^0x/, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

export function maskMessage(message: string, maskAddress: string): `0x${string}` {
  const messageBytes = encoder.encode(message);
  const maskBytes = addressToBytes(maskAddress);
  const masked = new Uint8Array(messageBytes.length);

  for (let i = 0; i < messageBytes.length; i++) {
    masked[i] = messageBytes[i] ^ maskBytes[i % maskBytes.length];
  }

  return bytesToHex(masked);
}

export function unmaskMessage(maskedMessage: string, maskAddress: string): string {
  const maskedBytes = hexToBytes(maskedMessage);
  const maskBytes = addressToBytes(maskAddress);
  const clear = new Uint8Array(maskedBytes.length);

  for (let i = 0; i < maskedBytes.length; i++) {
    clear[i] = maskedBytes[i] ^ maskBytes[i % maskBytes.length];
  }

  return decoder.decode(clear);
}

export function generateMaskAddress(): string {
  return Wallet.createRandom().address;
}

export function shorten(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export function formatDate(value: bigint | number): string {
  const timestamp = typeof value === "bigint" ? Number(value) : value;
  return new Date(timestamp * 1000).toLocaleString();
}
