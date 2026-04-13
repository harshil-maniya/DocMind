import { IsEmail, IsString, MinLength, IsOptional, IsEnum } from 'class-validator';
import { TenantPlan, UserRole } from '@docmind/common';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(2)
  tenantName: string;

  @IsOptional()
  @IsEnum(TenantPlan)
  plan?: TenantPlan;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
