export enum UserRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
}

export enum TenantPlan {
  FREE = 'free',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

export interface ITenant {
  id: string;
  name: string;
  plan: TenantPlan;
  createdAt: Date;
}

export interface IUser {
  id: string;
  email: string;
  role: UserRole;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRequestUser {
  sub: string;
  email: string;
  role: UserRole;
  tenantId: string;
}
