import { z } from 'zod';
import { displayNameSchema } from './auth.js';

export const updateProfileInput = z.object({
  displayName: displayNameSchema.optional(),
  bio: z.string().trim().max(1000).optional(),
  school: z.string().trim().max(120).nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileInput>;

export const updateSettingsInput = z.object({
  emailOnMessage: z.boolean().optional(),
  emailOnBooking: z.boolean().optional(),
  showSchool: z.boolean().optional(),
  analyticsOptOut: z.boolean().optional(),
});
export type UpdateSettingsInput = z.infer<typeof updateSettingsInput>;

// what anyone can see about a user
export interface PublicProfile {
  id: string;
  displayName: string;
  bio: string;
  school: string | null;
  avatarUrl: string | null;
  memberSince: string;
  // e.g. ["northeastern.edu"]: they proved they can read mail there, nothing more
  verifiedDomains: string[];
}

export interface MyProfile extends PublicProfile {
  email: string;
  emailVerified: boolean;
  role: 'student' | 'admin';
  settings: {
    emailOnMessage: boolean;
    emailOnBooking: boolean;
    showSchool: boolean;
    analyticsOptOut: boolean;
  };
}
