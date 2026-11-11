import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: 'enter a valid email' }));

export const passwordSchema = z
  .string()
  .min(10, 'at least 10 characters')
  .max(128, 'that is a very long password, 128 characters max');

export const displayNameSchema = z.string().trim().min(1, 'required').max(60);

export const signUpInput = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
});
export type SignUpInput = z.infer<typeof signUpInput>;

export const signInInput = z.object({
  email: emailSchema,
  password: z.string().min(1, 'required').max(128),
});
export type SignInInput = z.infer<typeof signInInput>;

export const tokenInput = z.object({ token: z.string().min(20).max(200) });

export const forgotPasswordInput = z.object({ email: emailSchema });

export const resetPasswordInput = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const universityEmailInput = z.object({ email: emailSchema });

export const deleteAccountInput = z.object({
  password: z.string().min(1).max(128),
  confirm: z.literal('delete my account'),
});

export type Role = 'student' | 'admin';

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  emailVerified: boolean;
  displayName: string;
  universityDomains: string[];
}
