import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

export const hashPassword = (plain) => bcrypt.hash(plain, 12);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 48) => crypto.randomBytes(bytes).toString('base64url');

// compared against when the e-mail is unknown so response time doesn't reveal which accounts exist
export const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);
