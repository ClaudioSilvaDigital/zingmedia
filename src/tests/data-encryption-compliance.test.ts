import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { EncryptionService } from '../services/encryption';

// Feature: content-automation-platform, Property 15: Data Encryption Compliance
// For any sensitive data (tokens, personal information, credentials), the system should encrypt the data both at rest and in transit
// **Validates: Requirements 13.1, 13.5**

describe('Data Encryption Compliance Property Tests', () => {
  let encryptionService: EncryptionService;

  beforeAll(() => {
    // Use a test master key for consistent testing
    const testMasterKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    encryptionService = new EncryptionService(testMasterKey);
  });

  // Feature: content-automation-platform, Property 15: Data Encryption Compliance
  // *For any* sensitive data, the system should encrypt the data and be able to decrypt it back to the original
  // **Validates: Requirements 13.1, 13.5**
  it('should encrypt and decrypt any data maintaining round-trip integrity', async () => {
    await fc.assert(fc.property(
      // Generate various types of sensitive data
      fc.oneof(
        // Personal information
        fc.record({
          type: fc.constant('personal'),
          name: fc.fullUnicodeString({ minLength: 1, maxLength: 100 }),
          email: fc.emailAddress(),
          phone: fc.string({ minLength: 10, maxLength: 15 }),
          document: fc.string({ minLength: 11, maxLength: 14 })
        }),
        // API credentials
        fc.record({
          type: fc.constant('credentials'),
          apiKey: fc.hexaString({ minLength: 32, maxLength: 64 }),
          secretKey: fc.hexaString({ minLength: 32, maxLength: 64 }),
          token: fc.base64String({ minLength: 20, maxLength: 200 })
        }),
        // Financial data
        fc.record({
          type: fc.constant('financial'),
          cardNumber: fc.string({ minLength: 16, maxLength: 16 }),
          cvv: fc.string({ minLength: 3, maxLength: 4 }),
          bankAccount: fc.string({ minLength: 10, maxLength: 20 })
        }),
        // Simple strings with various content
        fc.oneof(
          fc.string({ minLength: 1, maxLength: 1000 }),
          fc.fullUnicodeString({ minLength: 1, maxLength: 500 }),
          fc.json(),
          fc.base64String({ minLength: 1, maxLength: 500 })
        ).map(str => ({ type: 'string', data: str }))
      ),
      (sensitiveData) => {
        const plaintext = typeof sensitiveData === 'string' ? sensitiveData : JSON.stringify(sensitiveData);
        
        // Encrypt the data
        const encrypted = encryptionService.encrypt(plaintext);
        
        // Verify encryption result structure
        expect(encrypted).toHaveProperty('encryptedData');
        expect(encrypted).toHaveProperty('iv');
        expect(encrypted).toHaveProperty('authTag');
        
        // Verify encrypted data is different from plaintext
        expect(encrypted.encryptedData).not.toBe(plaintext);
        expect(encrypted.iv).toMatch(/^[0-9a-f]+$/i);
        expect(encrypted.authTag).toMatch(/^[0-9a-f]+$/i);
        
        // Decrypt the data
        const decrypted = encryptionService.decrypt(encrypted);
        
        // Verify round-trip integrity
        expect(decrypted).toBe(plaintext);
        
        // Verify that the same plaintext produces different encrypted results (due to random IV)
        const encrypted2 = encryptionService.encrypt(plaintext);
        expect(encrypted2.encryptedData).not.toBe(encrypted.encryptedData);
        expect(encrypted2.iv).not.toBe(encrypted.iv);
        
        // But both should decrypt to the same plaintext
        const decrypted2 = encryptionService.decrypt(encrypted2);
        expect(decrypted2).toBe(plaintext);
      }
    ), { numRuns: 100 });
  });

  // Property: Encryption produces different outputs for same input (non-deterministic due to IV)
  // *For any* plaintext, multiple encryptions should produce different ciphertexts but decrypt to same plaintext
  it('should produce different encrypted outputs for same input due to random IV', async () => {
    await fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 500 }),
      (plaintext) => {
        // Encrypt the same plaintext multiple times
        const encryptions = Array.from({ length: 5 }, () => encryptionService.encrypt(plaintext));
        
        // All encrypted data should be different (due to random IV)
        for (let i = 0; i < encryptions.length; i++) {
          for (let j = i + 1; j < encryptions.length; j++) {
            expect(encryptions[i].encryptedData).not.toBe(encryptions[j].encryptedData);
            expect(encryptions[i].iv).not.toBe(encryptions[j].iv);
          }
        }
        
        // But all should decrypt to the same plaintext
        const decryptions = encryptions.map(enc => encryptionService.decrypt(enc));
        decryptions.forEach(dec => {
          expect(dec).toBe(plaintext);
        });
      }
    ), { numRuns: 50 });
  });

  // Property: Tampered encrypted data should fail to decrypt
  // *For any* encrypted data, tampering with any component should cause decryption to fail
  it('should detect tampering and fail decryption for modified encrypted data', async () => {
    await fc.assert(fc.property(
      fc.string({ minLength: 10, maxLength: 200 }),
      fc.integer({ min: 0, max: 2 }), // Which component to tamper with
      (plaintext, tamperTarget) => {
        const encrypted = encryptionService.encrypt(plaintext);
        
        // Create a tampered version
        const tampered = { ...encrypted };
        
        switch (tamperTarget) {
          case 0: // Tamper with encrypted data
            tampered.encryptedData = tampered.encryptedData.slice(0, -2) + 'ff';
            break;
          case 1: // Tamper with IV
            tampered.iv = tampered.iv.slice(0, -2) + 'aa';
            break;
          case 2: // Tamper with auth tag
            tampered.authTag = tampered.authTag.slice(0, -2) + 'bb';
            break;
        }
        
        // Decryption should fail for tampered data
        expect(() => {
          encryptionService.decrypt(tampered);
        }).toThrow();
        
        // Original should still work
        const decrypted = encryptionService.decrypt(encrypted);
        expect(decrypted).toBe(plaintext);
      }
    ), { numRuns: 75 });
  });

  // Property: Object encryption round-trip integrity
  // *For any* object, encrypting and decrypting should preserve the object structure and values
  it('should maintain object structure and values through encryption round-trip', async () => {
    await fc.assert(fc.property(
      fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 100 }),
        age: fc.integer({ min: 0, max: 150 }),
        active: fc.boolean(),
        tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 10 }),
        metadata: fc.record({
          created: fc.date().map(d => d.toISOString()),
          score: fc.float({ min: 0, max: 100 }),
          nested: fc.record({
            value: fc.string({ maxLength: 50 }),
            count: fc.integer({ min: 0, max: 1000 })
          })
        })
      }),
      (originalObject) => {
        // Encrypt the object
        const encrypted = encryptionService.encryptObject(originalObject);
        
        // Verify encryption structure
        expect(encrypted).toHaveProperty('encryptedData');
        expect(encrypted).toHaveProperty('iv');
        expect(encrypted).toHaveProperty('authTag');
        
        // Decrypt the object
        const decryptedObject = encryptionService.decryptObject(encrypted);
        
        // Verify complete object integrity
        expect(decryptedObject).toEqual(originalObject);
        
        // Verify specific properties are preserved
        expect(decryptedObject.id).toBe(originalObject.id);
        expect(decryptedObject.name).toBe(originalObject.name);
        expect(decryptedObject.age).toBe(originalObject.age);
        expect(decryptedObject.active).toBe(originalObject.active);
        expect(decryptedObject.tags).toEqual(originalObject.tags);
        expect(decryptedObject.metadata).toEqual(originalObject.metadata);
        expect(decryptedObject.metadata.nested).toEqual(originalObject.metadata.nested);
      }
    ), { numRuns: 50 });
  });

  // Property: Hash function consistency and verification
  // *For any* data, hashing should be consistent and verifiable
  it('should produce consistent hashes and verify them correctly', async () => {
    await fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 200 }),
      fc.oneof(fc.hexaString({ minLength: 32, maxLength: 32 }), fc.constant(undefined)), // Optional salt
      (data, salt) => {
        // Hash the data
        const hash1 = encryptionService.hash(data, salt);
        const hash2 = encryptionService.hash(data, salt);
        
        if (salt) {
          // With same salt, hashes should be identical
          expect(hash1).toBe(hash2);
        } else {
          // Without salt, hashes should be different (random salt)
          expect(hash1).not.toBe(hash2);
        }
        
        // Both hashes should verify correctly
        expect(encryptionService.verifyHash(data, hash1)).toBe(true);
        expect(encryptionService.verifyHash(data, hash2)).toBe(true);
        
        // Wrong data should not verify
        const wrongData = data + 'x';
        expect(encryptionService.verifyHash(wrongData, hash1)).toBe(false);
        expect(encryptionService.verifyHash(wrongData, hash2)).toBe(false);
        
        // Hash format should be salt:hash
        expect(hash1).toMatch(/^[0-9a-f]+:[0-9a-f]+$/i);
        expect(hash2).toMatch(/^[0-9a-f]+:[0-9a-f]+$/i);
      }
    ), { numRuns: 50 });
  });

  // Property: Storage format encryption round-trip
  // *For any* data, storage format encryption should maintain round-trip integrity
  it('should maintain data integrity through storage format encryption', async () => {
    await fc.assert(fc.property(
      fc.oneof(
        fc.string({ minLength: 1, maxLength: 500 }),
        fc.json(),
        fc.base64String({ minLength: 1, maxLength: 300 })
      ),
      (data) => {
        // Encrypt for storage
        const encryptedForStorage = encryptionService.encryptForStorage(data);
        
        // Verify storage format (iv:authTag:encryptedData)
        expect(encryptedForStorage).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/i);
        
        // Verify it has exactly 2 colons (3 parts)
        const parts = encryptedForStorage.split(':');
        expect(parts).toHaveLength(3);
        
        // Each part should be hex
        parts.forEach(part => {
          expect(part).toMatch(/^[0-9a-f]+$/i);
          expect(part.length).toBeGreaterThan(0);
        });
        
        // Decrypt from storage
        const decryptedFromStorage = encryptionService.decryptFromStorage(encryptedForStorage);
        
        // Verify round-trip integrity
        expect(decryptedFromStorage).toBe(data);
      }
    ), { numRuns: 75 });
  });

  // Property: Token generation uniqueness and format
  // *For any* token length, generated tokens should be unique and properly formatted
  it('should generate unique tokens with correct format and length', async () => {
    await fc.assert(fc.property(
      fc.integer({ min: 8, max: 128 }), // Token length
      (tokenLength) => {
        // Generate multiple tokens
        const tokens = Array.from({ length: 20 }, () => encryptionService.generateToken(tokenLength));
        
        // All tokens should be unique
        const uniqueTokens = new Set(tokens);
        expect(uniqueTokens.size).toBe(tokens.length);
        
        // All tokens should have correct format and length
        tokens.forEach(token => {
          expect(token).toMatch(/^[0-9a-f]+$/i);
          expect(token.length).toBe(tokenLength * 2); // Hex encoding doubles the length
        });
      }
    ), { numRuns: 30 });
  });

  // Property: Encryption configuration consistency
  // *For any* encryption service instance, configuration should remain consistent
  it('should maintain consistent encryption configuration', async () => {
    const config = encryptionService.getConfig();
    
    // Verify configuration structure
    expect(config).toHaveProperty('algorithm');
    expect(config).toHaveProperty('keyLength');
    expect(config).toHaveProperty('ivLength');
    expect(config).toHaveProperty('tagLength');
    
    // Verify configuration values
    expect(config.algorithm).toBe('aes-256-cbc');
    expect(config.keyLength).toBe(32);
    expect(config.ivLength).toBe(16);
    expect(config.tagLength).toBe(16);
    
    // Configuration should be immutable
    const config2 = encryptionService.getConfig();
    expect(config2).toEqual(config);
  });

  // Property: Master key generation format
  // *For any* master key generation, it should produce valid hex keys of correct length
  it('should generate valid master keys with correct format', async () => {
    await fc.assert(fc.property(
      fc.constant(null), // No input needed for key generation
      () => {
        const masterKey = EncryptionService.generateMasterKey();
        
        // Should be 64 hex characters (32 bytes * 2)
        expect(masterKey).toMatch(/^[0-9a-f]{64}$/i);
        expect(masterKey.length).toBe(64);
        
        // Should be able to create a new encryption service with this key
        expect(() => {
          new EncryptionService(masterKey);
        }).not.toThrow();
        
        // Multiple generations should produce different keys
        const masterKey2 = EncryptionService.generateMasterKey();
        expect(masterKey2).not.toBe(masterKey);
        expect(masterKey2).toMatch(/^[0-9a-f]{64}$/i);
      }
    ), { numRuns: 20 });
  });

  // Property: Encryption failure handling
  // *For any* invalid decryption input, the system should fail gracefully with clear errors
  it('should handle invalid decryption inputs gracefully', async () => {
    await fc.assert(fc.property(
      fc.record({
        encryptedData: fc.oneof(
          fc.constant(''), // Empty string
          fc.constant('invalid'), // Invalid hex
          fc.string({ minLength: 1, maxLength: 10 }).filter(s => !/^[0-9a-f]*$/i.test(s)) // Non-hex
        ),
        iv: fc.oneof(
          fc.constant(''),
          fc.constant('invalid'),
          fc.hexaString({ minLength: 1, maxLength: 10 }) // Wrong length
        ),
        authTag: fc.oneof(
          fc.constant(''),
          fc.constant('invalid'),
          fc.hexaString({ minLength: 1, maxLength: 10 }) // Wrong length
        )
      }),
      (invalidInput) => {
        // Should throw an error for invalid input
        expect(() => {
          encryptionService.decrypt(invalidInput);
        }).toThrow();
        
        // Error should be descriptive
        try {
          encryptionService.decrypt(invalidInput);
          expect.fail('Should have thrown an error');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain('Decryption failed');
        }
      }
    ), { numRuns: 30 });
  });
});