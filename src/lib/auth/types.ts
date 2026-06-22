export interface JWTPayload {
  userId: string;
  organizationId: string;
  role: 'admin' | 'member';
}

export interface AuthenticatedUser extends JWTPayload {
  email: string;
  name: string;
}
