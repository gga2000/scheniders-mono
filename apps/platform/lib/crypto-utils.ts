/**
 * Web Crypto API utilities for the Scheniders Data Vault.
 * Uses AES-GCM for encryption and PBKDF2 for key derivation.
 */

const ENCRYPTION_ALGORITHM = "AES-GCM";
const KEY_DERIVATION_ALGORITHM = "PBKDF2";
const HASH_ALGORITHM = "SHA-256";
const ITERATIONS = 600000; // 2024 OWASP recommendation
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

/**
 * Derives a cryptographic key from a password.
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        { name: KEY_DERIVATION_ALGORITHM },
        false,
        ["deriveKey"]
    );

    return window.crypto.subtle.deriveKey(
        {
            name: KEY_DERIVATION_ALGORITHM,
            salt: salt as BufferSource,
            iterations: ITERATIONS,
            hash: HASH_ALGORITHM,
        },
        keyMaterial,
        { name: ENCRYPTION_ALGORITHM, length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

/**
 * Encrypts an object into a secure Blob (.scheniders format).
 * The resulting blob structure: [16 bytes salt] + [12 bytes IV] + [encrypted data]
 */
export async function encryptVaultData(data: object, password: string): Promise<Blob> {
    const enc = new TextEncoder();
    const jsonString = JSON.stringify(data);
    const encodedData = enc.encode(jsonString);

    // Generate random Salt and IV
    const salt = window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    const key = await deriveKey(password, salt);

    // Encrypt the actual data
    const encryptedContent = await window.crypto.subtle.encrypt(
        {
            name: ENCRYPTION_ALGORITHM,
            iv: iv,
        },
        key,
        encodedData
    );

    // Combine Salt, IV, and Encrypted Content into a single Blob
    const combinedData = new Uint8Array(salt.length + iv.length + encryptedContent.byteLength);
    combinedData.set(salt, 0);
    combinedData.set(iv, salt.length);
    combinedData.set(new Uint8Array(encryptedContent), salt.length + iv.length);

    return new Blob([combinedData], { type: "application/octet-stream" });
}

/**
 * Decrypts a secure Blob (.scheniders format) back into the original object.
 * Throws an error if the password is wrong or data is corrupted.
 */
export async function decryptVaultData(blob: Blob, password: string): Promise<any> {
    const arrayBuffer = await blob.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    if (data.length < SALT_LENGTH + IV_LENGTH) {
        throw new Error("Invalid vault file: too small.");
    }

    // Extract Salt and IV
    const salt = data.slice(0, SALT_LENGTH);
    const iv = data.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const encryptedContent = data.slice(SALT_LENGTH + IV_LENGTH);

    const key = await deriveKey(password, salt);

    try {
        const decryptedContent = await window.crypto.subtle.decrypt(
            {
                name: ENCRYPTION_ALGORITHM,
                iv: iv,
            },
            key,
            Buffer.from ? Buffer.from(encryptedContent) : encryptedContent // Node/Browser compat
        );

        const dec = new TextDecoder();
        const jsonString = dec.decode(decryptedContent);
        return JSON.parse(jsonString);
    } catch (e) {
        console.error("Decryption failed", e);
        throw new Error("Failed to unlock vault. Incorrect key or corrupted file.");
    }
}
