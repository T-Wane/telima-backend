import { ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { ASSIGNABLE_PERMISSIONS } from '../../../common/permissions';

export class CreateStaffDto {
  @IsString()
  @MinLength(2)
  firstName: string;

  @IsString()
  @MinLength(2)
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/, { message: 'Numero de telephone invalide' })
  phone: string;

  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caracteres' })
  password: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Choisissez au moins un acces' })
  @ArrayUnique()
  @IsIn(ASSIGNABLE_PERMISSIONS, { each: true })
  permissions: string[];
}

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/, { message: 'Numero de telephone invalide' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caracteres' })
  password?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Choisissez au moins un acces' })
  @ArrayUnique()
  @IsIn(ASSIGNABLE_PERMISSIONS, { each: true })
  permissions?: string[];
}
